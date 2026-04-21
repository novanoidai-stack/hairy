import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

const ESTADOS = [
  { key: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { key: 'confirmada', label: 'Confirmada', color: '#6366f1' },
  { key: 'completada', label: 'Completada', color: '#10b981' },
  { key: 'no_show', label: 'No presentado', color: '#ef4444' },
  { key: 'cancelada', label: 'Cancelada', color: '#94a3b8' },
];

export default function AgendaDetalleScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { citaId } = useLocalSearchParams<{ citaId: string }>();
  const [cita, setCita] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('citas')
        .select(`
          id, inicio, fin, estado, notas, canal,
          profesionales(nombre, color),
          servicios(nombre, precio, duracion_activa_min, duracion_espera_min),
          clientes(id, nombre, telefono)
        `)
        .eq('id', citaId)
        .single();
      setCita(data);
      setLoading(false);
    }
    cargar();
  }, [citaId]);

  async function cambiarEstado(nuevoEstado: string) {
    setActualizando(true);
    await supabase.from('citas').update({ estado: nuevoEstado }).eq('id', citaId);
    setCita((prev: any) => ({ ...prev, estado: nuevoEstado }));
    setActualizando(false);
  }

  async function eliminar() {
    Alert.alert('Cancelar cita', '¿Seguro que quieres cancelar esta cita?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', citaId);
          router.back();
        },
      },
    ]);
  }

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator color="#6366f1" /></View>;
  if (!cita) return null;

  const estadoActual = ESTADOS.find((e) => e.key === cita.estado);
  const inicio = new Date(cita.inicio);
  const fin = new Date(cita.fin);

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>

        {/* Estado actual */}
        <View style={[s.estadoBadge, { backgroundColor: estadoActual?.color + '22', borderColor: estadoActual?.color }]}>
          <View style={[s.estadoDot, { backgroundColor: estadoActual?.color }]} />
          <Text style={[s.estadoText, { color: estadoActual?.color }]}>{estadoActual?.label}</Text>
        </View>

        {/* Info principal */}
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="time-outline" label="Hora" value={`${format(inicio, 'HH:mm')} — ${format(fin, 'HH:mm')}`} />
          <Divider />
          <Row icon="calendar-outline" label="Fecha" value={format(inicio, "EEEE d 'de' MMMM", { locale: es })} capitalize />
          <Divider />
          <Row icon="cut-outline" label="Servicio" value={cita.servicios?.nombre ?? '—'} />
          <Divider />
          <Row icon="person-outline" label="Profesional" value={cita.profesionales?.nombre ?? '—'} dot={cita.profesionales?.color} />
          {cita.clientes && (
            <>
              <Divider />
              <Row icon="people-outline" label="Cliente" value={cita.clientes.nombre} sub={cita.clientes.telefono} />
            </>
          )}
          <Divider />
          <Row icon="cash-outline" label="Precio" value={`${cita.servicios?.precio ?? 0}€`} />
          {cita.canal !== 'manual' && (
            <>
              <Divider />
              <Row icon="globe-outline" label="Canal" value={cita.canal} />
            </>
          )}
        </View>

        {/* Cambiar estado */}
        {cita.estado !== 'cancelada' && (
          <View style={{ gap: spacing.sm }}>
            <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Cambiar estado</Text>
            <View style={s.estadosGrid}>
              {ESTADOS.filter((e) => e.key !== 'cancelada' && e.key !== cita.estado).map((e) => (
                <TouchableOpacity
                  key={e.key}
                  style={[s.estadoBtn, { borderColor: e.color, backgroundColor: e.color + '15' }]}
                  onPress={() => cambiarEstado(e.key)}
                  disabled={actualizando}
                >
                  <Text style={[s.estadoBtnText, { color: e.color }]}>{e.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {cita.estado !== 'cancelada' && (
          <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={eliminar}>
            <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
            <Text style={s.cancelBtnText}>Cancelar cita</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value, sub, dot, capitalize }: any) {
  const { c } = useTheme();
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={18} color={c.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: c.textTertiary }]}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
          <Text style={[s.rowValue, { color: c.text }, capitalize && { textTransform: 'capitalize' }]}>{value}</Text>
        </View>
        {sub && <Text style={[s.rowSub, { color: c.textSecondary }]}>{sub}</Text>}
      </View>
    </View>
  );
}

function Divider() {
  const { c } = useTheme();
  return <View style={[s.divider, { backgroundColor: c.border }]} />;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  estadoDot: { width: 8, height: 8, borderRadius: 4 },
  estadoText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md },
  rowLabel: { fontSize: fontSize.xs, marginBottom: 2 },
  rowValue: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.sm, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  estadosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  estadoBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  estadoBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  cancelBtnText: { color: '#ef4444', fontSize: fontSize.md, fontWeight: fontWeight.medium },
});
