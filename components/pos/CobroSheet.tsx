import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export type CobroMetodo = 'efectivo' | 'datafono' | 'bizum' | 'mixto';

interface CobroSheetCitaProps {
  mode: 'cita';
  // Una cita (ficha de cita) o varias (cobro multiple desde Caja).
  citaIds: string[];
  // Pendiente ya neto de señal (lo calcula el caller, igual para 1 o N citas).
  pendienteCents: number;
  // Señal ya pagada (informativa); si es 0 no se muestra la linea.
  senalCents?: number;
  titulo?: string;
  subtitulo?: string;
  // Color de la categoria del servicio cobrado (punto junto al subtitulo). Opcional.
  subtituloColor?: string;
  onClose: () => void;
  onSuccess: (cobroIds: string[]) => void;
}

interface CobroSheetWalkinProps {
  mode: 'walkin';
  // Cobro sin cita (venta suelta): lineas libres, sin catalogo de producto
  // (disciplina "sin inventario todavia" del dossier).
  onClose: () => void;
  onSuccess: (cobroIds: string[]) => void;
}

interface CobroSheetPresupuestoProps {
  mode: 'presupuesto';
  // Cobro de un presupuesto aceptado: las lineas salen del propio presupuesto
  // (RPC crear_cobro_desde_presupuesto). pendienteCents = total del presupuesto.
  presupuestoId: string;
  pendienteCents: number;
  titulo?: string;
  subtitulo?: string;
  subtituloColor?: string;
  onClose: () => void;
  onSuccess: (cobroIds: string[]) => void;
}

type CobroSheetProps = CobroSheetCitaProps | CobroSheetWalkinProps | CobroSheetPresupuestoProps;

const METODOS: Array<[CobroMetodo, string]> = [
  ['efectivo', 'Efectivo'],
  ['datafono', 'Datáfono'],
  ['bizum', 'Bizum'],
];

interface LineaWalkin {
  nombre: string;
  precio: string;
  cantidad: string;
}

// Motor de cobro unico (POS-0/1/1.5): usado desde la ficha de cita, desde Caja
// (cobro de pendientes) y desde el cobro rapido/walk-in de Caja. El caso "cita"
// llama a `crear_cobro_desde_cita` (descuenta señal, valida negocio/estado); el
// caso "walkin" llama a `crear_cobro_walkin` (lineas libres, sin cita).
export function CobroSheet(props: CobroSheetProps) {
  const { onClose, onSuccess } = props;
  const isWalkin = props.mode === 'walkin';

  const [metodo, setMetodo] = useState<CobroMetodo>('efectivo');
  const [efectivoSplit, setEfectivoSplit] = useState(''); // parte en efectivo cuando metodo='mixto'
  const [descuento, setDescuento] = useState('');
  const [propina, setPropina] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [bonoDisponible, setBonoDisponible] = useState<any>(null);
  const [usarBono, setUsarBono] = useState(false);

  // --- Tarjeta Regalo ---
  const [trCodigo, setTrCodigo] = useState('');
  const [trBuscando, setTrBuscando] = useState(false);
  interface TarjetaRegaloInfo { id: string; saldo_actual_cents: number; codigo: string }
  const [trTarjeta, setTrTarjeta] = useState<TarjetaRegaloInfo | null>(null);
  const [trUsarSaldo, setTrUsarSaldo] = useState(false);

  const buscarTarjetaRegalo = async () => {
    if (!trCodigo.trim()) return;
    setTrBuscando(true);
    setError('');
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setError('No autorizado'); return; }
      const { data, error: dbErr } = await supabase
        .from('tarjetas_regalo')
        .select('id, saldo_actual_cents, codigo')
        .eq('negocio_id', profile.negocio_id)
        .eq('codigo', trCodigo.trim().toUpperCase())
        .single();
      if (dbErr || !data) { setError('Tarjeta no encontrada'); setTrTarjeta(null); return; }
      if ((data as TarjetaRegaloInfo).saldo_actual_cents <= 0) { setError('Tarjeta sin saldo'); setTrTarjeta(null); return; }
      setTrTarjeta(data as TarjetaRegaloInfo);
      setTrUsarSaldo(true);
    } catch {
      setError('Error al buscar tarjeta');
    } finally {
      setTrBuscando(false);
    }
  };

  // --- Cobro online por QR de mostrador (solo mode='cita', 1 cita): genera un enlace de
  // pago del total; el cliente escanea y paga (Bizum/tarjeta/Apple/Google Pay). El webhook
  // concilia el cobro en el libro. Ver iniciar_cobro_online / /app/pagar/[token]. ---
  const [qrEnlace, setQrEnlace] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const [qrCopiado, setQrCopiado] = useState(false);
  const qrSvg = useMemo(() => {
    if (!qrEnlace) return '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(qrEnlace);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch { return ''; }
  }, [qrEnlace]);

  // --- Solo walk-in: lineas libres + profesional opcional (comision) ---
  const [lineas, setLineas] = useState<LineaWalkin[]>([]);
  const [lineaNombre, setLineaNombre] = useState('');
  const [lineaPrecio, setLineaPrecio] = useState('');
  const [profesionalId, setProfesionalId] = useState('');
  const [profesionales, setProfesionales] = useState<Array<{ id: string; nombre: string }>>([]);

  useEffect(() => {
    if (!isWalkin) return;
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      const { data } = await supabase
        .from('profesionales')
        .select('id, nombre')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true)
        .order('nombre');
      setProfesionales(data ?? []);
    })();
  }, [isWalkin]);

  useEffect(() => {
    if (props.mode !== 'cita') return;
    if (props.citaIds.length !== 1) return;
    (async () => {
      try {
        const { data: cita } = await supabase.from('citas').select('cliente_id, servicio_id').eq('id', props.citaIds[0]).single();
        if (!cita?.cliente_id || !cita?.servicio_id) return;
        const { data: bonos } = await supabase.from('bonos')
          .select('*')
          .eq('cliente_id', cita.cliente_id)
          .eq('servicio_id', cita.servicio_id)
          .eq('estado', 'activo')
          .gt('sesiones_disponibles', 0)
          .order('created_at', { ascending: true })
          .limit(1);
        if (bonos && bonos.length > 0) {
          setBonoDisponible(bonos[0]);
        }
      } catch (err) {}
    })();
  }, [props.mode, 'citaIds' in props ? props.citaIds.join(',') : null]);

  const aEntero = (s: string) => Math.max(0, parseFloat((s || '0').replace(',', '.')) || 0);

  const agregarLinea = () => {
    const precio = aEntero(lineaPrecio);
    if (!lineaNombre.trim() || precio <= 0) return;
    setLineas((prev) => [...prev, { nombre: lineaNombre.trim(), precio: lineaPrecio, cantidad: '1' }]);
    setLineaNombre('');
    setLineaPrecio('');
  };
  const quitarLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx));
  const cambiarCantidad = (idx: number, cantidad: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad } : l)));
  };

  const lineasBaseCents = lineas.reduce(
    (s, l) => s + Math.round(aEntero(l.precio) * 100) * Math.max(1, parseInt(l.cantidad || '1', 10)),
    0
  );

  const pendienteCents = props.mode === 'walkin' ? lineasBaseCents : props.pendienteCents;
  const senalCents = props.mode === 'cita' ? (props.senalCents ?? 0) : 0;
  const descuentoCents = Math.round(aEntero(descuento) * 100);
  const propinaCents = Math.round(aEntero(propina) * 100);
  // Saldo de tarjeta regalo aplicable al cobro (no puede exceder el neto antes de propina)
  const netoCents = Math.max(0, pendienteCents - descuentoCents);
  const trAplicadoCents = trUsarSaldo && trTarjeta
    ? Math.min(trTarjeta.saldo_actual_cents, netoCents)
    : 0;
  const totalCents = usarBono ? propinaCents : (netoCents - trAplicadoCents) + propinaCents;
  // Split efectivo+datafono (solo cobro de 1 cita). El datafono es el resto: siempre cuadra.
  const puedeMixto = props.mode === 'cita' && props.citaIds.length === 1;
  const efectivoSplitCents = Math.min(Math.max(0, Math.round(aEntero(efectivoSplit) * 100)), totalCents);
  const datafonoSplitCents = Math.max(0, totalCents - efectivoSplitCents);

  // Tras completar un cobro, si se uso tarjeta regalo, descontar saldo y registrar movimiento.
  const aplicarTarjetaRegalo = async (cobroId: string) => {
    if (!trUsarSaldo || !trTarjeta || trAplicadoCents <= 0) return;
    // 1. Reducir saldo de la tarjeta
    await supabase
      .from('tarjetas_regalo')
      .update({ saldo_actual_cents: trTarjeta.saldo_actual_cents - trAplicadoCents })
      .eq('id', trTarjeta.id);
    // 2. Registrar movimiento (negativo = consumo)
    await supabase
      .from('tarjetas_regalo_movimientos')
      .insert({
        tarjeta_id: trTarjeta.id,
        cobro_id: cobroId,
        importe_cents: -trAplicadoCents,
      });
  };

  const confirmar = async () => {
    if (isWalkin && lineas.length === 0) { setError('Añade al menos una línea.'); return; }
    if (totalCents <= 0 && !usarBono && trAplicadoCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
    setError('');
    setEnviando(true);
    try {
      if (props.mode === 'walkin') {
        const lineasPayload = lineas.map((l) => ({
          nombre: l.nombre,
          precio_cents: Math.round(aEntero(l.precio) * 100),
          cantidad: Math.max(1, parseInt(l.cantidad || '1', 10)),
        }));
        const { data, error: rpcErr } = await supabase.rpc('crear_cobro_walkin', {
          p_lineas: lineasPayload,
          p_metodo: metodo,
          p_propina_cents: propinaCents,
          p_descuento_cents: descuentoCents,
          p_profesional_id: profesionalId || null,
        });
        if (rpcErr) throw rpcErr;
        const cobroId = data as string;
        await aplicarTarjetaRegalo(cobroId);
        onSuccess([cobroId]);
      } else if (props.mode === 'presupuesto') {
        const { data, error: rpcErr } = await supabase.rpc('crear_cobro_desde_presupuesto', {
          p_presupuesto_id: props.presupuestoId,
          p_metodo: metodo,
          p_propina_cents: propinaCents,
          p_descuento_cents: descuentoCents,
        });
        if (rpcErr) throw rpcErr;
        const cobroId = data as string;
        await aplicarTarjetaRegalo(cobroId);
        onSuccess([cobroId]);
      } else {
        if (usarBono && bonoDisponible && props.citaIds.length === 1) {
          const { data, error: rpcErr } = await supabase.rpc('consumir_bono_cita', {
            p_cita_id: props.citaIds[0],
            p_bono_id: bonoDisponible.id,
            p_propina_cents: propinaCents
          });
          if (rpcErr) throw rpcErr;
          onSuccess([data as string]);
        } else {
          const resultados = await Promise.all(
            props.citaIds.map((id) =>
              supabase.rpc('crear_cobro_desde_cita', {
                p_cita_id: id,
                p_metodo: metodo,
                p_propina_cents: propinaCents,
                p_descuento_cents: descuentoCents,
                ...(metodo === 'mixto'
                  ? { p_efectivo_cents: efectivoSplitCents, p_datafono_cents: datafonoSplitCents }
                  : {}),
              })
            )
          );
          const fallidos = resultados.filter((r) => r.error);
          if (fallidos.length > 0) {
            throw fallidos.length === props.citaIds.length
              ? fallidos[0].error
              : new Error(`${fallidos.length} de ${props.citaIds.length} cobros fallaron.`);
          }
          const cobroIds = resultados.map((r) => r.data as string);
          // Aplicar tarjeta regalo al primer cobro (si hay multiples citas)
          if (cobroIds.length > 0) await aplicarTarjetaRegalo(cobroIds[0]);
          onSuccess(cobroIds);
        }
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el cobro.'));
    } finally {
      setEnviando(false);
    }
  };

  const generarQr = async () => {
    if (props.mode !== 'cita' || props.citaIds.length !== 1) return;
    if (totalCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
    setError('');
    setQrBusy(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('iniciar_cobro_online', {
        p_cita_id: props.citaIds[0],
        p_metodo: 'online',
        p_propina_cents: propinaCents,
        p_descuento_cents: descuentoCents,
      });
      if (rpcErr) throw rpcErr;
      const token = (data as { token?: string })?.token;
      if (!token) throw new Error('No se pudo generar el enlace de pago.');
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.mechaa.es';
      const appBase = typeof window !== 'undefined' && window.location.pathname.startsWith('/app') ? '/app' : '';
      setQrEnlace(`${origin}${appBase}/pagar/${token}`);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo generar el QR de cobro.'));
    } finally {
      setQrBusy(false);
    }
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(qrEnlace);
      setQrCopiado(true);
      setTimeout(() => setQrCopiado(false), 1800);
    } catch { /* clipboard no disponible */ }
  };

  const titulo = props.mode === 'cita'
    ? (props.titulo || `Cobrar ${props.citaIds.length} cita${props.citaIds.length > 1 ? 's' : ''}`)
    : props.mode === 'presupuesto'
      ? (props.titulo || 'Cobrar presupuesto')
      : 'Cobro rápido';
  const subtitulo = props.mode === 'walkin'
    ? 'Venta sin cita (producto, servicio puntual, propina suelta)'
    : props.subtitulo;
  const subtituloColor = props.mode === 'walkin' ? undefined : props.subtituloColor;

  return (
    <div
      onClick={() => { if (!enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.bgPanel, border: `1px solid ${T.borderHi}`, borderRadius: 16, padding: 22, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(40,30,24,0.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text }}>{titulo}</h4>
          <span style={{ fontSize: 10, color: T.textTer, fontWeight: 600 }}>Comprobante · no es factura</span>
        </div>
        {subtitulo && (
          <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            {subtituloColor && <span style={{ width: 7, height: 7, borderRadius: 99, background: subtituloColor, flexShrink: 0 }} />}
            {subtitulo}
          </div>
        )}

        {isWalkin && (
          <div style={{ marginBottom: 14, marginTop: subtitulo ? 0 : 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Líneas</div>
            {lineas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {lineas.map((l, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 8px' }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: T.text }}>{l.nombre}</span>
                    <input
                      type="text" inputMode="numeric" value={l.cantidad}
                      onChange={(e) => cambiarCantidad(idx, e.target.value)}
                      style={{ width: 32, padding: '4px 2px', textAlign: 'center', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12 }}
                    />
                    <span style={{ fontSize: 12.5, color: T.textSec, minWidth: 56, textAlign: 'right' }}>{aEntero(l.precio).toFixed(2)} €</span>
                    <button onClick={() => quitarLinea(idx)} aria-label="Quitar línea" style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text" value={lineaNombre} onChange={(e) => setLineaNombre(e.target.value)} placeholder="Nombre (ej. Champú)"
                style={{ flex: 1, padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
              />
              <input
                type="text" inputMode="decimal" value={lineaPrecio} onChange={(e) => setLineaPrecio(e.target.value)} placeholder="€"
                style={{ width: 70, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
              />
              <button onClick={agregarLinea} style={{ padding: '8px 14px', background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>


            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Profesional (opcional)</div>
            <select
              value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
            >
              <option value="">Sin profesional asignado</option>
              {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, marginTop: isWalkin ? 16 : (subtitulo ? 0 : 14) }}>
          {bonoDisponible && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: usarBono ? T.successSoft : T.bgCard, border: `1px solid ${usarBono ? T.success : T.primarySoft}`, borderRadius: 8, cursor: 'pointer' }} onClick={() => setUsarBono(!usarBono)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={usarBono} readOnly style={{ cursor: 'pointer' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: usarBono ? T.success : T.text }}>Usar Bono Disponible</span>
                  <span style={{ fontSize: 11, color: usarBono ? T.success : T.textSec }}>Quedan {bonoDisponible.sesiones_disponibles} sesiones</span>
                </div>
              </div>
            </div>
          )}
          {/* Tarjeta regalo */}
          {!usarBono && (
            <div style={{ padding: '10px 12px', background: trTarjeta && trUsarSaldo ? '#fef3c720' : T.bgCard, border: `1px solid ${trTarjeta && trUsarSaldo ? '#ca8a04' : T.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Tarjeta Regalo</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={trCodigo} onChange={e => setTrCodigo(e.target.value.toUpperCase())}
                  placeholder="TR-XXXX-XXXX"
                  style={{ flex: 1, padding: '7px 10px', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter') buscarTarjetaRegalo(); }}
                />
                <button onClick={buscarTarjetaRegalo} disabled={trBuscando || !trCodigo.trim()} style={{ padding: '0 14px', background: T.primary, color: '#fff', border: 'none', borderRadius: 7, cursor: trBuscando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                  {trBuscando ? '...' : 'Buscar'}
                </button>
              </div>
              {trTarjeta && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setTrUsarSaldo(!trUsarSaldo)}>
                    <input type="checkbox" checked={trUsarSaldo} readOnly style={{ cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: trUsarSaldo ? '#ca8a04' : T.textSec, fontWeight: 600 }}>
                      Aplicar saldo: {(trTarjeta.saldo_actual_cents / 100).toFixed(2)} €
                    </span>
                  </div>
                  {trUsarSaldo && trAplicadoCents > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#ca8a04' }}>-{(trAplicadoCents / 100).toFixed(2)} €</span>
                  )}
                </div>
              )}
            </div>
          )}
          {!usarBono && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: T.textSec }}>Pendiente</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{(pendienteCents / 100).toFixed(2)} €</span>
              </div>
              {senalCents > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: T.success }}>Señal ya pagada</span>
                  <span style={{ fontSize: 12.5, color: T.success }}>incluida (no se vuelve a cobrar)</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <label style={{ fontSize: 12.5, color: T.textSec }}>Descuento (€)</label>
                <input type="text" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" style={{ width: 92, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
            <label style={{ fontSize: 12.5, color: T.primary }}>Propina (€) — No fiscal</label>
            <input type="text" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" style={{ width: 92, padding: '8px 10px', textAlign: 'right', background: T.primarySoft, border: `1px solid ${T.primary}`, borderRadius: 8, color: T.primary, fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}`, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Total a cobrar</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.success }}>{(totalCents / 100).toFixed(2)} €</div>
            {propinaCents > 0 && !usarBono && <div style={{ fontSize: 11, color: T.textTer }}>Incluye {(propinaCents / 100).toFixed(2)}€ de propina</div>}
          </div>
        </div>

        {qrEnlace ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 12 }}>
              El cliente escanea y paga {(totalCents / 100).toFixed(2)} € con Bizum, tarjeta o Apple/Google&nbsp;Pay.
            </div>
            <div
              style={{ width: 200, height: 200, margin: '0 auto 12px', background: '#fff', borderRadius: 12, border: `1px solid ${T.border}`, padding: 10, boxSizing: 'border-box' }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div style={{ fontSize: 11.5, color: T.textTer, marginBottom: 14 }}>
              El cobro se registra automáticamente cuando el cliente paga.
            </div>
            {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={copiarEnlace} style={{ padding: '9px 18px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{qrCopiado ? 'Enlace copiado ✓' : 'Copiar enlace'}</button>
              <button onClick={onClose} style={{ padding: '9px 20px', background: T.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Hecho</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Método</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {METODOS.map(([k, lbl]) => {
                const on = metodo === k;
                return (
                  <button key={k} onClick={() => setMetodo(k)} style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? T.successSoft : T.bgCard, border: `1px solid ${on ? T.success : T.border}`, color: on ? T.success : T.textSec }}>{lbl}</button>
                );
              })}
              {puedeMixto && (
                <button key="mixto" onClick={() => setMetodo('mixto')} style={{ flex: 1, minWidth: 80, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: metodo === 'mixto' ? T.successSoft : T.bgCard, border: `1px solid ${metodo === 'mixto' ? T.success : T.border}`, color: metodo === 'mixto' ? T.success : T.textSec }}>Dividir</button>
              )}
            </div>

            {metodo === 'mixto' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Reparte los {(totalCents / 100).toFixed(2)} € entre efectivo y datáfono:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ flex: 1, fontSize: 11.5, color: T.textTer }}>Efectivo (€)
                    <input value={efectivoSplit} inputMode="decimal"
                      onChange={(e) => setEfectivoSplit(e.target.value.replace(/[^0-9.,]/g, ''))}
                      style={{ width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '9px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, color: T.text }} />
                  </label>
                  <div style={{ flex: 1, fontSize: 11.5, color: T.textTer }}>Datáfono (€)
                    <div style={{ marginTop: 4, padding: '9px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, fontSize: 13, fontWeight: 700, color: T.text }}>{(datafonoSplitCents / 100).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={enviando} style={{ padding: '9px 18px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmar} disabled={enviando} style={{ padding: '9px 20px', background: enviando ? T.textTer : 'linear-gradient(180deg,T.success,#15803d)', color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: enviando ? 0.7 : 1 }}>
                {enviando ? 'Cobrando…' : 'Confirmar cobro'}
              </button>
            </div>

            {props.mode === 'cita' && props.citaIds.length === 1 && (
              <button onClick={generarQr} disabled={qrBusy || enviando} style={{ width: '100%', marginTop: 10, padding: '11px 0', background: T.bgCard, border: `1px dashed ${T.borderHi}`, color: T.primary, borderRadius: 10, cursor: qrBusy ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 700, opacity: qrBusy ? 0.7 : 1 }}>
                {qrBusy ? 'Generando QR…' : 'Cobrar con QR (Bizum · tarjeta · Apple/Google Pay)'}
              </button>
            )}

            <p style={{ fontSize: 11, color: T.textTer, marginTop: 12, margin: '12px 0 0', textAlign: 'center' }}>
              {metodo === 'datafono' ? 'El cliente pagará con tarjeta en el datáfono físico.' : metodo === 'bizum' ? 'El cliente pagará por Bizum.' : metodo === 'mixto' ? 'Parte en efectivo y parte con tarjeta en el datáfono.' : 'El cliente pagará en efectivo.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
