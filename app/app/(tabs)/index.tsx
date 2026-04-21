import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgendaView, type Profesional, type Cita } from '@/components/agenda/AgendaView';
import { useTheme, spacing, radius } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

export default function AgendaScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fecha, setFecha] = useState(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarAgenda = useCallback(async () => {
    setLoading(true);
    const profile = await getUserProfile();
    if (!profile?.negocio_id) { setLoading(false); return; }

    const inicioDia = new Date(fecha);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fecha);
    finDia.setHours(23, 59, 59, 999);

    const { data: profs } = await supabase
      .from('profesionales')
      .select('id, nombre, color')
      .eq('negocio_id', profile.negocio_id)
      .eq('activo', true)
      .order('nombre');

    if (!profs?.length) { setProfesionales([]); setLoading(false); return; }

    const { data: citas } = await supabase
      .from('citas')
      .select(`
        id, inicio, fin, estado, notas,
        clientes(nombre),
        servicios(nombre)
      `)
      .eq('negocio_id', profile.negocio_id)
      .gte('inicio', inicioDia.toISOString())
      .lte('inicio', finDia.toISOString())
      .neq('estado', 'cancelada');

    const profMap: Record<string, Profesional> = {};
    profs.forEach((p) => {
      profMap[p.id] = { id: p.id, nombre: p.nombre, color: p.color, citas: [] };
    });

    citas?.forEach((c: any) => {
      const prof = profMap[c.profesional_id];
      if (!prof) return;
      prof.citas.push({
        id: c.id,
        clienteNombre: c.clientes?.nombre ?? 'Sin nombre',
        servicioNombre: c.servicios?.nombre ?? '',
        inicio: new Date(c.inicio),
        fin: new Date(c.fin),
        color: prof.color,
        estado: c.estado,
      });
    });

    setProfesionales(Object.values(profMap));
    setLoading(false);
  }, [fecha]);

  useEffect(() => { cargarAgenda(); }, [cargarAgenda]);

  const handleNuevaCita = (profesionalId: string, hora: Date) => {
    router.push({ pathname: '/screens/nueva-cita', params: { profesionalId, hora: hora.toISOString() } });
  };

  const handleCitaPress = (cita: Cita) => {
    router.push({ pathname: '/screens/agenda-detalle', params: { citaId: cita.id } });
  };

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : profesionales.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="people-outline" size={48} color={c.textTertiary} />
          <Text style={[s.emptyTitle, { color: c.text }]}>Sin profesionales</Text>
          <Text style={[s.emptySub, { color: c.textSecondary }]}>
            Añade profesionales en la sección Equipo para ver la agenda
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.push('/(tabs)/equipo')}
          >
            <Text style={s.emptyBtnText}>Ir a Equipo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <AgendaView
          profesionales={profesionales}
          fecha={fecha}
          onFechaChange={setFecha}
          onCitaPress={handleCitaPress}
          onNuevaCita={handleNuevaCita}
        />
      )}

      {/* FAB nueva cita */}
      {profesionales.length > 0 && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + spacing.lg }]}
          onPress={() => router.push('/screens/nueva-cita')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: spacing.sm },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: spacing.sm, backgroundColor: '#6366f1', borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
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
