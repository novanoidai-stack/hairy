import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing } from '@/lib/theme';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { Topbar, Card, StatCard, Loading } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';

interface Stats {
  totalCitas: number;
  totalIngresos: number;
  citasCompletas: number;
  occupacion: number;
}

const tokens = DESIGN_TOKENS;

export default function InformesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<Stats>({ totalCitas: 0, totalIngresos: 0, citasCompletas: 0, occupacion: 0 });
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'año'>('mes');
  const [negocioId, setNegocioId] = useState('');

  useEffect(() => {
    cargar();
  }, [periodo]);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);

    let desde: Date;
    let hasta: Date = new Date();

    if (periodo === 'semana') {
      desde = startOfWeek(subDays(new Date(), 0), { weekStartsOn: 1 });
      hasta = endOfWeek(new Date(), { weekStartsOn: 1 });
    } else if (periodo === 'mes') {
      desde = startOfMonth(new Date());
      hasta = endOfMonth(new Date());
    } else {
      desde = new Date(new Date().getFullYear(), 0, 1);
      hasta = new Date(new Date().getFullYear(), 11, 31);
    }

    const { data: citas } = await supabase
      .from('citas')
      .select('id, estado, inicio, servicios(precio)')
      .eq('negocio_id', profile.negocio_id)
      .gte('inicio', desde.toISOString())
      .lte('inicio', hasta.toISOString());

    const citasData = citas ?? [];
    const totalCitas = citasData.length;
    const citasCompletas = citasData.filter(c => c.estado === 'completada').length;
    const totalIngresos = citasData.reduce((sum, c) => sum + ((c.servicios as any)?.precio || 0), 0);

    // Occupación: asumiendo 8 horas de trabajo por día (480 minutos), 6 días a la semana
    const diasLaborales = Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24) * 6 / 7);
    const minutosTotalesDisponibles = diasLaborales * 480;
    const minutosUsados = citasData.reduce((sum, c) => {
      // Asumir 30 min por cita si no se tiene duración exacta
      return sum + 30;
    }, 0);
    const occupacion = minutosTotalesDisponibles > 0 ? Math.round((minutosUsados / minutosTotalesDisponibles) * 100) : 0;

    setStats({ totalCitas, totalIngresos, citasCompletas, occupacion });
    setLoading(false);
  }

  const periodos = [
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'año', label: 'Este año' },
  ];

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Topbar title="Informes" subtitle="Análisis y estadísticas de tu negocio" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Periodo selector */}
        <View style={s.section}>
          <View style={s.periodoSelector}>
            {periodos.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  s.periodoBtnSmall,
                  {
                    backgroundColor: periodo === p.key ? tokens.primary : tokens.bgCard,
                    borderColor: periodo === p.key ? tokens.primary : tokens.border,
                  },
                ]}
                onPress={() => setPeriodo(p.key as any)}
              >
                <TText
                  style={[
                    s.periodoBtnText,
                    { color: periodo === p.key ? '#fff' : c.textSecondary },
                  ]}
                >
                  {p.label}
                </TText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <Loading />
        ) : (
          <>
            {/* Stats cards */}
            <View style={[s.section, s.statsGrid]}>
              <StatCard
                label="Citas totales"
                value={stats.totalCitas}
                icon="calendar-outline"
                color={tokens.primary}
              />
              <StatCard
                label="Ingresos"
                value={`$${stats.totalIngresos.toLocaleString()}`}
                icon="card-outline"
                color={tokens.success}
              />
              <StatCard
                label="Ocupación"
                value={`${stats.occupacion}%`}
                icon="trending-up-outline"
                color={tokens.warning}
              />
              <StatCard
                label="Completadas"
                value={stats.citasCompletas}
                icon="checkmark-outline"
                color={tokens.success}
              />
            </View>

            {/* Resumen por profesional */}
            <View style={s.section}>
              <TText style={[s.sectionTitle, { color: c.text }]}>Próximas métricas</TText>
              <Card>
                <View style={[s.placeholder, { borderColor: tokens.border }]}>
                  <Ionicons name="bar-chart-outline" size={48} color={tokens.textTertiary} />
                  <TText style={[s.placeholderText, { color: c.textSecondary }]}>
                    Gráficos y análisis detallados próximamente
                  </TText>
                </View>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: tokens.spacing.xxl,
  },
  section: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  periodoSelector: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  periodoBtnSmall: {
    flex: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodoBtnText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
  },
  sectionTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: '600',
    marginBottom: tokens.spacing.md,
  },
  placeholder: {
    paddingVertical: tokens.spacing.xxl,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  placeholderText: {
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
    maxWidth: '80%',
  },
});
