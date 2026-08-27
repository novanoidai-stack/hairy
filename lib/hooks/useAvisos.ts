import { useEffect, useSyncExternalStore } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { CITA_STATUS } from '@/lib/constants';
import { contarSinLeer } from '@/lib/bandeja';
import { cargarHallazgos, marcarHallazgo, type Hallazgo, type EstadoHallazgo } from '@/lib/hallazgos';
import {
  categoriaDeHallazgo, ordenarAvisos,
  type AvisoItem, type AvisoUrgencia,
} from '@/lib/avisosCategorias';
import { analizarAgendaDia, type ProblemaAgenda } from '@/lib/organizarAgenda';

// Hallazgos (S13/S14) que YA se muestran como su propia seccion nativa de Avisos:
// se excluyen de la seccion "Chispa esta vigilando" para no duplicar.
const HALLAZGOS_YA_NATIVOS = new Set(['cita_sin_confirmar', 'bandeja_sin_responder', 'fuga_clienta']);

// Avisos globales del negocio (campana). Misma logica que el panel de la agenda,
// pero autocontenida para poder montarse en cualquier pagina (Sidebar / tab bar):
// citas sin confirmar en 48h, mensajes sin leer, clientas en riesgo de fuga y
// cumpleanos proximos. Cada aviso lleva lo necesario para navegar a resolverlo.
//
// ---------------------------------------------------------------------------
// RENDIMIENTO (medido): esto era el mayor lastre de toda la app.
// Antes cada componente que llamaba al hook montaba SU PROPIO bucle de sondeo
// de 6 segundos, y cada vuelta dispara ~11 consultas a Supabase. Como el hook
// vive a la vez en la campana (AvisosBell) y en la barra movil (MobileTabBar),
// el navegador mantenia ~3,7 peticiones POR SEGUNDO contra la base de datos,
// para siempre, en todas las pantallas — incluida la demo publica.
// Ahora hay UN solo almacen compartido: un unico bucle para todos los que
// escuchen, intervalo sensato, y en pausa mientras la pestana no se ve. Las
// consultas siguen siendo las mismas; lo que cambia es cuantas veces se hacen.
// ---------------------------------------------------------------------------

export interface AvisoCitaSinConfirmar {
  id: string;
  inicio: string;
  clienteNombre: string;
}

export interface AvisoCumple {
  clienteId: string;
  nombre: string;
  fecha: Date;
  diff: number; // dias hasta el cumple (0 = hoy)
}

export interface AvisoCobroPendiente {
  id: string;
  inicio: string;
  clienteNombre: string;
  servicioNombre: string;
  precio: number;
}

export interface AvisosData {
  sinConfirmar: AvisoCitaSinConfirmar[];
  cobrosPendientes: AvisoCobroPendiente[];
  cumples: AvisoCumple[];
  mensajesSinLeer: number;
  clientesFuga: number;
  // Hallazgos del escaneo proactivo (S13) que no tienen ya seccion nativa
  // (senal sin pagar, presupuesto sin respuesta, stock bajo).
  hallazgos: Hallazgo[];
  ineficiencias: ProblemaAgenda[];
  // Vista unificada de TODOS los avisos, normalizada y ordenada (urgencia +
  // cercania temporal). La consumen la campana web y la hoja movil para pintar
  // categorias, urgencia y orden cronologico de forma identica.
  items: AvisoItem[];
  total: number;
  loading: boolean;
  refresh: () => void;
  // Resolver/descartar un hallazgo desde Avisos (cierra el bucle: estado + notif).
  resolverHallazgo: (id: string, estado: Extract<EstadoHallazgo, 'resuelto' | 'descartado'>) => Promise<void>;
}

// Cada vuelta son ~11 consultas: a 6 s no daba tiempo ni a respirar entre una y
// la siguiente. 45 s sigue siendo "casi en vivo" para retrasos y huecos, y los
// cambios que SI son inmediatos (mover una cita, cobrar) ya llegan por evento.
const INTERVALO_MS = 45000;
// Al volver a la pestana no se recarga si los datos son recientes.
const FRESCURA_MS = 20000;
// Rafagas de eventos (arrastrar varias citas seguidas) colapsan en una carga.
const ANTIRREBOTE_MS = 900;

type Datos = Omit<AvisosData, 'refresh' | 'resolverHallazgo'>;

const VACIO: Datos = {
  sinConfirmar: [], cobrosPendientes: [], cumples: [], mensajesSinLeer: 0,
  clientesFuga: 0, hallazgos: [], ineficiencias: [], items: [], total: 0, loading: true,
};

// --- Almacen compartido -----------------------------------------------------

let datos: Datos = VACIO;
let instantanea: AvisosData;
const suscriptores = new Set<() => void>();
let oyentesActivos = 0;
let temporizador: ReturnType<typeof setInterval> | null = null;
let antirrebote: ReturnType<typeof setTimeout> | null = null;
let enVuelo: Promise<void> | null = null;
let ultimaCargaMs = 0;
let eventosEnganchados = false;

function emitir() {
  instantanea = { ...datos, refresh, resolverHallazgo };
  suscriptores.forEach((avisar) => avisar());
}

function fijar(parcial: Partial<Datos>) {
  datos = { ...datos, ...parcial };
  datos.items = construirItems(datos);
  datos.total =
    datos.sinConfirmar.length + datos.cobrosPendientes.length + datos.cumples.length +
    datos.mensajesSinLeer + datos.clientesFuga + datos.hallazgos.length + datos.ineficiencias.length;
  emitir();
}

instantanea = { ...datos, refresh, resolverHallazgo };

function ocultaLaPestana(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Fuerza una recarga ya. Comparte la peticion si ya hay una en vuelo. */
function refresh() {
  void cargar();
}

async function resolverHallazgo(
  id: string,
  estado: Extract<EstadoHallazgo, 'resuelto' | 'descartado'>,
) {
  // Optimista: quita el hallazgo de la lista al instante; la recarga reconcilia.
  fijar({ hallazgos: datos.hallazgos.filter((h) => h.id !== id) });
  await marcarHallazgo(id, estado);
  void cargar();
}

function programarPorEvento() {
  if (antirrebote) clearTimeout(antirrebote);
  antirrebote = setTimeout(() => { antirrebote = null; void cargar(); }, ANTIRREBOTE_MS);
}

function engancharEventos() {
  if (eventosEnganchados || typeof window === 'undefined') return;
  eventosEnganchados = true;
  window.addEventListener('mecha_calendar_refresh', programarPorEvento);
  window.addEventListener('mecha_cita_moved', programarPorEvento);
  window.addEventListener('mecha_avisos_refresh', programarPorEvento);
  document.addEventListener('visibilitychange', () => {
    if (ocultaLaPestana() || oyentesActivos === 0) return;
    // Al volver: solo recarga si lo que hay en pantalla ya esta rancio.
    if (Date.now() - ultimaCargaMs >= FRESCURA_MS) void cargar();
  });
}

function arrancarBucle() {
  if (temporizador) return;
  temporizador = setInterval(() => {
    // Sondear una pestana que nadie mira es gastar bateria y cuota de base de
    // datos a cambio de nada: al volver se recarga (visibilitychange).
    if (ocultaLaPestana()) return;
    void cargar();
  }, INTERVALO_MS);
}

function pararBucle() {
  if (temporizador) { clearInterval(temporizador); temporizador = null; }
  if (antirrebote) { clearTimeout(antirrebote); antirrebote = null; }
}

async function cargar(): Promise<void> {
  if (enVuelo) return enVuelo; // una sola peticion para todos los que escuchan
  enVuelo = (async () => {
    try {
      const profile = await getUserProfile();
      const negocioId = profile?.negocio_id;
      if (!negocioId) { fijar({ loading: false }); return; }

      const ahora = new Date();
      const en48h = new Date(ahora.getTime() + 48 * 3600000);
      const esGestor = profile?.role === 'owner' || profile?.role === 'admin';

      const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      const manana0 = new Date(hoy0.getTime() + 86400000);

      const [citasRes, clientesRes, mensajes, fugaRes, hallazgosRes, citasHoyRes, profsRes, cobrosPendRes] = await Promise.all([
        // Equivalente SQL del predicado canonico esSinConfirmar48h (lib/citasMetrics):
        // si se toca aqui, tocar tambien alli (banner de agenda y pagina Citas lo usan).
        supabase
          .from('citas')
          .select('id, inicio, cliente_id')
          .eq('negocio_id', negocioId)
          .eq('estado', CITA_STATUS.CONFIRMADA)
          .eq('confirmada_cliente', false)
          .eq('oculta_en_calendario', false)
          .gt('inicio', ahora.toISOString())
          .lte('inicio', en48h.toISOString())
          .order('inicio', { ascending: true }),
        supabase.from('clientes').select('id, nombre, fecha_nacimiento').eq('negocio_id', negocioId).not('fecha_nacimiento', 'is', null),
        contarSinLeer(negocioId).catch(() => 0),
        esGestor && !IS_DEMO_MODE && negocioId !== 'demo_salon_001'
          ? supabase.rpc('clientes_en_riesgo_fuga')
          : Promise.resolve({ data: [], error: null } as any),
        // Hallazgos del escaneo proactivo (S13). El RPC deriva el negocio del auth.uid();
        // en demo devuelve [] (el motor no persiste el tenant compartido).
        IS_DEMO_MODE || negocioId === 'demo_salon_001' ? Promise.resolve([]) : cargarHallazgos().catch(() => []),
        // Citas de hoy para detectar ineficiencias de agenda
        supabase
          .from('citas')
          .select('id, inicio, fin, fin_activa, fin_espera, profesional_id, cliente_id, estado, grupo_id, servicio_id')
          .eq('negocio_id', negocioId)
          .eq('oculta_en_calendario', false)
          .in('estado', [CITA_STATUS.PENDIENTE, CITA_STATUS.CONFIRMADA])
          .gte('inicio', hoy0.toISOString())
          .lt('inicio', manana0.toISOString()),
        // Profesionales para analizar la agenda
        supabase.from('profesionales').select('id, nombre, categoria').eq('negocio_id', negocioId).eq('activo', true),
        // Citas pasadas o completadas pendientes de cobro (olvidadas / sin marcar)
        supabase
          .from('citas')
          .select('id, inicio, cliente_id, clientes(nombre), servicio_id, servicios(nombre, precio)')
          .eq('negocio_id', negocioId)
          .eq('cobrada', false)
          .eq('oculta_en_calendario', false)
          .in('estado', [CITA_STATUS.CONFIRMADA, CITA_STATUS.COMPLETADA, CITA_STATUS.FINALIZADA])
          .lte('inicio', ahora.toISOString())
          .order('inicio', { ascending: false })
          .limit(15),
      ]);

      const citas = citasRes.data ?? [];
      const citasHoy = citasHoyRes.data ?? [];

      // Los nombres de cliente de AMBAS listas (sin confirmar + las de hoy) se
      // piden en UNA consulta. Antes eran dos seguidas, y ademas en serie
      // despues del Promise.all: dos viajes de red extra por vuelta.
      const idsNombres = Array.from(new Set(
        [...citas, ...citasHoy].map((c: any) => c.cliente_id).filter(Boolean),
      ));
      const nombreMap = new Map<string, string>();
      if (idsNombres.length > 0) {
        const { data: cls } = await supabase.from('clientes').select('id, nombre').in('id', idsNombres);
        (cls ?? []).forEach((c: any) => nombreMap.set(c.id, c.nombre));
      }

      const sinConfirmar = citas.map((c: any) => ({
        id: c.id, inicio: c.inicio, clienteNombre: nombreMap.get(c.cliente_id) || 'Cliente',
      }));

      // Cobros pendientes (citas pasadas o completadas no cobradas)
      const cobrosPendientes = (cobrosPendRes.data ?? []).map((c: any) => ({
        id: c.id,
        inicio: c.inicio,
        clienteNombre: c.clientes?.nombre || 'Cliente',
        servicioNombre: c.servicios?.nombre || 'Servicio',
        precio: c.servicios?.precio ?? 0,
      }));

      // Cumpleanos en los proximos 7 dias (misma logica que la agenda)
      const hoy0Ms = hoy0.getTime();
      const cumples: AvisoCumple[] = [];
      (clientesRes.data ?? []).forEach((cl: any) => {
        const fn = new Date(cl.fecha_nacimiento);
        if (isNaN(fn.getTime())) return;
        let next = new Date(ahora.getFullYear(), fn.getMonth(), fn.getDate());
        let diff = Math.ceil((next.getTime() - hoy0Ms) / 86400000);
        if (diff < 0) {
          next = new Date(ahora.getFullYear() + 1, fn.getMonth(), fn.getDate());
          diff = Math.ceil((next.getTime() - hoy0Ms) / 86400000);
        }
        if (diff >= 0 && diff <= 7) cumples.push({ clienteId: cl.id, nombre: cl.nombre, fecha: next, diff });
      });

      // --- Analizar ineficiencias de hoy ---
      const profesionales = profsRes.data ?? [];
      const citasOrganizar = citasHoy.map((c: any) => ({
        ...c,
        cliente: nombreMap.get(c.cliente_id) || 'El cliente',
        telefono: '', // no estricto para Avisos
        servicio: 'Servicio',
      }));

      const [{ data: bloqueosData }, { data: horariosData }, { data: cfgData }] = await Promise.all([
        supabase
          .from('bloqueos_profesional')
          .select('profesional_id, inicio, fin')
          .eq('negocio_id', negocioId),
        supabase
          .from('negocio_horarios')
          .select('dia_semana, abierto, apertura, cierre')
          .eq('negocio_id', negocioId),
        supabase
          .from('negocio_config')
          .select('config')
          .eq('negocio_id', negocioId)
          .maybeSingle(),
      ]);
      const cfgAgenda = ((cfgData as any)?.config ?? {}) as any;

      const ineficiencias = analizarAgendaDia(citasOrganizar, profesionales, {
        ahoraMs: ahora.getTime(),
        bloqueos: bloqueosData ?? [],
        horarios: horariosData ?? [],
        maxAdelantoMin: cfgAgenda.agendaMaxAdelantoMin,
        umbralHuecoMin: cfgAgenda.agendaUmbralHuecoMin,
      });
      // --- Fin ineficiencias ---

      ultimaCargaMs = Date.now();
      fijar({
        sinConfirmar,
        cobrosPendientes,
        cumples: cumples.sort((a, b) => a.diff - b.diff).slice(0, 8),
        mensajesSinLeer: mensajes || 0,
        clientesFuga: fugaRes?.error ? 0 : (fugaRes?.data ?? []).length,
        hallazgos: ((hallazgosRes as Hallazgo[]) ?? []).filter((h) => !HALLAZGOS_YA_NATIVOS.has(h.tipo)),
        ineficiencias,
        loading: false,
      });
    } catch {
      fijar({ loading: false });
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

function suscribir(avisar: () => void) {
  suscriptores.add(avisar);
  return () => { suscriptores.delete(avisar); };
}

// Como el almacen es compartido y sobrevive a los desmontajes, hay que tirarlo
// cuando cambia QUIEN esta dentro: al cerrar sesion o entrar con otra cuenta,
// los avisos del negocio anterior no pueden quedarse en pantalla.
function reiniciar() {
  datos = { ...VACIO };
  ultimaCargaMs = 0;
  emitir();
  if (oyentesActivos > 0) void cargar();
}

supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') reiniciar();
});

export function useAvisos(enabled = true): AvisosData {
  const estado = useSyncExternalStore(suscribir, () => instantanea, () => instantanea);

  useEffect(() => {
    if (!enabled) return;
    oyentesActivos += 1;
    engancharEventos();
    arrancarBucle();
    // Primera carga (o refresco si lo que hay guardado ya esta rancio).
    if (Date.now() - ultimaCargaMs >= FRESCURA_MS) void cargar();
    return () => {
      oyentesActivos -= 1;
      if (oyentesActivos <= 0) { oyentesActivos = 0; pararBucle(); }
    };
  }, [enabled]);

  // refresh y resolverHallazgo viven en el almacen: misma referencia siempre,
  // asi que la instantanea solo cambia cuando cambian los datos de verdad.
  return estado;
}

// Vista unificada: normaliza cada fuente a AvisoItem (categoria + urgencia + ts
// + ruta) y ordena por urgencia y cercania temporal. Un solo lugar de verdad
// para que campana y hoja movil sean identicas.
function construirItems(d: Datos): AvisoItem[] {
  const { sinConfirmar, cobrosPendientes, cumples, mensajesSinLeer, clientesFuga, hallazgos, ineficiencias } = d;
  const ahora = Date.now();
  const out: AvisoItem[] = [];

  // Cobros pendientes (citas pasadas o completadas no cobradas): aviso urgente en 'pagos'.
  if (cobrosPendientes.length > 0) {
    const subItems: AvisoItem[] = cobrosPendientes.map((c) => {
      const ts = new Date(c.inicio).getTime();
      return {
        id: `cobro_pend:${c.id}`,
        categoria: 'pagos',
        urgencia: 'alta' as AvisoUrgencia,
        titulo: `${c.clienteNombre} — ${c.servicioNombre}`,
        subtitulo: `Cita no marcada como cobrada (${c.precio}€)`,
        ts,
        ruta: '/(tabs)/caja',
      };
    });
    const minTs = Math.min(...subItems.map((i) => i.ts));
    out.push({
      id: 'cobros_pendientes_grupo',
      categoria: 'pagos',
      urgencia: 'alta',
      titulo: `${cobrosPendientes.length} ${cobrosPendientes.length === 1 ? 'cobro pendiente' : 'cobros pendientes'} de registrar`,
      subtitulo: 'Citas pasadas o completadas sin marcar como cobradas',
      ts: minTs,
      ruta: '/(tabs)/caja',
      meta: String(cobrosPendientes.length),
      subItems,
    });
  }

  // Citas sin confirmar (proximas 48h): agrupadas en un solo aviso.
  if (sinConfirmar.length > 0) {
    const subItems: AvisoItem[] = sinConfirmar.map((c) => {
      const ts = new Date(c.inicio).getTime();
      return {
        id: `cita:${c.id}`,
        categoria: 'citas',
        urgencia: (ts - ahora < 24 * 3600000 ? 'alta' : 'media') as AvisoUrgencia,
        titulo: c.clienteNombre,
        subtitulo: 'Sin confirmar por el cliente',
        ts,
        ruta: `/(tabs)/?cita=${c.id}`,
      };
    });
    // El grupo principal hereda la urgencia maxima de sus items y el ts mas cercano.
    const maxUrgencia = subItems.some((i) => i.urgencia === 'alta') ? 'alta' : 'media';
    const minTs = Math.min(...subItems.map((i) => i.ts));
    out.push({
      id: 'citas_sin_confirmar_grupo',
      categoria: 'citas',
      urgencia: maxUrgencia,
      titulo: `${sinConfirmar.length} citas sin confirmar por el cliente`,
      subtitulo: 'Pendientes de confirmación SMS/link',
      ts: minTs,
      ruta: '', // No navega, se expande en la campana
      meta: String(sinConfirmar.length),
      subItems,
    });
  }

  // Mensajes sin leer (agregado): un aviso con el total.
  if (mensajesSinLeer > 0) {
    out.push({
      id: 'mensajes',
      categoria: 'mensajes',
      urgencia: 'media',
      titulo: `${mensajesSinLeer} ${mensajesSinLeer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}`,
      subtitulo: 'En Bandeja',
      ts: ahora,
      ruta: '/(tabs)/bandeja',
      meta: String(mensajesSinLeer),
    });
  }

  // Clientas en riesgo de fuga (agregado).
  if (clientesFuga > 0) {
    out.push({
      id: 'fuga',
      categoria: 'clientes',
      urgencia: 'media',
      titulo: `${clientesFuga} ${clientesFuga === 1 ? 'clienta en riesgo de fuga' : 'clientas en riesgo de fuga'}`,
      subtitulo: 'Hace tiempo que no vienen',
      ts: ahora,
      ruta: '/(tabs)/clientes?filtro=fuga',
      meta: String(clientesFuga),
    });
  }

  // Cumpleanos proximos (prioridad baja).
  cumples.forEach((b) => {
    const cuando = b.diff === 0 ? 'Hoy cumple años' : b.diff === 1 ? 'Mañana cumple años' : `Cumple en ${b.diff} días`;
    out.push({
      id: `cumple:${b.clienteId}`,
      categoria: 'clientes',
      urgencia: 'baja',
      titulo: b.nombre,
      subtitulo: cuando,
      ts: b.fecha.getTime(),
      ruta: `/(tabs)/clientes?clienteId=${b.clienteId}`,
    });
  });

  // Hallazgos del escaneo proactivo (senal sin pagar, stock bajo, retrasos...).
  hallazgos.forEach((h) => {
    const cnt = h.datos?.count ?? 0;
    out.push({
      id: `hallazgo:${h.id}`,
      categoria: categoriaDeHallazgo(h),
      urgencia: h.severidad,
      titulo: h.resumen,
      subtitulo: h.detalle || undefined,
      ts: new Date(h.creado_en).getTime() || ahora,
      ruta: rutaHallazgo(h.tipo, h.accion_sugerida?.payload as Record<string, unknown>),
      hallazgoId: h.id,
      meta: cnt > 0 ? `${cnt} ${cnt === 1 ? 'caso' : 'casos'}` : undefined,
    });
  });

  // Ineficiencias de agenda (huecos, retrasos severos).
  //
  // RECONCILIACION DE LAS DOS FUENTES (ago-2026): la vigilancia del servidor
  // (vigilar-agenda cada 15 min + modo "ojo" en cada movimiento) escribe ESTOS
  // MISMOS problemas agregados por tipo en hallazgos_ia (familia
  // 'ineficiencia'), y el bucle de arriba ya los pinta como hallazgo. El
  // hallazgo MANDA cuando existe: ve horarios_profesional y cierres (este
  // analisis cliente no se los pasa, asi que detecta menos y peor), persiste
  // entre dispositivos y se puede resolver/descartar (hallazgoId). El item del
  // cliente queda como RESPALDO por tipo: sin hallazgo de ese tipo (la
  // vigilancia aun no ha pasado, o este negocio no la tiene) se sigue viendo el
  // problema en vivo. En la demo (demo_salon_001 / modo demo) cargarHallazgos
  // devuelve [] a proposito, asi que alli el respaldo es la unica fuente y la
  // campana no se queda sin avisos de agenda.
  const tiposConHallazgo = new Set(hallazgos.map((h) => h.tipo));
  ineficiencias.forEach((prob) => {
    if (prob.tipo === 'hueco_muerto') return; // The user asked to remove "huecos muertos" notifications
    if (tiposConHallazgo.has(prob.tipo)) return; // ya lo pinta el hallazgo del servidor, mejor informado
    out.push({
      id: `ineficiencia:${prob.id}`,
      categoria: 'ineficiencia',
      urgencia: prob.tipo === 'retraso' || prob.tipo === 'solape' ? 'alta' : 'media',
      titulo: prob.titulo,
      subtitulo: prob.descripcion,
      ts: ahora,
      ruta: '/(tabs)/', // abre la agenda
    });
  });

  return ordenarAvisos(out);
}

// Ruta destino de un hallazgo segun su accion sugerida (o por tipo como
// fallback). Compartida por la vista unificada de items.
function rutaHallazgo(tipo: string, payload?: Record<string, unknown>): string {
  const destino = (payload?.destino as string) || '';
  const mapa: Record<string, string> = {
    agenda: '/(tabs)/', bandeja: '/(tabs)/bandeja', presupuestos: '/(tabs)/presupuestos',
    inventario: '/(tabs)/inventario', clientes: '/(tabs)/clientes',
  };
  if (destino && mapa[destino]) return mapa[destino];
  if (tipo === 'senal_sin_pagar') return '/(tabs)/';
  if (tipo === 'presupuesto_sin_respuesta') return '/(tabs)/presupuestos';
  if (tipo === 'stock_bajo') return '/(tabs)/inventario';
  return '/(tabs)/';
}
