import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useCalendarRefresh } from '@/lib/calendarContext';

const tokens = DESIGN_TOKENS;

interface Cita {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  profesional_id: string;
  profesionales?: { nombre: string; color: string };
  servicios?: { nombre: string; precio: number };
  clientes?: { nombre: string };
}

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  rol?: string;
}

export default function AgendaCalendar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshTrigger } = useCalendarRefresh();
  const { width } = useWindowDimensions();
  const { c } = useTheme();

  const isDesktop = width >= 1024;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');
  const [selectedProf, setSelectedProf] = useState<string | null>(null);

  // Cargar datos
  useEffect(() => {
    (async () => {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }
      setNegocioId(profile.negocio_id);

      const { data: profs } = await supabase
        .from('profesionales')
        .select('id, nombre, color, activo')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true)
        .order('nombre');

      setProfesionales(profs ?? []);

      // Cargar citas del mes
      const start = startOfMonth(currentDate).toISOString();
      const end = endOfMonth(currentDate).toISOString();

      const { data: citsData } = await supabase
        .from('citas')
        .select(
          `id, inicio, fin, estado, profesional_id,
           profesionales(nombre, color),
           servicios(nombre, precio),
           clientes(nombre)`
        )
        .eq('negocio_id', profile.negocio_id)
        .gte('inicio', start)
        .lte('inicio', end)
        .neq('estado', 'cancelada')
        .order('inicio');

      setCitas((citsData as any) ?? []);
      setLoading(false);
    })();
  }, [currentDate, refreshTrigger]);

  useFocusEffect(
    useCallback(() => {
      if (negocioId) {
        const loadMonth = async () => {
          const start = startOfMonth(currentDate).toISOString();
          const end = endOfMonth(currentDate).toISOString();

          const { data: citsData } = await supabase
            .from('citas')
            .select(
              `id, inicio, fin, estado, profesional_id,
               profesionales(nombre, color),
               servicios(nombre, precio),
               clientes(nombre)`
            )
            .eq('negocio_id', negocioId)
            .gte('inicio', start)
            .lte('inicio', end)
            .neq('estado', 'cancelada')
            .order('inicio');

          setCitas((citsData as any) ?? []);
        };
        loadMonth();
      }
    }, [negocioId, currentDate])
  );

  // Datos derivados
  const citasHoy = citas.filter(c => c.inicio.split('T')[0] === selectedDate && c.estado !== 'cancelada');
  const citasConfirmadas = citasHoy.filter(c => c.estado === 'confirmada').length;
  const citasTotalesMes = citas.filter(c => c.estado !== 'cancelada').length;
  const ingresosMes = citas.reduce((sum, c) => sum + (c.servicios?.precio ?? 0), 0);

  const profesionalesActivos = new Set(citas.map(c => c.profesional_id)).size;
  const ocupacion = profesionalesActivos > 0 ? Math.round((citasTotalesMes / (profesionalesActivos * 20)) * 100) : 0;

  const citasHoyPorProf = profesionales.reduce(
    (acc, prof) => {
      const citasProf = citasHoy.filter(c => c.profesional_id === prof.id);
      if (citasProf.length > 0) {
        acc[prof.id] = citasProf;
      }
      return acc;
    },
    {} as Record<string, Cita[]>
  );

  const filteredCitas = selectedProf && selectedProf !== 'todos'
    ? citasHoy.filter(c => c.profesional_id === selectedProf)
    : citasHoy;

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.primary} size="large" />
      </View>
    );
  }

  if (isDesktop) {
    return <AgendaDesktop
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      currentDate={currentDate}
      setCurrentDate={setCurrentDate}
      citasHoy={citasHoy}
      citasConfirmadas={citasConfirmadas}
      citas={citas}
      profesionales={profesionales}
      filteredCitas={filteredCitas}
      selectedProf={selectedProf}
      setSelectedProf={setSelectedProf}
      router={router}
    />;
  }

  return <AgendaMobile
    selectedDate={selectedDate}
    setSelectedDate={setSelectedDate}
    currentDate={currentDate}
    citasHoy={citasHoy}
    citasConfirmadas={citasConfirmadas}
    ingresosMes={ingresosMes}
    router={router}
    insets={insets}
    profesionales={profesionales}
  />;
}

function AgendaDesktop({
  selectedDate,
  setSelectedDate,
  currentDate,
  setCurrentDate,
  citasHoy,
  citasConfirmadas,
  citas,
  profesionales,
  filteredCitas,
  selectedProf,
  setSelectedProf,
  router,
}: any) {
  const insets = useSafeAreaInsets();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const citasByDate = citas.reduce(
    (acc: Record<string, number>, c: Cita) => {
      const d = c.inicio.split('T')[0];
      acc[d] = (acc[d] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <View style={[s.root, { backgroundColor: tokens.bg }]}>
      {/* Topbar */}
      <View style={s.desktopTopbar}>
        <View>
          <Text style={s.title}>Agenda</Text>
          <Text style={s.subtitle}>
            {format(new Date(selectedDate), "EEEE, d 'de' MMMM", { locale: es })} · {citasHoy.length} citas · {citasConfirmadas} confirmadas
          </Text>
        </View>
        <TouchableOpacity
          style={s.btnNuevaCita}
          onPress={() =>
            router.push({
              pathname: '/screens/nueva-cita',
              params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() },
            })
          }
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.btnNuevaCitaText}>Nueva cita</Text>
        </TouchableOpacity>
      </View>

      <View style={s.desktopContent}>
        {/* Left sidebar 380px */}
        <ScrollView style={[s.desktopSidebar, { borderRightColor: tokens.border }]} showsVerticalScrollIndicator={false}>
          {/* 2x2 Stats grid */}
          <View style={[s.statsGrid2x2, { marginBottom: tokens.spacing.xl }]}>
            <StatCard label="Hoy" value={citasHoy.length} sub="citas" color={tokens.primary} />
            <StatCard label="Ingresos" value={`€${citas.reduce((sum: number, c: Cita) => sum + (c.servicios?.precio ?? 0), 0)}`} sub="estimado" color={tokens.success} />
            <StatCard label="Mes" value={citasHoy.length} sub="de 240" color={tokens.warning} />
            <StatCard label="Ocupación" value={`${Math.round((citasHoy.length / 20) * 100)}%`} sub="esta semana" color={tokens.violet ?? tokens.primary} />
          </View>

          {/* Mini calendar */}
          <View style={{ marginBottom: tokens.spacing.xl }}>
            <DesktopMiniCalendar
              currentDate={currentDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPrevMonth={() => setCurrentDate(subMonths(currentDate, 1))}
              onNextMonth={() => setCurrentDate(addMonths(currentDate, 1))}
              citasByDate={citasByDate}
            />
          </View>

          {/* Profesionales filter */}
          <View style={{ marginBottom: tokens.spacing.lg }}>
            <Text style={s.filterLabel}>Profesionales</Text>
            <TouchableOpacity
              style={[s.profButton, selectedProf === null && s.profButtonSelected]}
              onPress={() => setSelectedProf(null)}
            >
              <View style={[s.profButtonDot, { backgroundColor: tokens.primary }]} />
              <Text style={[s.profButtonText, selectedProf === null && s.profButtonTextSelected]}>Todos</Text>
              <Text style={s.profButtonCount}>{citasHoy.length}</Text>
            </TouchableOpacity>
            {profesionales.map((p: Profesional) => (
              <TouchableOpacity
                key={p.id}
                style={[s.profButton, selectedProf === p.id && s.profButtonSelected]}
                onPress={() => setSelectedProf(p.id)}
              >
                <View style={[s.profButtonDot, { backgroundColor: p.color }]} />
                <Text style={[s.profButtonText, selectedProf === p.id && s.profButtonTextSelected]}>
                  {p.nombre}
                </Text>
                <Text style={s.profButtonCount}>
                  {citasHoy.filter((c: Cita) => c.profesional_id === p.id).length}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Right main content */}
        <ScrollView style={s.desktopMain} showsVerticalScrollIndicator={false}>
          {/* Day header */}
          <View style={s.dayHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tokens.spacing.lg }}>
                <Text style={s.dayTitle}>
                  {format(new Date(selectedDate), "EEEE, d 'de' MMM", { locale: es })}
                </Text>
                <View style={[s.pill, { backgroundColor: `${tokens.primary}22`, borderColor: `${tokens.primary}33` }]}>
                  <Text style={[s.pillText, { color: tokens.primary }]}>HOY</Text>
                </View>
              </View>
              <Text style={s.daySubtitle}>
                {filteredCitas.length} citas programadas · €{filteredCitas.reduce((sum: number, c: Cita) => sum + (c.servicios?.precio ?? 0), 0)} estimados
              </Text>
            </View>
          </View>

          {/* Day timeline */}
          <DayTimeline citas={filteredCitas} profesionales={profesionales} />
        </ScrollView>
      </View>
    </View>
  );
}

function AgendaMobile({
  selectedDate,
  setSelectedDate,
  currentDate,
  citasHoy,
  citasConfirmadas,
  ingresosMes,
  router,
  insets,
  profesionales,
}: any) {
  const weekStart = addDays(new Date(selectedDate), -new Date(selectedDate).getDay() + 1);
  const weekDays = Array.from({ length: 7 }, (_: any, i: number) => addDays(weekStart, i));

  return (
    <ScrollView style={[s.root, { backgroundColor: tokens.bg }]} showsVerticalScrollIndicator={false}>
      <View style={[s.mobileContainer, { paddingTop: insets.top + tokens.spacing.lg }]}>
        {/* Header */}
        <View style={s.mobileHeader}>
          <View>
            <Text style={s.mobileHeaderDay}>
              {format(new Date(selectedDate), 'EEEE', { locale: es }).toUpperCase()}
            </Text>
            <Text style={s.mobileHeaderDate}>
              {format(new Date(selectedDate), 'd MMMM', { locale: es })}
            </Text>
          </View>
          <View style={s.mobileAvatar}>
            <Text style={s.mobileAvatarText}>RM</Text>
          </View>
        </View>

        {/* 2-column stats */}
        <View style={{ flexDirection: 'row', gap: tokens.spacing.md, marginBottom: tokens.spacing.lg }}>
          <View style={[s.mobileStatCard, { backgroundColor: tokens.bgCard }]}>
            <Text style={s.mobileStatLabel}>HOY</Text>
            <Text style={s.mobileStatValue}>{citasHoy.length}</Text>
            <Text style={s.mobileStatSub}>citas</Text>
          </View>
          <View style={[s.mobileStatCard, { backgroundColor: `${tokens.success}22`, borderColor: `${tokens.success}33`, borderWidth: 1 }]}>
            <Text style={[s.mobileStatLabel, { color: tokens.success }]}>INGRESOS</Text>
            <Text style={[s.mobileStatValue, { color: tokens.success }]}>{ingresosMes}€</Text>
          </View>
        </View>

        {/* Mini week calendar */}
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            {weekDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isSelected = dateStr === selectedDate;
              const dayNum = format(day, 'd');
              const dayName = format(day, 'E', { locale: es });

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    s.weekDay,
                    isSelected && s.weekDaySelected,
                  ]}
                  onPress={() => setSelectedDate(dateStr)}
                >
                  <Text style={[s.weekDayName, { color: isSelected ? '#fff' : c.text }]}>
                    {dayName}
                  </Text>
                  <Text style={[s.weekDayNum, { color: isSelected ? '#fff' : c.text }]}>
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Citas list */}
        {citasHoy.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={tokens.textTertiary} />
            <Text style={[s.emptyStateTitle, { color: c.text }]}>Sin citas</Text>
            <Text style={[s.emptyStateSubtitle, { color: c.textSecondary }]}>No hay citas programadas para este día</Text>
          </View>
        ) : (
          <View style={{ gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl * 2 }}>
            {citasHoy.map((cita: Cita) => (
              <TouchableOpacity
                key={cita.id}
                style={[s.mobileCitaCard, { borderLeftColor: cita.profesionales?.color ?? tokens.border }]}
                onPress={() => router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } })}
              >
                <View style={{ gap: tokens.spacing.xs, flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                    <Text style={[s.mobileCitaHora, { color: c.text }]}>
                      {format(parseISO(cita.inicio), 'HH:mm')}
                    </Text>
                    <Text style={{ fontSize: tokens.fontSize.xs, color: c.textTertiary }}>
                      {Math.round((new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000)} min
                    </Text>
                  </View>
                  <Text style={s.mobileCitaCliente}>
                    {cita.clientes?.nombre ?? 'Sin cliente'}
                  </Text>
                  <Text style={s.mobileCitaServicio}>
                    {cita.servicios?.nombre ?? 'Servicio'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        backgroundColor: cita.profesionales?.color ?? tokens.border,
                      }}
                    />
                    <Text style={{ fontSize: tokens.fontSize.xs, color: tokens.textTertiary }}>
                      {cita.profesionales?.nombre?.split(' ')[0]}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.mobileCitaPrecio}>
                    €{cita.servicios?.precio ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { bottom: 80 }]}
        onPress={() =>
          router.push({
            pathname: '/screens/nueva-cita',
            params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() },
          })
        }
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ label, value, sub, color }: any) {
  return (
    <View style={[s.statCardContainer, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      <Text style={s.statCardLabel}>{label}</Text>
      <Text style={[s.statCardValue, { color: tokens.text }]}>{value}</Text>
      <Text style={s.statCardSub}>{sub}</Text>
    </View>
  );
}

function DesktopMiniCalendar({
  currentDate,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  citasByDate,
}: any) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = monthStart.getDay();
  const emptyDays = Array(firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1).fill(null);

  return (
    <View style={[s.desktopCalendar, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      <View style={s.calHeader}>
        <TouchableOpacity onPress={onPrevMonth} style={s.calNavBtn}>
          <Ionicons name="chevron-back" size={16} color={tokens.textSecondary} />
        </TouchableOpacity>
        <Text style={s.calMonth}>{format(currentDate, 'MMMM yyyy', { locale: es })}</Text>
        <TouchableOpacity onPress={onNextMonth} style={s.calNavBtn}>
          <Ionicons name="chevron-forward" size={16} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={s.weekdaysRow}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => (
          <Text key={day} style={s.weekdayText}>
            {day}
          </Text>
        ))}
      </View>

      <View style={s.daysGrid}>
        {emptyDays.map((_, i) => (
          <View key={`empty-${i}`} />
        ))}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isSelected = dateStr === selectedDate;
          const isCurrentDay = isToday(day);
          const citaCount = citasByDate[dateStr] ?? 0;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                s.dayCell,
                isSelected && s.dayCellSelected,
                isCurrentDay && !isSelected && s.dayCellToday,
              ]}
              onPress={() => onSelectDate(dateStr)}
            >
              <Text
                style={[
                  s.dayNumber,
                  isSelected && s.dayNumberSelected,
                  isCurrentDay && !isSelected && s.dayNumberToday,
                ]}
              >
                {format(day, 'd')}
              </Text>
              {citaCount > 0 && (
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  <View
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 999,
                      backgroundColor: isSelected ? '#fff' : tokens.primary,
                    }}
                  />
                  {citaCount > 1 && (
                    <View
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: 999,
                        backgroundColor: isSelected ? '#fff' : tokens.primary,
                      }}
                    />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DayTimeline({ citas, profesionales }: any) {
  return (
    <View style={[s.timeline, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      {/* Professional columns header */}
      <View style={[s.timelineHeader, { borderBottomColor: tokens.border }]}>
        {profesionales.map((p: Profesional) => (
          <View key={p.id} style={[s.timelineProfCol, { borderLeftColor: p.color }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: p.color }} />
              <View>
                <Text style={s.timelineProfName}>{p.nombre.split(' ')[0]}</Text>
                <Text style={s.timelineProfRole}>{p.rol ?? 'Prof'}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Citas list by professional */}
      {profesionales.length === 0 ? (
        <View style={{ padding: tokens.spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: tokens.textTertiary }}>Sin profesionales</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          {profesionales.map((prof: Profesional) => (
            <View key={prof.id} style={[s.timelineCol, { borderLeftColor: prof.color }]}>
              {citas
                .filter((c: Cita) => c.profesional_id === prof.id)
                .map((cita: Cita) => (
                  <TouchableOpacity key={cita.id} style={[s.citaItem, { backgroundColor: `${prof.color}15`, borderLeftColor: prof.color }]}>
                    <Text style={s.citaItemTime}>{format(parseISO(cita.inicio), 'HH:mm')}</Text>
                    <Text style={s.citaItemCliente}>{cita.clientes?.nombre}</Text>
                    <Text style={s.citaItemServicio}>{cita.servicios?.nombre}</Text>
                  </TouchableOpacity>
                ))}
              {citas.filter((c: Cita) => c.profesional_id === prof.id).length === 0 && (
                <View style={{ padding: tokens.spacing.md, alignItems: 'center' }}>
                  <Text style={{ fontSize: tokens.fontSize.xs, color: tokens.textTertiary }}>Sin citas</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}


const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Desktop
  desktopTopbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.spacing.xxl,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
  },
  title: { fontSize: tokens.fontSize.xxxl, fontWeight: '700', color: tokens.text, marginBottom: tokens.spacing.xs },
  subtitle: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary },
  btnNuevaCita: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    backgroundColor: tokens.primary,
    borderRadius: tokens.radius.md,
  },
  btnNuevaCitaText: { color: '#fff', fontSize: tokens.fontSize.sm, fontWeight: '600' },

  desktopContent: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  desktopSidebar: {
    width: 380,
    borderRightWidth: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
  },
  desktopMain: { flex: 1, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.lg, overflow: 'hidden' },

  statsGrid2x2: {
    display: 'flex',
    gap: tokens.spacing.md,
    flexWrap: 'wrap',
  },
  statCardContainer: {
    width: '48%',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  statCardLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statCardValue: { fontSize: tokens.fontSize.xxl, fontWeight: '700' },
  statCardSub: { fontSize: tokens.fontSize.xs, color: tokens.textSecondary },

  filterLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase', marginBottom: tokens.spacing.md, letterSpacing: 0.5 },
  profButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: tokens.spacing.sm,
  },
  profButtonSelected: {
    backgroundColor: `${tokens.primary}11`,
    borderColor: `${tokens.primary}33`,
  },
  profButtonDot: { width: 24, height: 24, borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
  profButtonText: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.textSecondary, flex: 1 },
  profButtonTextSelected: { color: tokens.text },
  profButtonCount: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, paddingHorizontal: tokens.spacing.sm, paddingVertical: tokens.spacing.xs, backgroundColor: tokens.bgCard, borderRadius: tokens.radius.sm },

  desktopCalendar: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.lg,
    marginBottom: tokens.spacing.xl,
  },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.lg },
  calNavBtn: { width: 28, height: 28, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: tokens.border, justifyContent: 'center', alignItems: 'center' },
  calMonth: { fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.text },
  weekdaysRow: { flexDirection: 'row', gap: tokens.spacing.xs, marginBottom: tokens.spacing.md },
  weekdayText: { flex: 1, textAlign: 'center', fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: tokens.radius.sm },
  dayCellSelected: { backgroundColor: tokens.primary },
  dayCellToday: { backgroundColor: tokens.primarySoft, borderWidth: 1, borderColor: tokens.primary },
  dayNumber: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.textSecondary },
  dayNumberSelected: { color: '#fff' },
  dayNumberToday: { color: tokens.primary, fontWeight: '700' },

  dayHeader: { marginBottom: tokens.spacing.xl },
  dayTitle: { fontSize: tokens.fontSize.xxxl, fontWeight: '700', color: tokens.text, letterSpacing: -0.3 },
  daySubtitle: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary, marginTop: tokens.spacing.xs },
  pill: { paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, borderRadius: tokens.radius.full, borderWidth: 1 },
  pillText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },

  timeline: { borderRadius: tokens.radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: tokens.spacing.xl, flex: 1 },
  timelineHeader: { flexDirection: 'row', borderBottomWidth: 1, backgroundColor: `${tokens.primary}08`, minHeight: 80 },
  timelineProfCol: { flex: 1, borderLeftWidth: 3, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md, minWidth: 180 },
  timelineProfName: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: tokens.text },
  timelineProfRole: { fontSize: tokens.fontSize.xs, color: tokens.textTertiary },
  timelineCol: { flex: 1, borderLeftWidth: 3, minWidth: 180 },
  citaItem: { borderLeftWidth: 3, padding: tokens.spacing.md, borderBottomWidth: 1, borderBottomColor: tokens.border },
  citaItemTime: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: tokens.text },
  citaItemCliente: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.text, marginTop: tokens.spacing.xs },
  citaItemServicio: { fontSize: tokens.fontSize.xs, color: tokens.textSecondary, marginTop: tokens.spacing.xs },

  // Mobile
  mobileContainer: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.lg },
  mobileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.lg,
  },
  mobileHeaderDay: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
  mobileHeaderDate: { fontSize: tokens.fontSize.xxxl, fontWeight: '700', color: tokens.text, marginTop: tokens.spacing.xs },
  mobileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: tokens.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tokens.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  mobileAvatarText: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: '#fff' },

  mobileStatCard: {
    flex: 1,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  mobileStatLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
  mobileStatValue: { fontSize: tokens.fontSize.xl, fontWeight: '700', color: tokens.text, marginTop: tokens.spacing.xs },
  mobileStatSub: { fontSize: tokens.fontSize.xs, color: tokens.textSecondary, marginTop: tokens.spacing.xs },

  weekDay: {
    flex: 1,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.bgCard,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.border,
  },
  weekDaySelected: {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  },
  weekDayName: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary },
  weekDayNum: { fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.text, marginTop: tokens.spacing.xs },

  mobileCitaCard: {
    flexDirection: 'row',
    backgroundColor: tokens.bgCard,
    borderRadius: tokens.radius.lg,
    borderLeftWidth: 3,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  mobileCitaHora: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: tokens.text },
  mobileCitaCliente: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.text },
  mobileCitaServicio: { fontSize: tokens.fontSize.xs, color: tokens.textSecondary },
  mobileCitaPrecio: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: tokens.success },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.lg },
  emptyStateTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.text },
  emptyStateSubtitle: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary, textAlign: 'center' },

  fab: {
    position: 'absolute',
    right: tokens.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: tokens.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: tokens.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
});
