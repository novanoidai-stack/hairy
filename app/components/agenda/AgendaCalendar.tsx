import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  confirmada: '#6366f1',
  completada: '#10b981',
  no_show: '#ef4444',
  cancelada: '#94a3b8',
};

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getMonthDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  // Adjust to Monday-first (0=Mon … 6=Sun)
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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

interface Profesional {
  id: string;
  nombre: string;
  color: string;
}

export default function AgendaCalendar() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [citas, setCitas] = useState<CitaRaw[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState<string | null>(null);

  const loadMonth = useCallback(async (year: number, m: number, nId: string) => {
    setLoading(true);
    const start = new Date(year, m, 1).toISOString();
    const end = new Date(year, m + 1, 0, 23, 59, 59).toISOString();

    const { data } = await supabase
      .from('citas')
      .select(`
        id, inicio, fin, estado, profesional_id,
        profesionales(nombre, color),
        servicios(nombre, precio),
        clientes(nombre)
      `)
      .eq('negocio_id', nId)
      .gte('inicio', start)
      .lte('inicio', end)
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
        .from('profesionales')
        .select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true)
        .order('nombre');

      setProfesionales(profs ?? []);
      await loadMonth(month.year, month.month, profile.negocio_id);
    })();
  }, []);

  useEffect(() => {
    if (!negocioId) return;
    loadMonth(month.year, month.month, negocioId);
  }, [month, negocioId]);

  // Dots per day: up to 3 profesional colors
  const dotsByDate = (() => {
    const map: Record<string, string[]> = {};
    const filtered = selectedProfId === 'todos'
      ? citas.filter(c => c.estado !== 'cancelada')
      : citas.filter(c => c.estado !== 'cancelada' && c.profesional_id === selectedProfId);
    filtered.forEach((cita) => {
      const d = cita.inicio.split('T')[0];
      if (!map[d]) map[d] = [];
      const col = cita.profesionales?.color ?? '#6366f1';
      if (!map[d].includes(col) && map[d].length < 3) map[d].push(col);
    });
    return map;
  })();

  const citasDelDia = citas.filter((cita) => {
    const d = cita.inicio.split('T')[0];
    if (d !== selectedDate) return false;
    if (cita.estado === 'cancelada') return false;
    if (selectedProfId !== 'todos' && cita.profesional_id !== selectedProfId) return false;
    return true;
  }).sort((a, b) => a.inicio.localeCompare(b.inicio));

  const totalMes = citas.filter(c => c.estado !== 'cancelada').length;
  const confirmadas = citas.filter(c => c.estado === 'confirmada').length;
  const profActivos = new Set(citas.filter(c => c.estado !== 'cancelada').map(c => c.profesional_id)).size;

  const cells = getMonthDays(month.year, month.month);

  function prevMonth() {
    setMonth(prev => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function nextMonth() {
    setMonth(prev => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const calBg = isDark ? '#1e293b' : c.surface;
  const calBorder = isDark ? '#334155' : c.border;

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[s.title, { color: c.text }]}>Agenda</Text>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatCard label="Citas este mes" value={String(totalMes)} color={c.text} bg={calBg} border={calBorder} />
          <StatCard label="Confirmadas" value={String(confirmadas)} color="#6366f1" bg={isDark ? '#6366f11a' : '#eef2ff'} border={isDark ? '#6366f133' : '#c7d2fe'} />
          <StatCard label="Profesionales" value={String(profActivos)} color="#f59e0b" bg={isDark ? '#f59e0b1a' : '#fef3c7'} border={isDark ? '#f59e0b33' : '#fcd34d'} />
        </View>
        {/* Professional filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
          <FilterChip
            label="Todos"
            color="#6366f1"
            selected={selectedProfId === 'todos'}
            onPress={() => setSelectedProfId('todos')}
            c={c}
          />
          {profesionales.map((p) => (
            <FilterChip
              key={p.id}
              label={p.nombre}
              color={p.color}
              selected={selectedProfId === p.id}
              onPress={() => setSelectedProfId(p.id)}
              c={c}
            />
          ))}
        </ScrollView>

        {/* Month calendar */}
        <View style={[s.calCard, { backgroundColor: calBg, borderColor: calBorder }]}>
          {/* Month nav */}
          <View style={s.monthNav}>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={prevMonth}>
              <Ionicons name="chevron-back" size={16} color={c.text} />
            </TouchableOpacity>
            <Text style={[s.monthTitle, { color: c.text }]}>
              {MONTH_NAMES[month.month]} {month.year}
            </Text>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={nextMonth}>
              <Ionicons name="chevron-forward" size={16} color={c.text} />
            </TouchableOpacity>
          </View>

          {/* Day names header */}
          <View style={s.dayNamesRow}>
            {DAY_NAMES.map((d) => (
              <View key={d} style={s.dayNameCell}>
                <Text style={[s.dayName, { color: c.textTertiary }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          <View style={s.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={s.cell} />;
              const dateStr = toDateStr(month.year, month.month, day);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const dots = dotsByDate[dateStr] ?? [];
              return (
                <TouchableOpacity key={i} style={s.cell} onPress={() => setSelectedDate(dateStr)} activeOpacity={0.7}>
                  <View style={[
                    s.dayCircle,
                    isSelected && { backgroundColor: '#6366f1' },
                  ]}>
                    <Text style={[
                      s.dayNum,
                      { color: isSelected ? '#fff' : isToday ? '#6366f1' : c.text },
                      (isToday || isSelected) && { fontWeight: fontWeight.bold },
                    ]}>{day}</Text>
                  </View>
                  <View style={s.dotsRow}>
                    {dots.map((col, di) => (
                      <View key={di} style={[s.dot, { backgroundColor: col }]} />
                    ))}
                    {dots.length === 0 && <View style={s.dotPlaceholder} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Day section */}
        <View style={s.daySection}>
          <Text style={[s.daySectionLabel, { color: c.textTertiary }]}>
            {selectedDate === todayStr
              ? 'HOY'
              : selectedDate.toUpperCase()}
          </Text>

          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : citasDelDia.length === 0 ? (
            <TouchableOpacity
              style={[s.emptyDay, { backgroundColor: calBg, borderColor: '#6366f166' }]}
              onPress={() => router.push({ pathname: '/screens/nueva-cita', params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() } })}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={32} color="#6366f1" />
              <Text style={{ color: '#6366f1', fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginTop: 6 }}>
                Sin citas · Pulsa para añadir
              </Text>
            </TouchableOpacity>
          ) : (
            citasDelDia.map((cita) => (
              <CitaCard key={cita.id} cita={cita} c={c} isDark={isDark} calBg={calBg} calBorder={calBorder}
                onPress={() => router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } })}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + spacing.lg }]}
        onPress={() => router.push({ pathname: '/screens/nueva-cita', params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() } })}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ label, value, color, bg, border }: { label: string; value: string; color: string; bg: string; border: string }) {
  return (
    <View style={[s.statCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.statLabel, { color }]}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function FilterChip({ label, color, selected, onPress, c }: any) {
  return (
    <TouchableOpacity
      style={[s.filterChip, {
        borderColor: selected ? color : c.border,
        backgroundColor: selected ? color + '22' : c.surface,
      }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[s.filterDot, { backgroundColor: color }]} />
      <Text style={[s.filterLabel, { color: selected ? color : c.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CitaCard({ cita, c, isDark, calBg, calBorder, onPress }: { cita: CitaRaw; c: any; isDark: boolean; calBg: string; calBorder: string; onPress: () => void }) {
  const estadoColor = ESTADO_COLORS[cita.estado] ?? '#94a3b8';
  const inicio = new Date(cita.inicio);
  const horaStr = format(inicio, 'HH:mm');
  const profColor = cita.profesionales?.color ?? '#6366f1';

  return (
    <TouchableOpacity style={[s.citaCard, { backgroundColor: calBg, borderColor: calBorder }]} onPress={onPress} activeOpacity={0.8}>
      {/* Hora block */}
      <View style={[s.horaBlock, { backgroundColor: estadoColor + '20' }]}>
        <Text style={[s.horaText, { color: estadoColor }]}>{horaStr}</Text>
      </View>

      {/* Info */}
      <View style={s.citaInfo}>
        <Text style={[s.citaNombre, { color: c.text }]} numberOfLines={1}>
          {cita.clientes?.nombre ?? 'Sin cliente'}
        </Text>
        <Text style={[s.citaServicio, { color: c.textSecondary }]} numberOfLines={1}>
          {cita.servicios?.nombre ?? 'Servicio'}
        </Text>
        {cita.profesionales?.nombre && (
          <View style={s.citaProf}>
            <View style={[s.citaProfDot, { backgroundColor: profColor }]} />
            <Text style={[s.citaProfText, { color: c.textTertiary }]}>{cita.profesionales.nombre}</Text>
          </View>
        )}
      </View>

      {/* Right side */}
      <View style={s.citaRight}>
        <View style={[s.estadoBadge, { backgroundColor: estadoColor + '20' }]}>
          <Text style={[s.estadoText, { color: estadoColor }]}>{cita.estado}</Text>
        </View>
        {(cita.servicios?.precio ?? 0) > 0 && (
          <Text style={s.precioText}>{cita.servicios!.precio}€</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold },

  filterScroll: { marginBottom: spacing.sm },
  filterContent: { paddingHorizontal: spacing.md, gap: spacing.sm, flexDirection: 'row' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  filterDot: { width: 7, height: 7, borderRadius: 99 },
  filterLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  calCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
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
  emptyDay: {
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 32, borderRadius: radius.xl, borderWidth: 1, borderStyle: 'dashed',
  },

  citaCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md,
    marginBottom: spacing.sm,
  },
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

  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
