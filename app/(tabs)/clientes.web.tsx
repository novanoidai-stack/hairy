import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
    mail: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    check: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
    user: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
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
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#8a7d70',
  primary: '#f4501e',
  primaryHi: '#c0260a',
  primarySoft: 'rgba(244,80,30,0.12)',
  primaryGlow: 'rgba(244,80,30,0.30)',
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
  violet: '#c0260a',
  violetSoft: 'rgba(192,38,10,0.14)',
  cyan: '#0891b2',
  cyanSoft: 'rgba(8,145,178,0.14)',
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

type TagValor = 'VIP' | 'Habitual' | 'Nuevo';
type TagActividad = 'Activa' | 'Riesgo abandono' | 'Inactiva';
type TagRiesgo = 'Fiable' | 'Incidencias' | 'Alto riesgo';

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  fecha_nacimiento?: string | null;
  alergias?: string | null;
  notas?: string | null;
  visitas?: number;
  ultimaVisita?: Date | null;
  ultimaVisitaStr?: string;
  primeraVisita?: Date | null;
  gastado?: number;
  fav?: string;
  favCount?: number;
  tag?: TagValor;
  actividad?: TagActividad;
  riesgo?: TagRiesgo;
  noshows_count?: number;
  diasInactiva?: number;
  profHabitual?: string;
}

type Tab = 'resumen' | 'notas' | 'color' | 'historial';

function computeTag(visitas: number, gastado: number): TagValor {
  if (visitas > 10 || gastado > 500) return 'VIP';
  if (visitas >= 3) return 'Habitual';
  return 'Nuevo';
}

function computeActividad(ultimaVisita: Date | null): TagActividad {
  if (!ultimaVisita) return 'Inactiva';
  const dias = Math.floor((Date.now() - ultimaVisita.getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 45) return 'Activa';
  if (dias <= INACTIVIDAD_DIAS) return 'Riesgo abandono';
  return 'Inactiva';
}

function computeRiesgo(noshows: number): TagRiesgo {
  if (noshows >= 3) return 'Alto riesgo';
  if (noshows >= 1) return 'Incidencias';
  return 'Fiable';
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
  const router = useRouter();
  const { refreshTrigger, triggerRefresh } = useCalendarRefresh();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);
  const [profesionales, setProfesionales] = useState<any[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<any[]>([]);
  const [catalogoAlergias, setCatalogoAlergias] = useState<string[]>([]);
  // Plantillas de notas del salon (Configuracion > Plantillas) para la ficha
  const [plantillasNota, setPlantillasNota] = useState<{ nombre: string; texto: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [negocioId, setNegocioId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const [activeTagFilter, setActiveTagFilter] = useState<string>('Todos');
  const [panelExpanded, setPanelExpanded] = useState(false);
  // Demo guiada: si la guia pide abrir una ficha antes de que carguen los clientes,
  // dejamos la peticion pendiente y la resolvemos en cuanto haya datos.
  const demoFichaPending = useRef(false);

  async function cargar() {
    const profile = await getUserProfile();
    if (!profile?.negocio_id) {
      setLoading(false);
      return;
    }
    setNegocioId(profile.negocio_id);

    const [{ data: clts }, { data: citsData }, { data: srvData }, { data: profData }, { data: fichasData }, { data: cfgRow }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, telefono, email, fecha_nacimiento, alergias, notas, canal_preferido, bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, frecuencia_dias')
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
      supabase
        .from('negocio_config')
        .select('config')
        .eq('negocio_id', profile.negocio_id)
        .maybeSingle(),
    ]);

    const cfg: any = (cfgRow?.config && typeof cfgRow.config === 'object') ? cfgRow.config : {};
    setCatalogoAlergias(Array.isArray(cfg.catalogoAlergias) ? cfg.catalogoAlergias : []);
    setPlantillasNota(Array.isArray(cfg.plantillasNota) ? cfg.plantillasNota : []);

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
      const actividad = computeActividad(ultimaVisita);
      const noshows = cl.noshows_count ?? 0;
      const riesgo = computeRiesgo(noshows);
      const diasInactiva = ultimaVisita ? Math.floor((Date.now() - ultimaVisita.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Profesional habitual: el que mas citas tiene con esta clienta
      const profCount: Record<string, number> = {};
      clientCitas.forEach((c: Cita) => { if (c.profesional_id) profCount[c.profesional_id] = (profCount[c.profesional_id] || 0) + 1; });
      const topProf = Object.entries(profCount).sort((a, b) => b[1] - a[1])[0];
      const profHabitual = topProf ? ((profData ?? []).find((p: any) => p.id === topProf[0])?.nombre ?? undefined) : undefined;

      return { ...cl, visitas, gastado, ultimaVisita, primeraVisita, ultimaVisitaStr, fav, favCount, tag, actividad, riesgo, noshows_count: noshows, diasInactiva, profHabitual } as Cliente;
    });

    setClientes(enrichedClients);
    setCitas(citsData ?? []);
    setServicios(srvData ?? []);
    setProfesionales(profData ?? []);
    setFichasTecnicas(fichasData ?? []);
    // Solo pre-seleccionar si llega clienteId por URL (p.ej. "ver cliente" desde agenda).
    // Por defecto NO se abre ninguna ficha: la lista queda a pantalla completa.
    const targetId = (params?.clienteId as string | undefined) || null;
    if (targetId && enrichedClients.find((cl) => cl.id === targetId)) {
      setSelected(targetId);
    }
    setLoading(false);
  }

  // Guarda una alergia nueva en el catalogo del salon (negocio_config),
  // sin pisar el resto de la configuracion existente.
  async function addAlergiaToCatalog(term: string) {
    const t = term.trim();
    if (!t || !negocioId) return;
    if (catalogoAlergias.some((a) => a.toLowerCase() === t.toLowerCase())) return;
    const next = [...catalogoAlergias, t];
    setCatalogoAlergias(next);
    const { data: row } = await supabase.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
    const cfg: any = (row?.config && typeof row.config === 'object') ? row.config : {};
    await supabase.from('negocio_config').upsert(
      { negocio_id: negocioId, config: { ...cfg, catalogoAlergias: next }, updated_at: new Date().toISOString() },
      { onConflict: 'negocio_id' }
    );
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

  // Demo guiada: abrir/cerrar la ficha de un cliente de ejemplo desde la guia.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDemo = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      if (action === 'ficha') {
        // En el tour abrimos la ficha a pantalla completa para que luzca.
        if (clientes.length > 0) {
          setSelected(clientes[0].id);
          setActiveTab('resumen');
          setPanelExpanded(true);
        } else {
          // Aun no hay datos: lo resolvemos cuando lleguen.
          demoFichaPending.current = true;
        }
      } else if (action === 'cerrar') {
        setSelected(null);
        setPanelExpanded(false);
      }
    };
    window.addEventListener('mecha-demo', onDemo);
    return () => window.removeEventListener('mecha-demo', onDemo);
  }, [clientes]);

  // Resuelve una peticion de ficha que llego antes de tener clientes cargados.
  useEffect(() => {
    if (demoFichaPending.current && clientes.length > 0) {
      demoFichaPending.current = false;
      setSelected(clientes[0].id);
      setActiveTab('resumen');
      setPanelExpanded(true);
    }
  }, [clientes]);

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
      if (activeTagFilter === 'Inactivas') list = list.filter((cl) => cl.actividad === 'Inactiva');
      else if (activeTagFilter === 'Riesgo') list = list.filter((cl) => cl.riesgo === 'Alto riesgo' || cl.riesgo === 'Incidencias');
      else list = list.filter((cl) => cl.tag === activeTagFilter);
    }
    return list;
  }, [clientes, searchText, activeTagFilter]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: TOKENS.bg, color: TOKENS.text }}>Cargando...</div>;

  const tagCounts: Record<string, number> = {
    Todos: clientes.length,
    VIP: clientes.filter((x) => x.tag === 'VIP').length,
    Habitual: clientes.filter((x) => x.tag === 'Habitual').length,
    Nuevo: clientes.filter((x) => x.tag === 'Nuevo').length,
    Inactivas: clientes.filter((x) => x.actividad === 'Inactiva').length,
    Riesgo: clientes.filter((x) => x.riesgo === 'Alto riesgo' || x.riesgo === 'Incidencias').length,
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
            style={{ padding: '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={16} color="#fff" />
            Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: !c ? '1fr 0px' : (panelExpanded ? '0fr 1fr' : '1fr 420px'), overflow: 'hidden', transition: 'grid-template-columns 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
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
            {(['Todos', 'VIP', 'Habitual', 'Nuevo', 'Inactivas', 'Riesgo'] as const).map((t) => {
              const color = t === 'VIP' ? TOKENS.warning : t === 'Habitual' ? TOKENS.primary : t === 'Nuevo' ? TOKENS.success : t === 'Inactivas' ? TOKENS.textTer : t === 'Riesgo' ? TOKENS.danger : TOKENS.primary;
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
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 32px', padding: '10px 16px', fontSize: 10, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, background: 'rgba(244,80,30,0.04)' }}>
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
                    background: isSel ? 'rgba(244,80,30,0.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={cl.nombre} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{cl.nombre}</div>
                        <Pill color={tagColor}>{cl.tag}</Pill>
                        {cl.actividad === 'Inactiva' && <Pill color={TOKENS.textTer}>Inactiva</Pill>}
                        {cl.actividad === 'Riesgo abandono' && <Pill color="#f59e0b">Riesgo</Pill>}
                        {cl.riesgo === 'Alto riesgo' && <Pill color={TOKENS.danger}>No-show</Pill>}
                        {(() => {
                          const alergiasTexto = (cl.alergias ?? '').trim();
                          if (!alergiasTexto) return null;
                          return (
                            <span title={`Alergias: ${alergiasTexto}`} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: TOKENS.danger, opacity: 0.7, flexShrink: 0 }} />
                          );
                        })()}
                        {(() => {
                          // Cumpleanos proximo (proximos 7 dias): mismo criterio que la ficha y los avisos
                          if (!cl.fecha_nacimiento) return null;
                          const fn = new Date(cl.fecha_nacimiento);
                          if (isNaN(fn.getTime())) return null;
                          const today = new Date();
                          const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                          let next = new Date(today.getFullYear(), fn.getMonth(), fn.getDate());
                          let diff = Math.ceil((next.getTime() - t0) / 86400000);
                          if (diff < 0) { next = new Date(today.getFullYear() + 1, fn.getMonth(), fn.getDate()); diff = Math.ceil((next.getTime() - t0) / 86400000); }
                          if (diff < 0 || diff > 7) return null;
                          const txt = diff === 0 ? 'Cumple hoy' : diff === 1 ? 'Cumple mañana' : `Cumple en ${diff} días`;
                          return (
                            <span title={txt} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'rgba(251,146,60,0.14)', flexShrink: 0 }}>
                              <Icon name="cake" size={11} color="#fb923c" />
                            </span>
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
          <div key={c.id} className="m-slide-right" style={{ borderLeft: `1px solid ${TOKENS.border}`, padding: panelExpanded ? '24px 0' : 24, overflowY: 'auto', background: 'linear-gradient(180deg, rgba(244,80,30,0.04), transparent 30%)', minWidth: 0 }}>
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
            {/* Ficha formal del cliente */}
            {(() => {
              const tagColor = c.tag === 'VIP' ? TOKENS.warning : c.tag === 'Habitual' ? TOKENS.primary : TOKENS.success;
              const cumpleStr = c.fecha_nacimiento
                ? (() => { const d = new Date(c.fecha_nacimiento); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' }); })()
                : '—';
              const desdeStr = c.primeraVisita
                ? c.primeraVisita.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                : null;
              return (
                <div style={{ position: 'relative', overflow: 'hidden', background: panelExpanded ? 'linear-gradient(135deg,#ffffff 0%,#fff7f2 58%,#ffe9dc 100%)' : TOKENS.bgCard, border: `1px solid ${panelExpanded ? 'rgba(244,80,30,0.20)' : TOKENS.border}`, borderRadius: panelExpanded ? 20 : 16, padding: panelExpanded ? 28 : 18, marginBottom: 14, boxShadow: panelExpanded ? '0 18px 48px rgba(244,80,30,0.10), 0 2px 10px rgba(40,30,24,0.06)' : '0 1px 3px rgba(40,30,24,0.05)' }}>
                  {panelExpanded && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#e0340e,#ff7a2e,#ffcf4a)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar name={c.nombre} size={panelExpanded ? 66 : 56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: panelExpanded ? 23 : 20, fontWeight: 700, color: TOKENS.text, letterSpacing: -0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</div>
                      <div style={{ fontSize: 12, color: TOKENS.textTer, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {desdeStr ? `Cliente desde ${desdeStr}` : 'Cliente nuevo'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <Pill color={tagColor}>
                          <Icon name="star" size={11} color={tagColor} />
                          <span style={{ marginLeft: 4 }}>{c.tag}</span>
                        </Pill>
                        {c.actividad === 'Inactiva' && <Pill color={TOKENS.textTer}>Inactiva</Pill>}
                        {c.actividad === 'Riesgo abandono' && <Pill color={TOKENS.warning}>Riesgo abandono</Pill>}
                        {c.riesgo === 'Alto riesgo' && <Pill color={TOKENS.danger}>No-show</Pill>}
                        {c.riesgo === 'Incidencias' && <Pill color={TOKENS.warning}>Incidencias</Pill>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: panelExpanded ? 'repeat(4, 1fr)' : '1fr 1fr', gap: '14px 18px', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
                    <ContactRow icon="phone" label="Teléfono" value={c.telefono || '—'} accent={c.telefono ? TOKENS.primary : undefined} />
                    <ContactRow icon="mail" label="Email" value={c.email || '—'} accent={c.email ? TOKENS.cyan : undefined} />
                    <ContactRow icon="cake" label="Cumpleaños" value={cumpleStr} accent={cumpleStr !== '—' ? '#fb923c' : undefined} />
                    <ContactRow icon="user" label="Prof. habitual" value={c.profHabitual || '—'} accent={c.profHabitual ? TOKENS.violet : undefined} />
                  </div>
                </div>
              );
            })()}

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
                { l: 'Reservar cita', icon: 'calendar', p: true, action: () => router.push({ pathname: '/screens/nueva-cita', params: { clienteId: c.id } } as any) },
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
                    background: a.p ? 'linear-gradient(180deg,#ff7a2e,#f4501e)' : TOKENS.bgCard,
                    border: a.p ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${TOKENS.border}`,
                    borderRadius: 12,
                    color: a.p ? '#fff' : TOKENS.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: a.p ? '0 4px 14px rgba(244,80,30,0.4)' : 'none',
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
                {activeTab === 'resumen' && (
                  <>
                    <ResumenTab cliente={c} citas={citas} servicios={servicios} />
                    <NotasClienteSection cliente={c} plantillas={plantillasNota} onUpdated={(updated) => {
                      setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                    }} />
                  </>
                )}
                {activeTab === 'notas' && <NotasTab cliente={c} catalogoAlergias={catalogoAlergias} onSaveToCatalog={addAlergiaToCatalog} onUpdated={(updated) => {
                  setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  triggerRefresh();
                }} />}
                {activeTab === 'color' && <ColorTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} negocioId={negocioId} onChanged={async () => { await cargar(); triggerRefresh(); }} />}
                {activeTab === 'historial' && <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} />}
              </div>
            ) : (
              // Modo expandido: todas las secciones a la vez en cuadricula
              <div className="m-tab-content m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Fila 1: Resumen (banda completa) */}
                <Panel title="Resumen" accent={TOKENS.primary}>
                  <ResumenTab cliente={c} citas={citas} servicios={servicios} />
                </Panel>

                {/* Fila 1.5: Notas y preferencias persistentes del cliente */}
                <Panel title="Notas y preferencias" accent={TOKENS.primary}>
                  <NotasClienteSection cliente={c} plantillas={plantillasNota} bare onUpdated={(updated) => {
                    setClientes((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
                  }} />
                </Panel>

                {/* Fila 2: Notas + Color/Quimica (50/50) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <Panel title="Alergias" accent={TOKENS.danger}>
                    <NotasTab cliente={c} catalogoAlergias={catalogoAlergias} onSaveToCatalog={addAlergiaToCatalog} onUpdated={(updated) => {
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
                  <HistorialTab cliente={c} citas={citas} servicios={servicios} profesionales={profesionales} fichasTecnicas={fichasTecnicas} />
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
            <div style={{ background: 'linear-gradient(180deg, rgba(244,80,30,0.12), rgba(244,80,30,0.04))', border: `1px solid rgba(244,80,30,0.30)`, borderRadius: 12, padding: 14 }}>
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

// ── Notas y preferencias persistentes del cliente (campo clientes.notas).
// Siempre visible en la ficha; admite cargar plantillas de notas del salon.
function NotasClienteSection({ cliente, plantillas = [], onUpdated, bare = false }: {
  cliente: Cliente;
  plantillas?: { nombre: string; texto: string }[];
  onUpdated: (updated: Partial<Cliente> & { id: string }) => void;
  bare?: boolean;
}) {
  const [notas, setNotas] = useState((cliente.notas ?? '').trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setNotas((cliente.notas ?? '').trim()); }, [cliente.id]);

  async function persist(next: string) {
    const trimmed = next.trim();
    setError(''); setSaving(true);
    const payload = { notas: trimmed || null };
    const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onUpdated({ id: cliente.id, ...payload });
  }
  function save() { void persist(notas); }

  // Inserta una plantilla: si ya hay notas, la anade en una linea nueva.
  function aplicarPlantilla(texto: string) {
    const base = notas.trim();
    const next = base ? `${base}\n${texto}` : texto;
    setNotas(next);
    setPickerOpen(false);
    void persist(next);
  }

  const body = (
    <>
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={save}
        placeholder="Preferencias y detalles del cliente: 'le gusta el pelo mas corto', 'acabado con mas brillo', bebida, conversacion, etc."
        style={{
          width: '100%', minHeight: 120, padding: 12,
          background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
          borderRadius: 10, color: TOKENS.text, fontSize: 12, fontFamily: 'inherit',
          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: error ? TOKENS.danger : TOKENS.textTer }}>
          {saving ? 'Guardando...' : (error || 'Se guarda al salir del campo')}
        </div>
        {plantillas.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
                borderRadius: 8, cursor: 'pointer', background: TOKENS.bgCardHi,
                border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <Icon name="plus" size={12} color={TOKENS.textTer} /> Plantillas
            </button>
            {pickerOpen && (
              <div style={{
                position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 20,
                minWidth: 230, maxHeight: 240, overflowY: 'auto', background: TOKENS.bgPanel,
                border: `1px solid ${TOKENS.borderHi}`, borderRadius: 10,
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)', padding: 6,
              }}>
                {plantillas.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => aplicarPlantilla(p.texto)}
                    title={p.texto}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                      borderRadius: 7, cursor: 'pointer', background: 'transparent', border: 'none',
                      color: TOKENS.text, fontSize: 12, fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = TOKENS.bgCardHi; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: TOKENS.textTer, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.texto}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
  return bare ? body : <Section title="Notas y preferencias">{body}</Section>;
}

// ── Tab: Alergias
function NotasTab({ cliente, onUpdated, catalogoAlergias = [], onSaveToCatalog }: {
  cliente: Cliente;
  citas?: Cita[];
  profesionales?: any[];
  servicios?: any[];
  onUpdated: (updated: Partial<Cliente> & { id: string }) => void;
  catalogoAlergias?: string[];
  onSaveToCatalog?: (term: string) => Promise<void>;
}) {
  const [alergias, setAlergias] = useState((cliente.alergias ?? '').trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  const [guardarEnCatalogo, setGuardarEnCatalogo] = useState(false);

  useEffect(() => {
    setAlergias((cliente.alergias ?? '').trim());
  }, [cliente.id]);

  // Términos actuales (separados por coma o salto de línea)
  const terms = alergias.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  const hasTerm = (t: string) => terms.some((x) => x.toLowerCase() === t.toLowerCase());

  async function persist(next: string) {
    const trimmed = next.trim();
    setAlergias(trimmed);
    setError('');
    setSaving(true);
    const payload = { alergias: trimmed || null };
    const { error } = await supabase.from('clientes').update(payload).eq('id', cliente.id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onUpdated({ id: cliente.id, ...payload });
  }

  function save() { void persist(alergias); }

  function toggleTerm(t: string) {
    if (hasTerm(t)) {
      void persist(terms.filter((x) => x.toLowerCase() !== t.toLowerCase()).join(', '));
    } else {
      void persist(terms.length ? `${terms.join(', ')}, ${t}` : t);
    }
  }

  async function addCustom() {
    const t = custom.trim();
    if (!t) return;
    if (!hasTerm(t)) {
      await persist(terms.length ? `${terms.join(', ')}, ${t}` : t);
    }
    if (guardarEnCatalogo && onSaveToCatalog) await onSaveToCatalog(t);
    setCustom('');
    setGuardarEnCatalogo(false);
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

      {/* Alergias frecuentes: toggle rápido desde el catálogo del centro */}
      {catalogoAlergias.length > 0 && (
        <Section title="Alergias frecuentes">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {catalogoAlergias.map((a) => {
              const active = hasTerm(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleTerm(a)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                    background: active ? TOKENS.dangerSoft : TOKENS.bgCardHi,
                    border: `1px solid ${active ? 'rgba(239,68,68,0.45)' : TOKENS.border}`,
                    color: active ? TOKENS.danger : TOKENS.textSec,
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}
                >
                  <Icon name={active ? 'check' : 'plus'} size={12} color={active ? TOKENS.danger : TOKENS.textTer} />
                  {a}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textTer, marginTop: 8 }}>
            Toca para añadir o quitar. Gestiona la lista en Configuracion &gt; Plantillas.
          </div>
        </Section>
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

        {/* Añadir alergia personalizada con opción de guardar en el catálogo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addCustom(); } }}
            placeholder="Añadir otra alergia..."
            style={{
              flex: 1, minWidth: 160, padding: '8px 11px',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
              borderRadius: 9, color: TOKENS.text, fontSize: 12,
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => setGuardarEnCatalogo((v) => !v)}
            title="Guardar tambien en alergias frecuentes del centro"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
              background: guardarEnCatalogo ? TOKENS.bgCardHi : 'transparent',
              border: `1px solid ${guardarEnCatalogo ? TOKENS.borderHi : TOKENS.border}`,
              color: guardarEnCatalogo ? TOKENS.text : TOKENS.textSec,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 5, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              background: guardarEnCatalogo ? TOKENS.primary : 'transparent',
              border: `1px solid ${guardarEnCatalogo ? TOKENS.primary : TOKENS.borderHi}`,
            }}>
              {guardarEnCatalogo && <Icon name="check" size={10} color="#fff" />}
            </span>
            Guardar en frecuentes
          </button>
          <button
            onClick={() => void addCustom()}
            disabled={!custom.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9,
              cursor: custom.trim() ? 'pointer' : 'not-allowed',
              background: custom.trim() ? TOKENS.primary : TOKENS.bgCardHi,
              border: `1px solid ${custom.trim() ? TOKENS.primary : TOKENS.border}`,
              color: custom.trim() ? '#fff' : TOKENS.textTer,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            <Icon name="plus" size={13} color={custom.trim() ? '#fff' : TOKENS.textTer} />
            Añadir
          </button>
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
          <div style={{ display: 'inline-flex', padding: 10, background: 'rgba(192,38,10,0.10)', borderRadius: 999, color: TOKENS.violet, marginBottom: 8 }}>
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
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(192,38,10,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: 12, cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.violet, letterSpacing: 0.4, textTransform: 'uppercase' }}>{fechaStr}</span>
                    <Pill color={TOKENS.violet}>{tipoLabel}</Pill>
                    {ficha.cerrada && (
                      <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.10)', color: TOKENS.warning, fontSize: 9, fontWeight: 700, letterSpacing: 0.4 }}>CERRADA</span>
                    )}
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
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(192,38,10,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
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
  const isLocked = mode === 'edit' && ficha?.cerrada === true;

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
    if (isLocked) return;
    setTecnicas(tecnicas.includes(t) ? tecnicas.filter((x) => x !== t) : [...tecnicas, t]);
  }

  async function duplicarUltimaFormula() {
    const { data } = await supabase
      .from('fichas_tecnicas_color')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('negocio_id', negocioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) { setError('No hay formulas anteriores para copiar'); return; }

    setTipoServicio(data.tipo_servicio ?? 'coloracion_global');
    setMarcaProducto(data.marca_producto ?? '');
    setFormulaEntries(
      Array.isArray(data.formula) && data.formula.length > 0
        ? data.formula.map((f: any) => ({ numero: f.numero ?? '', gramos: String(f.gramos ?? '') }))
        : [{ numero: '', gramos: '' }]
    );
    setOxidanteVol(data.oxidante_volumen != null ? String(data.oxidante_volumen) : '');
    setOxidanteProp(data.oxidante_proporcion ?? '');
    setTiempoExp(data.tiempo_exposicion_min != null ? String(data.tiempo_exposicion_min) : '');
    setTecnicas(data.tecnica_aplicacion ?? []);
    setBaseNatural(data.base_natural ?? '');
    setColorPrevio(data.color_previo ?? '');
    setPorcCanas(data.porcentaje_canas != null ? String(data.porcentaje_canas) : '');
    setError('');
  }

  async function cerrarFicha() {
    if (!ficha?.id) return;
    if (!confirm('Al cerrar la ficha no se podra editar. Continuar?')) return;
    setLoading(true);
    await supabase.from('fichas_tecnicas_color').update({ cerrada: true }).eq('id', ficha.id);
    setLoading(false);
    await onSaved();
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
      <div className="m-modal-enter" style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(192,38,10,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(192,38,10,0.14)', color: TOKENS.violet, display: 'grid', placeItems: 'center' }}>
              <Icon name="droplet" size={16} color={TOKENS.violet} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TOKENS.text }}>{isLocked ? 'Ficha de color (cerrada)' : mode === 'edit' ? 'Editar ficha de color' : 'Nueva ficha de color'}</h3>
            {isLocked && (
              <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.12)', color: TOKENS.warning, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>CERRADA</span>
            )}
          </div>
          <button className="m-btn-icon m-btn-icon-close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={14} color={TOKENS.textSec} />
          </button>
        </div>

        {mode === 'add' && (
          <button
            onClick={duplicarUltimaFormula}
            style={{ width: '100%', padding: '10px 14px', background: 'rgba(244,80,30,0.08)', border: '1px solid rgba(244,80,30,0.25)', borderRadius: 10, color: TOKENS.primaryHi, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14, textAlign: 'center' }}
          >
            Copiar ultima formula de esta clienta
          </button>
        )}

        {/* Form wrapper - disabled when locked */}
        <div style={{ pointerEvents: isLocked ? 'none' : 'auto', opacity: isLocked ? 0.6 : 1 }}>

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
                style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: active ? '1px solid rgba(192,38,10,0.50)' : `1px solid ${TOKENS.border}`, background: active ? 'rgba(192,38,10,0.14)' : TOKENS.bgCard, color: active ? TOKENS.violet : TOKENS.textSec, transition: 'all 0.15s ease' }}
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

        </div>{/* End form wrapper */}

        {error && <div style={{ padding: '10px 12px', background: TOKENS.dangerSoft, border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10, color: TOKENS.danger, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {isLocked ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
            <button onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Cerrar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 14, borderTop: `1px solid ${TOKENS.border}` }}>
            {mode === 'edit' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="m-btn-danger"
                  onClick={handleDelete}
                  disabled={loading}
                  style={{ padding: '9px 14px', background: 'transparent', border: `1px solid rgba(239,68,68,0.35)`, color: TOKENS.danger, borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="trash" size={14} color={TOKENS.danger} />
                  Eliminar
                </button>
                <button
                  onClick={cerrarFicha}
                  disabled={loading}
                  style={{ padding: '9px 14px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: TOKENS.warning, borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Cerrar ficha
                </button>
              </div>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="m-btn-secondary" onClick={onClose} style={{ padding: '9px 14px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.text, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Cancelar
              </button>
              <button className="m-btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '9px 14px', background: 'linear-gradient(180deg,#e0340e 0%,#c0260a 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(192,38,10,0.40)' }}>
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
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

// Fila de dato de contacto para la ficha formal del cliente
function ContactRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  const isEmpty = value === '—' || !value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={15} color={accent || TOKENS.textTer} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13, color: isEmpty ? TOKENS.textTer : TOKENS.text, fontWeight: isEmpty ? 500 : 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={isEmpty ? undefined : value}>{value}</div>
      </div>
    </div>
  );
}

// ── Tab: Historial
function HistorialTab({ cliente, citas, servicios, profesionales = [], fichasTecnicas = [] }: { cliente: Cliente; citas: Cita[]; servicios: any[]; profesionales?: any[]; fichasTecnicas?: any[] }) {
  const [detailCita, setDetailCita] = useState<Cita | null>(null);
  const clientCitas = citas
    .filter((cit) => cit.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  if (clientCitas.length === 0) {
    return <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '10px 0' }}>Sin historial</div>;
  }

  const estadoStyle: Record<string, { bg: string; color: string; label: string }> = {
    confirmada: { bg: 'rgba(244,80,30,0.12)', color: TOKENS.primaryHi, label: 'Confirmada' },
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
        <div style={{ padding: '5px 10px', background: 'rgba(244,80,30,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: TOKENS.primaryHi }}>
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

        const tieneFicha = fichasTecnicas.some((f: any) => f.cita_id === h.id);
        const tieneFormula = !!(h.formula_producto || h.formula_tono || h.formula_resultado || h.formula_notas || h.formula_tiempo_min != null);
        return (
          <div
            key={h.id}
            onClick={() => setDetailCita(h)}
            title="Ver detalle completo de la cita"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10,
              transition: 'all 0.15s ease', cursor: 'pointer',
              animation: `fadeIn 0.2s ease ${idx * 0.03}s both`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.borderHi; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: prof?.color || TOKENS.primary, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TOKENS.text }}>{srv?.nombre || 'Servicio'}</div>
                {(tieneFicha || tieneFormula) && (
                  <span title="Tiene ficha de color / quimica" style={{ display: 'inline-flex', color: TOKENS.violet }}>
                    <Icon name="droplet" size={11} color={TOKENS.violet} />
                  </span>
                )}
              </div>
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
            <Icon name="chevronRight" size={14} color={TOKENS.textTer} />
          </div>
        );
      })}

      {detailCita && (
        <CitaDetalleModal
          cita={detailCita}
          cliente={cliente}
          servicio={servicios.find((s) => s.id === detailCita.servicio_id)}
          profesional={profesionales.find((p: any) => p.id === detailCita.profesional_id)}
          ficha={fichasTecnicas.find((f: any) => f.cita_id === detailCita.id) || null}
          onClose={() => setDetailCita(null)}
        />
      )}
    </div>
  );
}

// ── Modal full-screen: detalle completo de una cita (servicio + quimica + notas)
function CitaDetalleModal({ cita, cliente, servicio, profesional, ficha, onClose }: {
  cita: Cita; cliente: Cliente; servicio?: any; profesional?: any; ficha: any | null; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const TIPOS: Record<string, string> = {
    coloracion_global: 'Color global', color_raiz: 'Color raiz', mechas: 'Mechas',
    balayage: 'Balayage', decoloracion: 'Decoloracion', matiz: 'Matiz',
    bano_color: 'Bano de color', correccion_color: 'Correccion', color_fantasia: 'Color fantasia', otro: 'Otro',
  };
  const estadoStyle: Record<string, { bg: string; color: string; label: string }> = {
    confirmada: { bg: 'rgba(244,80,30,0.12)', color: TOKENS.primaryHi, label: 'Confirmada' },
    completada: { bg: 'rgba(15,157,107,0.14)', color: TOKENS.success, label: 'Completada' },
    cancelada: { bg: 'rgba(226,59,52,0.12)', color: TOKENS.danger, label: 'Cancelada' },
    no_presentada: { bg: 'rgba(224,138,0,0.14)', color: TOKENS.warning, label: 'No presentada' },
  };

  const fecha = new Date(cita.inicio);
  const fin = cita.fin ? new Date(cita.fin) : null;
  const fechaLarga = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const horaIni = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const horaFin = fin ? fin.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
  const est = estadoStyle[cita.estado || 'confirmada'] || estadoStyle.confirmada;
  const precio = servicio?.precio ?? 0;
  const duracionMin = fin ? Math.round((fin.getTime() - fecha.getTime()) / 60000) : (servicio?.duracion_activa_min ?? null);
  const alergiasTexto = (cliente.alergias ?? '').trim();

  const formulaArr = Array.isArray(ficha?.formula) ? ficha!.formula : [];
  const tecnicas: string[] = Array.isArray(ficha?.tecnica_aplicacion) ? ficha!.tecnica_aplicacion : [];
  const hayQuimicaLegacy = !ficha && !!(cita.formula_producto || cita.formula_tono || cita.formula_resultado || cita.formula_notas || cita.formula_tiempo_min != null);

  return createPortal(
    <div
      className="m-overlay-enter"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28,24,20,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        className="m-modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 880, maxHeight: '92vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 20, boxShadow: '0 40px 90px rgba(28,24,20,0.35)' }}
      >
        {/* Cabecera */}
        <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 26px', borderBottom: `1px solid ${TOKENS.border}`, background: 'linear-gradient(180deg, rgba(244,80,30,0.06), transparent)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: TOKENS.text }}>{servicio?.nombre || 'Servicio'}</h2>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, background: est.bg, color: est.color, textTransform: 'uppercase' }}>{est.label}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: TOKENS.textSec, textTransform: 'capitalize' }}>{fechaLarga}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: TOKENS.textTer }}>
              {horaIni}{horaFin ? `–${horaFin}` : ''}{duracionMin ? ` · ${duracionMin} min` : ''}
            </div>
          </div>
          <button className="m-btn-icon-close" onClick={onClose} title="Cerrar (Esc)" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="x" size={16} color={TOKENS.textSec} />
          </button>
        </div>

        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Datos clave */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <DetailStat label="Profesional" value={profesional?.nombre || '—'} dot={profesional?.color} />
            <DetailStat label="Precio" value={precio > 0 ? `${precio} EUR` : '—'} tone={cita.estado === 'completada' ? TOKENS.success : TOKENS.text} />
            <DetailStat label="Cliente" value={cliente.nombre} />
          </div>

          {/* Alergias relevantes */}
          {alergiasTexto && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(226,59,52,0.07)', border: `1px solid rgba(226,59,52,0.30)`, borderRadius: 12 }}>
              <Icon name="alert" size={16} color={TOKENS.danger} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.danger, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alergias del cliente</div>
                <div style={{ fontSize: 13, color: TOKENS.text, marginTop: 2 }}>{alergiasTexto}</div>
              </div>
            </div>
          )}

          {/* Quimica / formula */}
          {(ficha || hayQuimicaLegacy) ? (
            <Panel title="Color / Química" accent={TOKENS.violet}>
              {ficha ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Pill color={TOKENS.violet}>{TIPOS[ficha.tipo_servicio] || ficha.tipo_servicio}</Pill>
                    {ficha.marca_producto && <span style={{ fontSize: 12, color: TOKENS.textSec }}>{ficha.marca_producto}</span>}
                  </div>
                  {formulaArr.length > 0 && (
                    <div style={{ background: TOKENS.bgCardHi, borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Formula</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: TOKENS.text }}>
                        {formulaArr.map((f: any) => `${f.numero || '?'} (${f.gramos || '?'}g)`).join('  +  ')}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {ficha.oxidante_volumen && <FieldKV label="Oxidante" value={`${ficha.oxidante_volumen} vol${ficha.oxidante_proporcion ? ` (${ficha.oxidante_proporcion})` : ''}`} />}
                    {ficha.tiempo_exposicion_min && <FieldKV label="Tiempo exposicion" value={`${ficha.tiempo_exposicion_min} min`} />}
                    {ficha.base_natural && <FieldKV label="Base natural" value={ficha.base_natural} />}
                    {ficha.color_previo && <FieldKV label="Color previo" value={ficha.color_previo} />}
                    {ficha.porcentaje_canas != null && <FieldKV label="Canas" value={`${ficha.porcentaje_canas}%`} />}
                    {ficha.resultado_color && <FieldKV label="Resultado color" value={ficha.resultado_color} full />}
                    {ficha.resultado_notas && <FieldKV label="Notas resultado" value={ficha.resultado_notas} full />}
                  </div>
                  {tecnicas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {tecnicas.map((t) => <Pill key={t} color={TOKENS.cyan}>{t}</Pill>)}
                    </div>
                  )}
                  {ficha.incidencias && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '9px 11px', background: TOKENS.dangerSoft, border: `1px solid rgba(226,59,52,0.30)`, borderRadius: 9, fontSize: 12, color: TOKENS.danger }}>
                      <Icon name="alert" size={13} color={TOKENS.danger} />
                      <span>{ficha.incidencias}</span>
                    </div>
                  )}
                  {ficha.resultado_satisfactorio != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning }} />
                      <span style={{ fontSize: 11, color: ficha.resultado_satisfactorio ? TOKENS.success : TOKENS.warning, fontWeight: 600 }}>
                        {ficha.resultado_satisfactorio ? 'Resultado satisfactorio' : 'Resultado a revisar'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {cita.formula_producto && <FieldKV label="Producto" value={cita.formula_producto} />}
                  {cita.formula_tono && <FieldKV label="Tono" value={cita.formula_tono} />}
                  {cita.formula_tiempo_min != null && <FieldKV label="Tiempo" value={`${cita.formula_tiempo_min} min`} />}
                  {cita.formula_resultado && <FieldKV label="Resultado" value={cita.formula_resultado} full />}
                  {cita.formula_notas && <FieldKV label="Notas" value={cita.formula_notas} full />}
                </div>
              )}
            </Panel>
          ) : (
            <Panel title="Color / Química" accent={TOKENS.violet}>
              <div style={{ fontSize: 12, color: TOKENS.textTer }}>Esta cita no tiene ficha de color registrada.</div>
            </Panel>
          )}

          {/* Notas de la cita */}
          {cita.notas && (
            <Panel title="Notas de la cita" accent={TOKENS.primary}>
              <div style={{ fontSize: 13, color: TOKENS.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cita.notas}</div>
            </Panel>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Stat compacto para el detalle de cita
function DetailStat({ label, value, tone, dot }: { label: string; value: string; tone?: string; dot?: string }) {
  return (
    <div style={{ background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: TOKENS.textTer, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
        <span style={{ fontSize: 15, fontWeight: 700, color: tone || TOKENS.text }}>{value}</span>
      </div>
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
      <div className="m-modal-enter" style={{ width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: TOKENS.bgPanel, border: `1px solid ${TOKENS.borderHi}`, borderRadius: 18, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,80,30,0.15)' }}>
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
            <button className="m-btn-primary" onClick={handleGuardar} disabled={loading} style={{ padding: '9px 14px', background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, boxShadow: `0 6px 20px ${TOKENS.primaryGlow}` }}>
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
                  e.currentTarget.style.background = 'rgba(244,80,30,0.12)';
                  e.currentTarget.style.borderColor = TOKENS.primary;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = isSel ? 'rgba(244,80,30,0.18)' : 'transparent';
                e.currentTarget.style.borderColor = isSel ? TOKENS.primary : 'transparent';
              }}
              style={{
                height: 30,
                borderRadius: 7,
                background: isSel ? 'rgba(244,80,30,0.18)' : 'transparent',
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
      background: TOKENS.bgCard,
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 16,
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(40,30,24,0.05)',
    }}>
      {/* Accent bar superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${accent}33 100%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
        <div style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
        <div style={{ fontSize: 12, fontWeight: 800, color: TOKENS.text, letterSpacing: 0.5, textTransform: 'uppercase' }}>
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
