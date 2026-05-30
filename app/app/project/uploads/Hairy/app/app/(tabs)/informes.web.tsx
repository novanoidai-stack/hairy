import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserProfile, canAccessInformes } from '@/lib/auth';
import { NEGOCIO_ID_FALLBACK, CITA_STATUS, HORARIO_APERTURA, HORARIO_CIERRE } from '@/lib/constants';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths,
  differenceInMinutes, differenceInDays, format, parseISO, isValid,
  eachDayOfInterval, getDay,
} from 'date-fns';
import { es } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------
const Icon = ({ name, size = 24, color = '#f8fafc' }: any) => {
  const icons: any = {
    barChart: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    trendingUp: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    trendingDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    users: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    dollar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    alertTriangle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    download: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    scissors: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
    repeat: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    percent: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    chevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevronUp: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`,
    zap: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    heart: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    fileText: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  };
  return <div style={{ display: 'inline-flex', color }} dangerouslySetInnerHTML={{ __html: icons[name] || '' }} />;
};

// ---------------------------------------------------------------------------
// Design tokens (identical across all .web.tsx files)
// ---------------------------------------------------------------------------
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
  rose: '#f43f5e',
  roseSoft: 'rgba(244,63,94,0.14)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245,158,11,0.14)',
};

// ---------------------------------------------------------------------------
// Animations (consistent with AgendaCalendar / equipo / clientes)
// ---------------------------------------------------------------------------
const ANIMATIONS = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 8px rgba(99,102,241,0.3); }
    50% { box-shadow: 0 0 16px rgba(99,102,241,0.6); }
  }
  @keyframes shimmer {
    0% { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .informe-topbar {
    animation: fadeIn 0.5s ease both;
  }
  .kpi-card {
    animation: slideInUp 0.55s cubic-bezier(0.16,1,0.3,1) both;
  }
  .section-card {
    animation: scaleIn 0.45s cubic-bezier(0.16,1,0.3,1) both;
  }
  .bar-fill {
    transition: width 0.8s cubic-bezier(0.16,1,0.3,1);
  }
  .metric-row:hover {
    background: ${TOKENS.bgCardHi} !important;
    transform: translateX(2px);
  }
  .metric-row {
    transition: all 0.2s ease;
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Cita {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
  estado: string;
  profesional_id: string;
  servicio_id?: string;
  cliente_id?: string;
}

interface Profesional {
  id: string;
  nombre: string;
  color: string;
  activo: boolean;
  categoria?: string;
}

interface Servicio {
  id: string;
  nombre: string;
  precio: number;
  duracion_activa_min: number;
  duracion_espera_min?: number;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
}

type Periodo = 'semana' | 'mes' | '3meses' | 'anio';

type SeccionId = 'ocupacion' | 'noshows' | 'espera' | 'reposo' | 'ingresos' | 'servicios' | 'retencion' | 'comisiones';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getRango(p: Periodo): { desde: Date; hasta: Date } {
  const now = new Date();
  switch (p) {
    case 'semana':
      return { desde: startOfWeek(now, { weekStartsOn: 1 }), hasta: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'mes':
      return { desde: startOfMonth(now), hasta: endOfMonth(now) };
    case '3meses':
      return { desde: startOfMonth(subMonths(now, 2)), hasta: endOfMonth(now) };
    case 'anio':
      return { desde: new Date(now.getFullYear(), 0, 1), hasta: new Date(now.getFullYear(), 11, 31) };
  }
}

function fmtEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}

function diasLaborales(desde: Date, hasta: Date): number {
  const dias = eachDayOfInterval({ start: desde, end: hasta });
  return dias.filter(d => getDay(d) !== 0).length; // excluir domingos
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const FRANJAS = ['09-11', '11-13', '13-15', '15-17', '17-20'];
function franjaIndex(hora: number): number {
  if (hora < 11) return 0;
  if (hora < 13) return 1;
  if (hora < 15) return 2;
  if (hora < 17) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// CSV export helper (9.9)
// ---------------------------------------------------------------------------
function descargarCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '﻿';
  const csv = bom + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function InformesScreen() {
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [negocioId, setNegocioId] = useState('');

  // Data
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // UI
  const [expandedSections, setExpandedSections] = useState<Set<SeccionId>>(new Set(['ocupacion', 'ingresos']));
  const [comisionPct, setComisionPct] = useState<number>(30);
  const [comisionCustom, setComisionCustom] = useState<string>('');

  const toggleSection = (id: SeccionId) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  useEffect(() => { cargar(); }, [periodo]);

  async function cargar() {
    setLoading(true);
    const profile = await getUserProfile();
    if (!canAccessInformes(profile)) { setAccessDenied(true); setLoading(false); return; }
    const nId = profile?.negocio_id || NEGOCIO_ID_FALLBACK;
    setNegocioId(nId);

    const { desde, hasta } = getRango(periodo);

    const [citaRes, profRes, srvRes, cltRes] = await Promise.all([
      supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
        .eq('negocio_id', nId)
        .gte('inicio', desde.toISOString())
        .lte('inicio', hasta.toISOString()),
      supabase.from('profesionales').select('id, nombre, color, activo, categoria').eq('negocio_id', nId),
      supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min').eq('negocio_id', nId),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId),
    ]);

    setCitas(citaRes.data ?? []);
    setProfesionales(profRes.data ?? []);
    setServicios(srvRes.data ?? []);
    setClientes(cltRes.data ?? []);
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Lookup maps
  // -------------------------------------------------------------------------
  const profMap = useMemo(() => new Map(profesionales.map(p => [p.id, p])), [profesionales]);
  const srvMap = useMemo(() => new Map(servicios.map(s => [s.id, s])), [servicios]);
  const cltMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  // -------------------------------------------------------------------------
  // Derived metrics
  // -------------------------------------------------------------------------

  // Filter active professionals only
  const profsActivos = useMemo(() => profesionales.filter(p => p.activo), [profesionales]);

  const completadas = useMemo(() => citas.filter(c => c.estado === CITA_STATUS.COMPLETADA), [citas]);
  const confirmadas = useMemo(() => citas.filter(c => c.estado === CITA_STATUS.CONFIRMADA), [citas]);
  const noShows = useMemo(() => citas.filter(c => c.estado === CITA_STATUS.NO_PRESENTADA), [citas]);
  const canceladas = useMemo(() => citas.filter(c => c.estado === CITA_STATUS.CANCELADA), [citas]);
  const activas = useMemo(() => [...completadas, ...confirmadas], [completadas, confirmadas]);

  // -- 9.10: KPIs --
  const totalCitas = citas.length;
  const totalIngresos = useMemo(() => {
    return activas.reduce((sum, c) => sum + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
  }, [activas, srvMap]);

  const tasaNoShow = totalCitas > 0 ? (noShows.length / totalCitas) * 100 : 0;

  // -- 9.1: Ocupacion por profesional / franja / dia --
  // Porcentajes relativos al total de citas (no horas disponibles)
  const ocupacionData = useMemo(() => {
    const total = activas.length;

    const profCount: Record<string, number> = {};
    const franjaCount = [0, 0, 0, 0, 0];
    const diaCount = [0, 0, 0, 0, 0, 0, 0];

    activas.forEach(c => {
      profCount[c.profesional_id] = (profCount[c.profesional_id] || 0) + 1;

      const hora = parseISO(c.inicio).getHours();
      franjaCount[franjaIndex(hora)]++;

      diaCount[parseISO(c.inicio).getDay()]++;
    });

    const porProf: { profId: string; nombre: string; color: string; citas: number; pct: number }[] = [];
    profsActivos.forEach(p => {
      const n = profCount[p.id] || 0;
      porProf.push({
        profId: p.id, nombre: p.nombre, color: p.color,
        citas: n, pct: total > 0 ? (n / total) * 100 : 0,
      });
    });
    porProf.sort((a, b) => b.citas - a.citas);

    return { porProf, franjaCount, diaCount, total };
  }, [activas, profsActivos]);

  const ocupacionGlobal = useMemo(() => {
    // Citas por profesional activo en el periodo (media)
    return profsActivos.length > 0 ? ocupacionData.total / profsActivos.length : 0;
  }, [ocupacionData, profsActivos]);

  // -- 9.2: No-shows --
  const noShowData = useMemo(() => {
    const porProf: Record<string, number> = {};
    const porServicio: Record<string, number> = {};
    noShows.forEach(c => {
      porProf[c.profesional_id] = (porProf[c.profesional_id] || 0) + 1;
      if (c.servicio_id) porServicio[c.servicio_id] = (porServicio[c.servicio_id] || 0) + 1;
    });
    return { porProf, porServicio, total: noShows.length, tasa: tasaNoShow };
  }, [noShows, tasaNoShow]);

  // -- 9.3: Tiempo medio de espera entre citas --
  const esperaData = useMemo(() => {
    const porProf: Record<string, number[]> = {};
    const sorted = [...activas].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const byProf: Record<string, typeof sorted> = {};
    sorted.forEach(c => {
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });

    // Group by day per professional
    Object.entries(byProf).forEach(([profId, pCitas]) => {
      const byDay: Record<string, typeof pCitas> = {};
      pCitas.forEach(c => {
        const day = c.inicio.slice(0, 10);
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(c);
      });

      Object.values(byDay).forEach(dayCitas => {
        const s = dayCitas.sort((a, b) => a.inicio.localeCompare(b.inicio));
        for (let i = 1; i < s.length; i++) {
          const gap = differenceInMinutes(parseISO(s[i].inicio), parseISO(s[i - 1].fin));
          if (gap > 0 && gap < 180) {
            if (!porProf[s[i].profesional_id]) porProf[s[i].profesional_id] = [];
            porProf[s[i].profesional_id].push(gap);
          }
        }
      });
    });

    const allGaps: number[] = Object.values(porProf).flat();
    const avgGlobal = allGaps.length > 0 ? allGaps.reduce((a, b) => a + b, 0) / allGaps.length : 0;

    return { porProf, avgGlobal };
  }, [activas]);

  // -- 9.4: % Reposo aprovechado --
  const reposoData = useMemo(() => {
    const byProf: Record<string, Cita[]> = {};
    activas.forEach(c => {
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });

    const porProf: Record<string, { totalMin: number; usedMin: number }> = {};
    let globalTotal = 0;
    let globalUsed = 0;

    Object.entries(byProf).forEach(([profId, profCitas]) => {
      let totalMin = 0;
      let usedMin = 0;
      profCitas.forEach(c => {
        if (!c.fin_activa || !c.fin_espera) return;
        const restStart = new Date(c.fin_activa).getTime();
        const restEnd = new Date(c.fin_espera).getTime();
        if (restEnd <= restStart) return;
        const esAnidada = profCitas.some(host => {
          if (host.id === c.id || !host.fin_activa || !host.fin_espera) return false;
          const hRS = new Date(host.fin_activa).getTime();
          const hRE = new Date(host.fin_espera).getTime();
          return new Date(c.inicio).getTime() >= hRS && new Date(c.inicio).getTime() < hRE;
        });
        if (esAnidada) return;
        totalMin += (restEnd - restStart) / 60000;
        profCitas.forEach(d => {
          if (d.id === c.id) return;
          const dS = new Date(d.inicio).getTime();
          const dF = new Date(d.fin).getTime();
          const ov = Math.max(0, Math.min(dF, restEnd) - Math.max(dS, restStart));
          usedMin += ov / 60000;
        });
      });
      if (totalMin > 0) {
        porProf[profId] = { totalMin, usedMin: Math.min(usedMin, totalMin) };
        globalTotal += totalMin;
        globalUsed += Math.min(usedMin, totalMin);
      }
    });

    const pctGlobal = globalTotal > 0 ? (globalUsed / globalTotal) * 100 : 0;
    return { porProf, pctGlobal, globalTotal, globalUsed };
  }, [activas]);

  // -- 9.5: Ingresos --
  const ingresosData = useMemo(() => {
    const porProf: Record<string, number> = {};
    const porServicio: Record<string, number> = {};
    const porCliente: Record<string, number> = {};

    activas.forEach(c => {
      const precio = srvMap.get(c.servicio_id ?? '')?.precio || 0;
      porProf[c.profesional_id] = (porProf[c.profesional_id] || 0) + precio;
      if (c.servicio_id) porServicio[c.servicio_id] = (porServicio[c.servicio_id] || 0) + precio;
      if (c.cliente_id) porCliente[c.cliente_id] = (porCliente[c.cliente_id] || 0) + precio;
    });

    return { porProf, porServicio, porCliente, total: totalIngresos };
  }, [activas, srvMap, totalIngresos]);

  // -- 9.6: Servicios top + combinaciones --
  const serviciosData = useMemo(() => {
    const conteo: Record<string, number> = {};
    activas.forEach(c => {
      if (c.servicio_id) conteo[c.servicio_id] = (conteo[c.servicio_id] || 0) + 1;
    });

    const ranking = Object.entries(conteo)
      .map(([id, count]) => ({ id, nombre: srvMap.get(id)?.nombre || id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Combinaciones: buscar citas del mismo cliente el mismo dia
    const combos: Record<string, number> = {};
    const byClienteDay: Record<string, string[]> = {};
    activas.forEach(c => {
      if (!c.cliente_id || !c.servicio_id) return;
      const key = `${c.cliente_id}|${c.inicio.slice(0, 10)}`;
      if (!byClienteDay[key]) byClienteDay[key] = [];
      byClienteDay[key].push(c.servicio_id);
    });
    Object.values(byClienteDay).forEach(srvIds => {
      if (srvIds.length < 2) return;
      const names = srvIds.map(id => srvMap.get(id)?.nombre || id).sort();
      const comboKey = names.join(' + ');
      combos[comboKey] = (combos[comboKey] || 0) + 1;
    });

    const topCombos = Object.entries(combos)
      .map(([combo, count]) => ({ combo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { ranking, topCombos, totalServicios: activas.length };
  }, [activas, srvMap]);

  // -- 9.7: Retencion --
  const retencionData = useMemo(() => {
    const clienteVisitas: Record<string, Date[]> = {};
    activas.forEach(c => {
      if (!c.cliente_id) return;
      if (!clienteVisitas[c.cliente_id]) clienteVisitas[c.cliente_id] = [];
      clienteVisitas[c.cliente_id].push(parseISO(c.inicio));
    });

    let totalFreq: number[] = [];
    let sinVisitaDias: number[] = [];
    const now = new Date();

    Object.entries(clienteVisitas).forEach(([clienteId, fechas]) => {
      const sorted = fechas.sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length >= 2) {
        for (let i = 1; i < sorted.length; i++) {
          totalFreq.push(differenceInDays(sorted[i], sorted[i - 1]));
        }
      }
      sinVisitaDias.push(differenceInDays(now, sorted[sorted.length - 1]));
    });

    const avgFreq = totalFreq.length > 0 ? totalFreq.reduce((a, b) => a + b, 0) / totalFreq.length : 0;
    const avgSinVisita = sinVisitaDias.length > 0 ? sinVisitaDias.reduce((a, b) => a + b, 0) / sinVisitaDias.length : 0;
    const clientesActivos = Object.keys(clienteVisitas).length;
    const inactivos = sinVisitaDias.filter(d => d > 60).length;
    const nuevos = Object.values(clienteVisitas).filter(v => v.length === 1).length;
    const recurrentes = Object.values(clienteVisitas).filter(v => v.length >= 3).length;

    return { avgFreq, avgSinVisita, clientesActivos, inactivos, nuevos, recurrentes };
  }, [activas]);

  // -- 9.8: Comisiones --
  const comisionesData = useMemo(() => {
    const porProf: { profId: string; nombre: string; color: string; ingresos: number; comision: number; citas: number }[] = [];

    profsActivos.forEach(p => {
      const profCitas = activas.filter(c => c.profesional_id === p.id);
      const ingresos = profCitas.reduce((s, c) => s + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
      porProf.push({
        profId: p.id,
        nombre: p.nombre,
        color: p.color,
        ingresos,
        comision: Math.round(ingresos * comisionPct / 100),
        citas: profCitas.length,
      });
    });
    porProf.sort((a, b) => b.ingresos - a.ingresos);
    return porProf;
  }, [profsActivos, activas, srvMap, comisionPct]);

  // -------------------------------------------------------------------------
  // CSV export callbacks (9.9)
  // -------------------------------------------------------------------------
  const exportOcupacion = useCallback(() => {
    const headers = ['Profesional', 'Citas', '% del total'];
    const rows = ocupacionData.porProf.map(p => [p.nombre, String(p.citas), fmtPct(p.pct)]);
    descargarCSV(`ocupacion_${periodo}.csv`, headers, rows);
  }, [ocupacionData, periodo]);

  const exportIngresos = useCallback(() => {
    const headers = ['Profesional', 'Ingresos (EUR)', 'Comision (EUR)'];
    const rows = comisionesData.map(p => [p.nombre, String(p.ingresos), String(p.comision)]);
    descargarCSV(`ingresos_${periodo}.csv`, headers, rows);
  }, [comisionesData, periodo]);

  const exportCompleto = useCallback(() => {
    const headers = ['ID Cita', 'Fecha', 'Profesional', 'Servicio', 'Cliente', 'Estado', 'Precio (EUR)'];
    const rows = citas.map(c => {
      const prof = profMap.get(c.profesional_id);
      const srv = srvMap.get(c.servicio_id ?? '');
      const clt = cltMap.get(c.cliente_id ?? '');
      return [
        c.id.slice(0, 8),
        format(parseISO(c.inicio), 'dd/MM/yyyy HH:mm'),
        prof?.nombre || '-',
        srv?.nombre || '-',
        clt?.nombre || '-',
        c.estado,
        String(srv?.precio || 0),
      ];
    });
    descargarCSV(`informe_completo_${periodo}.csv`, headers, rows);
  }, [citas, profMap, srvMap, cltMap, periodo]);

  // -------------------------------------------------------------------------
  // Periodo labels
  // -------------------------------------------------------------------------
  const periodoLabel = useMemo(() => {
    return `${format(desde, 'd MMM', { locale: es })} - ${format(hasta, 'd MMM yyyy', { locale: es })}`;
  }, [desde, hasta]);

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mes' },
    { key: '3meses', label: '3 Meses' },
    { key: 'anio', label: 'Anual' },
  ];

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const BarHorizontal = ({ pct, color, label, sublabel, delay = 0 }: { pct: number; color: string; label: string; sublabel?: string; delay?: number }) => (
    <div className="metric-row" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
      borderRadius: 8, cursor: 'default',
    }}>
      <div style={{ minWidth: 100, fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>{label}</div>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.08)' }}>
        <div className="bar-fill" style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transitionDelay: `${delay}ms`,
        }} />
      </div>
      <div style={{ minWidth: 48, fontSize: 12, color: TOKENS.textSec, textAlign: 'right', fontWeight: 600 }}>{fmtPct(pct)}</div>
      {sublabel && <div style={{ minWidth: 60, fontSize: 11, color: TOKENS.textTer, textAlign: 'right' }}>{sublabel}</div>}
    </div>
  );

  const SectionHeader = ({ id, icon, iconColor, title, subtitle }: { id: SeccionId; icon: string; iconColor: string; title: string; subtitle: string }) => (
    <div
      onClick={() => toggleSection(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer',
        borderRadius: 12, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`,
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = TOKENS.borderHi; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${iconColor}18`,
      }}>
        <Icon name={icon} size={18} color={iconColor} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.text }}>{title}</div>
        <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 1 }}>{subtitle}</div>
      </div>
      <div style={{
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        transform: expandedSections.has(id) ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>
        <Icon name="chevronDown" size={16} color={TOKENS.textTer} />
      </div>
    </div>
  );

  const SectionBody = ({ id, children }: { id: SeccionId; children: React.ReactNode }) => {
    if (!expandedSections.has(id)) return null;
    return (
      <div className="section-card" style={{
        padding: 16, borderRadius: 12, background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`, marginTop: 4,
      }}>
        {children}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', background: TOKENS.bg, overflow: 'hidden' }}>
      <style>{ANIMATIONS}</style>

      {/* Topbar */}
      <div className="informe-topbar" style={{
        padding: '20px 28px 16px', borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text, margin: 0 }}>Informes</h1>
          <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 2 }}>{periodoLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Periodo selector */}
          <div style={{ display: 'flex', gap: 4, background: TOKENS.bgCard, borderRadius: 10, padding: 3, border: `1px solid ${TOKENS.border}` }}>
            {periodos.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: periodo === p.key ? 600 : 400,
                  background: periodo === p.key ? TOKENS.primary : 'transparent',
                  color: periodo === p.key ? '#fff' : TOKENS.textSec,
                  transition: 'all 0.2s ease',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Export button */}
          <button
            onClick={exportCompleto}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 10, border: `1px solid ${TOKENS.border}`, cursor: 'pointer',
              background: TOKENS.bgCard, color: TOKENS.textSec, fontSize: 12, fontWeight: 500,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = TOKENS.primary; (e.currentTarget as HTMLElement).style.color = TOKENS.primaryHi; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; (e.currentTarget as HTMLElement).style.color = TOKENS.textSec; }}
          >
            <Icon name="download" size={14} color="currentColor" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 40px' }}>
        {accessDenied ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 8, flexDirection: 'column' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TOKENS.text }}>Acceso restringido</div>
            <div style={{ fontSize: 13, color: TOKENS.textSec }}>Solo los administradores pueden ver los informes.</div>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
            <div style={{ width: 24, height: 24, border: `2px solid ${TOKENS.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 13, color: TOKENS.textSec }}>Cargando datos...</span>
          </div>
        ) : (
          <>
            {/* ============================================================= */}
            {/* 9.10: Dashboard KPIs                                          */}
            {/* ============================================================= */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Citas totales', value: totalCitas, icon: 'calendar', color: TOKENS.primary, bg: TOKENS.primarySoft },
                { label: 'Ingresos', value: `${fmtEur(totalIngresos)} EUR`, icon: 'dollar', color: TOKENS.success, bg: TOKENS.successSoft },
                { label: 'Citas/profesional', value: `${Math.round(ocupacionGlobal * 10) / 10}`, icon: 'barChart', color: TOKENS.cyan, bg: TOKENS.cyanSoft },
                { label: 'No-shows', value: `${noShows.length} (${fmtPct(tasaNoShow)})`, icon: 'alertTriangle', color: TOKENS.danger, bg: TOKENS.dangerSoft },
                { label: 'Tiempo espera medio', value: `${Math.round(esperaData.avgGlobal)} min`, icon: 'clock', color: TOKENS.warning, bg: TOKENS.warningSoft },
                { label: 'Reposo aprovechado', value: fmtPct(reposoData.pctGlobal), icon: 'zap', color: TOKENS.violet, bg: TOKENS.violetSoft },
                { label: 'Clientes activos', value: retencionData.clientesActivos, icon: 'users', color: TOKENS.primary, bg: TOKENS.primarySoft },
                { label: 'Retencion (frec. media)', value: `${Math.round(retencionData.avgFreq)} dias`, icon: 'heart', color: TOKENS.rose, bg: TOKENS.roseSoft },
              ].map((kpi, i) => (
                <div key={kpi.label} className="kpi-card" style={{
                  padding: '16px 18px', borderRadius: 14, background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`, animationDelay: `${i * 60}ms`,
                  display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default',
                  transition: 'all 0.2s ease',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = kpi.color + '44'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: kpi.bg,
                    }}>
                      <Icon name={kpi.icon} size={16} color={kpi.color} />
                    </div>
                    <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 500 }}>{kpi.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.text, animation: 'countUp 0.6s ease both', animationDelay: `${i * 60 + 200}ms` }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ============================================================= */}
            {/* 9.1: Ocupacion                                                */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="ocupacion" icon="barChart" iconColor={TOKENS.cyan} title="Distribucion de citas" subtitle={`${ocupacionData.total} citas en el periodo`} />
              <SectionBody id="ocupacion">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={exportOcupacion} style={{
                    fontSize: 11, color: TOKENS.textTer, background: 'transparent', border: `1px solid ${TOKENS.border}`,
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.primaryHi; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.primary; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.textTer; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; }}
                  >
                    <Icon name="download" size={11} color="currentColor" />
                    CSV
                  </button>
                </div>

                {/* By Professional */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por profesional</div>
                  {ocupacionData.porProf.length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 12 }}>Sin datos en este periodo</div>}
                  {ocupacionData.porProf.map((p, i) => (
                    <BarHorizontal key={p.profId} pct={p.pct} color={p.color} label={p.nombre} sublabel={`${p.citas} citas`} delay={i * 80} />
                  ))}
                </div>

                {/* By franja */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por franja horaria</div>
                  {FRANJAS.map((f, i) => {
                    const total = ocupacionData.total;
                    const cnt = ocupacionData.franjaCount[i];
                    return <BarHorizontal key={f} pct={total > 0 ? (cnt / total) * 100 : 0} color={TOKENS.cyan} label={f} sublabel={`${cnt} citas`} delay={i * 80} />;
                  })}
                </div>

                {/* By day */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por dia de la semana</div>
                  {[1, 2, 3, 4, 5, 6, 0].map((d, i) => {
                    const total = ocupacionData.total;
                    const cnt = ocupacionData.diaCount[d];
                    return <BarHorizontal key={d} pct={total > 0 ? (cnt / total) * 100 : 0} color={TOKENS.primary} label={DIAS_SEMANA[d]} sublabel={`${cnt} citas`} delay={i * 80} />;
                  })}
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.2: No-shows                                                 */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="noshows" icon="alertTriangle" iconColor={TOKENS.danger} title="Tasa de no-shows" subtitle={`${noShows.length} no-shows de ${totalCitas} citas (${fmtPct(tasaNoShow)})`} />
              <SectionBody id="noshows">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* By professional */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por profesional</div>
                    {Object.entries(noShowData.porProf).length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 8 }}>Sin no-shows</div>}
                    {Object.entries(noShowData.porProf)
                      .sort(([, a], [, b]) => b - a)
                      .map(([profId, count], i) => {
                        const prof = profMap.get(profId);
                        return (
                          <div key={profId} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8 }}>
                            <div style={{ width: 4, height: 20, borderRadius: 2, background: prof?.color || TOKENS.textTer }} />
                            <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{prof?.nombre || profId}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.danger }}>{count}</span>
                          </div>
                        );
                      })}
                  </div>
                  {/* By service */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por servicio</div>
                    {Object.entries(noShowData.porServicio).length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 8 }}>Sin no-shows</div>}
                    {Object.entries(noShowData.porServicio)
                      .sort(([, a], [, b]) => b - a)
                      .map(([srvId, count]) => {
                        const srv = srvMap.get(srvId);
                        return (
                          <div key={srvId} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8 }}>
                            <Icon name="scissors" size={12} color={TOKENS.textTer} />
                            <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{srv?.nombre || srvId}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.danger }}>{count}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.3: Tiempo medio de espera                                   */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="espera" icon="clock" iconColor={TOKENS.warning} title="Tiempo medio de espera entre citas" subtitle={`Media global: ${Math.round(esperaData.avgGlobal)} minutos`} />
              <SectionBody id="espera">
                {profsActivos.length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 8 }}>Sin datos</div>}
                {profsActivos.map((p, i) => {
                  const gaps = esperaData.porProf[p.id] || [];
                  const avg = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
                  const maxAvg = Math.max(...profsActivos.map(pp => {
                    const g = esperaData.porProf[pp.id] || [];
                    return g.length > 0 ? g.reduce((a, b) => a + b, 0) / g.length : 0;
                  }), 1);
                  return (
                    <BarHorizontal key={p.id} pct={(avg / maxAvg) * 100} color={TOKENS.warning} label={p.nombre} sublabel={`${Math.round(avg)} min`} delay={i * 80} />
                  );
                })}
                <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 8, padding: '0 12px' }}>
                  Huecos menores a 3h entre citas del mismo profesional en el mismo dia
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.4: Reposo aprovechado                                       */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="reposo" icon="zap" iconColor={TOKENS.violet} title="Tiempos de reposo aprovechados" subtitle={`${Math.round(reposoData.globalUsed)} de ${Math.round(reposoData.globalTotal)} min de reposo utilizados`} />
              <SectionBody id="reposo">
                {/* Global gauge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: TOKENS.violetSoft }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: TOKENS.violet }}>{fmtPct(reposoData.pctGlobal)}</div>
                  <div>
                    <div style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>Aprovechamiento global</div>
                    <div style={{ fontSize: 11, color: TOKENS.textTer }}>{Math.round(reposoData.globalUsed)} min usados de {Math.round(reposoData.globalTotal)} min disponibles</div>
                  </div>
                </div>

                {/* By professional */}
                {profsActivos.map((p, i) => {
                  const r = reposoData.porProf[p.id];
                  if (!r) return null;
                  const pct = (r.usedMin / r.totalMin) * 100;
                  return <BarHorizontal key={p.id} pct={pct} color={TOKENS.violet} label={p.nombre} sublabel={`${Math.round(r.usedMin)}/${Math.round(r.totalMin)}min`} delay={i * 80} />;
                })}
                {Object.keys(reposoData.porProf).length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 8 }}>No hay citas con tiempo de reposo en este periodo</div>}
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.5: Ingresos                                                 */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="ingresos" icon="dollar" iconColor={TOKENS.success} title="Ingresos" subtitle={`Total: ${fmtEur(totalIngresos)} EUR`} />
              <SectionBody id="ingresos">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={exportIngresos} style={{
                    fontSize: 11, color: TOKENS.textTer, background: 'transparent', border: `1px solid ${TOKENS.border}`,
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.primaryHi; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.primary; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.textTer; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; }}
                  >
                    <Icon name="download" size={11} color="currentColor" />
                    CSV
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  {/* By Professional */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por profesional</div>
                    {Object.entries(ingresosData.porProf)
                      .sort(([, a], [, b]) => b - a)
                      .map(([profId, amount]) => {
                        const prof = profMap.get(profId);
                        return (
                          <div key={profId} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8 }}>
                            <div style={{ width: 4, height: 20, borderRadius: 2, background: prof?.color || TOKENS.textTer }} />
                            <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{prof?.nombre || profId}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.success }}>{fmtEur(amount)} EUR</span>
                          </div>
                        );
                      })}
                  </div>

                  {/* By Service */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por servicio</div>
                    {Object.entries(ingresosData.porServicio)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([srvId, amount]) => {
                        const srv = srvMap.get(srvId);
                        return (
                          <div key={srvId} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8 }}>
                            <Icon name="scissors" size={12} color={TOKENS.textTer} />
                            <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{srv?.nombre || srvId}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.success }}>{fmtEur(amount)} EUR</span>
                          </div>
                        );
                      })}
                  </div>

                  {/* By Client */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por cliente</div>
                    {Object.entries(ingresosData.porCliente)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([cltId, amount]) => {
                        const clt = cltMap.get(cltId);
                        return (
                          <div key={cltId} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8 }}>
                            <Icon name="users" size={12} color={TOKENS.textTer} />
                            <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{clt?.nombre || cltId}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.success }}>{fmtEur(amount)} EUR</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.6: Servicios top + combinaciones                            */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="servicios" icon="scissors" iconColor={TOKENS.primary} title="Servicios mas solicitados" subtitle={`${serviciosData.totalServicios} servicios realizados`} />
              <SectionBody id="servicios">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Ranking */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ranking</div>
                    {serviciosData.ranking.map((s, i) => {
                      const max = serviciosData.ranking[0]?.count || 1;
                      return (
                        <div key={s.id} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: i < 3 ? TOKENS.primary : TOKENS.textTer,
                            background: i < 3 ? TOKENS.primarySoft : 'transparent',
                          }}>{i + 1}</div>
                          <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{s.nombre}</span>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.08)' }}>
                            <div className="bar-fill" style={{ width: `${(s.count / max) * 100}%`, height: '100%', borderRadius: 3, background: TOKENS.primary }} />
                          </div>
                          <span style={{ minWidth: 30, fontSize: 12, fontWeight: 600, color: TOKENS.textSec, textAlign: 'right' }}>{s.count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Combinations */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Combinaciones frecuentes</div>
                    {serviciosData.topCombos.length === 0 && <div style={{ fontSize: 12, color: TOKENS.textTer, padding: 8 }}>Sin combinaciones en este periodo</div>}
                    {serviciosData.topCombos.map((c, i) => (
                      <div key={c.combo} className="metric-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8 }}>
                        <Icon name="repeat" size={13} color={TOKENS.violet} />
                        <span style={{ flex: 1, fontSize: 12, color: TOKENS.text }}>{c.combo}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.violet }}>{c.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.7: Retencion de clientas                                    */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="retencion" icon="heart" iconColor={TOKENS.rose} title="Retencion de clientes" subtitle={`${retencionData.clientesActivos} clientes activos en el periodo`} />
              <SectionBody id="retencion">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Frecuencia media', value: `${Math.round(retencionData.avgFreq)} dias`, color: TOKENS.rose },
                    { label: 'Dias sin visita (media)', value: `${Math.round(retencionData.avgSinVisita)} dias`, color: TOKENS.warning },
                    { label: 'Nuevos', value: retencionData.nuevos, color: TOKENS.cyan },
                    { label: 'Recurrentes (3+)', value: retencionData.recurrentes, color: TOKENS.success },
                  ].map((stat, i) => (
                    <div key={stat.label} style={{
                      padding: '12px 14px', borderRadius: 10, background: `${stat.color}10`,
                      border: `1px solid ${stat.color}22`, textAlign: 'center',
                      animation: 'scaleIn 0.4s ease both', animationDelay: `${i * 80}ms`,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: TOKENS.textTer, marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: TOKENS.dangerSoft, border: `1px solid ${TOKENS.danger}22` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.danger, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>En riesgo (60+ dias sin visita)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.danger }}>{retencionData.inactivos}</div>
                    <div style={{ fontSize: 11, color: TOKENS.textTer }}>
                      {retencionData.clientesActivos > 0 ? fmtPct((retencionData.inactivos / retencionData.clientesActivos) * 100) : '0%'} del total
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: TOKENS.successSoft, border: `1px solid ${TOKENS.success}22` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.success, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Fidelizados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: TOKENS.success }}>{retencionData.clientesActivos - retencionData.inactivos}</div>
                    <div style={{ fontSize: 11, color: TOKENS.textTer }}>Visita en los ultimos 60 dias</div>
                  </div>
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.8: Comisiones                                               */}
            {/* ============================================================= */}
            <div style={{ marginBottom: 14 }}>
              <SectionHeader id="comisiones" icon="percent" iconColor={TOKENS.amber} title="Comisiones por profesional" subtitle={`Porcentaje aplicado: ${comisionPct}%`} />
              <SectionBody id="comisiones">
                {/* Commission % selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: TOKENS.amberSoft }}>
                  <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>Porcentaje de comision:</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[20, 25, 30, 35, 40].map(pct => (
                      <button
                        key={pct}
                        onClick={() => { setComisionPct(pct); setComisionCustom(''); }}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: comisionPct === pct && !comisionCustom ? 600 : 400,
                          background: comisionPct === pct && !comisionCustom ? TOKENS.warning : 'transparent',
                          color: comisionPct === pct && !comisionCustom ? '#000' : TOKENS.textSec,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                    <div style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Otro"
                      value={comisionCustom}
                      onChange={e => {
                        const v = e.target.value;
                        setComisionCustom(v);
                        const n = parseInt(v, 10);
                        if (!isNaN(n) && n >= 0 && n <= 100) setComisionPct(n);
                      }}
                      style={{
                        width: 56, padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        border: `1px solid ${comisionCustom ? TOKENS.warning : TOKENS.border}`,
                        background: comisionCustom ? TOKENS.warning : 'transparent',
                        color: comisionCustom ? '#000' : TOKENS.textSec,
                        outline: 'none', textAlign: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    <span style={{ fontSize: 11, color: TOKENS.textTer }}>%</span>
                  </div>
                </div>

                {/* Table */}
                <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${TOKENS.border}` }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 14px',
                    background: TOKENS.bgPanel, borderBottom: `1px solid ${TOKENS.border}`,
                    fontSize: 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    <div>Profesional</div>
                    <div style={{ textAlign: 'right' }}>Citas</div>
                    <div style={{ textAlign: 'right' }}>Ingresos</div>
                    <div style={{ textAlign: 'right' }}>Comision</div>
                  </div>

                  {/* Rows */}
                  {comisionesData.map((p, i) => (
                    <div key={p.profId} className="metric-row" style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 14px',
                      borderBottom: i < comisionesData.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                      animation: 'fadeIn 0.3s ease both', animationDelay: `${i * 50}ms`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 4, height: 20, borderRadius: 2, background: p.color }} />
                        <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>{p.nombre}</span>
                      </div>
                      <div style={{ fontSize: 12, color: TOKENS.textSec, textAlign: 'right' }}>{p.citas}</div>
                      <div style={{ fontSize: 12, color: TOKENS.success, fontWeight: 600, textAlign: 'right' }}>{fmtEur(p.ingresos)} EUR</div>
                      <div style={{ fontSize: 12, color: TOKENS.warning, fontWeight: 600, textAlign: 'right' }}>{fmtEur(p.comision)} EUR</div>
                    </div>
                  ))}

                  {/* Totals */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 14px',
                    background: TOKENS.bgPanel, borderTop: `1px solid ${TOKENS.border}`,
                    fontSize: 12, fontWeight: 700, color: TOKENS.text,
                  }}>
                    <div>Total</div>
                    <div style={{ textAlign: 'right' }}>{comisionesData.reduce((s, p) => s + p.citas, 0)}</div>
                    <div style={{ textAlign: 'right', color: TOKENS.success }}>{fmtEur(comisionesData.reduce((s, p) => s + p.ingresos, 0))} EUR</div>
                    <div style={{ textAlign: 'right', color: TOKENS.warning }}>{fmtEur(comisionesData.reduce((s, p) => s + p.comision, 0))} EUR</div>
                  </div>
                </div>
              </SectionBody>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
