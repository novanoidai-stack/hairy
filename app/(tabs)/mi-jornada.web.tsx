import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, roleLabel } from '@/lib/auth';
import { identidadActiva } from '@/lib/identidadActiva';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { format, parseISO, startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Segmented, StatBox, STextInput, SSelect } from '@/components/ui/SettingsAtoms';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualMiJornada } from '@/lib/manuals/mi-jornada';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { useAyudaIA } from '@/lib/hooks/useAyudaIA';
import type { Bloque } from '@/lib/chispaBloques';
import { TarjetaAyudaIA } from '@/components/chispa/TarjetaAyudaIA.web';
import type { AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ejecutarAccion } from '@/lib/chispaOps';
import { fasesDe, type CitaRetraso } from '@/lib/retrasos';
import { UMBRAL_HUECO_MIN_DEFAULT } from '@/lib/organizarAgenda';
import { CITA_STATUS, CITA_STATUS_ACTIVOS } from '@/lib/constants';
import { fichar as ficharJornada, cargarEstadoJornada, type Modalidad, type JornadaEstado } from '@/lib/jornada';
import { RegistroJornada } from '@/components/jornada/RegistroJornada.web';

const T = DESIGN_TOKENS;

const ANIM = `
  @keyframes mjFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes mjUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes mjSpin { to { transform: rotate(360deg) } }
  .mj-row { animation: mjUp 0.32s cubic-bezier(0.16,1,0.3,1) both; }
`;

// Iconos en linea (mismo set que caja.web.tsx, sin dependencias extra).
function Icon({ name, size = 18, color = T.text }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="6" r="1"/><path d="M20.2 19.2L13 12"/><path d="M18 4l4 4-8.8 8.8a4 4 0 0 1-2.8 1.2H4l1.8-1.8a4 4 0 0 1 1.2-2.8L18 4z"/>',
    cash: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    drop: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

type Periodo = 'hoy' | 'semana' | 'mes';

interface CitaLista { inicio: string; cliente: string | null; servicio: string | null; es_tinte: boolean; }
interface Resumen {
  profesional: { id: string | null; nombre: string; vinculado: boolean };
  rol: string;
  horas: number;
  citas_completadas: number;
  tintes: number;
  citas_lista: CitaLista[];
  puede_ver_importes: boolean;
  puede_ver_comision: boolean;
  total_cents?: number;
  propinas_cents?: number;
  efectivo_cents?: number;
  datafono_cents?: number;
  cobros_count?: number;
  ticket_medio_cents?: number;
  comision_cents?: number;
}

interface ServicioTop { nombre: string; count: number; }
type MetricaObjetivo = 'ingresos' | 'servicios' | 'horas' | 'productivo';

interface MiObjetivo { id: string; metrica: MetricaObjetivo; objetivo_valor: number; bonus_cents: number | null; actual: number }
interface ProfesionalMini { id: string; nombre: string }

const METRICA_LABEL: Record<MetricaObjetivo, string> = {
  ingresos: 'Dinero generado (€)',
  servicios: 'Servicios completados',
  horas: 'Horas trabajadas',
  productivo: 'Reposo aprovechado (%)',
};
const METRICA_SUFIJO: Record<MetricaObjetivo, string> = { ingresos: '€', servicios: '', horas: 'h', productivo: '%' };
function fmtMetrica(m: MetricaObjetivo, v: number): string {
  if (m === 'ingresos') return `${v.toFixed(0)}€`;
  if (m === 'horas') return `${v.toFixed(1)}h`;
  if (m === 'productivo') return `${Math.round(v)}%`;
  return String(Math.round(v));
}

const PERIODO_LABEL: Record<Periodo, string> = { hoy: 'hoy', semana: 'esta semana', mes: 'este mes' };

// Rango [desde, hasta) en hora local para el periodo elegido.
function rangoDe(periodo: Periodo): [Date, Date] {
  const now = new Date();
  if (periodo === 'hoy') { const d = startOfDay(now); return [d, addDays(d, 1)]; }
  if (periodo === 'semana') { const d = startOfWeek(now, { weekStartsOn: 1 }); return [d, addWeeks(d, 1)]; }
  const d = startOfMonth(now); return [d, addMonths(d, 1)];
}

function fmtHoras(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  // 0.999 h redondea a 60 min: eso es 1h, no "60m".
  if (mins === 60) return `${horas + 1}h`;
  if (horas <= 0) return mins > 0 ? `${mins}m` : '0h';
  return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
}

const eur = (cents?: number) => `${((cents || 0) / 100).toFixed(2)}€`;
const fmtPct = (n: number) => `${Math.round(n)}%`;

// Resumen determinista (sin LLM) de la tarjeta "Resumen de tu día": citas,
// horas y comisión ya cargados en `resumen`. Patron Sesion 4 (V2): esto se ve
// SIEMPRE, aunque el LLM falle o tarde — el LLM solo anade una lectura encima.
function resumenIADeterminista(r: Resumen, periodo: Periodo): string {
  const prefijo = periodo === 'hoy' ? 'Hoy' : periodo === 'semana' ? 'Esta semana' : 'Este mes';
  if (r.citas_completadas === 0) return `${prefijo} aún no tienes citas completadas.`;
  const partes = [
    `${r.citas_completadas} cita${r.citas_completadas === 1 ? '' : 's'} completada${r.citas_completadas === 1 ? '' : 's'}`,
    `${fmtHoras(r.horas)} trabajadas`,
  ];
  if (r.puede_ver_comision && (r.comision_cents ?? 0) > 0) partes.push(`${eur(r.comision_cents)} de comisión`);
  return `${prefijo}: ${partes.join(' · ')}.`;
}

// Coaching de huecos (Sesion 7 V2): hueco real y aprovechable HOY para el
// profesional, calculado con las MISMAS primitivas de fase que el boton
// "Organizar mi agenda" (lib/retrasos.ts fasesDe) para no reinventar la regla
// dura activa/reposo/transicion. Dos tipos: 'reposo' (el profesional queda
// libre durante el tinte/permanente de un cliente, aunque el servicio siga
// abierto) y 'entre_citas' (hueco muerto entre el fin real de una cita y el
// inicio de la siguiente). Solo cuentan huecos que no hayan pasado ya.
interface HuecoHoy {
  tipo: 'reposo' | 'entre_citas';
  inicioMs: number;
  minutos: number;
  cliente: string | null;
}

function calcularHuecosHoy(citas: CitaRetraso[], ahoraMs: number, umbralMin = UMBRAL_HUECO_MIN_DEFAULT): HuecoHoy[] {
  const fases = citas.map((c) => ({ f: fasesDe(c), cliente: c.cliente ?? null })).sort((a, b) => a.f.ini - b.f.ini);
  const huecos: HuecoHoy[] = [];

  for (const { f, cliente } of fases) {
    if (f.finE > f.finA && f.finE > ahoraMs) {
      const minutos = Math.round((f.finE - f.finA) / 60000);
      if (minutos >= umbralMin) huecos.push({ tipo: 'reposo', inicioMs: f.finA, minutos, cliente });
    }
  }
  for (let i = 0; i < fases.length - 1; i++) {
    const actual = fases[i].f;
    const siguiente = fases[i + 1].f;
    if (siguiente.ini <= actual.fin || siguiente.ini <= ahoraMs) continue;
    const minutos = Math.round((siguiente.ini - actual.fin) / 60000);
    if (minutos >= umbralMin) huecos.push({ tipo: 'entre_citas', inicioMs: actual.fin, minutos, cliente: null });
  }

  return huecos.sort((a, b) => a.inicioMs - b.inicioMs);
}

function fmtHoraHueco(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function textoHueco(h: HuecoHoy): string {
  const hora = fmtHoraHueco(h.inicioMs);
  if (h.tipo === 'reposo') {
    return `Tienes ${h.minutos} min libres a partir de las ${hora} mientras ${h.cliente ? `el servicio de ${h.cliente}` : 'un servicio'} está en reposo.`;
  }
  return `Tienes ${h.minutos} min libres a partir de las ${hora} antes de tu siguiente cita.`;
}

function MetricRow({ icon, label, value, sub, color = T.primary }: { icon: string; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: T.bgCard,
      borderBottom: `1px solid ${T.border}`,
      gap: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}15`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={16} color={color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  );
}

function MiJornadaScreen() {
  const { isMobile } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('mi-jornada');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [nuevaResena, setNuevaResena] = useState<{ id: string; puntuacion: number; comentario: string | null } | null>(null);
  const [estadoJornada, setEstadoJornada] = useState<JornadaEstado | null>(null);
  const [identidadRol, setIdentidadRol] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [salonNombre, setSalonNombre] = useState('');
  const [fichando, setFichando] = useState(false);
  const [subTab, setSubTab] = useState<'citas' | 'numeros' | 'ausencias' | 'registro'>('citas');
  // Presencial vs remoto: el registro de jornada tiene que distinguirlos.
  const [modalidad, setModalidad] = useState<Modalidad>('presencial');
  const [resumenIaOpen, setResumenIaOpen] = useState<boolean>(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [intercambios, setIntercambios] = useState<any[]>([]);
  const [showIntercambioModal, setShowIntercambioModal] = useState(false);
  const [nuevoIntercambio, setNuevoIntercambio] = useState<{ companero_id: string; fecha_solicitante: string; fecha_companero: string; motivo: string } | null>(null);
  const [misObjetivos, setMisObjetivos] = useState<MiObjetivo[]>([]);
  const [profesionalesActivos, setProfesionalesActivos] = useState<ProfesionalMini[]>([]);
  const [ausencias, setAusencias] = useState<Array<{id: string; inicio: string; fin: string; tipo: string; motivo: string | null}>>([]);
  const [showAusenciaModal, setShowAusenciaModal] = useState(false);
  const ayudaIA = useAyudaIA();
  const [accionEstadoIA, setAccionEstadoIA] = useState<AccionEstado>('pendiente');
  const [huecosHoy, setHuecosHoy] = useState<HuecoHoy[]>([]);

  useEffect(() => {
    const profId = resumen?.profesional?.id;
    if (periodo !== 'hoy' || !resumen?.profesional?.vinculado || !profId) {
      setHuecosHoy([]);
      return;
    }
    let cancelado = false;
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      const hoy0 = startOfDay(new Date());
      const { data } = await supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, clientes(nombre)')
        .eq('negocio_id', profile.negocio_id)
        .eq('profesional_id', profId)
        .gte('inicio', hoy0.toISOString())
        .lt('inicio', addDays(hoy0, 1).toISOString())
        .in('estado', [...CITA_STATUS_ACTIVOS, CITA_STATUS.COMPLETADA]);
      if (cancelado) return;
      const citasFases: CitaRetraso[] = ((data as any[]) ?? []).map((c) => {
        const clienteRow = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes;
        return { id: c.id, inicio: c.inicio, fin: c.fin, fin_activa: c.fin_activa, fin_espera: c.fin_espera, cliente: clienteRow?.nombre ?? null };
      });
      setHuecosHoy(calcularHuecosHoy(citasFases, Date.now()));
    })();
    return () => { cancelado = true; };
  }, [periodo, resumen?.profesional?.id, resumen?.profesional?.vinculado]);

  const analizarDiaIA = () => {
    setAccionEstadoIA('pendiente');
    const huecosTexto = huecosHoy.length > 0
      ? `Huecos libres REALES detectados hoy (no inventes otros ni cambies estos): ${huecosHoy.map((h) => `${h.minutos} min a las ${fmtHoraHueco(h.inicioMs)}${h.tipo === 'reposo' ? ' (reposo de un servicio en curso)' : ''}`).join('; ')}.`
      : 'Sin huecos libres relevantes detectados hoy.';
    const prompt = `Analiza el día del profesional ${resumen?.profesional.nombre}.
Tiene ${resumen?.citas_completadas} citas en este periodo.
Citas: ${JSON.stringify(resumen?.citas_lista || [])}.
Horas: ${resumen?.horas}.
Comisión estimada: ${(resumen?.comision_cents || 0) / 100}€.
${huecosTexto}
Haz un breve resumen amistoso y motivador (2-3 frases). Si hay huecos libres reales (los de
arriba), sugiere una forma concreta de aprovecharlos (contactar a una clienta que lleva tiempo
sin venir, adelantar una tarea, o simplemente descansar si el día ha sido intenso); si no hay
ninguno, no inventes que los hay.
No propongas crear una cita nueva: no tienes los datos (servicio, profesional, hora)
para proponerla completa, así que no llames a esa herramienta.`;
    ayudaIA.analizar(prompt);
  };

  const bloqueAccionIA = ayudaIA.estado.tipo === 'listo'
    ? ayudaIA.estado.bloques.find((b): b is Extract<Bloque, { tipo: 'accion' }> => b.tipo === 'accion')
    : undefined;

  const confirmarAccionIA = async () => {
    if (!bloqueAccionIA) return;
    setAccionEstadoIA('aplicando');
    const user = await getUserProfile();
    const res = await ejecutarAccion(bloqueAccionIA.accion, user?.id || '');
    if (res.ok) {
      setAccionEstadoIA('aplicada');
    } else {
      setAccionEstadoIA('pendiente');
      setError(res.error);
    }
  };

  const cargar = useCallback(async (per: Periodo) => {
    setLoading(true);
    setError(null);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setLoading(false); return; }
      setUserId(profile.id || '');
      setSalonNombre(profile.nombre_negocio || profile.negocio_id);
      // Con acceso compartido, user_id es el del jefe para todo el mundo: las
      // marcas de cada persona se distinguen por su ficha, no por la cuenta.
      // Todo el estado del fichaje (que marcas hay hoy, cuanto lleva trabajado y
      // si esta dentro, en pausa o fuera) lo da el servidor: asi la hora es la
      // suya y no la del navegador, y las pausas se descuentan igual que en el
      // registro legal.
      const identidadFichajes = identidadActiva(profile.negocio_id);
      setIdentidadRol(identidadFichajes?.rol ?? null);
      setEstadoJornada(await cargarEstadoJornada(identidadFichajes?.profesionalId ?? null));
      const [d, h] = rangoDe(per);
      // En un salon con un solo correo la cuenta es la del jefe, asi que la
      // ficha hay que decirla: es la persona que se identifico en la tablet.
      // El servidor comprueba que sea de este salon antes de hacerle caso.
      const { data, error: rpcErr } = await supabase.rpc('mi_jornada_resumen', {
        p_desde: d.toISOString(),
        p_hasta: h.toISOString(),
        p_profesional_id: identidadActiva(profile.negocio_id)?.profesionalId ?? null,
      });
      if (rpcErr) throw rpcErr;
      setResumen(data as Resumen);
      const { data: objRes } = await supabase.rpc('mis_objetivos_progreso');
      setMisObjetivos(((objRes as any)?.objetivos as MiObjetivo[]) || []);
      const profId = (data as Resumen)?.profesional?.id;
      if (profId) {
        const { data: ausData } = await supabase
          .from('bloqueos_profesional')
          .select('id, inicio, fin, tipo, motivo')
          .eq('profesional_id', profId)
          .in('tipo', ['vacaciones', 'baja', 'formacion', 'ausencia'])
          .gte('fin', new Date(Date.now() - 30 * 86400000).toISOString())
          .order('inicio', { ascending: true })
          .limit(20);
        setAusencias(ausData ?? []);
      }
      
      const hace48h = new Date(Date.now() - 48 * 3600000).toISOString();
      let qRes = supabase.from('resenas').select('id, puntuacion, comentario').eq('negocio_id', profile.negocio_id).gte('created_at', hace48h).order('created_at', { ascending: false }).limit(1);
      const pId = identidadActiva(profile.negocio_id)?.profesionalId;
      if (pId) qRes = qRes.eq('profesional_id', pId);
      const { data: resData } = await qRes;
      if (resData && resData.length > 0 && resData[0].puntuacion >= 4) {
        setNuevaResena(resData[0]);
      } else {
        setNuevaResena(null);
      }
    } catch (err) {
      console.error('Error cargando Mi jornada:', err);
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [periodo, cargar]);

  const cargarIntercambios = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      const [{ data: intRes }, profsRes] = await Promise.all([
        supabase.rpc('listar_intercambios_turno'),
        profesionalesActivos.length === 0
          ? supabase.from('profesionales').select('id, nombre').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre')
          : Promise.resolve({ data: profesionalesActivos as any }),
      ]);
      setIntercambios(((intRes as any)?.intercambios as any[]) || []);
      if (profesionalesActivos.length === 0) setProfesionalesActivos(((profsRes as any).data as ProfesionalMini[]) || []);
    } catch (err) {
      console.error('Error cargando intercambios:', err);
    }
  }, [profesionalesActivos]);
  useEffect(() => { cargarIntercambios(); }, [cargarIntercambios]);

  const abrirNuevoIntercambio = () => {
    const yo = resumen?.profesional.id;
    const otro = profesionalesActivos.find((p) => p.id !== yo)?.id || '';
    setNuevoIntercambio({ companero_id: otro, fecha_solicitante: '', fecha_companero: '', motivo: '' });
    setShowIntercambioModal(true);
  };

  const enviarIntercambio = async () => {
    if (!nuevoIntercambio) return;
    if (!nuevoIntercambio.companero_id || !nuevoIntercambio.fecha_solicitante || !nuevoIntercambio.fecha_companero) return;
    try {
      const { error: rpcErr } = await supabase.rpc('solicitar_intercambio_turno', {
        p_companero_id: nuevoIntercambio.companero_id,
        p_fecha_solicitante: nuevoIntercambio.fecha_solicitante,
        p_fecha_companero: nuevoIntercambio.fecha_companero,
        p_motivo: nuevoIntercambio.motivo || null,
      });
      if (rpcErr) throw rpcErr;
      setShowIntercambioModal(false);
      setNuevoIntercambio(null);
      await cargarIntercambios();
    } catch (err) {
      console.error('Error solicitando intercambio:', err);
      setError(mensajeDeError(err));
    }
  };

  const responderCompanero = async (id: string, aceptar: boolean) => {
    try {
      const { error: rpcErr } = await supabase.rpc('responder_intercambio_companero', { p_id: id, p_aceptar: aceptar, p_nota: null });
      if (rpcErr) throw rpcErr;
      await cargarIntercambios();
    } catch (err) { console.error(err); }
  };
  const responderGestor = async (id: string, aprobar: boolean) => {
    try {
      const { error: rpcErr } = await supabase.rpc('responder_intercambio_gestor', { p_id: id, p_aprobar: aprobar, p_nota: null });
      if (rpcErr) throw rpcErr;
      await cargarIntercambios();
    } catch (err) { console.error(err); }
  };
  const cancelarIntercambio = async (id: string) => {
    if (!window.confirm('¿Cancelar esta solicitud?')) return;
    try {
      const { error: rpcErr } = await supabase.rpc('cancelar_intercambio_turno', { p_id: id });
      if (rpcErr) throw rpcErr;
      await cargarIntercambios();
    } catch (err) { console.error(err); }
  };

  const eliminarAusencia = async (id: string) => {
    try {
      const { error: delErr } = await supabase.from('bloqueos_profesional').delete().eq('id', id);
      if (delErr) throw delErr;
      setAusencias(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const estadoLabel = (estado: string): { label: string; color: string } => {
    if (estado === 'pendiente_companero') return { label: 'Esperando al compañero', color: T.warning };
    if (estado === 'pendiente_gestor') return { label: 'Esperando aprobación del gestor', color: T.warning };
    if (estado === 'aprobado') return { label: 'Aprobado', color: T.success };
    if (estado === 'rechazado') return { label: 'Rechazado', color: T.danger };
    if (estado === 'cancelado') return { label: 'Cancelado', color: T.textTer };
    return { label: estado, color: T.textSec };
  };

  const marcasHoy = estadoJornada?.marcas ?? [];
  const ultimaMarca = marcasHoy[marcasHoy.length - 1];
  const enPausa = estadoJornada?.estado === 'en_pausa';
  const trabajando = estadoJornada?.estado === 'trabajando';
  const fichado = trabajando || enPausa;
  const horasHoy = (estadoJornada?.minutos_hoy ?? 0) / 60;

  // El fichaje va SIEMPRE por la RPC `fichar_jornada`: la hora del asiento la
  // pone el servidor (no el navegador, que se puede trastear), valida que la
  // secuencia tenga sentido y sella el asiento con la cadena de hash. Ver
  // migrations/control-horario-rpcs.sql.
  const fichar = async (tipo: 'entrada' | 'salida' | 'pausa_inicio' | 'pausa_fin') => {
    setFichando(true);
    setError(null);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setFichando(false); return; }
      // El fichaje se apunta a la persona que esta delante del dispositivo. Con
      // un solo correo, user_id es siempre el del jefe: sin profesional_id, las
      // horas de todo el equipo se le acumularian a el.
      const identidad = identidadActiva(profile.negocio_id);
      const res = await ficharJornada(tipo, {
        modalidad,
        profesionalId: identidad?.profesionalId ?? resumen?.profesional?.id ?? null,
      });
      if (!res?.ok) { setError(res?.error || 'No se ha podido registrar el fichaje.'); return; }
      await cargar(periodo);
    } catch (err) {
      console.error('Error fichando:', err);
      setError(mensajeDeError(err));
    } finally {
      setFichando(false);
    }
  };

  if (loading && !resumen) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'mjSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
        Cargando tu jornada...
      </div>
    );
  }

  const nombre = resumen?.profesional.nombre || 'Tu jornada';
  const iniciales = nombre.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  // Con acceso compartido la cuenta es la del jefe, pero delante del dispositivo
  // esta quien se identifico: manda su rol, no el de la cuenta.
  const rolTxt = identidadRol ? roleLabel({ role: identidadRol })
    : resumen?.rol ? roleLabel({ role: resumen.rol }) : '';
  const vinculado = resumen?.profesional.vinculado ?? false;
  const pLabel = PERIODO_LABEL[periodo];
  const verImportes = resumen?.puede_ver_importes;
  const verComision = resumen?.puede_ver_comision;

  return (
    <div style={{ background: T.bg, height: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : '20px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: isMobile ? 16 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: T.primary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {iniciales}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombre}
              </h1>
              <div style={{ fontSize: 13, color: T.textSec }}>Mi jornada{rolTxt ? ` · ${rolTxt}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowManualPanel(true)}
              title="Manual de esta pagina"
              className="btn-interactive"
              style={{ display: 'grid', placeItems: 'center', width: 33, height: 33, borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <button
              onClick={() => setShowAusenciaModal(true)}
              className="btn-interactive"
              style={{ padding: '6px 12px', borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="calendar" size={16} />
              <span style={{ display: isMobile ? 'none' : 'inline' }}>Pedir Ausencia</span>
            </button>
            <AvisosBell mode="header" />
            {/* Antes habia aqui un conmutador "Mi jornada / Equipo". Se ha
                quitado: el ranking del equipo y el control horario de todos
                viven ahora en la pagina de Equipo, y esta pantalla es
                literalmente TU jornada. */}
            <Segmented
              value={periodo}
              onChange={(v) => setPeriodo(v as Periodo)}
              options={[{ value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]}
            />
          </div>
        </div>

        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: isMobile ? 16 : 20 }}>
            <AvisoPrimeraVisita
              content={manualMiJornada}
              isMobile={isMobile}
              onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}

        {nuevaResena && (
          <div style={{ background: 'linear-gradient(135deg, rgba(244,80,30,0.1), rgba(244,80,30,0.02))', border: `1px solid ${T.primary}`, borderRadius: 16, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%', background: T.primary, flexShrink: 0, fontSize: 24 }}>
              ⭐
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>
                ¡Enhorabuena! Tienes una nueva reseña de {nuevaResena.puntuacion} estrellas.
              </div>
              {nuevaResena.comentario && (
                <div style={{ fontSize: 13.5, color: T.textSec, fontStyle: 'italic' }}>
                  "{nuevaResena.comentario}"
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: T.dangerSoft, color: T.danger, fontSize: 14 }}>
            {error}
          </div>
        )}

        {resumen && !vinculado && (
          <div className="mj-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: T.warningSoft, border: `1px solid ${T.warning}33` }}>
            <Icon name="info" size={18} color={T.warning} />
            <div style={{ fontSize: 13, color: T.text }}>
              <b>Tu cuenta no está vinculada a una ficha de profesional.</b> Puedes fichar igualmente, pero para ver tus citas, cobros y rendimiento pídele al responsable que vincule tu cuenta desde <b>Equipo</b>.
            </div>
          </div>
        )}

        <div className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={18} color={fichado ? T.success : T.textTer} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Tu fichaje de hoy</div>
                <div style={{ fontSize: 12, color: T.textSec }}>
                  {enPausa ? 'En pausa' : trabajando ? 'Trabajando — entrada registrada' : 'Fuera de turno'} · {fmtHoras(horasHoy)} hoy
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!fichado && (
                <Segmented
                  value={modalidad}
                  onChange={(v) => setModalidad(v as Modalidad)}
                  options={[{ value: 'presencial', label: 'Presencial' }, { value: 'remoto', label: 'Remoto' }]}
                />
              )}
              {!fichado && (
                <button onClick={() => fichar('entrada')} disabled={fichando} className="btn-interactive" style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.success, color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="clock" size={15} color="#fff" /> {fichando ? '...' : 'Fichar entrada'}
                </button>
              )}
              {trabajando && (
                <button onClick={() => fichar('pausa_inicio')} disabled={fichando} className="btn-interactive" style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.warning}`, background: T.warningSoft, color: T.warning, fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="pause" size={14} color={T.warning} /> Pausa
                </button>
              )}
              {enPausa && (
                <button onClick={() => fichar('pausa_fin')} disabled={fichando} className="btn-interactive" style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: T.success, color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="play" size={14} color="#fff" /> Reanudar
                </button>
              )}
              {fichado && (
                <button onClick={() => fichar('salida')} disabled={fichando} className="btn-interactive" style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.danger, color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="clock" size={15} color="#fff" /> {fichando ? '...' : 'Fichar salida'}
                </button>
              )}
            </div>
          </div>
          {marcasHoy.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {marcasHoy.map((f, i) => {
                const meta = f.tipo === 'entrada' ? { label: 'Entrada', color: T.success }
                  : f.tipo === 'salida' ? { label: 'Salida', color: T.textTer }
                  : f.tipo === 'pausa_inicio' ? { label: 'Pausa', color: T.warning }
                  : { label: 'Reanudar', color: T.success };
                return (
                  <span key={i} style={{ fontSize: 11.5, color: T.textSec, padding: '4px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                    {meta.label} {format(parseISO(f.marcado_at), 'HH:mm', { locale: es })}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="mj-row" style={{ marginBottom: 16 }}>
          {isMobile && !resumenIaOpen ? (
            <button
              onClick={() => setResumenIaOpen(true)}
              className="btn-interactive"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 11, cursor: 'pointer', textAlign: 'left' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.8 5.6L19.5 10.4l-5.7 1.8L12 18l-1.8-5.8L4.5 10.4l5.7-1.8L12 3z" stroke={T.primary} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.text }}>Resumen de tu día</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          ) : (
            <TarjetaAyudaIA
              titulo="Resumen de tu día"
              subtitulo="Descubre oportunidades o huecos libres"
              estado={ayudaIA.estado}
              onAnalizar={analizarDiaIA}
              botonLabel="Analizar mi día"
              mensajeVacio="Chispa no ha encontrado nada que destacar en tu día."
              resumenDeterminista={resumen ? (
                <>
                  {resumenIADeterminista(resumen, periodo)}
                  {huecosHoy.length > 0 && <div style={{ marginTop: 6 }}>{textoHueco(huecosHoy[0])}</div>}
                </>
              ) : null}
              accionEstado={accionEstadoIA}
              onConfirmarAccion={confirmarAccionIA}
              onCancelarAccion={() => setAccionEstadoIA('cancelada')}
            />
          )}
        </div>

        {isMobile && (
          <div style={{ display: 'flex', background: T.bgCard, borderRadius: 10, padding: 4, marginBottom: 16, border: `1px solid ${T.border}` }}>
            <button
              onClick={() => setSubTab('citas')}
              onMouseEnter={(e) => { if (subTab !== 'citas') e.currentTarget.style.background = T.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = subTab === 'citas' ? T.primary : 'transparent'; }}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'citas' ? T.primary : 'transparent',
                color: subTab === 'citas' ? '#fff' : T.textSec,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              Citas
            </button>
            <button
              onClick={() => setSubTab('numeros')}
              onMouseEnter={(e) => { if (subTab !== 'numeros') e.currentTarget.style.background = T.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = subTab === 'numeros' ? T.primary : 'transparent'; }}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'numeros' ? T.primary : 'transparent',
                color: subTab === 'numeros' ? '#fff' : T.textSec,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              Mis números
            </button>
            <button
              onClick={() => setSubTab('ausencias')}
              onMouseEnter={(e) => { if (subTab !== 'ausencias') e.currentTarget.style.background = T.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = subTab === 'ausencias' ? T.primary : 'transparent'; }}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'ausencias' ? T.primary : 'transparent',
                color: subTab === 'ausencias' ? '#fff' : T.textSec,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              Ausencias
            </button>
            <button
              onClick={() => setSubTab('registro')}
              onMouseEnter={(e) => { if (subTab !== 'registro') e.currentTarget.style.background = T.primarySoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = subTab === 'registro' ? T.primary : 'transparent'; }}
              style={{
                flex: 1,
                padding: '8px 4px',
                borderRadius: 8,
                border: 'none',
                background: subTab === 'registro' ? T.primary : 'transparent',
                color: subTab === 'registro' ? '#fff' : T.textSec,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              Registro
            </button>
          </div>
        )}

        {(!isMobile || subTab === 'numeros') && (
          <>
            <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 2px 10px' }}>
              Tu actividad · {pLabel}
            </div>
            {isMobile ? (
              <div style={{ background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden', marginBottom: 18 }}>
                <MetricRow icon="scissors" label="Citas completadas" value={String(resumen?.citas_completadas ?? 0)} sub={pLabel} color={T.primary} />
                <MetricRow icon="drop" label="Tintes / color" value={String(resumen?.tintes ?? 0)} sub="de tus citas" color="#6366f1" />
                <MetricRow icon="clock" label="Horas trabajadas" value={fmtHoras(resumen?.horas ?? 0)} sub={pLabel} color="#e08a00" />
                {verImportes && (
                  <>
                    <MetricRow icon="cash" label="Cobrado" value={eur(resumen?.total_cents)} sub={`${resumen?.cobros_count ?? 0} cobro${(resumen?.cobros_count ?? 0) === 1 ? '' : 's'}`} color={T.success} />
                    <MetricRow icon="star" label="Propinas" value={eur(resumen?.propinas_cents)} sub="incluidas en cobros" color="#d97706" />
                    <MetricRow icon="info" label="Ticket medio" value={eur(resumen?.ticket_medio_cents)} sub="por cobro" color="#0891b2" />
                  </>
                )}
                {verComision && (
                  <MetricRow icon="check" label="Comisión estimada" value={eur(resumen?.comision_cents)} sub="sobre servicios" color={T.primaryHi} />
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: 12, marginBottom: 18 }}>
                <StatBox label="Citas completadas" value={String(resumen?.citas_completadas ?? 0)} sub={pLabel} accent={T.primary} />
                <StatBox label="Tintes / color" value={String(resumen?.tintes ?? 0)} sub="de tus citas" />
                <StatBox label="Horas trabajadas" value={fmtHoras(resumen?.horas ?? 0)} sub={pLabel} />
                {verImportes && (
                  <>
                    <StatBox label="Cobrado" value={eur(resumen?.total_cents)} sub={`${resumen?.cobros_count ?? 0} cobro${(resumen?.cobros_count ?? 0) === 1 ? '' : 's'}`} accent={T.text} />
                    <StatBox label="Propinas" value={eur(resumen?.propinas_cents)} sub="incluidas en cobros" accent={T.success} />
                    <StatBox label="Ticket medio" value={eur(resumen?.ticket_medio_cents)} sub="por cobro" />
                  </>
                )}
                {verComision && (
                  <StatBox label="Comisión estimada" value={eur(resumen?.comision_cents)} sub="sobre servicios" accent={T.primaryHi} />
                )}
              </div>
            )}
          </>
        )}

        {(!isMobile || subTab === 'numeros') && misObjetivos.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 10px' }}>
              <Icon name="star" size={14} color={T.primaryHi} />
              <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Mis objetivos · este mes
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {misObjetivos.map((o) => {
                const pct = Math.min(100, (o.actual / o.objetivo_valor) * 100);
                const done = pct >= 100;
                return (
                  <div key={o.id} className="mj-row" style={{ background: T.bgCard, border: `1px solid ${done ? T.success : T.border}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{METRICA_LABEL[o.metrica]}</div>
                      <div style={{ fontSize: 12, color: done ? T.success : T.textSec, fontWeight: 700 }}>
                        {fmtMetrica(o.metrica, o.actual)} / {fmtMetrica(o.metrica, o.objetivo_valor)}
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: T.bg, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: done ? T.success : T.primary, borderRadius: 999, transition: 'width 0.4s ease' }} />
                    </div>
                    {o.bonus_cents != null && o.bonus_cents > 0 && (
                      <div style={{ fontSize: 11.5, color: done ? T.success : T.textSec, marginTop: 6 }}>
                        Bonus: <b>{eur(o.bonus_cents)}</b>{done ? ' · conseguido' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {(!isMobile || subTab === 'citas') && vinculado && (
          <>
            <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 2px 10px' }}>
              Citas completadas · {pLabel}
            </div>
            {(resumen?.citas_lista?.length ?? 0) === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, color: T.textSec, fontSize: 14 }}>
                <Icon name="calendar" size={36} color={T.textTer} />
                <div style={{ marginTop: 10 }}>No tienes citas completadas {pLabel}.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {resumen!.citas_lista.map((c, idx) => (
                  <div key={idx} className="mj-row" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 16px', background: T.bgCard, borderRadius: 12, border: `1px solid ${T.border}`, animationDelay: `${Math.min(idx, 12) * 0.025}s` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                      {format(parseISO(c.inicio), 'HH:mm', { locale: es })}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.cliente || 'Sin cliente'}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.servicio || 'Servicio'}
                      </div>
                    </div>
                    {c.es_tinte && (
                      <span style={{ fontSize: 11, color: T.primaryHi, background: T.primarySoft, padding: '3px 9px', borderRadius: 999, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="drop" size={12} color={T.primaryHi} /> Color
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(!isMobile || subTab === 'ausencias') && vinculado && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '20px 2px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar" size={14} color={T.primaryHi} />
                <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Mis ausencias
                </div>
              </div>
            </div>
            {ausencias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
                No tienes ausencias registradas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ausencias.map((a) => {
                  const TIPO_COLORS: Record<string, string> = { vacaciones: '#0f9d6b', baja: '#e23b34', formacion: '#6366f1', ausencia: '#e08a00' };
                  const TIPO_LABELS: Record<string, string> = { vacaciones: 'Vacaciones', baja: 'Baja médica', formacion: 'Formación', ausencia: 'Ausencia' };
                  const col = TIPO_COLORS[a.tipo] || T.textSec;
                  const isPast = new Date(a.fin) < new Date();
                  return (
                    <div key={a.id} className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px', opacity: isPast ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>
                          {TIPO_LABELS[a.tipo] || a.tipo}
                        </span>
                        <span style={{ fontSize: 12, color: T.textSec, fontVariantNumeric: 'tabular-nums' }}>
                          {format(parseISO(a.inicio), 'd MMM', { locale: es })} — {format(parseISO(a.fin), 'd MMM yyyy', { locale: es })}
                        </span>
                        {!isPast && (
                          <button onClick={() => eliminarAusencia(a.id)} className="btn-interactive" title="Eliminar" style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                        )}
                      </div>
                      {a.motivo && <div style={{ fontSize: 12, color: T.textSec, marginTop: 6, paddingLeft: 18 }}>{a.motivo}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {(!isMobile || subTab === 'ausencias') && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '20px 2px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="link" size={14} color={T.primaryHi} />
                <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Cambios de turno
                </div>
              </div>
              {vinculado && (
                <button
                  onClick={abrirNuevoIntercambio}
                  disabled={profesionalesActivos.length < 2}
                  className="btn-interactive"
                  style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: profesionalesActivos.length < 2 ? 'not-allowed' : 'pointer' }}
                >
                  + Pedir cambio
                </button>
              )}
            </div>
            {intercambios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
                Sin cambios de turno pendientes.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {intercambios.map((it) => {
                  const est = estadoLabel(it.estado);
                  const fs = format(parseISO(it.fecha_solicitante), 'EEE d MMM', { locale: es });
                  const fc = format(parseISO(it.fecha_companero), 'EEE d MMM', { locale: es });
                  return (
                    <div key={it.id} className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, flex: 1, minWidth: 0 }}>
                          {it.solicitante_nombre} ({fs}) ⇄ {it.companero_nombre} ({fc})
                        </div>
                        <span style={{ fontSize: 11, color: est.color, background: `${est.color}18`, padding: '3px 9px', borderRadius: 999, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {est.label}
                        </span>
                      </div>
                      {it.motivo && <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>{it.motivo}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {it.es_companero && it.estado === 'pendiente_companero' && (
                          <>
                            <button onClick={() => responderCompanero(it.id, true)} className="btn-interactive" style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: T.success, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Acepto el cambio</button>
                            <button onClick={() => responderCompanero(it.id, false)} className="btn-interactive" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
                          </>
                        )}
                        {it.es_gestor && it.estado === 'pendiente_gestor' && (
                          <>
                            <button onClick={() => responderGestor(it.id, true)} className="btn-interactive" style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: T.success, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Aprobar</button>
                            <button onClick={() => responderGestor(it.id, false)} className="btn-interactive" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
                          </>
                        )}
                        {it.es_solicitante && (it.estado === 'pendiente_companero' || it.estado === 'pendiente_gestor') && (
                          <button onClick={() => cancelarIntercambio(it.id)} className="btn-interactive" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancelar solicitud</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Registro de jornada: la persona trabajadora tiene derecho a consultar
            y a obtener copia de sus propios asientos de forma inmediata
            (art. 34.9 ET). No depende de que se lo pida a nadie. */}
        {(!isMobile || subTab === 'registro') && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 8px' }}>
              <Icon name="clock" size={14} color={T.primaryHi} />
              <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Mi registro de jornada
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 12, lineHeight: 1.5, maxWidth: 720 }}>
              Tus entradas, salidas y pausas mes a mes. Puedes descargar tu copia cuando quieras: se conserva
              cuatro años y no se puede borrar. Si falta o sobra una marca, pide una corrección y quedará
              constancia de quién la pidió, cuándo y por qué.
            </div>
            <RegistroJornada
              alcance="propio"
              salon={{ nombre: salonNombre }}
              miProfesionalId={resumen?.profesional?.id ?? null}
              // Al fichar en esta misma pantalla cambia la ultima marca: eso
              // recarga el registro para que la tabla no quede desfasada.
              recargarToken={`${marcasHoy.length}:${ultimaMarca?.marcado_at ?? ''}`}
              isMobile={isMobile}
            />
          </div>
        )}
      </div>

      {showIntercambioModal && nuevoIntercambio && (
        <div
          onClick={() => setShowIntercambioModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,6,4,0.45)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Pedir cambio de turno</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Compañero
                <select
                  className="m-control"
                  value={nuevoIntercambio.companero_id}
                  onChange={(e) => setNuevoIntercambio({ ...nuevoIntercambio, companero_id: e.target.value })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  {profesionalesActivos.filter((p) => p.id !== resumen?.profesional.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                  Tu día
                  <input
                    type="date" min={format(new Date(), 'yyyy-MM-dd')}
                    value={nuevoIntercambio.fecha_solicitante}
                    onChange={(e) => setNuevoIntercambio({ ...nuevoIntercambio, fecha_solicitante: e.target.value })}
                    style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                  />
                </label>
                <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                  Su día
                  <input
                    type="date" min={format(new Date(), 'yyyy-MM-dd')}
                    value={nuevoIntercambio.fecha_companero}
                    onChange={(e) => setNuevoIntercambio({ ...nuevoIntercambio, fecha_companero: e.target.value })}
                    style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                  />
                </label>
              </div>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Motivo (opcional)
                <input
                  type="text" maxLength={200}
                  value={nuevoIntercambio.motivo}
                  onChange={(e) => setNuevoIntercambio({ ...nuevoIntercambio, motivo: e.target.value })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowIntercambioModal(false)} className="btn-interactive" style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={enviarIntercambio} className="btn-interactive" style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {showAusenciaModal && (
        <SolicitudAusenciaModal onClose={() => setShowAusenciaModal(false)} />
      )}

      {showManualPanel && (
        <ManualPanel
          content={manualMiJornada}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

function SolicitudAusenciaModal({ onClose }: { onClose: () => void }) {
  const c = T;
  const [inicio, setInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fin, setFin] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [motivo, setMotivo] = useState('Vacaciones');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!inicio || !fin) { setError('Fechas inválidas'); return; }
    if (new Date(fin) < new Date(inicio)) { setError('La fecha final debe ser posterior a la inicial'); return; }
    setLoading(true);
    try {
      const profile = await getUserProfile();
      if (!profile) throw new Error('No auth');
      const dbMotivo = `[PENDIENTE] ${motivo}${notas ? ' - ' + notas : ''}`;
      const { error: err } = await supabase.from('bloqueos_profesional').insert({
        negocio_id: profile.negocio_id,
        profesional_id: profile.id,
        inicio: `${inicio}T00:00:00`,
        fin: `${fin}T23:59:59`,
        tipo: 'ausencia',
        motivo: dbMotivo
      });
      if (err) throw err;
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error al solicitar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 400, background: c.bgPanel, borderRadius: 16, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, color: c.text }}>Solicitar Ausencia</h2>
        {error && <div style={{ color: T.danger, marginBottom: 12, fontSize: 14 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: c.textSec }}>Inicio</label>
            <STextInput type="date" value={inicio} onChange={setInicio} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: c.textSec }}>Fin</label>
            <STextInput type="date" value={fin} onChange={setFin} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: c.textSec }}>Motivo</label>
          <SSelect value={motivo} onChange={setMotivo} options={[
            { label: 'Vacaciones', value: 'Vacaciones' },
            { label: 'Baja Médica', value: 'Baja Médica' },
            { label: 'Asuntos Propios', value: 'Asuntos Propios' }
          ]} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: c.textSec }}>Notas (opcional)</label>
          <STextInput value={notas} onChange={setNotas} placeholder="Ej. Viaje familiar..." />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: c.textSec, fontWeight: 600, transition: 'background 0.15s ease' }}>Cancelar</button>
          <button onClick={submit} disabled={loading} className="btn-interactive" style={{ padding: '8px 16px', background: c.primary, border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 600 }}>
            {loading ? 'Enviando...' : 'Solicitar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default withClientDataGate(MiJornadaScreen, 'Mi jornada');
