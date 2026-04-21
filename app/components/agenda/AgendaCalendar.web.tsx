import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

// ─── constantes ──────────────────────────────────────────────────────────────
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const ESTADO_COLORS: Record<string, string> = {
  pendiente: '#f59e0b', confirmada: '#6366f1', completada: '#10b981',
  no_show: '#ef4444', cancelada: '#94a3b8',
};

// ─── tipos ───────────────────────────────────────────────────────────────────
interface CitaRaw {
  id: string; inicio: string; fin: string; estado: string; profesional_id: string;
  profesionales: { nombre: string; color: string } | null;
  servicios: { nombre: string; precio: number } | null;
  clientes: { nombre: string } | null;
}
interface Profesional { id: string; nombre: string; color: string; }

// ─── helpers ─────────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
export default function AgendaCalendar() {
  const { c, isDark } = useTheme();
  const router = useRouter();

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedProfId, setSelectedProfId] = useState('todos');
  const [citas, setCitas] = useState<CitaRaw[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState<string | null>(null);

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
      await loadMonth(month.year, month.month, profile.negocio_id);
    })();
  }, []);

  useEffect(() => {
    if (negocioId) loadMonth(month.year, month.month, negocioId);
  }, [month, negocioId]);

  // ─── datos derivados ──────────────────────────────────────────────────────
  const citasFiltradas = citas
    .filter(c => c.estado !== 'cancelada')
    .filter(c => selectedProfId === 'todos' || c.profesional_id === selectedProfId);

  const countByDate: Record<string, number> = {};
  citasFiltradas.forEach(c => {
    const d = c.inicio.split('T')[0];
    countByDate[d] = (countByDate[d] ?? 0) + 1;
  });

  const citasDelDia = citasFiltradas
    .filter(c => c.inicio.split('T')[0] === selectedDate)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const totalMes = citasFiltradas.length;
  const confirmadas = citas.filter(c => c.estado === 'confirmada').length;
  const profActivos = new Set(citasFiltradas.map(c => c.profesional_id)).size;

  const cells = getMonthDays(month.year, month.month);
  const calBg = isDark ? '#1e293b' : c.surface;
  const calBorder = isDark ? '#334155' : c.border;
  const cellBg = isDark ? '#0f172a' : '#f8fafc';
  const cellBorder = isDark ? 'rgba(148,163,184,0.12)' : '#e2e8f0';

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={[s.title, { color: c.text }]}>Agenda</Text>
            <Text style={[s.subtitle, { color: c.textTertiary }]}>Revisa y administra tus reservas</Text>
          </View>
          <TouchableOpacity
            style={s.btnNueva}
            onPress={() => router.push({ pathname: '/screens/nueva-cita', params: { hora: new Date(`${selectedDate}T10:00:00`).toISOString() } })}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.btnNuevaText}>Nueva cita</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={s.statsRow}>
          <StatCard label="Citas este mes" value={String(totalMes)} color={c.text} bg={calBg} border={calBorder} />
          <StatCard label="Confirmadas" value={String(confirmadas)} color="#6366f1" bg={isDark ? '#6366f11a' : '#eef2ff'} border={isDark ? '#6366f133' : '#c7d2fe'} />
          <StatCard label="Profesionales" value={String(profActivos)} color="#f59e0b" bg={isDark ? '#f59e0b1a' : '#fef3c7'} border={isDark ? '#f59e0b33' : '#fcd34d'} />
        </View>

        {/* ── Filtro profesionales ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
          <FilterChip label="Todos" color="#6366f1" selected={selectedProfId === 'todos'} onPress={() => setSelectedProfId('todos')} c={c} />
          {profesionales.map(p => (
            <FilterChip key={p.id} label={p.nombre} color={p.color} selected={selectedProfId === p.id} onPress={() => setSelectedProfId(p.id)} c={c} />
          ))}
        </ScrollView>

        {/* ── Calendario mensual ── */}
        <View style={[s.calCard, { backgroundColor: calBg, borderColor: calBorder }]}>

          {/* Navegación mes */}
          <View style={s.monthNav}>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: cellBg, borderColor: cellBorder }]}
              onPress={() => setMonth(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
              <Ionicons name="chevron-back" size={16} color={c.text} />
            </TouchableOpacity>
            <Text style={[s.monthTitle, { color: c.text }]}>
              {MONTH_NAMES[month.month]} {month.year}
            </Text>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: cellBg, borderColor: cellBorder }]}
              onPress={() => setMonth(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>
              <Ionicons name="chevron-forward" size={16} color={c.text} />
            </TouchableOpacity>
          </View>

          {/* Cabecera días — misma estructura de filas para alineación perfecta */}
          <View style={s.row}>
            {DAY_NAMES.map(d => (
              <View key={d} style={s.col}>
                <Text style={[s.dayName, { color: c.textTertiary }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Grid — filas explícitas de 7, sin flexWrap ni % para evitar desfase */}
          {(() => {
            const rows: (number | null)[][] = [];
            for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
            return rows.map((row, ri) => (
              <View key={ri} style={s.row}>
                {row.map((day, ci) => {
                  if (!day) return <View key={ci} style={s.col} />;
                  const dateStr = toDateStr(month.year, month.month, day);
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === todayStr;
                  const count = countByDate[dateStr] ?? 0;
                  const bg = isToday ? '#6366f1' : isSelected ? (isDark ? '#6366f122' : '#eef2ff') : cellBg;
                  const bColor = isSelected && !isToday ? '#6366f1' : cellBorder;
                  return (
                    <View key={ci} style={s.col}>
                      <TouchableOpacity
                        style={[s.cell, { backgroundColor: bg, borderColor: bColor, borderWidth: isSelected && !isToday ? 1.5 : 1 }]}
                        onPress={() => setSelectedDate(dateStr)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.cellDay, { color: isToday ? '#fff' : isSelected ? '#6366f1' : c.textSecondary }, (isToday || isSelected) && { fontWeight: fontWeight.bold }]}>
                          {day}
                        </Text>
                        {count > 0 && (
                          <View style={[s.citaBadge, { backgroundColor: isToday ? 'rgba(255,255,255,0.25)' : '#6366f122' }]}>
                            <Text style={[s.citaBadgeText, { color: isToday ? '#fff' : '#6366f1' }]}>
                              {count} {count === 1 ? 'cita' : 'citas'}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ));
          })()}
        </View>

        {/* ── Lista del día ── */}
        <View style={s.daySection}>
          <Text style={[s.daySectionLabel, { color: c.textTertiary }]}>
            {selectedDate === todayStr ? 'HOY' : selectedDate.toUpperCase()}
          </Text>

          {loading ? (
            <View style={s.loadingBox}><ActivityIndicator color="#6366f1" /></View>
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
          ) : citasDelDia.map(cita => (
            <CitaCard key={cita.id} cita={cita} c={c} isDark={isDark} calBg={calBg} calBorder={calBorder}
              onPress={() => router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } })} />
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── sub-componentes ──────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg, border }: any) {
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
      style={[s.filterChip, { borderColor: selected ? color : c.border, backgroundColor: selected ? color + '22' : c.surface }]}
      onPress={onPress} activeOpacity={0.8}
    >
      <View style={[s.filterDot, { backgroundColor: color }]} />
      <Text style={[s.filterLabel, { color: selected ? color : c.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CitaCard({ cita, c, isDark, calBg, calBorder, onPress }: any) {
  const estadoColor = ESTADO_COLORS[cita.estado] ?? '#94a3b8';
  const profColor = cita.profesionales?.color ?? '#6366f1';
  return (
    <TouchableOpacity style={[s.citaCard, { backgroundColor: calBg, borderColor: calBorder }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.horaBlock, { backgroundColor: estadoColor + '20' }]}>
        <Text style={[s.horaText, { color: estadoColor }]}>{format(new Date(cita.inicio), 'HH:mm')}</Text>
      </View>
      <View style={s.citaInfo}>
        <Text style={[s.citaNombre, { color: c.text }]} numberOfLines={1}>{cita.clientes?.nombre ?? 'Sin cliente'}</Text>
        <Text style={[s.citaServicio, { color: c.textSecondary }]} numberOfLines={1}>{cita.servicios?.nombre ?? 'Servicio'}</Text>
        {cita.profesionales?.nombre && (
          <View style={s.citaProf}>
            <View style={[s.citaProfDot, { backgroundColor: profColor }]} />
            <Text style={[s.citaProfText, { color: c.textTertiary }]}>{cita.profesionales.nombre}</Text>
          </View>
        )}
      </View>
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

// ─── estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold },
  subtitle: { fontSize: fontSize.sm, marginTop: 3 },
  btnNueva: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6366f1', borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 10 },
  btnNuevaText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold },

  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold },

  filterScroll: { marginBottom: -spacing.sm },
  filterContent: { gap: spacing.sm, flexDirection: 'row', paddingBottom: spacing.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  filterDot: { width: 7, height: 7, borderRadius: 99 },
  filterLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  calCard: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden', paddingBottom: spacing.md },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  monthTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold },

  row: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: 4 },
  col: { flex: 1, paddingHorizontal: 3 },
  dayName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, textAlign: 'center', paddingVertical: 8 },

  cell: {
    minHeight: 80, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 6,
  },
  cellDay: { fontSize: 16, fontWeight: fontWeight.medium },
  citaBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  citaBadgeText: { fontSize: 11, fontWeight: fontWeight.bold },

  daySection: { gap: spacing.sm },
  daySectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  loadingBox: { paddingVertical: 32, alignItems: 'center' },
  emptyDay: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 32, borderRadius: radius.xl, borderWidth: 1, borderStyle: 'dashed' },

  citaCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  horaBlock: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  horaText: { fontSize: 14, fontWeight: fontWeight.bold },
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
});
