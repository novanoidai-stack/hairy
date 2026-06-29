import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export type CobroMetodo = 'efectivo' | 'datafono' | 'bizum';

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
  const [descuento, setDescuento] = useState('');
  const [propina, setPropina] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

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
  const totalCents = Math.max(0, pendienteCents - descuentoCents) + propinaCents;

  const confirmar = async () => {
    if (isWalkin && lineas.length === 0) { setError('Añade al menos una línea.'); return; }
    if (totalCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
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
        onSuccess([data as string]);
      } else if (props.mode === 'presupuesto') {
        const { data, error: rpcErr } = await supabase.rpc('crear_cobro_desde_presupuesto', {
          p_presupuesto_id: props.presupuestoId,
          p_metodo: metodo,
          p_propina_cents: propinaCents,
          p_descuento_cents: descuentoCents,
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
            })
          )
        );
        const fallidos = resultados.filter((r) => r.error);
        if (fallidos.length > 0) {
          throw fallidos.length === props.citaIds.length
            ? fallidos[0].error
            : new Error(`${fallidos.length} de ${props.citaIds.length} cobros fallaron.`);
        }
        onSuccess(resultados.map((r) => r.data as string));
      }
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo registrar el cobro.'));
    } finally {
      setEnviando(false);
    }
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ fontSize: 12.5, color: T.textSec }}>Propina (€)</label>
            <input type="text" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" style={{ width: 92, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${T.border}`, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Total a cobrar</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: T.success }}>{(totalCents / 100).toFixed(2)} €</span>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Método</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {METODOS.map(([k, lbl]) => {
            const on = metodo === k;
            return (
              <button key={k} onClick={() => setMetodo(k)} style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? T.successSoft : T.bgCard, border: `1px solid ${on ? T.success : T.border}`, color: on ? T.success : T.textSec }}>{lbl}</button>
            );
          })}
        </div>

        {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={enviando} style={{ padding: '9px 18px', background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
          <button onClick={confirmar} disabled={enviando} style={{ padding: '9px 20px', background: enviando ? T.textTer : 'linear-gradient(180deg,T.success,#15803d)', color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: enviando ? 0.7 : 1 }}>
            {enviando ? 'Cobrando…' : 'Confirmar cobro'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: T.textTer, marginTop: 12, margin: '12px 0 0', textAlign: 'center' }}>
          {metodo === 'datafono' ? 'El cliente pagará con tarjeta en el datáfono físico.' : metodo === 'bizum' ? 'El cliente pagará por Bizum.' : 'El cliente pagará en efectivo.'}
        </p>
      </div>
    </div>
  );
}
