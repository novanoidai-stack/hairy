import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { TimeDrumPicker } from '@/components/ui/Pickers';
import { useCalendarRefresh } from '@/lib/calendarContext';
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
  estado: string;
  profesional_id: string;
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

  useEffect(() => {
    async function cargar() {
      try {
        let negocioId = NEGOCIO_ID_FALLBACK;
        const profile = await getUserProfile();
        if (profile?.negocio_id) {
          negocioId = profile.negocio_id;
        }

        const [profResult, citaResult, srvResult, cltResult, bloqueoResult] = await Promise.all([
          supabase.from('profesionales').select('id, nombre, color, activo').eq('negocio_id', negocioId),
          supabase
            .from('citas')
            .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
            .eq('negocio_id', negocioId)
            .neq('estado', CITA_STATUS.CANCELADA),
          supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min').eq('negocio_id', negocioId),
          supabase.from('clientes').select('id, nombre').eq('negocio_id', negocioId),
          supabase.from('bloqueos_profesional').select('*').eq('negocio_id', negocioId),
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
        setNotifications((citaResult.data ?? []).filter((c) => c.estado === 'pendiente').length);
        setLoading(false);
      } catch (error) {
        console.error('Error cargando datos:', error);
        setLoading(false);
      }
    }
    cargar();
  }, [refreshTrigger]);

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

  const filtered = useMemo(() =>
    selectedProf === 'todos' ? citasHoy : citasHoy.filter((c) => c.profesional_id === selectedProf),
    [citasHoy, selectedProf]
  );

  const totalCitasHoy = citasHoy.length;

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

  const totalCitasMes = useMemo(() => {
    return citas.filter((c) => {
      const d = new Date(c.inicio);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
  }, [citas, month, year]);

  const ocupacionMes = useMemo(() => {
    return Math.round((totalCitasMes / OCUPACION_MAX_PER_MES) * 100);
  }, [totalCitasMes]);

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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: TOKENS.text }}>Cargando...</div>;

  const monthName = currentMonth.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      <style>{ANIMATIONS}</style>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Agenda</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>
            {selectedDateObj.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).charAt(0).toUpperCase() + selectedDateObj.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).slice(1)} · {totalCitasHoy} citas · {citasHoy.filter((c) => c.estado === CITA_STATUS.CONFIRMADA).length} confirmadas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={{ padding: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.textSec, position: 'relative', cursor: 'pointer', width: 36, height: 36, display: 'grid', placeItems: 'center', transition: 'all 0.3s ease', transform: 'scale(1)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.background = TOKENS.bgCardHi; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bgCard; }}>
            <Icon name="bell" size={20} color={TOKENS.textSec} />
            {notifications > 0 && <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, background: TOKENS.danger, borderRadius: 999, boxShadow: `0 0 0 2px ${TOKENS.bg}`, animation: 'pulse 2s infinite' }} />}
          </button>
          <button onClick={handleToday} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: 'translateY(0)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 20px rgba(99,102,241,0.2)`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <Icon name="calendar" size={16} color={TOKENS.text} />
            Hoy
          </button>
          <button onClick={() => setShowNewCita(true)} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: 'translateY(0)' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <Icon name="plus" size={16} color="#fff" />
            Nueva cita
          </button>
        </div>
      </div>

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
              <button onClick={handlePrevMonth} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'all 0.2s ease', transform: 'scale(1) rotate(0deg)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1) rotate(-15deg)'; e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.background = TOKENS.bgCardHi; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bg; }}>
                <Icon name="chevronLeft" size={18} color={TOKENS.textSec} />
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: TOKENS.text, textTransform: 'capitalize' }}>{monthName}</div>
              <button onClick={handleNextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'all 0.2s ease', transform: 'scale(1) rotate(0deg)' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1) rotate(15deg)'; e.currentTarget.style.borderColor = TOKENS.primary; e.currentTarget.style.background = TOKENS.bgCardHi; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.background = TOKENS.bg; }}>
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
                <ProfRow key={p.id} id={p.id} name={p.nombre} role={p.rol} color={p.color} count={citasHoy.filter((c) => c.profesional_id === p.id).length} selected={selectedProf === p.id} onSel={() => setSelectedProf(p.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Day timeline */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <ViewTab active={view === 'day'} onClick={() => setView('day')}>Día</ViewTab>
              <ViewTab active={view === 'week'} onClick={() => setView('week')}>Semana</ViewTab>
              <ViewTab active={view === 'month'} onClick={() => setView('month')}>Mes</ViewTab>
            </div>
          </div>

          {view === 'day' && <DayTimeline citas={filtered} profesionales={visibleProfs} servicios={servicios} clientes={clientes} servicioMap={servicioMap} clienteMap={clienteMap} profesionalMap={profesionalMap} onEditCita={(cita: any) => { setSelectedCitaEdit(cita); setShowEditCita(true); }} bloqueos={bloqueos} selectedDateObj={selectedDateObj} />}
          {view === 'week' && <div style={{ color: TOKENS.textSec, padding: '20px', textAlign: 'center' }}>Vista de semana (próximamente)</div>}
          {view === 'month' && <div style={{ color: TOKENS.textSec, padding: '20px', textAlign: 'center' }}>Vista de mes (próximamente)</div>}
        </div>
      </div>

      {showNewCita && <NewCitaModal onClose={() => setShowNewCita(false)} onSaved={(nuevaCita: any) => { if (nuevaCita) setCitas(prev => [...prev, nuevaCita]); setShowNewCita(false); }} selectedDate={selectedDateObj} />}
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
        />
      )}
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

function ProfRow({ id, name, role, color, count, selected, onSel }: any) {
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
      </div>
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

function DayTimeline({ citas, profesionales, servicios, clientes, servicioMap, clienteMap, profesionalMap, onEditCita, bloqueos = [], selectedDateObj = new Date() }: any) {
  const HOURS = [];
  for (let h = HORARIO_APERTURA.horas; h < HORARIO_CIERRE.horas; h++) HOURS.push(h);
  const ROW_H = 64;
  const START_H = HORARIO_APERTURA.horas;
  const now = new Date();
  const currentHourPercent = ((now.getHours() - START_H) + now.getMinutes() / 60) / HOURS.length;
  const isToday = now.getHours() >= START_H && now.getHours() < START_H + HOURS.length;

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
      <div style={{ position: 'relative', height: HOURS.length * ROW_H }}>
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
                {profCitas.map((cita: any) => {
                  const start = new Date(cita.inicio);
                  const end = new Date(cita.fin);
                  const startH = start.getHours() + start.getMinutes() / 60;
                  const durH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                  const top = (startH - START_H) * ROW_H;
                  const height = durH * ROW_H;
                  const lane = cita._lane ?? 0;
                  const totalLanes = cita._totalLanes ?? 1;
                  return (
                    <div
                      key={cita.id}
                      style={{
                        position: 'absolute',
                        top,
                        left: `calc(${(lane / totalLanes) * 100}% + 4px)`,
                        right: `calc(${((totalLanes - lane - 1) / totalLanes) * 100}% + 4px)`,
                        height,
                        pointerEvents: 'auto',
                        background: `linear-gradient(180deg, ${profColor}28, ${profColor}18)`,
                        border: `1px solid ${profColor}55`,
                        borderLeft: `3px solid ${profColor}`,
                        borderRadius: 8,
                        padding: '6px 8px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        boxShadow: `0 4px 14px ${profColor}22`,
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: 'scale(1)',
                      }}
                      onClick={() => onEditCita(cita)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 8px 32px ${profColor}45`;
                        e.currentTarget.style.borderColor = `${profColor}99`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = `0 4px 14px ${profColor}22`;
                        e.currentTarget.style.borderColor = `${profColor}55`;
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 10, color: TOKENS.textTer, fontWeight: 600 }}>
                          {start.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div style={{ width: 5, height: 5, borderRadius: 999, background: cita.estado === CITA_STATUS.CONFIRMADA ? '#10b981' : '#f59e0b' }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {clienteMap?.get(cita.cliente_id)?.nombre || '-'}
                      </div>
                      {height > CITA_CARD_DETAILS_MIN_HEIGHT && (
                        <div style={{ fontSize: 10, color: TOKENS.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {servicioMap?.get(cita.servicio_id)?.nombre || 'Servicio'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewCitaModal({ onClose, onSaved, selectedDate }: any) {
  const [clientes, setClientes] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [citasHoy, setCitasHoy] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState('');
  const [selectedServicio, setSelectedServicio] = useState('');
  const [selectedProf, setSelectedProf] = useState('');
  const [selectedHora, setSelectedHora] = useState<string>('');
  const [horaPersonalizada, setHoraPersonalizada] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');
  const [duracionOverride, setDuracionOverride] = useState<any>(null);
  const [duracionActivaCustom, setDuracionActivaCustom] = useState<number | null>(null);
  const [duracionEsperaCustom, setDuracionEsperaCustom] = useState<number | null>(null);
  const [duracionActivaExtraCustom, setDuracionActivaExtraCustom] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [bloqueosProfHoy, setBloqueosProfHoy] = useState<any[]>([]);
  const [showCreateCliente, setShowCreateCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const today = selectedDate || new Date();

  useEffect(() => {
    async function cargar() {
      let negocioId = 'prueba_46980';
      const profile = await getUserProfile();
      if (profile?.negocio_id) {
        negocioId = profile.negocio_id;
      }
      setNegocioId(negocioId);

      // Construir fecha local sin conversión a UTC
      const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const tomorrow = new Date(today.getTime() + 86400000);
      const tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');

      const [{ data: clts }, { data: srvs }, { data: prfs }, { data: cits }] = await Promise.all([
        supabase.from('clientes').select('id, nombre').eq('negocio_id', negocioId).order('nombre'),
        supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min').eq('negocio_id', negocioId).order('nombre'),
        supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', negocioId).eq('activo', true),
        supabase.from('citas').select('id, inicio, fin, fin_activa, fin_espera, profesional_id').eq('negocio_id', negocioId).gte('inicio', `${todayStr}T00:00:00`).lt('inicio', `${tomorrowStr}T00:00:00`).neq('estado', CITA_STATUS.CANCELADA),
      ]);

      if (srvs?.error) console.error('Servicios error:', srvs.error);
      if (clts?.error) console.error('Clientes error:', clts.error);
      if (prfs?.error) console.error('Profesionales error:', prfs.error);
      if (cits?.error) console.error('Citas error:', cits.error);

      console.log('Servicios data:', srvs);
      console.log('Clientes data:', clts);
      console.log('Profesionales data:', prfs);
      console.log('Citas hoy data:', cits);

      setClientes(clts ?? []);
      setServicios(srvs ?? []);
      setProfesionales(prfs ?? []);
      setCitasHoy(cits ?? []);
      setLoading(false);
    }
    cargar();
  }, [today, selectedDate]);

  // Load per-professional duration override when both prof + service are selected
  useEffect(() => {
    setSelectedHora('');
    setHoraPersonalizada('');
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

  // Duration resolution: manual → professional override → service default
  const duracionActiva = duracionActivaCustom
    ?? duracionOverride?.duracion_activa_min
    ?? servicioActual?.duracion_activa_min
    ?? servicioActual?.duracion
    ?? 30;
  const duracionEspera = duracionEsperaCustom
    ?? duracionOverride?.duracion_espera_min
    ?? servicioActual?.duracion_espera_min
    ?? 0;
  const duracionActivaExtra = duracionActivaExtraCustom
    ?? duracionOverride?.duracion_activa_extra_min
    ?? servicioActual?.duracion_activa_extra_min
    ?? 0;
  const duracionTotal = duracionActiva + duracionEspera + duracionActivaExtra;

  // Parse selected hora (format: "HH:MM") - usar hora personalizada si existe
  const horaActual = horaPersonalizada || selectedHora;
  let inicio: Date | null = null;
  let finActiva: Date | null = null;
  let finEspera: Date | null = null;
  let fin: Date | null = null;

  if (horaActual) {
    const [hh, mm] = horaActual.split(':').map(Number);
    inicio = new Date(today);
    inicio.setHours(hh, mm, 0, 0);
    finActiva = new Date(inicio.getTime() + duracionActiva * 60000);
    finEspera = new Date(inicio.getTime() + (duracionActiva + duracionEspera) * 60000);
    fin = new Date(inicio.getTime() + duracionTotal * 60000);
  }


  const handleGuardar = async () => {
    if (!selectedCliente || !selectedServicio || !selectedProf || !horaActual || !inicio || !fin || !finActiva || !finEspera) {
      setErrMsg('Por favor completa todos los campos');
      return;
    }

    setErrMsg('');
    setGuardando(true);

    try {
      // 1. Check professional blocks
      const { data: bloqueos } = await supabase
        .from('bloqueos_profesional')
        .select('tipo, motivo')
        .eq('profesional_id', selectedProf)
        .lt('inicio', fin.toISOString())
        .gt('fin', inicio.toISOString());

      if (bloqueos && bloqueos.length > 0) {
        setErrMsg(`Profesional no disponible: ${bloqueos[0].motivo || bloqueos[0].tipo}`);
        setGuardando(false);
        return;
      }

      // 2. No overlap on active phase 1
      const { data: solapadasActivas } = await supabase
        .from('citas')
        .select('id')
        .eq('profesional_id', selectedProf)
        .neq('estado', CITA_STATUS.CANCELADA)
        .lt('inicio', finActiva.toISOString())
        .gt('fin_activa', inicio.toISOString());

      if (solapadasActivas && solapadasActivas.length > 0) {
        setErrMsg('El profesional ya tiene una cita activa en ese horario.');
        setGuardando(false);
        return;
      }

      // 3. No overlap on active phase 2 (if it exists)
      if (duracionActivaExtra > 0) {
        const { data: solapadasActivas2 } = await supabase
          .from('citas')
          .select('id')
          .eq('profesional_id', selectedProf)
          .neq('estado', CITA_STATUS.CANCELADA)
          .lt('inicio', fin.toISOString())
          .gt('fin_activa', finEspera.toISOString());

        if (solapadasActivas2 && solapadasActivas2.length > 0) {
          setErrMsg('El profesional ya tiene una cita activa en ese horario.');
          setGuardando(false);
          return;
        }
      }

      // 4. Don't extend end in wait phase
      const { data: citasEspera } = await supabase
        .from('citas')
        .select('id, fin')
        .eq('profesional_id', selectedProf)
        .neq('estado', CITA_STATUS.CANCELADA)
        .lte('fin_activa', inicio.toISOString())
        .gte('fin', inicio.toISOString())
        .lt('fin', fin.toISOString());

      if (citasEspera && citasEspera.length > 0) {
        setErrMsg('No puedes terminar después de otra cita. El profesional sigue ocupado en esa franja.');
        setGuardando(false);
        return;
      }

      const { data: nuevaCita, error } = await supabase.from('citas').insert({
        negocio_id: negocioId,
        profesional_id: selectedProf,
        servicio_id: selectedServicio,
        cliente_id: selectedCliente || null,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        estado: CITA_STATUS.CONFIRMADA,
        canal: 'manual',
      }).select().single();

      setGuardando(false);
      if (error) { setErrMsg(error.message); return; }
      onSaved?.(nuevaCita) ?? onClose();
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

  if (loading) return null;

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
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Cliente</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
            {clientes.filter((c) => c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCliente(c.id)}
                style={{
                  padding: '10px 8px',
                  background: selectedCliente === c.id ? 'rgba(99,102,241,0.18)' : TOKENS.bgCard,
                  border: `1px solid ${selectedCliente === c.id ? 'rgba(99,102,241,0.4)' : TOKENS.border}`,
                  borderRadius: 8,
                  color: selectedCliente === c.id ? TOKENS.primaryHi : TOKENS.textSec,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: selectedCliente === c.id ? 600 : 500,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.2)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {c.nombre}
              </button>
            ))}
            <button
              onClick={() => setShowCreateCliente(true)}
              style={{
                padding: '10px 8px',
                background: 'rgba(16,185,129,0.1)',
                border: `1px dashed rgba(16,185,129,0.35)`,
                borderRadius: 8,
                color: TOKENS.success,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
                transition: 'all 0.2s ease',
                transform: 'scale(1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.background = 'rgba(16,185,129,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = 'rgba(16,185,129,0.1)';
              }}
            >
              + Crear
            </button>
          </div>
        </div>

        {/* Selected client card */}
        {selectedCliente && clienteSeleccionado && (
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
            {servicios.map((s) => (
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
                  <span style={{ fontSize: 10, color: TOKENS.textTer }}>{s.duracion_activa_min ? s.duracion_activa_min + (s.duracion_espera_min || 0) + (s.duracion_activa_extra_min || 0) : 30} min</span>
                  <span style={{ fontSize: 10, color: TOKENS.success, fontWeight: 700 }}>{s.precio}€</span>
                </div>
              </button>
            ))}
          </div>
        </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
              {generarSlotsHorarios().map((time) => {
                const [h, m] = time.split(':').map(Number);
                const testInicio = new Date(today);
                testInicio.setHours(h, m, 0, 0);
                // Only check the barber's active phases — wait time doesn't occupy the barber
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

                const selected = (selectedHora === time && !horaPersonalizada);

                if (occupied1 || occupied2 || blockedByAusencia) return null;

                return (
                  <button
                    key={time}
                    onClick={() => {
                      setHoraPersonalizada('');
                      selected ? setSelectedHora('') : setSelectedHora(time);
                    }}
                    style={{
                      padding: '8px 0',
                      borderRadius: 8,
                      background: selected ? `linear-gradient(180deg,#7c83ff,#6366f1)` : TOKENS.bgCard,
                      border: `1px solid ${selected ? '#6366f1' : TOKENS.border}`,
                      color: selected ? '#fff' : TOKENS.textSec,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transform: 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.08)';
                      if (!selected) {
                        e.currentTarget.style.borderColor = TOKENS.primary;
                        e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.2)`;
                      } else {
                        e.currentTarget.style.boxShadow = `0 6px 20px rgba(99,102,241,0.4)`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.borderColor = selected ? '#6366f1' : TOKENS.border;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, color: TOKENS.textSec }}>O personalizada:</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <TimeDrumPicker
                  value={horaPersonalizada}
                  onChange={(v) => { setHoraPersonalizada(v); setSelectedHora(''); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Total estimado */}
        {selectedCliente && selectedServicio && selectedProf && horaActual && (
          <div style={{ marginTop: 18, padding: 12, background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.25)`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: TOKENS.textSec }}>Total estimado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.success }}>{servicioActual?.precio}€</div>
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
              transform: 'translateX(0)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateX(-2px)';
              e.currentTarget.style.background = TOKENS.bgCard;
              e.currentTarget.style.borderColor = TOKENS.borderHi;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateX(0)';
              e.currentTarget.style.background = TOKENS.bgCard;
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={!selectedCliente || !selectedServicio || !selectedProf || !horaActual || guardando}
            style={{
              padding: '9px 18px',
              background: !selectedCliente || !selectedServicio || !selectedProf || !selectedHora || guardando ? 'rgba(99,102,241,0.5)' : `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: !selectedCliente || !selectedServicio || !selectedProf || !selectedHora || guardando ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              boxShadow: !selectedCliente || !selectedServicio || !selectedProf || !selectedHora || guardando ? 'none' : `0 4px 12px rgba(99,102,241,0.4)`,
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              if (!(!selectedCliente || !selectedServicio || !selectedProf || !selectedHora || guardando)) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 8px 24px rgba(99,102,241,0.6)`;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.4)`;
            }}
          >
            {guardando ? '...' : '✓ Reservar cita'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleCitaModal({ onClose, onSaved, cita, servicios, clientes, profesionales, citasHoy }: any) {
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
  const [errMsg, setErrMsg] = useState('');

  const totalMin = activo + espera + activo2;
  const citaDate = new Date(cita.inicio).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
  const citaHora = new Date(cita.inicio).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

  const handleGuardar = async () => {
    if (!selectedCliente || !selectedServicio || !selectedProf) return;
    setErrMsg('');
    setGuardando(true);
    try {
      const inicioDate = new Date(cita.inicio);
      const finActiva = new Date(inicioDate.getTime() + activo * 60000);
      const finEspera = new Date(finActiva.getTime() + espera * 60000);
      const fin = new Date(finEspera.getTime() + activo2 * 60000);

      if (citasHoy) {
        const conflictActivo1 = isTimeSlotOccupied(inicioDate, finActiva, citasHoy, selectedProf.id, cita.id);
        const conflictActivo2 = activo2 > 0 && isTimeSlotOccupied(finEspera, fin, citasHoy, selectedProf.id, cita.id);
        if (conflictActivo1 || conflictActivo2) {
          setErrMsg('Los nuevos tiempos generan conflicto con otra cita del profesional');
          setGuardando(false);
          return;
        }
      }

      const updatedFields = {
        cliente_id: selectedCliente.id,
        servicio_id: selectedServicio.id,
        profesional_id: selectedProf.id,
        estado,
        fin_activa: finActiva.toISOString(),
        fin_espera: finEspera.toISOString(),
        fin: fin.toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('citas')
        .update(updatedFields)
        .eq('id', cita.id);
      if (error) throw error;
      onSaved?.(updatedFields) ?? onClose();
    } catch (err) {
      console.error('Error al guardar:', err);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('citas')
        .update({ estado: CITA_STATUS.CANCELADA })
        .eq('id', cita.id);
      if (error) throw error;
      onSaved?.() ?? onClose();
    } catch (err) {
      console.error('Error al eliminar:', err);
    } finally {
      setGuardando(false);
    }
  };

  const estadoMeta: any = {
    [CITA_STATUS.CONFIRMADA]: { label: 'Confirmada', color: TOKENS.success, soft: `rgba(16,185,129,0.12)` },
    [CITA_STATUS.PENDIENTE]: { label: 'Pendiente', color: '#f59e0b', soft: 'rgba(245,158,11,0.12)' },
    [CITA_STATUS.CANCELADA]: { label: 'Cancelada', color: TOKENS.danger, soft: 'rgba(239,68,68,0.12)' },
  };
  const meta = estadoMeta[estado];

  const serviciosFiltrados = servicios.filter((s: any) =>
    s.nombre.toLowerCase().includes(qSrv.toLowerCase())
  );
  const clientesFiltrados = clientes.filter((c: any) =>
    c.nombre.toLowerCase().includes(qCli.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.3s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: TOKENS.bgPanel,
          borderRadius: 16,
          maxWidth: 900,
          width: '95%',
          maxHeight: '90vh',
          overflow: 'hidden',
          border: `1px solid ${TOKENS.border}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
          animation: 'slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
                  {citaDate} · {citaHora}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={estado === CITA_STATUS.CONFIRMADA ? TOKENS.primary : meta.color} soft={estado === CITA_STATUS.CONFIRMADA ? TOKENS.primarySoft : meta.soft}>
              {meta.label}
            </Pill>
            <button
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
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = TOKENS.bgCardHi;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = TOKENS.bgCard;
              }}
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* Cliente */}
            <div>
              <Label>Cliente</Label>
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
                        {selectedServicio?.duracion || 0} min · {selectedServicio?.precio || 0} €
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
                      setActivo(s.duracion || 30);
                    }}
                    active={s.id === selectedServicio?.id}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>
                        {s.nombre}
                      </div>
                      <div style={{ fontSize: 10, color: TOKENS.textTer }}>
                        {s.duracion || 0} min
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.success }}>
                      {s.precio || 0} €
                    </span>
                  </DropdownItem>
                ))}
              </SearchDropdown>
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

            {/* Notas internas */}
            <div>
              <Label>Notas internas</Label>
              <textarea
                placeholder="Alergias, preferencias, recordatorios…"
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
                        onClick={() => {
                          setEstado(k);
                          setOpenEst(false);
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
            {/* Fecha + Hora */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, width: '100%', minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <Label>Fecha</Label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <span
                    style={{
                      color: TOKENS.textTer,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconCalendar />
                  </span>
                  <input
                    type="text"
                    value={citaDate}
                    onChange={(e) => {}}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      color: TOKENS.textSec,
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      minWidth: 0,
                      cursor: 'text',
                    }}
                  />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <Label>Hora</Label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <span
                    style={{
                      color: TOKENS.textTer,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconClock />
                  </span>
                  <input
                    type="text"
                    value={citaHora}
                    onChange={(e) => {}}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: TOKENS.bgCard,
                      border: `1px solid ${TOKENS.border}`,
                      color: TOKENS.text,
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      minWidth: 0,
                      cursor: 'text',
                    }}
                  />
                </div>
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
                label="2 · Tiempo de espera"
                hint="Reposo / pausa (ej. tinte). Pon 0 si no hay."
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
          </div>
        </div>

        </div>

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
          <button
            onClick={handleEliminar}
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
              opacity: guardando ? 0.6 : 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!guardando) {
                e.currentTarget.style.background = `${TOKENS.danger}15`;
                e.currentTarget.style.borderColor = `${TOKENS.danger}99`;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
              e.currentTarget.style.borderColor = `${TOKENS.danger}88`;
            }}
          >
            <IconTrash /> Cancelar cita
          </button>
          {errMsg ? <div style={{ fontSize: 11, color: TOKENS.danger, padding: '6px 10px', background: `${TOKENS.danger}15`, borderRadius: 6, border: `1px solid ${TOKENS.danger}44` }}>{errMsg}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
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
                transition: 'all 0.2s ease',
                opacity: guardando ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!guardando) {
                  e.currentTarget.style.background = TOKENS.bgCardHi;
                  e.currentTarget.style.borderColor = TOKENS.borderHi;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = TOKENS.bgCard;
                e.currentTarget.style.borderColor = TOKENS.border;
              }}
            >
              Descartar
            </button>
            <button
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
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onMouseEnter={(e) => {
                if (!(!selectedCliente || !selectedServicio || !selectedProf || guardando)) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 8px 24px rgba(99,102,241,0.6)`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.4)`;
              }}
            >
              {guardando ? '...' : <><IconCheck /> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>
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

  const hash = name?.split('').reduce((h, c) => h + c.charCodeAt(0), 0) || 0;
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
