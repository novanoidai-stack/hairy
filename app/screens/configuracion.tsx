import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useThemeMode } from '@/lib/themeContext';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { Topbar, Card, Btn, Loading } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';

const tokens = DESIGN_TOKENS;

interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  duracion_activa_min: number;
  duracion_espera_min: number;
  duracion_activa_extra_min: number;
  activo: boolean;
}

const EMPTY_FORM = { nombre: '', precio: '', duracion_activa_min: '30', duracion_espera_min: '0', duracion_activa_extra_min: '0', activo: true };

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
      .select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, activo')
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
      duracion_activa_extra_min: String(sv.duracion_activa_extra_min ?? 0),
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
      duracion_activa_extra_min: parseInt(form.duracion_activa_extra_min) || 0,
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
      <Topbar title="Configuración" subtitle="Ajustes de negocio y cuenta" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

        {/* ── Apariencia ── */}
        <View style={s.section}>
          <TText style={[s.sectionTitle, { color: c.text }]}>Apariencia</TText>
          <Card>
            <View style={s.settingRow}>
              <View style={s.settingLeft}>
                <View style={[s.settingIcon, { backgroundColor: tokens.primarySoft }]}>
                  <Ionicons name="moon-outline" size={18} color={tokens.primary} />
                </View>
                <View>
                  <TText style={[s.settingLabel, { color: c.text }]}>Modo oscuro</TText>
                  <TText style={[s.settingValue, { color: c.textSecondary }]}>
                    {mode === 'system' ? 'Según el sistema' : isDark ? 'Activado' : 'Desactivado'}
                  </TText>
                </View>
              </View>
              <Switch
                value={isDark}
                onValueChange={v => setMode(v ? 'dark' : 'light')}
                trackColor={{ false: c.border, true: tokens.primary }}
                thumbColor="#fff"
              />
            </View>
            <View style={[s.divider, { backgroundColor: c.border }]} />
            <TouchableOpacity style={s.settingRow} onPress={() => setMode('system')}>
              <View style={s.settingLeft}>
                <View style={[s.settingIcon, { backgroundColor: '#f59e0b22' }]}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#f59e0b" />
                </View>
                <View>
                  <TText style={[s.settingLabel, { color: c.text }]}>Seguir ajuste del sistema</TText>
                  <TText style={[s.settingValue, { color: c.textSecondary }]}>Usa el tema del dispositivo automáticamente</TText>
                </View>
              </View>
              {mode === 'system' && <Ionicons name="checkmark" size={18} color={tokens.primary} />}
            </TouchableOpacity>
          </Card>
        </View>

        {/* ── Servicios ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <TText style={[s.sectionTitle, { color: c.text }]}>Servicios</TText>
            <TouchableOpacity onPress={abrirNuevo}>
              <TText style={[s.sectionAction, { color: tokens.primary }]}>Añadir</TText>
            </TouchableOpacity>
          </View>

          {loading ? (
            <Loading />
          ) : servicios.length === 0 ? (
            <Card>
              <TouchableOpacity style={s.emptyAction} onPress={abrirNuevo}>
                <Ionicons name="add-circle-outline" size={24} color={tokens.primary} />
                <TText style={[s.emptyActionText, { color: tokens.primary }]}>Añadir primer servicio</TText>
              </TouchableOpacity>
            </Card>
          ) : (
            <View style={{ gap: tokens.spacing.md }}>
              {servicios.map((sv) => (
                <Card key={sv.id} style={s.servicioCard}>
                  <TouchableOpacity style={s.servicioLeft} onPress={() => abrirEditar(sv)}>
                    <View style={[s.servicioIcon, { backgroundColor: sv.activo ? tokens.successSoft : c.bgTertiary }]}>
                      <Ionicons name="cut-outline" size={18} color={sv.activo ? tokens.success : c.textTertiary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TText style={[s.servicioNombre, { color: sv.activo ? c.text : c.textTertiary }]}>{sv.nombre}</TText>
                      <TText style={[s.servicioInfo, { color: c.textSecondary }]}>
                        {sv.duracion_activa_min + sv.duracion_espera_min} min{sv.duracion_espera_min > 0 && ` (${sv.duracion_activa_min}+${sv.duracion_espera_min})`} · {sv.precio}€
                      </TText>
                    </View>
                  </TouchableOpacity>
                  <View style={s.servicioActions}>
                    <Switch
                      value={sv.activo}
                      onValueChange={() => toggleActivo(sv)}
                      trackColor={{ false: c.border, true: tokens.primary }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity onPress={() => eliminarServicio(sv.id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* ── Cuenta ── */}
        <View style={s.section}>
          <TText style={[s.sectionTitle, { color: c.text }]}>Cuenta</TText>
          <Card>
            <TouchableOpacity style={s.settingRow} onPress={cerrarSesion}>
              <View style={s.settingLeft}>
                <View style={[s.settingIcon, { backgroundColor: '#ef444422' }]}>
                  <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                </View>
                <TText style={[s.settingLabel, { color: '#ef4444' }]}>Cerrar sesión</TText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
            </TouchableOpacity>
          </Card>
        </View>
      </ScrollView>

      {/* ── Modal servicio ── */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={s.overlay}>
          <View style={[s.modalPanel, { backgroundColor: c.bg, borderColor: c.border }]}>
            <View style={[s.modalHeader, { borderBottomColor: c.border }]}>
              <TText style={[s.modalTitle, { color: c.text }]}>{editando ? 'Editar servicio' : 'Nuevo servicio'}</TText>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={c.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              <FormField label="Nombre *" c={c}>
                <TTextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                  value={form.nombre}
                  onChangeText={v => setForm(f => ({ ...f, nombre: v }))}
                  placeholder="Ej: Corte de pelo"
                  placeholderTextColor={c.textTertiary}
                />
              </FormField>

              <FormField label="Precio (€)" c={c}>
                <TTextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                  value={form.precio}
                  onChangeText={v => setForm(f => ({ ...f, precio: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={c.textTertiary}
                />
              </FormField>

              <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
                <FormField label="Duración activa (min)" c={c} style={{ flex: 1 }}>
                  <TTextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                    value={form.duracion_activa_min}
                    onChangeText={v => setForm(f => ({ ...f, duracion_activa_min: v }))}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={c.textTertiary}
                  />
                </FormField>
                <FormField label="Tiempo de espera (min)" c={c} style={{ flex: 1 }}>
                  <TTextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                    value={form.duracion_espera_min}
                    onChangeText={v => setForm(f => ({ ...f, duracion_espera_min: v }))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={c.textTertiary}
                  />
                </FormField>
              </View>

              <FormField label="Tiempo activo extra (después de espera)" c={c}>
                <TTextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                  value={form.duracion_activa_extra_min}
                  onChangeText={v => setForm(f => ({ ...f, duracion_activa_extra_min: v }))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={c.textTertiary}
                />
              </FormField>

              <View style={[s.infoBox, { backgroundColor: tokens.primarySoft, borderColor: tokens.primary + '33' }]}>
                <Ionicons name="information-circle-outline" size={16} color={tokens.primary} />
                <TText style={{ color: tokens.primary, fontSize: tokens.fontSize.xs, flex: 1 }}>
                  Durante el tiempo de espera el profesional puede atender a otro cliente (ej. mientras procesa un tinte). El tiempo activo extra permite un segundo período activo después de la espera.
                </TText>
              </View>

              <View style={[s.switchRow, { borderTopColor: c.border }]}>
                <TText style={[s.switchLabel, { color: c.text }]}>Servicio activo</TText>
                <Switch
                  value={form.activo}
                  onValueChange={v => setForm(f => ({ ...f, activo: v }))}
                  trackColor={{ false: c.border, true: tokens.primary }}
                  thumbColor="#fff"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.lg }}>
                <Btn
                  variant="ghost"
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </Btn>
                <Btn
                  variant="primary"
                  onPress={guardarServicio}
                  disabled={guardando}
                  style={{ flex: 1 }}
                >
                  {guardando ? '...' : editando ? 'Guardar' : 'Crear'}
                </Btn>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FormField({ label, c, children, style }: { label: string; c: any; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ gap: tokens.spacing.sm }, style]}>
      <TText style={{ color: c.textSecondary, fontSize: tokens.fontSize.sm, fontWeight: '500' }}>{label}</TText>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: tokens.spacing.xxl },
  section: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, gap: tokens.spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.sm },
  sectionTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  sectionAction: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.md, gap: tokens.spacing.md },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, flex: 1 },
  settingIcon: { width: 40, height: 40, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: tokens.fontSize.base, fontWeight: '500' },
  settingValue: { fontSize: tokens.fontSize.sm, marginTop: tokens.spacing.xs / 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: tokens.spacing.md },
  servicioCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  servicioLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  servicioIcon: { width: 40, height: 40, borderRadius: tokens.radius.md, alignItems: 'center', justifyContent: 'center' },
  servicioNombre: { fontSize: tokens.fontSize.base, fontWeight: '600' },
  servicioInfo: { fontSize: tokens.fontSize.xs, marginTop: tokens.spacing.xs / 2 },
  servicioActions: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  emptyAction: { paddingVertical: tokens.spacing.xl, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md },
  emptyActionText: { fontSize: tokens.fontSize.base, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: tokens.spacing.lg },
  modalPanel: { width: '100%', maxWidth: 480, maxHeight: '90%' as any, borderRadius: tokens.radius.xl, borderWidth: 1, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: tokens.spacing.md, borderBottomWidth: 1 },
  modalTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  modalContent: { padding: tokens.spacing.lg, gap: tokens.spacing.md },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: tokens.radius.md, paddingHorizontal: tokens.spacing.md, paddingVertical: 10, fontSize: tokens.fontSize.base },
  infoBox: { flexDirection: 'row', gap: tokens.spacing.sm, padding: tokens.spacing.md, borderRadius: tokens.radius.md, borderWidth: 1, alignItems: 'flex-start' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.spacing.md, borderTopWidth: 1 },
  switchLabel: { fontSize: tokens.fontSize.base, fontWeight: '500' },
});
