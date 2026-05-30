import { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/lib/theme';
import { DESIGN_TOKENS, STATUS_META } from '@/lib/designTokens';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { Topbar, Card, Input, EmptyState, Loading } from '@/components/ui/DesignComponents';
import { TText } from '@/components/ui/TText';

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
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'vip' | 'habituales' | 'nuevos' | 'inactivos'>('todos');
  const [negocioId, setNegocioId] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);

    const { data: clts } = await supabase
      .from('clientes')
      .select(
        `id, nombre, telefono, email, negocio_id,
         citas(id, estado, inicio)
        `
      )
      .eq('negocio_id', profile.negocio_id)
      .order('nombre');

    // Procesar y enriquecer datos
    const procesados = (clts ?? []).map((cli: any) => {
      const citas = cli.citas || [];
      const citasCount = citas.length;
      const ultimaCita = citas.sort((a: any, b: any) =>
        new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
      )[0]?.inicio;

      return {
        id: cli.id,
        nombre: cli.nombre,
        telefono: cli.telefono,
        email: cli.email,
        negocio_id: cli.negocio_id,
        citas_count: citasCount,
        ultima_cita: ultimaCita,
      };
    });

    setClientes(procesados);
    setLoading(false);
  }

  function clasificar(cliente: Cliente): 'vip' | 'habitual' | 'nuevo' | 'inactivo' {
    if (!cliente.citas_count) return 'inactivo';
    if (cliente.citas_count >= 10) return 'vip';
    if (cliente.citas_count >= 3) return 'habitual';
    return 'nuevo';
  }

  const clientesFiltrados = clientes.filter(cli => {
    const clasificacion = clasificar(cli);

    // Filtro por categoría
    if (filtro !== 'todos' && filtro !== clasificacion) return false;

    // Filtro por búsqueda
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

  const labels = { vip: 'VIP', habitual: 'Habitual', nuevo: 'Nuevo', inactivo: 'Inactivo' };
  const colors = { vip: '#f59e0b', habitual: '#6366f1', nuevo: '#10b981', inactivo: '#94a3b8' };

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Topbar title="Clientes" subtitle={`${clientes.length} clientes registrados`} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Search */}
        <View style={s.section}>
          <Input
            placeholder="Buscar por nombre, teléfono o email…"
            value={searchText}
            onChangeText={setSearchText}
            icon={<Ionicons name="search-outline" size={16} color={tokens.textTertiary} />}
          />
        </View>

        {/* Filtros */}
        <View style={s.filters}>
          {['todos', 'vip', 'habituales', 'nuevos', 'inactivos'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                s.filterBtn,
                {
                  backgroundColor: filtro === f ? tokens.primary : tokens.bgCard,
                  borderColor: filtro === f ? tokens.primary : tokens.border,
                },
              ]}
              onPress={() => setFiltro(f as any)}
            >
              <TText
                style={[
                  s.filterBtnText,
                  { color: filtro === f ? '#fff' : tokens.textSecondary },
                ]}
              >
                {f === 'todos' ? 'Todos' : f === 'vip' ? 'VIP' : f === 'habituales' ? 'Habituales' : f === 'nuevos' ? 'Nuevos' : 'Inactivos'}
              </TText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lista de clientes */}
        {loading ? (
          <Loading />
        ) : clientesFiltrados.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Sin clientes"
            subtitle={searchText ? 'No hay resultados para tu búsqueda' : 'No tienes clientes registrados'}
          />
        ) : (
          <View style={s.clientesList}>
            {clientesFiltrados.map((cli) => {
              const clasificacion = clasificar(cli);
              const label = labels[clasificacion];
              const color = colors[clasificacion];

              return (
                <Card key={cli.id} style={s.clienteCard}>
                  <View style={s.clienteHeader}>
                    <View style={s.clienteInfo}>
                      <TText style={[s.clienteNombre, { color: c.text }]}>{cli.nombre}</TText>
                      {cli.telefono && (
                        <TText style={[s.clienteContacto, { color: c.textSecondary }]}>
                          <Ionicons name="call-outline" size={12} /> {cli.telefono}
                        </TText>
                      )}
                      {cli.email && (
                        <TText style={[s.clienteContacto, { color: c.textSecondary }]}>
                          <Ionicons name="mail-outline" size={12} /> {cli.email}
                        </TText>
                      )}
                    </View>
                    <View
                      style={[
                        s.badge,
                        {
                          backgroundColor: `${color}22`,
                          borderColor: `${color}55`,
                        },
                      ]}
                    >
                      <TText style={[s.badgeText, { color }]}>{label}</TText>
                    </View>
                  </View>

                  <View style={[s.clienteFooter, { borderTopColor: tokens.border }]}>
                    <View style={s.stat}>
                      <TText style={[s.statLabel, { color: c.textTertiary }]}>Citas</TText>
                      <TText style={[s.statValue, { color: c.text }]}>{cli.citas_count || 0}</TText>
                    </View>
                    {cli.ultima_cita && (
                      <View style={s.stat}>
                        <TText style={[s.statLabel, { color: c.textTertiary }]}>Última cita</TText>
                        <TText style={[s.statValue, { color: c.text }]}>
                          {new Date(cli.ultima_cita).toLocaleDateString('es-ES', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TText>
                      </View>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  section: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.sm,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
  },
  filterBtnText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '500',
  },
  clientesList: {
    paddingHorizontal: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  clienteCard: {
    gap: tokens.spacing.md,
  },
  clienteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clienteInfo: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  clienteNombre: {
    fontSize: tokens.fontSize.base,
    fontWeight: '600',
  },
  clienteContacto: {
    fontSize: tokens.fontSize.xs,
    marginTop: tokens.spacing.xs / 2,
  },
  badge: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: '600',
  },
  clienteFooter: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.lg,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: tokens.fontSize.xs,
    marginBottom: tokens.spacing.xs / 2,
  },
  statValue: {
    fontSize: tokens.fontSize.base,
    fontWeight: '600',
  },
});
