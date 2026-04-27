import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, Alert, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useTheme } from '@/lib/theme';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { Topbar, Card, Btn, Loading } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';

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

const tokens = DESIGN_TOKENS;

const TIPOS_BLOQUEO = [
  { key: 'vacaciones', label: 'Vacaciones', color: '#f59e0b' },
  { key: 'reunion', label: 'Reunión', color: '#3b82f6' },
  { key: 'baja', label: 'Baja', color: '#ef4444' },
  { key: 'formacion', label: 'Formación', color: '#8b5cf6' },
  { key: 'descanso', label: 'Descanso', color: '#10b981' },
];

const COLORES = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function EquipoScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [negocioId, setNegocioId] = useState('');
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [negocioNombre, setNegocioNombre] = useState('');

  const [modalProfVisible, setModalProfVisible] = useState(false);
  const [nombreProf, setNombreProf] = useState('');
  const [colorProf, setColorProf] = useState('#6366f1');
  const [guardandoProf, setGuardandoProf] = useState(false);

  const [modalBloquesVisible, setModalBloquesVisible] = useState(false);
  const [profSeleccionada, setProfSeleccionada] = useState<Profesional | null>(null);
  const [bloques, setBloques] = useState<Bloqueo[]>([]);
  const [cargandoBloques, setCargandoBloques] = useState(false);

  const [modalBloqueVisible, setModalBloqueVisible] = useState(false);
  const [tipoBloqueo, setTipoBloqueo] = useState('vacaciones');
  const [motivoBloqueo, setMotivoBloqueo] = useState('');
  const [fechaInicio, setFechaInicio] = useState(new Date());
  const [fechaFin, setFechaFin] = useState(new Date());
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

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
      .eq('activo', true)
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
    return <Loading />;
  }

  const tipoInfo = (tipo: string) => TIPOS_BLOQUEO.find(t => t.key === tipo);

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Topbar title="Equipo" subtitle={`${profesionales.length} profesionales`} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Btn
            variant="primary"
            onPress={() => setModalProfVisible(true)}
            icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
          >
            Agregar profesional
          </Btn>
        </View>

        {profesionales.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="people-outline" size={48} color={tokens.textTertiary} />
            <TText style={[s.emptyText, { color: c.textSecondary }]}>No hay profesionales registrados</TText>
          </View>
        ) : (
          <View style={s.section}>
            {profesionales.map((prof) => (
              <Card key={prof.id} style={s.profCard}>
                <View style={s.profHeader}>
                  <View style={[s.profColor, { backgroundColor: prof.color }]} />
                  <View style={{ flex: 1 }}>
                    <TText style={[s.profNombre, { color: c.text }]}>{prof.nombre}</TText>
                    <TText style={[s.profEstado, { color: c.textTertiary }]}>
                      {prof.activo ? 'Activo' : 'Inactivo'}
                    </TText>
                  </View>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: tokens.primarySoft }]}
                    onPress={() => abrirBloques(prof)}
                  >
                    <Ionicons name="calendar-outline" size={16} color={tokens.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#ef444422' }]}
                    onPress={() => eliminarProfesional(prof)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal crear profesional */}
      <Modal visible={modalProfVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TText style={[s.modalTitle, { color: c.text }]}>Nuevo profesional</TText>

            <TTextInput
              style={[s.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
              placeholder="Nombre"
              placeholderTextColor={c.textTertiary}
              value={nombreProf}
              onChangeText={setNombreProf}
            />

            <TText style={[s.colorLabel, { color: c.textSecondary }]}>Color</TText>
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

            <View style={s.modalBtns}>
              <Btn
                variant="ghost"
                onPress={() => setModalProfVisible(false)}
                style={{ flex: 1 }}
              >
                Cancelar
              </Btn>
              <Btn
                variant="primary"
                onPress={crearProfesional}
                disabled={guardandoProf}
                style={{ flex: 1 }}
              >
                {guardandoProf ? '...' : 'Crear'}
              </Btn>
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
            <TText style={[s.modalHeaderTitle, { color: c.text }]}>
              {profSeleccionada?.nombre}
            </TText>
            <TouchableOpacity style={{ opacity: 0 }} disabled>
              <Ionicons name="chevron-back" size={24} color="transparent" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.content}>
            {cargandoBloques ? (
              <Loading />
            ) : (
              <>
                <View style={s.section}>
                  <Btn
                    variant="primary"
                    onPress={() => setModalBloqueVisible(true)}
                    icon={<Ionicons name="add-circle-outline" size={18} color="#fff" />}
                  >
                    Agregar bloqueo
                  </Btn>
                </View>

                {bloques.length === 0 ? (
                  <View style={s.emptyState}>
                    <Ionicons name="calendar-outline" size={48} color={tokens.textTertiary} />
                    <TText style={[s.emptyText, { color: c.textSecondary }]}>Sin bloques de disponibilidad</TText>
                  </View>
                ) : (
                  <View style={s.section}>
                    {bloques.map((bloqueo) => {
                      const info = tipoInfo(bloqueo.tipo);
                      const inicio = parseISO(bloqueo.inicio);
                      const fin = parseISO(bloqueo.fin);
                      return (
                        <Card key={bloqueo.id} style={[s.bloqueCard, { borderLeftColor: info?.color, borderLeftWidth: 4 }]}>
                          <View style={{ flex: 1 }}>
                            <View style={s.bloqueBadgeRow}>
                              <View
                                style={[
                                  s.tipoBadge,
                                  { backgroundColor: info?.color + '22', borderColor: info?.color },
                                ]}
                              >
                                <TText style={[s.tipoBadgeText, { color: info?.color }]}>
                                  {info?.label}
                                </TText>
                              </View>
                            </View>
                            <TText style={[s.bloqueTime, { color: c.text }]}>
                              {format(inicio, 'd MMM', { locale: es })} - {format(fin, 'd MMM yyyy', { locale: es })}
                            </TText>
                            {bloqueo.motivo && (
                              <TText style={[s.bloqueMotivo, { color: c.textSecondary }]}>
                                {bloqueo.motivo}
                              </TText>
                            )}
                          </View>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#ef444422' }]}
                            onPress={() => eliminarBloqueo(bloqueo.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </Card>
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
            <TText style={[s.modalTitle, { color: c.text }]}>Nuevo bloqueo</TText>

            <TText style={[s.inputLabel, { color: c.textSecondary }]}>Tipo</TText>
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
                  <TText style={[s.tipoBtnText, { color: tipoBloqueo === tipo.key ? tipo.color : c.text }]}>
                    {tipo.label}
                  </TText>
                </TouchableOpacity>
              ))}
            </View>

            <TText style={[s.inputLabel, { color: c.textSecondary }]}>Motivo (opcional)</TText>
            <TTextInput
              style={[s.input, { backgroundColor: c.bg, borderColor: c.border, color: c.text }]}
              placeholder="Ej: Vacaciones en el extranjero"
              placeholderTextColor={c.textTertiary}
              value={motivoBloqueo}
              onChangeText={setMotivoBloqueo}
            />

            <TText style={[s.inputLabel, { color: c.textSecondary }]}>Desde</TText>
            <View style={[s.dateBox, { backgroundColor: c.bg, borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setFechaInicio(cambiarFecha(fechaInicio, -1))}>
                <Ionicons name="remove" size={20} color={c.text} />
              </TouchableOpacity>
              <TText style={[s.dateText, { color: c.text }]}>
                {format(fechaInicio, 'd MMM yyyy', { locale: es })}
              </TText>
              <TouchableOpacity onPress={() => setFechaInicio(cambiarFecha(fechaInicio, 1))}>
                <Ionicons name="add" size={20} color={c.text} />
              </TouchableOpacity>
            </View>

            <TText style={[s.inputLabel, { color: c.textSecondary }]}>Hasta</TText>
            <View style={[s.dateBox, { backgroundColor: c.bg, borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setFechaFin(cambiarFecha(fechaFin, -1))}>
                <Ionicons name="remove" size={20} color={c.text} />
              </TouchableOpacity>
              <TText style={[s.dateText, { color: c.text }]}>
                {format(fechaFin, 'd MMM yyyy', { locale: es })}
              </TText>
              <TouchableOpacity onPress={() => setFechaFin(cambiarFecha(fechaFin, 1))}>
                <Ionicons name="add" size={20} color={c.text} />
              </TouchableOpacity>
            </View>

            <View style={s.modalBtns}>
              <Btn
                variant="ghost"
                onPress={() => setModalBloqueVisible(false)}
                style={{ flex: 1 }}
              >
                Cancelar
              </Btn>
              <Btn
                variant="primary"
                onPress={crearBloqueo}
                disabled={guardandoBloqueo}
                style={{ flex: 1 }}
              >
                {guardandoBloqueo ? '...' : 'Crear'}
              </Btn>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: tokens.spacing.xxl },
  section: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, gap: tokens.spacing.md },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.md },
  emptyText: { fontSize: tokens.fontSize.base, textAlign: 'center' },
  profCard: { gap: tokens.spacing.md },
  profHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md },
  profColor: { width: 12, height: 12, borderRadius: 6 },
  profNombre: { fontSize: tokens.fontSize.base, fontWeight: '600' },
  profEstado: { fontSize: tokens.fontSize.xs, marginTop: tokens.spacing.xs / 2 },
  actionBtn: { width: 36, height: 36, borderRadius: tokens.radius.md, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: tokens.spacing.lg },
  modalContainer: { flex: 1 },
  modalContent: { borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, maxHeight: '80%', width: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, borderBottomWidth: 1 },
  modalHeaderTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  modalTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700', marginBottom: tokens.spacing.md },
  modalBtns: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.lg },
  input: { borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginBottom: tokens.spacing.md, fontSize: tokens.fontSize.base },
  inputLabel: { fontSize: tokens.fontSize.sm, fontWeight: '500', marginBottom: tokens.spacing.sm },
  colorLabel: { fontSize: tokens.fontSize.sm, fontWeight: '500', marginBottom: tokens.spacing.sm, marginTop: tokens.spacing.md },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  colorOption: { width: 50, height: 50, borderRadius: tokens.radius.md },
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  tipoBtn: { flex: 1, minWidth: '45%', paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.md, borderWidth: 1, alignItems: 'center' },
  tipoBtnText: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  dateBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.md, borderWidth: 1, marginBottom: tokens.spacing.md },
  dateText: { fontSize: tokens.fontSize.sm, fontWeight: '500' },
  bloqueCard: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md, justifyContent: 'space-between' },
  bloqueBadgeRow: { marginBottom: tokens.spacing.xs },
  tipoBadge: { paddingHorizontal: tokens.spacing.sm, paddingVertical: 4, borderRadius: tokens.radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  tipoBadgeText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
  bloqueTime: { fontSize: tokens.fontSize.sm, fontWeight: '500', marginTop: tokens.spacing.xs },
  bloqueMotivo: { fontSize: tokens.fontSize.xs, fontStyle: 'italic', marginTop: tokens.spacing.xs },
});
