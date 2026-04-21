'use client'
import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';

// ─── tipos ───────────────────────────────────────────────────────────────────
interface CitaRaw {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  profesional_id: string;
  profesionales: { nombre: string; color: string } | null;
  servicios: { nombre: string; precio: number } | null;
  clientes: { nombre: string } | null;
}
interface Profesional { id: string; nombre: string; color: string; }

// ─── helpers compartidos ──────────────────────────────────────────────────────
const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f59e0b', confirmada: '#6366f1', completada: '#10b981',
  no_show: '#ef4444', cancelada: '#94a3b8',
};

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function getMonthDays(year: number, month: number): (number | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── hook de datos ────────────────────────────────────────────────────────────
function useAgendaData(year: number, month: number) {
  const [citas, setCitas] = useState<CitaRaw[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMonth = useCallback(async (y: number, m: number, nId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('citas')
      .select(`id, inicio, fin, estado, profesional_id,
        profesionales(nombre, color), servicios(nombre, precio), clientes(nombre)`)
      .eq('negocio_id', nId)
      .gte('inicio', new Date(y, m, 1).toISOString())
      .lte('inicio', new Date(y, m + 1, 0, 23, 59, 59).toISOString())
      .order('inicio');
    setCitas((data as CitaRaw[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) { setLoading(false); return; }
      setNegocioId(profile.negocio_id);
      const { data: profs } = await supabase
        .from('profesionales').select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id).eq('activo', true).order('nombre');
      setProfesionales(profs ?? []);
      await loadMonth(year, month, profile.negocio_id);
    })();
  }, []);

  useEffect(() => {
    if (negocioId) loadMonth(year, month, negocioId);
  }, [year, month, negocioId]);

  return { citas, profesionales, loading, negocioId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function AgendaCalendar() {
  const { isDesktop } = useResponsive();
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const { citas, profesionales, loading, negocioId } = useAgendaData(month.year, month.month);

  if (isDesktop) {
    return <DesktopCalendar citas={citas} profesionales={profesionales} loading={loading} negocioId={negocioId} />;
  }
  return (
    <MobileCalendar
      citas={citas} profesionales={profesionales} loading={loading}
      month={month} setMonth={setMonth}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP — FullCalendar
// ═══════════════════════════════════════════════════════════════════════════════
function DesktopCalendar({ citas, profesionales, loading, negocioId }: {
  citas: CitaRaw[]; profesionales: Profesional[]; loading: boolean; negocioId: string | null;
}) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const [selectedProf, setSelectedProf] = useState('todos');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const calendarEvents = citas
    .filter(c => c.estado !== 'cancelada')
    .filter(c => selectedProf === 'todos' || c.profesional_id === selectedProf)
    .map(c => ({
      id: c.id,
      title: c.clientes?.nombre ?? 'Sin cliente',
      start: c.inicio,
      end: c.fin,
      backgroundColor: (c.profesionales?.color ?? '#6366f1') + '30',
      borderColor: c.profesionales?.color ?? '#6366f1',
      textColor: c.profesionales?.color ?? '#6366f1',
      extendedProps: c,
    }));

  const totalMes = citas.filter(c => c.estado !== 'cancelada').length;
  const confirmadas = citas.filter(c => c.estado === 'confirmada').length;
  const profActivos = new Set(citas.filter(c => c.estado !== 'cancelada').map(c => c.profesional_id)).size;

  const selectedProfLabel = selectedProf === 'todos'
    ? 'Todos los profesionales'
    : profesionales.find(p => p.id === selectedProf)?.nombre ?? 'Todos';

  const bg = isDark ? '#0f172a' : '#f8fafc';
  const surface = isDark ? '#1e293b' : '#ffffff';
  const border = isDark ? '#334155' : '#e2e8f0';
  const text = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#64748b' : '#94a3b8';
  const textSec = isDark ? '#94a3b8' : '#475569';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: bg, overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: text, margin: 0 }}>Agenda</h1>
            <p style={{ fontSize: 13, color: textMuted, marginTop: 3, margin: 0 }}>
              Revisa y administra tus reservas
            </p>
          </div>
          <button
            onClick={() => router.push('/screens/nueva-cita')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nueva cita
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ backgroundColor: surface, border: `1px solid ${border}`, borderRadius: 16, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: textSec, margin: '0 0 4px' }}>Citas este mes</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: text, margin: 0 }}>{loading ? '—' : totalMes}</p>
          </div>
          <div style={{ backgroundColor: isDark ? '#6366f11a' : '#eef2ff', border: `1px solid ${isDark ? '#6366f133' : '#c7d2fe'}`, borderRadius: 16, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6366f1', margin: '0 0 4px' }}>Confirmadas</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#6366f1', margin: 0 }}>{loading ? '—' : confirmadas}</p>
          </div>
          <div style={{ backgroundColor: isDark ? '#f59e0b1a' : '#fef3c7', border: `1px solid ${isDark ? '#f59e0b33' : '#fcd34d'}`, borderRadius: 16, padding: '16px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#f59e0b', margin: '0 0 4px' }}>Profesionales activos</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', margin: 0 }}>{loading ? '—' : profActivos}</p>
          </div>
        </div>
      </div>

      {/* ── FullCalendar ── */}
      <div style={{ flex: 1, padding: '0 28px 28px', overflow: 'hidden', position: 'relative' }}>
        <div style={{ backgroundColor: surface, borderRadius: 24, border: `1px solid ${border}`, padding: 24, height: '100%', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>

          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', borderRadius: 24 }}>
              <div style={{ width: 36, height: 36, border: '3px solid transparent', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {/* Employee dropdown — absolute sobre toolbar de FC */}
          <div ref={dropdownRef} style={{ position: 'absolute', top: 24, right: 24, zIndex: 50 }}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minWidth: 180 }}
            >
              <span>👥</span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProfLabel}</span>
              <span style={{ fontSize: 10 }}>{dropdownOpen ? '▲' : '▼'}</span>
            </button>

            {dropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 220, backgroundColor: surface, border: `1px solid ${border}`, borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', overflow: 'hidden', zIndex: 100 }}>
                {/* Todos */}
                <button
                  onClick={() => { setSelectedProf('todos'); setDropdownOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: selectedProf === 'todos' ? '#6366f115' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#6366f122', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 14 }}>👥</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: text, margin: 0 }}>Todos</p>
                    <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>Ver toda la agenda</p>
                  </div>
                </button>

                {profesionales.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProf(p.id); setDropdownOpen(false); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: selectedProf === p.id ? '#6366f115' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: p.color + '33', border: `2px solid ${p.color}`, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: text, margin: 0 }}>{p.nombre}</p>
                      <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>Profesional</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <style>{`
            .fc .fc-button-primary {
              background-color: #6366f1 !important;
              border-color: #6366f1 !important;
              border-radius: 8px !important;
              text-transform: capitalize;
              padding: 7px 12px !important;
              font-size: 13px !important;
              font-weight: 700 !important;
            }
            .fc .fc-button-primary:hover { opacity: 0.85; }
            .fc .fc-button-group { gap: 6px; display: flex; }
            .fc .fc-button-group .fc-button { border-radius: 8px !important; margin-left: 0 !important; }
            .fc .fc-toolbar-title { font-size: 18px !important; font-weight: 800; text-transform: capitalize; color: ${text}; }
            .fc .fc-toolbar-chunk { display: flex; align-items: center; gap: 6px; }
            .fc-theme-standard td, .fc-theme-standard th, .fc-theme-standard .fc-scrollgrid { border-color: ${border} !important; }
            .fc-theme-standard .fc-scrollgrid { border: none !important; }
            .fc-theme-standard td, .fc-theme-standard th { border: none !important; }
            .fc .fc-timegrid-slot { height: 40px !important; border-bottom: none !important; }
            .fc .fc-timegrid-slot-minor { border-bottom: none !important; }
            .fc .fc-timegrid-col { border: none !important; padding: 0 4px !important; }
            .fc .fc-timegrid-col-frame {
              background-color: ${isDark ? '#0f172a' : '#f8fafc'} !important;
              border: 1px solid ${border} !important;
              border-radius: 12px !important;
              background-image: repeating-linear-gradient(to bottom, transparent 0px, transparent 39px, ${border} 39px, ${border} 40px) !important;
            }
            .fc-timeGridWeek-view .fc-day-today .fc-timegrid-col-frame {
              background-color: #6366f115 !important;
              border-color: #6366f144 !important;
              background-image: repeating-linear-gradient(to bottom, transparent 0px, transparent 39px, #6366f133 39px, #6366f133 40px) !important;
            }
            .fc-timeGridWeek-view .fc-day-today .fc-col-header-cell-cushion {
              background-color: #6366f1 !important; color: white !important;
              border-radius: 8px; padding: 4px 12px !important; display: inline-block;
            }
            .fc .fc-timegrid-axis { border: none !important; background-color: transparent !important; }
            .fc .fc-timegrid-slot-label { border: none !important; padding-right: 8px !important; background: transparent !important; vertical-align: top !important; }
            .fc .fc-timegrid-slot-label-cushion { position: relative !important; top: -10px !important; color: ${textMuted}; }
            .fc .fc-timegrid-divider { display: none !important; }
            .fc .fc-col-header-cell-cushion { color: ${textSec}; padding: 8px !important; font-size: 13px; font-weight: 600; text-transform: capitalize; }
            .fc .fc-day-today { background-color: transparent !important; }
            .fc .fc-v-event {
              border-width: 0 0 0 3px !important; border-style: solid !important;
              border-radius: 6px !important; background-clip: padding-box;
            }
            .fc .fc-event-main { font-size: 12px !important; line-height: 1.3 !important; padding: 3px 5px !important; }
            .fc .fc-event-time { font-size: 11px !important; font-weight: 700 !important; }
            .fc .fc-event-title { font-weight: 600 !important; }
            .fc .fc-daygrid-day-number { color: ${textSec}; padding: 8px !important; font-weight: 500; }
            .fc .fc-day-today .fc-daygrid-day-number { color: #6366f1 !important; font-weight: 800; }
            .fc .fc-scroller::-webkit-scrollbar { width: 5px; }
            .fc .fc-scroller::-webkit-scrollbar-track { background: transparent; }
            .fc .fc-scroller::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 999px; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>

          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={esLocale}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek',
            }}
            events={calendarEvents}
            height="100%"
            slotMinTime="08:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            slotLabelInterval="01:00"
            allDaySlot={false}
            nowIndicator={true}
            eventClick={(info) => {
              const cita = info.event.extendedProps as CitaRaw;
              router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } });
            }}
            select={(info) => {
              router.push({ pathname: '/screens/nueva-cita', params: { hora: info.start.toISOString() } });
            }}
            selectable={true}
            selectMirror={true}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE — month grid + day list
// ═══════════════════════════════════════════════════════════════════════════════
function MobileCalendar({ citas, profesionales, loading, month, setMonth }: {
  citas: CitaRaw[]; profesionales: Profesional[]; loading: boolean;
  month: { year: number; month: number };
  setMonth: React.Dispatch<React.SetStateAction<{ year: number; month: number }>>;
}) {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedProfId, setSelectedProfId] = useState('todos');

  const dotsByDate = (() => {
    const map: Record<string, string[]> = {};
    citas.filter(c => c.estado !== 'cancelada')
      .filter(c => selectedProfId === 'todos' || c.profesional_id === selectedProfId)
      .forEach(cita => {
        const d = cita.inicio.split('T')[0];
        if (!map[d]) map[d] = [];
        const col = cita.profesionales?.color ?? '#6366f1';
        if (!map[d].includes(col) && map[d].length < 3) map[d].push(col);
      });
    return map;
  })();

  const citasDelDia = citas
    .filter(c => c.inicio.split('T')[0] === selectedDate && c.estado !== 'cancelada')
    .filter(c => selectedProfId === 'todos' || c.profesional_id === selectedProfId)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const totalMes = citas.filter(c => c.estado !== 'cancelada').length;
  const confirmadas = citas.filter(c => c.estado === 'confirmada').length;
  const profActivos = new Set(citas.filter(c => c.estado !== 'cancelada').map(c => c.profesional_id)).size;

  const calBg = isDark ? '#1e293b' : c.surface;
  const calBorder = isDark ? '#334155' : c.border;
  const cells = getMonthDays(month.year, month.month);

  return (
    <View style={[ms.root, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        {/* Header */}
        <View style={[ms.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[ms.title, { color: c.text }]}>Agenda</Text>
        </View>

        {/* Stats */}
        <View style={ms.statsRow}>
          <MStatCard label="Citas este mes" value={String(totalMes)} color={c.text} bg={calBg} border={calBorder} />
          <MStatCard label="Confirmadas" value={String(confirmadas)} color="#6366f1" bg={isDark ? '#6366f11a' : '#eef2ff'} border={isDark ? '#6366f133' : '#c7d2fe'} />
          <MStatCard label="Profesionales" value={String(profActivos)} color="#f59e0b" bg={isDark ? '#f59e0b1a' : '#fef3c7'} border={isDark ? '#f59e0b33' : '#fcd34d'} />
        </View>

        {/* Professional filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ms.filterScroll} contentContainerStyle={ms.filterContent}>
          <MFilterChip label="Todos" color="#6366f1" selected={selectedProfId === 'todos'} onPress={() => setSelectedProfId('todos')} c={c} />
          {profesionales.map(p => (
            <MFilterChip key={p.id} label={p.nombre} color={p.color} selected={selectedProfId === p.id} onPress={() => setSelectedProfId(p.id)} c={c} />
          ))}
        </ScrollView>

        {/* Month calendar */}
        <View style={[ms.calCard, { backgroundColor: calBg, borderColor: calBorder }]}>
          <View style={ms.monthNav}>
            <TouchableOpacity style={[ms.navBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]}
              onPress={() => setMonth(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
              <Ionicons name="chevron-back" size={16} color={c.text} />
            </TouchableOpacity>
            <Text style={[ms.monthTitle, { color: c.text }]}>{MONTH_NAMES[month.month]} {month.year}</Text>
            <TouchableOpacity style={[ms.navBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]}
              onPress={() => setMonth(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
              <Ionicons name="chevron-forward" size={16} color={c.text} />
            </TouchableOpacity>
          </View>
          <View style={ms.dayNamesRow}>
            {DAY_NAMES.map(d => <View key={d} style={ms.dayNameCell}><Text style={[ms.dayName, { color: c.textTertiary }]}>{d}</Text></View>)}
          </View>
          <View style={ms.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={ms.cell} />;
              const dateStr = toDateStr(month.year, month.month, day);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const dots = dotsByDate[dateStr] ?? [];
              return (
                <TouchableOpacity key={i} style={ms.cell} onPress={() => setSelectedDate(dateStr)} activeOpacity={0.7}>
                  <View style={[ms.dayCircle, isSelected && { backgroundColor: '#6366f1' }]}>
                    <Text style={[ms.dayNum, { color: isSelected ? '#fff' : isToday ? '#6366f1' : c.text }, (isToday || isSelected) && { fontWeight: fontWeight.bold }]}>{day}</Text>
                  </View>
                  <View style={ms.dotsRow}>
                    {dots.map((col, di) => <View key={di} style={[ms.dot, { backgroundColor: col }]} />)}
                    {dots.length === 0 && <View style={ms.dotPlaceholder} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Day list */}
        <View style={ms.daySection}>
          <Text style={[ms.daySectionLabel, { color: c.textTertiary }]}>
            {selectedDate === todayStr ? 'HOY' : selectedDate.toUpperCase()}
          </Text>
          {loading ? (
            <View style={ms.loadingBox}><ActivityIndicator color="#6366f1" /></View>
          ) : citasDelDia.length === 0 ? (
            <TouchableOpacity
              style={[ms.emptyDay, { backgroundColor: calBg, borderColor: '#6366f166' }]}
              onPress={() => router.push({ pathname: '/screens/nueva-cita', params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() } })}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={32} color="#6366f1" />
              <Text style={{ color: '#6366f1', fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginTop: 6 }}>Sin citas · Pulsa para añadir</Text>
            </TouchableOpacity>
          ) : citasDelDia.map(cita => (
            <MCitaCard key={cita.id} cita={cita} c={c} isDark={isDark} calBg={calBg} calBorder={calBorder}
              onPress={() => router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } })} />
          ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[ms.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => router.push({ pathname: '/screens/nueva-cita', params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() } })}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── sub-componentes mobile ───────────────────────────────────────────────────
function MStatCard({ label, value, color, bg, border }: any) {
  return (
    <View style={[ms.statCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[ms.statLabel, { color }]}>{label}</Text>
      <Text style={[ms.statValue, { color }]}>{value}</Text>
    </View>
  );
}
function MFilterChip({ label, color, selected, onPress, c }: any) {
  return (
    <TouchableOpacity
      style={[ms.filterChip, { borderColor: selected ? color : c.border, backgroundColor: selected ? color + '22' : c.surface }]}
      onPress={onPress} activeOpacity={0.8}>
      <View style={[ms.filterDot, { backgroundColor: color }]} />
      <Text style={[ms.filterLabel, { color: selected ? color : c.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}
function MCitaCard({ cita, c, isDark, calBg, calBorder, onPress }: any) {
  const estadoColor = ESTADO_COLORS[cita.estado] ?? '#94a3b8';
  const horaStr = format(new Date(cita.inicio), 'HH:mm');
  const profColor = cita.profesionales?.color ?? '#6366f1';
  return (
    <TouchableOpacity style={[ms.citaCard, { backgroundColor: calBg, borderColor: calBorder }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[ms.horaBlock, { backgroundColor: estadoColor + '20' }]}>
        <Text style={[ms.horaText, { color: estadoColor }]}>{horaStr}</Text>
      </View>
      <View style={ms.citaInfo}>
        <Text style={[ms.citaNombre, { color: c.text }]} numberOfLines={1}>{cita.clientes?.nombre ?? 'Sin cliente'}</Text>
        <Text style={[ms.citaServicio, { color: c.textSecondary }]} numberOfLines={1}>{cita.servicios?.nombre ?? 'Servicio'}</Text>
        {cita.profesionales?.nombre && (
          <View style={ms.citaProf}>
            <View style={[ms.citaProfDot, { backgroundColor: profColor }]} />
            <Text style={[ms.citaProfText, { color: c.textTertiary }]}>{cita.profesionales.nombre}</Text>
          </View>
        )}
      </View>
      <View style={ms.citaRight}>
        <View style={[ms.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
          <Text style={[ms.estadoText, { color: estadoColor }]}>{cita.estado}</Text>
        </View>
        {(cita.servicios?.precio ?? 0) > 0 && <Text style={ms.precioText}>{cita.servicios!.precio}€</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── estilos mobile ───────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  statCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold },
  filterScroll: { marginBottom: spacing.sm },
  filterContent: { paddingHorizontal: spacing.md, gap: spacing.sm, flexDirection: 'row' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  filterDot: { width: 7, height: 7, borderRadius: 99 },
  filterLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  calCard: { marginHorizontal: spacing.md, borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.lg },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  navBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  dayNamesRow: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingBottom: 4 },
  dayNameCell: { flex: 1, alignItems: 'center' },
  dayName: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 14 },
  dotsRow: { flexDirection: 'row', gap: 2, height: 5, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 99 },
  dotPlaceholder: { width: 5, height: 5 },
  daySection: { paddingHorizontal: spacing.md, gap: spacing.sm },
  daySectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  emptyDay: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, borderRadius: radius.xl, borderWidth: 1, borderStyle: 'dashed' },
  citaCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  horaBlock: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  horaText: { fontSize: 13, fontWeight: fontWeight.bold },
  citaInfo: { flex: 1, gap: 2, minWidth: 0 },
  citaNombre: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  citaServicio: { fontSize: fontSize.sm },
  citaProf: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  citaProfDot: { width: 7, height: 7, borderRadius: 99 },
  citaProfText: { fontSize: fontSize.xs },
  citaRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  estadoText: { fontSize: 11, fontWeight: fontWeight.bold },
  precioText: { fontSize: 14, fontWeight: fontWeight.bold, color: '#10b981' },
  fab: { position: 'absolute', right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
});
