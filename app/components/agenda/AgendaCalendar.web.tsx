import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { TimeDrumPicker } from '@/components/ui/Pickers';
import { useCalendarRefresh } from '@/lib/calendarContext';
import { syncAlergiasACliente } from '@/lib/syncAlergias';
import { DESIGN_TOKENS as TOKENS } from '@/lib/designTokens';
import {
  NEGOCIO_ID_FALLBACK,
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  INTERVALO_MINUTOS,
  CITA_CARD_DETAILS_MIN_HEIGHT,
  CITA_STATUS,
  LOCALE,
  OCUPACION_MAX_PER_MES,
} from '@/lib/constants';
import { isTimeSlotOccupied } from '@/lib/utils/appointment';

const ANIMATIONS = `
  input::placeholder, textarea::placeholder {
    color: var(--color-text-tertiary) !important;
  }
  input, select, textarea {
    background-color: var(--color-bg-card) !important;
    color: var(--color-text) !important;
  }
  input:disabled, textarea:disabled {
    color: var(--color-text-muted) !important;
  }
  option {
    background-color: var(--color-bg-card) !important;
    color: var(--color-text) !important;
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 8px rgba(99,102,241,0.3); }
    50% { box-shadow: 0 0 16px rgba(99,102,241,0.6); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }
  @keyframes bounce {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

interface Cita {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
  estado: string;
  profesional_id: string;
  servicio_id?: string;
  cliente_id?: string;
  profesionales?: { nombre: string; color: string };
  servicios?: { nombre: string };
  clientes?: { nombre: string };
}

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  rol?: string;
}

// Normalizar texto: quitar tildes y pasar a minusculas para busquedas sin discriminar acentos
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Generar slots de tiempo dinámicamente
const generarSlotsHorarios = () => {
  const slots: string[] = [];
  let h = HORARIO_APERTURA.horas;
  let m = HORARIO_APERTURA.minutos;

  while (h < HORARIO_CIERRE.horas || (h === HORARIO_CIERRE.horas && m < HORARIO_CIERRE.minutos)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += INTERVALO_MINUTOS;
    if (m >= 60) {
      m -= 60;
      h += 1;
    }
  }
  return slots;
};

// Iconos SVG simples
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    bell: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevronLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
    chevronRight: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

export default function AgendaCalendar() {
  const { refreshTrigger } = useCalendarRefresh();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [selectedProf, setSelectedProf] = useState('todos');
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth()));
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [loading, setLoading] = useState(true);
  const [showNewCita, setShowNewCita] = useState(false);
  const [showEditCita, setShowEditCita] = useState(false);
  const [selectedCitaEdit, setSelectedCitaEdit] = useState<any>(null);
  const [notifications, setNotifications] = useState(0);
  const [bloqueos, setBloqueos] = useState<any[]>([]);
  const [citaAddonsMap, setCitaAddonsMap] = useState<Record<string, any[]>>({});
  const [citasVencidas, setCitasVencidas] = useState<Cita[]>([]);
  const [showRetrasoProf, setShowRetrasoProf] = useState<string | null>(null);
  const [showClientaTarde, setShowClientaTarde] = useState<Cita | null>(null);
  const [showCierreSalon, setShowCierreSalon] = useState(false);
  const [cierreLoading, setCierreLoading] = useState(false);
  // Fase 8: filtros, buscador, vistas
  const [filterServicio, setFilterServicio] = useState('todos');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showClienteHistorial, setShowClienteHistorial] = useState<any>(null);
  const [dropServicioOpen, setDropServicioOpen] = useState(false);
  const [dropEstadoOpen, setDropEstadoOpen] = useState(false);

  useEffect(() => {
    async function cargar() {
      try {
        let negocioId = NEGOCIO_ID_FALLBACK;
        const profile = await getUserProfile();
        if (profile?.negocio_id) {
          negocioId = profile.negocio_id;
        }

        const [profResult, citaResult, srvResult, cltResult, bloqueoResult, addonsResult] = await Promise.all([
          supabase.from('profesionales').select('id, nombre, color, activo').eq('negocio_id', negocioId),
          supabase
            .from('citas')
            .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id, notas, confirmada_cliente, confirmada_at, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas, oculta_en_calendario, grupo_id, orden_en_grupo')
            .eq('negocio_id', negocioId)
            .eq('oculta_en_calendario', false),
          supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min').eq('negocio_id', negocioId),
          supabase.from('clientes').select('id, nombre, telefono, alergias').eq('negocio_id', negocioId),
          supabase.from('bloqueos_profesional').select('*').eq('negocio_id', negocioId),
          supabase.from('cita_addons').select('cita_id, service_addons(nombre)'),
        ]);

        if (profResult.error) console.error('Prof error:', profResult.error);
        if (citaResult.error) console.error('Cita error:', citaResult.error);
        console.log('Prof data:', profResult.data);
        console.log('Cita data:', citaResult.data);

        setProfesionales(profResult.data ?? []);
        setCitas(citaResult.data ?? []);
        setServicios(srvResult.data ?? []);
        setClientes(cltResult.data ?? []);
        setBloqueos(bloqueoResult.data ?? []);
        const addonMap: Record<string, any[]> = {};
        for (const row of (addonsResult.data ?? [])) {
          if (!addonMap[row.cita_id]) addonMap[row.cita_id] = [];
          addonMap[row.cita_id].push(row);
        }
        setCitaAddonsMap(addonMap);
        setNotifications(0);
        setLoading(false);
      } catch (error) {
        console.error('Error cargando datos:', error);
        setLoading(false);
      }
    }
    cargar();
  }, [refreshTrigger]);

  useEffect(() => {
    function checkVencidas() {
      const ahora = new Date();
      const hoyStr = ahora.toDateString();
      const vencidas = citas.filter((c) => {
        if (c.estado !== 'confirmada') return false;
        const inicio = new Date(c.inicio);
        return inicio < ahora && inicio.toDateString() === hoyStr;
      });
      setCitasVencidas(vencidas);
    }
    checkVencidas();
    const interval = setInterval(checkVencidas, 60000);
    return () => clearInterval(interval);
  }, [citas]);

  async function registrarHistorial(citaId: string, negocioId: string, cambios: { campo: string; anterior: string; nuevo: string }[], motivo?: string) {
    const rows = cambios.map((c) => ({
      cita_id: citaId,
      negocio_id: negocioId,
      campo: c.campo,
      valor_anterior: c.anterior,
      valor_nuevo: c.nuevo,
      motivo: motivo || null,
    }));
    if (rows.length > 0) await supabase.from('citas_historial').insert(rows);
  }

  async function cierreMasivoSalon() {
    setCierreLoading(true);
    const profile = await getUserProfile();
    const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    const citasACancelar = citasHoy.filter((c) => c.estado === CITA_STATUS.CONFIRMADA);
    for (const c of citasACancelar) {
      await supabase.from('citas').update({ estado: CITA_STATUS.CANCELADA }).eq('id', c.id);
      await registrarHistorial(c.id, negocioId, [
        { campo: 'estado', anterior: CITA_STATUS.CONFIRMADA, nuevo: CITA_STATUS.CANCELADA },
      ], 'Cierre inesperado del salon');
    }
    setCitas((prev) => prev.map((c) =>
      citasACancelar.some((ca) => ca.id === c.id) ? { ...c, estado: CITA_STATUS.CANCELADA } : c
    ));
    setCierreLoading(false);
    setShowCierreSalon(false);
  }

  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellsArray: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cellsArray.push(null);
    for (let d = 1; d <= daysInMonth; d++) cellsArray.push(d);
    while (cellsArray.length % 7) cellsArray.push(null);
    return cellsArray;
  }, [year, month]);

  const counts = useMemo(() => {
    const countsMap: Record<number, number> = {};
    citas.forEach((cita) => {
      const citaDate = new Date(cita.inicio);
      if (citaDate.getMonth() === month && citaDate.getFullYear() === year) {
        const day = citaDate.getDate();
        countsMap[day] = (countsMap[day] || 0) + 1;
      }
    });
    return countsMap;
  }, [citas, month, year]);

  const selectedDateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), selectedDate);

  const citasHoy = useMemo(() => {
    return citas.filter((c) => {
      const citaDate = new Date(c.inicio);
      return citaDate.toDateString() === selectedDateObj.toDateString();
    });
  }, [citas, selectedDate, currentMonth]);

  const visibleProfs = useMemo(() => profesionales.filter((p) => p.activo), [profesionales]);

  const filtered = useMemo(() => {
    let result = selectedProf === 'todos' ? citasHoy : citasHoy.filter((c) => c.profesional_id === selectedProf);
    if (filterServicio !== 'todos') result = result.filter((c) => c.servicio_id === filterServicio);
    if (filterEstado !== 'todos') result = result.filter((c) => c.estado === filterEstado);
    return result;
  }, [citasHoy, selectedProf, filterServicio, filterEstado]);

  const totalCitasHoy = citasHoy.length;

  // 8.4: buscador global
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = norm(searchQuery);
    return citas.filter((c) => {
      const cli = clientes.find((cl: any) => cl.id === c.cliente_id);
      const srv = servicios.find((s: any) => s.id === c.servicio_id);
      const prof = profesionales.find((p: any) => p.id === c.profesional_id);
      return (
        norm(cli?.nombre || '').includes(q) ||
        (cli?.telefono || '').includes(q) ||
        norm(srv?.nombre || '').includes(q) ||
        norm(prof?.nombre || '').includes(q)
      );
    }).slice(0, 12);
  }, [searchQuery, citas, clientes, servicios, profesionales]);

  // Citas en proximas 48h sin confirmar por el cliente (excluye canceladas)
  const sinConfirmar48h = useMemo(() => {
    const ahora = Date.now();
    return citas.filter((c: any) => {
      const ts = new Date(c.inicio).getTime();
      const horas = (ts - ahora) / 3600000;
      return horas > 0 && horas <= 48 && !c.confirmada_cliente && c.estado === CITA_STATUS.CONFIRMADA;
    }).length;
  }, [citas]);

  const servicioMap = useMemo(() => {
    const map = new Map(servicios.map((s) => [s.id, s]));
    return map;
  }, [servicios]);

  const clienteMap = useMemo(() => {
    const map = new Map(clientes.map((c) => [c.id, c]));
    return map;
  }, [clientes]);

  const profesionalMap = useMemo(() => {
    const map = new Map(profesionales.map((p) => [p.id, p]));
    return map;
  }, [profesionales]);

  const ingresosDia = useMemo(() => {
    return citasHoy.reduce((sum, c) => {
      const srv = servicioMap.get(c.servicio_id);
      return sum + (srv?.precio || 0);
    }, 0);
  }, [citasHoy, servicioMap]);

  // RN-AG-073-074: metricas de aprovechamiento de tiempos muertos por profesional
  const reposoUtilMap = useMemo(() => {
    const map: Record<string, { totalMin: number; usedMin: number }> = {};
    const byProf: Record<string, any[]> = {};
    citasHoy.forEach((c: any) => {
      if (c.estado !== CITA_STATUS.CONFIRMADA) return;
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });
    Object.entries(byProf).forEach(([profId, profCitas]) => {
      let totalMin = 0;
      let usedMin = 0;
      profCitas.forEach((c: any) => {
        if (!c.fin_activa || !c.fin_espera) return;
        const restStart = new Date(c.fin_activa).getTime();
        const restEnd = new Date(c.fin_espera).getTime();
        if (restEnd <= restStart) return;
        // Excluir reposos de citas anidadas (su inicio cae dentro del reposo de otra)
        const esAnidada = profCitas.some((host: any) => {
          if (host.id === c.id || !host.fin_activa || !host.fin_espera) return false;
          const hRestStart = new Date(host.fin_activa).getTime();
          const hRestEnd = new Date(host.fin_espera).getTime();
          return new Date(c.inicio).getTime() >= hRestStart && new Date(c.inicio).getTime() < hRestEnd;
        });
        if (esAnidada) return;
        totalMin += (restEnd - restStart) / 60000;
        // Overlap: span completo de otra cita (inicio→fin) dentro de este reposo
        profCitas.forEach((d: any) => {
          if (d.id === c.id) return;
          const dStart = new Date(d.inicio).getTime();
          const dFin = new Date(d.fin).getTime();
          const ov = Math.max(0, Math.min(dFin, restEnd) - Math.max(dStart, restStart));
          usedMin += ov / 60000;
        });
      });
      if (totalMin > 0) map[profId] = { totalMin, usedMin: Math.min(usedMin, totalMin) };
    });
    return map;
  }, [citasHoy]);

  const totalCitasMes = useMemo(() => {
    return citas.filter((c) => {
      const d = new Date(c.inicio);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
  }, [citas, month, year]);

  const ocupacionMes = useMemo(() => {
    return Math.round((totalCitasMes / OCUPACION_MAX_PER_MES) * 100);
  }, [totalCitasMes]);

  // RN-AG-073-074: resumen global de aprovechamiento de reposo del dia
  const reposoGlobal = useMemo(() => {
    let total = 0, used = 0;
    Object.values(reposoUtilMap).forEach((v) => { total += v.totalMin; used += v.usedMin; });
    return total > 0 ? { totalMin: total, usedMin: used, pct: Math.round(used / total * 100) } : null;
  }, [reposoUtilMap]);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleToday = () => {
    setSelectedDate(today.getDate());
    setCurrentMonth(today);
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0b1220', color: TOKENS.text }}>Cargando...</div>;

  const monthName = currentMonth.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      {/* Topbar */}
      <div className="m-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Agenda</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>
            {selectedDateObj.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).charAt(0).toUpperCase() + selectedDateObj.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).slice(1)} · {totalCitasHoy} citas · {citasHoy.filter((c) => c.estado === CITA_STATUS.CONFIRMADA).length} confirmadas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {reposoGlobal && (
            <div
              title={`${reposoGlobal.usedMin} de ${reposoGlobal.totalMin} min de reposo aprovechados hoy`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', borderRadius: 999, fontSize: 12, fontWeight: 700 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#f59e0b' }} />
              {reposoGlobal.pct}% reposo aprovechado
            </div>
          )}
          {sinConfirmar48h > 0 && (
            <div
              title="Citas en las proximas 48h que la clienta aun no ha confirmado"
              className="m-pulse-red"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#ef4444', borderRadius: 999, fontSize: 12, fontWeight: 700 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#ef4444' }} />
              {sinConfirmar48h} sin confirmar
            </div>
          )}
          <button className="m-btn-icon" style={{ padding: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.textSec, position: 'relative', cursor: 'pointer', width: 36, height: 36, display: 'grid', placeItems: 'center' }}>
            <Icon name="bell" size={20} color={TOKENS.textSec} />
            {notifications > 0 && <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, background: TOKENS.danger, borderRadius: 999, boxShadow: `0 0 0 2px ${TOKENS.bg}`, animation: 'pulse 2s infinite' }} />}
          </button>
          <button className="m-btn-secondary" onClick={handleToday} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={16} color={TOKENS.text} />
            Hoy
          </button>
          <button
            onClick={() => setShowCierreSalon(true)}
            style={{ padding: '9px 14px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; }}
          >
            <Icon name="x" size={16} color="#ef4444" />
            Cerrar salon
          </button>
          <button className="m-btn-primary" onClick={() => setShowNewCita(true)} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="#fff" />
            Nueva cita
          </button>
        </div>
      </div>

      {/* 8.3+8.4: Barra de filtros y buscador */}
      <div className="m-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 32px', borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(148,163,184,0.02)', position: 'relative', zIndex: 50 }}>
        {/* View switcher (8.5) */}
        <div style={{ display: 'flex', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '7px 16px',
                fontSize: 12,
                fontWeight: view === v ? 700 : 500,
                background: view === v ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: view === v ? TOKENS.primaryHi : TOKENS.textSec,
                border: 'none',
                cursor: 'pointer',
                borderRight: v !== 'month' ? `1px solid ${TOKENS.border}` : 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => { if (view !== v) e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; }}
              onMouseLeave={(e) => { if (view !== v) e.currentTarget.style.background = 'transparent'; }}
            >
              {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: TOKENS.border, opacity: 0.5 }} />

        {/* Filtro servicio - dropdown custom */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setDropServicioOpen(!dropServicioOpen); setDropEstadoOpen(false); }}
            onBlur={() => setTimeout(() => setDropServicioOpen(false), 150)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px',
              background: filterServicio !== 'todos' ? 'rgba(99,102,241,0.10)' : TOKENS.bgCard,
              border: `1px solid ${dropServicioOpen ? TOKENS.primary : filterServicio !== 'todos' ? 'rgba(99,102,241,0.30)' : TOKENS.border}`,
              borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: filterServicio !== 'todos' ? TOKENS.primaryHi : TOKENS.textSec,
              transition: 'all 0.2s ease',
              minWidth: 120,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; }}
            onMouseLeave={(e) => { if (!dropServicioOpen) e.currentTarget.style.borderColor = filterServicio !== 'todos' ? 'rgba(99,102,241,0.30)' : TOKENS.border; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filterServicio === 'todos' ? 'Servicio' : servicios.find((s) => s.id === filterServicio)?.nombre || 'Servicio'}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: dropServicioOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0, opacity: 0.5 }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {dropServicioOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, maxHeight: 260, overflowY: 'auto',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200, padding: 4,
              animation: 'fadeIn 0.15s ease',
            }}>
              <div
                onMouseDown={() => { setFilterServicio('todos'); setDropServicioOpen(false); }}
                style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: filterServicio === 'todos' ? 700 : 500, color: filterServicio === 'todos' ? TOKENS.primaryHi : TOKENS.textSec, transition: 'background 0.1s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Todos los servicios
              </div>
              {servicios.map((s) => (
                <div
                  key={s.id}
                  onMouseDown={() => { setFilterServicio(s.id); setDropServicioOpen(false); }}
                  style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: filterServicio === s.id ? 700 : 500, color: filterServicio === s.id ? TOKENS.primaryHi : TOKENS.text, transition: 'background 0.1s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>{s.nombre}</span>
                  {s.precio != null && <span style={{ fontSize: 10, color: TOKENS.textTer }}>{s.precio}EUR</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filtro estado - dropdown custom */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setDropEstadoOpen(!dropEstadoOpen); setDropServicioOpen(false); }}
            onBlur={() => setTimeout(() => setDropEstadoOpen(false), 150)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px',
              background: filterEstado !== 'todos' ? 'rgba(99,102,241,0.10)' : TOKENS.bgCard,
              border: `1px solid ${dropEstadoOpen ? TOKENS.primary : filterEstado !== 'todos' ? 'rgba(99,102,241,0.30)' : TOKENS.border}`,
              borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: filterEstado !== 'todos' ? TOKENS.primaryHi : TOKENS.textSec,
              transition: 'all 0.2s ease',
              minWidth: 110,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; }}
            onMouseLeave={(e) => { if (!dropEstadoOpen) e.currentTarget.style.borderColor = filterEstado !== 'todos' ? 'rgba(99,102,241,0.30)' : TOKENS.border; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l2.5 2.5L16 9" /></svg>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {filterEstado === 'todos' ? 'Estado' : filterEstado === 'no_presentada' ? 'No presentada' : filterEstado.charAt(0).toUpperCase() + filterEstado.slice(1)}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: dropEstadoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0, opacity: 0.5 }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {dropEstadoOpen && (() => {
            const estados = [
              { value: 'todos', label: 'Todos los estados', dot: TOKENS.textTer },
              { value: CITA_STATUS.CONFIRMADA, label: 'Confirmada', dot: TOKENS.primaryHi },
              { value: CITA_STATUS.COMPLETADA, label: 'Completada', dot: '#22c55e' },
              { value: CITA_STATUS.CANCELADA, label: 'Cancelada', dot: '#ef4444' },
              { value: CITA_STATUS.NO_PRESENTADA, label: 'No presentada', dot: '#f59e0b' },
            ];
            return (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 180,
                background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200, padding: 4,
                animation: 'fadeIn 0.15s ease',
              }}>
                {estados.map((e) => (
                  <div
                    key={e.value}
                    onMouseDown={() => { setFilterEstado(e.value); setDropEstadoOpen(false); }}
                    style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: filterEstado === e.value ? 700 : 500, color: filterEstado === e.value ? e.dot : TOKENS.text, transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: e.dot, flexShrink: 0 }} />
                    {e.label}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {(filterServicio !== 'todos' || filterEstado !== 'todos') && (
          <button
            onClick={() => { setFilterServicio('todos'); setFilterEstado('todos'); }}
            style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 600,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)',
              borderRadius: 8, color: '#ef4444', cursor: 'pointer',
              transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 4,
              animation: 'fadeIn 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            Limpiar
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Buscador global (8.4) */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: TOKENS.bgCard, border: `1px solid ${searchOpen ? TOKENS.primary : TOKENS.border}`,
              borderRadius: 10, padding: '7px 12px',
              transition: 'all 0.25s ease', width: searchOpen ? 280 : 180,
              boxShadow: searchOpen ? `0 0 0 3px rgba(99,102,241,0.10)` : 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={searchOpen ? TOKENS.primaryHi : TOKENS.textTer} strokeWidth="2" style={{ transition: 'stroke 0.2s ease', flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { setSearchOpen(true); setDropServicioOpen(false); setDropEstadoOpen(false); }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              placeholder="Buscar cita..."
              style={{ border: 'none', outline: 'none', background: 'transparent', color: TOKENS.text, fontSize: 12, width: '100%' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOKENS.textTer, padding: 2, display: 'flex', transition: 'color 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.textTer; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div
              onWheel={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 360, maxHeight: 340, overflowY: 'auto',
                background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14,
                boxShadow: '0 16px 50px rgba(0,0,0,0.55)', zIndex: 200, padding: 6,
                animation: 'slideInUp 0.2s ease', overscrollBehavior: 'contain',
              }}>
              <div style={{ padding: '6px 10px 8px', fontSize: 10, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map((c: any) => {
                const cli = clientes.find((cl: any) => cl.id === c.cliente_id);
                const srv = servicios.find((s: any) => s.id === c.servicio_id);
                const prof = profesionales.find((p: any) => p.id === c.profesional_id);
                const fecha = new Date(c.inicio);
                return (
                  <div
                    key={c.id}
                    onMouseDown={() => {
                      const citaDate = new Date(c.inicio);
                      setSelectedDate(citaDate.getDate());
                      setCurrentMonth(new Date(citaDate.getFullYear(), citaDate.getMonth()));
                      setView('day');
                      setSearchQuery('');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ width: 4, height: 32, borderRadius: 2, background: prof?.color || TOKENS.primary, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cli?.nombre || 'Sin cliente'}
                      </div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 1 }}>
                        {srv?.nombre} - {prof?.nombre?.split(' ')[0]}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec }}>{fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer }}>{fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); setShowClienteHistorial(cli); }}
                      style={{
                        padding: '4px 8px', fontSize: 10, fontWeight: 600,
                        background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 6, color: TOKENS.primaryHi, cursor: 'pointer', whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.20)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; }}
                    >
                      Historial
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AlertBar: citas vencidas */}
      {citasVencidas.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 32px',
          background: 'rgba(239,68,68,0.08)',
          borderBottom: '1px solid rgba(239,68,68,0.20)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#ef4444', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
            {citasVencidas.length} cita{citasVencidas.length > 1 ? 's' : ''} sin atender
          </span>
          <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto' }}>
            {citasVencidas.slice(0, 5).map((c) => {
              const prof = profesionales.find((p) => p.id === c.profesional_id);
              const cli = clientes.find((cl) => cl.id === c.cliente_id);
              const ini = new Date(c.inicio);
              const minutosRetraso = Math.round((Date.now() - ini.getTime()) / 60000);
              return (
                <button
                  key={c.id}
                  onClick={() => setShowClientaTarde(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    color: TOKENS.text,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                >
                  {prof && <span style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />}
                  <span>{cli?.nombre ?? 'Cliente'}</span>
                  <span style={{ color: '#ef4444' }}>+{minutosRetraso}min</span>
                </button>
              );
            })}
          </div>
          {citasVencidas.length > 5 && (
            <span style={{ fontSize: 11, color: TOKENS.textTer, whiteSpace: 'nowrap' }}>+{citasVencidas.length - 5} mas</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr', overflow: 'hidden' }}>
        {/* Left rail */}
        <div style={{ borderRight: `1px solid ${TOKENS.border}`, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ animation: 'slideInUp 0.5s ease 0.1s both' }}>
              <StatCard label="HOY" value={totalCitasHoy} sub="citas" tone={TOKENS.primary} />
            </div>
            <div style={{ animation: 'slideInUp 0.5s ease 0.2s both' }}>
              <StatCard label="INGRESOS" value={`${ingresosDia}€`} sub="estimado día" tone={TOKENS.success} />
            </div>
            <div style={{ animation: 'slideInUp 0.5s ease 0.3s both' }}>
              <StatCard label="MES" value={`${totalCitasMes}`} sub={`citas / ${OCUPACION_MAX_PER_MES}`} tone={TOKENS.warning} progress={ocupacionMes / 100} />
            </div>
            <div style={{ animation: 'slideInUp 0.5s ease 0.4s both' }}>
              <StatCard label="OCUPACIÓN" value={`${ocupacionMes}%`} sub="este mes" tone={TOKENS.violet} progress={ocupacionMes / 100} />
            </div>
          </div>

          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button className="m-btn-icon m-btn-icon-rotate-l" onClick={handlePrevMonth} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <Icon name="chevronLeft" size={18} color={TOKENS.textSec} />
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text, textTransform: 'capitalize' }}>{monthName}</div>
              <button className="m-btn-icon m-btn-icon-rotate-r" onClick={handleNextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <Icon name="chevronRight" size={18} color={TOKENS.textSec} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
              {DAY_NAMES.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.5, padding: 4 }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {cells.map((d, i) => {
                if (!d)
                  return <div key={i} style={{ height: 40 }} />;
                const isSel = d === selectedDate && currentMonth.getMonth() === today.getMonth();
                const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const cnt = counts[d] || 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(d)}
                    style={{
                      height: 40,
                      borderRadius: 9,
                      background: isToday ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : isSel ? 'rgba(99,102,241,0.16)' : 'transparent',
                      border: isSel && !isToday ? `1px solid ${TOKENS.primary}` : '1px solid transparent',
                      color: isToday ? '#fff' : isSel ? TOKENS.primaryHi : TOKENS.textSec,
                      fontSize: 12,
                      fontWeight: isToday || isSel ? 700 : 500,
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      boxShadow: isToday ? `0 4px 14px ${TOKENS.primaryGlow}` : 'none',
                      transition: 'all 0.2s ease',
                      transform: 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      if (isToday) {
                        e.currentTarget.style.boxShadow = `0 6px 20px ${TOKENS.primaryGlow}`;
                      } else {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.12)';
                        e.currentTarget.style.borderColor = TOKENS.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = isToday ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : isSel ? 'rgba(99,102,241,0.16)' : 'transparent';
                      e.currentTarget.style.borderColor = isSel && !isToday ? TOKENS.primary : 'transparent';
                      e.currentTarget.style.boxShadow = isToday ? `0 4px 14px ${TOKENS.primaryGlow}` : 'none';
                    }}
                  >
                    <span>{d}</span>
                    {cnt > 0 && (
                      <div
                        style={{
                          marginTop: 1,
                          height: 3,
                          width: 3,
                          borderRadius: 999,
                          background: isToday ? '#fff' : TOKENS.primaryHi,
                          boxShadow: cnt > 5 ? `8px 0 0 ${isToday ? '#fff' : TOKENS.primaryHi}, -8px 0 0 ${isToday ? '#fff' : TOKENS.primaryHi}` : cnt > 2 ? `5px 0 0 ${isToday ? '#fff' : TOKENS.primaryHi}` : 'none',
                          animation: isToday ? 'pulse 2s infinite' : 'none',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Profesionales</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ProfRow id="todos" name="Todos" color={TOKENS.primary} count={citasHoy.length} selected={selectedProf === 'todos'} onSel={() => setSelectedProf('todos')} />
              {visibleProfs.map((p) => (
                <ProfRow key={p.id} id={p.id} name={p.nombre} role={p.rol} color={p.color} count={citasHoy.filter((c) => c.profesional_id === p.id).length} selected={selectedProf === p.id} onSel={() => setSelectedProf(p.id)} reposoUtil={reposoUtilMap[p.id]} onRetraso={() => setShowRetrasoProf(p.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          {view === 'day' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, textTransform: 'capitalize' }}>
                      {selectedDateObj.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })}
                    </h2>
                    {selectedDateObj.toDateString() === today.toDateString() && <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.warning }}>HOY</span>}
                  </div>
                  <div style={{ fontSize: 13, color: TOKENS.textSec, marginTop: 4 }}>
                    {totalCitasHoy} citas programadas · {ingresosDia}€ estimados
                  </div>
                </div>
              </div>
              <DayTimeline citas={filtered} profesionales={visibleProfs} servicios={servicios} clientes={clientes} servicioMap={servicioMap} clienteMap={clienteMap} profesionalMap={profesionalMap} citaAddonsMap={citaAddonsMap} onEditCita={(cita: any) => { setSelectedCitaEdit(cita); setShowEditCita(true); }} onCitaUpdated={(updated: any) => setCitas(prev => prev.map((c: any) => c.id === updated.id ? { ...c, ...updated } : c))} bloqueos={bloqueos} selectedDateObj={selectedDateObj} registrarHistorial={registrarHistorial} onClienteHistorial={(cli: any) => setShowClienteHistorial(cli)} />
            </>
          )}
          {view === 'week' && (
            <WeekView
              citas={citas}
              profesionales={visibleProfs}
              servicios={servicios}
              clientes={clientes}
              servicioMap={servicioMap}
              clienteMap={clienteMap}
              selectedDateObj={selectedDateObj}
              filterServicio={filterServicio}
              filterEstado={filterEstado}
              selectedProf={selectedProf}
              onSelectDay={(d: Date) => { setSelectedDate(d.getDate()); setCurrentMonth(new Date(d.getFullYear(), d.getMonth())); setView('day'); }}
              onEditCita={(cita: any) => { setSelectedCitaEdit(cita); setShowEditCita(true); }}
            />
          )}
          {view === 'month' && (
            <MonthView
              citas={citas}
              profesionales={visibleProfs}
              servicios={servicios}
              clientes={clientes}
              servicioMap={servicioMap}
              clienteMap={clienteMap}
              currentMonth={currentMonth}
              filterServicio={filterServicio}
              filterEstado={filterEstado}
              selectedProf={selectedProf}
              onSelectDay={(d: Date) => { setSelectedDate(d.getDate()); setCurrentMonth(new Date(d.getFullYear(), d.getMonth())); setView('day'); }}
            />
          )}
        </div>
      </div>

      {showNewCita && <NewCitaModal onClose={() => setShowNewCita(false)} onSaved={(nuevaCita: any) => { if (nuevaCita) setCitas(prev => [...prev, nuevaCita]); setShowNewCita(false); }} selectedDate={selectedDateObj} />}
      {showClienteHistorial && <ClienteHistorialModal cliente={showClienteHistorial} onClose={() => setShowClienteHistorial(null)} citas={citas} servicioMap={servicioMap} profesionalMap={profesionalMap} />}
      {showEditCita && selectedCitaEdit && (
        <DetalleCitaModal
          onClose={() => setShowEditCita(false)}
          onSaved={(updatedFields: any) => {
            setCitas(prev => prev.map(c => c.id === selectedCitaEdit.id ? { ...c, ...updatedFields } : c));
            setShowEditCita(false);
          }}
          cita={selectedCitaEdit}
          servicios={servicios}
          clientes={clientes}
          profesionales={profesionales}
          citasHoy={citasHoy}
          allCitas={citas}
        />
      )}

      {/* Modal: Cierre inesperado del salon (6.4) */}
      {showCierreSalon && (() => {
        const citasConfirmadasHoy = citasHoy.filter((c) => c.estado === CITA_STATUS.CONFIRMADA);
        const count = citasConfirmadasHoy.length;
        return (
          <div onClick={() => setShowCierreSalon(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 9999, animation: 'fadeIn 0.2s ease' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 440, background: TOKENS.bgPanel, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 16, padding: 28, animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
              <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700, color: '#ef4444' }}>
                Cerrar salon hoy
              </h3>
              <p style={{ margin: 0, marginBottom: 18, fontSize: 13, color: TOKENS.textSec, lineHeight: 1.5 }}>
                Se cancelaran <strong style={{ color: TOKENS.text }}>{count} cita{count !== 1 ? 's' : ''} confirmada{count !== 1 ? 's' : ''}</strong> del {selectedDateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}. Esta accion no se puede deshacer.
              </p>

              {count > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18, maxHeight: 200, overflowY: 'auto' }}>
                  {citasConfirmadasHoy.map((c) => {
                    const cli = clientes.find((cl) => cl.id === c.cliente_id);
                    const srv = servicios.find((s) => s.id === c.servicio_id);
                    const ini = new Date(c.inicio);
                    return (
                      <div key={c.id} style={{ padding: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, color: TOKENS.textTer, flexShrink: 0 }}>{ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cli?.nombre ?? 'Cliente'}</span>
                        <span style={{ fontSize: 11, color: TOKENS.textSec }}>{srv?.nombre ?? ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowCierreSalon(false)}
                  style={{ flex: 1, padding: '10px 0', background: 'transparent', color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  onClick={cierreMasivoSalon}
                  disabled={count === 0 || cierreLoading}
                  style={{ flex: 1, padding: '10px 0', background: count === 0 ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.15)', color: count === 0 ? TOKENS.textTer : '#ef4444', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 10, cursor: count === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { if (count > 0) e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
                  onMouseLeave={(e) => { if (count > 0) e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
                >
                  {cierreLoading ? 'Cancelando...' : count === 0 ? 'Sin citas' : `Cancelar ${count} cita${count !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Clienta llega tarde (6.3) */}
      {showClientaTarde && (() => {
        const c = showClientaTarde;
        const cli = clientes.find((cl) => cl.id === c.cliente_id);
        const prof = profesionales.find((p) => p.id === c.profesional_id);
        const srv = servicios.find((s) => s.id === c.servicio_id);
        const ini = new Date(c.inicio);
        const minutosRetraso = Math.round((Date.now() - ini.getTime()) / 60000);

        async function marcarNoShow() {
          await supabase.from('citas').update({ estado: 'no_presentada' }).eq('id', c.id);
          setCitas((prev) => prev.map((x) => x.id === c.id ? { ...x, estado: 'no_presentada' } : x));
          setShowClientaTarde(null);
        }

        async function esperarMas(minutos: number) {
          const deltaMs = minutos * 60000;
          const nuevoInicio = new Date(ini.getTime() + deltaMs);
          const nuevoFin = new Date(new Date(c.fin).getTime() + deltaMs);
          const payload: any = {
            inicio: nuevoInicio.toISOString(),
            fin: nuevoFin.toISOString(),
          };
          const updated: any = { ...c, inicio: nuevoInicio.toISOString(), fin: nuevoFin.toISOString() };
          if (c.fin_activa) {
            payload.fin_activa = new Date(new Date(c.fin_activa).getTime() + deltaMs).toISOString();
            updated.fin_activa = payload.fin_activa;
          }
          if (c.fin_espera) {
            payload.fin_espera = new Date(new Date(c.fin_espera).getTime() + deltaMs).toISOString();
            updated.fin_espera = payload.fin_espera;
          }
          await supabase.from('citas').update(payload).eq('id', c.id);
          const profile = await getUserProfile();
          const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
          await registrarHistorial(c.id, nId, [
            { campo: 'inicio', anterior: c.inicio, nuevo: payload.inicio },
            { campo: 'fin', anterior: c.fin, nuevo: payload.fin },
          ], `Clienta llega tarde (+${minutos} min)`);
          setCitas((prev) => prev.map((x) => x.id === c.id ? updated : x));
          setShowClientaTarde(null);
        }

        return (
          <div onClick={() => setShowClientaTarde(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 9999, animation: 'fadeIn 0.2s ease' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 420, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 16, padding: 28, animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
              <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
                Clienta no ha llegado
              </h3>
              <p style={{ margin: 0, marginBottom: 18, fontSize: 12, color: TOKENS.textSec }}>
                La cita deberia haber empezado hace {minutosRetraso} minutos.
              </p>

              <div style={{ padding: 14, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {prof && <div style={{ width: 8, height: 8, borderRadius: 4, background: prof.color }} />}
                  <span style={{ fontSize: 14, fontWeight: 600, color: TOKENS.text }}>{cli?.nombre ?? 'Cliente'}</span>
                </div>
                <div style={{ fontSize: 12, color: TOKENS.textSec }}>{srv?.nombre ?? 'Servicio'}</div>
                <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 4 }}>
                  {ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(c.fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  {prof && <span> · {prof.nombre}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 2 }}>Esperar un poco mas</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[5, 10, 15, 30].map((min) => (
                    <button
                      key={min}
                      onClick={() => esperarMas(min)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 8,
                        border: `1px solid ${TOKENS.border}`,
                        background: TOKENS.bgCard,
                        color: TOKENS.text,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.background = TOKENS.primarySoft; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bgCard; }}
                    >
                      +{min} min
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowClientaTarde(null)}
                  style={{ flex: 1, padding: '10px 0', background: 'transparent', color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Cerrar
                </button>
                <button
                  onClick={marcarNoShow}
                  style={{ flex: 1, padding: '10px 0', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                >
                  Marcar no presentada
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Profesional llega tarde (6.1) */}
      {showRetrasoProf && (() => {
        const prof = profesionales.find((p) => p.id === showRetrasoProf);
        if (!prof) return null;
        const citasProf = citasHoy.filter((c) => c.profesional_id === showRetrasoProf && c.estado === 'confirmada');

        async function retrasarTodas(minutos: number) {
          const deltaMs = minutos * 60000;
          const profile = await getUserProfile();
          const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
          for (const c of citasProf) {
            const payload: any = {
              inicio: new Date(new Date(c.inicio).getTime() + deltaMs).toISOString(),
              fin: new Date(new Date(c.fin).getTime() + deltaMs).toISOString(),
            };
            if (c.fin_activa) payload.fin_activa = new Date(new Date(c.fin_activa).getTime() + deltaMs).toISOString();
            if (c.fin_espera) payload.fin_espera = new Date(new Date(c.fin_espera).getTime() + deltaMs).toISOString();
            await supabase.from('citas').update(payload).eq('id', c.id);
            await registrarHistorial(c.id, nId, [
              { campo: 'inicio', anterior: c.inicio, nuevo: payload.inicio },
              { campo: 'fin', anterior: c.fin, nuevo: payload.fin },
            ], `Profesional llega tarde (+${minutos} min)`);
          }
          setCitas((prev) => prev.map((c) => {
            if (citasProf.some((cp) => cp.id === c.id)) {
              const updated: any = {
                ...c,
                inicio: new Date(new Date(c.inicio).getTime() + deltaMs).toISOString(),
                fin: new Date(new Date(c.fin).getTime() + deltaMs).toISOString(),
              };
              if (c.fin_activa) updated.fin_activa = new Date(new Date(c.fin_activa).getTime() + deltaMs).toISOString();
              if (c.fin_espera) updated.fin_espera = new Date(new Date(c.fin_espera).getTime() + deltaMs).toISOString();
              return updated;
            }
            return c;
          }));
          setShowRetrasoProf(null);
        }

        return (
          <div onClick={() => setShowRetrasoProf(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 9999, animation: 'fadeIn 0.2s ease' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 420, background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 16, padding: 28, animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
              <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>
                Profesional llega tarde
              </h3>
              <p style={{ margin: 0, marginBottom: 18, fontSize: 12, color: TOKENS.textSec }}>
                {prof.nombre} tiene {citasProf.length} cita{citasProf.length > 1 ? 's' : ''} pendiente{citasProf.length > 1 ? 's' : ''} que deberian haber empezado. Retrasa todas a la vez.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18, maxHeight: 200, overflowY: 'auto' }}>
                {citasProf.map((c) => {
                  const cli = clientes.find((cl) => cl.id === c.cliente_id);
                  const ini = new Date(c.inicio);
                  return (
                    <div key={c.id} style={{ padding: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{cli?.nombre ?? 'Cliente'}</span>
                      <span style={{ fontSize: 11, color: TOKENS.textTer, marginLeft: 'auto' }}>{ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>

              <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 6, display: 'block' }}>Retrasar todas las citas</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 18 }}>
                {[10, 15, 20, 30].map((min) => (
                  <button
                    key={min}
                    onClick={() => retrasarTodas(min)}
                    style={{
                      padding: '8px 0',
                      borderRadius: 8,
                      border: `1px solid ${TOKENS.border}`,
                      background: TOKENS.bgCard,
                      color: TOKENS.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.background = TOKENS.primarySoft; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bgCard; }}
                  >
                    +{min} min
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowRetrasoProf(null)}
                style={{ width: '100%', padding: '10px 0', background: 'transparent', color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StatCard({ label, value, sub, tone, progress }: any) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, padding: 14, position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease', transform: 'scale(1)', cursor: 'pointer' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = TOKENS.borderHi; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = TOKENS.border; }}>
      <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text, marginTop: 4, letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>{sub}</div>
      {progress != null && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 99, background: 'rgba(148,163,184,0.12)' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 99, background: tone }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: 12, right: 12, width: 6, height: 6, borderRadius: 999, background: tone, boxShadow: `0 0 10px ${tone}` }} />
    </div>
  );
}

function ProfRow({ id, name, role, color, count, selected, onSel, reposoUtil, onRetraso }: any) {
  return (
    <button
      onClick={onSel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: selected ? 'rgba(99,102,241,0.10)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.25)' : 'transparent'}`,
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
        transform: 'translateX(0)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = selected ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.05)';
        e.currentTarget.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = selected ? 'rgba(99,102,241,0.10)' : 'transparent';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.06)`,
        }}
      >
        {id === 'todos' ? (
          <svg width="13" height="13" viewBox="0 0 12 12" fill="#fff">
            <rect x="0" y="0" width="5" height="5" rx="1"/>
            <rect x="7" y="0" width="5" height="5" rx="1"/>
            <rect x="0" y="7" width="5" height="5" rx="1"/>
            <rect x="7" y="7" width="5" height="5" rx="1"/>
          </svg>
        ) : name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? TOKENS.text : TOKENS.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        {role && <div style={{ fontSize: 11, color: TOKENS.textTer }}>{role}</div>}
        {reposoUtil && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(245,158,11,0.15)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(reposoUtil.usedMin / reposoUtil.totalMin * 100)}%`, height: '100%', borderRadius: 2, background: '#f59e0b', transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {Math.round(reposoUtil.usedMin / reposoUtil.totalMin * 100)}%
            </span>
          </div>
        )}
      </div>
      {onRetraso && (
        <div
          title="Profesional llega tarde"
          onClick={(e) => { e.stopPropagation(); onRetraso(); }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            background: 'transparent',
            transition: 'background 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textSec, padding: '2px 7px', borderRadius: 6, background: 'rgba(148,163,184,0.10)' }}>
        {count}
      </div>
    </button>
  );
}

function ViewTab({ children, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px',
        fontSize: 12,
        fontWeight: 600,
        background: active ? TOKENS.bgCard : 'transparent',
        border: `1px solid ${active ? TOKENS.borderHi : TOKENS.border}`,
        borderRadius: 8,
        color: active ? TOKENS.text : TOKENS.textSec,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: 'scale(1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.borderColor = TOKENS.primary;
        if (!active) {
          e.currentTarget.style.background = 'rgba(99,102,241,0.05)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.borderColor = active ? TOKENS.borderHi : TOKENS.border;
        e.currentTarget.style.background = active ? TOKENS.bgCard : 'transparent';
      }}
    >
      {children}
    </button>
  );
}

const BLOQUEO_COLORS: Record<string, string> = {
  vacaciones: '#10b981',
  reunion:    '#3b82f6',
  baja:       '#ef4444',
  formacion:  '#8b5cf6',
  descanso:   '#f59e0b',
};
const BLOQUEO_LABELS: Record<string, string> = {
  vacaciones: 'Vacaciones',
  reunion:    'Reunión',
  baja:       'Baja',
  formacion:  'Formación',
  descanso:   'Descanso',
};

function DayTimeline({ citas, profesionales, servicios, clientes, servicioMap, clienteMap, profesionalMap, citaAddonsMap = {}, onEditCita, onCitaUpdated, bloqueos = [], selectedDateObj = new Date(), registrarHistorial, onClienteHistorial }: any) {
  const HOURS = [];
  for (let h = HORARIO_APERTURA.horas; h < HORARIO_CIERRE.horas; h++) HOURS.push(h);
  const ROW_H = 64;
  const START_H = HORARIO_APERTURA.horas;
  const now = new Date();
  const currentHourPercent = ((now.getHours() - START_H) + now.getMinutes() / 60) / HOURS.length;
  const isToday = now.getHours() >= START_H && now.getHours() < START_H + HOURS.length;

  async function toggleCompletada(citaId: string, estadoActual: string) {
    const nuevoEstado = estadoActual === CITA_STATUS.COMPLETADA ? CITA_STATUS.CONFIRMADA : CITA_STATUS.COMPLETADA;
    await supabase.from('citas').update({ estado: nuevoEstado }).eq('id', citaId);
    onCitaUpdated?.({ id: citaId, estado: nuevoEstado });
  }

  // ---- DRAG & DROP ----
  const [isDragging, setIsDragging] = useState(false);
  const [drag, setDrag] = useState<any>(null);
  const [dropSlot, setDropSlot] = useState<any>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<any>(null);
  const dropRef = useRef<any>(null);
  const _profRef = useRef(profesionales); _profRef.current = profesionales;
  const _citasRef = useRef(citas); _citasRef.current = citas;
  const _dateRef = useRef(selectedDateObj); _dateRef.current = selectedDateObj;

  const startDrag = (cita: any, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const d = {
      cita,
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      ghostX: rect.left, ghostY: rect.top,
      blockWidth: rect.width, blockHeight: rect.height,
    };
    dragRef.current = d;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = Math.abs(e.clientX - d.startX) > 5 || Math.abs(e.clientY - d.startY) > 5;
      if (!moved) return;

      const upd = { ...d, ghostX: e.clientX - d.offsetX, ghostY: e.clientY - d.offsetY };
      dragRef.current = upd;
      setDrag(upd);

      const grid = gridRef.current;
      if (!grid) return;
      const r = grid.getBoundingClientRect();
      const relY = e.clientY - r.top;
      const relX = e.clientX - r.left - 56;
      const profs = _profRef.current;
      if (relY < 0 || relY >= HOURS.length * ROW_H || relX < 0 || relX > r.width - 56 || !profs.length) {
        dropRef.current = null; setDropSlot(null); return;
      }
      const colW = (r.width - 56) / profs.length;
      const profIndex = Math.min(Math.floor(relX / colW), profs.length - 1);
      const snappedMin = Math.max(0, Math.round((relY - d.offsetY) / ROW_H * 60 / 15) * 15);
      const sl = { profIndex, minutesFromStart: snappedMin, colW };
      dropRef.current = sl; setDropSlot(sl);
    };

    const onUp = async (e: MouseEvent) => {
      const d = dragRef.current;
      const sl = dropRef.current;
      dragRef.current = null; dropRef.current = null;
      setDrag(null); setDropSlot(null); setIsDragging(false);

      if (!d) return;

      const moved = Math.abs(e.clientX - d.startX) > 5 || Math.abs(e.clientY - d.startY) > 5;
      if (!moved) { onEditCita?.(d.cita); return; }
      if (!sl) return;

      const profs = _profRef.current;
      const currentCitas = _citasRef.current;
      const dateObj = _dateRef.current;
      const targetProf = profs[sl.profIndex];
      if (!targetProf) return;

      const cita = d.cita;
      const durMs = new Date(cita.fin).getTime() - new Date(cita.inicio).getTime();
      const activaMs = cita.fin_activa
        ? new Date(cita.fin_activa).getTime() - new Date(cita.inicio).getTime() : durMs;
      const esperaMs = cita.fin_activa && cita.fin_espera
        ? new Date(cita.fin_espera).getTime() - new Date(cita.fin_activa).getTime() : 0;

      const h = START_H + Math.floor(sl.minutesFromStart / 60);
      const m = sl.minutesFromStart % 60;
      const nuevoInicio = new Date(dateObj); nuevoInicio.setHours(h, m, 0, 0);
      const nuevoFinActiva = new Date(nuevoInicio.getTime() + activaMs);
      const nuevoFinEspera = new Date(nuevoFinActiva.getTime() + esperaMs);
      const nuevoFin = new Date(nuevoInicio.getTime() + durMs);

      if (nuevoInicio.getTime() === new Date(cita.inicio).getTime() && targetProf.id === cita.profesional_id) return;

      const limFin = new Date(dateObj); limFin.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
      if (nuevoFin > limFin) {
        setDragError('La cita excede el horario de cierre');
        setTimeout(() => setDragError(null), 2500);
        return;
      }

      const activo2Ms = cita.fin_espera ? new Date(cita.fin).getTime() - new Date(cita.fin_espera).getTime() : 0;
      const c1 = isTimeSlotOccupied(nuevoInicio, nuevoFinActiva, currentCitas, targetProf.id, cita.id);
      const c2 = activo2Ms > 0 && isTimeSlotOccupied(nuevoFinEspera, nuevoFin, currentCitas, targetProf.id, cita.id);
      if (c1 || c2) {
        setDragError('Conflicto: la fase activa se solapa con otra cita activa');
        setTimeout(() => setDragError(null), 2500);
        return;
      }

      const payload: any = {
        inicio: nuevoInicio.toISOString(), fin: nuevoFin.toISOString(),
        fin_activa: nuevoFinActiva.toISOString(), fin_espera: nuevoFinEspera.toISOString(),
        profesional_id: targetProf.id,
      };
      const { error } = await supabase.from('citas').update(payload).eq('id', cita.id);
      if (!error) {
        onCitaUpdated?.({ id: cita.id, ...payload });
        const profile = await getUserProfile();
        const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
        const cambios: { campo: string; anterior: string; nuevo: string }[] = [
          { campo: 'inicio', anterior: cita.inicio, nuevo: payload.inicio },
          { campo: 'fin', anterior: cita.fin, nuevo: payload.fin },
        ];
        if (targetProf.id !== cita.profesional_id) {
          cambios.push({ campo: 'profesional_id', anterior: cita.profesional_id, nuevo: targetProf.id });
        }
        registrarHistorial(cita.id, nId, cambios, 'Reagendado (drag & drop)');
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);
  // ---- END DRAG & DROP ----

  const citasWithLanes = useMemo(() => {
    const result = citas.map((c: any) => ({ ...c }));
    const byProf: Record<string, any[]> = {};
    result.forEach((c: any) => {
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });
    Object.values(byProf).forEach((profCitas: any[]) => {
      profCitas.sort((a: any, b: any) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
      const lanes: any[][] = [];
      profCitas.forEach((cita: any) => {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
          const last = lanes[i][lanes[i].length - 1];
          if (new Date(last.fin).getTime() <= new Date(cita.inicio).getTime()) {
            lanes[i].push(cita);
            cita._lane = i;
            placed = true;
            break;
          }
        }
        if (!placed) {
          lanes.push([cita]);
          cita._lane = lanes.length - 1;
        }
      });
      profCitas.forEach((cita: any) => {
        const overlapping = profCitas.filter((o: any) =>
          o.id !== cita.id &&
          new Date(o.inicio).getTime() < new Date(cita.fin).getTime() &&
          new Date(o.fin).getTime() > new Date(cita.inicio).getTime()
        );
        cita._totalLanes = overlapping.length > 0
          ? Math.max(...overlapping.map((o: any) => o._lane ?? 0), cita._lane ?? 0) + 1
          : 1;
      });
    });
    return result;
  }, [citas]);

  return (
    <>
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${profesionales.length || 1}, 1fr)`, borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(99,102,241,0.04)' }}>
        <div />
        {profesionales.map((p: any) => (
          <div key={p.id} style={{ padding: '12px 14px', borderLeft: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text }}>{p.nombre.split(' ')[0]}</div>
          </div>
        ))}
      </div>
      <div ref={gridRef} style={{ position: 'relative', height: HOURS.length * ROW_H, cursor: isDragging ? 'grabbing' : 'default' }}>
        {isToday && (
          <div style={{
            position: 'absolute',
            left: 56,
            right: 0,
            top: (now.getHours() - START_H + now.getMinutes() / 60) * ROW_H,
            height: 0,
            borderTop: `2px dashed ${TOKENS.danger}`,
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <div style={{
              position: 'absolute',
              left: -8,
              top: -7,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: TOKENS.danger,
              boxShadow: `0 0 12px ${TOKENS.danger}`,
            }} />
            <div style={{
              position: 'absolute',
              left: 8,
              top: -10,
              fontSize: 9,
              fontWeight: 700,
              color: TOKENS.danger,
              background: TOKENS.bg,
              padding: '2px 6px',
              borderRadius: 4,
              border: `1px solid ${TOKENS.danger}55`,
              whiteSpace: 'nowrap',
            }}>
              {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')} AHORA
            </div>
          </div>
        )}
        {dropSlot && drag && (() => {
          const dropProf = profesionales[dropSlot.profIndex];
          const dropColor = dropProf?.color || TOKENS.primary;
          const dropTop = dropSlot.minutesFromStart / 60 * ROW_H;
          const dropLeft = 56 + dropSlot.profIndex * dropSlot.colW;
          const dropH = drag.blockHeight;
          return (
            <div style={{
              position: 'absolute', top: dropTop, left: dropLeft,
              width: dropSlot.colW - 8, height: dropH,
              background: `${dropColor}18`,
              border: `2px dashed ${dropColor}99`,
              borderRadius: 8, pointerEvents: 'none', zIndex: 6,
              display: 'flex', alignItems: 'flex-start', padding: '4px 6px',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: dropColor }}>
                {String(START_H + Math.floor(dropSlot.minutesFromStart / 60)).padStart(2, '0')}:{String(dropSlot.minutesFromStart % 60).padStart(2, '0')}
              </span>
            </div>
          );
        })()}
        {HOURS.map((h, idx) => (
          <div key={h} style={{ display: 'grid', gridTemplateColumns: `56px repeat(${profesionales.length || 1}, 1fr)`, borderBottom: `1px solid rgba(148,163,184,0.05)`, minHeight: ROW_H, background: idx % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.03)' }}>
            <div style={{ padding: '8px 8px', fontSize: 11, color: TOKENS.textTer, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
              {h}:00
            </div>
            {profesionales.map((p: any) => (
              <div key={`${h}-${p.id}`} style={{ borderLeft: `1px solid rgba(148,163,184,0.05)` }} />
            ))}
          </div>
        ))}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 56,
          right: 0,
          height: HOURS.length * ROW_H,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, profesionales.length)}, 1fr)`,
          pointerEvents: 'none',
        }}>
          {profesionales.map((prof: any) => {
            const profColor = prof.color || TOKENS.primary;
            const profCitas = citasWithLanes.filter((c: any) => c.profesional_id === prof.id);
            return (
              <div key={prof.id} style={{ position: 'relative', pointerEvents: 'none' }}>
                {(bloqueos as any[]).filter((b: any) => {
                  if (b.profesional_id !== prof.id) return false;
                  const dayStart = new Date(selectedDateObj); dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = new Date(selectedDateObj); dayEnd.setHours(23, 59, 59, 999);
                  return new Date(b.inicio) <= dayEnd && new Date(b.fin) >= dayStart;
                }).map((b: any) => {
                  const bloqueoDayStart = new Date(selectedDateObj); bloqueoDayStart.setHours(START_H, 0, 0, 0);
                  const bloqueoDayEnd = new Date(selectedDateObj); bloqueoDayEnd.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
                  const bStart = new Date(Math.max(new Date(b.inicio).getTime(), bloqueoDayStart.getTime()));
                  const bEnd = new Date(Math.min(new Date(b.fin).getTime(), bloqueoDayEnd.getTime()));
                  const blockTop = (bStart.getHours() + bStart.getMinutes() / 60 - START_H) * ROW_H;
                  const blockHeight = (bEnd.getHours() + bEnd.getMinutes() / 60 - (bStart.getHours() + bStart.getMinutes() / 60)) * ROW_H;
                  if (blockHeight <= 0) return null;
                  const bColor = BLOQUEO_COLORS[b.tipo] || '#94a3b8';
                  return (
                    <div
                      key={b.id}
                      style={{
                        position: 'absolute',
                        top: blockTop,
                        left: 2,
                        right: 2,
                        height: blockHeight,
                        background: `repeating-linear-gradient(45deg, ${bColor}14, ${bColor}14 4px, transparent 4px, transparent 10px)`,
                        backgroundColor: `${bColor}0a`,
                        borderLeft: `3px solid ${bColor}99`,
                        borderRadius: 6,
                        pointerEvents: 'none',
                        zIndex: 2,
                        padding: '4px 6px',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ fontSize: 10, color: bColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{BLOQUEO_LABELS[b.tipo] || b.tipo}</div>
                      {b.motivo && blockHeight > 32 && (
                        <div style={{ fontSize: 9, color: `${bColor}bb`, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.motivo}</div>
                      )}
                    </div>
                  );
                })}
                {[...profCitas].sort((a: any, b: any) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()).map((cita: any) => {
                  const start = new Date(cita.inicio);
                  const end = new Date(cita.fin);
                  const startH = start.getHours() + start.getMinutes() / 60;
                  const durH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                  const top = (startH - START_H) * ROW_H;
                  const height = Math.max(24, durH * ROW_H);
                  const lane = cita._lane ?? 0;
                  const totalLanes = cita._totalLanes ?? 1;
                  const cancelada = cita.estado === CITA_STATUS.CANCELADA;

                  // 5.5: grupo encadenado
                  const isChained = !!cita.grupo_id;
                  const chainSiblings = isChained ? citasWithLanes.filter((c: any) => c.grupo_id === cita.grupo_id) : [];
                  const chainTotal = chainSiblings.length;
                  const chainPos = isChained ? (cita.orden_en_grupo ?? 0) + 1 : 0;

                  // RN-AG-042: zonas de reposo diferenciadas visualmente
                  const finActiva = cita.fin_activa ? new Date(cita.fin_activa) : null;
                  const finEspera = cita.fin_espera ? new Date(cita.fin_espera) : null;
                  const activaPx = finActiva ? ((finActiva.getTime() - start.getTime()) / (1000 * 60 * 60)) * ROW_H : height;
                  const esperaPx = (finActiva && finEspera) ? ((finEspera.getTime() - finActiva.getTime()) / (1000 * 60 * 60)) * ROW_H : 0;
                  const hasEspera = esperaPx > 2;
                  return (
                    <div
                      key={cita.id}
                      style={{
                        position: 'absolute',
                        top,
                        left: `calc(${(lane / totalLanes) * 100}% + 4px)`,
                        right: `calc(${((totalLanes - lane - 1) / totalLanes) * 100}% + 4px)`,
                        height,
                        boxSizing: 'border-box',
                        pointerEvents: 'auto',
                        background: cancelada ? 'linear-gradient(180deg, #3a3a3a18, #2a2a2a10)' : `linear-gradient(180deg, ${profColor}28, ${profColor}18)`,
                        border: cancelada ? '1px solid #55555540' : `1px solid ${profColor}55`,
                        borderLeft: cancelada ? '3px solid #66666660' : `3px solid ${profColor}`,
                        borderTop: isChained && !cancelada ? `2px solid #a78bfa` : undefined,
                        borderRadius: 8,
                        padding: height <= CITA_CARD_DETAILS_MIN_HEIGHT ? '3px 6px' : '6px 8px',
                        overflow: 'hidden',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        boxShadow: cancelada ? 'none' : `0 8px 8px ${profColor}25`,
                        transition: drag?.cita.id === cita.id ? 'none' : 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: 'scale(1)',
                        opacity: cancelada ? 0.45 : (drag?.cita.id === cita.id ? 0.25 : 1),
                      }}
                      onMouseDown={(e) => { if (!cancelada) startDrag(cita, e); }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = cancelada ? 'none' : `0 12px 12px ${profColor}45`;
                        e.currentTarget.style.borderColor = cancelada ? '#77777770' : `${profColor}99`;
                        if (isChained && !cancelada) e.currentTarget.style.borderTop = '2px solid #a78bfa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = cancelada ? 'none' : `0 8px 8px ${profColor}25`;
                        e.currentTarget.style.borderColor = cancelada ? '#55555540' : `${profColor}55`;
                        if (isChained && !cancelada) e.currentTarget.style.borderTop = '2px solid #a78bfa';
                      }}
                    >
                      {/* RN-AG-042: zona de reposo semitransparente con rayas */}
                      {hasEspera && !cancelada && (
                        <div style={{
                          position: 'absolute',
                          top: activaPx,
                          left: 0,
                          right: 0,
                          height: esperaPx,
                          pointerEvents: 'none',
                          background: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${profColor}12 4px, ${profColor}12 8px)`,
                          borderTop: `1px dashed ${profColor}70`,
                          borderBottom: esperaPx > 2 && finEspera && finEspera < end ? `1px dashed ${profColor}70` : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}>
                          {esperaPx >= 18 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: `${profColor}99`, letterSpacing: 0.5, textTransform: 'uppercase', userSelect: 'none' }}>
                              reposo
                            </span>
                          )}
                        </div>
                      )}
                      {(() => {
                        const narrow = height <= CITA_CARD_DETAILS_MIN_HEIGHT;
                        const nombreCliente = clienteMap?.get(cita.cliente_id)?.nombre || '-';
                        const nombreServicio = servicioMap?.get(cita.servicio_id)?.nombre || '';
                        const timeStr = `${start.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;

                        const esCompletada = cita.estado === CITA_STATUS.COMPLETADA;
                        const esNoShow = cita.estado === CITA_STATUS.NO_PRESENTADA;
                        let icon: any = null;
                        if (!cancelada && !esNoShow) {
                          if (esCompletada) {
                            icon = (
                              <div
                                title="Desmarcar completada"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); toggleCompletada(cita.id, cita.estado); }}
                                style={{ width: 16, height: 16, borderRadius: 999, background: '#22c55e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#16a34a'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = '#22c55e'; }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </div>
                            );
                          } else {
                            icon = (
                              <div
                                title="Marcar como completada"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); toggleCompletada(cita.id, cita.estado); }}
                                style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid rgba(148,163,184,0.4)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', transition: 'all 0.15s ease' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'rgba(34,197,94,0.15)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.4)'; e.currentTarget.style.background = 'transparent'; }}
                              />
                            );
                          }
                        }

                        const chainBadge = isChained ? (
                          <span style={{ fontSize: 8, fontWeight: 700, background: 'rgba(139,92,246,0.25)', color: '#a78bfa', padding: '1px 5px', borderRadius: 4, flexShrink: 0, letterSpacing: 0.3 }}>
                            {chainPos}/{chainTotal}
                          </span>
                        ) : null;

                        const addonsNames = (citaAddonsMap[cita.id] || [])
                          .map((ca: any) => ca.service_addons?.nombre)
                          .filter(Boolean);
                        const addonsStr = addonsNames.length > 0 ? '+ ' + addonsNames.join(', ') : '';

                        if (narrow) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', height: '100%' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: TOKENS.textTer, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                {timeStr}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: cancelada ? TOKENS.textTer : TOKENS.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: cancelada ? 'line-through' : 'none' }}>
                                {nombreCliente}{nombreServicio ? ` · ${nombreServicio}` : ''}{addonsStr ? ` ${addonsStr}` : ''}
                              </span>
                              {chainBadge}
                              {icon}
                            </div>
                          );
                        }

                        return (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600 }}>{timeStr}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {chainBadge}
                                {icon}
                              </div>
                            </div>
                            <div
                              onMouseDown={(e) => { if (onClienteHistorial) e.stopPropagation(); }}
                              onClick={(e) => { if (onClienteHistorial) { e.stopPropagation(); const cli = clientes.find((cl: any) => cl.id === cita.cliente_id); if (cli) onClienteHistorial(cli); } }}
                              style={{ fontSize: 11, fontWeight: 700, color: cancelada ? TOKENS.textTer : TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelada ? 'line-through' : 'none', cursor: onClienteHistorial ? 'pointer' : 'default' }}
                              title="Ver historial de esta clienta"
                            >
                              {nombreCliente}
                            </div>
                            <div style={{ fontSize: 10, color: TOKENS.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {nombreServicio || (cita.servicio_id ? 'Servicio eliminado' : 'Sin servicio')}
                            </div>
                            {addonsStr && (
                              <div style={{ fontSize: 9, color: '#10b981', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {addonsStr}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>

      {/* Ghost element — sigue al cursor durante el arrastre */}
      {drag && (
        <div style={{
          position: 'fixed',
          top: drag.ghostY, left: drag.ghostX,
          width: drag.blockWidth, height: drag.blockHeight,
          pointerEvents: 'none', zIndex: 9999,
          background: `linear-gradient(180deg, ${(profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary)}50, ${(profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary)}30)`,
          border: `2px solid ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}`,
          borderLeft: `4px solid ${profesionales.find((p: any) => p.id === drag.cita.profesional_id)?.color || TOKENS.primary}`,
          borderRadius: 8, padding: '5px 8px',
          boxShadow: `0 12px 32px rgba(0,0,0,0.4)`,
          overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600 }}>
            {String(new Date(drag.cita.inicio).getHours()).padStart(2, '0')}:{String(new Date(drag.cita.inicio).getMinutes()).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clienteMap?.get(drag.cita.cliente_id)?.nombre || '-'}
          </div>
        </div>
      )}

      {/* Toast de error al soltar en posicion invalida */}
      {dragError && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.95)', color: '#fff',
          padding: '10px 20px', borderRadius: 10,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(239,68,68,0.4)',
          pointerEvents: 'none', zIndex: 9999,
        }}>
          {dragError}
        </div>
      )}
    </>
  );
}

function NewCitaModal({ onClose, onSaved, selectedDate }: any) {
  const { triggerRefresh } = useCalendarRefresh();
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [citasHoy, setCitasHoy] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedServicio, setSelectedServicio] = useState('');
  const [selectedProf, setSelectedProf] = useState('');
  const [selectedHora, setSelectedHora] = useState<string>('');
  const [horaPersonalizada, setHoraPersonalizada] = useState<string>('');
  const [useCustomHora, setUseCustomHora] = useState(false);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [duracionOverride, setDuracionOverride] = useState<any>(null);
  const [duracionActivaCustom, setDuracionActivaCustom] = useState<number | null>(null);
  const [duracionEsperaCustom, setDuracionEsperaCustom] = useState<number | null>(null);
  const [duracionActivaExtraCustom, setDuracionActivaExtraCustom] = useState<number | null>(null);
  const [profOverrides, setProfOverrides] = useState<any[]>([]);
  const [errMsg, setErrMsg] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [bloqueosProfHoy, setBloqueosProfHoy] = useState<any[]>([]);
  const [showCreateCliente, setShowCreateCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [citasConfirmadas, setCitasConfirmadas] = useState<any[]>([]);
  const citasConfirmadasRef = useRef<any[]>([]);
  citasConfirmadasRef.current = citasConfirmadas;
  const [allDurOverrides, setAllDurOverrides] = useState<any[]>([]);
  const [addonsDisponibles, setAddonsDisponibles] = useState<any[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [allProfSrvOverrides, setAllProfSrvOverrides] = useState<any[]>([]);
  const [allCatPricing, setAllCatPricing] = useState<any[]>([]);
  const today = selectedDate || new Date();

  useEffect(() => {
    async function cargar() {
      let negocioId = 'prueba_46980';
      const profile = await getUserProfile();
      if (profile?.negocio_id) {
        negocioId = profile.negocio_id;
      }
      setNegocioId(negocioId);
      if (profile?.id) setUserId(profile.id);

      // Construir fecha local sin conversión a UTC
      const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const tomorrow = new Date(today.getTime() + 86400000);
      const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');

      const [{ data: clts, error: cltsErr }, { data: srvs, error: srvsErr }, { data: prfs, error: prfsErr }, { data: cits, error: citsErr }, { data: durOverrides }, { data: profSrvOverrides }, { data: catPr }] = await Promise.all([
        supabase.from('clientes').select('id, nombre, telefono, alergias').eq('negocio_id', negocioId).order('nombre'),
        supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, min_antelacion_min').eq('negocio_id', negocioId).order('nombre'),
        supabase.from('profesionales').select('id, nombre, color, categoria').eq('negocio_id', negocioId).eq('activo', true),
        supabase.from('citas').select('id, inicio, fin, fin_activa, fin_espera, profesional_id, grupo_id, orden_en_grupo').eq('negocio_id', negocioId).gte('inicio', `${todayStr}T00:00:00`).lt('inicio', `${tomorrowStr}T00:00:00`).eq('estado', CITA_STATUS.CONFIRMADA),
        supabase.from('duraciones_profesional').select('profesional_id, servicio_id, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min'),
        supabase.from('professional_service_overrides').select('professional_id, service_id, duracion, duracion_espera_min, duracion_activa_extra_min, precio, activo'),
        supabase.from('service_category_pricing').select('servicio_id, categoria, precio').eq('negocio_id', negocioId),
      ]);

      if (srvsErr) console.error('Servicios error:', srvsErr);
      if (cltsErr) console.error('Clientes error:', cltsErr);
      if (prfsErr) console.error('Profesionales error:', prfsErr);
      if (citsErr) console.error('Citas error:', citsErr);

      console.log('Servicios data:', srvs);
      console.log('Clientes data:', clts);
      console.log('Profesionales data:', prfs);
      console.log('Citas hoy data:', cits);

      setClientes(clts ?? []);
      setServicios(srvs ?? []);
      setProfesionales(prfs ?? []);
      setCitasHoy(cits ?? []);
      setAllDurOverrides(durOverrides ?? []);
      setAllProfSrvOverrides(profSrvOverrides ?? []);
      setAllCatPricing(catPr ?? []);
      setLoading(false);
    }
    cargar();
  }, [today, selectedDate]);

  // Load per-professional duration override when both prof + service are selected
  useEffect(() => {
    // Pre-select suggested hora if chaining, otherwise clear
    const confirmed = citasConfirmadasRef.current;
    if (confirmed.length > 0) {
      const lastFin = confirmed[confirmed.length - 1].fin as Date;
      setSelectedHora(`${String(lastFin.getHours()).padStart(2, '0')}:${String(lastFin.getMinutes()).padStart(2, '0')}`);
    } else {
      setSelectedHora('');
    }
    setHoraPersonalizada('');
    setUseCustomHora(false);
    if (!selectedProf || !selectedServicio) {
      setDuracionOverride(null);
      setDuracionActivaCustom(null);
      setDuracionEsperaCustom(null);
      setDuracionActivaExtraCustom(null);
      return;
    }
    supabase
      .from('duraciones_profesional')
      .select('duracion_activa_min, duracion_espera_min, duracion_activa_extra_min')
      .eq('profesional_id', selectedProf)
      .eq('servicio_id', selectedServicio)
      .maybeSingle()
      .then(({ data }) => {
        setDuracionOverride(data ?? null);
        setDuracionActivaCustom(null);
        setDuracionEsperaCustom(null);
        setDuracionActivaExtraCustom(null);
      });
  }, [selectedProf, selectedServicio]);

  // Reset confirmed chain when client changes
  useEffect(() => {
    setCitasConfirmadas([]);
  }, [selectedCliente]);

  // Fetch add-ons for the selected service
  useEffect(() => {
    setSelectedAddons([]);
    if (!selectedServicio) { setAddonsDisponibles([]); return; }
    supabase
      .from('service_addons')
      .select('id, nombre, duracion_min, precio')
      .eq('servicio_id', selectedServicio)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setAddonsDisponibles(data ?? []));
  }, [selectedServicio]);

  useEffect(() => {
    if (!selectedProf) { setProfOverrides([]); return; }
    supabase
      .from('professional_service_overrides')
      .select('*')
      .eq('professional_id', selectedProf)
      .then(({ data }) => {
        const ovs = data ?? [];
        setProfOverrides(ovs);
        setSelectedServicio(prev => {
          if (!prev) return prev;
          const ov = ovs.find((o: any) => o.service_id === prev);
          return ov?.activo === false ? '' : prev;
        });
      });
  }, [selectedProf]);

  useEffect(() => {
    if (!selectedProf || !negocioId) { setBloqueosProfHoy([]); return; }
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const tomorrow = new Date(today.getTime() + 86400000);
    const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    supabase
      .from('bloqueos_profesional')
      .select('inicio, fin, tipo, motivo')
      .eq('profesional_id', selectedProf)
      .lt('inicio', `${tomorrowStr}T00:00:00`)
      .gt('fin', `${todayStr}T00:00:00`)
      .then(({ data }) => setBloqueosProfHoy(data ?? []));
  }, [selectedProf, negocioId]);

  const servicioActual = servicios.find((s) => s.id === selectedServicio);
  const profServicioOverride = profOverrides.find((o) => o.service_id === selectedServicio);
  const resolvedPrecio = useMemo(() => {
    if (!servicioActual) return 0;
    if (profServicioOverride?.precio != null) return profServicioOverride.precio;
    const profCat = profesionales.find((p: any) => p.id === selectedProf)?.categoria;
    if (profCat) {
      const cp = allCatPricing.find((c: any) => c.servicio_id === servicioActual.id && c.categoria === profCat);
      if (cp) return cp.precio;
    }
    return servicioActual.precio ?? 0;
  }, [servicioActual, profServicioOverride, selectedProf, profesionales, allCatPricing]);

  const serviciosFiltrados = useMemo(
    () => servicios.filter((s) => {
      const ov = profOverrides.find((o: any) => o.service_id === s.id);
      return ov?.activo !== false;
    }),
    [servicios, profOverrides]
  );

  // Duration resolution: manual → prof service override → duraciones_profesional → service default
  const duracionActiva = duracionActivaCustom
    ?? profServicioOverride?.duracion
    ?? duracionOverride?.duracion_activa_min
    ?? servicioActual?.duracion_activa_min
    ?? 30;
  const duracionEspera = duracionEsperaCustom
    ?? profServicioOverride?.duracion_espera_min
    ?? duracionOverride?.duracion_espera_min
    ?? servicioActual?.duracion_espera_min
    ?? 0;
  const duracionActivaExtra = duracionActivaExtraCustom
    ?? profServicioOverride?.duracion_activa_extra_min
    ?? duracionOverride?.duracion_activa_extra_min
    ?? servicioActual?.duracion_activa_extra_min
    ?? 0;
  const addonsDuracion = selectedAddons.reduce((sum, aid) => {
    const a = addonsDisponibles.find((x: any) => x.id === aid);
    return sum + (a?.duracion_min ?? 0);
  }, 0);
  const duracionTotal = duracionActiva + duracionEspera + duracionActivaExtra + addonsDuracion;

  const horaActual = (useCustomHora && horaPersonalizada) || selectedHora;
  let inicio: Date | null = null;
  let finActiva: Date | null = null;
  let finEspera: Date | null = null;
  let fin: Date | null = null;

  if (horaActual) {
    const [hh, mm] = horaActual.split(':').map(Number);
    inicio = new Date(today);
    inicio.setHours(hh, mm, 0, 0);
    finActiva = new Date(inicio.getTime() + duracionActiva * 60000);
    finEspera = new Date(finActiva.getTime() + duracionEspera * 60000);
    fin = new Date(finEspera.getTime() + (duracionActivaExtra + addonsDuracion) * 60000);
  }

  // RN-AG-072: detectar si la hora seleccionada aprovecha un reposo existente
  const citaHostReposo = (inicio && finActiva && selectedProf) ? citasHoy.find((c: any) => {
    if (c.profesional_id !== selectedProf || !c.fin_activa || !c.fin_espera) return false;
    const cFinActiva = new Date(c.fin_activa);
    const cFinEspera = new Date(c.fin_espera);
    const cFin = new Date(c.fin);
    const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
    return inicio! >= cFinActiva && (hasSegundaFase ? finActiva! < cFinEspera : finActiva! <= cFinEspera);
  }) : null;

  // Hora sugerida: fin del ultimo servicio confirmado
  const horaSugerida = citasConfirmadas.length > 0
    ? (() => {
        const lastFin = citasConfirmadas[citasConfirmadas.length - 1].fin as Date;
        return `${String(lastFin.getHours()).padStart(2, '0')}:${String(lastFin.getMinutes()).padStart(2, '0')}`;
      })()
    : null;

  // Totales agregados (confirmadas + actual)
  const totalPrecioEncadenado = useMemo(() => {
    let total = resolvedPrecio;
    for (const c of citasConfirmadas) {
      total += c.precio ?? 0;
    }
    return total;
  }, [citasConfirmadas, resolvedPrecio]);

  const totalDuracionEncadenado = useMemo(() => {
    let total = duracionTotal;
    for (const c of citasConfirmadas) {
      total += c.durActiva + c.durEspera + c.durActivaExtra + (c.addonsDuracion ?? 0);
    }
    return total;
  }, [citasConfirmadas, duracionTotal]);

  const handleEncadenarServicio = () => {
    if (!selectedServicio || !selectedProf || !horaActual || !inicio || !fin || !finActiva || !finEspera) return;
    const srv = servicios.find((s: any) => s.id === selectedServicio);
    const prof = profesionales.find((p: any) => p.id === selectedProf);
    const nuevaCita = {
      servicioId: selectedServicio,
      profId: selectedProf,
      hora: horaActual,
      servicioNombre: srv?.nombre || '',
      profNombre: prof?.nombre || '',
      profColor: prof?.color || '',
      precio: resolvedPrecio,
      durActiva: duracionActiva,
      durEspera: duracionEspera,
      durActivaExtra: duracionActivaExtra,
      addonsDuracion,
      addons: [...selectedAddons],
      inicio: new Date(inicio),
      finActiva: new Date(finActiva),
      finEspera: new Date(finEspera),
      fin: new Date(fin),
    };
    setCitasConfirmadas([...citasConfirmadas, nuevaCita]);
    // Reset form para siguiente servicio (mantener cliente)
    setSelectedServicio('');
    setSelectedProf('');
    setSelectedHora('');
    setHoraPersonalizada('');
    setUseCustomHora(false);
    setSelectedAddons([]);
    setDuracionOverride(null);
    setDuracionActivaCustom(null);
    setDuracionEsperaCustom(null);
    setDuracionActivaExtraCustom(null);
  };

  const handleGuardar = async () => {
    // Determinar si el form actual tiene un servicio completo
    const formCompleto = !!(selectedServicio && selectedProf && horaActual && inicio && fin && finActiva && finEspera);
    const totalCitas = citasConfirmadas.length + (formCompleto ? 1 : 0);

    if (totalCitas === 0) {
      setErrMsg('Por favor completa todos los campos');
      return;
    }
    if (!selectedCliente) {
      setErrMsg('Por favor selecciona un cliente');
      return;
    }

    setErrMsg('');
    setGuardando(true);

    try {
      // Construir lista de todas las citas a guardar
      const grupoId = totalCitas > 1 ? crypto.randomUUID() : null;
      const citasAGuardar: any[] = [];
      let ordenIdx = 0;

      // Primero: citas confirmadas
      for (const confirmed of citasConfirmadas) {
        citasAGuardar.push({
          negocio_id: negocioId,
          profesional_id: confirmed.profId,
          servicio_id: confirmed.servicioId,
          cliente_id: selectedCliente || null,
          inicio: confirmed.inicio.toISOString(),
          fin: confirmed.fin.toISOString(),
          fin_activa: confirmed.finActiva.toISOString(),
          fin_espera: confirmed.finEspera.toISOString(),
          estado: CITA_STATUS.CONFIRMADA,
          canal: 'manual',
          creado_por: userId,
          ...(grupoId && { grupo_id: grupoId, orden_en_grupo: ordenIdx }),
          _addons: confirmed.addons || [],
        });
        ordenIdx++;
      }

      // Luego: servicio actual del form (si esta completo)
      if (formCompleto) {
        citasAGuardar.push({
          negocio_id: negocioId,
          profesional_id: selectedProf,
          servicio_id: selectedServicio,
          cliente_id: selectedCliente || null,
          inicio: inicio!.toISOString(),
          fin: fin!.toISOString(),
          fin_activa: finActiva!.toISOString(),
          fin_espera: finEspera!.toISOString(),
          estado: CITA_STATUS.CONFIRMADA,
          canal: 'manual',
          creado_por: userId,
          ...(grupoId && { grupo_id: grupoId, orden_en_grupo: ordenIdx }),
          _addons: [...selectedAddons],
        });
      }

      // Validar cada cita contra DB y entre si
      for (let i = 0; i < citasAGuardar.length; i++) {
        const cita = citasAGuardar[i];
        const cInicio = new Date(cita.inicio);
        const cFinActiva = new Date(cita.fin_activa);
        const cFinEspera = new Date(cita.fin_espera);
        const cFin = new Date(cita.fin);

        // Check bloqueos
        const { data: bloqueos } = await supabase
          .from('bloqueos_profesional')
          .select('tipo, motivo')
          .eq('profesional_id', cita.profesional_id)
          .lt('inicio', cita.fin)
          .gt('fin', cita.inicio);

        if (bloqueos && bloqueos.length > 0) {
          const profName = profesionales.find((p: any) => p.id === cita.profesional_id)?.nombre || 'Profesional';
          setErrMsg(`${profName} no disponible (servicio ${i + 1}): ${bloqueos[0].motivo || bloqueos[0].tipo}`);
          setGuardando(false);
          return;
        }

        // Check overlap contra DB (ambas fases activas)
        const { data: candidatas } = await supabase
          .from('citas')
          .select('id, inicio, fin_activa, fin_espera, fin')
          .eq('profesional_id', cita.profesional_id)
          .eq('estado', CITA_STATUS.CONFIRMADA)
          .lt('inicio', cita.fin)
          .gt('fin', cita.inicio);

        const solapadas = (candidatas || []).filter((c: any) => {
          const ci = new Date(c.inicio);
          const cfa = new Date(c.fin_activa);
          const cfe = c.fin_espera ? new Date(c.fin_espera) : null;
          const cf = new Date(c.fin);
          if (ci < cFinActiva && cfa > cInicio) return true;
          if (cfe && cf.getTime() > cfe.getTime() && cfe < cFinActiva && cf > cInicio) return true;
          return false;
        });

        if (solapadas.length > 0) {
          const profName = profesionales.find((p: any) => p.id === cita.profesional_id)?.nombre || 'Profesional';
          setErrMsg(`Conflicto: servicio ${i + 1} con ${profName} se solapa con otra cita activa.`);
          setGuardando(false);
          return;
        }

        // Check intra-group overlap (same prof doing multiple services in chain)
        const intraConflict = citasAGuardar.some((prev: any, j: number) => {
          if (j >= i || prev.profesional_id !== cita.profesional_id) return false;
          const prevInicio = new Date(prev.inicio);
          const prevFinActiva = new Date(prev.fin_activa);
          return cInicio < prevFinActiva && cFinActiva > prevInicio;
        });
        if (intraConflict) {
          const profName = profesionales.find((p: any) => p.id === cita.profesional_id)?.nombre || 'Profesional';
          setErrMsg(`Conflicto interno: servicio ${i + 1} con ${profName} se solapa con otro servicio del encadenado.`);
          setGuardando(false);
          return;
        }
      }

      // Extraer addons antes de insertar (no es columna de DB)
      const addonsPerCita = citasAGuardar.map(c => c._addons || []);
      const citasParaDB = citasAGuardar.map(({ _addons, ...rest }) => rest);

      // Insert all citas
      const { data: citasInsertadas, error } = await supabase.from('citas').insert(citasParaDB).select();

      setGuardando(false);
      if (error) {
        setErrMsg(error.message);
        if (grupoId) {
          await supabase.from('citas').delete().eq('grupo_id', grupoId);
        }
        return;
      }

      // Insert add-ons for each cita
      if (citasInsertadas) {
        for (let i = 0; i < citasInsertadas.length; i++) {
          const addons = addonsPerCita[i];
          if (addons.length > 0 && citasInsertadas[i]?.id) {
            await supabase.from('cita_addons').insert(
              addons.map((aid: string) => ({ cita_id: citasInsertadas[i].id, addon_id: aid }))
            );
          }
        }
      }

      triggerRefresh();
      onSaved?.(citasInsertadas?.[0] ?? null) ?? onClose();
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Error inesperado');
      setGuardando(false);
    }
  };

  const handleCreateCliente = async () => {
    if (!nuevoClienteNombre.trim()) {
      alert('Por favor ingresa el nombre del cliente');
      return;
    }
    setCreandoCliente(true);
    try {
      const { data, error } = await supabase.from('clientes').insert({
        negocio_id: negocioId,
        nombre: nuevoClienteNombre.trim(),
        telefono: nuevoClienteTelefono.trim() || null,
      }).select();
      if (error) throw error;
      const nuevoCliente = data?.[0];
      if (nuevoCliente) {
        setClientes([...clientes, nuevoCliente]);
        setSelectedCliente(nuevoCliente.id);
        setNuevoClienteNombre('');
        setNuevoClienteTelefono('');
        setShowCreateCliente(false);
      }
    } catch (e: any) {
      alert('Error al crear cliente: ' + (e?.message ?? 'desconocido'));
    } finally {
      setCreandoCliente(false);
    }
  };

  if (loading) return <div style={{ background: '#0b1220', height: '100vh', width: '100%' }} />;

  const clienteSeleccionado = clientes.find(c => c.id === selectedCliente);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)', animation: 'scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TOKENS.text }}>Nueva cita</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18, transition: 'all 0.2s ease', transform: 'scale(1) rotate(0deg)' }} onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.border; e.currentTarget.style.color = TOKENS.text; e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = TOKENS.bgCard; e.currentTarget.style.color = TOKENS.textSec; e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}>
            ✕
          </button>
        </div>

        {/* Tarjetas de servicios confirmados (encadenados) */}
        {citasConfirmadas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              Servicios confirmados ({citasConfirmadas.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {citasConfirmadas.map((cita: any, idx: number) => (
                <div key={idx} style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 999, background: cita.profColor || TOKENS.primary, color: '#fff', fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{cita.servicioNombre}</span>
                    </div>
                    <div style={{ fontSize: 10, color: TOKENS.textSec, marginTop: 3, marginLeft: 24 }}>
                      {cita.profNombre} -- {cita.inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} a {cita.fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.success, marginRight: 8 }}>{cita.precio}{'€'}</div>
                  <button
                    onClick={() => setCitasConfirmadas(citasConfirmadas.filter((_: any, i: number) => i !== idx))}
                    style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: TOKENS.danger, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', transition: 'all 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            {!selectedServicio && (
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 6, fontStyle: 'italic' }}>
                Selecciona el siguiente servicio o pulsa Reservar para guardar
              </div>
            )}
          </div>
        )}

        {/* Stepper with dividers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: n < 3 ? 1 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: (n === 1 && selectedCliente) || (n === 2 && selectedServicio) || (n === 3 && selectedHora) ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.06)', border: `1px solid ${(n === 1 && selectedCliente) || (n === 2 && selectedServicio) || (n === 3 && selectedHora) ? 'rgba(99,102,241,0.4)' : TOKENS.border}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 999, background: (n === 1 && selectedCliente) || (n === 2 && selectedServicio) || (n === 3 && selectedHora) ? TOKENS.primary : 'rgba(148,163,184,0.18)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                  {n}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: (n === 1 && selectedCliente) || (n === 2 && selectedServicio) || (n === 3 && selectedHora) ? TOKENS.primaryHi : TOKENS.textSec }}>
                  {['Cliente', 'Servicio', 'Hora'][n - 1]}
                </span>
              </div>
              {n < 3 && <div style={{ flex: 1, height: 1, background: TOKENS.border }} />}
            </div>
          ))}
        </div>

        {/* FormField Cliente */}
        {citasConfirmadas.length > 0 ? (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', border: `1px solid rgba(99,102,241,0.2)`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clienta:</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.primaryHi }}>{clientes.find((c: any) => c.id === selectedCliente)?.nombre || ''}</div>
          </div>
        ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Clienta</div>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={clienteSearch}
            onChange={(e) => setClienteSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: 8,
              color: TOKENS.text,
              fontSize: 12,
              marginBottom: 10,
              boxSizing: 'border-box',
              transition: 'all 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${TOKENS.primarySoft}`;
              e.currentTarget.style.background = TOKENS.bgCard;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
            {clientes.filter((c) => norm(c.nombre).includes(norm(clienteSearch))).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCliente(c.id)}
                style={{
                  padding: '8px 12px',
                  background: selectedCliente === c.id ? 'rgba(99,102,241,0.18)' : TOKENS.bgCard,
                  border: `1px solid ${selectedCliente === c.id ? 'rgba(99,102,241,0.4)' : TOKENS.border}`,
                  borderRadius: 8,
                  color: selectedCliente === c.id ? TOKENS.primaryHi : TOKENS.textSec,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: selectedCliente === c.id ? 600 : 500,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.2)`;
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = selectedCliente === c.id ? 'rgba(99,102,241,0.4)' : TOKENS.border;
                }}
              >
                {c.nombre}
              </button>
            ))}
            <button
              onClick={() => setShowCreateCliente(true)}
              style={{
                padding: '8px 12px',
                background: 'rgba(16,185,129,0.1)',
                border: `1px dashed rgba(16,185,129,0.35)`,
                borderRadius: 8,
                color: TOKENS.success,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.18)';
                e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.1)';
                e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)';
              }}
            >
              + Crear
            </button>
          </div>
        </div>
        )}

        {/* Selected client card */}
        {selectedCliente && clienteSeleccionado && citasConfirmadas.length === 0 && (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.08)', border: `1px solid rgba(99,102,241,0.30)`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: `linear-gradient(135deg, ${TOKENS.primary}, ${TOKENS.primaryHi})`, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {clienteSeleccionado.nombre.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{clienteSeleccionado.nombre}</div>
              <div style={{ fontSize: 10, color: TOKENS.textTer }}>{clienteSeleccionado.telefono || 'Sin teléfono'}</div>
            </div>
            <div style={{ background: TOKENS.warning, color: TOKENS.bg, padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
              VIP
            </div>
          </div>
        )}

        {/* FormField Servicio */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Servicio</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(selectedProf ? serviciosFiltrados : servicios).map((s) => {
              const ov = profOverrides.find((o: any) => o.service_id === s.id);
              const catalogDur = (s.duracion_activa_min || 0) + (s.duracion_espera_min || 0) + (s.duracion_activa_extra_min || 0);
              const efectivoDur = selectedProf && ov?.duracion != null
                ? (ov.duracion + (ov.duracion_espera_min ?? s.duracion_espera_min ?? 0) + (ov.duracion_activa_extra_min ?? s.duracion_activa_extra_min ?? 0))
                : (catalogDur || 30);
              const profCat = profesionales.find((p: any) => p.id === selectedProf)?.categoria;
              const catPrice = profCat ? allCatPricing.find((cp: any) => cp.servicio_id === s.id && cp.categoria === profCat) : null;
              const efectivoPrecio = selectedProf && ov?.precio != null ? ov.precio : (catPrice ? catPrice.precio : s.precio);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedServicio(s.id)}
                  style={{
                    padding: '12px',
                    background: selectedServicio === s.id ? 'rgba(99,102,241,0.12)' : TOKENS.bgCard,
                    border: `1px solid ${selectedServicio === s.id ? 'rgba(99,102,241,0.4)' : TOKENS.border}`,
                    borderRadius: 10,
                    color: TOKENS.text,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                    transform: 'translateY(0)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = TOKENS.primary;
                    e.currentTarget.style.boxShadow = `0 4px 16px rgba(99,102,241,0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = selectedServicio === s.id ? 'rgba(99,102,241,0.4)' : TOKENS.border;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>{s.nombre}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: TOKENS.textTer }}>{efectivoDur} min</span>
                    <span style={{ fontSize: 10, color: TOKENS.success, fontWeight: 700 }}>{efectivoPrecio}€</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Add-ons opcionales (5.6) */}
        {selectedServicio && addonsDisponibles.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Add-ons</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {addonsDisponibles.map((a: any) => {
                const sel = selectedAddons.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAddons(sel ? selectedAddons.filter(x => x !== a.id) : [...selectedAddons, a.id])}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: sel ? 'rgba(16,185,129,0.12)' : TOKENS.bgCard,
                      border: `1px solid ${sel ? 'rgba(16,185,129,0.5)' : TOKENS.border}`,
                      color: sel ? TOKENS.success : TOKENS.textSec,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {a.nombre} <span style={{ fontSize: 9, color: TOKENS.textTer, fontWeight: 400 }}>+{a.duracion_min}min · {a.precio}€</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* FormField Profesional */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Profesional</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profesionales.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setSelectedProf(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  borderRadius: 999,
                  background: selectedProf === p.id ? `${p.color}22` : 'rgba(148,163,184,0.06)',
                  border: `1px solid ${selectedProf === p.id ? `${p.color}66` : TOKENS.border}`,
                  color: selectedProf === p.id ? p.color : TOKENS.textSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  e.currentTarget.style.background = `${p.color}2a`;
                  e.currentTarget.style.boxShadow = `0 4px 12px ${p.color}33`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.background = selectedProf === p.id ? `${p.color}22` : 'rgba(148,163,184,0.06)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: 999, background: p.color }} />
                {p.nombre.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* FormField Hora - 5 columns, 10 slots */}
        {selectedProf && selectedServicio && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Hora · {today.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            {today.toDateString() === new Date().toDateString() && (
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginBottom: 8, textAlign: 'center', borderBottom: `1px dashed ${TOKENS.borderHi}`, paddingBottom: 6 }}>
                Ahora: {new Date().getHours().toString().padStart(2, '0')}:{new Date().getMinutes().toString().padStart(2, '0')}
              </div>
            )}
            {(() => {
              const slots = generarSlotsHorarios();
              // RN-AG-070/071: añadir fin_activa exacto como slot extra si no es múltiplo de 15
              const slotsSet = new Set(slots);
              const extraSlots: string[] = [];
              citasHoy.forEach((c: any) => {
                if (c.profesional_id !== selectedProf || !c.fin_activa || !c.fin_espera) return;
                const cFinActiva = new Date(c.fin_activa);
                const cFinEspera = new Date(c.fin_espera);
                const cFin = new Date(c.fin);
                const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
                const slotFinActiva = new Date(cFinActiva.getTime() + duracionActiva * 60000);
                // Si hay segunda fase activa, la activa debe terminar ANTES del fin del reposo (no justo al límite)
                if (hasSegundaFase ? slotFinActiva >= cFinEspera : slotFinActiva > cFinEspera) return;
                const timeStr = `${String(cFinActiva.getHours()).padStart(2, '0')}:${String(cFinActiva.getMinutes()).padStart(2, '0')}`;
                if (!slotsSet.has(timeStr)) extraSlots.push(timeStr);
              });
              const allSlots = [...slots, ...extraSlots].sort();

              // pre-calculate which slots fit within a rest phase
              const reposaSlots = new Set<string>();
              allSlots.forEach((time) => {
                const [h, m] = time.split(':').map(Number);
                const slotInicio = new Date(today); slotInicio.setHours(h, m, 0, 0);
                const slotFinActiva = new Date(slotInicio.getTime() + duracionActiva * 60000);
                const encajaEnReposo = citasHoy.some((c: any) => {
                  if (c.profesional_id !== selectedProf || !c.fin_activa || !c.fin_espera) return false;
                  const cFinActiva = new Date(c.fin_activa);
                  const cFinEspera = new Date(c.fin_espera);
                  const cFin = new Date(c.fin);
                  const hasSegundaFase = cFinEspera.getTime() < cFin.getTime();
                  // Si hay segunda fase activa, la nueva activa debe terminar ANTES del reposo (no justo al límite)
                  return slotInicio >= cFinActiva && (hasSegundaFase ? slotFinActiva < cFinEspera : slotFinActiva <= cFinEspera);
                });
                if (encajaEnReposo) reposaSlots.add(time);
              });
              const primerReposo = allSlots.find(t => reposaSlots.has(t));

              // Count only reposo slots that are actually available (not occupied)
              let visibleReposoCount = 0;
              reposaSlots.forEach((time) => {
                const [rh, rm] = time.split(':').map(Number);
                const rInicio = new Date(today); rInicio.setHours(rh, rm, 0, 0);
                const rFinActiva = new Date(rInicio.getTime() + duracionActiva * 60000);
                const rOcc1 = isTimeSlotOccupied(rInicio, rFinActiva, citasHoy, selectedProf);
                const rOcc2 = duracionActivaExtra > 0 && isTimeSlotOccupied(
                  new Date(rInicio.getTime() + (duracionActiva + duracionEspera) * 60000),
                  new Date(rInicio.getTime() + duracionTotal * 60000),
                  citasHoy, selectedProf
                );
                const rFin = new Date(rInicio.getTime() + duracionTotal * 60000);
                const rBlocked = bloqueosProfHoy.some((b: any) => new Date(b.inicio) < rFin && new Date(b.fin) > rInicio);
                if (!rOcc1 && !rOcc2 && !rBlocked) visibleReposoCount++;
              });

              return (
                <>
                  {visibleReposoCount > 0 && (
                    <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#f59e0b', display: 'inline-block', flexShrink: 0 }} />
                      {visibleReposoCount} hueco{visibleReposoCount > 1 ? 's' : ''} aprovecha{visibleReposoCount === 1 ? '' : 'n'} tiempo de reposo
                    </div>
                  )}
                  {horaSugerida && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: '#a78bfa', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>Hora sugerida (fin servicio anterior)</div>
                      <button
                        onClick={() => {
                          setHoraPersonalizada('');
                          setUseCustomHora(false);
                          selectedHora === horaSugerida ? setSelectedHora('') : setSelectedHora(horaSugerida);
                        }}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: `1.5px solid ${selectedHora === horaSugerida && !horaPersonalizada ? '#a78bfa' : 'rgba(167,139,250,0.4)'}`,
                          background: selectedHora === horaSugerida && !horaPersonalizada ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.06)',
                          color: '#a78bfa',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {horaSugerida}
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
                    {allSlots.map((time) => {
                      const [h, m] = time.split(':').map(Number);
                      const testInicio = new Date(today);
                      testInicio.setHours(h, m, 0, 0);
                      const testFinActiva = new Date(testInicio.getTime() + duracionActiva * 60000);
                      const occupied1 = isTimeSlotOccupied(testInicio, testFinActiva, citasHoy, selectedProf);
                      const occupied2 = duracionActivaExtra > 0 && isTimeSlotOccupied(
                        new Date(testInicio.getTime() + (duracionActiva + duracionEspera) * 60000),
                        new Date(testInicio.getTime() + duracionTotal * 60000),
                        citasHoy,
                        selectedProf
                      );
                      const testFin = new Date(testInicio.getTime() + duracionTotal * 60000);
                      const blockedByAusencia = bloqueosProfHoy.some((b: any) =>
                        new Date(b.inicio) < testFin && new Date(b.fin) > testInicio
                      );

                      if (occupied1 || occupied2 || blockedByAusencia) return null;

                      const selected = (selectedHora === time && !horaPersonalizada);
                      const esReposo = reposaSlots.has(time);

                      return (
                        <button
                          key={time}
                          onClick={() => {
                            setHoraPersonalizada('');
                            selected ? setSelectedHora('') : setSelectedHora(time);
                          }}
                          style={{
                            width: '100%',
                            padding: esReposo ? '5px 0 4px' : '8px 0',
                            borderRadius: 8,
                            background: selected
                              ? `linear-gradient(180deg,#7c83ff,#6366f1)`
                              : esReposo ? 'rgba(245,158,11,0.08)' : TOKENS.bgCard,
                            border: `1px solid ${selected ? '#6366f1' : esReposo ? 'rgba(245,158,11,0.45)' : TOKENS.border}`,
                            color: selected ? '#fff' : esReposo ? '#f59e0b' : TOKENS.textSec,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: 'scale(1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.08)';
                            if (!selected) {
                              e.currentTarget.style.borderColor = esReposo ? '#f59e0b' : TOKENS.primary;
                              e.currentTarget.style.boxShadow = esReposo ? `0 4px 12px rgba(245,158,11,0.25)` : `0 4px 12px rgba(99,102,241,0.2)`;
                            } else {
                              e.currentTarget.style.boxShadow = `0 6px 20px rgba(99,102,241,0.4)`;
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.borderColor = selected ? '#6366f1' : esReposo ? 'rgba(245,158,11,0.45)' : TOKENS.border;
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <span>{time}</span>
                          {esReposo && (
                            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.4, opacity: selected ? 0.8 : 1, color: selected ? '#fff' : '#f59e0b' }}>
                              espera
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!useCustomHora ? (
                <button
                  onClick={() => { setUseCustomHora(true); setSelectedHora(''); setHoraPersonalizada('09:00'); }}
                  style={{ background: 'none', border: `1px dashed ${TOKENS.border}`, borderRadius: 8, padding: '8px 12px', color: TOKENS.textTer, fontSize: 11, cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.color = TOKENS.primaryHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textTer; }}
                >
                  + Hora personalizada
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: TOKENS.textSec }}>Hora personalizada:</span>
                    <button
                      onClick={() => { setUseCustomHora(false); setHoraPersonalizada(''); }}
                      style={{ background: 'none', border: 'none', color: TOKENS.textTer, fontSize: 11, cursor: 'pointer', padding: '2px 6px' }}
                    >
                      ✕ Cancelar
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <TimeDrumPicker
                      value={horaPersonalizada}
                      onChange={(v) => { setHoraPersonalizada(v); setSelectedHora(''); }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RN-AG-072: info banner cuando la hora aprovecha un reposo */}
        {citaHostReposo && horaActual && (
          <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#f59e0b', lineHeight: '1.4' }}>
              Esta hora aprovecha el tiempo de reposo de otra cita. El profesional atendera este servicio mientras la cita anterior reposa.
            </span>
          </div>
        )}

        {/* Total estimado */}
        {(selectedCliente && selectedServicio && selectedProf && horaActual) && (
          <div style={{ marginTop: 0, padding: 12, background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.25)`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: TOKENS.textSec }}>
              Total estimado {citasConfirmadas.length > 0 && `(${citasConfirmadas.length + 1} servicios)`}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.success }}>{totalPrecioEncadenado}{'€'}</div>
          </div>
        )}

        {errMsg && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 10, padding: 12, marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: TOKENS.danger }}>{errMsg}</div>
          </div>
        )}

        {/* Modal crear cliente */}
        {showCreateCliente && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'grid', placeItems: 'center', zIndex: 200 }}>
            <div style={{ background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 14, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: TOKENS.text }}>Nuevo cliente</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec, display: 'block', marginBottom: 6 }}>Nombre</label>
                  <input
                    type="text"
                    value={nuevoClienteNombre}
                    onChange={(e) => setNuevoClienteNombre(e.target.value)}
                    placeholder="Ej: Juan García"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 8,
                      color: TOKENS.text,
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec, display: 'block', marginBottom: 6 }}>Teléfono (opcional)</label>
                  <input
                    type="tel"
                    value={nuevoClienteTelefono}
                    onChange={(e) => setNuevoClienteTelefono(e.target.value)}
                    placeholder="Ej: +34 666 123 456"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      borderRadius: 8,
                      color: TOKENS.text,
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowCreateCliente(false)}
                  disabled={creandoCliente}
                  style={{
                    padding: '9px 18px',
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                    color: TOKENS.text,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateCliente}
                  disabled={creandoCliente}
                  style={{
                    padding: '9px 18px',
                    background: TOKENS.success,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: creandoCliente ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: creandoCliente ? 0.7 : 1,
                  }}
                >
                  {creandoCliente ? '...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom buttons */}
        {(() => {
          const formCompleto = !!(selectedCliente && selectedServicio && selectedProf && horaActual);
          const totalCitas = citasConfirmadas.length + (formCompleto ? 1 : 0);
          const puedeGuardar = totalCitas > 0 && selectedCliente && !guardando;
          const puedeEncadenar = formCompleto && !guardando;
          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 18px',
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  color: TOKENS.text,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.borderHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; }}
              >
                Cancelar
              </button>
              {puedeEncadenar && (
                <button
                  onClick={handleEncadenarServicio}
                  style={{
                    padding: '9px 18px',
                    background: 'rgba(139,92,246,0.1)',
                    border: '1px solid rgba(139,92,246,0.35)',
                    color: '#a78bfa',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.18)'; e.currentTarget.style.borderColor = '#a78bfa'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)'; }}
                >
                  + Encadenar otro
                </button>
              )}
              <button
                onClick={handleGuardar}
                disabled={!puedeGuardar}
                style={{
                  padding: '9px 18px',
                  background: !puedeGuardar ? 'rgba(99,102,241,0.5)' : `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: !puedeGuardar ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: !puedeGuardar ? 'none' : `0 4px 12px rgba(99,102,241,0.4)`,
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: 'translateY(0)',
                }}
                onMouseEnter={(e) => {
                  if (puedeGuardar) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 8px 24px rgba(99,102,241,0.6)`;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = puedeGuardar ? `0 4px 12px rgba(99,102,241,0.4)` : 'none';
                }}
              >
                {guardando ? '...' : totalCitas > 1 ? `Reservar ${totalCitas} citas` : 'Reservar cita'}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TimeBtn({ onClick, plus }: { onClick: () => void; plus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 7,
        background: 'rgba(148,163,184,0.08)',
        border: `1px solid ${TOKENS.border}`,
        color: TOKENS.textSec,
        cursor: 'pointer',
        fontSize: 16, fontWeight: 700,
        display: 'grid', placeItems: 'center',
        fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      {plus ? '+' : '−'}
    </button>
  );
}

function TimeNumBox({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 2,
      padding: '5px 10px', borderRadius: 8,
      background: 'rgba(99,102,241,0.13)',
      border: '1px solid rgba(99,102,241,0.22)',
      minWidth: label === 'h' ? 46 : 52,
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: TOKENS.primary, fontFamily: 'inherit' }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: TOKENS.primary, fontFamily: 'inherit' }}>{label}</span>
    </div>
  );
}

function DetalleCitaModal({ onClose, onSaved, cita, servicios, clientes, profesionales, citasHoy, allCitas }: any) {
  const router = useRouter();
  const { triggerRefresh } = useCalendarRefresh();
  const cliente = clientes.find((c: any) => c.id === cita.cliente_id);
  const servicio = servicios.find((s: any) => s.id === cita.servicio_id);
  const prof = profesionales.find((p: any) => p.id === cita.profesional_id);

  const [selectedCliente, setSelectedCliente] = useState(cliente);
  const [selectedServicio, setSelectedServicio] = useState(servicio);
  const [selectedProf, setSelectedProf] = useState(prof);
  const [estado, setEstado] = useState(cita.estado);
  const [qCli, setQCli] = useState('');
  const [qSrv, setQSrv] = useState('');
  const [openCli, setOpenCli] = useState(false);
  const [openSrv, setOpenSrv] = useState(false);
  const [openEst, setOpenEst] = useState(false);
  const [activo, setActivo] = useState(cita.fin_activa ? Math.round((new Date(cita.fin_activa).getTime() - new Date(cita.inicio).getTime()) / 60000) : 30);
  const [espera, setEspera] = useState(cita.fin_espera ? Math.round((new Date(cita.fin_espera).getTime() - new Date(cita.fin_activa).getTime()) / 60000) : 0);
  const [activo2, setActivo2] = useState(cita.fin ? Math.round((new Date(cita.fin).getTime() - new Date(cita.fin_espera).getTime()) / 60000) : 0);
  const [guardando, setGuardando] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [canceladoPor, setCanceladoPor] = useState<'clienta' | 'negocio'>('negocio');
  const [fechaEditada, setFechaEditada] = useState(() => new Date(cita.inicio));
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [horaEditada, setHoraEditada] = useState(() => {
    const d = new Date(cita.inicio);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  function adjustFecha(delta: number) {
    setFechaEditada(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  }
  function adjustHora(dh: number, dm: number) {
    const [h, m] = horaEditada.split(':').map(Number);
    let newH = h + dh;
    let newM = m + dm;
    if (newM < 0)  { newM = 55; newH -= 1; }
    if (newM >= 60){ newM = 0;  newH += 1; }
    newH = ((newH % 24) + 24) % 24;
    setHoraEditada(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
  }
  const [errMsg, setErrMsg] = useState('');
  const [notasCita, setNotasCita] = useState(cita.notas ?? '');
  const [citaAddons, setCitaAddons] = useState<any[]>([]);
  const [availableAddons, setAvailableAddons] = useState<any[]>([]);
  const [togglingAddon, setTogglingAddon] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('cita_addons')
      .select('addon_id, service_addons(nombre, duracion_min, precio)')
      .eq('cita_id', cita.id)
      .then(({ data }) => setCitaAddons(data ?? []));
  }, [cita.id]);

  useEffect(() => {
    const srvId = selectedServicio?.id || cita.servicio_id;
    if (!srvId) { setAvailableAddons([]); return; }
    supabase
      .from('service_addons')
      .select('id, nombre, duracion_min, precio')
      .eq('servicio_id', srvId)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setAvailableAddons(data ?? []));
  }, [selectedServicio?.id, cita.servicio_id]);

  const toggleAddon = async (addon: any) => {
    setTogglingAddon(addon.id);
    const exists = citaAddons.find((ca: any) => ca.addon_id === addon.id);
    const delta = addon.duracion_min || 0;

    if (exists) {
      await supabase.from('cita_addons').delete().eq('cita_id', cita.id).eq('addon_id', addon.id);
      setCitaAddons(prev => prev.filter((ca: any) => ca.addon_id !== addon.id));
    } else {
      await supabase.from('cita_addons').insert({ cita_id: cita.id, addon_id: addon.id });
      setCitaAddons(prev => [...prev, { addon_id: addon.id, service_addons: addon }]);
    }

    // Addons suman al final: solo cambia fin, no fin_activa ni fin_espera
    const inicioDate = new Date(cita.inicio);
    const finActivaDate = new Date(inicioDate.getTime() + activo * 60000);
    const finEsperaDate = new Date(finActivaDate.getTime() + espera * 60000);
    const newActivo2 = exists ? Math.max(0, activo2 - delta) : activo2 + delta;
    const newFin = new Date(finEsperaDate.getTime() + newActivo2 * 60000);
    setActivo2(newActivo2);

    await supabase.from('citas').update({
      fin: newFin.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', cita.id);

    triggerRefresh();
    setTogglingAddon(null);
  };

  const hasFormula = !!(cita.formula_producto || cita.formula_tono || cita.formula_tiempo_min != null || cita.formula_resultado || cita.formula_notas);
  const [showFormula, setShowFormula] = useState(hasFormula);
  const [confirmadaCliente, setConfirmadaCliente] = useState<boolean>(!!cita.confirmada_cliente);
  const [togglingConfirma, setTogglingConfirma] = useState(false);
  const [chainOverlapInfo, setChainOverlapInfo] = useState<any>(null);
  const [loadingChainInfo, setLoadingChainInfo] = useState(false);
  const [showChainForm, setShowChainForm] = useState(false);
  const [chainServicioId, setChainServicioId] = useState<string | null>(null);
  const [chainProfId, setChainProfId] = useState<string | null>(null);
  const [chainGuardando, setChainGuardando] = useState(false);
  const [chainErr, setChainErr] = useState('');
  const [historial, setHistorial] = useState<any[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);

  useEffect(() => {
    supabase.from('citas_historial').select('campo, valor_anterior, valor_nuevo, motivo, created_at')
      .eq('cita_id', cita.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setHistorial(data ?? []));
  }, [cita.id]);

  async function toggleConfirma() {
    if (togglingConfirma) return;
    setTogglingConfirma(true);
    const next = !confirmadaCliente;
    const { error: e } = await supabase
      .from('citas')
      .update({
        confirmada_cliente: next,
        confirmada_at: next ? new Date().toISOString() : null,
      })
      .eq('id', cita.id);
    setTogglingConfirma(false);
    if (e) { setErrMsg('No se pudo cambiar la confirmacion: ' + e.message); return; }
    setConfirmadaCliente(next);
    triggerRefresh();
  }

  useEffect(() => {
    async function detectChainOverlap() {
      if (!cita.grupo_id || !selectedProf) {
        setChainOverlapInfo(null);
        return;
      }
      setLoadingChainInfo(true);
      try {
        const profile = await getUserProfile();
        const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
        const { data: citasDelGrupo } = await supabase
          .from('citas')
          .select('*')
          .eq('grupo_id', cita.grupo_id)
          .eq('negocio_id', negocioId);
        if (!citasDelGrupo || citasDelGrupo.length <= 1) {
          setChainOverlapInfo(null);
          setLoadingChainInfo(false);
          return;
        }
        const sortedGroup = (citasDelGrupo as any[]).sort((a, b) => (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0));
        const currentIndex = sortedGroup.findIndex((c: any) => c.id === cita.id);
        if (currentIndex === -1) {
          setChainOverlapInfo(null);
          setLoadingChainInfo(false);
          return;
        }
        const prevCitas = sortedGroup.slice(0, currentIndex);
        const nextCitas = sortedGroup.slice(currentIndex + 1);
        const currentInicio = new Date(cita.inicio);
        const currentFin = new Date(cita.fin);
        let overlaps: any = {
          before: false,
          after: false,
          beforeCita: null,
          afterCita: null,
        };
        for (const prev of prevCitas) {
          const prevFin = new Date(prev.fin);
          if (prevFin > currentInicio) {
            overlaps.before = true;
            overlaps.beforeCita = prev;
            break;
          }
        }
        for (const next of nextCitas) {
          const nextInicio = new Date(next.inicio);
          if (nextInicio < currentFin) {
            overlaps.after = true;
            overlaps.afterCita = next;
            break;
          }
        }
        if (overlaps.before || overlaps.after) {
          setChainOverlapInfo(overlaps);
        } else {
          setChainOverlapInfo(null);
        }
      } catch (err) {
        console.error('Error detecting chain overlap:', err);
        setChainOverlapInfo(null);
      } finally {
        setLoadingChainInfo(false);
      }
    }
    detectChainOverlap();
  }, [cita.grupo_id, cita.inicio, cita.fin, selectedProf]);

  const [formulaProducto, setFormulaProducto] = useState(cita.formula_producto ?? '');
  const [formulaTono, setFormulaTono] = useState(cita.formula_tono ?? '');
  const [formulaTiempo, setFormulaTiempo] = useState(cita.formula_tiempo_min != null ? String(cita.formula_tiempo_min) : '');
  const [formulaResultado, setFormulaResultado] = useState(cita.formula_resultado ?? '');
  const [formulaNotas, setFormulaNotas] = useState(cita.formula_notas ?? '');

  const totalMin = activo + espera + activo2;
  const citaDate = new Date(cita.inicio).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
  const citaHora = new Date(cita.inicio).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const citaFinHora = new Date(cita.fin).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

  const handleGuardar = async () => {
    if (!selectedCliente || !selectedServicio || !selectedProf) return;
    setErrMsg('');
    setGuardando(true);
    try {
      const [hh, mm] = horaEditada.split(':').map(Number);
      const inicioDate = new Date(fechaEditada);
      inicioDate.setHours(hh, mm, 0, 0);

      const finActiva = new Date(inicioDate.getTime() + activo * 60000);
      const finEspera = new Date(finActiva.getTime() + espera * 60000);
      const fin = new Date(finEspera.getTime() + activo2 * 60000);

      const originalInicio = new Date(cita.inicio);
      const originalFin = new Date(cita.fin);
      const inicioMoved = inicioDate.getTime() !== originalInicio.getTime();

      if (inicioMoved && citasHoy) {
        // MOVER: validar solapamiento, sin cascade
        const conflictActivo1 = isTimeSlotOccupied(inicioDate, finActiva, citasHoy, selectedProf.id, cita.id);
        const conflictActivo2 = activo2 > 0 && isTimeSlotOccupied(finEspera, fin, citasHoy, selectedProf.id, cita.id);
        if (conflictActivo1 || conflictActivo2) {
          setErrMsg('Conflicto activo+activo: la fase activa se solapa con otra cita activa del profesional.');
          setGuardando(false);
          return;
        }
      }

      // Bloqueo duro: si esta cita está dentro del tiempo de espera de otra,
      // el nuevo fin activo no puede superar el fin de ese tiempo de espera (RN-AG-013)
      if (!inicioMoved && citasHoy) {
        const hostCita = (citasHoy as any[]).find((c: any) =>
          c.id !== cita.id &&
          c.profesional_id === selectedProf.id &&
          c.fin_activa && new Date(c.fin_activa) <= inicioDate &&
          c.fin_espera && new Date(c.fin_espera) > inicioDate
        );
        if (hostCita && finActiva > new Date(hostCita.fin_espera)) {
          setErrMsg('El tiempo activo supera el tiempo de espera de la cita anterior.');
          setGuardando(false);
          return;
        }
      }

      const formulaTiempoNum = formulaTiempo.trim() ? parseInt(formulaTiempo.trim(), 10) : null;
      const updatedFields = {
        inicio: inicioDate.toISOString(),
        cliente_id: selectedCliente.id,
        servicio_id: selectedServicio.id,
        profesional_id: selectedProf.id,
        estado,
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        fin: fin.toISOString(),
        notas: notasCita.trim() || null,
        formula_producto: formulaProducto.trim() || null,
        formula_tono: formulaTono.trim() || null,
        formula_tiempo_min: formulaTiempoNum != null && !isNaN(formulaTiempoNum) ? formulaTiempoNum : null,
        formula_resultado: formulaResultado.trim() || null,
        formula_notas: formulaNotas.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('citas').update(updatedFields).eq('id', cita.id);
      if (error) throw error;

      // Registrar historial de cambios relevantes
      const profile = await getUserProfile();
      const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
      const cambiosHist: { campo: string; valor_anterior: string; valor_nuevo: string }[] = [];
      if (updatedFields.inicio !== cita.inicio) cambiosHist.push({ campo: 'inicio', valor_anterior: cita.inicio, valor_nuevo: updatedFields.inicio });
      if (updatedFields.fin !== cita.fin) cambiosHist.push({ campo: 'fin', valor_anterior: cita.fin, valor_nuevo: updatedFields.fin });
      if (updatedFields.profesional_id !== cita.profesional_id) cambiosHist.push({ campo: 'profesional_id', valor_anterior: cita.profesional_id, valor_nuevo: updatedFields.profesional_id });
      if (updatedFields.estado !== cita.estado) cambiosHist.push({ campo: 'estado', valor_anterior: cita.estado, valor_nuevo: updatedFields.estado });
      if (cambiosHist.length > 0) {
        await supabase.from('citas_historial').insert(cambiosHist.map((c) => ({
          cita_id: cita.id, negocio_id: nId, campo: c.campo, valor_anterior: c.valor_anterior, valor_nuevo: c.valor_nuevo, motivo: 'Edicion manual',
        })));
      }

      if (selectedCliente?.id && notasCita.trim()) {
        await syncAlergiasACliente(selectedCliente.id, notasCita.trim());
      }

      // Cascade solo cuando las barras de duracion cambiaron (inicio no se movio)
      if (!inicioMoved) {
        // Desplazar automaticamente citas dentro del tiempo de espera
        const originalFinActiva = cita.fin_activa ? new Date(cita.fin_activa) : originalFin;
        const originalFinEspera = cita.fin_espera ? new Date(cita.fin_espera) : originalFin;
        const deltaActiva = finActiva.getTime() - originalFinActiva.getTime();
        if (deltaActiva !== 0 && citasHoy) {
          const citasEnEspera = (citasHoy as any[]).filter((c: any) =>
            c.profesional_id === selectedProf.id &&
            c.id !== cita.id &&
            new Date(c.inicio) >= originalFinActiva &&
            new Date(c.inicio) < originalFinEspera
          );
          for (const sig of citasEnEspera) {
            const p: any = {
              inicio: new Date(new Date(sig.inicio).getTime() + deltaActiva).toISOString(),
              fin: new Date(new Date(sig.fin).getTime() + deltaActiva).toISOString(),
            };
            if (sig.fin_activa) p.fin_activa = new Date(new Date(sig.fin_activa).getTime() + deltaActiva).toISOString();
            if (sig.fin_espera) p.fin_espera = new Date(new Date(sig.fin_espera).getTime() + deltaActiva).toISOString();
            await supabase.from('citas').update(p).eq('id', sig.id);
          }
        }

        const delayMs = fin.getTime() - originalFin.getTime();
        if (delayMs > 0 && citasHoy) {
          const siguientes = (citasHoy as any[]).filter((c: any) =>
            c.profesional_id === selectedProf.id &&
            c.id !== cita.id &&
            new Date(c.inicio) >= originalFin
          );
          if (siguientes.length > 0) {
            const delayMin = Math.round(delayMs / 60000);
            const ok = window.confirm(
              `Esta cita se ha alargado ${delayMin} min.\n\nHay ${siguientes.length} cita${siguientes.length > 1 ? 's' : ''} siguiente${siguientes.length > 1 ? 's' : ''} de ${selectedProf.nombre} que pueden verse afectadas.\n\n¿Desplazarlas tambien?`
            );
            if (ok) {
              for (const sig of siguientes) {
                const payload: any = {
                  inicio: new Date(new Date(sig.inicio).getTime() + delayMs).toISOString(),
                  fin: new Date(new Date(sig.fin).getTime() + delayMs).toISOString(),
                };
                if (sig.fin_activa) payload.fin_activa = new Date(new Date(sig.fin_activa).getTime() + delayMs).toISOString();
                if (sig.fin_espera) payload.fin_espera = new Date(new Date(sig.fin_espera).getTime() + delayMs).toISOString();
                await supabase.from('citas').update(payload).eq('id', sig.id);
              }
            }
          }
        }
      }

      triggerRefresh();
      onSaved?.(updatedFields) ?? onClose();
    } catch (err) {
      console.error('Error al guardar:', err);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    setGuardando(true);
    try {
      const payload: any = {
        oculta_en_calendario: true,
        cancelado_por: canceladoPor,
        motivo_cancelacion: motivoCancelacion.trim() || null,
      };
      if (cita.estado !== CITA_STATUS.CANCELADA) payload.estado = CITA_STATUS.CANCELADA;
      // Cancel this cita
      const { error } = await supabase.from('citas').update(payload).eq('id', cita.id);
      if (error) throw error;
      // If part of a group, cancel all siblings too
      if (cita.grupo_id) {
        await supabase.from('citas').update(payload).eq('grupo_id', cita.grupo_id).neq('id', cita.id);
      }
      triggerRefresh();
      onSaved?.() ?? onClose();
    } catch (err) {
      console.error('Error al cancelar:', err);
    } finally {
      setGuardando(false);
      setShowCancelModal(false);
    }
  };

  // Helper: check if a new active window overlaps with any active phase of an existing cita
  // A cita has TWO active phases: [inicio→fin_activa] + [fin_espera→fin] (activa_extra)
  // During reposo (fin_activa→fin_espera) the professional is FREE
  const citaActivaOverlap = (c: any, newInicio: Date, newFinActiva: Date): boolean => {
    const ci = new Date(c.inicio);
    const cfa = new Date(c.fin_activa);
    const cfe = c.fin_espera ? new Date(c.fin_espera) : null;
    const cf = new Date(c.fin);
    // Overlap with first active phase
    if (ci < newFinActiva && cfa > newInicio) return true;
    // Overlap with activa_extra (second active phase after reposo)
    if (cfe && cf.getTime() > cfe.getTime() && cfe < newFinActiva && cf > newInicio) return true;
    return false;
  };

  // Helper: resolve durations for a prof+service via cascade
  const resolverDuraciones = async (profId: string, servicioId: string) => {
    const srv = servicios.find((s: any) => s.id === servicioId);
    if (!srv) throw new Error('Servicio no encontrado');
    const [{ data: profSrvOvs }, { data: durOvs }] = await Promise.all([
      supabase.from('professional_service_overrides').select('duracion, duracion_espera_min, duracion_activa_extra_min').eq('professional_id', profId).eq('service_id', servicioId),
      supabase.from('duraciones_profesional').select('duracion_activa_min, duracion_espera_min, duracion_activa_extra_min').eq('profesional_id', profId).eq('servicio_id', servicioId),
    ]);
    const pso = profSrvOvs?.[0];
    const dov = durOvs?.[0];
    return {
      durActiva: pso?.duracion ?? dov?.duracion_activa_min ?? srv.duracion_activa_min ?? 30,
      durEspera: pso?.duracion_espera_min ?? dov?.duracion_espera_min ?? srv.duracion_espera_min ?? 0,
      durActivaExtra: pso?.duracion_activa_extra_min ?? dov?.duracion_activa_extra_min ?? srv.duracion_activa_extra_min ?? 0,
    };
  };

  // Helper: get chain start time (fin of last cita in group)
  const getChainInicio = (): Date => {
    if (cita.grupo_id && allCitas) {
      const siblings = (allCitas as any[]).filter((c: any) => c.grupo_id === cita.grupo_id);
      const maxSib = siblings.reduce((best: any, c: any) => (!best || (c.orden_en_grupo ?? 0) > (best.orden_en_grupo ?? 0)) ? c : best, null);
      return maxSib ? new Date(maxSib.fin) : new Date(cita.fin);
    }
    return new Date(cita.fin);
  };

  // Helper: create the chained cita in DB
  const crearCitaEncadenada = async (profId: string, servicioId: string, inicioDate: Date, durActiva: number, durEspera: number, durActivaExtra: number) => {
    const profile = await getUserProfile();
    const negocioId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    const userId = (await supabase.auth.getUser()).data.user?.id || null;

    const chainFinActiva = new Date(inicioDate.getTime() + durActiva * 60000);
    const chainFinEspera = new Date(inicioDate.getTime() + (durActiva + durEspera) * 60000);
    const chainFin = new Date(inicioDate.getTime() + (durActiva + durEspera + durActivaExtra) * 60000);

    let grupoId = cita.grupo_id;
    let maxOrden = cita.orden_en_grupo ?? 0;
    if (!grupoId) {
      grupoId = crypto.randomUUID();
      await supabase.from('citas').update({ grupo_id: grupoId, orden_en_grupo: 0 }).eq('id', cita.id);
      maxOrden = 0;
    } else if (allCitas) {
      const siblings = (allCitas as any[]).filter((c: any) => c.grupo_id === grupoId);
      maxOrden = Math.max(...siblings.map((c: any) => c.orden_en_grupo ?? 0), 0);
    }

    const { error } = await supabase.from('citas').insert({
      negocio_id: negocioId,
      profesional_id: profId,
      servicio_id: servicioId,
      cliente_id: cita.cliente_id,
      inicio: inicioDate.toISOString(),
      fin: chainFin.toISOString(),
      fin_activa: chainFinActiva.toISOString(),
      fin_espera: chainFinEspera.toISOString(),
      estado: CITA_STATUS.CONFIRMADA,
      canal: 'manual',
      creado_por: userId,
      grupo_id: grupoId,
      orden_en_grupo: maxOrden + 1,
    }).select();

    if (error) throw new Error(error.message);
    triggerRefresh();
    onClose();
  };

  const handleEncadenar = async () => {
    if (!chainServicioId || !chainProfId) return;
    setChainErr('');
    setChainGuardando(true);
    try {
      const { durActiva, durEspera, durActivaExtra } = await resolverDuraciones(chainProfId, chainServicioId);

      const chainInicio = getChainInicio();
      const chainFinActiva = new Date(chainInicio.getTime() + durActiva * 60000);

      // Validate overlap (broad fetch, filter both active phases)
      const { data: potentialOverlaps } = await supabase.from('citas')
        .select('id, inicio, fin_activa, fin_espera, fin')
        .eq('profesional_id', chainProfId)
        .eq('estado', CITA_STATUS.CONFIRMADA)
        .lt('inicio', chainFinActiva.toISOString())
        .gt('fin', chainInicio.toISOString());
      const solapadas = (potentialOverlaps || []).filter((c: any) => citaActivaOverlap(c, chainInicio, chainFinActiva));

      if (solapadas.length > 0) {
        const profName = profesionales.find((p: any) => p.id === chainProfId)?.nombre || 'Profesional';
        const fmtH = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        setChainErr(`${profName} tiene otra cita activa en esa franja (${fmtH(chainInicio)}-${fmtH(chainFinActiva)})`);
        setChainGuardando(false);
        return;
      }

      await crearCitaEncadenada(chainProfId, chainServicioId, chainInicio, durActiva, durEspera, durActivaExtra);
    } catch (e: any) {
      setChainErr(e?.message ?? 'Error inesperado');
    } finally {
      setChainGuardando(false);
    }
  };

  // Computed: chain timing preview
  const chainTimingPreview = (() => {
    if (!chainServicioId || !chainProfId) return null;
    const srv = servicios.find((s: any) => s.id === chainServicioId);
    if (!srv) return null;
    let lastFin: Date;
    if (cita.grupo_id && allCitas) {
      const siblings = (allCitas as any[]).filter((c: any) => c.grupo_id === cita.grupo_id);
      const maxSib = siblings.reduce((best: any, c: any) => (!best || (c.orden_en_grupo ?? 0) > (best.orden_en_grupo ?? 0)) ? c : best, null);
      lastFin = maxSib ? new Date(maxSib.fin) : new Date(cita.fin);
    } else {
      lastFin = new Date(cita.fin);
    }
    const durTotal = (srv.duracion_activa_min ?? 30) + (srv.duracion_espera_min ?? 0) + (srv.duracion_activa_extra_min ?? 0);
    const chainFin = new Date(lastFin.getTime() + durTotal * 60000);
    return {
      inicio: lastFin,
      fin: chainFin,
      durTotal,
      precio: srv.precio ?? 0,
    };
  })();

  const estadoMeta: any = {
    [CITA_STATUS.CONFIRMADA]:    { label: 'Confirmada',      color: TOKENS.success, soft: `rgba(16,185,129,0.12)` },
    [CITA_STATUS.COMPLETADA]:    { label: 'Completada',      color: '#22c55e', soft: 'rgba(34,197,94,0.12)' },
    [CITA_STATUS.CANCELADA]:     { label: 'Cancelada',       color: TOKENS.danger, soft: 'rgba(239,68,68,0.12)' },
    [CITA_STATUS.NO_PRESENTADA]: { label: 'No presentada',  color: '#ef4444', soft: 'rgba(239,68,68,0.15)' },
  };
  const meta = estadoMeta[estado];

  const serviciosFiltrados = servicios.filter((s: any) =>
    norm(s.nombre).includes(norm(qSrv))
  );
  const clientesFiltrados = clientes.filter((c: any) =>
    norm(c.nombre).includes(norm(qCli))
  );

  return (
    <div
      className="m-overlay-enter"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="m-modal-enter"
        style={{
          background: TOKENS.bgPanel,
          borderRadius: 16,
          maxWidth: 900,
          width: '95%',
          maxHeight: '90vh',
          overflow: 'hidden',
          border: `1px solid ${TOKENS.border}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 60, minWidth: 0 }}>

        {/* Header */}
        <div
          style={{
            marginTop: 3,
            padding: '28px 32px 24px',
            borderBottom: `1px solid ${TOKENS.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <Avatar name={selectedCliente?.nombre} size={52} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: TOKENS.textTer, letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
                Detalle de cita
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, color: TOKENS.text, marginTop: 2 }}>
                {selectedCliente?.nombre}
              </div>
              <div style={{ fontSize: 12, color: TOKENS.textSec, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{selectedServicio?.nombre}</span>
                <span style={{ width: 3, height: 3, borderRadius: 99, background: TOKENS.textTer }} />
                <span>{selectedProf?.nombre}</span>
                <span style={{ width: 3, height: 3, borderRadius: 99, background: TOKENS.textTer }} />
                <span>
                  {citaDate} · {citaHora} - {citaFinHora}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={estado === CITA_STATUS.CONFIRMADA ? TOKENS.primary : meta.color} soft={estado === CITA_STATUS.CONFIRMADA ? TOKENS.primarySoft : meta.soft}>
              {meta.label}
            </Pill>
            <button
              className="m-btn-icon m-btn-icon-close"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.textSec,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* 5.5: Servicios encadenados info */}
        {cita.grupo_id && allCitas && (() => {
          const siblings = (allCitas as any[])
            .filter((c: any) => c.grupo_id === cita.grupo_id)
            .sort((a: any, b: any) => (a.orden_en_grupo ?? 0) - (b.orden_en_grupo ?? 0));
          if (siblings.length <= 1) return null;
          return (
            <div style={{ padding: '12px 32px', borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(139,92,246,0.04)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Servicio encadenado ({siblings.length} servicios)
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {siblings.map((sib: any, idx: number) => {
                  const sibSrv = servicios.find((s: any) => s.id === sib.servicio_id);
                  const sibProf = profesionales.find((p: any) => p.id === sib.profesional_id);
                  const isCurrent = sib.id === cita.id;
                  const sibInicio = new Date(sib.inicio);
                  const sibFin = new Date(sib.fin);
                  return (
                    <div
                      key={sib.id}
                      style={{
                        padding: '6px 10px',
                        background: isCurrent ? 'rgba(139,92,246,0.15)' : TOKENS.bgCard,
                        border: `1px solid ${isCurrent ? '#a78bfa' : TOKENS.border}`,
                        borderRadius: 8,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: isCurrent ? '#a78bfa' : TOKENS.text }}>
                        {idx + 1}. {sibSrv?.nombre || 'Servicio'}
                      </div>
                      <div style={{ fontSize: 9, color: TOKENS.textTer, marginTop: 2 }}>
                        {sibProf?.nombre?.split(' ')[0]} · {sibInicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}-{sibFin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Chain overlap detection */}
        {chainOverlapInfo && (chainOverlapInfo.before || chainOverlapInfo.after) && (
          <div style={{ padding: '12px 32px', borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Conflicto en cadena
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chainOverlapInfo.before && chainOverlapInfo.beforeCita && (() => {
                const prevSrv = servicios.find((s: any) => s.id === chainOverlapInfo.beforeCita.servicio_id);
                const prevProf = profesionales.find((p: any) => p.id === chainOverlapInfo.beforeCita.profesional_id);
                const prevFin = new Date(chainOverlapInfo.beforeCita.fin);
                const currentInicio = new Date(cita.inicio);
                const overlap = prevFin > currentInicio ? Math.round((prevFin.getTime() - currentInicio.getTime()) / 60000) : 0;
                return (
                  <div style={{ padding: '8px 10px', background: TOKENS.bgCard, border: `1px solid #ef4444`, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
                      Anterior finaliza tarde
                    </div>
                    <div style={{ fontSize: 10, color: TOKENS.text, marginTop: 4 }}>
                      {prevSrv?.nombre} ({prevProf?.nombre?.split(' ')[0]}) finaliza a {prevFin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - Solapamiento: {overlap} min
                    </div>
                  </div>
                );
              })()}
              {chainOverlapInfo.after && chainOverlapInfo.afterCita && (() => {
                const nextSrv = servicios.find((s: any) => s.id === chainOverlapInfo.afterCita.servicio_id);
                const nextProf = profesionales.find((p: any) => p.id === chainOverlapInfo.afterCita.profesional_id);
                const nextInicio = new Date(chainOverlapInfo.afterCita.inicio);
                const currentFin = new Date(cita.fin);
                const overlap = currentFin > nextInicio ? Math.round((currentFin.getTime() - nextInicio.getTime()) / 60000) : 0;
                return (
                  <div style={{ padding: '8px 10px', background: TOKENS.bgCard, border: `1px solid #ef4444`, borderRadius: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
                      Siguiente comienza temprano
                    </div>
                    <div style={{ fontSize: 10, color: TOKENS.text, marginTop: 4 }}>
                      {nextSrv?.nombre} ({nextProf?.nombre?.split(' ')[0]}) comienza a {nextInicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - Solapamiento: {overlap} min
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Encadenar servicio */}
        {estado === CITA_STATUS.CONFIRMADA && (
          <div style={{ padding: showChainForm ? '10px 32px' : '0 32px', borderBottom: `1px solid ${TOKENS.border}`, ...(showChainForm ? {} : { display: 'flex', alignItems: 'center', minHeight: 36 }) }}>
            {!showChainForm ? (
              <button
                onClick={() => { setShowChainForm(true); setChainServicioId(null); setChainProfId(null); setChainErr(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#a78bfa',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                + Encadenar servicio
              </button>
            ) : (
              <div style={{ borderLeft: '3px solid #a78bfa', paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Encadenar servicio
                  </div>
                  <button onClick={() => setShowChainForm(false)} style={{ background: 'none', border: 'none', color: TOKENS.textTer, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>x</button>
                </div>

                {/* Servicio */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.6, marginBottom: 6 }}>Servicio</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {servicios.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => { setChainServicioId(s.id); setChainErr(''); }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: chainServicioId === s.id ? '1px solid #a78bfa' : `1px solid ${TOKENS.border}`,
                          background: chainServicioId === s.id ? 'rgba(139,92,246,0.15)' : TOKENS.bgCard,
                          color: chainServicioId === s.id ? '#a78bfa' : TOKENS.text,
                          transition: 'all 0.15s',
                        }}
                      >
                        {s.nombre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Profesional */}
                {chainServicioId && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.6, marginBottom: 6 }}>Profesional</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {profesionales.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => { setChainProfId(p.id); setChainErr(''); }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: chainProfId === p.id ? `1px solid ${p.color || '#a78bfa'}` : `1px solid ${TOKENS.border}`,
                            background: chainProfId === p.id ? `${p.color || '#a78bfa'}22` : TOKENS.bgCard,
                            color: chainProfId === p.id ? (p.color || '#a78bfa') : TOKENS.text,
                            transition: 'all 0.15s',
                          }}
                        >
                          {p.nombre}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview de horario */}
                {chainTimingPreview && chainProfId && (
                  <div style={{ padding: '8px 10px', background: 'rgba(139,92,246,0.06)', borderRadius: 6, border: `1px solid rgba(139,92,246,0.15)` }}>
                    <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                      {chainTimingPreview.inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {chainTimingPreview.fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ({chainTimingPreview.durTotal} min) · {chainTimingPreview.precio}
                    </div>
                  </div>
                )}

                {chainErr && (
                  <div style={{ fontSize: 11, color: TOKENS.danger, padding: '6px 10px', background: `${TOKENS.danger}15`, borderRadius: 6, border: `1px solid ${TOKENS.danger}44` }}>{chainErr}</div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowChainForm(false)}
                    style={{ padding: '6px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleEncadenar}
                    disabled={!chainServicioId || !chainProfId || chainGuardando}
                    style={{
                      padding: '6px 14px',
                      background: !chainServicioId || !chainProfId || chainGuardando ? 'rgba(139,92,246,0.3)' : 'linear-gradient(180deg,#9b8afb 0%,#8b5cf6 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: !chainServicioId || !chainProfId || chainGuardando ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {chainGuardando ? '...' : 'Encadenar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* Cliente */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Label>Clienta</Label>
                {selectedCliente?.id && (
                  <button
                    type="button"
                    className="m-btn-secondary"
                    onClick={() => {
                      onClose();
                      router.push({ pathname: '/(tabs)/clientes', params: { clienteId: selectedCliente.id } } as any);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    Ver ficha →
                  </button>
                )}
              </div>
              <SearchDropdown
                open={openCli}
                setOpen={setOpenCli}
                q={qCli}
                setQ={setQCli}
                placeholder="Buscar cliente…"
                trigger={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar name={selectedCliente?.nombre} size={28} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>
                        {selectedCliente?.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer, fontStyle: !selectedCliente?.telefono ? 'italic' : 'normal' }}>
                        {selectedCliente?.telefono || 'Sin teléfono'}
                      </div>
                    </div>
                  </div>
                }
              >
                {clientesFiltrados.map((c: any) => (
                  <DropdownItem
                    key={c.id}
                    onClick={() => {
                      setSelectedCliente(c);
                      setOpenCli(false);
                      setQCli('');
                    }}
                    active={c.id === selectedCliente?.id}
                  >
                    <Avatar name={c.nombre} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>
                        {c.nombre}
                      </div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer, fontStyle: !c.telefono ? 'italic' : 'normal' }}>
                        {c.telefono || 'Sin teléfono'}
                      </div>
                    </div>
                  </DropdownItem>
                ))}
              </SearchDropdown>
            </div>

            {/* Confirmacion del cliente */}
            <div>
              <Label>Confirmacion del cliente</Label>
              <button
                type="button"
                onClick={toggleConfirma}
                disabled={togglingConfirma}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: confirmadaCliente
                    ? 'linear-gradient(180deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))'
                    : 'linear-gradient(180deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04))',
                  border: `1.5px solid ${confirmadaCliente ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
                  color: confirmadaCliente ? TOKENS.success : '#ef4444',
                  cursor: togglingConfirma ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease, border-color 0.15s ease',
                  boxShadow: confirmadaCliente ? '0 4px 14px rgba(16,185,129,0.18)' : '0 4px 14px rgba(239,68,68,0.18)',
                }}
                onMouseEnter={(e) => {
                  if (!togglingConfirma) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = confirmadaCliente
                      ? '0 8px 22px rgba(16,185,129,0.30)'
                      : '0 8px 22px rgba(239,68,68,0.30)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = confirmadaCliente
                    ? '0 4px 14px rgba(16,185,129,0.18)'
                    : '0 4px 14px rgba(239,68,68,0.18)';
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: confirmadaCliente ? 'rgba(16,185,129,0.20)' : 'rgba(239,68,68,0.20)',
                  flexShrink: 0,
                }}>
                  {confirmadaCliente ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                    {confirmadaCliente ? 'Confirmada por el cliente' : 'Sin confirmar por el cliente'}
                  </div>
                  <div style={{ fontSize: 11, color: confirmadaCliente ? 'rgba(16,185,129,0.80)' : 'rgba(239,68,68,0.80)', fontWeight: 500 }}>
                    {togglingConfirma
                      ? 'Guardando...'
                      : confirmadaCliente
                        ? 'Toca para desmarcar'
                        : 'Toca para marcarla como confirmada'}
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: confirmadaCliente ? 'rgba(16,185,129,0.20)' : 'rgba(239,68,68,0.20)',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>
                  {confirmadaCliente ? 'Desmarcar' : 'Confirmar'}
                </div>
              </button>
            </div>

            {/* Servicio */}
            <div>
              <Label>Servicio</Label>
              <SearchDropdown
                open={openSrv}
                setOpen={setOpenSrv}
                q={qSrv}
                setQ={setQSrv}
                placeholder="Buscar servicio…"
                trigger={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: TOKENS.primarySoft, color: TOKENS.primaryHi, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <IconClock />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>
                        {selectedServicio?.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer }}>
                        {((selectedServicio?.duracion_activa_min || selectedServicio?.duracion || 0) + (selectedServicio?.duracion_espera_min || 0) + (selectedServicio?.duracion_activa_extra_min || 0)) || 0} min · {selectedServicio?.precio || 0} €
                      </div>
                    </div>
                  </div>
                }
              >
                {serviciosFiltrados.map((s: any) => (
                  <DropdownItem
                    key={s.id}
                    onClick={() => {
                      setSelectedServicio(s);
                      setOpenSrv(false);
                      setQSrv('');
                      setActivo(s.duracion_activa_min || s.duracion || 30);
                      setEspera(s.duracion_espera_min || 0);
                      setActivo2(s.duracion_activa_extra_min || 0);
                    }}
                    active={s.id === selectedServicio?.id}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>
                        {s.nombre}
                      </div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                        {((s.duracion_activa_min || s.duracion || 0) + (s.duracion_espera_min || 0) + (s.duracion_activa_extra_min || 0)) || 0} min
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.success }}>
                      {s.precio || 0} €
                    </span>
                  </DropdownItem>
                ))}
              </SearchDropdown>

              {/* Add-ons toggleables */}
              {availableAddons.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {availableAddons.map((addon: any) => {
                    const active = citaAddons.some((ca: any) => ca.addon_id === addon.id);
                    const loading = togglingAddon === addon.id;
                    return (
                      <button
                        key={addon.id}
                        onClick={() => toggleAddon(addon)}
                        disabled={loading}
                        onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)'; e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; } e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = 'transparent'; } e.currentTarget.style.transform = 'scale(1)'; }}
                        style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
                          background: active ? 'rgba(16,185,129,0.1)' : 'transparent',
                          color: active ? TOKENS.success : TOKENS.textSec,
                          border: `1px solid ${active ? 'rgba(16,185,129,0.25)' : TOKENS.border}`,
                          opacity: loading ? 0.5 : 1, transition: 'all 0.15s ease', transform: 'scale(1)',
                        }}
                      >
                        {active ? '+' : ''} {addon.nombre} ({addon.duracion_min}min · {addon.precio}EUR)
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Profesional */}
            <div>
              <Label>Profesional</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                {profesionales.map((p: any) => {
                  const sel = p.id === selectedProf?.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProf(p)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '7px 11px',
                        borderRadius: 999,
                        background: sel ? `${p.color}22` : 'rgba(148,163,184,0.06)',
                        border: `1px solid ${sel ? `${p.color}66` : TOKENS.border}`,
                        color: sel ? p.color : TOKENS.textSec,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = p.color;
                          e.currentTarget.style.background = `${p.color}10`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = TOKENS.border;
                          e.currentTarget.style.background = 'rgba(148,163,184,0.06)';
                        }
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: 999, background: p.color }} />
                      {p.nombre.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aviso de alergias del cliente */}
            {(() => {
              const alergiasTexto = (selectedCliente?.alergias ?? '').trim();
              if (!alergiasTexto) return null;
              return (
                <div className="m-pulse-red" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.40)', borderRadius: 10 }}>
                  <span style={{ display: 'inline-flex', color: '#ef4444', flexShrink: 0, marginTop: 1 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Alergias registradas</div>
                    <div style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.4, whiteSpace: 'pre-wrap' as any }}>{alergiasTexto}</div>
                  </div>
                </div>
              );
            })()}

            {/* Alergias de la cita */}
            <div>
              <Label>Alergias</Label>
              <textarea
                value={notasCita}
                onChange={(e) => setNotasCita(e.target.value)}
                placeholder="Alergias o reacciones a tener en cuenta para esta cita…"
                rows={4}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  background: '#0b1220',
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 10,
                  color: TOKENS.text,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Estado */}
            <div>
              <Label>Estado</Label>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setOpenEst(!openEst)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: TOKENS.bgCard,
                    border: `1px solid ${TOKENS.border}`,
                    cursor: 'pointer',
                    color: TOKENS.text,
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: meta.color,
                      }}
                    />
                    {meta.label}
                  </span>
                  <span style={{ transform: openEst ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'flex', alignItems: 'center', color: TOKENS.textTer }}><IconChevronDown /></span>
                </button>
                {openEst && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 30,
                      background: TOKENS.bgPanel,
                      border: `1px solid ${TOKENS.borderHi}`,
                      borderRadius: 10,
                      boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
                      padding: 4,
                    }}
                  >
                    {Object.entries(estadoMeta).map(([k, m]: any) => (
                      <button
                        key={k}
                        onClick={async () => {
                          setEstado(k);
                          setOpenEst(false);
                          await supabase.from('citas').update({ estado: k }).eq('id', cita.id);
                          triggerRefresh();
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 7,
                          background: estado === k ? TOKENS.primarySoft : 'transparent',
                          border: 'none',
                          color: TOKENS.text,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (estado !== k) {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (estado !== k) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />
                        <span style={{ flex: 1 }}>{m.label}</span>
                        {estado === k && <IconCheck />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resumen */}
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, fontWeight: 700, textTransform: 'uppercase' }}>
                  Resumen
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                  {selectedServicio?.precio || 0} €
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <SummaryCell label="Activo 1" value={`${activo}m`} color={TOKENS.primary} />
                <SummaryCell label="Espera" value={`${espera}m`} color="#f59e0b" />
                <SummaryCell label="Activo 2" value={`${activo2}m`} color={TOKENS.primary} />
                <SummaryCell label="Total" value={`${totalMin}m`} color="#10b981" />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* Fecha */}
            <div>
              <Label>Fecha</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <TimeBtn onClick={() => adjustFecha(-1)} />
                <div
                  onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
                  style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: TOKENS.text, cursor: 'pointer', userSelect: 'none', textTransform: 'capitalize' }}
                >
                  {fechaEditada.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>
                <TimeBtn onClick={() => adjustFecha(1)} plus />
                <input
                  ref={dateInputRef}
                  type="date"
                  value={`${fechaEditada.getFullYear()}-${String(fechaEditada.getMonth() + 1).padStart(2, '0')}-${String(fechaEditada.getDate()).padStart(2, '0')}`}
                  onChange={(e) => e.target.value && setFechaEditada(new Date(e.target.value + 'T12:00:00'))}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                />
              </div>
            </div>

            {/* Hora */}
            <div>
              <Label>Hora</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}` }}>
                <TimeBtn onClick={() => adjustHora(-1, 0)} />
                <TimeNumBox value={horaEditada.split(':')[0]} label="h" />
                <TimeBtn onClick={() => adjustHora(1, 0)} plus />
                <span style={{ color: TOKENS.textTer, fontSize: 17, fontWeight: 700, margin: '0 2px' }}>:</span>
                <TimeBtn onClick={() => adjustHora(0, -5)} />
                <TimeNumBox value={horaEditada.split(':')[1]} label="min" />
                <TimeBtn onClick={() => adjustHora(0, 5)} plus />
              </div>
            </div>

            {/* Secuencia */}
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'rgba(148,163,184,0.04)',
                border: `1px solid ${TOKENS.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Label>Secuencia de la cita</Label>
                <span style={{ fontSize: 10, color: TOKENS.textSec, fontWeight: 400 }}>activo → espera → activo</span>
              </div>

              <SequenceBar activo={activo} espera={espera} activo2={activo2} primary={TOKENS.primary} warning="#f59e0b" />

              <div style={{ height: 12 }} />

              <TimeSlider
                label="1 · Tiempo activo"
                hint="Aplicación del servicio"
                value={activo}
                setValue={setActivo}
                min={5}
                max={240}
                step={5}
                color={TOKENS.primary}
                chips={[15, 30, 45, 60, 90, 120]}
              />

              <div style={{ height: 12 }} />

              <TimeSlider
                label="2 · Tiempo de reposo"
                hint="Tiempo de reposo (ej. tinte procesando). Pon 0 si no hay."
                value={espera}
                setValue={setEspera}
                min={0}
                max={120}
                step={5}
                color="#f59e0b"
                chips={[0, 15, 30, 45, 60]}
              />

              <div style={{ height: 12 }} />

              <TimeSlider
                label="3 · Segundo tiempo activo"
                hint="Trabajo posterior al reposo (lavado, peinado…). 0 si no aplica."
                value={activo2}
                setValue={setActivo2}
                min={0}
                max={120}
                step={5}
                color={TOKENS.primary}
                chips={[0, 15, 30, 45, 60]}
              />
            </div>

            {/* Fórmula de color / química */}
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: showFormula ? 'rgba(139,92,246,0.06)' : 'rgba(148,163,184,0.04)',
                border: `1px solid ${showFormula ? 'rgba(139,92,246,0.30)' : TOKENS.border}`,
                transition: 'all 0.2s ease',
              }}
            >
              <button
                type="button"
                onClick={() => setShowFormula(v => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: TOKENS.text,
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(139,92,246,0.14)', color: '#8b5cf6', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text, letterSpacing: 0.3 }}>Fórmula de color / química</div>
                  <div style={{ fontSize: 10, color: TOKENS.textSec, marginTop: 2 }}>
                    {hasFormula ? 'Fórmula registrada' : 'Opcional · producto, tono, tiempo, resultado'}
                  </div>
                </div>
                <span style={{ transform: showFormula ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: TOKENS.textTer, display: 'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>

              {showFormula && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  <FormulaInput label="Producto" value={formulaProducto} onChange={setFormulaProducto} placeholder="Ej. Wella Koleston 7/0" />
                  <FormulaInput label="Tono / mezcla" value={formulaTono} onChange={setFormulaTono} placeholder="Ej. Rubio medio + 9% oxidante 30 vol" />
                  <FormulaInput label="Tiempo de aplicación (min)" value={formulaTiempo} onChange={setFormulaTiempo} placeholder="35" inputMode="numeric" />
                  <FormulaInput label="Resultado" value={formulaResultado} onChange={setFormulaResultado} placeholder="Cómo quedó (cobertura, tono final…)" multiline />
                  <FormulaInput label="Notas adicionales" value={formulaNotas} onChange={setFormulaNotas} placeholder="Observaciones específicas" multiline />
                </div>
              )}
            </div>
          </div>
        </div>

        </div>

        {/* Historial de cambios */}
        {historial.length > 0 && (
          <div style={{ padding: '0 32px 12px' }}>
            <div
              style={{
                background: showHistorial ? 'rgba(59,130,246,0.06)' : 'rgba(148,163,184,0.04)',
                border: `1px solid ${showHistorial ? 'rgba(59,130,246,0.30)' : TOKENS.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setShowHistorial(v => !v)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec }}>Historial de cambios</span>
                  <span style={{ fontSize: 11, color: TOKENS.textTer }}>({historial.length})</span>
                </div>
                <span style={{ transform: showHistorial ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: TOKENS.textTer, display: 'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </div>
              {showHistorial && (
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historial.map((h: any, i: number) => {
                    const fecha = new Date(h.created_at);
                    const hh = String(fecha.getHours()).padStart(2, '0');
                    const mm = String(fecha.getMinutes()).padStart(2, '0');
                    const dd = String(fecha.getDate()).padStart(2, '0');
                    const mo = String(fecha.getMonth() + 1).padStart(2, '0');
                    const campoLabel: Record<string, string> = {
                      inicio: 'Hora inicio', fin: 'Hora fin', profesional_id: 'Profesional',
                      estado: 'Estado', cierre_salon: 'Cierre salon',
                    };
                    const label = campoLabel[h.campo] || h.campo;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: 'rgba(148,163,184,0.05)', borderRadius: 6, fontSize: 11 }}>
                        <span style={{ color: TOKENS.textTer, whiteSpace: 'nowrap', minWidth: 70 }}>{dd}/{mo} {hh}:{mm}</span>
                        <span style={{ color: TOKENS.textSec, fontWeight: 600, minWidth: 80 }}>{label}</span>
                        <span style={{ color: TOKENS.textTer, flex: 1 }}>
                          {h.valor_anterior && <span>{h.valor_anterior}</span>}
                          {h.valor_anterior && h.valor_nuevo && <span style={{ margin: '0 4px', color: TOKENS.textTer }}>{'->'}</span>}
                          {h.valor_nuevo && <span style={{ color: TOKENS.text }}>{h.valor_nuevo}</span>}
                          {h.motivo && <span style={{ marginLeft: 6, color: 'rgba(59,130,246,0.7)', fontStyle: 'italic' }}>({h.motivo})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 32px',
            borderTop: `1px solid ${TOKENS.border}`,
            gap: 12,
          }}
        >
          {cita.estado === CITA_STATUS.CONFIRMADA && (
            <button
              className="m-btn-danger"
              onClick={() => setShowCancelModal(true)}
              disabled={guardando}
              style={{
                padding: '9px 14px',
                background: 'rgba(239,68,68,0.08)',
                color: TOKENS.danger,
                border: `1px solid ${TOKENS.danger}88`,
                borderRadius: 8,
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <IconTrash /> Cancelar cita
            </button>
          )}
          {errMsg ? <div style={{ fontSize: 11, color: TOKENS.danger, padding: '6px 10px', background: `${TOKENS.danger}15`, borderRadius: 6, border: `1px solid ${TOKENS.danger}44` }}>{errMsg}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="m-btn-secondary"
              onClick={onClose}
              disabled={guardando}
              style={{
                padding: '9px 18px',
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                color: TOKENS.text,
                borderRadius: 8,
                cursor: guardando ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Descartar
            </button>
            <button
              className="m-btn-primary"
              onClick={handleGuardar}
              disabled={!selectedCliente || !selectedServicio || !selectedProf || guardando}
              style={{
                padding: '9px 18px',
                background: !selectedCliente || !selectedServicio || !selectedProf || guardando ? 'rgba(99,102,241,0.5)' : `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: !selectedCliente || !selectedServicio || !selectedProf || guardando ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: !selectedCliente || !selectedServicio || !selectedProf || guardando ? 'none' : `0 4px 12px rgba(99,102,241,0.4)`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {guardando ? '...' : <><IconCheck /> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>

      {/* Modal cancelacion CU-AG-05 */}
      {showCancelModal && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>Cancelar cita</div>
            <div style={{ fontSize: 13, color: TOKENS.textSec }}>La cita desaparecera del calendario pero se conservara en el historial.</div>

            {/* Quien cancela */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Quien cancela</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['clienta', 'negocio'] as const).map((op) => (
                  <button
                    key={op}
                    onClick={() => setCanceladoPor(op)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      background: canceladoPor === op ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: `1px solid ${canceladoPor === op ? 'rgba(99,102,241,0.5)' : TOKENS.border}`,
                      color: canceladoPor === op ? '#818cf8' : TOKENS.textSec,
                      transition: 'all 0.15s',
                    }}
                  >
                    {op === 'clienta' ? 'Clienta' : 'Negocio'}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivo */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Motivo (opcional)</div>
              <textarea
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Ej: clienta no puede venir..."
                rows={3}
                style={{ width: '100%', background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: TOKENS.text, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={guardando}
                style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 8, color: TOKENS.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Volver
              </button>
              <button
                onClick={handleEliminar}
                disabled={guardando}
                style={{ padding: '8px 16px', background: TOKENS.danger, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: guardando ? 'not-allowed' : 'pointer' }}
              >
                {guardando ? '...' : 'Cancelar cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormulaInput({ label, value, onChange, placeholder, multiline, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; inputMode?: any }) {
  const Tag: any = multiline ? 'textarea' : 'input';
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.8, color: TOKENS.textSec, fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <Tag
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 2 : undefined}
        inputMode={inputMode}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          background: '#0b1220',
          border: `1px solid ${TOKENS.border}`,
          borderRadius: 8,
          color: TOKENS.text,
          fontSize: 12,
          fontFamily: 'inherit',
          outline: 'none',
          resize: multiline ? 'vertical' : 'none',
          minHeight: multiline ? 50 : 'auto',
        }}
      />
    </div>
  );
}

function Label({ children }: any) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: 1.2,
        color: TOKENS.textTer,
        textTransform: 'uppercase',
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function SearchDropdown({ open, setOpen, q, setQ, placeholder, trigger, children }: any) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 10,
          background: TOKENS.bgCard,
          border: `1px solid ${open ? 'rgba(99,102,241,0.40)' : TOKENS.border}`,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{trigger}</div>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, display: 'flex', alignItems: 'center' }}><IconChevronDown /></span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: TOKENS.bgPanel,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 12,
            boxShadow: '0 16px 50px rgba(0,0,0,0.55)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderBottom: `1px solid ${TOKENS.border}`,
              background: TOKENS.bgCard,
            }}
          >
            <span style={{ color: TOKENS.textTer, display: 'flex', alignItems: 'center' }}><IconSearch /></span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: TOKENS.text,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({ onClick, active, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: active ? TOKENS.primarySoft : 'transparent',
        border: `1px solid ${active ? 'rgba(99,102,241,0.30)' : 'transparent'}`,
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 2,
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );
}

function TimeSlider({ label, hint, value, setValue, min, max, step, color, chips }: any) {
  const pct = ((value - min) / (max - min)) * 100;
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromEvent = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newVal = Math.round(ratio * (max - min) + min);
    setValue(Math.max(min, Math.min(max, newVal)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    trackRef.current?.setPointerCapture(e.pointerId);
    updateFromEvent(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    updateFromEvent(e.clientX);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>{label}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setValue(Math.max(min, value - step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            −
          </button>
          <div style={{ minWidth: 64, textAlign: 'center', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: TOKENS.textSec }}>min</span>
          </div>
          <button
            onClick={() => setValue(Math.min(max, value + step))}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.textSec,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            +
          </button>
        </div>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: -3, marginBottom: 8, fontWeight: 400 }}>
          {hint}
        </div>
      )}

      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 16,
          display: 'flex',
          alignItems: 'center',
          marginBottom: 8,
          userSelect: 'none',
          cursor: 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        {/* Track de fondo */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 99,
            background: 'rgba(148,163,184,0.15)',
            pointerEvents: 'none',
          }}
        />
        {/* Track relleno */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${pct}%`,
            height: 4,
            borderRadius: 99,
            background: color,
            pointerEvents: 'none',
          }}
        />
        {/* Thumb siempre visible */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${pct}% - 8px)`,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,0.4)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', minWidth: 0 }}>
        {chips.map((m: number) => {
          const isActive = value === m;
          return (
            <button
              key={m}
              onClick={() => setValue(m)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: isActive ? `${color}22` : 'rgba(148,163,184,0.06)',
                border: `1px solid ${isActive ? `${color}66` : TOKENS.border}`,
                color: isActive ? color : TOKENS.textSec,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.background = `${color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = TOKENS.border;
                  e.currentTarget.style.background = 'rgba(148,163,184,0.06)';
                }
              }}
            >
              {m === 0 ? 'Sin espera' : `${m}m`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, color }: any) {
  return (
    <div style={{ background: 'rgba(148,163,184,0.06)', borderRadius: 8, padding: '8px 10px' }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1,
          color: TOKENS.textTer,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function SequenceBar({ activo, espera, activo2, primary, warning }: any) {
  const total = Math.max(1, activo + espera + activo2);

  return (
    <div>
      <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
        {/* Activo 1 */}
        {activo > 0 && (
          <div
            style={{
              flex: activo / total,
              background: `linear-gradient(180deg, #818cf8, #6366f1)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {(activo / total) * 100 >= 40 ? `${activo}m` : ''}
          </div>
        )}

        {/* Espera */}
        {espera > 0 && (
          <div
            style={{
              flex: espera / total,
              background: `repeating-linear-gradient(45deg, #f59e0b 0 6px, transparent 6px 12px), rgba(245,158,11,0.18)`,
              borderTop: `1px solid rgba(245,158,11,0.4)`,
              borderBottom: `1px solid rgba(245,158,11,0.4)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {(espera / total) * 100 >= 40 ? `${espera}m` : ''}
          </div>
        )}

        {/* Activo 2 */}
        {activo2 > 0 && (
          <div
            style={{
              flex: activo2 / total,
              background: `linear-gradient(180deg, #818cf8, #6366f1)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {(activo2 / total) * 100 >= 40 ? `${activo2}m` : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: TOKENS.textTer, fontWeight: 600, letterSpacing: 0.5 }}>
        <span>0 min</span>
        <span>Total · {total} min</span>
      </div>
    </div>
  );
}

function Avatar({ name, size }: any) {
  const getInitials = (n: string) => {
    return n
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const hash = name?.split('').reduce((h: any, c: any) => h + c.charCodeAt(0), 0) || 0;
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
  const color = colors[hash % colors.length];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: Math.max(10, size / 3),
        fontWeight: 700,
        color: color,
      }}
    >
      {getInitials(name || '?')}
    </div>
  );
}

function Pill({ children, color, soft }: any) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: soft,
        border: `1px solid ${color}55`,
        color: color,
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {children}
    </span>
  );
}

// =============================================
// 8.5: WeekView
// =============================================
function WeekView({ citas, profesionales, servicios, clientes, servicioMap, clienteMap, selectedDateObj, filterServicio, filterEstado, selectedProf, onSelectDay, onEditCita }: any) {
  const weekStart = useMemo(() => {
    const d = new Date(selectedDateObj);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedDateObj]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const citasByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    days.forEach((d) => { map[d.toDateString()] = []; });
    citas.forEach((c: any) => {
      const cd = new Date(c.inicio).toDateString();
      if (!map[cd]) return;
      if (selectedProf !== 'todos' && c.profesional_id !== selectedProf) return;
      if (filterServicio !== 'todos' && c.servicio_id !== filterServicio) return;
      if (filterEstado !== 'todos' && c.estado !== filterEstado) return;
      map[cd].push(c);
    });
    return map;
  }, [citas, days, selectedProf, filterServicio, filterEstado]);

  const todayStr = new Date().toDateString();
  const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: TOKENS.text }}>
        Semana del {weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {days.map((d, i) => {
          const key = d.toDateString();
          const dayCitas = citasByDay[key] || [];
          const isToday = key === todayStr;
          return (
            <div
              key={i}
              onClick={() => onSelectDay(d)}
              style={{
                background: isToday ? 'rgba(99,102,241,0.08)' : TOKENS.bgCard,
                border: `1px solid ${isToday ? TOKENS.primary : TOKENS.border}`,
                borderRadius: 12,
                padding: 10,
                cursor: 'pointer',
                minHeight: 200,
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = isToday ? TOKENS.primary : TOKENS.border; e.currentTarget.style.transform = 'none'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase' }}>{DAY_NAMES_FULL[i]}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? TOKENS.primaryHi : TOKENS.text }}>{d.getDate()}</span>
              </div>
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginBottom: 6 }}>{dayCitas.length} citas</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                {dayCitas.slice(0, 6).map((c: any) => {
                  const cli = clientes.find((cl: any) => cl.id === c.cliente_id);
                  const srv = servicioMap.get(c.servicio_id);
                  const prof = profesionales.find((p: any) => p.id === c.profesional_id);
                  const hora = new Date(c.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div
                      key={c.id}
                      onClick={(e) => { e.stopPropagation(); onEditCita(c); }}
                      style={{
                        padding: '4px 6px',
                        background: c.estado === 'completada' ? 'rgba(34,197,94,0.08)' : c.estado === 'cancelada' ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.06)',
                        borderLeft: `3px solid ${prof?.color || TOKENS.primary}`,
                        borderRadius: 4,
                        fontSize: 10,
                        display: 'flex',
                        gap: 4,
                        alignItems: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ color: TOKENS.textTer, fontWeight: 600, minWidth: 32 }}>{hora}</span>
                      <span style={{ color: TOKENS.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cli?.nombre?.split(' ')[0] || '-'}</span>
                    </div>
                  );
                })}
                {dayCitas.length > 6 && <div style={{ fontSize: 9, color: TOKENS.textTer, textAlign: 'center' }}>+{dayCitas.length - 6} mas</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// 8.5: MonthView
// =============================================
function MonthView({ citas, profesionales, servicios, clientes, servicioMap, clienteMap, currentMonth, filterServicio, filterEstado, selectedProf, onSelectDay }: any) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const filteredCitas = useMemo(() => {
    return citas.filter((c: any) => {
      if (selectedProf !== 'todos' && c.profesional_id !== selectedProf) return false;
      if (filterServicio !== 'todos' && c.servicio_id !== filterServicio) return false;
      if (filterEstado !== 'todos' && c.estado !== filterEstado) return false;
      const d = new Date(c.inicio);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [citas, selectedProf, filterServicio, filterEstado, month, year]);

  const citasByDay = useMemo(() => {
    const map: Record<number, any[]> = {};
    filteredCitas.forEach((c: any) => {
      const day = new Date(c.inicio).getDate();
      if (!map[day]) map[day] = [];
      map[day].push(c);
    });
    return map;
  }, [filteredCitas]);

  const todayDate = new Date();
  const isCurrentMonth = todayDate.getMonth() === month && todayDate.getFullYear() === year;
  const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, letterSpacing: -0.3, color: TOKENS.text, textTransform: 'capitalize' }}>
        {currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: TOKENS.textTer, padding: '8px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayCitas = citasByDay[d] || [];
          const isToday = isCurrentMonth && d === todayDate.getDate();
          const confirmadas = dayCitas.filter((c: any) => c.estado === 'confirmada').length;
          const completadas = dayCitas.filter((c: any) => c.estado === 'completada').length;
          return (
            <div
              key={i}
              onClick={() => onSelectDay(new Date(year, month, d))}
              style={{
                background: isToday ? 'rgba(99,102,241,0.10)' : TOKENS.bgCard,
                border: `1px solid ${isToday ? TOKENS.primary : TOKENS.border}`,
                borderRadius: 10,
                padding: 8,
                minHeight: 80,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = isToday ? TOKENS.primary : TOKENS.border; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? TOKENS.primaryHi : TOKENS.text }}>{d}</span>
                {dayCitas.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: TOKENS.textTer, background: 'rgba(148,163,184,0.10)', padding: '1px 5px', borderRadius: 4 }}>{dayCitas.length}</span>}
              </div>
              {dayCitas.length > 0 && (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {confirmadas > 0 && <span style={{ fontSize: 9, padding: '1px 4px', background: 'rgba(99,102,241,0.12)', color: TOKENS.primaryHi, borderRadius: 3, fontWeight: 600 }}>{confirmadas} conf</span>}
                  {completadas > 0 && <span style={{ fontSize: 9, padding: '1px 4px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 3, fontWeight: 600 }}>{completadas} comp</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// 8.2: ClienteHistorialModal
// =============================================
function ClienteHistorialModal({ cliente, onClose, citas, servicioMap, profesionalMap }: any) {
  const clienteCitas = useMemo(() => {
    return citas
      .filter((c: any) => c.cliente_id === cliente.id)
      .sort((a: any, b: any) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  }, [citas, cliente.id]);

  const estadoColors: Record<string, { bg: string; color: string }> = {
    confirmada: { bg: 'rgba(99,102,241,0.12)', color: TOKENS.primaryHi },
    completada: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
    cancelada: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
    no_presentada: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 16, width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>{cliente.nombre}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: TOKENS.textSec }}>
              {cliente.telefono || 'Sin telefono'} · {clienteCitas.length} citas totales
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: TOKENS.textTer, cursor: 'pointer', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {/* Stats */}
        <div style={{ padding: '12px 24px', display: 'flex', gap: 12, borderBottom: `1px solid ${TOKENS.border}` }}>
          <div style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, fontSize: 11, color: TOKENS.primaryHi, fontWeight: 600 }}>
            {clienteCitas.filter((c: any) => c.estado === 'completada').length} completadas
          </div>
          <div style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
            {clienteCitas.filter((c: any) => c.estado === 'cancelada' || c.estado === 'no_presentada').length} canceladas/no-show
          </div>
          {cliente.alergias && (
            <div style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
              Alergias: {cliente.alergias}
            </div>
          )}
        </div>
        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {clienteCitas.length === 0 && <div style={{ fontSize: 13, color: TOKENS.textTer, textAlign: 'center', padding: 32 }}>Sin citas registradas</div>}
          {clienteCitas.map((c: any) => {
            const srv = servicioMap.get(c.servicio_id);
            const prof = profesionalMap.get(c.profesional_id);
            const fecha = new Date(c.inicio);
            const est = estadoColors[c.estado] || estadoColors.confirmada;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${TOKENS.border}22` }}>
                <div style={{ width: 4, height: 36, borderRadius: 2, background: prof?.color || TOKENS.primary }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{srv?.nombre || 'Servicio'}</div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer }}>{prof?.nombre || 'Profesional'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec }}>
                    {fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: fecha.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}
                  </div>
                  <div style={{ fontSize: 10, color: TOKENS.textTer }}>{fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: est.bg, color: est.color, textTransform: 'uppercase' }}>{c.estado.replace('_', ' ')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
