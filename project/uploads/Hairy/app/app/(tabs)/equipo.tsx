import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme, spacing, radius, fontSize, fontWeight } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
}

interface Bloqueo {
  id: string;
  tipo: string;
  inicio: string;
  fin: string;
  motivo?: string;
  recurrencia?: string;
}

const TIPOS_BLOQUEO = [
  { key: 'vacaciones', label: 'Vacaciones', color: '#f59e0b' },
  { key: 'reunion', label: 'Reunión', color: '#3b82f6' },
  { key: 'baja', label: 'Baja', color: '#ef4444' },
  { key: 'formacion', label: 'Formación', color: '#8b5cf6' },
  { key: 'descanso', label: 'Descanso', color: '#10b981' },
];

export default function EquipoScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [negocioId, setNegocioId] = useState('');
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioNombre, setNegocioNombre] = useState('');

  // Modal crear profesional
  const [modalProfVisible, setModalProfVisible] = useState(false);
  const [nombreProf, setNombreProf] = useState('');
  const [colorProf, setColorProf] = useState('#6366f1');
  const [guardandoProf, setGuardandoProf] = useState(false);

  // Modal gestionar bloques
  const [modalBloquesVisible, setModalBloquesVisible] = useState(false);
  const [profSeleccionada, setProfSeleccionada] = useState<Profesional | null>(null);
  const [bloques, setBloques] = useState<Bloqueo[]>([]);
  const [cargandoBloques, setCargandoBloques] = useState(false);

  // Modal crear bloqueo
  const [modalBloqueVisible, setModalBloqueVisible] = useState(false);
  const [tipoBloqueo, setTipoBloqueo] = useState('vacaciones');
  const [motivoBloqueo, setMotivoBloqueo] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date());
  const [fechaFin, setFechaFin] = useState(new Date());
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

  const COLORES = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

  useEffect(() => {
    cargarEquipo();
  }, []);

  async function cargarEquipo() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);
    setNegocioNombre(profile.nombre_negocio || 'Mi negocio');

    const { data: profs } = await supabase
      .from('profesionales')
      .select('id, nombre, color, activo')
      .eq('negocio_id', profile.negocio_id)
      .order('nombre');

    setProfesionales(profs ?? []);
    setLoading(false);
  }

  async function crearProfesional() {
    if (!nombreProf.trim()) {
      Alert.alert('Error', 'Ingresa el nombre del profesional');
      return;
    }
    setGuardandoProf(true);
    const { error } = await supabase.from('profesionales').insert({
      negocio_id: negocioId,
      nombre: nombreProf.trim(),
      color: colorProf,
      activo: true,
    });
    setGuardandoProf(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setModalProfVisible(false);
    setNombreProf('');
    setColorProf('#6366f1');
    cargarEquipo();
  }

  async function eliminarProfesional(prof: Profesional) {
    Alert.alert(
      'Eliminar profesional',
      `¿Seguro que quieres eliminar a ${prof.nombre}? Las citas existentes no se verán afectadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('profesionales').update({ activo: false }).eq('id', prof.id);
            cargarEquipo();
          },
        },
      ]
    );
  }

  async function abrirBloques(prof: Profesional) {
    setProfSeleccionada(prof);
    setCargandoBloques(true);
    const { data: bloq } = await supabase
      .from('bloqueos_profesional')
      .select('id, tipo, inicio, fin, motivo, recurrencia')
      .eq('profesional_id', prof.id)
      .order('inicio', { ascending: false });
    setBloques(bloq ?? []);
    setCargandoBloques(false);
    setModalBloquesVisible(true);
  }

  async function crearBloqueo() {
    if (!profSeleccionada) return;
    setGuardandoBloqueo(true);
    const { error } = await supabase.from('bloqueos_profesional').insert({
      negocio_id: negocioId,
      profesional_id: profSeleccionada.id,
      tipo: tipoBloqueo,
      inicio: fechaInicio.toISOString(),
      fin: fechaFin.toISOString(),
      motivo: motivoBloqueo.trim() || null,
    });
    setGuardandoBloqueo(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setModalBloqueVisible(false);
    setTipoBloqueo('vacaciones');
    setMotivoBloqueo('');
    abrirBloques(profSeleccionada);
  }

  async function eliminarBloqueo(bloqueId: string) {
    await supabase.from('bloqueos_profesional').delete().eq('id', bloqueId);
    if (profSeleccionada) abrirBloques(profSeleccionada);
  }

  function cambiarFecha(fecha: Date, deltaDias: number) {
    const d = new Date(fecha);
    d.setDate(d.getDate() + deltaDias);
    return d;
  }

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  const tipoInfo = (tipo: string) => TIPOS_BLOQUEO.find(t => t.key === tipo);

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={[s.header, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
        <Text style={[s.title, { color: c.text }]}>Equipo</Text>
        <Text style={[s.subtitle, { color: c.textSecondary }]}>{negocioNombre}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
        {/* Agregar profesional */}
        <TouchableOpacity
          style={[s.addCard, { backgroundColor: c.surface, borderColor: '#6366f1' }]}
          onPress={() => setModalProfVisible(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="#6366f1" />
          <Text style={[s.addText, { color: '#6366f1' }]}>Agregar profesional</Text>
        </TouchableOpacity>

        {/* Lista de profesionales */}
        {profesionales.length === 0 ? (
          <Text style={[s.empty, { color: c.textTertiary }]}>No hay profesionales aún</Text>
        ) : (
          <View style={{ gap: spacing.md }}>
            {profesionales.map((prof) => (
              <View key={prof.id} style={[s.profCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={[s.colorDot, { backgroundColor: prof.color }]} />
                    <Text style={[s.profNombre, { color: c.text }]}>{prof.nombre}</Text>
                  </View>
                  <Text style={[s.profEstado, { color: c.textTertiary }]}>
                    {prof.activo ? 'Activo' : 'Inactivo'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: c.bgTertiary }]}
                    onPress={() => abrirBloques(prof)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={c.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#ef444422' }]}
                    onPress={() => eliminarProfesional(prof)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal crear profesional */}
      <Modal visible={modalProfVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>Nuevo profesional</Text>

            <TextInput
              style={[s.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
              placeholder="Nombre"
              placeholderTextColor={c.textTertiary}
              value={nombreProf}
              onChangeText={setNombreProf}
            />

            <Text style={[s.colorLabel, { color: c.textSecondary }]}>Color</Text>
            <View style={s.colorGrid}>
              {COLORES.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[
                    s.colorOption,
                    { backgroundColor: col },
                    colorProf === col && { borderWidth: 3, borderColor: c.text },
                  ]}
                  onPress={() => setColorProf(col)}
                />
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, flex: 1 }]}
                onPress={() => setModalProfVisible(false)}
              >
                <Text style={[s.modalBtnText, { color: c.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#6366f1', flex: 1 }]}
                onPress={crearProfesional}
                disabled={guardandoProf}
              >
                <Text style={s.modalBtnTextPrimary}>
                  {guardandoProf ? '...' : 'Crear'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gestionar bloques */}
      <Modal visible={modalBloquesVisible} transparent animationType="slide">
        <View style={[s.modalContainer, { backgroundColor: c.bg }]}>
          <View style={[s.modalHeader, { backgroundColor: c.surface, borderBottomColor: c.border, paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setModalBloquesVisible(false)}>
              <Ionicons name="chevron-back" size={24} color={c.text} />
            </TouchableOpacity>
            <Text style={[s.modalHeaderTitle, { color: c.text }]}>
              {profSeleccionada?.nombre}
            </Text>
            <TouchableOpacity
              style={{ opacity: 0 }}
              disabled
            >
              <Ionicons name="chevron-back" size={24} color="transparent" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            {cargandoBloques ? (
              <ActivityIndicator color="#6366f1" />
            ) : (
              <>
                <TouchableOpacity
                  style={[s.addCard, { backgroundColor: c.surface, borderColor: '#6366f1' }]}
                  onPress={() => setModalBloqueVisible(true)}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#6366f1" />
                  <Text style={[s.addText, { color: '#6366f1' }]}>Agregar bloqueo</Text>
                </TouchableOpacity>

                {bloques.length === 0 ? (
                  <Text style={[s.empty, { color: c.textTertiary }]}>
                    Sin bloques de disponibilidad
                  </Text>
                ) : (
                  <View style={{ gap: spacing.md }}>
                    {bloques.map((bloqueo) => {
                      const info = tipoInfo(bloqueo.tipo);
                      const inicio = parseISO(bloqueo.inicio);
                      const fin = parseISO(bloqueo.fin);
                      return (
                        <View key={bloqueo.id} style={[s.bloqueCard, { backgroundColor: c.surface, borderColor: info?.color }]}>
                          <View style={{ flex: 1, gap: spacing.xs }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                              <View style={[s.tipoBadge, { backgroundColor: info?.color + '22', borderColor: info?.color }]}>
                                <Text style={[s.tipoBadgeText, { color: info?.color }]}>
                                  {info?.label}
                                </Text>
                              </View>
                            </View>
                            <Text style={[s.bloqueTime, { color: c.text }]}>
                              {format(inicio, 'd MMM', { locale: es })} - {format(fin, 'd MMM yyyy HH:mm', { locale: es })}
                            </Text>
                            {bloqueo.motivo && (
                              <Text style={[s.bloqueMotivo, { color: c.textSecondary }]}>
                                {bloqueo.motivo}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#ef444422' }]}
                            onPress={() => eliminarBloqueo(bloqueo.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Modal crear bloqueo */}
      <Modal visible={modalBloqueVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>Nuevo bloqueo</Text>

            <Text style={[s.inputLabel, { color: c.textSecondary }]}>Tipo</Text>
            <View style={s.tiposGrid}>
              {TIPOS_BLOQUEO.map((tipo) => (
                <TouchableOpacity
                  key={tipo.key}
                  style={[
                    s.tipoBtn,
                    {
                      backgroundColor: tipoBloqueo === tipo.key ? tipo.color + '22' : c.bg,
                      borderColor: tipoBloqueo === tipo.key ? tipo.color : c.border,
                    },
                  ]}
                  onPress={() => setTipoBloqueo(tipo.key)}
                >
                  <Text style={[s.tipoBtnText, { color: tipoBloqueo === tipo.key ? tipo.color : c.text }]}>
                    {tipo.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.inputLabel, { color: c.textSecondary }]}>Motivo (opcional)</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
              placeholder="Ej: Vacaciones en el extranjero"
              placeholderTextColor={c.textTertiary}
              value={motivoBloqueo}
              onChangeText={setMotivoBloqueo}
            />

            <Text style={[s.inputLabel, { color: c.textSecondary }]}>Desde</Text>
            <View style={[s.dateBox, { backgroundColor: c.bg, borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setFechaInicio(cambiarFecha(fechaInicio, -1))}>
                <Ionicons name="remove" size={20} color={c.text} />
              </TouchableOpacity>
              <Text style={[s.dateText, { color: c.text }]}>
                {format(fechaInicio, 'd MMM yyyy', { locale: es })}
              </Text>
              <TouchableOpacity onPress={() => setFechaInicio(cambiarFecha(fechaInicio, 1))}>
                <Ionicons name="add" size={20} color={c.text} />
              </TouchableOpacity>
            </View>

            <Text style={[s.inputLabel, { color: c.textSecondary }]}>Hasta</Text>
            <View style={[s.dateBox, { backgroundColor: c.bg, borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setFechaFin(cambiarFecha(fechaFin, -1))}>
                <Ionicons name="remove" size={20} color={c.text} />
              </TouchableOpacity>
              <Text style={[s.dateText, { color: c.text }]}>
                {format(fechaFin, 'd MMM yyyy', { locale: es })}
              </Text>
              <TouchableOpacity onPress={() => setFechaFin(cambiarFecha(fechaFin, 1))}>
                <Ionicons name="add" size={20} color={c.text} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, flex: 1 }]}
                onPress={() => setModalBloqueVisible(false)}
              >
                <Text style={[s.modalBtnText, { color: c.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: '#6366f1', flex: 1 }]}
                onPress={crearBloqueo}
                disabled={guardandoBloqueo}
              >
                <Text style={s.modalBtnTextPrimary}>
                  {guardandoBloqueo ? '...' : 'Crear'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm, marginTop: 4 },
  addCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed' },
  addText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  empty: { textAlign: 'center', fontSize: fontSize.sm, marginVertical: spacing.lg },
  profCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, justifyContent: 'space-between' },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  profNombre: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, flex: 1 },
  profEstado: { fontSize: fontSize.xs },
  actionBtn: { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { flex: 1 },
  modalContent: { borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%', width: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  modalHeaderTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, fontSize: fontSize.md },
  inputLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.sm },
  colorLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.sm, marginTop: spacing.md },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  colorOption: { width: 50, height: 50, borderRadius: radius.md },
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  tipoBtn: { flex: 1, minWidth: '45%', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  tipoBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  dateBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md },
  dateText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  modalBtn: { paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  modalBtnTextPrimary: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  bloqueCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'flex-start', justifyContent: 'space-between' },
  bloqueTime: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  bloqueMotivo: { fontSize: fontSize.xs, fontStyle: 'italic' },
  tipoBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  tipoBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
});
