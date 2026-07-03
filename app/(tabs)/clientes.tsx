import { useEffect, useState, useCallback } from 'react';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import {
  View, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  Modal, Alert, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { mensajeDeError } from '@/lib/errores';
import { useTheme, spacing } from '@/lib/theme';
import { DESIGN_TOKENS, STATUS_META } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { Topbar, Card, Input, Btn, Pill, EmptyState, Loading } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';
import { PhoneInput } from '@/components/ui/PhoneInput';

const tokens = DESIGN_TOKENS;

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  fecha_nacimiento?: string;
  canal_preferido?: string;
  bebida_preferida?: string;
  sensibilidades_cuero?: string;
  alergias?: string;
  profesional_habitual_id?: string;
  profesional_habitual_nombre?: string;
  notas?: string;
  negocio_id: string;
  citas_count: number;
  ultima_cita?: string;
  noshows_count: number;
  perfil_riesgo: string;
  ticket_medio: number;
  frecuencia_dias?: number;
}

interface FichaTecnica {
  id: string;
  tipo_servicio: string;
  marca_producto?: string;
  formula: any;
  oxidante_volumen?: number;
  oxidante_proporcion?: string;
  tiempo_exposicion_min?: number;
  tecnica_aplicacion: string[];
  base_natural?: string;
  color_previo?: string;
  porcentaje_canas?: number;
  resultado_color?: string;
  resultado_satisfactorio?: boolean;
  resultado_notas?: string;
  incidencias?: string;
  profesional_nombre?: string;
  created_at: string;
  cerrada: boolean;
}

interface NotaInterna {
  id: string;
  contenido: string;
  autor_nombre?: string;
  created_at: string;
}

interface CitaHistorial {
  id: string;
  inicio: string;
  estado: string;
  servicio_nombre?: string;
  profesional_nombre?: string;
  importe_final?: number;
  notas?: string;
}

const FILTROS = ['todos', 'vip', 'habituales', 'nuevos', 'inactivos'] as const;
type Filtro = typeof FILTROS[number];

const TABS_DETALLE = ['info', 'historial', 'color', 'notas'] as const;
type TabDetalle = typeof TABS_DETALLE[number];

const TAB_LABELS: Record<TabDetalle, { label: string; icon: string }> = {
  info: { label: 'Info', icon: 'person-outline' },
  historial: { label: 'Historial', icon: 'time-outline' },
  color: { label: 'Color', icon: 'color-palette-outline' },
  notas: { label: 'Notas', icon: 'document-text-outline' },
};

const TIPOS_SERVICIO: Record<string, string> = {
  coloracion_global: 'Color global',
  color_raiz: 'Color raiz',
  mechas: 'Mechas',
  balayage: 'Balayage',
  decoloracion: 'Decoloracion',
  matiz: 'Matiz',
  bano_color: 'Bano de color',
  correccion_color: 'Correccion',
  color_fantasia: 'Color fantasia',
  otro: 'Otro',
};

const CANALES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  telefono: 'Telefono',
};

function ClientesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [negocioId, setNegocioId] = useState('');
  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string }[]>([]);

  // Detalle
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [clienteActivo, setClienteActivo] = useState<Cliente | null>(null);
  const [tabActivo, setTabActivo] = useState<TabDetalle>('info');
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnica[]>([]);
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);
  const [citasHistorial, setCitasHistorial] = useState<CitaHistorial[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Crear cliente
  const [modalCrear, setModalCrear] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Editar info
  const [editando, setEditando] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCanal, setEditCanal] = useState('whatsapp');
  const [editBebida, setEditBebida] = useState('');
  const [editAlergias, setEditAlergias] = useState('');
  const [editSensibilidades, setEditSensibilidades] = useState('');

  // Nueva nota
  const [nuevaNota, setNuevaNota] = useState('');

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) { setLoading(false); return; }
    setNegocioId(profile.negocio_id);

    const [{ data: clts }, { data: profs }] = await Promise.all([
      supabase
        .from('clientes')
        .select(`id, nombre, telefono, email, fecha_nacimiento, canal_preferido,
                 bebida_preferida, sensibilidades_cuero, alergias, notas,
                 profesional_habitual_id, negocio_id, noshows_count, perfil_riesgo,
                 ticket_medio, frecuencia_dias,
                 profesionales!clientes_profesional_habitual_id_fkey(nombre),
                 citas(id, estado, inicio)`)
        .eq('negocio_id', profile.negocio_id)
        .order('nombre'),
      supabase
        .from('profesionales')
        .select('id, nombre')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true),
    ]);

    setProfesionales(profs ?? []);

    const procesados = (clts ?? []).map((cli: any) => {
      const citas = cli.citas || [];
      const citasCount = citas.length;
      const ultimaCita = citas.sort((a: any, b: any) =>
        new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
      )[0]?.inicio;

      return {
        ...cli,
        profesional_habitual_nombre: cli.profesionales?.nombre,
        citas_count: citasCount,
        ultima_cita: ultimaCita,
        noshows_count: cli.noshows_count || 0,
        perfil_riesgo: cli.perfil_riesgo || 'normal',
        ticket_medio: cli.ticket_medio || 0,
      } as Cliente;
    });

    setClientes(procesados);
    setLoading(false);
  }

  function clasificar(cli: Cliente): 'vip' | 'habitual' | 'nuevo' | 'inactivo' {
    if (!cli.citas_count) return 'inactivo';
    if (cli.ultima_cita) {
      const dias = differenceInDays(new Date(), parseISO(cli.ultima_cita));
      if (dias > 120 && cli.citas_count > 1) return 'inactivo';
    }
    if (cli.citas_count >= 10) return 'vip';
    if (cli.citas_count >= 3) return 'habitual';
    return 'nuevo';
  }

  const clientesFiltrados = clientes.filter(cli => {
    const clasif = clasificar(cli);
    if (filtro !== 'todos') {
      const filtroMap: Record<string, string> = {
        vip: 'vip', habituales: 'habitual', nuevos: 'nuevo', inactivos: 'inactivo',
      };
      if (filtroMap[filtro] !== clasif) return false;
    }
    if (searchText.trim()) {
      const busq = searchText.toLowerCase();
      return (
        cli.nombre.toLowerCase().includes(busq) ||
        (cli.telefono?.includes(busq) ?? false) ||
        (cli.email?.toLowerCase().includes(busq) ?? false)
      );
    }
    return true;
  });

  async function abrirDetalle(cli: Cliente) {
    setClienteActivo(cli);
    setTabActivo('info');
    setDetalleVisible(true);
    setCargandoDetalle(true);
    setEditando(false);

    const [{ data: fichas }, { data: notas }, { data: citas }] = await Promise.all([
      supabase
        .from('fichas_tecnicas_color')
        .select('*, profesionales(nombre)')
        .eq('cliente_id', cli.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notas_internas_cliente')
        .select('*, profesionales!notas_internas_cliente_autor_id_fkey(nombre)')
        .eq('cliente_id', cli.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('citas')
        .select('id, inicio, estado, notas, importe_final, servicios(nombre), profesionales(nombre)')
        .eq('cliente_id', cli.id)
        .order('inicio', { ascending: false })
        .limit(50),
    ]);

    setFichasTecnicas((fichas ?? []).map((f: any) => ({
      ...f,
      profesional_nombre: f.profesionales?.nombre,
    })));

    setNotasInternas((notas ?? []).map((n: any) => ({
      ...n,
      autor_nombre: n.profesionales?.nombre,
    })));

    setCitasHistorial((citas ?? []).map((ct: any) => ({
      ...ct,
      servicio_nombre: ct.servicios?.nombre,
      profesional_nombre: ct.profesionales?.nombre,
    })));

    setCargandoDetalle(false);
  }

  async function crearCliente() {
    if (!nuevoNombre.trim()) { Alert.alert('Error', 'El nombre es obligatorio'); return; }
    if (!nuevoTelefono.trim() && !nuevoEmail.trim()) {
      Alert.alert('Error', 'Se necesita al menos un dato de contacto (telefono o email)');
      return;
    }

    setGuardando(true);

    // Deteccion de duplicados (RN-CL-060)
    let duplicadoQuery = supabase.from('clientes').select('id, nombre, telefono, email').eq('negocio_id', negocioId);
    if (nuevoTelefono.trim()) {
      duplicadoQuery = duplicadoQuery.or(`telefono.eq.${nuevoTelefono.trim()},nombre.ilike.%${nuevoNombre.trim()}%`);
    } else {
      duplicadoQuery = duplicadoQuery.or(`email.ilike.${nuevoEmail.trim()},nombre.ilike.%${nuevoNombre.trim()}%`);
    }

    const { data: posiblesDuplicados } = await duplicadoQuery;

    if (posiblesDuplicados && posiblesDuplicados.length > 0) {
      setGuardando(false);
      const nombres = posiblesDuplicados.map(d => `${d.nombre} (${d.telefono || d.email || 'sin contacto'})`).join('\n');
      Alert.alert(
        'Posible duplicado',
        `Se encontraron clientes similares:\n\n${nombres}\n\nQuieres crear la ficha de todas formas?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Crear igualmente', onPress: () => insertarCliente() },
        ]
      );
      return;
    }

    await insertarCliente();
  }

  async function insertarCliente() {
    setGuardando(true);
    const { error } = await supabase.from('clientes').insert({
      negocio_id: negocioId,
      nombre: nuevoNombre.trim(),
      telefono: nuevoTelefono.trim() || null,
      email: nuevoEmail.trim() || null,
    });
    setGuardando(false);
    if (error) { Alert.alert('Error', mensajeDeError(error)); return; }
    setModalCrear(false);
    setNuevoNombre('');
    setNuevoTelefono('');
    setNuevoEmail('');
    cargar();
  }

  function iniciarEdicion() {
    if (!clienteActivo) return;
    setEditNombre(clienteActivo.nombre);
    setEditTelefono(clienteActivo.telefono || '');
    setEditEmail(clienteActivo.email || '');
    setEditCanal(clienteActivo.canal_preferido || 'whatsapp');
    setEditBebida(clienteActivo.bebida_preferida || '');
    setEditAlergias(clienteActivo.alergias || '');
    setEditSensibilidades(clienteActivo.sensibilidades_cuero || '');
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!clienteActivo) return;
    setGuardando(true);
    const { error } = await supabase.from('clientes').update({
      nombre: editNombre.trim(),
      telefono: editTelefono.trim() || null,
      email: editEmail.trim() || null,
      canal_preferido: editCanal,
      bebida_preferida: editBebida.trim() || null,
      alergias: editAlergias.trim() || null,
      sensibilidades_cuero: editSensibilidades.trim() || null,
    }).eq('id', clienteActivo.id);
    setGuardando(false);
    if (error) { Alert.alert('Error', mensajeDeError(error)); return; }
    setEditando(false);
    cargar();
    setClienteActivo({
      ...clienteActivo,
      nombre: editNombre.trim(),
      telefono: editTelefono.trim() || undefined,
      email: editEmail.trim() || undefined,
      canal_preferido: editCanal,
      bebida_preferida: editBebida.trim() || undefined,
      alergias: editAlergias.trim() || undefined,
      sensibilidades_cuero: editSensibilidades.trim() || undefined,
    });
  }

  async function guardarNota() {
    if (!clienteActivo || !nuevaNota.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from('notas_internas_cliente').insert({
      negocio_id: negocioId,
      cliente_id: clienteActivo.id,
      contenido: nuevaNota.trim(),
    });
    setGuardando(false);
    if (error) { Alert.alert('Error', mensajeDeError(error)); return; }
    setNuevaNota('');
    abrirDetalle(clienteActivo);
  }

  async function eliminarNota(notaId: string) {
    Alert.alert('Eliminar nota', 'Seguro que quieres eliminar esta nota?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await supabase.from('notas_internas_cliente').delete().eq('id', notaId);
          if (clienteActivo) abrirDetalle(clienteActivo);
        },
      },
    ]);
  }

  const labels: Record<string, string> = { vip: 'VIP', habitual: 'Habitual', nuevo: 'Nuevo', inactivo: 'Inactivo' };
  const colors: Record<string, string> = { vip: '#f59e0b', habitual: '#f4501e', nuevo: '#10b981', inactivo: '#94a3b8' };
  const riesgoColors: Record<string, string> = { normal: tokens.success, medio: tokens.warning, alto: tokens.danger };

  // ─── Tab content renderers ───

  function renderInfo() {
    if (!clienteActivo) return null;
    const cli = clienteActivo;

    if (editando) {
      return (
        <View style={s.tabContent}>
          <TText style={[s.sectionTitle, { color: c.textTertiary }]}>DATOS DE CONTACTO</TText>
          <Card>
            <LabelInput label="Nombre" value={editNombre} onChangeText={setEditNombre} c={c} />
            <View style={{ marginBottom: tokens.spacing.md }}>
              <TText style={[s.fieldLabel, { color: c.textTertiary }]}>Telefono</TText>
              <PhoneInput value={editTelefono} onChange={(e164) => setEditTelefono(e164)} />
            </View>
            <LabelInput label="Email" value={editEmail} onChangeText={setEditEmail} c={c} keyboardType="email-address" />
          </Card>

          <TText style={[s.sectionTitle, { color: c.textTertiary }]}>PREFERENCIAS</TText>
          <Card>
            <TText style={[s.fieldLabel, { color: c.textTertiary }]}>Canal preferido</TText>
            <View style={s.canalGrid}>
              {Object.entries(CANALES).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.canalBtn, {
                    backgroundColor: editCanal === key ? tokens.primarySoft : tokens.bgCardHi,
                    borderColor: editCanal === key ? tokens.primary : tokens.border,
                  }]}
                  onPress={() => setEditCanal(key)}
                >
                  <TText style={[s.canalBtnText, { color: editCanal === key ? tokens.primary : c.textSecondary }]}>{label}</TText>
                </TouchableOpacity>
              ))}
            </View>
            <LabelInput label="Bebida preferida" value={editBebida} onChangeText={setEditBebida} c={c} placeholder="Ej: cafe con leche" />
            <LabelInput label="Alergias / intolerancias" value={editAlergias} onChangeText={setEditAlergias} c={c} placeholder="Ej: alergia a PPD" />
            <LabelInput label="Sensibilidades cuero cabelludo" value={editSensibilidades} onChangeText={setEditSensibilidades} c={c} placeholder="Ej: cuero sensible" />
          </Card>

          <View style={s.editBtns}>
            <Btn variant="ghost" onPress={() => setEditando(false)} style={{ flex: 1 }}>Cancelar</Btn>
            <Btn variant="primary" onPress={guardarEdicion} disabled={guardando} style={{ flex: 1 }}>
              {guardando ? '...' : 'Guardar'}
            </Btn>
          </View>
        </View>
      );
    }

    return (
      <View style={s.tabContent}>
        <TText style={[s.sectionTitle, { color: c.textTertiary }]}>DATOS DE CONTACTO</TText>
        <Card>
          <InfoRow icon="call-outline" label="Telefono" value={cli.telefono || 'Sin telefono'} muted={!cli.telefono} c={c} />
          <InfoRow icon="mail-outline" label="Email" value={cli.email || 'Sin email'} muted={!cli.email} c={c} />
          {cli.fecha_nacimiento && (
            <InfoRow icon="gift-outline" label="Nacimiento" value={format(parseISO(cli.fecha_nacimiento), 'd MMM yyyy', { locale: es })} c={c} />
          )}
          <InfoRow icon="chatbubble-outline" label="Canal preferido" value={CANALES[cli.canal_preferido || 'whatsapp'] || 'WhatsApp'} c={c} />
        </Card>

        <TText style={[s.sectionTitle, { color: c.textTertiary }]}>PREFERENCIAS</TText>
        <Card>
          {cli.profesional_habitual_nombre && (
            <InfoRow icon="person-outline" label="Profesional habitual" value={cli.profesional_habitual_nombre} c={c} />
          )}
          {cli.bebida_preferida && <InfoRow icon="cafe-outline" label="Bebida" value={cli.bebida_preferida} c={c} />}
          {cli.alergias && <InfoRow icon="alert-circle-outline" label="Alergias" value={cli.alergias} c={c} color={tokens.warning} />}
          {cli.sensibilidades_cuero && <InfoRow icon="medical-outline" label="Sensibilidades" value={cli.sensibilidades_cuero} c={c} />}
          {!cli.profesional_habitual_nombre && !cli.bebida_preferida && !cli.alergias && !cli.sensibilidades_cuero && (
            <TText style={[s.emptyTab, { color: c.textTertiary }]}>Sin preferencias registradas</TText>
          )}
        </Card>

        <TText style={[s.sectionTitle, { color: c.textTertiary }]}>PERFIL</TText>
        <View style={s.statsRow}>
          <MiniStat label="Citas" value={String(cli.citas_count)} color={tokens.primary} />
          <MiniStat label="Ticket medio" value={cli.ticket_medio > 0 ? `${cli.ticket_medio.toFixed(0)} EUR` : '--'} color={tokens.cyan} />
          <MiniStat label="No-shows" value={String(cli.noshows_count)} color={cli.noshows_count > 0 ? tokens.danger : tokens.success} />
        </View>
        {cli.frecuencia_dias && cli.frecuencia_dias > 0 && (
          <Card style={{ marginTop: tokens.spacing.sm }}>
            <InfoRow icon="repeat-outline" label="Frecuencia" value={`Cada ${cli.frecuencia_dias} dias`} c={c} />
          </Card>
        )}

        <TouchableOpacity style={s.editFloating} onPress={iniciarEdicion}>
          <Ionicons name="create-outline" size={16} color={tokens.primary} />
          <TText style={{ color: tokens.primary, fontSize: tokens.fontSize.sm, fontWeight: '600' }}>Editar informacion</TText>
        </TouchableOpacity>
      </View>
    );
  }

  function renderHistorial() {
    if (cargandoDetalle) return <Loading />;
    if (citasHistorial.length === 0) {
      return <EmptyState icon="time-outline" title="Sin historial" subtitle="Este cliente no tiene citas registradas" />;
    }
    return (
      <View style={s.tabContent}>
        {citasHistorial.map(cita => {
          const meta = STATUS_META[cita.estado as keyof typeof STATUS_META];
          return (
            <Card key={cita.id} style={s.historialCard}>
              <View style={s.historialHeader}>
                <View style={{ flex: 1 }}>
                  <TText style={[s.historialServicio, { color: c.text }]}>{cita.servicio_nombre || 'Servicio'}</TText>
                  <TText style={[s.historialMeta, { color: c.textSecondary }]}>
                    {format(parseISO(cita.inicio), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                    {cita.profesional_nombre ? ` con ${cita.profesional_nombre}` : ''}
                  </TText>
                </View>
                {meta && (
                  <View style={[s.estadoBadge, { backgroundColor: meta.soft, borderColor: meta.color }]}>
                    <TText style={[s.estadoBadgeText, { color: meta.color }]}>{meta.label}</TText>
                  </View>
                )}
              </View>
              {cita.importe_final != null && cita.importe_final > 0 && (
                <TText style={[s.historialPrecio, { color: c.text }]}>{cita.importe_final.toFixed(2)} EUR</TText>
              )}
              {cita.notas && <TText style={[s.historialNotas, { color: c.textTertiary }]}>{cita.notas}</TText>}
            </Card>
          );
        })}
      </View>
    );
  }

  function renderColor() {
    if (cargandoDetalle) return <Loading />;
    if (fichasTecnicas.length === 0) {
      return <EmptyState icon="color-palette-outline" title="Sin ficha tecnica" subtitle="No hay registros de color para este cliente" />;
    }
    return (
      <View style={s.tabContent}>
        {fichasTecnicas.map(ficha => (
          <Card key={ficha.id} style={s.fichaCard}>
            <View style={s.fichaHeader}>
              <View style={[s.fichaTipoBadge, { backgroundColor: tokens.violetSoft, borderColor: tokens.violet }]}>
                <TText style={[s.fichaTipoText, { color: tokens.violet }]}>
                  {TIPOS_SERVICIO[ficha.tipo_servicio] || ficha.tipo_servicio}
                </TText>
              </View>
              <TText style={[s.fichaFecha, { color: c.textTertiary }]}>
                {format(parseISO(ficha.created_at), 'd MMM yyyy', { locale: es })}
              </TText>
            </View>

            {ficha.profesional_nombre && (
              <TText style={[s.fichaProfesional, { color: c.textSecondary }]}>
                Realizado por {ficha.profesional_nombre}
              </TText>
            )}

            <View style={s.fichaGrid}>
              {ficha.marca_producto && <FichaField label="Marca" value={ficha.marca_producto} c={c} />}
              {ficha.oxidante_volumen && <FichaField label="Oxidante" value={`${ficha.oxidante_volumen} vol${ficha.oxidante_proporcion ? ` (${ficha.oxidante_proporcion})` : ''}`} c={c} />}
              {ficha.tiempo_exposicion_min && <FichaField label="Tiempo" value={`${ficha.tiempo_exposicion_min} min`} c={c} />}
              {ficha.base_natural && <FichaField label="Base natural" value={ficha.base_natural} c={c} />}
              {ficha.color_previo && <FichaField label="Color previo" value={ficha.color_previo} c={c} />}
              {ficha.porcentaje_canas != null && <FichaField label="Canas" value={`${ficha.porcentaje_canas}%`} c={c} />}
            </View>

            {ficha.formula && Array.isArray(ficha.formula) && ficha.formula.length > 0 && (
              <View style={s.formulaBox}>
                <TText style={[s.formulaLabel, { color: c.textTertiary }]}>FORMULA</TText>
                <TText style={[s.formulaValue, { color: c.text }]}>
                  {ficha.formula.map((f: any) => `${f.numero || '?'} (${f.gramos || '?'}g)`).join(' + ')}
                </TText>
              </View>
            )}

            {ficha.tecnica_aplicacion && ficha.tecnica_aplicacion.length > 0 && (
              <View style={s.tagRow}>
                {ficha.tecnica_aplicacion.map(t => (
                  <Pill key={t} color={tokens.cyan}>{t}</Pill>
                ))}
              </View>
            )}

            {ficha.resultado_color && (
              <View style={s.resultadoBox}>
                <Ionicons
                  name={ficha.resultado_satisfactorio ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={ficha.resultado_satisfactorio ? tokens.success : tokens.warning}
                />
                <TText style={[s.resultadoText, { color: c.textSecondary }]}>{ficha.resultado_color}</TText>
              </View>
            )}

            {ficha.resultado_notas && (
              <TText style={[s.fichaNotas, { color: c.textTertiary }]}>{ficha.resultado_notas}</TText>
            )}

            {ficha.incidencias && (
              <View style={[s.incidenciaBox, { backgroundColor: tokens.dangerSoft, borderColor: `${tokens.danger}33` }]}>
                <Ionicons name="warning-outline" size={14} color={tokens.danger} />
                <TText style={[s.incidenciaText, { color: tokens.danger }]}>{ficha.incidencias}</TText>
              </View>
            )}
          </Card>
        ))}
      </View>
    );
  }

  function renderNotas() {
    return (
      <View style={s.tabContent}>
        <Card>
          <TextInput
            style={[s.notaInput, { backgroundColor: tokens.bgCardHi, borderColor: tokens.border, color: c.text }]}
            placeholder="Escribir nota interna..."
            placeholderTextColor={c.textTertiary}
            value={nuevaNota}
            onChangeText={setNuevaNota}
            multiline
            numberOfLines={3}
          />
          <Btn variant="primary" onPress={guardarNota} disabled={!nuevaNota.trim() || guardando}>
            {guardando ? '...' : 'Guardar nota'}
          </Btn>
        </Card>

        {notasInternas.length === 0 ? (
          <View style={{ paddingVertical: tokens.spacing.xl, alignItems: 'center' }}>
            <TText style={{ color: c.textTertiary, fontSize: tokens.fontSize.sm }}>Sin notas internas</TText>
          </View>
        ) : (
          notasInternas.map(nota => (
            <Card key={nota.id} style={s.notaCard}>
              <View style={s.notaHeader}>
                <View style={{ flex: 1 }}>
                  <TText style={[s.notaContenido, { color: c.text }]}>{nota.contenido}</TText>
                  <TText style={[s.notaMeta, { color: c.textTertiary }]}>
                    {nota.autor_nombre ? `${nota.autor_nombre} - ` : ''}
                    {format(parseISO(nota.created_at), "d MMM yyyy HH:mm", { locale: es })}
                  </TText>
                </View>
                <TouchableOpacity onPress={() => eliminarNota(nota.id)} style={s.notaDeleteBtn}>
                  <Ionicons name="trash-outline" size={14} color={tokens.danger} />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </View>
    );
  }

  // ─── Main render ───

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Topbar
        title="Clientes"
        subtitle={`${clientes.length} clientes registrados`}
        right={
          <Btn variant="primary" onPress={() => setModalCrear(true)} icon={<Ionicons name="add" size={16} color="#fff" />}>
            Nuevo
          </Btn>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.section}>
          <Input
            placeholder="Buscar por nombre, telefono o email..."
            value={searchText}
            onChangeText={setSearchText}
            icon={<Ionicons name="search-outline" size={16} color={tokens.textTertiary} />}
          />
        </View>

        <View style={s.filters}>
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f}
              style={[s.filterBtn, {
                backgroundColor: filtro === f ? tokens.primary : tokens.bgCard,
                borderColor: filtro === f ? tokens.primary : tokens.border,
              }]}
              onPress={() => setFiltro(f)}
            >
              <TText style={[s.filterBtnText, { color: filtro === f ? '#fff' : tokens.textSecondary }]}>
                {f === 'todos' ? 'Todos' : f === 'vip' ? 'VIP' : f === 'habituales' ? 'Habituales' : f === 'nuevos' ? 'Nuevos' : 'Inactivos'}
              </TText>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <Loading /> : clientesFiltrados.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Sin clientes"
            subtitle={searchText ? 'No hay resultados para tu busqueda' : 'No tienes clientes registrados'}
          />
        ) : (
          <View style={s.clientesList}>
            {clientesFiltrados.map(cli => {
              const clasif = clasificar(cli);
              const label = labels[clasif];
              const color = colors[clasif];

              return (
                <TouchableOpacity key={cli.id} onPress={() => abrirDetalle(cli)} activeOpacity={0.7}>
                  <Card style={s.clienteCard}>
                    <View style={s.clienteHeader}>
                      <View style={s.clienteInfo}>
                        <TText style={[s.clienteNombre, { color: c.text }]}>{cli.nombre}</TText>
                        {cli.telefono && (
                          <TText style={[s.clienteContacto, { color: c.textSecondary }]}>
                            <Ionicons name="call-outline" size={12} /> {cli.telefono}
                          </TText>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' }}>
                        {cli.perfil_riesgo !== 'normal' && (
                          <View style={[s.badge, { backgroundColor: `${riesgoColors[cli.perfil_riesgo]}22`, borderColor: `${riesgoColors[cli.perfil_riesgo]}55` }]}>
                            <TText style={[s.badgeText, { color: riesgoColors[cli.perfil_riesgo] }]}>
                              {cli.perfil_riesgo === 'alto' ? 'Riesgo' : 'Atencion'}
                            </TText>
                          </View>
                        )}
                        <View style={[s.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                          <TText style={[s.badgeText, { color }]}>{label}</TText>
                        </View>
                      </View>
                    </View>

                    <View style={[s.clienteFooter, { borderTopColor: tokens.border }]}>
                      <View style={s.stat}>
                        <TText style={[s.statLabel, { color: c.textTertiary }]}>Citas</TText>
                        <TText style={[s.statValue, { color: c.text }]}>{cli.citas_count || 0}</TText>
                      </View>
                      {cli.ultima_cita && (
                        <View style={s.stat}>
                          <TText style={[s.statLabel, { color: c.textTertiary }]}>Ultima cita</TText>
                          <TText style={[s.statValue, { color: c.text }]}>
                            {format(parseISO(cli.ultima_cita), 'd MMM', { locale: es })}
                          </TText>
                        </View>
                      )}
                      {cli.profesional_habitual_nombre && (
                        <View style={s.stat}>
                          <TText style={[s.statLabel, { color: c.textTertiary }]}>Profesional</TText>
                          <TText style={[s.statValue, { color: c.text }]}>{cli.profesional_habitual_nombre}</TText>
                        </View>
                      )}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── Modal detalle cliente ─── */}
      <Modal visible={detalleVisible} transparent animationType="slide">
        <View style={[s.detalleContainer, { backgroundColor: c.bg }]}>
          <View style={[s.detalleHeader, { borderBottomColor: tokens.border, paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => setDetalleVisible(false)}>
              <Ionicons name="chevron-back" size={24} color={c.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <TText style={[s.detalleNombre, { color: c.text }]}>{clienteActivo?.nombre}</TText>
              {clienteActivo && (
                <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs }}>
                  <Pill color={colors[clasificar(clienteActivo)]}>{labels[clasificar(clienteActivo)]}</Pill>
                </View>
              )}
            </View>
            <View style={{ width: 24 }} />
          </View>

          {/* Tabs */}
          <View style={[s.tabBar, { borderBottomColor: tokens.border }]}>
            {TABS_DETALLE.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.tab, tabActivo === tab && { borderBottomColor: tokens.primary, borderBottomWidth: 2 }]}
                onPress={() => setTabActivo(tab)}
              >
                <Ionicons
                  name={TAB_LABELS[tab].icon as any}
                  size={16}
                  color={tabActivo === tab ? tokens.primary : tokens.textTertiary}
                />
                <TText style={[s.tabLabel, { color: tabActivo === tab ? tokens.primary : tokens.textTertiary }]}>
                  {TAB_LABELS[tab].label}
                </TText>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {tabActivo === 'info' && renderInfo()}
            {tabActivo === 'historial' && renderHistorial()}
            {tabActivo === 'color' && renderColor()}
            {tabActivo === 'notas' && renderNotas()}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal crear cliente ─── */}
      <Modal visible={modalCrear} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: tokens.bgPanel, borderColor: tokens.border }]}>
            <TText style={[s.modalTitle, { color: c.text }]}>Nuevo cliente</TText>

            <LabelInput label="Nombre *" value={nuevoNombre} onChangeText={setNuevoNombre} c={c} />
            <View style={{ marginBottom: tokens.spacing.md }}>
              <TText style={[s.fieldLabel, { color: c.textTertiary }]}>Telefono</TText>
              <PhoneInput value={nuevoTelefono} onChange={(e164) => setNuevoTelefono(e164)} placeholder="Ej: 612345678" />
            </View>
            <LabelInput label="Email" value={nuevoEmail} onChangeText={setNuevoEmail} c={c} keyboardType="email-address" placeholder="Ej: maria@email.com" />

            <TText style={[s.hint, { color: c.textTertiary }]}>Se necesita al menos telefono o email</TText>

            <View style={s.modalBtns}>
              <Btn variant="ghost" onPress={() => setModalCrear(false)} style={{ flex: 1 }}>Cancelar</Btn>
              <Btn variant="primary" onPress={crearCliente} disabled={guardando} style={{ flex: 1 }}>
                {guardando ? '...' : 'Crear'}
              </Btn>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Helper components ───

function InfoRow({ icon, label, value, muted, color, c }: { icon: string; label: string; value: string; muted?: boolean; color?: string; c: any }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon as any} size={16} color={color || c.textTertiary} />
      <View style={{ flex: 1 }}>
        <TText style={[s.infoLabel, { color: c.textTertiary }]}>{label}</TText>
        <TText style={[s.infoValue, { color: muted ? c.textTertiary : c.text }]}>{value}</TText>
      </View>
    </View>
  );
}

function LabelInput({ label, value, onChangeText, c, placeholder, keyboardType }: any) {
  return (
    <View style={{ marginBottom: tokens.spacing.md }}>
      <TText style={[s.fieldLabel, { color: c.textTertiary }]}>{label}</TText>
      <TextInput
        style={[s.fieldInput, { backgroundColor: tokens.bgCardHi, borderColor: tokens.border, color: c.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.textMuted}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.miniStat, { borderColor: `${color}33` }]}>
      <TText style={[s.miniStatValue, { color }]}>{value}</TText>
      <TText style={[s.miniStatLabel, { color: tokens.textTertiary }]}>{label}</TText>
    </View>
  );
}

function FichaField({ label, value, c }: { label: string; value: string; c: any }) {
  return (
    <View style={s.fichaField}>
      <TText style={[s.fichaFieldLabel, { color: c.textTertiary }]}>{label}</TText>
      <TText style={[s.fichaFieldValue, { color: c.text }]}>{value}</TText>
    </View>
  );
}

// ─── Styles ───

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  section: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md },
  filters: { flexDirection: 'row', paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, gap: tokens.spacing.sm, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, borderRadius: tokens.radius.full, borderWidth: 1 },
  filterBtnText: { fontSize: tokens.fontSize.sm, fontWeight: '500' },
  clientesList: { paddingHorizontal: tokens.spacing.lg, gap: tokens.spacing.md },
  clienteCard: { gap: tokens.spacing.md },
  clienteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  clienteInfo: { flex: 1, gap: tokens.spacing.xs },
  clienteNombre: { fontSize: tokens.fontSize.base, fontWeight: '600' },
  clienteContacto: { fontSize: tokens.fontSize.xs, marginTop: tokens.spacing.xs / 2 },
  badge: { paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs, borderRadius: tokens.radius.md, borderWidth: 1 },
  badgeText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
  clienteFooter: { flexDirection: 'row', borderTopWidth: 1, paddingTop: tokens.spacing.md, gap: tokens.spacing.lg },
  stat: { flex: 1 },
  statLabel: { fontSize: tokens.fontSize.xs, marginBottom: tokens.spacing.xs / 2 },
  statValue: { fontSize: tokens.fontSize.base, fontWeight: '600' },

  // Detalle
  detalleContainer: { flex: 1 },
  detalleHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, borderBottomWidth: 1 },
  detalleNombre: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, backgroundColor: tokens.bgPanel },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.xs, paddingVertical: tokens.spacing.md },
  tabLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
  tabContent: { paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.md, gap: tokens.spacing.md },

  // Info tab
  sectionTitle: { fontSize: tokens.fontSize.xs, fontWeight: '600', letterSpacing: 1, marginTop: tokens.spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm },
  infoLabel: { fontSize: tokens.fontSize.xs, marginBottom: 2 },
  infoValue: { fontSize: tokens.fontSize.sm, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: tokens.spacing.sm },
  miniStat: { flex: 1, backgroundColor: tokens.bgCard, borderRadius: tokens.radius.md, borderWidth: 1, padding: tokens.spacing.md, alignItems: 'center', gap: tokens.spacing.xs },
  miniStatValue: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  miniStatLabel: { fontSize: tokens.fontSize.xs },
  editFloating: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.md, marginTop: tokens.spacing.sm },
  editBtns: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.md },

  // Edit fields
  fieldLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', marginBottom: tokens.spacing.xs },
  fieldInput: { borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.spacing.md, fontSize: tokens.fontSize.base },
  canalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  canalBtn: { paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.md, borderWidth: 1 },
  canalBtnText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },

  // Historial tab
  historialCard: { gap: tokens.spacing.sm },
  historialHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  historialServicio: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  historialMeta: { fontSize: tokens.fontSize.xs, marginTop: 2 },
  historialPrecio: { fontSize: tokens.fontSize.sm, fontWeight: '700' },
  historialNotas: { fontSize: tokens.fontSize.xs, fontStyle: 'italic' },
  estadoBadge: { paddingHorizontal: tokens.spacing.sm, paddingVertical: 3, borderRadius: tokens.radius.full, borderWidth: 1 },
  estadoBadgeText: { fontSize: 10, fontWeight: '600' },

  // Color tab
  fichaCard: { gap: tokens.spacing.sm },
  fichaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fichaTipoBadge: { paddingHorizontal: tokens.spacing.sm, paddingVertical: 3, borderRadius: tokens.radius.full, borderWidth: 1 },
  fichaTipoText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
  fichaFecha: { fontSize: tokens.fontSize.xs },
  fichaProfesional: { fontSize: tokens.fontSize.xs },
  fichaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  fichaField: { minWidth: '45%', backgroundColor: tokens.bgCardHi, borderRadius: tokens.radius.sm, padding: tokens.spacing.sm },
  fichaFieldLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  fichaFieldValue: { fontSize: tokens.fontSize.sm, fontWeight: '500' },
  formulaBox: { backgroundColor: tokens.bgCardHi, borderRadius: tokens.radius.md, padding: tokens.spacing.md },
  formulaLabel: { fontSize: 10, fontWeight: '600', marginBottom: tokens.spacing.xs },
  formulaValue: { fontSize: tokens.fontSize.base, fontWeight: '700', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
  resultadoBox: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  resultadoText: { fontSize: tokens.fontSize.sm, flex: 1 },
  fichaNotas: { fontSize: tokens.fontSize.xs, fontStyle: 'italic' },
  incidenciaBox: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.sm, padding: tokens.spacing.md, borderRadius: tokens.radius.md, borderWidth: 1 },
  incidenciaText: { fontSize: tokens.fontSize.xs, flex: 1 },

  // Notas tab
  notaInput: { borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.spacing.md, fontSize: tokens.fontSize.base, minHeight: 80, textAlignVertical: 'top', marginBottom: tokens.spacing.md },
  notaCard: {},
  notaHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md },
  notaContenido: { fontSize: tokens.fontSize.sm },
  notaMeta: { fontSize: tokens.fontSize.xs, marginTop: tokens.spacing.xs },
  notaDeleteBtn: { padding: tokens.spacing.xs },
  emptyTab: { fontSize: tokens.fontSize.sm, textAlign: 'center', paddingVertical: tokens.spacing.md },

  // Modal crear
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: tokens.spacing.lg },
  modalContent: { borderRadius: tokens.radius.lg, padding: tokens.spacing.lg, width: '90%', maxWidth: 400, borderWidth: 1 },
  modalTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700', marginBottom: tokens.spacing.lg },
  modalBtns: { flexDirection: 'row', gap: tokens.spacing.md, marginTop: tokens.spacing.md },
  hint: { fontSize: tokens.fontSize.xs, fontStyle: 'italic', marginBottom: tokens.spacing.sm },
});

export default withClientDataGate(ClientesScreen, 'Clientes');
