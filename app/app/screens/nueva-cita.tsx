import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Platform, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addMinutes as dateFnsAddMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

export default function NuevaCitaScreen() {
  const { c, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ profesionalId?: string; hora?: string }>();

  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  const [profSeleccionado, setProfSeleccionado] = useState<string>(params.profesionalId ?? '');
  const [servicioSeleccionado, setServicioSeleccionado] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
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
        supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', profile.negocio_id).order('nombre').limit(200),
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
  const fin = dateFnsAddMinutes(inicio, duracionTotal);

  function cambiarHora(deltaH: number, deltaM: number) {
    const d = new Date(inicio);
    d.setHours(d.getHours() + deltaH);
    d.setMinutes(d.getMinutes() + deltaM);
    setInicio(d);
  }

  const clientesFiltrados = clienteSearch.trim()
    ? clientes.filter(cl =>
        cl.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
        (cl.telefono ?? '').includes(clienteSearch)
      )
    : clientes;

  const clienteNombreSeleccionado = clientes.find(cl => cl.id === clienteSeleccionado)?.nombre ?? '';

  async function guardar() {
    if (!profSeleccionado || !servicioSeleccionado) {
      Alert.alert('Faltan datos', 'Selecciona un profesional y un servicio.');
      return;
    }
    setGuardando(true);

    const { data: solapadas } = await supabase
      .from('citas').select('id')
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
    return <View style={[s.center, { backgroundColor: c.bg }]}><ActivityIndicator color="#6366f1" /></View>;
  }

  const inner = (
    <View style={[s.container, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">

        {/* ── Profesional ── */}
        <Section title="Profesional" required>
          <View style={s.chips}>
            {profesionales.map((p) => (
              <Chip key={p.id} label={p.nombre} color={p.color}
                selected={profSeleccionado === p.id} onPress={() => setProfSeleccionado(p.id)} />
            ))}
          </View>
        </Section>

        {/* ── Servicio ── */}
        <Section title="Servicio" required>
          <View style={s.serviceList}>
            {servicios.map((sv) => {
              const sel = servicioSeleccionado === sv.id;
              return (
                <TouchableOpacity
                  key={sv.id}
                  style={[s.serviceItem, {
                    borderColor: sel ? '#6366f1' : c.border,
                    backgroundColor: sel ? '#6366f122' : c.surface,
                  }]}
                  onPress={() => setServicioSeleccionado(sv.id)}
                >
                  <Text style={[s.serviceNombre, { color: sel ? '#6366f1' : c.text }]} numberOfLines={1}>
                    {sv.nombre}
                  </Text>
                  <Text style={[s.serviceDuracion, { color: sel ? '#6366f1' : c.textSecondary }]}>
                    {sv.duracion_activa_min + sv.duracion_espera_min} min · {sv.precio}€
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* ── Hora de inicio ── */}
        <Section title="Hora de inicio">
          <View style={[s.horaCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.horaFecha, { color: c.textSecondary }]}>
              {format(inicio, "EEEE d 'de' MMMM", { locale: es })}
            </Text>
            <View style={s.horaRow}>
              {/* Horas */}
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(-1, 0)}>
                <Ionicons name="remove" size={18} color={c.text} />
              </TouchableOpacity>
              <View style={[s.horaNum, { backgroundColor: '#6366f122', borderColor: '#6366f133' }]}>
                <Text style={s.horaNumText}>{String(inicio.getHours()).padStart(2, '0')}</Text>
                <Text style={s.horaNumLabel}>h</Text>
              </View>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(1, 0)}>
                <Ionicons name="add" size={18} color={c.text} />
              </TouchableOpacity>

              <Text style={[s.horaSep, { color: c.textTertiary }]}>:</Text>

              {/* Minutos */}
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(0, -5)}>
                <Ionicons name="remove" size={18} color={c.text} />
              </TouchableOpacity>
              <View style={[s.horaNum, { backgroundColor: '#6366f122', borderColor: '#6366f133' }]}>
                <Text style={s.horaNumText}>{String(inicio.getMinutes()).padStart(2, '0')}</Text>
                <Text style={s.horaNumLabel}>min</Text>
              </View>
              <TouchableOpacity style={[s.horaBtn, { backgroundColor: isDark ? '#334155' : c.bgTertiary }]} onPress={() => cambiarHora(0, 5)}>
                <Ionicons name="add" size={18} color={c.text} />
              </TouchableOpacity>
            </View>
            {servicioActual && (
              <Text style={[s.horaFin, { color: c.textTertiary }]}>
                Finaliza: {format(fin, 'HH:mm')} · {duracionTotal} min
              </Text>
            )}
          </View>
        </Section>

        {/* ── Cliente ── */}
        <Section title="Cliente (opcional)">
          {/* Buscador */}
          <View style={[s.searchBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="search-outline" size={16} color={c.textTertiary} />
            <TextInput
              style={[s.searchInput, { color: c.text }]}
              placeholder="Buscar por nombre o teléfono..."
              placeholderTextColor={c.textTertiary}
              value={clienteSearch}
              onChangeText={setClienteSearch}
            />
            {clienteSearch.length > 0 && (
              <TouchableOpacity onPress={() => setClienteSearch('')}>
                <Ionicons name="close-circle" size={16} color={c.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sin cliente */}
          <TouchableOpacity
            style={[s.clienteRow, { borderColor: !clienteSeleccionado ? '#6366f1' : c.border, backgroundColor: !clienteSeleccionado ? '#6366f122' : c.surface }]}
            onPress={() => { setClienteSeleccionado(''); setClienteSearch(''); }}
          >
            <View style={[s.clienteAvatar, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Ionicons name="person-outline" size={16} color={c.textTertiary} />
            </View>
            <Text style={[s.clienteNombre, { color: !clienteSeleccionado ? '#6366f1' : c.textSecondary }]}>
              Sin cliente asignado
            </Text>
            {!clienteSeleccionado && <Ionicons name="checkmark-circle" size={18} color="#6366f1" style={{ marginLeft: 'auto' as any }} />}
          </TouchableOpacity>

          {/* Lista */}
          {clientesFiltrados.map((cl) => {
            const sel = clienteSeleccionado === cl.id;
            return (
              <TouchableOpacity
                key={cl.id}
                style={[s.clienteRow, { borderColor: sel ? '#6366f1' : c.border, backgroundColor: sel ? '#6366f122' : c.surface }]}
                onPress={() => { setClienteSeleccionado(cl.id); setClienteSearch(''); }}
              >
                <View style={[s.clienteAvatar, { backgroundColor: sel ? '#6366f133' : (isDark ? '#334155' : '#e2e8f0') }]}>
                  <Text style={{ fontSize: 13, fontWeight: fontWeight.bold, color: sel ? '#6366f1' : c.textSecondary }}>
                    {cl.nombre.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.clienteNombre, { color: sel ? '#6366f1' : c.text }]} numberOfLines={1}>{cl.nombre}</Text>
                  {cl.telefono && <Text style={[s.clienteTel, { color: c.textTertiary }]}>{cl.telefono}</Text>}
                </View>
                {sel && <Ionicons name="checkmark-circle" size={18} color="#6366f1" />}
              </TouchableOpacity>
            );
          })}

          {clientesFiltrados.length === 0 && clienteSearch.trim() !== '' && (
            <Text style={[s.noResults, { color: c.textTertiary }]}>Sin resultados para "{clienteSearch}"</Text>
          )}
        </Section>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
        <TouchableOpacity style={[s.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
          {guardando
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnGuardarText}>Crear cita</Text>}
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
  serviceItem: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, marginBottom: spacing.sm },
  serviceNombre: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, marginBottom: 2 },
  serviceDuracion: { fontSize: fontSize.sm },

  horaCard: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  horaFecha: { fontSize: fontSize.sm, textTransform: 'capitalize' },
  horaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  horaBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  horaNum: { flexDirection: 'row', alignItems: 'baseline', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minWidth: 50, justifyContent: 'center' },
  horaNumText: { fontSize: 18, fontWeight: fontWeight.bold, color: '#6366f1' },
  horaNumLabel: { fontSize: 10, color: '#6366f1', fontWeight: fontWeight.medium },
  horaSep: { fontSize: 18, fontWeight: fontWeight.bold, marginHorizontal: 1 },
  horaFin: { fontSize: fontSize.xs },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: fontSize.sm, padding: 0, backgroundColor: 'transparent' },

  clienteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  clienteAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clienteNombre: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  clienteTel: { fontSize: fontSize.xs, marginTop: 1 },
  noResults: { fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.md },

  footer: { padding: spacing.lg, borderTopWidth: 1 },
  btnGuardar: { backgroundColor: '#6366f1', borderRadius: radius.md, padding: 16, alignItems: 'center' },
  btnGuardarText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { width: 500, maxHeight: '90%' as any, borderRadius: 20, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  panelTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
