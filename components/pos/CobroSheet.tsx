import { useEffect, useMemo, useState, useRef } from 'react';
import qrcode from 'qrcode-generator';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { identidadActiva } from '@/lib/identidadActiva';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useLectorCodigoBarras } from '@/lib/hooks/useLectorCodigoBarras';

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
  // Render embebido (sin overlay), p.ej. en la pestaña Pagos de la ficha de cita.
  inline?: boolean;
  // Lineas precargadas (productos elegidos en la pestaña Productos de la cita).
  lineasIniciales?: Array<{
    nombre: string;
    precio: string;
    cantidad: string;
    ref_id?: string;
  }>;
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
  // Producto del catalogo al que corresponde la linea, si lo hay. Ya se venia
  // rellenando al elegir del selector; faltaba declararlo.
  ref_id?: string;
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
  // El descuento puede ser importe fijo (€) o porcentaje sobre lo pendiente.
  const [descuentoTipo, setDescuentoTipo] = useState<'eur' | 'pct'>('eur');
  const [propina, setPropina] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cobroCompletado, setCobroCompletado] = useState(false);
  const [ultimoCobroIds, setUltimoCobroIds] = useState<string[]>([]);
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
  const [lineas, setLineas] = useState<LineaWalkin[]>(
    () => ((props as any).lineasIniciales as LineaWalkin[] | undefined) ?? [],
  );
  const [lineaNombre, setLineaNombre] = useState('');
  const [lineaPrecio, setLineaPrecio] = useState('');
  const [profesionalId, setProfesionalId] = useState('');
  const [profesionales, setProfesionales] = useState<Array<{ id: string; nombre: string }>>([]);
  // Cliente en la venta suelta: opcional, pero sin el la venta queda anonima y
  // no hay forma de saber quien compro que (ni de contarlo en su ficha ni en el
  // registro de productos vendidos). El RPC ya aceptaba p_cliente_id; era el
  // formulario el que nunca lo mandaba.
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState<Array<{ id: string; nombre: string }>>([]);

  const [productos, setProductos] = useState<Array<{ id: string; nombre: string; categoria: string; precio: number; codigo_barras?: string | null }>>([]);
  const [productoPickerOpen, setProductoPickerOpen] = useState(false);
  const [categoriaProductoFiltro, setCategoriaProductoFiltro] = useState<string>('todas');

  useEffect(() => {
    if (props.mode !== 'walkin' && props.mode !== 'cita') return;
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
      // Salon con un solo correo: el cobro se apunta por defecto a quien esta
      // atendiendo (la persona identificada en el dispositivo), no al jefe.
      // Se puede cambiar a mano en el desplegable, como siempre.
      const identidad = identidadActiva(profile.negocio_id);
      if (identidad?.profesionalId && (data ?? []).some((p) => p.id === identidad.profesionalId)) {
        setProfesionalId((prev) => prev || identidad.profesionalId!);
      }
      // Solo hace falta en la venta suelta: en el cobro de una cita el cliente
      // ya viene dado por la propia cita.
      if (props.mode === 'walkin') {
        const { data: clis } = await supabase
          .from('clientes')
          .select('id, nombre')
          .eq('negocio_id', profile.negocio_id)
          .order('nombre')
          .limit(500);
        setClientes(clis ?? []);
      }
      const { data: prods } = await supabase
        .from('productos')
        .select('id, nombre, categoria, precio_cents, codigo_barras')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true)
        .order('nombre');
      setProductos(
        (prods ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria || 'general',
          precio: p.precio_cents / 100,
          codigo_barras: p.codigo_barras ?? null,
        })),
      );
    })();
  }, [props.mode]);

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

  const [lineaProductoId, setLineaProductoId] = useState('');

  // Categorías reales presentes en el catálogo del negocio (para las píldoras del picker).
  const categoriasProductos = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria))).sort((a, b) => a.localeCompare(b)),
    [productos],
  );

  // Filtra por categoría elegida + texto ya escrito en el campo de nombre (misma caja sirve de búsqueda).
  const productosFiltrados = useMemo(() => {
    const q = lineaNombre.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (categoriaProductoFiltro === 'todas' || p.categoria === categoriaProductoFiltro) &&
        (!q || p.nombre.toLowerCase().includes(q)),
    );
  }, [productos, lineaNombre, categoriaProductoFiltro]);

  const elegirProducto = (p: { id: string; nombre: string; precio: number }) => {
    setLineaNombre(p.nombre);
    setLineaPrecio(p.precio.toString());
    setLineaProductoId(p.id);
    setProductoPickerOpen(false);
  };

  const agregarLinea = () => {
    const precio = aEntero(lineaPrecio);
    if (!lineaNombre.trim() || precio <= 0) return;
    setLineas((prev) => [...prev, { nombre: lineaNombre.trim(), precio: lineaPrecio, cantidad: '1', ref_id: lineaProductoId || undefined }]);
    setLineaNombre('');
    setLineaPrecio('');
    setLineaProductoId('');
    setProductoPickerOpen(false);
  };
  // Escaner de mostrador: pasar el champu por el lector lo mete en el ticket.
  // El escaner se presenta como un teclado, asi que lo que distingue una lectura
  // de alguien escribiendo es la velocidad (ver lib/pos/lectorCodigoBarras.ts).
  const [avisoEscaner, setAvisoEscaner] = useState('');
  useLectorCodigoBarras({
    activo: props.mode === 'walkin' || props.mode === 'cita',
    onCodigo: (codigo) => {
      const prod = productos.find((p) => p.codigo_barras && p.codigo_barras === codigo);
      if (!prod) {
        setAvisoEscaner(`Ese código (${codigo}) no está en ningún producto.`);
        return;
      }
      setAvisoEscaner('');
      // Si ya estaba en el ticket, sube la cantidad en vez de repetir linea.
      setLineas((prev) => {
        const i = prev.findIndex((l) => l.ref_id === prod.id);
        if (i === -1) {
          return [...prev, { nombre: prod.nombre, precio: prod.precio.toString(), cantidad: '1', ref_id: prod.id }];
        }
        const copia = prev.slice();
        copia[i] = { ...copia[i], cantidad: String((parseInt(copia[i].cantidad, 10) || 1) + 1) };
        return copia;
      });
    },
    onLecturaMala: () => setAvisoEscaner('No se ha leído bien el código. Vuelve a pasarlo.'),
  });

  const quitarLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx));
  const cambiarCantidad = (idx: number, cantidad: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad } : l)));
  };

  const lineasBaseCents = lineas.reduce(
    (s, l) => s + Math.round(aEntero(l.precio) * 100) * Math.max(1, parseInt(l.cantidad || '1', 10)),
    0
  );

  const pendienteBaseCents = 'pendienteCents' in props ? props.pendienteCents : 0;
  const pendienteCents = pendienteBaseCents + lineasBaseCents;
  const senalCents = props.mode === 'cita' ? (props.senalCents ?? 0) : 0;
  // Base sobre la que se aplica el descuento: con bono la cita la cubre el bono,
  // asi que el % se calcula solo sobre los productos extra del ticket.
  const baseDescuentoCents = usarBono ? lineasBaseCents : pendienteCents;
  const descuentoCents =
    descuentoTipo === 'pct'
      ? Math.round((baseDescuentoCents * Math.min(100, aEntero(descuento))) / 100)
      : Math.round(aEntero(descuento) * 100);
  const propinaCents = Math.round(aEntero(propina) * 100);
  // Saldo de tarjeta regalo aplicable al cobro (no puede exceder el neto antes de propina)
  const netoCents = Math.max(0, pendienteCents - descuentoCents);
  const trAplicadoCents = trUsarSaldo && trTarjeta
    ? Math.min(trTarjeta.saldo_actual_cents, netoCents)
    : 0;
  // Con bono: la cita la cubre el bono (0 €), pero los productos extra del
  // ticket SI se cobran, menos el descuento aplicado, mas la propina.
  const totalCents = usarBono
    ? Math.max(0, lineasBaseCents - descuentoCents) + propinaCents
    : (netoCents - trAplicadoCents) + propinaCents;
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

  const enviandoRef = useRef(false);

  const confirmar = async () => {
    if (enviandoRef.current) return;
    if (isWalkin && lineas.length === 0) { setError('Añade al menos una línea.'); return; }
    if (totalCents <= 0 && !usarBono && trAplicadoCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
    setError('');
    enviandoRef.current = true;
    setEnviando(true);
    try {
      if (props.mode === 'walkin') {
        const lineasPayload = lineas.map((l) => ({
          nombre: l.nombre,
          precio_cents: Math.round(aEntero(l.precio) * 100),
          cantidad: Math.max(1, parseInt(l.cantidad || '1', 10)),
          ref_id: (l as any).ref_id
        }));
        const { data, error: rpcErr } = await supabase.rpc('crear_cobro_walkin', {
          p_lineas: lineasPayload,
          p_metodo: metodo,
          p_propina_cents: propinaCents,
          p_descuento_cents: descuentoCents,
          p_profesional_id: profesionalId || null,
          p_cliente_id: clienteId || null,
        });
        if (rpcErr) throw rpcErr;
        const cobroId = data as string;
        await aplicarTarjetaRegalo(cobroId);
        setUltimoCobroIds([cobroId]);
        setCobroCompletado(true);
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
        setUltimoCobroIds([cobroId]);
        setCobroCompletado(true);
      } else {
        if (usarBono && bonoDisponible && props.citaIds.length === 1) {
          // Productos extra del ticket: el bono cubre la cita, pero los
          // productos (y su descuento) se cobran a parte dentro del mismo cobro.
          const lineasExtraBono = lineas.map((l) => ({
            nombre: l.nombre,
            precio_cents: Math.round(aEntero(l.precio) * 100),
            cantidad: Math.max(1, parseInt(l.cantidad || '1', 10)),
            ref_id: (l as any).ref_id,
          }));
          const { data, error: rpcErr } = await supabase.rpc('consumir_bono_cita', {
            p_cita_id: props.citaIds[0],
            p_bono_id: bonoDisponible.id,
            p_propina_cents: propinaCents,
            p_lineas_extra: lineasExtraBono,
            p_descuento_cents: descuentoCents,
            p_metodo: metodo === 'mixto' ? 'efectivo' : metodo,
          });
          if (rpcErr) throw rpcErr;
          setUltimoCobroIds([data as string]);
          setCobroCompletado(true);
        } else {
          // Productos extra del ticket: se adjuntan al PRIMER cobro del lote
          // para no duplicarlos en cada cita. Antes solo se enviaban con 1 cita
          // (p_lineas_extra = [] en multi-cita), lo que hacía imposible cobrar
          // "varias citas + productos" en un solo ticket desde Caja.
          const lineasExtra = lineas.map((l) => ({
            nombre: l.nombre,
            precio_cents: Math.round(aEntero(l.precio) * 100),
            cantidad: Math.max(1, parseInt(l.cantidad || '1', 10)),
            ref_id: (l as any).ref_id,
            tipo: 'producto',
          }));
          const resultados = await Promise.all(
            props.citaIds.map((id, idx) =>
              supabase.rpc('crear_cobro_desde_cita', {
                p_cita_id: id,
                p_metodo: metodo,
                p_propina_cents: propinaCents,
                p_descuento_cents: descuentoCents,
                p_lineas_extra: idx === 0 ? lineasExtra : [],
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
          setUltimoCobroIds(cobroIds);
          setCobroCompletado(true);
        }
      }
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo registrar el cobro.') + ` (Code: ${err?.code || 'N/A'})`);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const qrBusyRef = useRef(false);

  const generarQr = async () => {
    if (qrBusyRef.current) return;
    if (props.mode !== 'cita' || props.citaIds.length !== 1) return;
    if (totalCents <= 0) { setError('El total debe ser mayor que 0.'); return; }
    setError('');
    qrBusyRef.current = true;
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
      qrBusyRef.current = false;
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

  // ─────────────────────────────────────────────────────────────────────────────────
  // RENDER PANTALLA DE EXITO (Factura Generada)
  // ─────────────────────────────────────────────────────────────────────────────────
  if (cobroCompletado) {
    return (
      <div style={{ position: 'relative', flex: 1, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', textAlign: 'center', overflow: 'hidden' }}>
        <style>{`
          @keyframes checkPop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: T.successSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, animation: 'checkPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 12px' }}>Cobro efectuado correctamente</h2>
        <p style={{ fontSize: 15, color: T.textSec, maxWidth: 300, margin: '0 0 32px', lineHeight: 1.5 }}>
          Se ha generado y firmado el ticket electrónico inalterable asociado a esta operación.
        </p>
        <button
          onClick={() => {
            onSuccess(ultimoCobroIds);
          }}
          style={{ width: '100%', maxWidth: 300, padding: 14, background: T.primary, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}
        >
          Cerrar y continuar
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────────
  // RENDER FORMULARIO
  // ─────────────────────────────────────────────────────────────────────────────────
  const titulo = props.mode === 'cita'
    ? (props.titulo || `Cobrar ${props.citaIds.length} cita${props.citaIds.length > 1 ? 's' : ''}`)
    : props.mode === 'presupuesto'
      ? (props.titulo || 'Cobrar presupuesto')
      : 'Cobro rápido';
  const subtitulo = props.mode === 'walkin'
    ? 'Venta sin cita (producto, servicio puntual, propina suelta)'
    : props.subtitulo;
  const subtituloColor = props.mode === 'walkin' ? undefined : props.subtituloColor;

  const inline = (props as any).inline === true;
  const sheetBody = (
      <div
        onClick={(e) => e.stopPropagation()}
        // Zona del recorrido guiado: es la hoja de cobro (metodo, propina,
        // lineas y señal descontada). Se enseña abriendola en modo 'walkin',
        // que es el unico que se abre con un solo boton.
        data-demo="caja-cobrar"
        style={{ background: inline ? 'transparent' : T.bgPanel, border: inline ? 'none' : `1px solid ${T.borderHi}`, borderRadius: inline ? 0 : 16, padding: inline ? 0 : 22, width: '100%', maxWidth: inline ? '100%' : 420, maxHeight: inline ? 'none' : '90vh', overflowY: inline ? 'visible' : 'auto', boxShadow: inline ? 'none' : '0 24px 70px rgba(40,30,24,0.35)' }}
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

        {(isWalkin || props.mode === 'cita') && (
          <div style={{ marginBottom: 14, marginTop: subtitulo ? 0 : 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{isWalkin ? 'Líneas' : 'Añadir Extra/Producto'}</div>
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
              <div
                style={{ flex: 1, position: 'relative' }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setProductoPickerOpen(false);
                }}
              >
                <input
                  type="text" value={lineaNombre}
                  onFocus={() => setProductoPickerOpen(true)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLineaNombre(val);
                    setProductoPickerOpen(true);
                    const p = productos.find(x => x.nombre.toLowerCase() === val.toLowerCase());
                    if (p) {
                      setLineaProductoId(p.id);
                      setLineaPrecio(p.precio.toString());
                    } else {
                      setLineaProductoId('');
                    }
                  }}
                  placeholder="Nombre o busca producto..."
                  style={{ width: '100%', padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
                />
                {productoPickerOpen && productos.length > 0 && (
                  <div
                    style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 5,
                      background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 10,
                      boxShadow: '0 12px 28px rgba(40,30,24,0.18)', overflow: 'hidden',
                    }}
                  >
                    {categoriasProductos.length > 1 && (
                      <div style={{ display: 'flex', gap: 5, padding: '8px 8px 0', overflowX: 'auto' }}>
                        {['todas', ...categoriasProductos].map((cat) => {
                          const on = categoriaProductoFiltro === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setCategoriaProductoFiltro(cat)}
                              style={{
                                flexShrink: 0, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                background: on ? T.primarySoft : T.bgPanel, border: `1px solid ${on ? T.primary : T.border}`,
                                color: on ? T.primaryHi : T.textSec, textTransform: 'capitalize',
                              }}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ maxHeight: 200, overflowY: 'auto', padding: 6 }}>
                      {productosFiltrados.length === 0 ? (
                        <div style={{ padding: '8px 6px', fontSize: 12, color: T.textTer }}>Sin productos. Puedes escribir una línea libre.</div>
                      ) : (
                        productosFiltrados.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => elegirProducto(p)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                              padding: '7px 8px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = T.bgCardHi)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{ fontSize: 12.5, color: T.text }}>{p.nombre}</span>
                            <span style={{ fontSize: 12, color: T.textSec, flexShrink: 0 }}>{p.precio.toFixed(2)} €</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <input
                type="text" inputMode="decimal" value={lineaPrecio} onChange={(e) => setLineaPrecio(e.target.value)} placeholder="€"
                style={{ width: 70, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
              />
              <button onClick={agregarLinea} style={{ padding: '8px 14px', background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>

            {avisoEscaner && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: T.warningSoft, border: `1px solid ${T.warning}`, borderRadius: 8, fontSize: 12.5, color: T.text, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{avisoEscaner}</span>
                <button onClick={() => setAvisoEscaner('')} aria-label="Cerrar aviso" style={{ background: 'none', border: 'none', color: T.textSec, cursor: 'pointer', fontWeight: 700 }}>×</button>
              </div>
            )}

            {isWalkin && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Profesional (opcional)</div>
                <select
                  value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
                >
                  <option value="">Sin profesional asignado</option>
                  {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>

                <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 }}>Cliente (opcional)</div>
                <select
                  value={clienteId} onChange={(e) => setClienteId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
                >
                  <option value="">Sin cliente (venta anonima)</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <div style={{ fontSize: 11, color: T.textTer, marginTop: 6, lineHeight: 1.45 }}>
                  Si eliges cliente, la compra queda en su ficha y en el registro de productos vendidos.
                </div>
              </>
            )}
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
            </>
          )}
          {/* El descuento se muestra tambien con bono: aplica a los productos
              extra del ticket (la cita la cubre el bono). */}
          {(
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <label style={{ fontSize: 12.5, color: T.textSec }}>Descuento</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setDescuentoTipo(descuentoTipo === 'eur' ? 'pct' : 'eur')}
                    title={descuentoTipo === 'eur' ? 'Cambiar a porcentaje' : 'Cambiar a euros'}
                    style={{ padding: '8px 10px', background: descuentoTipo === 'pct' ? T.primarySoft : T.bgCard, border: `1px solid ${descuentoTipo === 'pct' ? T.primary : T.border}`, borderRadius: 8, color: descuentoTipo === 'pct' ? T.primaryHi : T.textSec, fontSize: 13, fontWeight: 700, cursor: 'pointer', minWidth: 34 }}
                  >
                    {descuentoTipo === 'eur' ? '€' : '%'}
                  </button>
                  <input type="text" inputMode="decimal" value={descuento} onChange={(e) => setDescuento(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" style={{ width: 72, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {descuentoCents > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: T.textTer }}>
                    −{(descuentoCents / 100).toFixed(2)} €{descuentoTipo === 'pct' ? ` (${descuento.replace(',', '.')}%)` : ''}
                    {usarBono ? ' sobre los productos' : ''}
                  </span>
                </div>
              )}
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
              <button onClick={confirmar} disabled={enviando}
                onMouseEnter={(e) => { if (!enviando) { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
                style={{ padding: '9px 20px', background: enviando ? T.textTer : `linear-gradient(180deg, ${T.success}, #15803d)`, color: '#fff', border: 'none', borderRadius: 8, cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, opacity: enviando ? 0.7 : 1, boxShadow: enviando ? 'none' : '0 6px 16px rgba(15,157,107,0.28)', transition: 'filter 0.16s ease, transform 0.16s ease', position: 'relative', overflow: 'hidden' }}>
                {enviando ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                    {/* No se "firma VeriFactu" nada: el cobro se registra y el
                        servidor emite un ticket con huella encadenada. Decir
                        VeriFactu aqui era prometer un alta en la AEAT que no
                        ocurre (regla 5 de CLAUDE.md: sin claims falsos). */}
                    Registrando el cobro...
                  </span>
                ) : 'Confirmar cobro'}
              </button>
            </div>

            {props.mode === 'cita' && props.citaIds.length === 1 && (
              <div style={{ marginTop: 14 }}>
                <button onClick={generarQr} disabled={qrBusy || enviando} 
                  style={{ width: '100%', padding: '12px 0', background: 'linear-gradient(to right, #004481, #005ce6)', border: 'none', color: '#fff', borderRadius: 10, cursor: qrBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: qrBusy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(0, 68, 129, 0.3)', transition: 'transform 0.15s ease' }}
                  onMouseEnter={(e) => { if (!qrBusy) e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  {/* Neutro a proposito: la pasarela real depende de lo que
                      tenga configurado el salon (Stripe por defecto, Redsys si
                      lo activa en Ajustes). Poner "Redsys" aqui era mentir a
                      todos los que van por Stripe. */}
                  {qrBusy ? 'Generando enlace seguro...' : 'Cobrar con enlace de pago (QR)'}
                </button>
                <div style={{ fontSize: 10, color: T.textTer, textAlign: 'center', marginTop: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Conexión cifrada a servidor de pagos
                </div>
              </div>
            )}

            <p style={{ fontSize: 11, color: T.textTer, marginTop: 12, margin: '12px 0 0', textAlign: 'center' }}>
              {metodo === 'datafono' ? 'El cliente pagará con tarjeta en el datáfono físico.' : metodo === 'bizum' ? 'El cliente pagará por Bizum.' : metodo === 'mixto' ? 'Parte en efectivo y parte con tarjeta en el datáfono.' : 'El cliente pagará en efectivo.'}
            </p>
          </>
        )}
      </div>
  );
  return inline ? (
    sheetBody
  ) : (
    <div
      onClick={() => { if (!enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}
    >
      {sheetBody}
    </div>
  );
}
