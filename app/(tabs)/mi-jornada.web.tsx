import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, roleLabel } from '@/lib/auth';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { format, parseISO, startOfDay, addDays, startOfWeek, addWeeks, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { Segmented, StatBox } from '@/components/ui/SettingsAtoms';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualMiJornada } from '@/lib/manuals/mi-jornada';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { useChispaSugerencia } from '@/lib/hooks/useChispaSugerencia';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';
import { BloqueRenderer, type AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ejecutarAccion } from '@/lib/chispaOps';

const T = DESIGN_TOKENS;

const ANIM = `
  @keyframes mjFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes mjUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes mjSpin { to { transform: rotate(360deg) } }
  .mj-row { animation: mjUp 0.32s cubic-bezier(0.16,1,0.3,1) both; }
  .mj-btn { transition: all 0.15s ease; cursor: pointer; }
  .mj-btn:hover { filter: brightness(1.05); }
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
  };
  return (
    <span style={{ display: 'inline-flex', color, flexShrink: 0 }} dangerouslySetInnerHTML={{
      __html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`,
    }} />
  );
}

type Periodo = 'hoy' | 'semana' | 'mes';
type Vista = 'personal' | 'equipo';
type Fichaje = { tipo: string; marcado_at: string; user_id: string | null };

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
interface EquipoProfesional {
  id: string;
  nombre: string;
  horas: number;
  citas_completadas: number;
  servicios_top: ServicioTop[];
  reposo_total_min: number;
  reposo_usado_min: number;
  ingresos_cents: number;
  propinas_cents: number;
  cobros_count: number;
  comision_cents: number;
}
type OrdenEquipo = 'ingresos' | 'servicios' | 'horas' | 'productivo';
type MetricaObjetivo = 'ingresos' | 'servicios' | 'horas' | 'productivo';

interface MiObjetivo { id: string; metrica: MetricaObjetivo; objetivo_valor: number; bonus_cents: number | null; actual: number }
interface ObjetivoEquipo extends MiObjetivo { profesional_id: string; profesional_nombre: string }
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

// Horas trabajadas a partir de marcas entrada/salida (sesion abierta cuenta hasta ahora).
function horasDeMarcas(fichajes: Fichaje[]): number {
  const sorted = [...fichajes].sort((a, b) => a.marcado_at.localeCompare(b.marcado_at));
  let total = 0;
  let abierta: number | null = null;
  for (const f of sorted) {
    if (f.tipo === 'entrada') abierta = parseISO(f.marcado_at).getTime();
    else if (f.tipo === 'salida' && abierta != null) { total += (parseISO(f.marcado_at).getTime() - abierta) / 3600000; abierta = null; }
  }
  if (abierta != null) total += (Date.now() - abierta) / 3600000;
  return total;
}

function fmtHoras(h: number): string {
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  if (horas <= 0 && mins <= 0) return '0h';
  if (horas <= 0) return `${mins}m`;
  return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
}

const eur = (cents?: number) => `${((cents || 0) / 100).toFixed(2)}€`;
const fmtPct = (n: number) => `${Math.round(n)}%`;

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
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [userId, setUserId] = useState('');
  const [fichando, setFichando] = useState(false);
  const [subTab, setSubTab] = useState<'citas' | 'numeros' | 'ausencias'>('citas');

  // Vista de equipo (solo propietario/direccion): ranking de profesionales.
  const [vista, setVista] = useState<Vista>('personal');
  const [equipo, setEquipo] = useState<EquipoProfesional[] | null>(null);
  const [loadingEquipo, setLoadingEquipo] = useState(false);
  const [errorEquipo, setErrorEquipo] = useState<string | null>(null);
  const [ordenEquipo, setOrdenEquipo] = useState<OrdenEquipo>('ingresos');

  // Intercambio de turnos: solicitudes visibles + form de nueva.
  const [intercambios, setIntercambios] = useState<any[]>([]);
  const [showIntercambioModal, setShowIntercambioModal] = useState(false);
  const [nuevoIntercambio, setNuevoIntercambio] = useState<{ companero_id: string; fecha_solicitante: string; fecha_companero: string; motivo: string } | null>(null);

  // Objetivos gamificados: los del profesional (vista personal) + los de todo el equipo (vista gestor).
  const [misObjetivos, setMisObjetivos] = useState<MiObjetivo[]>([]);
  const [objetivosEquipo, setObjetivosEquipo] = useState<ObjetivoEquipo[]>([]);
  const [profesionalesActivos, setProfesionalesActivos] = useState<ProfesionalMini[]>([]);
  const [showObjetivoModal, setShowObjetivoModal] = useState(false);
  const [objetivoEnCurso, setObjetivoEnCurso] = useState<{ profesional_id: string; metrica: MetricaObjetivo; objetivo_valor: string; bonus_euros: string } | null>(null);

  // Ausencias
  const [ausencias, setAusencias] = useState<Array<{id: string; inicio: string; fin: string; tipo: string; motivo: string | null}>>([]);
  const [showAusenciaModal, setShowAusenciaModal] = useState(false);
  const [nuevaAusencia, setNuevaAusencia] = useState<{tipo: string; inicio: string; fin: string; motivo: string}>({ tipo: 'vacaciones', inicio: '', fin: '', motivo: '' });
  const [guardandoAusencia, setGuardandoAusencia] = useState(false);

  // Sesión 9-A: Chispa Mi Jornada
  const [textoIA, setTextoIA] = useState('');
  const [bloqueIA, setBloqueIA] = useState<Bloque | null>(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [accionEstadoIA, setAccionEstadoIA] = useState<AccionEstado>('pendiente');

  const analizarDiaIA = async () => {
    setCargandoIA(true);
    setTextoIA('');
    setBloqueIA(null);
    setAccionEstadoIA('pendiente');
    try {
      const prompt = `Analiza el día del profesional ${resumen?.profesional.nombre}.
Tiene ${resumen?.citas_completadas} citas en este periodo.
Citas: ${JSON.stringify(resumen?.citas_lista || [])}.
Horas: ${resumen?.horas}.
Comisión estimada: ${(resumen?.comision_cents || 0) / 100}€.
Haz un breve resumen amistoso y motivador. Si ves que tiene huecos o pocas citas, sugiérele proponer citas y añade un bloque de acción 'crear_cita' o algo similar.`;
      const { data, error: err } = await supabase.functions.invoke('agenda-asistente', {
        body: { mensajes: [{ role: 'user', content: prompt }] },
      });
      if (!err && data) {
        const bloques = normalizarRespuesta(data);
        const text = bloques.filter(b => b.tipo === 'texto').map(b => (b as Extract<Bloque, { tipo: 'texto' }>).texto).join('\n\n');
        setTextoIA(text);
        const accion = bloques.find(b => b.tipo === 'accion');
        if (accion) setBloqueIA(accion);
      }
    } finally {
      setCargandoIA(false);
    }
  };

  const confirmarAccionIA = async () => {
    if (!bloqueIA || bloqueIA.tipo !== 'accion') return;
    setAccionEstadoIA('aplicando');
    const user = await getUserProfile();
    const res = await ejecutarAccion(bloqueIA.accion, user?.id || '');
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

      // Fichajes de HOY del usuario (para la tarjeta de fichaje, siempre visible).
      const hoy0 = startOfDay(new Date());
      const { data: fchs } = await supabase
        .from('fichajes')
        .select('tipo, marcado_at, user_id')
        .eq('negocio_id', profile.negocio_id)
        .eq('user_id', profile.id)
        .gte('marcado_at', hoy0.toISOString())
        .lt('marcado_at', addDays(hoy0, 1).toISOString())
        .order('marcado_at', { ascending: true });
      setFichajesHoy((fchs as Fichaje[]) || []);

      // Resumen del periodo (RPC con gate server-side de dinero/comision).
      const [d, h] = rangoDe(per);
      const { data, error: rpcErr } = await supabase.rpc('mi_jornada_resumen', {
        p_desde: d.toISOString(),
        p_hasta: h.toISOString(),
      });
      if (rpcErr) throw rpcErr;
      setResumen(data as Resumen);

      // Mis objetivos (siempre; el RPC devuelve [] si no eres profesional).
      const { data: objRes } = await supabase.rpc('mis_objetivos_progreso');
      setMisObjetivos(((objRes as any)?.objetivos as MiObjetivo[]) || []);

      // Mis ausencias (próximas y recientes)
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
    } catch (err) {
      console.error('Error cargando Mi jornada:', err);
      setError(mensajeDeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(periodo); }, [periodo, cargar]);

  const esGestor = resumen?.rol === 'owner' || resumen?.rol === 'admin';

  const cargarEquipo = useCallback(async (per: Periodo) => {
    setLoadingEquipo(true);
    setErrorEquipo(null);
    try {
      const [d, h] = rangoDe(per);
      const { data, error: rpcErr } = await supabase.rpc('equipo_jornada_ranking', {
        p_desde: d.toISOString(),
        p_hasta: h.toISOString(),
      });
      if (rpcErr) throw rpcErr;
      setEquipo(((data as any)?.profesionales as EquipoProfesional[]) || []);
    } catch (err) {
      console.error('Error cargando el equipo:', err);
      setErrorEquipo(mensajeDeError(err));
    } finally {
      setLoadingEquipo(false);
    }
  }, []);

  useEffect(() => {
    if (vista === 'equipo' && esGestor) cargarEquipo(periodo);
  }, [vista, periodo, esGestor, cargarEquipo]);

  // Objetivos del equipo + lista de profesionales activos (solo gestores, vista Equipo).
  const cargarObjetivosEquipo = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      const [{ data: objRes }, { data: profs }] = await Promise.all([
        supabase.rpc('objetivos_negocio_progreso'),
        supabase.from('profesionales').select('id, nombre').eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre'),
      ]);
      setObjetivosEquipo(((objRes as any)?.objetivos as ObjetivoEquipo[]) || []);
      setProfesionalesActivos((profs as ProfesionalMini[]) || []);
    } catch (err) {
      console.error('Error cargando objetivos del equipo:', err);
    }
  }, []);
  useEffect(() => {
    if (vista === 'equipo' && esGestor) cargarObjetivosEquipo();
  }, [vista, esGestor, cargarObjetivosEquipo]);

  // Intercambio de turnos: visible siempre (todo el equipo lo ve — bitacora compartida).
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

  const guardarAusencia = async () => {
    if (!nuevaAusencia.inicio || !nuevaAusencia.fin) return;
    setGuardandoAusencia(true);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id || !resumen?.profesional?.id) throw new Error('No vinculado');
      const { error: insErr } = await supabase.from('bloqueos_profesional').insert({
        negocio_id: profile.negocio_id,
        profesional_id: resumen.profesional.id,
        inicio: new Date(nuevaAusencia.inicio).toISOString(),
        fin: new Date(nuevaAusencia.fin + 'T23:59:59').toISOString(),
        tipo: nuevaAusencia.tipo,
        motivo: nuevaAusencia.motivo || null,
      });
      if (insErr) throw insErr;
      setShowAusenciaModal(false);
      setNuevaAusencia({ tipo: 'vacaciones', inicio: '', fin: '', motivo: '' });
      cargar(periodo);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardandoAusencia(false);
    }
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

  const abrirNuevoObjetivo = () => {
    setObjetivoEnCurso({
      profesional_id: profesionalesActivos[0]?.id || '',
      metrica: 'ingresos',
      objetivo_valor: '',
      bonus_euros: '',
    });
    setShowObjetivoModal(true);
  };

  const guardarObjetivo = async () => {
    if (!objetivoEnCurso) return;
    const valor = parseFloat(objetivoEnCurso.objetivo_valor);
    if (!objetivoEnCurso.profesional_id || !valor || valor <= 0) return;
    const bonusEuros = parseFloat(objetivoEnCurso.bonus_euros);
    const bonusCents = !isNaN(bonusEuros) && bonusEuros > 0 ? Math.round(bonusEuros * 100) : null;
    try {
      const { error: rpcErr } = await supabase.rpc('guardar_objetivo_profesional', {
        p_profesional_id: objetivoEnCurso.profesional_id,
        p_metrica: objetivoEnCurso.metrica,
        p_objetivo_valor: valor,
        p_bonus_cents: bonusCents,
      });
      if (rpcErr) throw rpcErr;
      setShowObjetivoModal(false);
      setObjetivoEnCurso(null);
      await cargarObjetivosEquipo();
    } catch (err) {
      console.error('Error guardando objetivo:', err);
      setError(mensajeDeError(err));
    }
  };

  const eliminarObjetivoEquipo = async (id: string) => {
    if (!window.confirm('¿Eliminar este objetivo?')) return;
    try {
      const { error: rpcErr } = await supabase.rpc('eliminar_objetivo_profesional', { p_id: id });
      if (rpcErr) throw rpcErr;
      await cargarObjetivosEquipo();
    } catch (err) {
      console.error('Error eliminando objetivo:', err);
    }
  };

  const equipoOrdenado = useMemo(() => {
    if (!equipo) return [];
    const arr = [...equipo];
    if (ordenEquipo === 'ingresos') arr.sort((a, b) => b.ingresos_cents - a.ingresos_cents);
    else if (ordenEquipo === 'servicios') arr.sort((a, b) => b.citas_completadas - a.citas_completadas);
    else if (ordenEquipo === 'horas') arr.sort((a, b) => b.horas - a.horas);
    else arr.sort((a, b) => {
      const pa = a.reposo_total_min > 0 ? a.reposo_usado_min / a.reposo_total_min : -1;
      const pb = b.reposo_total_min > 0 ? b.reposo_usado_min / b.reposo_total_min : -1;
      return pb - pa;
    });
    return arr;
  }, [equipo, ordenEquipo]);

  const ultimaMarca = useMemo(() => {
    const sorted = [...fichajesHoy].sort((a, b) => a.marcado_at.localeCompare(b.marcado_at));
    return sorted[sorted.length - 1];
  }, [fichajesHoy]);
  const fichado = ultimaMarca?.tipo === 'entrada';
  const horasHoy = useMemo(() => horasDeMarcas(fichajesHoy), [fichajesHoy]);

  const fichar = async () => {
    setFichando(true);
    setError(null);
    try {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setFichando(false); return; }
      const tipo = fichado ? 'salida' : 'entrada';
      const { error: insErr } = await supabase.from('fichajes').insert({
        negocio_id: profile.negocio_id,
        user_id: profile.id,
        tipo,
      });
      if (insErr) throw insErr;
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
  const rolTxt = resumen?.rol ? roleLabel({ role: resumen.rol }) : '';
  const vinculado = resumen?.profesional.vinculado ?? false;
  const pLabel = PERIODO_LABEL[periodo];
  const verImportes = resumen?.puede_ver_importes;
  const verComision = resumen?.puede_ver_comision;

  return (
    <div style={{ background: T.bg, height: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{ANIM}</style>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '16px 14px 96px' : '20px' }}>

        {/* Cabecera: identidad + selector de periodo */}
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
              style={{ display: 'grid', placeItems: 'center', width: 33, height: 33, borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <AvisosBell mode="header" />
            {esGestor && (
              <Segmented
                value={vista}
                onChange={(v) => setVista(v as Vista)}
                options={[{ value: 'personal', label: 'Mi jornada' }, { value: 'equipo', label: 'Equipo' }]}
              />
            )}
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

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: T.dangerSoft, color: T.danger, fontSize: 14 }}>
            {error}
          </div>
        )}

        {vista === 'equipo' && esGestor ? (
          <>
            {errorEquipo && (
              <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 16, background: T.dangerSoft, color: T.danger, fontSize: 14 }}>
                {errorEquipo}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '4px 2px 10px' }}>
              <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Ranking del equipo · {pLabel}
              </div>
              <Segmented
                value={ordenEquipo}
                onChange={(v) => setOrdenEquipo(v as OrdenEquipo)}
                options={[
                  { value: 'ingresos', label: 'Dinero' },
                  { value: 'servicios', label: 'Servicios' },
                  { value: 'horas', label: 'Horas' },
                  { value: 'productivo', label: 'Productivo' },
                ]}
              />
            </div>

            {loadingEquipo && !equipo ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>
                <div style={{ width: 28, height: 28, border: '3px solid #e0e0e0', borderTopColor: T.primary, borderRadius: '50%', animation: 'mjSpin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Cargando el equipo...
              </div>
            ) : equipoOrdenado.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, color: T.textSec, fontSize: 14 }}>
                <Icon name="calendar" size={36} color={T.textTer} />
                <div style={{ marginTop: 10 }}>No hay profesionales activos con actividad {pLabel}.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {equipoOrdenado.map((p, idx) => {
                  const pct = p.reposo_total_min > 0 ? (p.reposo_usado_min / p.reposo_total_min) * 100 : null;
                  const inic = p.nombre.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  return (
                    <div key={p.id} className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? 14 : 16, animationDelay: `${Math.min(idx, 10) * 0.03}s` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 20, textAlign: 'center', fontSize: 13, fontWeight: 700, color: T.textTer }}>{idx + 1}</div>
                        <div style={{ width: 36, height: 36, borderRadius: 999, background: T.primary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                          {inic}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                          <div style={{ fontSize: 12, color: T.textSec }}>
                            {fmtHoras(p.horas)} trabajadas · {p.citas_completadas} servicio{p.citas_completadas === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{eur(p.ingresos_cents)}</div>
                          {p.comision_cents > 0 && <div style={{ fontSize: 11, color: T.primaryHi }}>{eur(p.comision_cents)} comisión</div>}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Servicios más realizados</div>
                          {p.servicios_top.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.textTer }}>Sin servicios en este periodo</div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {p.servicios_top.map((s, i) => (
                                <span key={i} style={{ fontSize: 11.5, color: T.text, padding: '4px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.border}` }}>
                                  {s.nombre} <b style={{ color: T.textSec }}>×{s.count}</b>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
                            Tiempo de reposo (tintes/mechas)
                          </div>
                          {pct === null ? (
                            <div style={{ fontSize: 12, color: T.textTer }}>Sin tiempos de reposo</div>
                          ) : (
                            <>
                              <div style={{ height: 6, borderRadius: 999, background: T.bg, overflow: 'hidden', marginBottom: 4 }}>
                                <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 50 ? T.success : T.warning, borderRadius: 999 }} />
                              </div>
                              <div style={{ fontSize: 11.5, color: T.textSec }}>
                                <b style={{ color: T.text }}>{fmtPct(pct)}</b> productivo · {Math.round(p.reposo_usado_min)} de {Math.round(p.reposo_total_min)} min aprovechados
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Objetivos gamificados del equipo (mensuales). Gestor los fija; se ven aqui + en Mi jornada de cada uno. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '20px 2px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="star" size={14} color={T.primaryHi} />
                <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Objetivos del equipo · este mes
                </div>
              </div>
              <button
                onClick={abrirNuevoObjetivo}
                disabled={profesionalesActivos.length === 0}
                className="mj-btn"
                style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: profesionalesActivos.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                + Nuevo objetivo
              </button>
            </div>
            {objetivosEquipo.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
                Aún no hay objetivos. Fija uno por profesional (dinero, servicios, horas o % de reposo aprovechado) y verán su progreso en su "Mi jornada". Motiva y ayuda a retener talento.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {objetivosEquipo.map((o) => {
                  const pct = Math.min(100, (o.actual / o.objetivo_valor) * 100);
                  const done = pct >= 100;
                  return (
                    <div key={o.id} className="mj-row" style={{ background: T.bgCard, border: `1px solid ${done ? T.success : T.border}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.profesional_nombre} · {METRICA_LABEL[o.metrica]}
                        </div>
                        <div style={{ fontSize: 12, color: done ? T.success : T.textSec, fontWeight: 700 }}>
                          {fmtMetrica(o.metrica, o.actual)} / {fmtMetrica(o.metrica, o.objetivo_valor)}
                        </div>
                        <button onClick={() => eliminarObjetivoEquipo(o.id)} className="mj-btn" title="Eliminar objetivo" style={{ background: 'transparent', border: 'none', color: T.textTer, fontSize: 18, cursor: 'pointer', padding: '0 6px' }}>×</button>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: T.bg, overflow: 'hidden' }}>
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
            )}
          </>
        ) : (
        <>
        {/* Aviso si la cuenta no esta vinculada a una ficha de profesional */}
        {resumen && !vinculado && (
          <div className="mj-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, marginBottom: 16, background: T.warningSoft, border: `1px solid ${T.warning}33` }}>
            <Icon name="info" size={18} color={T.warning} />
            <div style={{ fontSize: 13, color: T.text }}>
              <b>Tu cuenta no está vinculada a una ficha de profesional.</b> Puedes fichar igualmente, pero para ver tus citas, cobros y rendimiento pídele al responsable que vincule tu cuenta desde <b>Equipo</b>.
            </div>
          </div>
        )}

        {/* Tarjeta de fichaje (siempre, hoy) */}
        <div className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.borderHi}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="clock" size={18} color={fichado ? T.success : T.textTer} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Tu fichaje de hoy</div>
                <div style={{ fontSize: 12, color: T.textSec }}>
                  {fichado ? 'Trabajando — entrada registrada' : 'Fuera de turno'} · {fmtHoras(horasHoy)} hoy
                </div>
              </div>
            </div>
            <button onClick={fichar} disabled={fichando} className="mj-btn" style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: fichado ? T.danger : T.success, color: '#fff', fontSize: 14, fontWeight: 700, cursor: fichando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={15} color="#fff" /> {fichando ? '...' : (fichado ? 'Fichar salida' : 'Fichar entrada')}
            </button>
          </div>
          {fichajesHoy.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {fichajesHoy.map((f, i) => (
                <span key={i} style={{ fontSize: 11.5, color: T.textSec, padding: '4px 9px', borderRadius: 999, background: T.bg, border: `1px solid ${T.border}`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: f.tipo === 'entrada' ? T.success : T.textTer }} />
                  {f.tipo === 'entrada' ? 'Entrada' : 'Salida'} {format(parseISO(f.marcado_at), 'HH:mm', { locale: es })}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Analisis IA */}
        <div className="mj-row" style={{ background: T.bgCard, border: `1px solid ${T.primary}40`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Resumen IA de tu día</div>
                <div style={{ fontSize: 12, color: T.textSec }}>Descubre oportunidades o huecos libres</div>
              </div>
            </div>
            <button onClick={analizarDiaIA} disabled={cargandoIA} className="mj-btn" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: T.primarySoft, color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: cargandoIA ? 'not-allowed' : 'pointer' }}>
              {cargandoIA ? 'Analizando...' : 'Analizar mi día'}
            </button>
          </div>
          {textoIA && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {textoIA}
            </div>
          )}
          {bloqueIA && (
            <div style={{ marginTop: 12 }}>
              <BloqueRenderer 
                bloque={bloqueIA} 
                accionEstado={accionEstadoIA} 
                onConfirmar={confirmarAccionIA} 
                onCancelar={() => setBloqueIA(null)} 
              />
            </div>
          )}
        </div>

        {/* Selector de SubTabs en Móvil */}
        {isMobile && (
          <div style={{ display: 'flex', background: T.bgCard, borderRadius: 10, padding: 4, marginBottom: 16, border: `1px solid ${T.border}` }}>
            <button
              onClick={() => setSubTab('citas')}
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
          </div>
        )}

        {/* Metricas del periodo */}
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

        {/* Mis objetivos del mes (progreso) */}
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

        {/* Lista de citas completadas del periodo */}
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

        {/* Mis ausencias */}
        {(!isMobile || subTab === 'ausencias') && vinculado && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '20px 2px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar" size={14} color={T.primaryHi} />
                <div style={{ fontSize: 11, color: T.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Mis ausencias
                </div>
              </div>
              <button
                onClick={() => setShowAusenciaModal(true)}
                className="mj-btn"
                style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                + Registrar ausencia
              </button>
            </div>
            {ausencias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
                No tienes ausencias registradas. Cuando necesites vacaciones, baja médica o formación, regístralas aquí.
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
                          <button onClick={() => eliminarAusencia(a.id)} className="mj-btn" title="Eliminar" style={{ background: 'none', border: 'none', color: T.textTer, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
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

        {/* Intercambio de turnos */}
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
                  className="mj-btn"
                  style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.primary}`, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: profesionalesActivos.length < 2 ? 'not-allowed' : 'pointer' }}
                >
                  + Pedir cambio
                </button>
              )}
            </div>
            {intercambios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 20px', background: T.bgCard, borderRadius: 12, border: `1px dashed ${T.border}`, color: T.textSec, fontSize: 13 }}>
                Sin cambios de turno pendientes. Cuando pidas uno queda registrado aquí para que el compañero y el gestor lo revisen.
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
                            <button onClick={() => responderCompanero(it.id, true)} className="mj-btn" style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: T.success, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Acepto el cambio</button>
                            <button onClick={() => responderCompanero(it.id, false)} className="mj-btn" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
                          </>
                        )}
                        {it.es_gestor && it.estado === 'pendiente_gestor' && (
                          <>
                            <button onClick={() => responderGestor(it.id, true)} className="mj-btn" style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: T.success, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Aprobar</button>
                            <button onClick={() => responderGestor(it.id, false)} className="mj-btn" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Rechazar</button>
                          </>
                        )}
                        {it.es_solicitante && (it.estado === 'pendiente_companero' || it.estado === 'pendiente_gestor') && (
                          <button onClick={() => cancelarIntercambio(it.id)} className="mj-btn" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancelar solicitud</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      {/* Modal: nuevo objetivo (gestor). Formulario minimo: profesional, metrica, valor, bonus opcional. */}
      {showObjetivoModal && objetivoEnCurso && (
        <div
          onClick={() => setShowObjetivoModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,6,4,0.45)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>Nuevo objetivo</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Profesional
                <select
                  value={objetivoEnCurso.profesional_id}
                  onChange={(e) => setObjetivoEnCurso({ ...objetivoEnCurso, profesional_id: e.target.value })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  {profesionalesActivos.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                </select>
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Métrica
                <select
                  value={objetivoEnCurso.metrica}
                  onChange={(e) => setObjetivoEnCurso({ ...objetivoEnCurso, metrica: e.target.value as MetricaObjetivo })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  <option value="ingresos">Dinero generado (€)</option>
                  <option value="servicios">Servicios completados</option>
                  <option value="horas">Horas trabajadas</option>
                  <option value="productivo">% de reposo aprovechado</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Objetivo del mes ({METRICA_SUFIJO[objetivoEnCurso.metrica] || 'unidades'})
                <input
                  type="number" min="1" step="1"
                  value={objetivoEnCurso.objetivo_valor}
                  onChange={(e) => setObjetivoEnCurso({ ...objetivoEnCurso, objetivo_valor: e.target.value })}
                  placeholder={objetivoEnCurso.metrica === 'ingresos' ? '3000' : objetivoEnCurso.metrica === 'servicios' ? '80' : objetivoEnCurso.metrica === 'horas' ? '160' : '70'}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Bonus al alcanzarlo (€, opcional)
                <input
                  type="number" min="0" step="1"
                  value={objetivoEnCurso.bonus_euros}
                  onChange={(e) => setObjetivoEnCurso({ ...objetivoEnCurso, bonus_euros: e.target.value })}
                  placeholder="100"
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowObjetivoModal(false)} className="mj-btn" style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarObjetivo} className="mj-btn" style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: pedir cambio de turno (profesional). */}
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
            <div style={{ fontSize: 12.5, color: T.textSec, marginBottom: 14 }}>
              Propones cambiar tu día por el de un compañero. Él acepta y luego lo aprueba el gestor.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Compañero
                <select
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
                  placeholder="Cita médica, viaje familiar..."
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowIntercambioModal(false)} className="mj-btn" style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={enviarIntercambio} className="mj-btn" style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: registrar ausencia */}
      {showAusenciaModal && (
        <div
          onClick={() => setShowAusenciaModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,6,4,0.45)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: T.bgCard, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>Registrar ausencia</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Tipo
                <select
                  value={nuevaAusencia.tipo}
                  onChange={(e) => setNuevaAusencia({ ...nuevaAusencia, tipo: e.target.value })}
                  style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
                >
                  <option value="vacaciones">Vacaciones</option>
                  <option value="baja">Baja médica</option>
                  <option value="formacion">Formación</option>
                  <option value="ausencia">Ausencia personal</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                  Desde
                  <input type="date" value={nuevaAusencia.inicio} onChange={(e) => setNuevaAusencia({ ...nuevaAusencia, inicio: e.target.value })} style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                  Hasta
                  <input type="date" value={nuevaAusencia.fin} onChange={(e) => setNuevaAusencia({ ...nuevaAusencia, fin: e.target.value })} style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
                </label>
              </div>
              <label style={{ fontSize: 12, color: T.textSec, fontWeight: 600 }}>
                Motivo (opcional)
                <input type="text" value={nuevaAusencia.motivo} onChange={(e) => setNuevaAusencia({ ...nuevaAusencia, motivo: e.target.value })} placeholder="Ej: Cita médica, viaje personal..." style={{ marginTop: 6, width: '100%', padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <button
                onClick={guardarAusencia}
                disabled={guardandoAusencia || !nuevaAusencia.inicio || !nuevaAusencia.fin}
                className="mj-btn"
                style={{ padding: '11px 16px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: guardandoAusencia ? 'not-allowed' : 'pointer', opacity: (!nuevaAusencia.inicio || !nuevaAusencia.fin) ? 0.5 : 1 }}
              >
                {guardandoAusencia ? 'Guardando...' : 'Registrar ausencia'}
              </button>
            </div>
          </div>
        </div>
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

export default withClientDataGate(MiJornadaScreen, 'Mi jornada');
