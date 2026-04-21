import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { useThemeMode } from '@/lib/themeContext';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  duracion_activa_min: number;
  duracion_espera_min: number;
  activo: boolean;
}

const EMPTY_FORM = { nombre: '', precio: '', duracion_activa_min: '30', duracion_espera_min: '0', activo: true };

export default function ConfiguracionScreen() {
  const { c, isDark } = useTheme();
  const { mode, setMode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioId, setNegocioId] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<Servicio | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) { setLoading(false); return; }
    setNegocioId(profile.negocio_id);
    const { data } = await supabase
      .from('servicios')
      .select('id, nombre, precio, duracion_activa_min, duracion_espera_min, activo')
      .eq('negocio_id', profile.negocio_id)
      .order('nombre');
    setServicios(data ?? []);
    setLoading(false);
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function abrirEditar(sv: Servicio) {
    setEditando(sv);
    setForm({
      nombre: sv.nombre,
      precio: String(sv.precio),
      duracion_activa_min: String(sv.duracion_activa_min),
      duracion_espera_min: String(sv.duracion_espera_min),
      activo: sv.activo,
    });
    setModalVisible(true);
  }

  async function guardarServicio() {
    if (!form.nombre.trim()) { Alert.alert('Falta el nombre'); return; }
    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(),
      precio: parseFloat(form.precio) || 0,
      duracion_activa_min: parseInt(form.duracion_activa_min) || 30,
      duracion_espera_min: parseInt(form.duracion_espera_min) || 0,
      activo: form.activo,
    };
    if (editando) {
      await supabase.from('servicios').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('servicios').insert({ ...payload, negocio_id: negocioId });
    }
    setGuardando(false);
    setModalVisible(false);
    cargar();
  }

  async function eliminarServicio(id: string) {
    Alert.alert('Eliminar servicio', '¿Seguro? Las citas existentes no se verán afectadas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('servicios').delete().eq('id', id);
          setServicios(prev => prev.filter(s => s.id !== id));
        },
      },
    ]);
  }

  async function toggleActivo(sv: Servicio) {
    await supabase.from('servicios').update({ activo: !sv.activo }).eq('id', sv.id);
    setServicios(prev => prev.map(s => s.id === sv.id ? { ...s, activo: !s.activo } : s));
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>

        {/* ── Apariencia ── */}
        <SectionHeader title="Apariencia" c={c} />
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <IconBox color="#6366f1" icon="moon-outline" />
              <View>
                <Text style={[s.rowTitle, { color: c.text }]}>Modo oscuro</Text>
                <Text style={[s.rowSub, { color: c.textTertiary }]}>
                  {mode === 'system' ? 'Según el sistema' : isDark ? 'Activado' : 'Desactivado'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={v => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: c.border, true: '#6366f1' }}
              thumbColor="#fff"
            />
          </View>
          <Divider c={c} />
          <TouchableOpacity style={s.row} onPress={() => setMode('system')}>
            <View style={s.rowLeft}>
              <IconBox color="#f59e0b" icon="phone-portrait-outline" />
              <View>
                <Text style={[s.rowTitle, { color: c.text }]}>Seguir ajuste del sistema</Text>
                <Text style={[s.rowSub, { color: c.textTertiary }]}>Usa el tema del dispositivo automáticamente</Text>
              </View>
            </View>
            {mode === 'system' && <Ionicons name="checkmark" size={18} color="#6366f1" />}
          </TouchableOpacity>
        </View>

        {/* ── Servicios ── */}
        <SectionHeader title="Servicios" c={c} action={{ label: 'Añadir', onPress: abrirNuevo }} />
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {loading ? (
            <View style={{ padding: spacing.lg, alignItems: 'center' }}>
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : servicios.length === 0 ? (
            <TouchableOpacity style={s.emptyRow} onPress={abrirNuevo}>
              <Ionicons name="add-circle-outline" size={20} color="#6366f1" />
              <Text style={{ color: '#6366f1', fontSize: fontSize.sm }}>Añadir primer servicio</Text>
            </TouchableOpacity>
          ) : (
            servicios.map((sv, i) => (
              <View key={sv.id}>
                {i > 0 && <Divider c={c} />}
                <View style={s.row}>
                  <TouchableOpacity style={s.rowLeft} onPress={() => abrirEditar(sv)} activeOpacity={0.7}>
                    <IconBox color={sv.activo ? '#10b981' : c.textTertiary} icon="cut-outline" bg={sv.activo ? '#10b98122' : c.bgTertiary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowTitle, { color: sv.activo ? c.text : c.textTertiary }]}>{sv.nombre}</Text>
                      <Text style={[s.rowSub, { color: c.textTertiary }]}>
                        {sv.duracion_activa_min + sv.duracion_espera_min} min
                        {sv.duracion_espera_min > 0 && ` (${sv.duracion_activa_min}+${sv.duracion_espera_min})`}
                        {' · '}{sv.precio}€
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Switch
                      value={sv.activo}
                      onValueChange={() => toggleActivo(sv)}
                      trackColor={{ false: c.border, true: '#6366f1' }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity onPress={() => eliminarServicio(sv.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#ef444488" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Cuenta ── */}
        <SectionHeader title="Cuenta" c={c} />
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={s.row} onPress={cerrarSesion}>
            <View style={s.rowLeft}>
              <IconBox color="#ef4444" icon="log-out-outline" bg="#ef444422" />
              <Text style={[s.rowTitle, { color: '#ef4444' }]}>Cerrar sesión</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Modal servicio ── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modalPanel, { backgroundColor: c.bg, borderColor: c.border }]}>
            <View style={[s.modalHeader, { borderBottomColor: c.border }]}>
              <Text style={[s.modalTitle, { color: c.text }]}>{editando ? 'Editar servicio' : 'Nuevo servicio'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={c.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
              <FormField label="Nombre *" c={c}>
                <TextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                  value={form.nombre}
                  onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
                  placeholder="Ej: Corte de pelo"
                  placeholderTextColor={c.textTertiary}
                />
              </FormField>

              <FormField label="Precio (€)" c={c}>
                <TextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                  value={form.precio}
                  onChangeText={v => setForm(f => ({ ...f, precio: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={c.textTertiary}
                />
              </FormField>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <FormField label="Duración activa (min)" c={c} style={{ flex: 1 }}>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                    value={form.duracion_activa_min}
                    onChangeText={v => setForm(f => ({ ...f, duracion_activa_min: v }))}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={c.textTertiary}
                  />
                </FormField>
                <FormField label="Tiempo de espera (min)" c={c} style={{ flex: 1 }}>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                    value={form.duracion_espera_min}
                    onChangeText={v => setForm(f => ({ ...f, duracion_espera_min: v }))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={c.textTertiary}
                  />
                </FormField>
              </View>

              <View style={[s.infoBox, { backgroundColor: '#6366f111', borderColor: '#6366f133' }]}>
                <Ionicons name="information-circle-outline" size={16} color="#6366f1" />
                <Text style={{ color: '#6366f1', fontSize: fontSize.xs, flex: 1 }}>
                  Durante el tiempo de espera el profesional puede atender a otro cliente (ej. mientras procesa un tinte).
                </Text>
              </View>

              <View style={[s.row, { paddingHorizontal: 0, paddingVertical: spacing.sm }]}>
                <Text style={[s.rowTitle, { color: c.text }]}>Servicio activo</Text>
                <Switch
                  value={form.activo}
                  onValueChange={v => setForm(f => ({ ...f, activo: v }))}
                  trackColor={{ false: c.border, true: '#6366f1' }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity
                style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
                onPress={guardarServicio}
                disabled={guardando}
              >
                {guardando
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnGuardarText}>{editando ? 'Guardar cambios' : 'Crear servicio'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({ title, c, action }: { title: string; c: any; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: c.textSecondary }]}>{title.toUpperCase()}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress}>
          <Text style={{ color: '#6366f1', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function IconBox({ color, icon, bg }: { color: string; icon: any; bg?: string }) {
  return (
    <View style={[s.iconBox, { backgroundColor: bg ?? color + '22' }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  );
}

function FormField({ label, c, children, style }: { label: string; c: any; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.sm }}>{label}</Text>
      {children}
    </View>
  );
}

function Divider({ c }: { c: any }) {
  return <View style={[s.divider, { backgroundColor: c.border }]} />;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, letterSpacing: 0.8 },
  card: { marginHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, gap: spacing.sm },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowTitle: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  rowSub: { fontSize: fontSize.xs, marginTop: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalPanel: { width: '100%', maxWidth: 480, maxHeight: '90%' as any, borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1 },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: fontSize.md },
  infoBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, alignItems: 'flex-start' },
  btnGuardar: { backgroundColor: '#6366f1', borderRadius: radius.md, padding: 14, alignItems: 'center', marginTop: spacing.sm },
  btnGuardarText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },
});
