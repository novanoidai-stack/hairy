import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import Clipboard from 'clipboard';

// Iconos SVG simples
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    filter: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    phone: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    trash: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    moreVertical: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// ── Design tokens (exactos del handoff)
const TOKENS = {
  bg: '#0b1220',
  bgPanel: '#0f172a',
  bgCard: '#141f33',
  bgCardHi: '#1a2540',
  border: 'rgba(148,163,184,0.10)',
  borderHi: 'rgba(148,163,184,0.18)',
  text: '#f8fafc',
  textSec: '#94a3b8',
  textTer: '#64748b',
  primary: '#6366f1',
  primaryHi: '#818cf8',
  primarySoft: 'rgba(99,102,241,0.14)',
  primaryGlow: 'rgba(99,102,241,0.45)',
  success: '#10b981',
  successSoft: 'rgba(16,185,129,0.14)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245,158,11,0.14)',
  danger: '#ef4444',
  dangerSoft: 'rgba(239,68,68,0.14)',
  violet: '#8b5cf6',
  violetSoft: 'rgba(139,92,246,0.14)',
  cyan: '#06b6d4',
  cyanSoft: 'rgba(6,182,212,0.14)',
};

const TAGS = { VIP: { color: '#f59e0b' }, Habitual: { color: '#6366f1' }, Nuevo: { color: '#10b981' } };

interface Cita {
  id: string;
  cliente_id: string;
  inicio: string;
  fin: string;
  servicios?: { precio?: number; nombre?: string };
  profesional_id?: string;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  visitas?: number;
  ultimaVisita?: string;
  gastado?: number;
  fav?: string;
  favCount?: number;
  tag?: 'VIP' | 'Habitual' | 'Nuevo';
}

export default function ClientesWeb() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [negocioId, setNegocioId] = useState('');

  useEffect(() => {
    async function cargar() {
      const profile = await getUserProfile();
      if (!profile?.negocio_id) {
        setLoading(false);
        return;
      }

      setNegocioId(profile.negocio_id);

      const [{ data: clts }, { data: citsData }, { data: srvData }] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, nombre, telefono')
          .eq('negocio_id', profile.negocio_id)
          .order('nombre'),
        supabase
          .from('citas')
          .select('id, cliente_id, inicio, fin, servicio_id')
          .eq('negocio_id', profile.negocio_id),
        supabase
          .from('servicios')
          .select('id, nombre, precio')
          .eq('negocio_id', profile.negocio_id),
      ]);

      const enrichedClients = (clts ?? []).map((cl: any) => {
        const clientCitas = (citsData ?? []).filter((c: Cita) => c.cliente_id === cl.id);
        const visitas = clientCitas.length;
        const gastado = clientCitas.reduce((sum, c: Cita) => sum + ((srvData ?? []).find((s: any) => s.id === c.servicio_id)?.precio || 0), 0);
        const ultimaVisita = clientCitas.length > 0
          ? new Date(clientCitas[clientCitas.length - 1].inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          : undefined;

        const serviceCount: Record<string, number> = {};
        clientCitas.forEach((c: Cita) => {
          const sname = (srvData ?? []).find((s: any) => s.id === c.servicio_id)?.nombre || 'Servicio';
          serviceCount[sname] = (serviceCount[sname] || 0) + 1;
        });
        const favEntry = Object.keys(serviceCount).length > 0 ? Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0] : null;
        const fav = favEntry ? favEntry[0] : undefined;
        const favCount = favEntry ? favEntry[1] : 0;

        return { ...cl, visitas, gastado, ultimaVisita, fav, favCount } as Cliente;
      });

      setClientes(enrichedClients);
      setCitas(citsData ?? []);
      if (enrichedClients.length > 0) setSelected(enrichedClients[0].id);
      setLoading(false);
    }
    cargar();
  }, []);

  const c = clientes.find((x) => x.id === selected);
  if (!c && clientes.length > 0) {
    setSelected(clientes[0].id);
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: TOKENS.text }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Clientes</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>{clientes.length} clientes activos</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="filter" size={16} color={TOKENS.text} />
            Filtros
          </button>
          <button onClick={() => setShowNewCliente(true)} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="#fff" />
            Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', overflow: 'hidden' }}>
        {/* List */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '11px 14px', marginBottom: 16 }}>
            <Icon name="search" size={16} color={TOKENS.textSec} />
            <input placeholder="Buscar por nombre, teléfono o email…" value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TOKENS.text, fontSize: 13 }} />
            <span style={{ fontSize: 11, color: TOKENS.textTer }}>{clientes.length} resultados</span>
          </div>

          {/* Tag chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { l: 'Todos', n: clientes.length, active: true, color: TOKENS.primary },
              { l: 'VIP', n: clientes.filter((cl) => (cl.visitas || 0) > 10 || (cl.gastado || 0) > 500).length, color: '#f59e0b' },
              { l: 'Habituales', n: clientes.filter((cl) => (cl.visitas || 0) >= 5 && (cl.visitas || 0) <= 10).length, color: TOKENS.primary },
              { l: 'Nuevos', n: clientes.filter((cl) => (cl.visitas || 0) < 5 && (cl.visitas || 0) > 0).length, color: TOKENS.success },
            ].map((t, i) => (
              <button
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 12px',
                  borderRadius: 999,
                  background: t.active ? `${t.color}22` : TOKENS.bgCard,
                  border: `1px solid ${t.active ? `${t.color}55` : TOKENS.border}`,
                  color: t.active ? t.color : TOKENS.textSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>{t.l}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: t.active ? `${t.color}44` : 'rgba(148,163,184,0.10)', color: t.active ? t.color : TOKENS.textSec }}>
                  {t.n}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px', padding: '10px 16px', fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(99,102,241,0.04)' }}>
              <div>Cliente</div>
              <div>Última visita</div>
              <div>Total gastado</div>
              <div style={{ textAlign: 'right' }}>Visitas</div>
              <div />
            </div>
            {clientes.map((cl, i) => {
              const tagMeta = TAGS[cl.tag as keyof typeof TAGS] || { color: TOKENS.textTer };
              const isSel = cl.id === selected;
              return (
                <div
                  key={cl.id}
                  onClick={() => setSelected(cl.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px',
                    padding: '12px 16px',
                    borderBottom: i < clientes.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isSel ? 'rgba(99,102,241,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={cl.nombre} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{cl.nombre}</div>
                        <Pill color={tagMeta.color}>{cl.tag}</Pill>
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>{cl.telefono}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textSec }}>{cl.ultimaVisita}</div>
                  <div style={{ fontSize: 13, color: TOKENS.success, fontWeight: 600 }}>{cl.gastado} €</div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: TOKENS.text, fontWeight: 600 }}>{cl.visitas}</div>
                  <div style={{ color: TOKENS.textTer, display: 'grid', placeItems: 'center' }}>
                    <Icon name="moreVertical" size={16} color={TOKENS.textTer} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        {c && (
          <div style={{ borderLeft: `1px solid ${TOKENS.border}`, padding: 24, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)' }}>
            {/* Profile head */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 18 }}>
              <Avatar name={c.nombre} size={72} />
              <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>{c.nombre}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: TOKENS.textSec }}>{c.telefono}</div>
              <div style={{ marginTop: 8 }}>
                <Pill color={TAGS[c.tag as keyof typeof TAGS]?.color || TOKENS.textTer}>
                  ⭐ {c.tag} · Cliente desde 2023
                </Pill>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
              {[
                { l: 'Reservar', icon: 'calendar', p: true, action: () => console.log('Crear reserva para', c.nombre) },
                { l: 'Llamar', icon: 'phone', action: () => window.location.href = `tel:${c.telefono}` },
                { l: 'Editar', icon: 'edit', action: () => console.log('Editar cliente', c.nombre) },
              ].map((a, i) => (
                <button
                  key={i}
                  onClick={a.action}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 8px',
                    background: a.p ? 'linear-gradient(180deg,#7c83ff,#6366f1)' : TOKENS.bgCard,
                    border: a.p ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${TOKENS.border}`,
                    borderRadius: 12,
                    color: a.p ? '#fff' : TOKENS.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: a.p ? '0 4px 14px rgba(99,102,241,0.4)' : 'none',
                  }}
                >
                  <Icon name={a.icon} size={18} color={a.p ? '#fff' : TOKENS.text} />
                  <span>{a.l}</span>
                </button>
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
              <MiniStat label="Visitas" value={c.visitas} tone={TOKENS.primary} />
              <MiniStat label="Total" value={`${c.gastado}€`} tone={TOKENS.success} />
              <MiniStat label="Ticket medio" value={`${Math.round((c.gastado || 0) / (c.visitas || 1))}€`} tone={TOKENS.warning} />
            </div>

            {/* Servicios favoritos */}
            {c.fav && (
              <Section title="Servicio preferido">
                <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.fav}</div>
                    <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>Solicitado {c.favCount} veces</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.14)', color: '#f59e0b', display: 'grid', placeItems: 'center', fontSize: 18 }}>⭐</div>
                </div>
              </Section>
            )}

            {/* Próxima cita */}
            <Section title="Próxima cita">
              {(() => {
                const now = new Date();
                const nextCita = citas
                  .filter((cit) => cit.cliente_id === c.id && new Date(cit.inicio) > now)
                  .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

                if (!nextCita) {
                  return <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin citas próximas</div>;
                }

                const citaDate = new Date(nextCita.inicio);
                const dateStr = citaDate.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
                const srv = (srvData ?? []).find((s: any) => s.id === nextCita.servicio_id);
                const serviceName = srv?.nombre || 'Servicio';
                const price = srv?.precio || '-';
                const duration = Math.round((new Date(nextCita.fin).getTime() - new Date(nextCita.inicio).getTime()) / 60000);

                return (
                  <div style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))', border: `1px solid rgba(99,102,241,0.30)`, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.primaryHi, letterSpacing: 0.4 }}>{dateStr}</span>
                      <Pill color={TOKENS.primary}>Programada</Pill>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{serviceName}</div>
                    <div style={{ fontSize: 11, color: TOKENS.textSec, marginTop: 2 }}>{duration} min · {price} €</div>
                  </div>
                );
              })()}
            </Section>

            {/* Historial */}
            <Section title="Historial reciente">
              {(() => {
                const clientCitas = citas
                  .filter((cit) => cit.cliente_id === c.id)
                  .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())
                  .slice(0, 5);

                if (clientCitas.length === 0) {
                  return <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin historial</div>;
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clientCitas.map((h, i) => {
                      const fecha = new Date(h.inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
                      const serviceName = (h.servicios as any)?.nombre || 'Servicio';
                      const precio = (h.servicios as any)?.precio || '-';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10 }}>
                          <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: TOKENS.success }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{serviceName}</div>
                            <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>{fecha}</div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.success }}>{precio} €</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Section>
          </div>
        )}
      </div>

      {showNewCliente && <NewClienteModal onClose={() => setShowNewCliente(false)} negocioId={negocioId} onCreated={() => { setShowNewCliente(false); location.reload(); }} />}
    </div>
  );
}

// ── Component: NewClienteModal
function NewClienteModal({ onClose, negocioId, onCreated }: any) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      alert('Por favor ingresa el nombre del cliente');
      return;
    }

    setLoading(true);
    try {
      await supabase.from('clientes').insert({
        negocio_id: negocioId,
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
      });

      onCreated();
    } catch (error) {
      console.error('Error creando cliente:', error);
      alert('Error al crear el cliente');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: 420, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>Nuevo cliente</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Nombre*</div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María García"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Teléfono (opcional)</div>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+34 611 234 567"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: TOKENS.bgCard,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 10,
                color: TOKENS.text,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 14px',
              background: TOKENS.bgCard,
              border: `1px solid ${TOKENS.border}`,
              color: TOKENS.text,
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={loading}
            style={{
              padding: '9px 14px',
              background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: `0 6px 20px ${TOKENS.primaryGlow}`,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Guardando...' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component: Avatar
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
        borderRadius: 999,
        background: `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 30) % 360} 70% 50%))`,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.36,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── Component: Pill
function Pill({ children, color = TOKENS.primary }: any) {
  const bg = `${color}22`;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 999,
        background: bg,
        color: color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        border: `1px solid ${color}33`,
      }}
    >
      {children}
    </span>
  );
}

// ── Component: MiniStat
function MiniStat({ label, value, tone }: any) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Component: Section
function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
