import { useEffect, useMemo, useState, useRef } from 'react';
import qrcode from 'qrcode-generator';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { identidadActiva } from '@/lib/identidadActiva';
import { mensajeDeError } from '@/lib/errores';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useLectorCodigoBarras } from '@/lib/hooks/useLectorCodigoBarras';
import { SelectorCatalogo, type ItemCatalogo, type TipoCatalogo } from './SelectorCatalogo';

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
  // `tipo` es opcional por compatibilidad: quien no lo manda esta pasando
  // productos, que es lo unico que se podia adjuntar antes.
  lineasIniciales?: Array<{
    nombre: string;
    precio: string;
    cantidad: string;
    ref_id?: string;
    tipo?: TipoCatalogo;
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
  // Que es esta linea. Viaja hasta cobro_lineas.tipo, de donde Informes saca el
  // desglose de ingresos por servicio y el registro de productos vendidos. Antes
  // el servidor lo DEDUCIA ("trae ref_id => es producto"), que era cierto solo
  // mientras el selector cargaba unicamente productos.
  tipo: TipoCatalogo;
}

// Etiqueta corta por tipo para la fila del ticket. 'suplemento' es como se
// llama un add-on en cobro_lineas; al usuario se le dice "Extra".
const ETIQUETA_TIPO: Record<TipoCatalogo, string> = {
  servicio: 'Servicio',
  producto: 'Producto',
  suplemento: 'Extra',
};

// Detalle de cada cita del ticket: hace falta para poder corregir el importe
// LINEA A LINEA cuando se cobran varias a la vez (antes solo se podia con una).
interface CitaCobrable {
  id: string;
  nombre: string;
  // Precio de catalogo del servicio, BRUTO de señal (es lo que espera el RPC
  // en p_base_cents: la señal la descuenta el mismo).
  precioCents: number;
  senalCents: number;
}

// Una relacion de Supabase llega como objeto o como array segun la cardinalidad
// que infiera PostgREST. Se normaliza en un sitio en vez de en cada uso.
const relacionUnica = <X,>(v: X | X[] | null | undefined): X | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const SENAL_PAGADA = ['completado', 'pagado', 'succeeded', 'paid'];

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

  // --- Lineas libres del ticket + profesional opcional (comision) ---
  const [lineas, setLineas] = useState<LineaWalkin[]>(() => {
    const iniciales = (props as { lineasIniciales?: CobroSheetCitaProps['lineasIniciales'] }).lineasIniciales ?? [];
    return iniciales.map((l) => ({
      ...l,
      // Sin tipo declarado se mantiene la regla vieja: con ref_id era producto.
      tipo: l.tipo ?? (l.ref_id ? 'producto' : 'servicio'),
    }));
  });
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

  // Los productos siguen aparte del catalogo unificado porque el lector de
  // codigo de barras necesita `codigo_barras`, que solo tienen ellos.
  const [productos, setProductos] = useState<Array<{ id: string; nombre: string; categoria: string; precio: number; codigo_barras?: string | null }>>([]);
  // Catalogo del selector: productos + servicios + extras en una sola lista.
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [catalogoCargando, setCatalogoCargando] = useState(true);
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  useEffect(() => {
    if (props.mode !== 'walkin' && props.mode !== 'cita') return;
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setCatalogoCargando(false); return; }
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
      // Las tres patas del catalogo, en paralelo. Los add-ons se piden TODOS los
      // del salon (no los de un servicio concreto): aqui se venden sueltos, asi
      // que el cargador por servicio del contrato 1 no aplica a esta consulta.
      const [prodsRes, srvsRes, addsRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, nombre, categoria, precio_cents, codigo_barras')
          .eq('negocio_id', profile.negocio_id)
          .eq('activo', true)
          .order('nombre'),
        supabase
          .from('servicios')
          .select('id, nombre, categoria, precio, duracion_activa_min')
          .eq('negocio_id', profile.negocio_id)
          .eq('activo', true)
          .order('nombre'),
        supabase
          .from('service_addons')
          .select('id, nombre, precio')
          .eq('negocio_id', profile.negocio_id)
          .eq('activo', true)
          .order('nombre'),
      ]);
      // Sin catalogo se sigue pudiendo cobrar a mano, pero hay que decirlo: un
      // selector vacio en silencio parece "este salon no tiene servicios".
      const fallo = prodsRes.error ?? srvsRes.error ?? addsRes.error;
      if (fallo) setError(mensajeDeError(fallo, 'No se ha podido cargar el catálogo.'));

      const prods = prodsRes.data ?? [];
      setProductos(
        prods.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria || 'general',
          precio: p.precio_cents / 100,
          codigo_barras: p.codigo_barras ?? null,
        })),
      );
      setCatalogo([
        ...(srvsRes.data ?? []).map((s): ItemCatalogo => ({
          id: s.id,
          tipo: 'servicio',
          nombre: s.nombre,
          categoria: s.categoria || 'general',
          precioCents: Math.round(Number(s.precio ?? 0) * 100),
          duracionMin: s.duracion_activa_min ?? undefined,
        })),
        ...prods.map((p): ItemCatalogo => ({
          id: p.id,
          tipo: 'producto',
          nombre: p.nombre,
          categoria: p.categoria || 'general',
          precioCents: p.precio_cents,
        })),
        ...(addsRes.data ?? []).map((a): ItemCatalogo => ({
          id: a.id,
          tipo: 'suplemento',
          nombre: a.nombre,
          categoria: 'extras',
          precioCents: Math.round(Number(a.precio ?? 0) * 100),
        })),
      ]);
      setCatalogoCargando(false);
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

  // --- Desglose por cita: quien cobra ve UNA fila por servicio, con su precio,
  // y puede corregir cada una. Antes se cobraban N citas contra un unico numero
  // agregado y por eso la correccion estaba capada a citaIds.length === 1. ---
  const [citasDetalle, setCitasDetalle] = useState<CitaCobrable[]>([]);
  const [detalleFallo, setDetalleFallo] = useState(false);
  useEffect(() => {
    if (props.mode !== 'cita') return;
    (async () => {
      const { data, error: dbErr } = await supabase
        .from('citas')
        .select('id, servicios(nombre, precio), pagos(tipo, importe_cents, estado)')
        .in('id', props.citaIds);
      if (dbErr || !data) { setDetalleFallo(true); return; }
      type FilaCita = {
        id: string;
        servicios: { nombre: string | null; precio: number | null } | Array<{ nombre: string | null; precio: number | null }> | null;
        pagos: Array<{ tipo: string | null; importe_cents: number | null; estado: string | null }> | null;
      };
      const filas = data as unknown as FilaCita[];
      // Se respeta el orden en que las paso el caller, no el que devuelva la BD.
      const porId = new Map(filas.map((f) => [f.id, f]));
      setCitasDetalle(
        props.citaIds.flatMap((id) => {
          const f = porId.get(id);
          if (!f) return [];
          const srv = relacionUnica(f.servicios);
          return [{
            id,
            nombre: srv?.nombre || 'Servicio',
            precioCents: Math.round(Number(srv?.precio ?? 0) * 100),
            senalCents: (f.pagos ?? [])
              .filter((p) => p.tipo === 'senal' && SENAL_PAGADA.includes(p.estado ?? ''))
              .reduce((s, p) => s + (p.importe_cents ?? 0), 0),
          }];
        }),
      );
      setDetalleFallo(false);
    })();
  }, [props.mode, props.mode === 'cita' ? props.citaIds.join(',') : '']);

  // --- Edicion del importe antes de cobrar: el dueño ajusta lo que se cobra de
  // verdad (el extra "vale 12 EUR" pero hoy toca otra cosa). El importe final
  // viaja como p_base_cents y queda auditado en cobros y cobro_lineas, de donde
  // leen caja e informes.
  //
  // Se levantan los dos limites que lo escondian:
  //  - citaIds.length === 1 -> ahora hay una fila por cita y cada una se corrige
  //    por separado, que es lo unico que puede significar "editar N importes".
  //  - venta suelta -> ahi no hay "base": cada linea del ticket es editable.
  // Queda EL TERCERO a proposito: con bono el servicio lo cubre el bono y sigue
  // valiendo 0 EUR. Editable si es lo demas del ticket. Decision de producto del
  // 6 sep 2026: corregir el importe no puede significar "pago Y gasto sesion". ---
  const puedeEditarBase = props.mode === 'cita' && !usarBono;
  // Importe corregido por cita (centimos, BRUTO de señal). Sin entrada = precio
  // de catalogo, y el RPC ni recibe p_base_cents.
  const [basesPorCita, setBasesPorCita] = useState<Record<string, number>>({});
  const [editandoCita, setEditandoCita] = useState<string | null>(null);
  const [baseInput, setBaseInput] = useState('');

  // --- Add-ons de la cita(s): solo dinero (no ocupan agenda desde 2026-09-01),
  // pero hay que cobrarlos. El RPC los suma server-side; aqui solo se muestran
  // para que el total del ticket cuadre con lo que ve el usuario. ---
  const [addonsCita, setAddonsCita] = useState<Array<{ nombre: string; precio: number }>>([]);
  useEffect(() => {
    if (props.mode !== 'cita') return;
    (async () => {
      try {
        const { data } = await supabase
          .from('cita_addons')
          .select('service_addons(nombre, precio)')
          .in('cita_id', props.citaIds);
        setAddonsCita(
          (data ?? [])
            .map((ca: any) => ca.service_addons)
            .filter(Boolean),
        );
      } catch { /* mejor esfuerzo: el RPC igualmente los cobra */ }
    })();
  }, [props.mode, props.mode === 'cita' ? props.citaIds.join(',') : '']);
  const addonsCents = addonsCita.reduce((s, a) => s + Math.round(a.precio * 100), 0);

  // Elegir del catalogo mete la linea DIRECTAMENTE en el ticket: la peticion de
  // Jose era "cobrar un servicio sin escribirlo a mano", no rellenar el campo de
  // nombre por el. El precio queda editable en la propia fila.
  const elegirDelCatalogo = (item: ItemCatalogo) => {
    setLineas((prev) => {
      // Repetir el mismo articulo sube la cantidad, como hace el lector.
      const i = prev.findIndex((l) => l.ref_id === item.id && l.tipo === item.tipo);
      if (i === -1) {
        return [...prev, {
          nombre: item.nombre,
          precio: (item.precioCents / 100).toFixed(2),
          cantidad: '1',
          ref_id: item.id,
          tipo: item.tipo,
        }];
      }
      const copia = prev.slice();
      copia[i] = { ...copia[i], cantidad: String((parseInt(copia[i].cantidad, 10) || 1) + 1) };
      return copia;
    });
    setSelectorAbierto(false);
  };

  // Linea suelta escrita a mano: sigue existiendo para lo que no esta en el
  // catalogo (un arreglo puntual, una consulta). Sin ref_id y por tanto sin
  // atribucion en Informes, que es justo lo que evita el selector.
  const agregarLinea = () => {
    const precio = aEntero(lineaPrecio);
    if (!lineaNombre.trim() || precio <= 0) return;
    setLineas((prev) => [...prev, { nombre: lineaNombre.trim(), precio: lineaPrecio, cantidad: '1', tipo: 'servicio' }]);
    setLineaNombre('');
    setLineaPrecio('');
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
        const i = prev.findIndex((l) => l.ref_id === prod.id && l.tipo === 'producto');
        if (i === -1) {
          return [...prev, { nombre: prod.nombre, precio: prod.precio.toString(), cantidad: '1', ref_id: prod.id, tipo: 'producto' }];
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
  // El precio de CUALQUIER linea se corrige antes de cobrar, venga del catalogo
  // o escrita a mano (peticion 2 de Jose, la parte que faltaba).
  const cambiarPrecioLinea = (idx: number, precio: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, precio: precio.replace(/[^0-9.,]/g, '') } : l)));
  };

  const lineasBaseCents = lineas.reduce(
    (s, l) => s + Math.round(aEntero(l.precio) * 100) * Math.max(1, parseInt(l.cantidad || '1', 10)),
    0
  );

  const pendienteBaseCents = 'pendienteCents' in props ? props.pendienteCents : 0;
  const senalCents = props.mode === 'cita' ? (props.senalCents ?? 0) : 0;

  // Filas de servicio del ticket. Si el desglose no llega (fallo de red) y solo
  // hay una cita, se sintetiza con lo que ya dio el caller: asi no se pierde la
  // correccion de importe que ya existia para el caso de una cita.
  const filasCita: CitaCobrable[] = citasDetalle.length > 0
    ? citasDetalle
    : (props.mode === 'cita' && props.citaIds.length === 1
        ? [{ id: props.citaIds[0], nombre: props.subtitulo || 'Servicio', precioCents: pendienteBaseCents + senalCents, senalCents }]
        : []);

  const baseDeCita = (c: CitaCobrable) => basesPorCita[c.id] ?? c.precioCents;
  // El agregado que dio el caller manda mientras nadie corrija nada: asi el
  // numero en pantalla no baila por recalcularlo aqui de otra forma. Cada
  // correccion lo mueve exactamente su diferencia con el catalogo.
  const ajusteBaseCents = filasCita.reduce((s, c) => s + (baseDeCita(c) - c.precioCents), 0);
  const baseEfectivaCents = Math.max(0, pendienteBaseCents + ajusteBaseCents);

  // Un cliente puede acumular decenas de citas sin cobrar (en la demo hay
  // conceptos de 14 y 27 servicios). Con tantas, una fila por cita entierra el
  // total y los botones de metodo bajo un scroll enorme. Hasta cinco se
  // enseñan; a partir de ahi, resumen y "ver desglose" para quien quiera
  // corregir una en concreto.
  const [desgloseAbierto, setDesgloseAbierto] = useState(false);
  const desgloseColapsable = filasCita.length > 5;
  const filasVisibles = desgloseColapsable && !desgloseAbierto ? [] : filasCita;

  const confirmarBase = (citaId: string) => {
    setBasesPorCita((prev) => {
      const copia = { ...prev };
      // Vaciar y confirmar = volver al precio de catalogo.
      if (!baseInput.trim()) delete copia[citaId];
      else copia[citaId] = Math.round(aEntero(baseInput) * 100);
      return copia;
    });
    setEditandoCita(null);
  };

  const pendienteCents = baseEfectivaCents + addonsCents + lineasBaseCents;
  // Base sobre la que se aplica el descuento: con bono la cita la cubre el
  // bono, asi que el % se calcula solo sobre productos extra y add-ons (que el
  // bono no cubre y si se cobran).
  const baseDescuentoCents = usarBono ? lineasBaseCents + addonsCents : pendienteCents;
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
  // Con bono: la cita la cubre el bono (0 €), pero los productos extra y los
  // add-ons SI se cobran, menos el descuento aplicado, mas la propina.
  const totalCents = usarBono
    ? Math.max(0, lineasBaseCents + addonsCents - descuentoCents) + propinaCents
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
          ref_id: l.ref_id,
          tipo: l.tipo,
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
            ref_id: l.ref_id,
            tipo: l.tipo,
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
            ref_id: l.ref_id,
            tipo: l.tipo,
          }));
          const resultados = await Promise.all(
            props.citaIds.map((id, idx) =>
              supabase.rpc('crear_cobro_desde_cita', {
                p_cita_id: id,
                p_metodo: metodo,
                p_propina_cents: propinaCents,
                p_descuento_cents: descuentoCents,
                p_lineas_extra: idx === 0 ? lineasExtra : [],
                // Importe corregido a mano, POR CITA: el RPC espera la base del
                // servicio (bruta de señal) porque el descuenta la señal solo.
                // Sin correccion no se manda y el servidor usa su catalogo.
                ...(basesPorCita[id] !== undefined ? { p_base_cents: basesPorCita[id] } : {}),
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
        // Importe corregido a mano (bruto de señal), igual que en el POS.
        ...(basesPorCita[props.citaIds[0]] !== undefined
          ? { p_base_cents: basesPorCita[props.citaIds[0]] }
          : {}),
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
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{isWalkin ? 'Líneas' : 'Añadir servicio, producto o extra'}</div>
            {lineas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {lineas.map((l, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 8px' }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nombre}</span>
                      <span style={{ fontSize: 10, color: T.textTer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{ETIQUETA_TIPO[l.tipo]}</span>
                    </span>
                    <input
                      type="text" inputMode="numeric" value={l.cantidad}
                      aria-label={`Cantidad de ${l.nombre}`}
                      onChange={(e) => cambiarCantidad(idx, e.target.value)}
                      style={{ width: 32, padding: '4px 2px', textAlign: 'center', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12 }}
                    />
                    {/* Precio editable en TODA linea: es la mitad de la peticion 2
                        que faltaba (antes solo se podia corregir el servicio de
                        una cita, y solo si era una). */}
                    <input
                      type="text" inputMode="decimal" value={l.precio}
                      aria-label={`Precio de ${l.nombre}`}
                      onChange={(e) => cambiarPrecioLinea(idx, e.target.value)}
                      style={{ width: 62, padding: '4px 6px', textAlign: 'right', background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, fontWeight: 600, boxSizing: 'border-box' }}
                    />
                    <span style={{ fontSize: 11.5, color: T.textTer }}>€</span>
                    <button onClick={() => quitarLinea(idx)} aria-label="Quitar línea" style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {/* Camino principal: el catalogo entero en un modal ancho con
                buscador. Antes esto era un desplegable de 200 px que solo tenia
                productos, y por eso un servicio habia que escribirlo a mano. */}
            <button
              type="button"
              onClick={() => setSelectorAbierto(true)}
              data-testid="abrir-selector-catalogo"
              style={{
                width: '100%', padding: '11px 14px', background: T.primarySoft, border: `1px solid ${T.primary}`,
                borderRadius: 10, color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Buscar en el catálogo
              {!catalogoCargando && catalogo.length > 0 && (
                <span style={{ fontWeight: 600, color: T.textSec, fontSize: 12 }}>({catalogo.length})</span>
              )}
            </button>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                type="text" value={lineaNombre}
                onChange={(e) => setLineaNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregarLinea(); }}
                placeholder="...o escribe una línea suelta"
                style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
              />
              <input
                type="text" inputMode="decimal" value={lineaPrecio} onChange={(e) => setLineaPrecio(e.target.value)} placeholder="€"
                aria-label="Precio de la línea suelta"
                style={{ width: 70, padding: '8px 10px', textAlign: 'right', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, boxSizing: 'border-box' }}
              />
              <button onClick={agregarLinea} aria-label="Añadir línea suelta" style={{ padding: '8px 14px', background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+</button>
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
              {/* Una fila por cita, cada una con su precio corregible. Con una
                  sola cita se lee igual que antes; con varias, cada servicio
                  se ajusta por separado, que es lo unico que puede significar
                  "editar el importe de N citas". */}
              {desgloseColapsable && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: T.textSec }}>{filasCita.length} servicios</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ajusteBaseCents !== 0 ? T.primary : T.text }}>
                      {(filasCita.reduce((s, c) => s + baseDeCita(c), 0) / 100).toFixed(2)} €
                    </span>
                    <button type="button" onClick={() => setDesgloseAbierto(!desgloseAbierto)}
                      style={{ padding: '4px 8px', background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.textSec, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      {desgloseAbierto ? 'ocultar desglose' : 'ver desglose'}
                    </button>
                  </div>
                </div>
              )}
              {filasVisibles.map((c) => {
                const base = baseDeCita(c);
                const corregida = basesPorCita[c.id] !== undefined && base !== c.precioCents;
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      {/* El nombre del servicio, no "Pendiente": lo que se
                          enseña y se corrige es el PRECIO del servicio (bruto),
                          y la señal se descuenta en su propia fila de abajo. */}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.nombre}
                      </span>
                      {editandoCita === c.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="text" inputMode="decimal" autoFocus value={baseInput}
                            aria-label={`Importe de ${c.nombre}`}
                            onChange={(e) => setBaseInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmarBase(c.id);
                              if (e.key === 'Escape') setEditandoCita(null);
                            }}
                            placeholder={(base / 100).toFixed(2)}
                            style={{ width: 84, padding: '6px 10px', textAlign: 'right', background: T.bgPanel, border: `1px solid ${T.primary}`, borderRadius: 8, color: T.text, fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
                          />
                          <button type="button" title="Confirmar importe" onClick={() => confirmarBase(c.id)}
                            style={{ padding: '6px 10px', background: T.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: corregida ? T.primary : T.text }}>
                            {(base / 100).toFixed(2)} €
                          </span>
                          {puedeEditarBase && (
                            <button type="button" title="Corregir el importe antes de cobrar"
                              onClick={() => { setBaseInput((base / 100).toFixed(2)); setEditandoCita(c.id); }}
                              style={{ padding: '4px 8px', background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, color: T.textSec, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                              ✎ editar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {corregida && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11, color: T.textTer }}>
                          corregido: catálogo {(c.precioCents / 100).toFixed(2)} € → {(base / 100).toFixed(2)} €
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Sin desglose (fallo al cargarlo) se sigue viendo el agregado que
                  dio el caller, pero no se puede corregir: no sabriamos a que
                  cita mandarle el p_base_cents. */}
              {props.mode === 'cita' && filasCita.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: T.textSec }}>Pendiente</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{(pendienteBaseCents / 100).toFixed(2)} €</span>
                </div>
              )}
              {props.mode === 'cita' && detalleFallo && (
                <div style={{ fontSize: 11, color: T.textTer }}>
                  No se ha podido cargar el desglose por servicio; los importes no se pueden corregir aquí.
                </div>
              )}
              {senalCents > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: T.success }}>Señal ya pagada</span>
                  <span style={{ fontSize: 12.5, color: T.success }}>incluida (no se vuelve a cobrar)</span>
                </div>
              )}
            </>
          )}
          {/* Add-ons de la cita: se cobran siempre (el bono cubre el servicio,
              los extras no). Fuera del bloque !usarBono para verse tambien con bono. */}
          {addonsCita.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: T.textSec }}>Extra · {a.nombre}</span>
              <span style={{ fontSize: 12.5, color: T.textSec }}>+{a.precio.toFixed(2)} €</span>
            </div>
          ))}
          {/* Con varias lineas el ticket de arriba se lee mal de un vistazo: se
              resume aqui, junto al resto de conceptos del total. */}
          {lineasBaseCents > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: T.textSec }}>
                {lineas.length === 1 ? '1 línea' : `${lineas.length} líneas`}
              </span>
              <span style={{ fontSize: 12.5, color: T.textSec }}>+{(lineasBaseCents / 100).toFixed(2)} €</span>
            </div>
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
            {/* Zona del recorrido guiado: el PASO FINAL del cobro, que es donde
                se elige efectivo, datafono o Bizum. El paso "cobra aqui mismo"
                apuntaba antes a la seccion entera de pagos y lo que se veia era
                la cabecera, no el momento de cobrar. */}
            <div data-demo="cobro-metodo">
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Método</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            </div>
            <div style={{ height: 16 }} />

            {metodo === 'bizum' && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(0,170,166,0.08)',
                  border: '1px solid rgba(0,170,166,0.30)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20 }}>📱</span>
                <div style={{ fontSize: 12, color: T.text }}>
                  <div style={{ fontWeight: 700, color: '#00838f' }}>Cobro por Bizum directo</div>
                  <div style={{ color: T.textSec, fontSize: 11.5, marginTop: 2 }}>
                    Pide al cliente que envíe <strong>{(totalCents / 100).toFixed(2)} €</strong> al Bizum del salón.
                  </div>
                </div>
              </div>
            )}

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
  // El selector va FUERA de la hoja (no dentro de sheetBody) porque en modo
  // `inline` la hoja vive dentro de un contenedor con scroll y overflow: un
  // modal ahi dentro se recorta. Como es `position: fixed`, da igual donde
  // cuelgue del arbol mientras no herede un overflow.
  const selector = selectorAbierto ? (
    <SelectorCatalogo
      items={catalogo}
      cargando={catalogoCargando}
      onElegir={elegirDelCatalogo}
      onCerrar={() => setSelectorAbierto(false)}
    />
  ) : null;

  return inline ? (
    <>
      {sheetBody}
      {selector}
    </>
  ) : (
    <>
      <div
        onClick={() => { if (!enviando) onClose(); }}
        // El recorrido guiado abre esta hoja para el paso "asi se cobra". Al pasar
        // al siguiente paso hay que recogerla: si no, se queda encima del arqueo y
        // de los registros, tapando justo lo que se esta explicando.
        data-demo-cerrar="caja-cobrar"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'grid', placeItems: 'center', padding: 16 }}
      >
        {sheetBody}
      </div>
      {selector}
    </>
  );
}
