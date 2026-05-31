import { useEffect, useMemo, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useCalendarRefresh } from '@/lib/calendarContext';

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
    star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    cake: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`,
    clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    sparkle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4L12 3z"/></svg>`,
    droplet: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
    chevronLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    maximize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    minimize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// Design tokens
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

// Normalizar texto: quitar tildes para busquedas sin discriminar acentos
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Umbral para alerta de inactividad
const INACTIVIDAD_DIAS = 90;

interface Cita {
  id: string;
  cliente_id: string;
  inicio: string;
  fin: string;
  estado?: string;
  servicio_id?: string;
  profesional_id?: string;
  notas?: string | null;
  formula_producto?: string | null;
  formula_tono?: string | null;
  formula_tiempo_min?: number | null;
  formula_resultado?: string | null;
  formula_notas?: string | null;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  fecha_nacimiento?: string | null;
  // Alergias del cliente. Se persiste en la columna alergias de BD.
  alergias?: string | null;
  visitas?: number;
  ultimaVisita?: Date | null;
  ultimaVisitaStr?: string;
  primeraVisita?: Date | null;
  gastado?: number;
  fav?: string;
  favCount?: number;
  tag?: 'VIP' | 'Habitual' | 'Nuevo';
}

type Tab = 'resumen' | 'notas' | 'color' | 'historial';

// Calcula el tag a partir de visitas y gasto total
function computeTag(visitas: number, gastado: number): 'VIP' | 'Habitual' | 'Nuevo' {
  if (visitas > 10 || gastado > 500) return 'VIP';
  if (visitas >= 3) return 'Habitual';
  return 'Nuevo';
}

// Alertas que se muestran en el panel detalle
type Alert = {
  type: 'allergy' | 'inactive' | 'birthday' | 'new';
  message: string;
  color: string;
  icon: string;
  bg: string;
  border: string;
};

function computeAlerts(cl: Cliente): Alert[] {
  const alerts: Alert[] = [];

  // Alergias: cualquier contenido en alergias (campo dedicado a alergias)
  const alergiasTexto = (cl.alergias ?? '').trim();
  if (alergiasTexto.length > 0) {
    const preview = alergiasTexto.length > 90 ? alergiasTexto.slice(0, 90) + '...' : alergiasTexto;
    alerts.push({
      type: 'allergy',
      message: `Alergias: ${preview}`,
      color: TOKENS.danger,
      bg: TOKENS.dangerSoft,
      border: 'rgba(239,68,68,0.35)',
      icon: 'alert',
    });
  }

  // Inactividad (amarillo)
  if (cl.ultimaVisita && (cl.visitas || 0) > 0) {
    const dias = Math.floor((Date.now() - cl.ultimaVisita.getTime()) / 86400000);
    if (dias > INACTIVIDAD_DIAS) {
      alerts.push({
        type: 'inactive',
        message: `Sin visita desde hace ${dias} dias`,
        color: TOKENS.warning,
        bg: TOKENS.warningSoft,
        border: 'rgba(245,158,11,0.30)',
        icon: 'clock',
      });
    }
  }

  // Cumpleanos (naranja claro)
  if (cl.fecha_nacimiento) {
    const fn = new Date(cl.fecha_nacimiento);
    if (!isNaN(fn.getTime())) {
      const today = new Date();
      const thisYear = new Date(today.getFullYear(), fn.getMonth(), fn.getDate());
      let diff = Math.ceil((thisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
      if (diff < 0) {
        const nextYear = new Date(today.getFullYear() + 1, fn.getMonth(), fn.getDate());
        diff = Math.ceil((nextYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
      }
      if (diff >= 0 && diff <= 7) {
        const fechaFmt = fn.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' });
        const msg = diff === 0 ? `Cumple hoy (${fechaFmt})` : diff === 1 ? `Cumple manana (${fechaFmt})` : `Cumple en ${diff} dias (${fechaFmt})`;
        alerts.push({
          type: 'birthday',
          message: msg,
          color: '#fb923c',
          bg: 'rgba(251,146,60,0.14)',
          border: 'rgba(251,146,60,0.30)',
          icon: 'cake',
        });
      }
    }
  }

  // Cliente nuevo sin historial (verde)
  if ((cl.visitas || 0) === 0) {
    alerts.push({
      type: 'new',
      message: 'Primera vez aqui',
      color: TOKENS.success,
      bg: TOKENS.successSoft,
      border: 'rgba(16,185,129,0.30)',
      icon: 'sparkle',
    });
  }

  return alerts;
}

export default function ClientesWeb() {
  const params = useLocalSearchParams<{ clienteId?: string }>();
  const { refreshTrigger, triggerRefresh } = useCalendarRefresh();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [negocioId, setNegocioId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const [activeTagFilter, setActiveTagFilter] = useState<'Todos' | 'VIP' | 'Habitual' | 'Nuevo'>('Todos');
  const [panelExpanded, setPanelExpanded] = useState(false);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);

    const [{ data: clts }, { data: citsData }, { data: srvData }, { data: profData }, { data: fichasData }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, telefono, email, fecha_nacimiento, alergias, canal_preferido, bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, frecuencia_dias')
        .eq('negocio_id', profile.negocio_id)
        .order('nombre'),
      supabase
        .from('citas')
        .select('id, cliente_id, inicio, fin, estado, servicio_id, profesional_id, notas, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('servicios')
        .select('id, nombre, precio')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('profesionales')
        .select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('fichas_tecnicas_color')
        .select('*')
        .eq('negocio_id', profile.negocio_id)
        .order('created_at', { ascending: false }),
    ]);

    const enrichedClients = (clts ?? []).map((cl: any) => {
      const clientCitas = (citsData ?? []).filter((c: Cita) => c.cliente_id === cl.id);
      const sortedAsc = [...clientCitas].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
      const visitas = clientCitas.length;
      const gastado = clientCitas.reduce((sum, c: Cita) => sum + ((srvData ?? []).find((s: any) => s.id === c.servicio_id)?.precio || 0), 0);
      const ultimaVisita = sortedAsc.length > 0 ? new Date(sortedAsc[sortedAsc.length - 1].inicio) : null;
      const primeraVisita = sortedAsc.length > 0 ? new Date(sortedAsc[0].inicio) : null;
      const ultimaVisitaStr = ultimaVisita
        ? ultimaVisita.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';

      const serviceCount: Record<string, number> = {};
      clientCitas.forEach((c: Cita) => {
        const sname = (srvData ?? []).find((s: any) => s.id === c.servicio_id)?.nombre || 'Servicio';
        serviceCount[sname] = (serviceCount[sname] || 0) + 1;
      });
      const favEntry = Object.keys(serviceCount).length > 0 ? Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0] : null;
      const fav = favEntry ? favEntry[0] : undefined;
      const favCount = favEntry ? favEntry[1] : 0;
      const tag = computeTag(visitas, gastado);

      return { ...cl, visitas, gastado, ultimaVisita, primeraVisita, ultimaVisitaStr, fav, favCount, tag } as Cliente;
    });

    setClientes(enrichedClients);
    setCitas(citsData ?? []);
    setServicios(srvData ?? []);
    setProfesionales(profData ?? []);
    setFichasTecnicas(fichasData ?? []);
    // Si llega clienteId por URL, pre-seleccionar ese; si no, el primero
    const targetId = (params?.clienteId as string | undefined) || null;
    if (targetId && enrichedClients.find((cl) => cl.id === targetId)) {
      setSelected(targetId);
    } else if (enrichedClients.length > 0 && !selected) {
      setSelected(enrichedClients[0].id);
    }
    setLoading(false);
  }

  // Recarga al montar y cada vez que algo dispara el refresh global
  // (p.ej. al guardar/editar una cita en la agenda)
  useEffect(() => { cargar(); }, [refreshTrigger]);

  // Si cambia el clienteId del URL, sincronizar la seleccion
  useEffect(() => {
    const id = params?.clienteId as string | undefined;
    if (id && clientes.find((cl) => cl.id === id)) {
      setSelected(id);
      setActiveTab('resumen');
    }
  }, [params?.clienteId, clientes]);

  const c = clientes.find((x) => x.id === selected) || null;
  const alerts = useMemo(() => (c ? computeAlerts(c) : []), [c]);

  const visibleClientes = useMemo(() => {
    let list = clientes;
    const q = norm(searchText.trim());
    if (q) {
      list = list.filter((cl) =>
        norm(cl.nombre).includes(q) ||
        (cl.telefono ?? '').includes(q) ||
        norm(cl.email ?? '').includes(q)
      );
    }
    if (activeTagFilter !== 'Todos') {
      list = list.filter((cl) => cl.tag === activeTagFilter);
    }
    return list;
  }, [clientes, searchText, activeTagFilter]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0b1220', color: TOKENS.text }}>Cargando...</div>;

  const tagCounts = {
    Todos: clientes.length,
    VIP: clientes.filter((x) => x.tag === 'VIP').length,
    Habitual: clientes.filter((x) => x.tag === 'Habitual').length,
    Nuevo: clientes.filter((x) => x.tag === 'Nuevo').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, sans-serif' }}>
      {/* Topbar */}
      <div className="m-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 32px', borderBottom: `1px solid ${TOKENS.border}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>Clientes</h1>
          <p style={{ margin: 0, marginTop: 4, fontSize: 13, color: TOKENS.textSec }}>{clientes.length} clientes activos</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="m-btn-primary"
            onClick={() => { setEditingCliente(null); setShowClienteModal(true); }}
            style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={16} color="#fff" />
            Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: panelExpanded ? '0fr 1fr' : '1fr 420px', overflow: 'hidden', transition: 'grid-template-columns 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
        {/* List */}
        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: panelExpanded ? 0 : 24, minWidth: 0 }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '11px 14px', marginBottom: 16 }}>
            <Icon name="search" size={16} color={TOKENS.textSec} />
            <input placeholder="Buscar por nombre, telefono o email..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TOKENS.text, fontSize: 13 }} />
            <span style={{ fontSize: 11, color: TOKENS.textTer }}>{visibleClientes.length} resultados</span>
          </div>

          {/* Tag chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['Todos', 'VIP', 'Habitual', 'Nuevo'] as const).map((t) => {
              const color = t === 'VIP' ? TOKENS.warning : t === 'Habitual' ? TOKENS.primary : t === 'Nuevo' ? TOKENS.success : TOKENS.primary;
              const active = activeTagFilter === t;
              return (
                <button
                  key={t}
                  className="m-chip"
                  onClick={() => setActiveTagFilter(t)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    borderRadius: 999,
                    background: active ? `${color}22` : TOKENS.bgCard,
                    border: `1px solid ${active ? `${color}55` : TOKENS.border}`,
                    color: active ? color : TOKENS.textSec,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span>{t}</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: active ? `${color}44` : 'rgba(148,163,184,0.10)', color: active ? color : TOKENS.textSec }}>
                    {tagCounts[t]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px', padding: '10px 16px', fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(99,102,241,0.04)' }}>
              <div>Cliente</div>
              <div>Ultima visita</div>
              <div>Total gastado</div>
              <div style={{ textAlign: 'right' }}>Visitas</div>
              <div />
            </div>
            {visibleClientes.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: TOKENS.textTer, fontSize: 13 }}>Sin resultados</div>
            )}
            <div className="m-stagger">
            {visibleClientes.map((cl, i) => {
              const tagColor = cl.tag === 'VIP' ? TOKENS.warning : cl.tag === 'Habitual' ? TOKENS.primary : TOKENS.success;
              const isSel = cl.id === selected;
              return (
                <div
                  key={cl.id}
                  className="m-card-hover"
                  onClick={() => { setSelected(cl.id); setActiveTab('resumen'); }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px',
                    padding: '12px 16px',
                    borderBottom: i < visibleClientes.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isSel ? 'rgba(99,102,241,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={cl.nombre} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{cl.nombre}</div>
                        <Pill color={tagColor}>{cl.tag}</Pill>
                        {(() => {
                          const alergiasTexto = (cl.alergias ?? '').trim();
                          if (!alergiasTexto) return null;
                          return (
                            <span title={`Alergias: ${alergiasTexto}`} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: TOKENS.danger, opacity: 0.7, flexShrink: 0 }} />
                          );
                        })()}
                      </div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>{cl.telefono || cl.email || '—'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.textSec }}>{cl.ultimaVisitaStr || '—'}</div>
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
        </div>

        {/* Detail panel */}
        {c && (
          <div key={c.id} className="m-slide-right" style={{ borderLeft: `1px solid ${TOKENS.border}`, padding: panelExpanded ? '24px 0' : 24, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(99,102,241,0.04), transparent 30%)', minWidth: 0 }}>
          <div style={{ maxWidth: panelExpanded ? 1400 : 'none', margin: panelExpanded ? '0 auto' : 0, padding: panelExpanded ? '0 32px' : 0 }}>
            {/* Toggle expand */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                className="m-btn-icon"
                onClick={() => setPanelExpanded((v) => !v)}
                title={panelExpanded ? 'Reducir ficha' : 'Expandir ficha'}
                style={{ width: 30, height: 30, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Icon name={panelExpanded ? 'minimize' : 'maximize'} size={14} color={TOKENS.textSec} />
              </button>
            </div>
            {/* Profile head */}
            <div style={{ display: 'flex', flexDirection: panelExpanded ? 'row' : 'column', alignItems: 'center', justifyContent: panelExpanded ? 'flex-start' : 'center', gap: panelExpanded ? 18 : 0, textAlign: panelExpanded ? 'left' : 'center', marginBottom: 14 }}>
              <Avatar name={c.nombre} size={panelExpanded ? 56 : 72} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: panelExpanded ? 'flex-start' : 'center' }}>
              <div style={{ marginTop: panelExpanded ? 0 : 12, fontSize: 18, fontWeight: 700, color: TOKENS.text }}>{c.nombre}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: TOKENS.textSec }}>{c.telefono || c.email || ''}</div>
              <div style={{ marginTop: 8 }}>
                <Pill color={c.tag === 'VIP' ? TOKENS.warning : c.tag === 'Habitual' ? TOKENS.primary : TOKENS.success}>
                  <Icon name="star" size={11} color={c.tag === 'VIP' ? TOKENS.warning : c.tag === 'Habitual' ? TOKENS.primary : TOKENS.success} />
                  <span style={{ marginLeft: 4 }}>{c.tag}{c.primeraVisita ? ` · Cliente desde ${c.primeraVisita.getFullYear()}` : ''}</span>
                </Pill>
              </div>
              </div>
            </div>

            {/* Alertas */}
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={a.type === 'allergy' ? 'm-slide-down m-pulse-red' : 'm-slide-down'}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: a.bg, border: `1px solid ${a.border}`, borderRadius: 10, color: a.color, fontSize: 12, fontWeight: 600, animationDelay: `${i * 0.06}s` }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 1 }}><Icon name={a.icon} size={14} color={a.color} /></div>
                    <div style={{ flex: 1, color: a.color }}>{a.message}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { l: 'Nueva cita', icon: 'calendar', p: true, action: () => console.log('Crear cita para', c.nombre) },
                { l: 'Llamar', icon: 'phone', action: () => { if (c.telefono) window.location.href = `tel:${c.telefono}`; } },
                { l: 'Editar', icon: 'edit', action: () => { setEditingCliente(c); setShowClienteModal(true); } },
              ].map((a, i) => (
                <button
                  key={i}
                  className={a.p ? 'm-btn-primary' : 'm-btn-secondary'}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: panelExpanded ? 14 : 8, marginBottom: panelExpanded ? 18 : 14 }}>
              <div className="m-stat"><MiniStat label="Visitas" value={c.visitas} tone={TOKENS.primary} big={panelExpanded} /></div>
              <div className="m-stat"><MiniStat label="Total" value={`${c.gastado}€`} tone={TOKENS.success} big={panelExpanded} /></div>
              <div className="m-stat"><MiniStat label="Ticket medio" value={`${Math.round((c.gastado || 0) / Math.max(c.visitas || 1, 1))}€`} tone={TOKENS.warning} big={panelExpanded} /></div>
            </div>

            {/* Tabs (solo en modo compacto) */}
            {!panelExpanded && <Tabs active={activeTab} onChange={setActiveTab} />}

            {!panelExpanded ? (
              // Modo compacto: contenido segun pestaña activa
              <div key={activeTab} className="m-tab-content">
                {activeTab === 'resumen' && <ResumenTab cliente={c} citas={citas} servicios={servicios} />}
                {activeTab === 'notas' && <NotasTab cliente={c} onUpdated={(updated) => {
                  setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  triggerRefresh();
                }} />}
                {activeTab === 'color' && <ColorTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} negocioId={negocioId} onChanged={async () => { await cargar(); triggerRefresh(); }} />}
                {activeTab === 'historial' && <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} />}
              </div>
            ) : (
              // Modo expandido: todas las secciones a la vez en cuadricula
              <div className="m-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Fila 1: Resumen (banda completa) */}
                <Panel title="Resumen" accent={TOKENS.primary}>
                  <ResumenTab cliente={c} citas={citas} servicios={servicios} />
                </Panel>

                {/* Fila 2: Notas + Color/Quimica (50/50) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <Panel title="Alergias" accent={TOKENS.danger}>
                    <NotasTab cliente={c} onUpdated={(updated) => {
                      setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  triggerRefresh();
                    }} />
                  </Panel>
                  <Panel title="Color / Química" accent={TOKENS.violet}>
                    <ColorTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} negocioId={negocioId} onChanged={async () => { await cargar(); triggerRefresh(); }} />
                  </Panel>
                </div>

                {/* Fila 3: Historial completo */}
                <Panel title="Historial completo" accent={TOKENS.success}>
                  <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} />
                </Panel>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {showClienteModal && (
        <ClienteModal
          cliente={editingCliente}
          negocioId={negocioId}
          onClose={() => { setShowClienteModal(false); setEditingCliente(null); }}
          onSaved={async () => { setShowClienteModal(false); setEditingCliente(null); await cargar(); triggerRefresh(); }}
          onDeleted={async () => { setShowClienteModal(false); setEditingCliente(null); setSelected(null); await cargar(); triggerRefresh(); }}
        />
      )}
    </div>
  );
}

// ── Tabs
function Tabs({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'notas', label: 'Alergias' },
    { key: 'color', label: 'Color/Quimica' },
    { key: 'historial', label: 'Historial' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, padding: 3, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, marginBottom: 14 }}>
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            className="m-chip"
            onClick={() => onChange(it.key)}
            style={{
              flex: 1,
              padding: '7px 6px',
              background: isActive ? TOKENS.bgCardHi : 'transparent',
              border: 'none',
              borderRadius: 8,
              color: isActive ? TOKENS.text : TOKENS.textSec,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 0 rgba(255,255,255,0.06)' : 'none',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tab: Resumen
function ResumenTab({ cliente, citas, servicios }: { cliente: Cliente; citas: Cita[]; servicios: any[] }) {
  const now = new Date();
  const nextCita = citas
    .filter((cit) => cit.cliente_id === cliente.id && new Date(cit.inicio) > now)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

  return (
    <>
      {cliente.fav && (
        <Section title="Servicio preferido">
          <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{cliente.fav}</div>
              <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>Solicitado {cliente.favCount} veces</div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.14)', color: TOKENS.warning, display: 'grid', placeItems: 'center' }}>
              <Icon name="star" size={18} color={TOKENS.warning} />
            </div>
          </div>
        </Section>
      )}

      <Section title="Proxima cita">
        {!nextCita && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin citas proximas</div>}
        {nextCita && (() => {
          const citaDate = new Date(nextCita.inicio);
          const dateStr = citaDate.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
          const srv = servicios.find((s) => s.id === nextCita.servicio_id);
          const serviceName = srv?.nombre || 'Servicio';
          const price = srv?.precio ?? '-';
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
    </>
  );
}

// ── Tab: Alergias
function NotasTab({ cliente, onUpdated }: {
  cliente: Cliente;
  citas?: Cita[];
  profesionales?: any[];
  servicios?: any[];
  onUpdated: (updated: Partial<Cliente> & { id: string }) => void;
}) {
  const [alergias, setAlergias] = useState((cliente.alergias ?? '').trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAlergias((cliente.alergias ?? '').trim());
  }, [cliente.id]);

  async function save() {
    setError('');
    setSaving(true);
    const payload = { alergias: alergias.trim() || null };
    const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onUpdated({ id: cliente.id, ...payload });
  }

  const hayAlergias = alergias.trim().length > 0;

  return (
    <>
      {/* Aviso visible cuando hay alergias */}
      {hayAlergias && (
        <div className="m-pulse-red" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.35)`, borderRadius: 10, marginBottom: 12 }}>
          <Icon name="alert" size={16} color={TOKENS.danger} />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: TOKENS.danger, whiteSpace: 'pre-wrap' as any, lineHeight: 1.4 }}>
            Atencion: este cliente tiene alergias registradas
          </div>
        </div>
      )}

      <Section title="Alergias del cliente">
        <textarea
          value={alergias}
          onChange={(e) => setAlergias(e.target.value)}
          onBlur={() => save()}
          placeholder="Anota cualquier alergia o reaccion previa relevante (parafenilendiamina, amoniaco, fragancias, latex...)"
          style={{
            width: '100%',
            minHeight: 130,
            padding: 12,
            background: hayAlergias ? 'rgba(239,68,68,0.06)' : TOKENS.bgCard,
            border: `1px solid ${hayAlergias ? 'rgba(239,68,68,0.35)' : TOKENS.border}`,
            borderRadius: 10,
            color: hayAlergias ? TOKENS.danger : TOKENS.text,
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 4, height: 12 }}>
          {saving ? 'Guardando...' : 'Se guarda al salir del campo'}
        </div>
      </Section>

      {error && <div style={{ fontSize: 11, color: TOKENS.danger, marginTop: 4 }}>{error}</div>}
    </>
  );
}

// ── Tab: Color/Quimica (usa fichas_tecnicas_color + fallback a campos legacy en citas)
function ColorTab({ cliente, citas, servicios, profesionales, fichasTecnicas, negocioId, onChanged }: { cliente: Cliente; citas: Cita[]; servicios: any[]; profesionales: any[]; fichasTecnicas: any[]; negocioId: string; onChanged: () => Promise<void> }) {
  const [editingFicha, setEditingFicha] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const clientCitas = citas
    .filter((cit) => cit.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  // Fichas estructuradas de la nueva tabla
  const fichasCliente = fichasTecnicas.filter((f: any) => f.cliente_id === cliente.id);

  // Formulas legacy (campos texto en citas, para retrocompatibilidad)
  const formulasLegacy = clientCitas.filter((cit) => (
    (cit.formula_producto && cit.formula_producto.trim()) ||
    (cit.formula_tono && cit.formula_tono.trim()) ||
    (cit.formula_tiempo_min != null) ||
    (cit.formula_resultado && cit.formula_resultado.trim()) ||
    (cit.formula_notas && cit.formula_notas.trim())
  ));

  // Si no tiene fichas estructuradas, mostrar las legacy
  const usarLegacy = fichasCliente.length === 0 && formulasLegacy.length > 0;
  const totalFormulas = fichasCliente.length + (usarLegacy ? formulasLegacy.length : 0);

  const hasCitas = clientCitas.length > 0;

  const TIPOS_SERVICIO_MAP: Record<string, string> = {
    coloracion_global: 'Color global', color_raiz: 'Color raiz', mechas: 'Mechas',
    balayage: 'Balayage', decoloracion: 'Decoloracion', matiz: 'Matiz',
    bano_color: 'Bano de color', correccion_color: 'Correccion', color_fantasia: 'Color fantasia', otro: 'Otro',
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 600 }}>
          {totalFormulas} {totalFormulas === 1 ? 'formula' : 'formulas'} registrada{totalFormulas === 1 ? '' : 's'}
        </div>
        <button
          className="m-btn-secondary"
          onClick={() => setShowAdd(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
        >
          <Icon name="plus" size={12} color={TOKENS.text} />
          Nueva formula
        </button>
      </div>

      {totalFormulas === 0 ? (
        <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 18, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: 10, background: 'rgba(139,92,246,0.10)', borderRadius: 999, color: TOKENS.violet, marginBottom: 8 }}>
            <Icon name="droplet" size={20} color={TOKENS.violet} />
          </div>
          <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 4 }}>Sin formulas registradas</div>
          <div style={{ fontSize: 11, color: TOKENS.textTer }}>Pulsa "Nueva formula" para anadir una</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Fichas estructuradas (nueva tabla) */}
          {fichasCliente.map((ficha: any) => {
            const fecha = new Date(ficha.created_at);
            const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const prof = profesionales.find((p: any) => p.id === ficha.profesional_id);
            const tipoLabel = TIPOS_SERVICIO_MAP[ficha.tipo_servicio] || ficha.tipo_servicio;
            const formulaArr = Array.isArray(ficha.formula) ? ficha.formula : [];

            return (
              <div
                key={ficha.id}
                onClick={() => setEditingFicha(ficha)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.violet, letterSpacing: 0.4, textTransform: 'uppercase' }}>{fechaStr}</span>
                    <Pill color={TOKENS.violet}>{tipoLabel}</Pill>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {prof && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: TOKENS.textSec }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />
                        {prof.nombre}
                      </div>
                    )}
                    <Icon name="edit" size={11} color={TOKENS.textTer} />
                  </div>
                </div>

                {/* Formula estructurada */}
                {formulaArr.length > 0 && (
                  <div style={{ background: TOKENS.bgCardHi, borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontFamily: 'monospace' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Formula</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text }}>
                      {formulaArr.map((f: any) => `${f.numero || '?'} (${f.gramos || '?'}g)`).join(' + ')}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {ficha.marca_producto && <FieldKV label="Marca" value={ficha.marca_producto} />}
                  {ficha.oxidante_volumen && <FieldKV label="Oxidante" value={`${ficha.oxidante_volumen} vol${ficha.oxidante_proporcion ? ` (${ficha.oxidante_proporcion})` : ''}`} />}
                  {ficha.tiempo_exposicion_min && <FieldKV label="Tiempo" value={`${ficha.tiempo_exposicion_min} min`} />}
                  {ficha.base_natural && <FieldKV label="Base natural" value={ficha.base_natural} />}
                  {ficha.color_previo && <FieldKV label="Color previo" value={ficha.color_previo} />}
                  {ficha.porcentaje_canas != null && <FieldKV label="Canas" value={`${ficha.porcentaje_canas}%`} />}
                  {ficha.resultado_color && <FieldKV label="Resultado" value={ficha.resultado_color} full />}
                  {ficha.resultado_notas && <FieldKV label="Notas" value={ficha.resultado_notas} full />}
                </div>

                {ficha.tecnica_aplicacion && ficha.tecnica_aplicacion.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {ficha.tecnica_aplicacion.map((t: string) => (
                      <Pill key={t} color={TOKENS.cyan}>{t}</Pill>
                    ))}
                  </div>
                )}

                {ficha.incidencias && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 10px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 8, marginTop: 8, fontSize: 11, color: TOKENS.danger }}>
                    <Icon name="alert" size={12} color={TOKENS.danger} />
                    <span>{ficha.incidencias}</span>
                  </div>
                )}

                {ficha.resultado_satisfactorio != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning }} />
                    <span style={{ fontSize: 10, color: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning, fontWeight: 600 }}>
                      {ficha.resultado_satisfactorio ? 'Resultado satisfactorio' : 'Resultado a revisar'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Formulas legacy (retrocompatibilidad) */}
          {usarLegacy && formulasLegacy.map((cit) => {
            const fecha = new Date(cit.inicio);
            const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            const srv = servicios.find((s: any) => s.id === cit.servicio_id);
            const prof = profesionales.find((p: any) => p.id === cit.profesional_id);
            return (
              <div
                key={cit.id}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, transition: 'transform 0.15s ease, border-color 0.15s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.violet, letterSpacing: 0.4, textTransform: 'uppercase' }}>{fechaStr}</div>
                    <Pill color={TOKENS.textTer}>Legacy</Pill>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {prof && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: TOKENS.textSec }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: prof.color }} />
                        {prof.nombre}
                      </div>
                    )}
                    <Icon name="edit" size={11} color={TOKENS.textTer} />
                  </div>
                </div>
                {srv?.nombre && <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text, marginBottom: 6 }}>{srv.nombre}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {cit.formula_producto && <FieldKV label="Producto" value={cit.formula_producto} />}
                  {cit.formula_tono && <FieldKV label="Tono" value={cit.formula_tono} />}
                  {cit.formula_tiempo_min != null && <FieldKV label="Tiempo" value={`${cit.formula_tiempo_min} min`} />}
                  {cit.formula_resultado && <FieldKV label="Resultado" value={cit.formula_resultado} full />}
                  {cit.formula_notas && <FieldKV label="Notas" value={cit.formula_notas} full />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editingFicha || showAdd) && (
        <FichaColorModal
          mode={editingFicha ? 'edit' : 'add'}
          ficha={editingFicha}
          clienteId={cliente.id}
          negocioId={negocioId}
          citasCliente={clientCitas}
          servicios={servicios}
          profesionales={profesionales}
          onClose={() => { setEditingFicha(null); setShowAdd(false); }}
          onSaved={async () => { setEditingFicha(null); setShowAdd(false); await onChanged(); }}
        />
      )}
    </>
  );
}

function FichaColorModal({ mode, ficha, clienteId, negocioId, citasCliente, servicios, profesionales, onClose, onSaved }: {
  mode: 'add' | 'edit';
  ficha: any | null;
  clienteId: string;
  negocioId: string;
  citasCliente: Cita[];
  servicios: any[];
  profesionales: any[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const TIPOS_SERVICIO = [
    { key: 'coloracion_global', label: 'Color global' }, { key: 'color_raiz', label: 'Color raiz' },
    { key: 'mechas', label: 'Mechas' }, { key: 'balayage', label: 'Balayage' },
    { key: 'decoloracion', label: 'Decoloracion' }, { key: 'matiz', label: 'Matiz' },
    { key: 'bano_color', label: 'Bano de color' }, { key: 'correccion_color', label: 'Correccion' },
    { key: 'color_fantasia', label: 'Color fantasia' }, { key: 'otro', label: 'Otro' },
  ];

  const TECNICAS = ['Pincel', 'Peine', 'Mano', 'Papel meche', 'Gorro', 'Balayage libre', 'Foilyage'];
  const OXIDANTES_VOL = [10, 20, 30, 40];

  const [tipoServicio, setTipoServicio] = useState(ficha?.tipo_servicio ?? 'coloracion_global');
  const [marcaProducto, setMarcaProducto] = useState(ficha?.marca_producto ?? '');
  const [formulaEntries, setFormulaEntries] = useState<{ numero: string; gramos: string }[]>(
    Array.isArray(ficha?.formula) && ficha.formula.length > 0
      ? ficha.formula.map((f: any) => ({ numero: f.numero ?? '', gramos: String(f.gramos ?? '') }))
      : [{ numero: '', gramos: '' }]
  );
  const [oxidanteVol, setOxidanteVol] = useState(ficha?.oxidante_volumen != null ? String(ficha.oxidante_volumen) : '');
  const [oxidanteProp, setOxidanteProp] = useState(ficha?.oxidante_proporcion ?? '');
  const [tiempoExp, setTiempoExp] = useState(ficha?.tiempo_exposicion_min != null ? String(ficha.tiempo_exposicion_min) : '');
  const [tecnicas, setTecnicas] = useState<string[]>(ficha?.tecnica_aplicacion ?? []);
  const [baseNatural, setBaseNatural] = useState(ficha?.base_natural ?? '');
  const [colorPrevio, setColorPrevio] = useState(ficha?.color_previo ?? '');
  const [porcCanas, setPorcCanas] = useState(ficha?.porcentaje_canas != null ? String(ficha.porcentaje_canas) : '');
  const [resultadoColor, setResultadoColor] = useState(ficha?.resultado_color ?? '');
  const [satisfactorio, setSatisfactorio] = useState<boolean | null>(ficha?.resultado_satisfactorio ?? null);
  const [resultadoNotas, setResultadoNotas] = useState(ficha?.resultado_notas ?? '');
  const [incidencias, setIncidencias] = useState(ficha?.incidencias ?? '');
  const [profesionalId, setProfesionalId] = useState(ficha?.profesional_id ?? '');
  const [citaId, setCitaId] = useState(ficha?.cita_id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addFormulaEntry() { setFormulaEntries([...formulaEntries, { numero: '', gramos: '' }]); }
  function removeFormulaEntry(i: number) { setFormulaEntries(formulaEntries.filter((_, idx) => idx !== i)); }
  function updateFormulaEntry(i: number, field: 'numero' | 'gramos', val: string) {
    const copy = [...formulaEntries];
    copy[i] = { ...copy[i], [field]: val };
    setFormulaEntries(copy);
  }

  function toggleTecnica(t: string) {
    setTecnicas(tecnicas.includes(t) ? tecnicas.filter((x) => x !== t) : [...tecnicas, t]);
  }

  async function handleSave() {
    if (!tipoServicio) { setError('Selecciona un tipo de servicio'); return; }
    setLoading(true);
    setError('');

    const formulaJson = formulaEntries
      .filter((f) => f.numero.trim())
      .map((f) => ({ numero: f.numero.trim(), gramos: f.gramos.trim() ? parseFloat(f.gramos.trim()) : null }));

    const tiempoNum = tiempoExp.trim() ? parseInt(tiempoExp.trim(), 10) : null;
    const oxVol = oxidanteVol.trim() ? parseInt(oxidanteVol.trim(), 10) : null;
    const canasNum = porcCanas.trim() ? parseInt(porcCanas.trim(), 10) : null;

    const row: Record<string, any> = {
      negocio_id: negocioId,
      cliente_id: clienteId,
      tipo_servicio: tipoServicio,
      marca_producto: marcaProducto.trim() || null,
      formula: formulaJson.length > 0 ? formulaJson : [],
      oxidante_volumen: oxVol,
      oxidante_proporcion: oxidanteProp.trim() || null,
      tiempo_exposicion_min: tiempoNum != null && !isNaN(tiempoNum) ? tiempoNum : null,
      tecnica_aplicacion: tecnicas,
      base_natural: baseNatural.trim() || null,
      color_previo: colorPrevio.trim() || null,
      porcentaje_canas: canasNum != null && !isNaN(canasNum) ? canasNum : null,
      resultado_color: resultadoColor.trim() || null,
      resultado_satisfactorio: satisfactorio,
      resultado_notas: resultadoNotas.trim() || null,
      incidencias: incidencias.trim() || null,
      profesional_id: profesionalId || null,
      cita_id: citaId || null,
      updated_at: new Date().toISOString(),
    };

    let err;
    if (mode === 'edit' && ficha?.id) {
      ({ error: err } = await supabase.from('fichas_tecnicas_color').update(row).eq('id', ficha.id));
    } else {
      ({ error: err } = await supabase.from('fichas_tecnicas_color').insert(row));
    }
    setLoading(false);
    if (err) { setError(err.message); return; }
    await onSaved();
  }

  async function handleDelete() {
    if (!ficha?.id) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.from('fichas_tecnicas_color').delete().eq('id', ficha.id);
    setLoading(false);
    if (err) { setError(err.message); return; }
    await onSaved();
  }

  const selectStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' };
  const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 54, padding: '10px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' };

  return createPortal(
    <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div className="m-modal-enter" style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.14)', color: TOKENS.violet, display: 'grid', placeItems: 'center' }}>
              <Icon name="droplet" size={16} color={TOKENS.violet} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TOKENS.text }}>{mode === 'edit' ? 'Editar ficha de color' : 'Nueva ficha de color'}</h3>
          </div>
          <button className="m-btn-icon m-btn-icon-close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>

        {/* Seccion: Servicio y profesional */}
        <SectionLabel>Servicio</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Tipo de servicio">
            <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} style={selectStyle}>
              {TIPOS_SERVICIO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Profesional">
            <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} style={selectStyle}>
              <option value="">Sin asignar</option>
              {profesionales.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
        </div>
        {citasCliente.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Field label="Asociar a cita (opcional)">
              <select value={citaId} onChange={(e) => setCitaId(e.target.value)} style={selectStyle}>
                <option value="">Sin cita asociada</option>
                {citasCliente.map((cit) => {
                  const srv = servicios.find((s: any) => s.id === cit.servicio_id);
                  const fecha = new Date(cit.inicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                  return <option key={cit.id} value={cit.id}>{fecha} - {srv?.nombre || 'Servicio'}</option>;
                })}
              </select>
            </Field>
          </div>
        )}

        {/* Seccion: Formula */}
        <SectionLabel>Formula</SectionLabel>
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <Field label="Marca / producto"><Input value={marcaProducto} onChange={setMarcaProducto} placeholder="Ej. Wella Koleston, L'Oreal Majirel" /></Field>
          <Field label="Mezcla de color">
            {formulaEntries.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <Input value={entry.numero} onChange={(v) => updateFormulaEntry(i, 'numero', v)} placeholder="Numero/tono (ej. 7/0)" style={{ flex: 2 }} />
                <Input value={entry.gramos} onChange={(v) => updateFormulaEntry(i, 'gramos', v)} placeholder="g" style={{ flex: 1 }} />
                {formulaEntries.length > 1 && (
                  <button onClick={() => removeFormulaEntry(i)} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: `1px solid ${TOKENS.border}`, color: TOKENS.textTer, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={10} color={TOKENS.textTer} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addFormulaEntry} style={{ padding: '4px 10px', background: 'transparent', border: `1px dashed ${TOKENS.border}`, borderRadius: 8, color: TOKENS.textSec, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}>
              + Anadir tono
            </button>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Oxidante (vol)">
              <select value={oxidanteVol} onChange={(e) => setOxidanteVol(e.target.value)} style={selectStyle}>
                <option value="">--</option>
                {OXIDANTES_VOL.map((v) => <option key={v} value={String(v)}>{v} vol</option>)}
              </select>
            </Field>
            <Field label="Proporcion"><Input value={oxidanteProp} onChange={setOxidanteProp} placeholder="Ej. 1:1.5" /></Field>
            <Field label="Tiempo (min)"><Input value={tiempoExp} onChange={setTiempoExp} placeholder="35" /></Field>
          </div>
        </div>

        {/* Seccion: Estado del cabello */}
        <SectionLabel>Estado del cabello</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Base natural"><Input value={baseNatural} onChange={setBaseNatural} placeholder="Ej. 5" /></Field>
          <Field label="Color previo"><Input value={colorPrevio} onChange={setColorPrevio} placeholder="Ej. 7/3" /></Field>
          <Field label="% canas"><Input value={porcCanas} onChange={setPorcCanas} placeholder="30" /></Field>
        </div>

        {/* Seccion: Tecnica */}
        <SectionLabel>Tecnica de aplicacion</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TECNICAS.map((t) => {
            const active = tecnicas.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTecnica(t)}
                style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: active ? '1px solid rgba(139,92,246,0.50)' : `1px solid ${TOKENS.border}`, background: active ? 'rgba(139,92,246,0.14)' : TOKENS.bgCard, color: active ? TOKENS.violet : TOKENS.textSec, transition: 'all 0.15s ease' }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Seccion: Resultado */}
        <SectionLabel>Resultado</SectionLabel>
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <Field label="Color obtenido"><Input value={resultadoColor} onChange={setResultadoColor} placeholder="Ej. Rubio claro ceniza" /></Field>
          <Field label="Satisfaccion">
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ val: true, label: 'Satisfactorio', color: TOKENS.success }, { val: false, label: 'A revisar', color: TOKENS.warning }].map(({ val, label, color }) => {
                const active = satisfactorio === val;
                return (
                  <button
                    key={label}
                    onClick={() => setSatisfactorio(active ? null : val)}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: active ? `1px solid ${color}` : `1px solid ${TOKENS.border}`, background: active ? `${color}18` : TOKENS.bgCard, color: active ? color : TOKENS.textSec, transition: 'all 0.15s ease' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Notas del resultado"><textarea value={resultadoNotas} onChange={(e) => setResultadoNotas(e.target.value)} placeholder="Observaciones sobre el resultado" style={textareaStyle} /></Field>
          <Field label="Incidencias (si las hubo)"><textarea value={incidencias} onChange={(e) => setIncidencias(e.target.value)} placeholder="Irritacion, mancha, reaccion..." style={textareaStyle} /></Field>
        </div>

        {error && <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
          {mode === 'edit' ? (
            <button
              className="m-btn-danger"
              onClick={handleDelete}
              disabled={loading}
              style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="trash" size={14} color={TOKENS.danger} />
              Eliminar ficha
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn-secondary" onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Cancelar
            </button>
            <button className="m-btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#a78bfa 0%,#8b5cf6 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(139,92,246,0.40)' }}>
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 1.2, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

function FieldKV({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: TOKENS.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Tab: Historial
function HistorialTab({ cliente, citas, servicios, profesionales = [] }: { cliente: Cliente; citas: Cita[]; servicios: any[]; profesionales?: any[] }) {
  const clientCitas = citas
    .filter((cit) => cit.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  if (clientCitas.length === 0) {
    return <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin historial</div>;
  }

  const estadoStyle: Record<string, { bg: string; color: string; label: string }> = {
    confirmada: { bg: 'rgba(99,102,241,0.12)', color: TOKENS.primaryHi, label: 'Confirmada' },
    completada: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Completada' },
    cancelada: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Cancelada' },
    no_presentada: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'No presentada' },
  };

  const completadas = clientCitas.filter((c) => c.estado === 'completada').length;
  const canceladas = clientCitas.filter((c) => c.estado === 'cancelada' || c.estado === 'no_presentada').length;
  const totalGastado = clientCitas
    .filter((c) => c.estado === 'completada')
    .reduce((sum, c) => sum + (servicios.find((s) => s.id === c.servicio_id)?.precio || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Stats resumen */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ padding: '5px 10px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: TOKENS.primaryHi }}>
          {clientCitas.length} citas totales
        </div>
        {completadas > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
            {completadas} completadas
          </div>
        )}
        {canceladas > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#ef4444' }}>
            {canceladas} cancel./no-show
          </div>
        )}
        {totalGastado > 0 && (
          <div style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: TOKENS.success }}>
            {totalGastado} EUR facturado
          </div>
        )}
      </div>

      {/* Lista de citas */}
      {clientCitas.map((h, idx) => {
        const fecha = new Date(h.inicio);
        const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: fecha.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined });
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const srv = servicios.find((s) => s.id === h.servicio_id);
        const prof = profesionales.find((p: any) => p.id === h.profesional_id);
        const estado = h.estado || 'confirmada';
        const est = estadoStyle[estado] || estadoStyle.confirmada;
        const precio = srv?.precio ?? 0;

        return (
          <div
            key={h.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
              transition: 'all 0.15s ease',
              animation: `fadeIn 0.2s ease ${idx * 0.03}s both`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: prof?.color || TOKENS.primary, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{srv?.nombre || 'Servicio'}</div>
              <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 2 }}>
                {prof?.nombre || 'Profesional'} · {fechaStr} · {horaStr}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
              background: est.bg, color: est.color, textTransform: 'uppercase', flexShrink: 0,
            }}>
              {est.label}
            </span>
            {precio > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: estado === 'completada' ? TOKENS.success : TOKENS.textSec, minWidth: 45, textAlign: 'right', flexShrink: 0 }}>
                {precio} EUR
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Modal: Crear/Editar cliente
function ClienteModal({ cliente, negocioId, onClose, onSaved, onDeleted }: {
  cliente: Cliente | null;
  negocioId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isEdit = !!cliente;
  const initialBday = (() => {
    if (!cliente?.fecha_nacimiento) return { mm: null as number | null, dd: null as number | null };
    const parts = cliente.fecha_nacimiento.split('-');
    if (parts.length !== 3) return { mm: null, dd: null };
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    if (isNaN(mm) || isNaN(dd)) return { mm: null, dd: null };
    return { mm, dd };
  })();
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [bdayMM, setBdayMM] = useState<number | null>(initialBday.mm);
  const [bdayDD, setBdayDD] = useState<number | null>(initialBday.dd);
  const [notas, setNotas] = useState((cliente?.alergias ?? '').trim());
  const [loading, setLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Email no valido');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const fechaToSave = (bdayMM != null && bdayDD != null)
        ? `1900-${pad(bdayMM + 1)}-${pad(bdayDD)}`
        : null;

      const payload = {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        fecha_nacimiento: fechaToSave,
        alergias: notas.trim() || null,
      };

      if (isEdit && cliente) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert({ ...payload, negocio_id: negocioId });
        if (error) throw error;
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!cliente) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.from('clientes').delete().eq('id', cliente.id);
    setLoading(false);
    if (error) {
      setError(`No se puede eliminar: ${error.message}. Probablemente tiene citas asociadas.`);
      setShowConfirmDelete(false);
      return;
    }
    onDeleted();
  };

  return (
    <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.65)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 24 }}>
      <div className="m-modal-enter" style={{ width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TOKENS.text }}>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <button className="m-btn-icon m-btn-icon-close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <Field label="Nombre*">
            <Input value={nombre} onChange={setNombre} placeholder="Ej. Maria Garcia" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Telefono">
              <Input value={telefono} onChange={setTelefono} placeholder="+34 611 234 567" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={setEmail} placeholder="cliente@correo.com" />
            </Field>
          </div>
          <Field label="Cumpleanos (dia y mes)">
            <BirthdayPicker mm={bdayMM} dd={bdayDD} onChange={(mm, dd) => { setBdayMM(mm); setBdayDD(dd); }} />
          </Field>
          <Field label="Alergias">
            {(() => {
              const tieneAlergia = notas.trim().length > 0;
              return (
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Alergias o reacciones previas relevantes (parafenilendiamina, amoniaco, fragancias, latex...)"
                  style={{
                    width: '100%',
                    minHeight: 110,
                    padding: '10px 12px',
                    background: tieneAlergia ? 'rgba(239,68,68,0.06)' : TOKENS.bgCard,
                    border: `1px solid ${tieneAlergia ? 'rgba(239,68,68,0.35)' : TOKENS.border}`,
                    borderRadius: 10,
                    color: tieneAlergia ? TOKENS.danger : TOKENS.text,
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              );
            })()}
          </Field>
        </div>

        {error && (
          <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
          {isEdit ? (
            <button
              className="m-btn-danger"
              onClick={() => setShowConfirmDelete(true)}
              disabled={loading}
              style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="trash" size={14} color={TOKENS.danger} />
              Eliminar
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="m-btn-secondary" onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Cancelar
            </button>
            <button className="m-btn-primary" onClick={handleGuardar} disabled={loading} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#7c83ff 0%,#6366f1 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}` }}>
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </div>

        {showConfirmDelete && (
          <div className="m-overlay-enter" style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,0.85)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 24 }}>
            <div className="m-modal-enter" style={{ width: 360, maxWidth: '100%', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text, marginBottom: 6 }}>Eliminar cliente</div>
              <div style={{ fontSize: 12, color: TOKENS.textSec, marginBottom: 14, lineHeight: 1.5 }}>
                Vas a eliminar a {cliente?.nombre}. Si tiene citas asociadas no se podra eliminar.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="m-btn-secondary" onClick={() => setShowConfirmDelete(false)} style={{ padding: '8px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancelar</button>
                <button className="m-btn-primary" onClick={handleDelete} disabled={loading} style={{ padding: '8px 12px', background: TOKENS.danger, border: 'none', color: '#fff', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {loading ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Mini-calendario para seleccionar dia y mes (sin ano)
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY_NAMES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function BirthdayPicker({ mm, dd, onChange }: { mm: number | null; dd: number | null; onChange: (mm: number | null, dd: number | null) => void }) {
  const [viewMonth, setViewMonth] = useState<number>(mm ?? new Date().getMonth());

  // Usamos 2024 (bisiesto) como ano de referencia para layout de cuadricula
  const REF_YEAR = 2024;
  const daysInMonth = new Date(REF_YEAR, viewMonth + 1, 0).getDate();
  const firstDay = new Date(REF_YEAR, viewMonth, 1).getDay(); // 0=Sun..6=Sat
  // Layout L-D: convertir Sun(0) -> 6, Mon(1) -> 0...
  const firstOffset = (firstDay + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prevMonth() { setViewMonth((m) => (m + 11) % 12); }
  function nextMonth() { setViewMonth((m) => (m + 1) % 12); }

  const hasSelection = mm != null && dd != null;
  const summaryStr = hasSelection
    ? new Date(REF_YEAR, mm!, dd!).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })
    : 'Sin fecha';

  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          className="m-btn-icon m-btn-icon-rotate-l"
          onClick={prevMonth}
          style={{ width: 28, height: 28, borderRadius: 7, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="chevronLeft" size={14} color={TOKENS.textSec} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.text }}>{MONTH_NAMES[viewMonth]}</div>
        <button
          type="button"
          className="m-btn-icon m-btn-icon-rotate-r"
          onClick={nextMonth}
          style={{ width: 28, height: 28, borderRadius: 7, background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name="chevronRight" size={14} color={TOKENS.textSec} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: TOKENS.textTer, letterSpacing: 0.5, padding: 3 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ height: 30 }} />;
          const isSel = mm === viewMonth && dd === d;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(viewMonth, d)}
              onMouseEnter={(e) => {
                if (!isSel) {
                  e.currentTarget.style.transform = 'scale(1.12)';
                  e.currentTarget.style.background = 'rgba(99,102,241,0.12)';
                  e.currentTarget.style.borderColor = TOKENS.primary;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = isSel ? 'rgba(99,102,241,0.18)' : 'transparent';
                e.currentTarget.style.borderColor = isSel ? TOKENS.primary : 'transparent';
              }}
              style={{
                height: 30,
                borderRadius: 7,
                background: isSel ? 'rgba(99,102,241,0.18)' : 'transparent',
                border: `1px solid ${isSel ? TOKENS.primary : 'transparent'}`,
                color: isSel ? TOKENS.primaryHi : TOKENS.textSec,
                fontSize: 11,
                fontWeight: isSel ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOKENS.border}` }}>
        <div style={{ fontSize: 11, color: hasSelection ? TOKENS.text : TOKENS.textTer, fontWeight: 600, textTransform: 'capitalize' }}>{summaryStr}</div>
        {hasSelection && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 7, color: TOKENS.textSec, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon name="x" size={10} color={TOKENS.textSec} />
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, labelColor, children }: { label: string; labelColor?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 1, color: labelColor || TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type, style: extraStyle }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties }) {
  return (
    <input
      type={type || 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        ...extraStyle,
        padding: '10px 12px',
        background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 10,
        color: TOKENS.text,
        fontSize: 13,
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── Avatar
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

function Pill({ children, color = TOKENS.primary }: any) {
  const bg = `${color}22`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999, background: bg, color, fontSize: 11, fontWeight: 600, letterSpacing: 0.2, border: `1px solid ${color}33` }}>
      {children}
    </span>
  );
}

function MiniStat({ label, value, tone, big }: any) {
  return (
    <div style={{
      background: big ? `linear-gradient(180deg, ${tone}10 0%, ${tone}04 100%)` : TOKENS.bgCard,
      border: `1px solid ${big ? `${tone}22` : TOKENS.border}`,
      borderRadius: big ? 14 : 10,
      padding: big ? 16 : 10,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: big ? 10 : 9, letterSpacing: 1, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 16, fontWeight: 700, color: tone, marginTop: big ? 6 : 2, letterSpacing: -0.5 }}>{value}</div>
    </div>
  );
}

// Panel decorado para vista expandida (con titulo, accent y borde sutil)
function Panel({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(148,163,184,0.04) 0%, transparent 60%)',
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 14,
      padding: 18,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Accent bar superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent} 0%, ${accent}33 100%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.text, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: 1.5, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
