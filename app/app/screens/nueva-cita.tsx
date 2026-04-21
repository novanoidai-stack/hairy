import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

export default function NuevaCitaScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ profesionalId?: string; hora?: string }>();

  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  const [profSeleccionado, setProfSeleccionado] = useState<string>(params.profesionalId ?? '');
  const [servicioSeleccionado, setServicioSeleccionado] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [inicio, setInicio] = useState<Date>(params.hora ? new Date(params.hora) : new Date());
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [negocioId, setNegocioId] = useState('');

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) return;
      setNegocioId(profile.negocio_id);

      const [{ data: profs }, { data: servs }, { data: clts }] = await Promise.all([
        supabase.from('profesionales').select('id, nombre, color').eq('negocio_id', profile.negocio_id).eq('activo', true),
        supabase.from('servicios').select('id, nombre, duracion_activa_min, duracion_espera_min, precio').eq('negocio_id', profile.negocio_id).eq('activo', true),
        supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', profile.negocio_id).order('nombre').limit(100),
      ]);

      setProfesionales(profs ?? []);
      setServicios(servs ?? []);
      setClientes(clts ?? []);
      setLoading(false);
    }
    cargar();
  }, []);

  const servicioActual = servicios.find((s) => s.id === servicioSeleccionado);
  const duracionTotal = servicioActual
    ? servicioActual.duracion_activa_min + servicioActual.duracion_espera_min
    : 30;
  const fin = addMinutes(inicio, duracionTotal);

  async function guardar() {
    if (!profSeleccionado || !servicioSeleccionado) {
      Alert.alert('Faltan datos', 'Selecciona un profesional y un servicio.');
      return;
    }
    setGuardando(true);

    // Verificar solapamiento
    const { data: solapadas } = await supabase
      .from('citas')
      .select('id')
      .eq('profesional_id', profSeleccionado)
      .neq('estado', 'cancelada')
      .lt('inicio', fin.toISOString())
      .gt('fin', inicio.toISOString());

    if (solapadas && solapadas.length > 0) {
      Alert.alert('Conflicto', 'El profesional ya tiene una cita en ese horario.');
      setGuardando(false);
      return;
    }

    const { error } = await supabase.from('citas').insert({
      negocio_id: negocioId,
      profesional_id: profSeleccionado,
      servicio_id: servicioSeleccionado,
      cliente_id: clienteSeleccionado || null,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado: 'pendiente',
      canal: 'manual',
    });

    setGuardando(false);
    if (error) { Alert.alert('Error', error.message); return; }
    router.back();
  }

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  const inner = (
    <View style={[s.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>

        {/* Profesional */}
        <Section title="Profesional" required>
          <View style={s.chips}>
            {profesionales.map((p) => (
              <Chip
                key={p.id}
                label={p.nombre}
                color={p.color}
                selected={profSeleccionado === p.id}
                onPress={() => setProfSeleccionado(p.id)}
              />
            ))}
          </View>
        </Section>

        {/* Servicio */}
        <Section title="Servicio" required>
          <View style={s.serviceList}>
            {servicios.map((sv) => (
              <TouchableOpacity
                key={sv.id}
                style={[s.serviceItem, { borderColor: servicioSeleccionado === sv.id ? '#6366f1' : c.border, backgroundColor: servicioSeleccionado === sv.id ? '#eef2ff' : c.surface }]}
                onPress={() => setServicioSeleccionado(sv.id)}
              >
                <Text style={[s.serviceNombre, { color: c.text }]}>{sv.nombre}</Text>
                <Text style={[s.serviceDuracion, { color: c.textSecondary }]}>
                  {sv.duracion_activa_min + sv.duracion_espera_min} min · {sv.precio}€
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Hora */}
        <Section title="Hora de inicio">
          <View style={[s.horaBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="time-outline" size={20} color="#6366f1" />
            <Text style={[s.horaText, { color: c.text }]}>
              {format(inicio, "EEEE d MMM · HH:mm", { locale: es })}
            </Text>
          </View>
          {servicioActual && (
            <Text style={[s.finHora, { color: c.textSecondary }]}>
              Finaliza: {format(fin, 'HH:mm')} ({duracionTotal} min)
            </Text>
          )}
        </Section>

        {/* Cliente (opcional) */}
        <Section title="Cliente (opcional)">
          <ScrollView style={s.clienteList} nestedScrollEnabled>
            <TouchableOpacity
              style={[s.clienteItem, { borderColor: !clienteSeleccionado ? '#6366f1' : c.border, backgroundColor: !clienteSeleccionado ? '#eef2ff' : c.surface }]}
              onPress={() => setClienteSeleccionado('')}
            >
              <Text style={{ color: c.textSecondary, fontSize: fontSize.sm }}>Sin cliente asignado</Text>
            </TouchableOpacity>
            {clientes.map((cl) => (
              <TouchableOpacity
                key={cl.id}
                style={[s.clienteItem, { borderColor: clienteSeleccionado === cl.id ? '#6366f1' : c.border, backgroundColor: clienteSeleccionado === cl.id ? '#eef2ff' : c.surface }]}
                onPress={() => setClienteSeleccionado(cl.id)}
              >
                <Text style={[s.clienteNombre, { color: c.text }]}>{cl.nombre}</Text>
                {cl.telefono && <Text style={[s.clienteTel, { color: c.textSecondary }]}>{cl.telefono}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Section>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
        <TouchableOpacity
          style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
          onPress={guardar}
          disabled={guardando}
        >
          {guardando
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnGuardarText}>Crear cita</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={s.overlay}>
        <View style={[s.panel, { backgroundColor: c.bg }]}>
          <View style={[s.panelHeader, { borderBottomColor: c.border }]}>
            <Text style={[s.panelTitle, { color: c.text }]}>Nueva cita</Text>
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

function Section({ title, children, required }: { title: string; children: React.ReactNode; required?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
        {title}{required && <Text style={{ color: '#ef4444' }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

function Chip({ label, color, selected, onPress }: { label: string; color: string; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.chip, { borderColor: selected ? color : c.border, backgroundColor: selected ? color + '22' : c.surface }]}
    >
      <View style={[s.chipDot, { backgroundColor: color }]} />
      <Text style={[s.chipText, { color: selected ? color : c.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  serviceList: { gap: spacing.sm },
  serviceItem: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  serviceNombre: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  serviceDuracion: { fontSize: fontSize.sm },
  horaBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  horaText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, textTransform: 'capitalize' },
  finHora: { fontSize: fontSize.sm, marginTop: 4 },
  clienteList: { maxHeight: 200 },
  clienteItem: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, marginBottom: spacing.sm },
  clienteNombre: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  clienteTel: { fontSize: fontSize.sm, marginTop: 2 },
  footer: { padding: spacing.lg, borderTopWidth: 1 },
  btnGuardar: { backgroundColor: '#6366f1', borderRadius: radius.md, padding: 16, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 500, maxHeight: '90%' as any, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  panelTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
