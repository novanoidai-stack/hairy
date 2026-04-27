import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DESIGN_TOKENS } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  negocio_id: string;
  citas_count?: number;
  ultima_cita?: string;
  total_gastado?: number;
}

const tokens = DESIGN_TOKENS;

export default function ClientesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'vip' | 'habituales' | 'nuevos' | 'inactivos'>('todos');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }

    const { data: clts } = await supabase
      .from('clientes')
      .select(
        `id, nombre, telefono, email, negocio_id,
         citas(id, estado, inicio, servicios(precio))
        `
      )
      .eq('negocio_id', profile.negocio_id)
      .order('nombre');

    const procesados = (clts ?? []).map((cli: any) => {
      const citas = cli.citas || [];
      const citasCount = citas.length;
      const ultimaCita = citas.sort((a: any, b: any) =>
        new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
      )[0]?.inicio;
      const totalGastado = citas.reduce((sum: number, c: any) => sum + (c.servicios?.precio ?? 0), 0);

      return {
        id: cli.id,
        nombre: cli.nombre,
        telefono: cli.telefono,
        email: cli.email,
        negocio_id: cli.negocio_id,
        citas_count: citasCount,
        ultima_cita: ultimaCita,
        total_gastado: totalGastado,
      };
    });

    setClientes(procesados);
    if (procesados.length > 0) {
      setSelectedClientId(procesados[0].id);
    }
    setLoading(false);
  }

  function clasificar(cliente: Cliente): 'vip' | 'habitual' | 'nuevo' | 'inactivo' {
    if (!cliente.citas_count) return 'inactivo';
    if (cliente.citas_count >= 10) return 'vip';
    if (cliente.citas_count >= 3) return 'habitual';
    return 'nuevo';
  }

  const clientesFiltrados = clientes.filter((cli: Cliente) => {
    const clasificacion = clasificar(cli);
    if (filtro !== 'todos' && filtro !== clasificacion) return false;
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

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: tokens.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={tokens.primary} size="large" />
      </View>
    );
  }

  if (isDesktop) {
    return <ClientesDesktop
      clientes={clientes}
      clientesFiltrados={clientesFiltrados}
      searchText={searchText}
      setSearchText={setSearchText}
      filtro={filtro}
      setFiltro={setFiltro}
      clasificar={clasificar}
      selectedClientId={selectedClientId}
      setSelectedClientId={setSelectedClientId}
      insets={insets}
    />;
  }

  return <ClientesMobile
    clientesFiltrados={clientesFiltrados}
    searchText={searchText}
    setSearchText={setSearchText}
    filtro={filtro}
    setFiltro={setFiltro}
    clasificar={clasificar}
    insets={insets}
  />;
}

function ClientesDesktop({
  clientes,
  clientesFiltrados,
  searchText,
  setSearchText,
  filtro,
  setFiltro,
  clasificar,
  selectedClientId,
  setSelectedClientId,
  insets,
}: any) {
  const selectedCliente = clientes.find((c: Cliente) => c.id === selectedClientId);

  const filtroLabels = { todos: 'Todos', vip: 'VIP', habituales: 'Habituales', nuevos: 'Nuevos', inactivos: 'Inactivos' };
  const filtroColors = { todos: tokens.primary, vip: '#f59e0b', habituales: tokens.primary, nuevos: tokens.success, inactivos: tokens.textTertiary };
  const clasificacionColors = { vip: '#f59e0b', habitual: tokens.primary, nuevo: tokens.success, inactivo: tokens.textTertiary };
  const clasificacionLabels = { vip: 'VIP', habitual: 'Habitual', nuevo: 'Nuevo', inactivo: 'Inactivo' };

  return (
    <View style={[s.root, { backgroundColor: tokens.bg }]}>
      {/* Topbar */}
      <View style={[s.desktopTopbar, { paddingTop: insets.top + tokens.spacing.lg }]}>
        <View>
          <Text style={s.title}>Clientes</Text>
          <Text style={s.subtitle}>{clientes.length} clientes activos · 23 nuevos este mes</Text>
        </View>
      </View>

      <View style={s.desktopContent}>
        {/* Left: List */}
        <ScrollView style={s.desktopList}>
          {/* Search */}
          <View style={[s.searchBox, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
            <Ionicons name="search-outline" size={16} color={tokens.textTertiary} />
            <TextInput
              style={[s.searchInput, { color: tokens.text }]}
              placeholder="Buscar por nombre, teléfono o email…"
              placeholderTextColor={tokens.textTertiary}
              value={searchText}
              onChangeText={setSearchText}
            />
            <Text style={s.searchResult}>{clientesFiltrados.length} resultados</Text>
          </View>

          {/* Filters */}
          <View style={s.filterChips}>
            {Object.entries(filtroLabels).map(([key, label]: [string, string]) => {
              const typedKey = key as 'todos' | 'vip' | 'habituales' | 'nuevos' | 'inactivos';
              const count = key === 'todos' ? clientes.length :
                clientes.filter((c: Cliente) => clasificar(c) === key).length;
              const color = filtroColors[typedKey];
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    s.filterChip,
                    { borderColor: filtro === typedKey ? `${color}55` : tokens.border },
                    filtro === typedKey && { backgroundColor: `${color}22` },
                  ]}
                  onPress={() => setFiltro(typedKey)}
                >
                  <Text style={[s.filterChipText, { color: filtro === typedKey ? color : tokens.textSecondary }]}>
                    {label}
                  </Text>
                  <View style={[s.filterChipCount, { backgroundColor: filtro === typedKey ? `${color}33` : `${tokens.border}44` }]}>
                    <Text style={[s.filterChipCountText, { color: filtro === typedKey ? color : tokens.textTertiary }]}>
                      {count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Table */}
          <View style={[s.table, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
            <View style={[s.tableHeader, { backgroundColor: `${tokens.primary}08`, borderBottomColor: tokens.border }]}>
              <Text style={[s.tableHeaderCell, { flex: 2 }]}>Cliente</Text>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>Última visita</Text>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>Total gastado</Text>
              <Text style={[s.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Visitas</Text>
              <View style={{ width: 32 }} />
            </View>

            {clientesFiltrados.length === 0 ? (
              <View style={s.tableEmpty}>
                <Text style={s.tableEmptyText}>No hay resultados</Text>
              </View>
            ) : (
              clientesFiltrados.map((cli: Cliente, idx: number) => {
                const isSelected = cli.id === selectedClientId;
                const clasificacion = clasificar(cli);
                const label = clasificacionLabels[clasificacion as keyof typeof clasificacionLabels];
                const color = clasificacionColors[clasificacion as keyof typeof clasificacionColors];

                return (
                  <TouchableOpacity
                    key={cli.id}
                    style={[
                      s.tableRow,
                      { backgroundColor: isSelected ? `${tokens.primary}0d` : 'transparent' },
                      idx < clientesFiltrados.length - 1 && { borderBottomColor: tokens.border },
                    ]}
                    onPress={() => setSelectedClientId(cli.id)}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
                      <Avatar name={cli.nombre} />
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                          <Text style={s.tableClientName}>{cli.nombre}</Text>
                          <View style={[s.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                            <Text style={[s.badgeText, { color }]}>{label}</Text>
                          </View>
                        </View>
                        <Text style={s.tableClientPhone}>{cli.telefono}</Text>
                      </View>
                    </View>
                    <Text style={s.tableCell}>
                      {cli.ultima_cita ? new Date(cli.ultima_cita).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }) : '-'}
                    </Text>
                    <Text style={[s.tableCell, { color: tokens.success }]}>€{cli.total_gastado || 0}</Text>
                    <Text style={[s.tableCell, { flex: 0.8, textAlign: 'right' }]}>{cli.citas_count || 0}</Text>
                    <View style={{ width: 32, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="ellipsis-vertical" size={16} color={tokens.textTertiary} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Right: Detail panel */}
        {selectedCliente ? (
          <ScrollView style={[s.desktopPanel, { backgroundColor: `${tokens.primary}08`, borderLeftColor: tokens.border }]}>
            <View style={s.panelContent}>
              {/* Profile */}
              <View style={s.profileSection}>
                <Avatar name={selectedCliente.nombre} size={72} />
                <Text style={s.profileName}>{selectedCliente.nombre}</Text>
                <Text style={s.profilePhone}>{selectedCliente.telefono}</Text>
              </View>

              {/* Stats */}
              <View style={s.statsGrid}>
                <StatCard label="Visitas" value={selectedCliente.citas_count || 0} color={tokens.primary} />
                <StatCard label="Total" value={`€${selectedCliente.total_gastado || 0}`} color={tokens.success} />
                <StatCard
                  label="Ticket medio"
                  value={selectedCliente.citas_count ? `€${Math.round((selectedCliente.total_gastado || 0) / selectedCliente.citas_count)}` : '-'}
                  color={tokens.warning}
                />
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function ClientesMobile({
  clientesFiltrados,
  searchText,
  setSearchText,
  filtro,
  setFiltro,
  clasificar,
  insets,
}: any) {
  const filtroLabels = { todos: 'Todos', vip: 'VIP', habituales: 'Habituales', nuevos: 'Nuevos', inactivos: 'Inactivos' };
  const clasificacionColors = { vip: '#f59e0b', habitual: tokens.primary, nuevo: tokens.success, inactivo: tokens.textTertiary };
  const clasificacionLabels = { vip: 'VIP', habitual: 'Habitual', nuevo: 'Nuevo', inactivo: 'Inactivo' };

  return (
    <ScrollView style={[s.root, { backgroundColor: tokens.bg }]} showsVerticalScrollIndicator={false}>
      <View style={[s.mobileContainer, { paddingTop: insets.top + tokens.spacing.lg }]}>
        {/* Header */}
        <View style={s.mobileHeader}>
          <View>
            <Text style={s.title}>Clientes</Text>
          </View>
          <TouchableOpacity style={s.fab}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchBox, { backgroundColor: tokens.bgCard, borderColor: tokens.border, marginBottom: tokens.spacing.md }]}>
          <Ionicons name="search-outline" size={16} color={tokens.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: tokens.text }]}
            placeholder="Buscar cliente…"
            placeholderTextColor={tokens.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.mobileFilterChips}>
          {Object.entries(filtroLabels).map(([key, label]: [string, string]) => {
            const typedKey = key as 'todos' | 'vip' | 'habituales' | 'nuevos' | 'inactivos';
            return (
              <TouchableOpacity
                key={key}
                style={[
                  s.mobileFilterChip,
                  filtro === typedKey && { backgroundColor: tokens.primary },
                ]}
                onPress={() => setFiltro(typedKey)}
              >
                <Text style={[s.mobileFilterChipText, filtro === typedKey && { color: '#fff' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* List */}
        {clientesFiltrados.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="people-outline" size={48} color={tokens.textTertiary} />
            <Text style={s.emptyStateTitle}>Sin clientes</Text>
            <Text style={s.emptyStateSubtitle}>No hay resultados para tu búsqueda</Text>
          </View>
        ) : (
          <View style={{ gap: tokens.spacing.md, paddingBottom: tokens.spacing.xxl }}>
            {clientesFiltrados.map((cli: Cliente) => {
              const clasificacion = clasificar(cli);
              const label = clasificacionLabels[clasificacion as keyof typeof clasificacionLabels];
              const color = clasificacionColors[clasificacion as keyof typeof clasificacionColors];

              return (
                <TouchableOpacity
                  key={cli.id}
                  style={[s.mobileClientCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}
                >
                  <Avatar name={cli.nombre} size={42} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                      <Text style={s.mobileClientName}>{cli.nombre}</Text>
                      <View style={[s.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                        <Text style={[s.badgeText, { color }]}>{label}</Text>
                      </View>
                    </View>
                    <Text style={s.mobileClientPhone}>{cli.telefono}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.mobileClientTotal}>€{cli.total_gastado || 0}</Text>
                    <Text style={s.mobileClientVisits}>{cli.citas_count || 0} visitas</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Avatar({ name, size = 38 }: any) {
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: `hsl(${hue}, 70%, 55%)`,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <View style={[s.statCard, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
      <Text style={s.statCardLabel}>{label}</Text>
      <Text style={[s.statCardValue, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },

  // Desktop
  desktopTopbar: {
    paddingHorizontal: tokens.spacing.xxl,
    paddingVertical: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
  },
  title: { fontSize: tokens.fontSize.xxxl, fontWeight: '700', color: tokens.text, marginBottom: tokens.spacing.xs },
  subtitle: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary },

  desktopContent: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  desktopList: { flex: 1, paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.lg },
  desktopPanel: { width: 380, borderLeftWidth: 1, paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.lg },
  panelContent: { gap: tokens.spacing.xl },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.lg, borderWidth: 1, marginBottom: tokens.spacing.lg },
  searchInput: { flex: 1, fontSize: tokens.fontSize.sm },
  searchResult: { fontSize: tokens.fontSize.xs, color: tokens.textTertiary },

  filterChips: { flexDirection: 'row', gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg, flexWrap: 'wrap' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.full, borderWidth: 1 },
  filterChipText: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  filterChipCount: { paddingHorizontal: tokens.spacing.sm, paddingVertical: 2, borderRadius: tokens.radius.md },
  filterChipCountText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },

  table: { borderRadius: tokens.radius.lg, borderWidth: 1, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, alignItems: 'center' },
  tableHeaderCell: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderBottomWidth: 1, alignItems: 'center' },
  tableCell: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary },
  tableClientName: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.text },
  tableClientPhone: { fontSize: tokens.fontSize.xs, color: tokens.textTertiary, marginTop: tokens.spacing.xs },
  tableEmpty: { paddingVertical: tokens.spacing.xxl, alignItems: 'center' },
  tableEmptyText: { fontSize: tokens.fontSize.sm, color: tokens.textTertiary },

  badge: { paddingHorizontal: tokens.spacing.sm, paddingVertical: 2, borderRadius: tokens.radius.md, borderWidth: 1 },
  badgeText: { fontSize: tokens.fontSize.xs, fontWeight: '600' },

  profileSection: { alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.lg, borderBottomWidth: 1, borderBottomColor: tokens.border, marginBottom: tokens.spacing.lg },
  profileName: { fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.text },
  profilePhone: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary },

  statsGrid: { flexDirection: 'row', gap: tokens.spacing.md },
  statCard: { flex: 1, borderRadius: tokens.radius.lg, borderWidth: 1, padding: tokens.spacing.md, alignItems: 'center' },
  statCardLabel: { fontSize: tokens.fontSize.xs, fontWeight: '600', color: tokens.textTertiary, textTransform: 'uppercase' },
  statCardValue: { fontSize: tokens.fontSize.lg, fontWeight: '700', marginTop: tokens.spacing.sm },

  // Mobile
  mobileContainer: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.lg },
  mobileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.lg },
  fab: { width: 36, height: 36, borderRadius: 12, backgroundColor: tokens.primary, justifyContent: 'center', alignItems: 'center' },

  mobileFilterChips: { marginBottom: tokens.spacing.lg, paddingBottom: tokens.spacing.md },
  mobileFilterChip: { paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.full, backgroundColor: tokens.bgCard, marginRight: tokens.spacing.sm, borderWidth: 1, borderColor: tokens.border },
  mobileFilterChipText: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.textSecondary },

  mobileClientCard: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.lg, borderWidth: 1 },
  mobileClientName: { fontSize: tokens.fontSize.sm, fontWeight: '600', color: tokens.text },
  mobileClientPhone: { fontSize: tokens.fontSize.xs, color: tokens.textTertiary, marginTop: tokens.spacing.xs },
  mobileClientTotal: { fontSize: tokens.fontSize.sm, fontWeight: '700', color: tokens.success },
  mobileClientVisits: { fontSize: tokens.fontSize.xs, color: tokens.textTertiary },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: tokens.spacing.xxl, gap: tokens.spacing.lg },
  emptyStateTitle: { fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.text },
  emptyStateSubtitle: { fontSize: tokens.fontSize.sm, color: tokens.textSecondary, textAlign: 'center' },
});
