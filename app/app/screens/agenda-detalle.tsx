import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useCalendarRefresh } from '@/lib/calendarContext';

const ESTADOS = [
  { key: 'pendiente', label: 'Pendiente de confirmación', color: '#f59e0b' },
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
  const { triggerRefresh } = useCalendarRefresh();
  const [cita, setCita] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [mostrarnDialogoEliminar, setMostrarDialogoEliminar] = useState(false);

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
    setActualizando(true);
    const { error } = await supabase.from('citas').delete().eq('id', citaId);
    setActualizando(false);
    if (!error) {
      triggerRefresh();
      router.back();
    }
  }

  if (loading) return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator color="#6366f1" /></View>;
  if (!cita) return null;

  const estadoActual = ESTADOS.find((e) => e.key === cita.estado);
  const inicio = new Date(cita.inicio);
  const fin = new Date(cita.fin);

  const inner = (
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
          <Divider />
          <Row icon="timer-outline" label="Tiempo activo" value={`${cita.servicios?.duracion_activa_min ?? 0} min`} />
          <Divider />
          <Row icon="hourglass-outline" label="Tiempo de espera" value={`${cita.servicios?.duracion_espera_min ?? 0} min`} />
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

        <TouchableOpacity
          style={[s.cancelBtn, { borderColor: c.border }]}
          onPress={() => setMostrarDialogoEliminar(true)}
          disabled={actualizando}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={s.cancelBtnText}>Borrar cita</Text>
        </TouchableOpacity>
      </ScrollView>

      {mostrarnDialogoEliminar && (
        <View style={s.dialogOverlay}>
          <View style={[s.dialog, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.dialogTitle, { color: c.text }]}>Borrar cita</Text>
            <Text style={[s.dialogMessage, { color: c.textSecondary }]}>
              ¿Estás seguro de que quieres borrar esta cita? Este cambio no se puede revertir.
            </Text>
            <View style={s.dialogButtons}>
              <TouchableOpacity
                style={[s.dialogBtn, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => setMostrarDialogoEliminar(false)}
                disabled={actualizando}
              >
                <Text style={[s.dialogBtnText, { color: c.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogBtn, s.dialogBtnDanger]}
                onPress={eliminar}
                disabled={actualizando}
              >
                <Text style={s.dialogBtnDangerText}>
                  {actualizando ? '...' : 'Borrar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={s.overlay}>
        <View style={[s.panel, { backgroundColor: c.bg }]}>
          <View style={[s.panelHeader, { borderBottomColor: c.border }]}>
            <Text style={[s.panelTitle, { color: c.text }]}>Detalle de cita</Text>
            <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={c.textSecondary} />
            </TouchableOpacity>
          </View>
          {inner}
        </View>
      </View>
    );
  }
  return inner;
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 480, maxHeight: '85%' as any, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  panelTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dialogOverlay: { position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  dialog: { width: '80%', maxWidth: 320, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  dialogTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  dialogMessage: { fontSize: fontSize.sm, lineHeight: 20 },
  dialogButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dialogBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1 },
  dialogBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  dialogBtnDanger: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  dialogBtnDangerText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.medium },
});
