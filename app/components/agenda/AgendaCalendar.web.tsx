import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
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
  button, input, select, textarea {
    color: #f8fafc !important;
  }
  button * {
    color: #f8fafc !important;
  }
  input, select, textarea {
    background-color: #141f33 !important;
  }
  option {
    background-color: #141f33 !important;
    color: #f8fafc !important;
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

  useEffect(() => {
    async function cargar() {
      try {
        let negocioId = NEGOCIO_ID_FALLBACK;
        const profile = await getUserProfile();
        if (profile?.negocio_id) {
          negocioId = profile.negocio_id;
        }

        const [profResult, citaResult, srvResult, cltResult] = await Promise.all([
          supabase.from('profesionales').select('id, nombre, color, activo').eq('negocio_id', negocioId),
          supabase
            .from('citas')
            .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
            .eq('negocio_id', negocioId)
            .neq('estado', CITA_STATUS.CANCELADA),
          supabase.from('servicios').select('id, nombre, precio').eq('negocio_id', negocioId),
          supabase.from('clientes').select('id, nombre').eq('negocio_id', negocioId),
        ]);

        if (profResult.error) console.error('Prof error:', profResult.error);
        if (citaResult.error) console.error('Cita error:', citaResult.error);
        console.log('Prof data:', profResult.data);
        console.log('Cita data:', citaResult.data);

        setProfesionales(profResult.data ?? []);
        setCitas(citaResult.data ?? []);
        setServicios(srvResult.data ?? []);
        setClientes(cltResult.data ?? []);
        setNotifications((citaResult.data ?? []).filter((c) => c.estado === 'pendiente').length);
        setLoading(false);
      } catch (error) {
        console.error('Error cargando datos:', error);
        setLoading(false);
      }
    }
    cargar();
  }, []);

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

          {view === 'day' && <DayTimeline citas={filtered} profesionales={visibleProfs} servicios={servicios} clientes={clientes} servicioMap={servicioMap} clienteMap={clienteMap} profesionalMap={profesionalMap} onEditCita={(cita: any) => { setSelectedCitaEdit(cita); setShowEditCita(true); }} />}
          {view === 'week' && <div style={{ color: TOKENS.textSec, padding: '20px', textAlign: 'center' }}>Vista de semana (próximamente)</div>}
          {view === 'month' && <div style={{ color: TOKENS.textSec, padding: '20px', textAlign: 'center' }}>Vista de mes (próximamente)</div>}
        </div>
      </div>

      {showNewCita && <NewCitaModal onClose={() => setShowNewCita(false)} selectedDate={selectedDateObj} />}
      {showEditCita && selectedCitaEdit && (
        <EditCitaModal
          onClose={() => setShowEditCita(false)}
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
        {name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
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

function DayTimeline({ citas, profesionales, servicios, clientes, servicioMap, clienteMap, profesionalMap, onEditCita }: any) {
  const HOURS = [];
  for (let h = HORARIO_APERTURA.horas; h < HORARIO_CIERRE.horas; h++) HOURS.push(h);
  const ROW_H = 64;
  const START_H = HORARIO_APERTURA.horas;

  const now = new Date();
  const currentHourPercent = ((now.getHours() - START_H) + now.getMinutes() / 60) / HOURS.length;
  const isToday = now.getHours() >= START_H && now.getHours() < START_H + HOURS.length;

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
        {citas.map((cita: any) => {
          const start = new Date(cita.inicio);
          const end = new Date(cita.fin);
          const startH = start.getHours() + start.getMinutes() / 60;
          const durH = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          const top = (startH - START_H) * ROW_H;
          const height = durH * ROW_H;
          const profIdx = profesionales.findIndex((p: any) => p.id === cita.profesional_id);
          const colWidth = 100 / Math.max(1, profesionales.length);
          const leftPercent = 56 + profIdx * colWidth;
          const profColor = profesionales[profIdx]?.color || TOKENS.primary;

          return (
            <div
              key={cita.id}
              style={{
                position: 'absolute',
                top,
                left: `calc(56px + ${profIdx * colWidth}% + 4px)`,
                right: `calc(${(profesionales.length - profIdx - 1) * colWidth}% + 4px)`,
                height,
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
    </div>
  );
}

function NewCitaModal({ onClose, selectedDate }: any) {
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

      const { error } = await supabase.from('citas').insert({
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
      });

      setGuardando(false);
      if (error) { setErrMsg(error.message); return; }
      onClose();
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
                const testFin = new Date(testInicio.getTime() + duracionTotal * 60000);

                const occupied = citasHoy.some(cita => {
                  if (cita.profesional_id !== selectedProf) return false;
                  const citaInicio = new Date(cita.inicio);
                  const citaFin = new Date(cita.fin);
                  return testInicio.getTime() < citaFin.getTime() && testFin.getTime() > citaInicio.getTime();
                });

                const selected = (selectedHora === time && !horaPersonalizada);

                // No mostrar horas ocupadas
                if (occupied) return null;

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: TOKENS.textSec }}>O personalizada:</span>
              <input
                type="time"
                value={horaPersonalizada}
                onChange={(e) => {
                  setHoraPersonalizada(e.target.value);
                  setSelectedHora('');
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: TOKENS.bgCard,
                  border: `1px solid ${horaPersonalizada ? 'rgba(99,102,241,0.4)' : TOKENS.border}`,
                  borderRadius: 8,
                  color: TOKENS.text,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = TOKENS.primary;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${TOKENS.primarySoft}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = horaPersonalizada ? 'rgba(99,102,241,0.4)' : TOKENS.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
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

function EditCitaModal({ onClose, cita, servicios, clientes, profesionales, citasHoy }: any) {
  const [clienteId, setClienteId] = useState(cita.cliente_id);
  const [servicioId, setServicioId] = useState(cita.servicio_id);
  const [profId, setProfId] = useState(cita.profesional_id);
  const [inicio, setInicio] = useState(cita.inicio);
  const [fin, setFin] = useState(cita.fin);
  const [estado, setEstado] = useState(cita.estado);
  const [servicioSearch, setServicioSearch] = useState('');
  const [guardando, setGuardando] = useState(false);

  const serviciosFiltrados = servicios.filter((s: any) =>
    s.nombre.toLowerCase().includes(servicioSearch.toLowerCase())
  );

  const handleGuardar = async () => {
    if (!clienteId || !servicioId || !profId) return;
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('citas')
        .update({
          cliente_id: clienteId,
          servicio_id: servicioId,
          profesional_id: profId,
          inicio,
          fin,
          estado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cita.id);
      if (error) throw error;
      onClose();
    } catch (err) {
      console.error('Error al guardar:', err);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta cita?')) return;
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('citas')
        .update({ estado: CITA_STATUS.CANCELADA })
        .eq('id', cita.id);
      if (error) throw error;
      onClose();
    } catch (err) {
      console.error('Error al eliminar:', err);
    } finally {
      setGuardando(false);
    }
  };

  const inicioDate = new Date(inicio);
  const horaInicio = `${String(inicioDate.getHours()).padStart(2, '0')}:${String(inicioDate.getMinutes()).padStart(2, '0')}`;
  const cliente = clientes.find((c: any) => c.id === clienteId);
  const servicio = servicios.find((s: any) => s.id === servicioId);
  const prof = profesionales.find((p: any) => p.id === profId);
  const horaFin = `${String(new Date(fin).getHours()).padStart(2, '0')}:${String(new Date(fin).getMinutes()).padStart(2, '0')}`;

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
          maxWidth: 580,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          border: `1px solid ${TOKENS.border}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.4)`,
          animation: 'slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>Editar cita</h2>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: TOKENS.bgCard,
              color: TOKENS.textSec,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = TOKENS.bgCardHi;
              e.currentTarget.style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = TOKENS.bgCard;
              e.currentTarget.style.transform = 'rotate(0deg)';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cliente</label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginTop: 8,
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value="">Seleccionar cliente</option>
              {clientes.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Servicio */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Servicio</label>
            <input
              type="text"
              placeholder="Buscar servicio..."
              value={servicioSearch}
              onChange={(e) => setServicioSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginTop: 8,
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                marginBottom: 8,
              }}
            />
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value="">Seleccionar servicio</option>
              {serviciosFiltrados.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} - {s.precio}€
                </option>
              ))}
            </select>
          </div>

          {/* Profesional */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Profesional</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {profesionales.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => setProfId(p.id)}
                  style={{
                    padding: '8px 14px',
                    background: profId === p.id ? `${p.color}22` : TOKENS.bgCard,
                    border: `1px solid ${profId === p.id ? `${p.color}44` : TOKENS.border}`,
                    borderRadius: 8,
                    color: profId === p.id ? p.color : TOKENS.text,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (profId !== p.id) {
                      e.currentTarget.style.borderColor = p.color;
                      e.currentTarget.style.background = `${p.color}10`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (profId !== p.id) {
                      e.currentTarget.style.borderColor = TOKENS.border;
                      e.currentTarget.style.background = TOKENS.bgCard;
                    }
                  }}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Estado */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginTop: 8,
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value={CITA_STATUS.CONFIRMADA}>Confirmada</option>
              <option value={CITA_STATUS.CANCELADA}>Cancelada</option>
              <option value={CITA_STATUS.PENDIENTE}>Pendiente</option>
            </select>
          </div>

          {/* Hora inicio y fin */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hora inicio</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':');
                  const newInicio = new Date(inicio);
                  newInicio.setHours(parseInt(h), parseInt(m));
                  setInicio(newInicio.toISOString());
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: 8,
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 10,
                  color: TOKENS.text,
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hora fin</label>
              <input
                type="time"
                value={horaFin}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':');
                  const newFin = new Date(fin);
                  newFin.setHours(parseInt(h), parseInt(m));
                  setFin(newFin.toISOString());
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: 8,
                  background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: 10,
                  color: TOKENS.text,
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {/* Información de tiempos */}
          <div style={{ background: 'rgba(99,102,241,0.08)', padding: 12, borderRadius: 10, borderLeft: `3px solid ${TOKENS.primary}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text, marginBottom: 8 }}>Información de tiempos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: TOKENS.textTer, display: 'block', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Tiempo activo</span>
                <span style={{ color: TOKENS.text, fontWeight: 600 }}>
                  {cita.fin_activa ? new Date(cita.fin_activa).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
              <div>
                <span style={{ color: TOKENS.textTer, display: 'block', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Tiempo de espera</span>
                <span style={{ color: TOKENS.text, fontWeight: 600 }}>
                  {cita.fin_espera ? new Date(cita.fin_espera).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '16px 24px', borderTop: `1px solid ${TOKENS.border}`, flexWrap: 'wrap' }}>
          <button
            onClick={handleEliminar}
            disabled={guardando}
            style={{
              padding: '9px 14px',
              background: TOKENS.danger,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: guardando ? 0.6 : 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!guardando) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 4px 12px rgba(239,68,68,0.3)`;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🗑 Eliminar
          </button>
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
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.2s ease',
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
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={!clienteId || !servicioId || !profId || guardando}
              style={{
                padding: '9px 18px',
                background: !clienteId || !servicioId || !profId || guardando ? 'rgba(99,102,241,0.5)' : `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: !clienteId || !servicioId || !profId || guardando ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: !clienteId || !servicioId || !profId || guardando ? 'none' : `0 4px 12px rgba(99,102,241,0.4)`,
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onMouseEnter={(e) => {
                if (!(!clienteId || !servicioId || !profId || guardando)) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 8px 24px rgba(99,102,241,0.6)`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 4px 12px rgba(99,102,241,0.4)`;
              }}
            >
              {guardando ? '...' : '✓ Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
