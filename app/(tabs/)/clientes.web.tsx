import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const tokens = DESIGN_TOKENS;

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  citas_count?: number;
  ultima_cita?: string;
  total_gastado?: number;
}

export default function ClientesWeb() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);

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
      .select(`id, nombre, telefono, email, citas(id, inicio, servicios(precio))`)
      .eq('negocio_id', profile.negocio_id)
      .order('nombre');

    const procesados = (clts ?? []).map((cli: any) => {
      const citas = cli.citas || [];
      return {
        id: cli.id,
        nombre: cli.nombre,
        telefono: cli.telefono,
        email: cli.email,
        citas_count: citas.length,
        ultima_cita: citas.sort((a: any, b: any) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0]?.inicio,
        total_gastado: citas.reduce((sum: number, c: any) => sum + (c.servicios?.precio ?? 0), 0),
      };
    });

    setClientes(procesados);
    if (procesados.length > 0) setSelectedCliente(procesados[0]);
    setLoading(false);
  }

  const clasificacion = (cli: Cliente) => {
    if (!cli.citas_count) return 'inactivo';
    if (cli.citas_count >= 10) return 'vip';
    if (cli.citas_count >= 3) return 'habitual';
    return 'nuevo';
  };

  const tagColors = { vip: '#f59e0b', habitual: tokens.primary, nuevo: tokens.success, inactivo: tokens.textTertiary };
  const tagLabels = { vip: 'VIP', habitual: 'Habitual', nuevo: 'Nuevo', inactivo: 'Inactivo' };

  const filtrados = clientes.filter(cli => {
    const tag = clasificacion(cli);
    if (filtro !== 'todos' && filtro !== tag) return false;
    if (searchText && !cli.nombre.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div style={styles.loading}>Cargando...</div>;

  return (
    <div style={styles.root}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <div>
          <h1 style={styles.title}>Clientes</h1>
          <p style={styles.subtitle}>{clientes.length} clientes activos · 23 nuevos este mes</p>
        </div>
        <button style={styles.btnAdd}>+ Nuevo cliente</button>
      </div>

      <div style={styles.content}>
        {/* Left: List */}
        <div style={styles.listSection}>
          {/* Search */}
          <div style={styles.searchBox}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o email…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={styles.searchInput}
            />
            <span style={styles.searchResult}>{filtrados.length} resultados</span>
          </div>

          {/* Filter chips */}
          <div style={styles.filterChips}>
            {[
              { id: 'todos', label: 'Todos', count: clientes.length },
              { id: 'vip', label: 'VIP', count: clientes.filter(c => clasificacion(c) === 'vip').length },
              { id: 'habitual', label: 'Habituales', count: clientes.filter(c => clasificacion(c) === 'habitual').length },
              { id: 'nuevo', label: 'Nuevos', count: clientes.filter(c => clasificacion(c) === 'nuevo').length },
              { id: 'inactivo', label: 'Inactivos', count: clientes.filter(c => clasificacion(c) === 'inactivo').length },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                style={{
                  ...styles.filterChip,
                  background: filtro === f.id ? `${tokens.primary}22` : tokens.bgCard,
                  borderColor: filtro === f.id ? `${tokens.primary}55` : tokens.border,
                  color: filtro === f.id ? tokens.primary : tokens.textSecondary,
                }}
              >
                {f.label}
                <span style={styles.filterCount}>{f.count}</span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <div style={{ flex: 2 }}>Cliente</div>
              <div style={{ flex: 1 }}>Última visita</div>
              <div style={{ flex: 1 }}>Total gastado</div>
              <div style={{ flex: 0.8, textAlign: 'right' }}>Visitas</div>
              <div style={{ width: 32 }} />
            </div>

            {filtrados.map((cli, i) => {
              const tag = clasificacion(cli);
              const isSelected = cli.id === selectedCliente?.id;
              return (
                <div
                  key={cli.id}
                  onClick={() => setSelectedCliente(cli)}
                  style={{
                    ...styles.tableRow,
                    background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderBottom: i < filtrados.length - 1 ? `1px solid ${tokens.border}` : 'none',
                  }}
                >
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={cli.nombre} />
                    <div>
                      <div style={styles.tableName}>{cli.nombre}</div>
                      <div style={{ fontSize: 11, color: tokens.textTertiary, marginTop: 2 }}>
                        {cli.telefono}
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, color: tokens.textSecondary, fontSize: 12 }}>
                    {cli.ultima_cita ? new Date(cli.ultima_cita).toLocaleDateString('es-ES') : '-'}
                  </div>
                  <div style={{ flex: 1, color: tokens.success, fontSize: 13, fontWeight: 600 }}>
                    €{cli.total_gastado || 0}
                  </div>
                  <div style={{ flex: 0.8, textAlign: 'right', fontWeight: 600 }}>
                    {cli.citas_count || 0}
                  </div>
                  <div style={{ width: 32, display: 'flex', justifyContent: 'center', color: tokens.textTertiary }}>⋮</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detail panel */}
        {selectedCliente && (
          <div style={styles.detailPanel}>
            {/* Profile */}
            <div style={styles.profile}>
              <Avatar name={selectedCliente.nombre} size={72} />
              <h2 style={styles.profileName}>{selectedCliente.nombre}</h2>
              <p style={styles.profilePhone}>{selectedCliente.telefono}</p>
            </div>

            {/* Stats */}
            <div style={styles.statsGrid}>
              <StatCard label="Visitas" value={selectedCliente.citas_count || 0} color={tokens.primary} />
              <StatCard label="Total" value={`€${selectedCliente.total_gastado || 0}`} color={tokens.success} />
              <StatCard
                label="Ticket medio"
                value={selectedCliente.citas_count ? `€${Math.round((selectedCliente.total_gastado || 0) / selectedCliente.citas_count)}` : '-'}
                color={tokens.warning}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, size = 38 }: any) {
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `hsl(${hue}, 70%, 55%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <div style={{ ...styles.statCard, borderColor: color }}>
      <div style={{ fontSize: 10, color: tokens.textTertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const styles: any = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: tokens.bg,
    color: tokens.text,
    fontFamily: 'Inter, sans-serif',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: tokens.text,
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 32px',
    borderBottom: `1px solid ${tokens.border}`,
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 8,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    color: tokens.textSecondary,
  },
  btnAdd: {
    padding: '12px 20px',
    background: tokens.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  content: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    overflow: 'hidden',
  },
  listSection: {
    borderRight: `1px solid ${tokens.border}`,
    padding: 24,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '11px 14px',
    background: tokens.bgCard,
    border: `1px solid ${tokens.border}`,
    borderRadius: 12,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: tokens.text,
    fontSize: 13,
  },
  searchResult: {
    fontSize: 11,
    color: tokens.textTertiary,
  },
  filterChips: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgCard,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  filterCount: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 99,
    background: 'rgba(148,163,184,0.10)',
  },
  table: {
    background: tokens.bgCard,
    border: `1px solid ${tokens.border}`,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px',
    padding: '10px 16px',
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.textTertiary,
    fontWeight: 600,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${tokens.border}`,
    background: `rgba(99,102,241,0.04)`,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px',
    padding: '12px 16px',
    alignItems: 'center',
    cursor: 'pointer',
  },
  tableName: {
    fontSize: 13,
    fontWeight: 600,
    color: tokens.text,
  },
  detailPanel: {
    background: `linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)`,
    padding: 24,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  profile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    paddingBottom: 18,
    borderBottom: `1px solid ${tokens.border}`,
  },
  profileName: {
    margin: 0,
    marginTop: 12,
    fontSize: 18,
    fontWeight: 700,
  },
  profilePhone: {
    margin: 0,
    marginTop: 4,
    fontSize: 12,
    color: tokens.textSecondary,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8,
  },
  statCard: {
    background: tokens.bgCard,
    border: `1px solid ${tokens.border}`,
    borderRadius: 10,
    padding: 10,
    textAlign: 'center',
  },
};
