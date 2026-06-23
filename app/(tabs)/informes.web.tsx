import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { DemoSpotlight } from '@/components/ui/DemoSpotlight';
import { getUserProfile, canAccessInformes } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
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
  bg: '#f6f1ea',
  bgPanel: '#fffdfb',
  bgCard: '#ffffff',
  bgCardHi: '#fbf6f0',
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  text: '#1c1814',
  textSec: '#5c5249',
  textTer: '#736658',
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
  rose: '#e11d6b',
  roseSoft: 'rgba(225,29,107,0.14)',
  amber: '#e08a00',
  amberSoft: 'rgba(224,138,0,0.16)',
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
    0%, 100% { box-shadow: 0 0 8px rgba(244,80,30,0.3); }
    50% { box-shadow: 0 0 16px rgba(244,80,30,0.6); }
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
  @keyframes infoPop {
    from { opacity: 0; transform: translate(-50%, 4px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }
`;

// ---------------------------------------------------------------------------
// InfoDot: icono "i" con explicacion al pasar el raton o pulsar.
// Texto: que mide, en que franja/periodo y para que sirve.
// ---------------------------------------------------------------------------
const InfoDot = ({ text, color = '#736658' }: { text: string; color?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Mas informacion"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'help', padding: 0, margin: '-14px',
          color, flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 16, height: 16, borderRadius: '50%', border: `1px solid ${color}66`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, lineHeight: 1, fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}1a`; (e.currentTarget as HTMLElement).style.borderColor = color; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = `${color}66`; }}
        >
          i
        </span>
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', top: 'calc(100% + 9px)', left: '50%',
            width: 224, padding: '10px 12px', borderRadius: 10, zIndex: 60,
            background: '#241d17', color: '#f6f1ea', fontSize: 11.5, lineHeight: 1.5,
            fontWeight: 400, fontStyle: 'normal', textTransform: 'none', letterSpacing: 'normal',
            textAlign: 'left', boxShadow: '0 12px 34px rgba(28,24,20,0.30)', pointerEvents: 'none',
            animation: 'infoPop 0.16s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          <span style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderBottom: '6px solid #241d17',
          }} />
          {text}
        </span>
      )}
    </span>
  );
};

// Explicaciones de cada KPI del dashboard (clave = label de la tarjeta).
const KPI_INFO: Record<string, string> = {
  'Citas totales': 'Numero total de citas registradas en el periodo elegido (semana, mes, 3 meses o ano). Es la foto global de actividad del salon.',
  'Ingresos': 'Suma del precio de los servicios de las citas completadas en el periodo. No cuenta no-shows ni canceladas: es tu facturacion real estimada.',
  'Citas/profesional': 'Media de citas por profesional activo en el periodo (total de citas dividido entre profesionales). Muestra como se reparte la carga del equipo.',
  'No-shows': 'Clientes que no se presentaron. El porcentaje es sobre el total de citas del periodo. Si sube, conviene reforzar los recordatorios.',
  'Tiempo espera medio': 'Minutos medios que un cliente espera desde que llega hasta que empieza su servicio, calculado con las marcas de tiempo de cada cita. Cuanto mas bajo, mejor.',
  'Reposo aprovechado': 'Porcentaje del tiempo de reposo (p. ej. mientras actua un tinte) que se reutiliza para atender a otro cliente. Mide la eficiencia de la agenda.',
  'Clientes activos': 'Clientes distintos con al menos una cita en el periodo. Es tu base de clientes viva, no el historico total acumulado.',
  'Retencion (frec. media)': 'Dias de media entre visitas de un mismo cliente en el periodo. Cuanto mas baja la cifra, antes vuelven: indica fidelidad.',
  'Valoración media': 'La valoración media de 1 a 5 estrellas dejada por tus clientes en el portal de valoración durante el periodo seleccionado.',
};

// Explicaciones de cada seccion de informe (clave = id de seccion).
const SECTION_INFO: Record<string, string> = {
  ocupacion: 'Reparto de las citas por profesional y por franja horaria (de 09-11 a 17-20) en el periodo. Sirve para ver quien y cuando concentra mas trabajo.',
  noshows: 'Citas en las que el cliente no aparecio, desglosadas por profesional y por cliente reincidente. Util para decidir politicas de confirmacion o senal.',
  espera: 'Tiempo que los clientes esperan antes de ser atendidos, medido por cita y promediado por profesional y franja. Detecta cuellos de botella en la agenda.',
  reposo: 'Aprovechamiento de los huecos de reposo (tintes, mechas) para encajar otras tareas. Mide cuanto tiempo muerto se convierte en trabajo productivo.',
  ingresos: 'Facturacion del periodo desglosada por dia, profesional y servicio. Solo cuenta citas completadas. Es la base para ver la tendencia de ventas.',
  servicios: 'Ranking de servicios por numero de veces realizados e ingresos que generan en el periodo. Te dice que vende mas y que conviene priorizar.',
  retencion: 'Fidelidad de clientes: nuevos frente a recurrentes y cada cuanto vuelven, medido sobre el periodo elegido. Ayuda a planificar campanas de recuperacion.',
  comisiones: 'Comisiones estimadas por profesional segun los servicios completados y su porcentaje configurado. Se calculan sobre la base SIN IVA (el IVA es de Hacienda, no del salon). Util para las nominas.',
};

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
  const { isMobile, isTablet } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [negocioId, setNegocioId] = useState('');
  // Demo guiada: enfocar los botones de descarga (PDF/CSV) cuando la guia lo pide.
  const [demoExport, setDemoExport] = useState(false);
  const exportRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDemo = (e: Event) => {
      const a = (e as CustomEvent).detail?.action;
      setDemoExport(a === 'informes-export');
    };
    window.addEventListener('mecha-demo', onDemo);
    return () => window.removeEventListener('mecha-demo', onDemo);
  }, []);

  // Data
  const [citas, setCitas] = useState<Cita[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resenas, setResenas] = useState<{ puntuacion: number }[]>([]);
  const [cobros, setCobros] = useState<{ total_cents: number; cobrado_at?: string; efectivo_cents?: number; datafono_cents?: number; propina_cents?: number }[]>([]);

  // UI
  const [comisionPct, setComisionPct] = useState<number>(30);
  const [comisionCustom, setComisionCustom] = useState<string>('');

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

    const [citaRes, profRes, srvRes, cltRes, resRes, cobRes] = await Promise.all([
      supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
        .eq('negocio_id', nId)
        .gte('inicio', desde.toISOString())
        .lte('inicio', hasta.toISOString()),
      supabase.from('profesionales').select('id, nombre, color, activo, categoria').eq('negocio_id', nId),
      supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min').eq('negocio_id', nId),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId),
      supabase
        .from('resenas')
        .select('puntuacion')
        .eq('negocio_id', nId)
        .gte('created_at', desde.toISOString())
        .lte('created_at', hasta.toISOString()),
      // Cobros reales del periodo (libro de caja): para comparar estimado vs cobrado.
      supabase
        .from('cobros')
        .select('total_cents, cobrado_at, efectivo_cents, datafono_cents, propina_cents')
        .eq('negocio_id', nId)
        .eq('estado', 'completado')
        .gte('cobrado_at', desde.toISOString())
        .lte('cobrado_at', hasta.toISOString()),
    ]);

    setCitas(citaRes.data ?? []);
    setProfesionales(profRes.data ?? []);
    setServicios(srvRes.data ?? []);
    setClientes(cltRes.data ?? []);
    setResenas(resRes.data ?? []);
    setCobros(cobRes.data ?? []);
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
  // Cobrado REAL del periodo (libro de cobros). Si el negocio usa el POS, esta es la
  // cifra autoritativa; si no, queda en 0 y se sigue mostrando solo el estimado.
  const totalCobrado = useMemo(() => cobros.reduce((s, c) => s + (c.total_cents || 0), 0) / 100, [cobros]);
  const hayCobros = cobros.length > 0;

  // Caja diaria: agrupa los cobros reales por día (total, efectivo, datáfono, propina).
  const cajaPorDia = useMemo(() => {
    const m = new Map<string, { fecha: string; total: number; efectivo: number; datafono: number; propina: number; n: number }>();
    cobros.forEach(c => {
      if (!c.cobrado_at) return;
      const dia = c.cobrado_at.slice(0, 10); // YYYY-MM-DD
      const e = m.get(dia) || { fecha: dia, total: 0, efectivo: 0, datafono: 0, propina: 0, n: 0 };
      e.total += (c.total_cents || 0); e.efectivo += (c.efectivo_cents || 0);
      e.datafono += (c.datafono_cents || 0); e.propina += (c.propina_cents || 0); e.n += 1;
      m.set(dia, e);
    });
    return Array.from(m.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [cobros]);

  const tasaNoShow = totalCitas > 0 ? (noShows.length / totalCitas) * 100 : 0;

  const ratingMedia = useMemo(() => {
    if (resenas.length === 0) return 0;
    const sum = resenas.reduce((acc, r) => acc + r.puntuacion, 0);
    return Math.round((sum / resenas.length) * 10) / 10;
  }, [resenas]);

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
    // El IVA es de Hacienda, no del salon: la comision se calcula sobre la BASE SIN IVA.
    // Los precios de catalogo incluyen IVA (21% general de servicios), asi que se descuenta
    // antes de aplicar el porcentaje de comision.
    const IVA_PCT = 21;

    profsActivos.forEach(p => {
      const profCitas = activas.filter(c => c.profesional_id === p.id);
      const ingresos = profCitas.reduce((s, c) => s + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
      const baseSinIva = ingresos / (1 + IVA_PCT / 100);
      porProf.push({
        profId: p.id,
        nombre: p.nombre,
        color: p.color,
        ingresos,
        comision: Math.round(baseSinIva * comisionPct / 100),
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

  // Totales de caja del periodo (efectivo, tarjeta/datáfono, propinas, IVA estimado 21%).
  const cajaTotales = useMemo(() => {
    const total = cobros.reduce((s, c) => s + (c.total_cents || 0), 0);
    const efectivo = cobros.reduce((s, c) => s + (c.efectivo_cents || 0), 0);
    const datafono = cobros.reduce((s, c) => s + (c.datafono_cents || 0), 0);
    const propina = cobros.reduce((s, c) => s + (c.propina_cents || 0), 0);
    const iva = Math.round(total * 21 / 121); // IVA estimado (operativo, NO fiscal)
    return { total, efectivo, datafono, propina, iva };
  }, [cobros]);

  // Caja diaria: registro descargable de lo cobrado de verdad, día a día (con IVA estim.).
  const exportCajaDiaria = useCallback(() => {
    const headers = ['Fecha', 'Cobros', 'Total (EUR)', 'Efectivo (EUR)', 'Datafono (EUR)', 'Propinas (EUR)', 'IVA estim. 21% (EUR)'];
    const rows = cajaPorDia.map(d => [
      format(parseISO(d.fecha), 'dd/MM/yyyy'),
      String(d.n),
      (d.total / 100).toFixed(2),
      (d.efectivo / 100).toFixed(2),
      (d.datafono / 100).toFixed(2),
      (d.propina / 100).toFixed(2),
      (Math.round(d.total * 21 / 121) / 100).toFixed(2),
    ]);
    rows.push(['TOTAL', String(cobros.length), (cajaTotales.total / 100).toFixed(2), (cajaTotales.efectivo / 100).toFixed(2), (cajaTotales.datafono / 100).toFixed(2), (cajaTotales.propina / 100).toFixed(2), (cajaTotales.iva / 100).toFixed(2)]);
    descargarCSV(`caja_diaria_${periodo}.csv`, headers, rows);
  }, [cajaPorDia, cajaTotales, cobros.length, periodo]);

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
  // Export PDF — informe imprimible con marca (ventana nueva -> Guardar como PDF)
  // -------------------------------------------------------------------------
  const exportPDF = useCallback(() => {
    const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => (
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]
    ));
    const generado = format(new Date(), "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es });
    const periodoNombre = periodos.find(p => p.key === periodo)?.label ?? '';

    // KPIs resumen
    const kpis = [
      { label: 'Citas totales', value: String(totalCitas) },
      { label: 'Ingresos', value: `${fmtEur(totalIngresos)} €` },
      { label: 'Citas / profesional', value: `${Math.round(ocupacionGlobal * 10) / 10}` },
      { label: 'No-shows', value: `${noShows.length} (${fmtPct(tasaNoShow)})` },
      { label: 'Espera media', value: `${Math.round(esperaData.avgGlobal)} min` },
      { label: 'Reposo aprovechado', value: fmtPct(reposoData.pctGlobal) },
      { label: 'Clientes activos', value: String(retencionData.clientesActivos) },
      { label: 'Frecuencia media', value: `${Math.round(retencionData.avgFreq)} días` },
    ];
    const kpiHtml = kpis.map(k => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`).join('');

    // Distribucion de citas
    const empty3 = '<tr><td colspan="3" class="empty">Sin datos en este periodo</td></tr>';
    const empty2 = '<tr><td colspan="2" class="empty">Sin datos en este periodo</td></tr>';
    const ocupProf = ocupacionData.porProf.map(p => `<tr><td>${esc(p.nombre)}</td><td class="num">${p.citas}</td><td class="num">${fmtPct(p.pct)}</td></tr>`).join('') || empty3;
    const ocupFranja = FRANJAS.map((f, i) => {
      const cnt = ocupacionData.franjaCount[i]; const tot = ocupacionData.total;
      return `<tr><td>${esc(f)}</td><td class="num">${cnt}</td><td class="num">${tot > 0 ? fmtPct((cnt / tot) * 100) : '0%'}</td></tr>`;
    }).join('');
    const ocupDia = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const cnt = ocupacionData.diaCount[d]; const tot = ocupacionData.total;
      return `<tr><td>${esc(DIAS_SEMANA[d])}</td><td class="num">${cnt}</td><td class="num">${tot > 0 ? fmtPct((cnt / tot) * 100) : '0%'}</td></tr>`;
    }).join('');

    // No-shows
    const nsProf = Object.entries(noShowData.porProf).sort(([, a], [, b]) => b - a)
      .map(([id, c]) => `<tr><td>${esc(profMap.get(id)?.nombre || id)}</td><td class="num">${c}</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Sin no-shows</td></tr>';
    const nsSrv = Object.entries(noShowData.porServicio).sort(([, a], [, b]) => b - a)
      .map(([id, c]) => `<tr><td>${esc(srvMap.get(id)?.nombre || id)}</td><td class="num">${c}</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Sin no-shows</td></tr>';

    // Espera por profesional
    const esperaRows = profsActivos.map(p => {
      const gaps = esperaData.porProf[p.id] || [];
      const avg = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
      return `<tr><td>${esc(p.nombre)}</td><td class="num">${avg} min</td></tr>`;
    }).join('') || empty2;

    // Reposo por profesional
    const reposoRows = profsActivos.map(p => {
      const r = reposoData.porProf[p.id];
      if (!r) return '';
      const pct = r.totalMin > 0 ? (r.usedMin / r.totalMin) * 100 : 0;
      return `<tr><td>${esc(p.nombre)}</td><td class="num">${Math.round(r.usedMin)}/${Math.round(r.totalMin)} min</td><td class="num">${fmtPct(pct)}</td></tr>`;
    }).filter(Boolean).join('') || empty3;

    // Ingresos
    const ingProf = Object.entries(ingresosData.porProf).sort(([, a], [, b]) => b - a)
      .map(([id, amt]) => `<tr><td>${esc(profMap.get(id)?.nombre || id)}</td><td class="num">${fmtEur(amt)} €</td></tr>`).join('') || empty2;
    const ingSrv = Object.entries(ingresosData.porServicio).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([id, amt]) => `<tr><td>${esc(srvMap.get(id)?.nombre || id)}</td><td class="num">${fmtEur(amt)} €</td></tr>`).join('') || empty2;
    const ingClt = Object.entries(ingresosData.porCliente).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([id, amt]) => `<tr><td>${esc(cltMap.get(id)?.nombre || id)}</td><td class="num">${fmtEur(amt)} €</td></tr>`).join('') || empty2;

    // Servicios
    const srvRank = serviciosData.ranking.map((s, i) => `<tr><td class="num">${i + 1}</td><td>${esc(s.nombre)}</td><td class="num">${s.count}</td></tr>`).join('') || empty3;
    const srvCombos = serviciosData.topCombos.map(c => `<tr><td>${esc(c.combo)}</td><td class="num">${c.count}x</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Sin combinaciones</td></tr>';

    // Retencion
    const retCards = [
      { label: 'Frecuencia media', value: `${Math.round(retencionData.avgFreq)} días` },
      { label: 'Días sin visita (media)', value: `${Math.round(retencionData.avgSinVisita)} días` },
      { label: 'Clientes nuevos', value: String(retencionData.nuevos) },
      { label: 'Recurrentes (3+)', value: String(retencionData.recurrentes) },
      { label: 'En riesgo (60+ días)', value: String(retencionData.inactivos) },
      { label: 'Fidelizados', value: String(retencionData.clientesActivos - retencionData.inactivos) },
    ].map(k => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`).join('');

    // Comisiones
    const comRows = comisionesData.map(p => `<tr><td>${esc(p.nombre)}</td><td class="num">${p.citas}</td><td class="num">${fmtEur(p.ingresos)} €</td><td class="num">${fmtEur(p.comision)} €</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">Sin datos</td></tr>';
    const comTotCitas = comisionesData.reduce((s, p) => s + p.citas, 0);
    const comTotIng = comisionesData.reduce((s, p) => s + p.ingresos, 0);
    const comTotCom = comisionesData.reduce((s, p) => s + p.comision, 0);

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe Mecha - ${esc(periodoLabel)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1c1814; background: #fff; padding: 30px 34px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid #f4501e; padding-bottom: 14px; margin-bottom: 22px; }
  .brand { font-size: 27px; font-weight: 800; letter-spacing: -0.6px; }
  .brand .dot { color: #f4501e; }
  .brand .sub { font-size: 12px; font-weight: 600; color: #736658; letter-spacing: 0.4px; margin-top: 2px; }
  .meta { text-align: right; font-size: 12px; color: #5c5249; line-height: 1.6; }
  .meta strong { color: #1c1814; }
  h2 { font-size: 14px; font-weight: 700; margin: 22px 0 10px; padding-left: 10px; border-left: 4px solid #f4501e; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .kpi { border: 1px solid rgba(40,30,24,0.12); border-radius: 10px; padding: 11px 13px; }
  .kpi-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #736658; font-weight: 700; }
  .kpi-value { font-size: 19px; font-weight: 800; margin-top: 4px; letter-spacing: -0.3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #736658; font-weight: 700; padding: 6px 9px; border-bottom: 2px solid rgba(40,30,24,0.14); }
  td { padding: 6px 9px; border-bottom: 1px solid rgba(40,30,24,0.07); }
  th.num, td.num { text-align: right; }
  tr:nth-child(even) td { background: #faf7f3; }
  tfoot td { font-weight: 800; border-top: 2px solid rgba(40,30,24,0.20); background: #fff !important; }
  .empty { color: #736658; font-style: italic; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
  .coltitle { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #5c5249; margin-bottom: 6px; }
  section { page-break-inside: avoid; margin-bottom: 6px; }
  .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid rgba(40,30,24,0.12); font-size: 9.5px; color: #736658; text-align: center; }
  @page { margin: 13mm; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="brand">mecha<span class="dot">.</span></div>
      <div class="sub">Informe de actividad</div>
    </div>
    <div class="meta">
      <div>Periodo: <strong>${esc(periodoNombre)}</strong></div>
      <div>${esc(periodoLabel)}</div>
      <div>Generado el ${esc(generado)}</div>
    </div>
  </div>

  <section>
    <h2>Resumen</h2>
    <div class="kpis">${kpiHtml}</div>
  </section>

  <section>
    <h2>Distribución de citas</h2>
    <div class="cols3">
      <div>
        <div class="coltitle">Por profesional</div>
        <table><thead><tr><th>Profesional</th><th class="num">Citas</th><th class="num">%</th></tr></thead><tbody>${ocupProf}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Por franja horaria</div>
        <table><thead><tr><th>Franja</th><th class="num">Citas</th><th class="num">%</th></tr></thead><tbody>${ocupFranja}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Por día</div>
        <table><thead><tr><th>Día</th><th class="num">Citas</th><th class="num">%</th></tr></thead><tbody>${ocupDia}</tbody></table>
      </div>
    </div>
  </section>

  <section>
    <h2>No-shows · ${esc(noShows.length)} de ${esc(totalCitas)} citas (${esc(fmtPct(tasaNoShow))})</h2>
    <div class="cols2">
      <div>
        <div class="coltitle">Por profesional</div>
        <table><thead><tr><th>Profesional</th><th class="num">No-shows</th></tr></thead><tbody>${nsProf}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Por servicio</div>
        <table><thead><tr><th>Servicio</th><th class="num">No-shows</th></tr></thead><tbody>${nsSrv}</tbody></table>
      </div>
    </div>
  </section>

  <section>
    <h2>Tiempos productivos</h2>
    <div class="cols2">
      <div>
        <div class="coltitle">Espera media entre citas</div>
        <table><thead><tr><th>Profesional</th><th class="num">Media</th></tr></thead><tbody>${esperaRows}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Reposo aprovechado · ${esc(fmtPct(reposoData.pctGlobal))} global</div>
        <table><thead><tr><th>Profesional</th><th class="num">Usado</th><th class="num">%</th></tr></thead><tbody>${reposoRows}</tbody></table>
      </div>
    </div>
  </section>

  <section>
    <h2>Ingresos · ${esc(fmtEur(totalIngresos))} €</h2>
    <div class="cols3">
      <div>
        <div class="coltitle">Por profesional</div>
        <table><thead><tr><th>Profesional</th><th class="num">Ingresos</th></tr></thead><tbody>${ingProf}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Por servicio</div>
        <table><thead><tr><th>Servicio</th><th class="num">Ingresos</th></tr></thead><tbody>${ingSrv}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Por cliente</div>
        <table><thead><tr><th>Cliente</th><th class="num">Ingresos</th></tr></thead><tbody>${ingClt}</tbody></table>
      </div>
    </div>
  </section>

  <section>
    <h2>Servicios</h2>
    <div class="cols2">
      <div>
        <div class="coltitle">Ranking</div>
        <table><thead><tr><th class="num">#</th><th>Servicio</th><th class="num">Citas</th></tr></thead><tbody>${srvRank}</tbody></table>
      </div>
      <div>
        <div class="coltitle">Combinaciones frecuentes</div>
        <table><thead><tr><th>Combinación</th><th class="num">Veces</th></tr></thead><tbody>${srvCombos}</tbody></table>
      </div>
    </div>
  </section>

  <section>
    <h2>Retención de clientes</h2>
    <div class="kpis">${retCards}</div>
  </section>

  <section>
    <h2>Comisiones · ${esc(comisionPct)}% aplicado</h2>
    <table>
      <thead><tr><th>Profesional</th><th class="num">Citas</th><th class="num">Ingresos</th><th class="num">Comisión</th></tr></thead>
      <tbody>${comRows}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${comTotCitas}</td><td class="num">${fmtEur(comTotIng)} €</td><td class="num">${fmtEur(comTotCom)} €</td></tr></tfoot>
    </table>
  </section>

  <div class="foot">Informe generado por Mecha · gestión inteligente de salón · ${esc(generado)}</div>
</body></html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
    if (!win) { window.alert('Activa las ventanas emergentes para descargar el informe en PDF.'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* el usuario puede imprimir manualmente */ } }, 400);
  }, [
    periodo, periodoLabel, totalCitas, totalIngresos, ocupacionGlobal, noShows, tasaNoShow,
    esperaData, reposoData, retencionData, ocupacionData, noShowData, ingresosData, serviciosData,
    comisionesData, comisionPct, profsActivos, profMap, srvMap, cltMap, periodos,
  ]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const BarHorizontal = ({ pct, color, label, sublabel, delay = 0 }: { pct: number; color: string; label: string; sublabel?: string; delay?: number }) => (
    <div className="metric-row" style={{
      display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '6px 8px' : '8px 12px',
      borderRadius: 8, cursor: 'default',
    }}>
      <div style={{ minWidth: isMobile ? 74 : 100, fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>{label}</div>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.08)' }}>
        <div className="bar-fill" style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transitionDelay: `${delay}ms`,
        }} />
      </div>
      <div style={{ minWidth: isMobile ? 38 : 48, fontSize: 12, color: TOKENS.textSec, textAlign: 'right', fontWeight: 600 }}>{fmtPct(pct)}</div>
      {sublabel && <div style={{ minWidth: isMobile ? 46 : 60, fontSize: 11, color: TOKENS.textTer, textAlign: 'right' }}>{sublabel}</div>}
    </div>
  );

  // -- C4: serie temporal (ingresos y citas por dia del periodo) --
  const tendenciaData = useMemo(() => {
    const dias = eachDayOfInterval({ start: desde, end: hasta });
    const map = new Map<string, { ingresos: number; citas: number }>();
    dias.forEach(d => map.set(format(d, 'yyyy-MM-dd'), { ingresos: 0, citas: 0 }));
    activas.forEach(c => {
      const key = format(parseISO(c.inicio), 'yyyy-MM-dd');
      const b = map.get(key);
      if (b) { b.ingresos += srvMap.get(c.servicio_id ?? '')?.precio || 0; b.citas += 1; }
    });
    return dias.map(d => { const b = map.get(format(d, 'yyyy-MM-dd'))!; return { fecha: d, ingresos: b.ingresos, citas: b.citas }; });
  }, [activas, srvMap, desde, hasta]);

  // Grafico de linea (SVG) — evolucion de una serie. Sin dependencias externas.
  const LineChart = ({ serie, valueKey, color, fmt }: { serie: { fecha: Date; ingresos: number; citas: number }[]; valueKey: 'ingresos' | 'citas'; color: string; fmt: (n: number) => string }) => {
    const W = 640, H = 150, pad = 14;
    const vals = serie.map(s => s[valueKey]);
    const max = Math.max(1, ...vals);
    const n = serie.length;
    const xx = (i: number) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2));
    const yy = (v: number) => pad + (1 - v / max) * (H - pad * 2);
    const line = serie.map((s, i) => `${i === 0 ? 'M' : 'L'}${xx(i).toFixed(1)} ${yy(s[valueKey]).toFixed(1)}`).join(' ');
    const area = n > 0 ? `${line} L${xx(n - 1).toFixed(1)} ${H - pad} L${xx(0).toFixed(1)} ${H - pad} Z` : '';
    const total = vals.reduce((a, b) => a + b, 0);
    const gid = `grad-${valueKey}`;
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && <path d={area} fill={`url(#${gid})`} />}
          {n > 0 && <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: TOKENS.textTer }}>
          <span>{serie.length ? format(serie[0].fecha, 'd MMM', { locale: es }) : ''}</span>
          <span style={{ fontWeight: 600, color: TOKENS.textSec }}>Total: {fmt(total)}</span>
          <span>{serie.length ? format(serie[serie.length - 1].fecha, 'd MMM', { locale: es }) : ''}</span>
        </div>
      </div>
    );
  };

  // Cabecera estatica de seccion (siempre visible, parte superior de la tarjeta)
  const SectionHeader = ({ id, icon, iconColor, title, subtitle }: { id?: SeccionId; icon: string; iconColor: string; title: string; subtitle: string }) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, padding: isMobile ? '11px 13px' : '14px 18px',
        borderRadius: '14px 14px 0 0', background: TOKENS.bgCard,
        border: `1px solid ${TOKENS.border}`, borderBottom: `1px solid ${TOKENS.border}`,
      }}
    >
      <div style={{
        width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${iconColor}18`, flexShrink: 0,
      }}>
        <Icon name={icon} size={isMobile ? 16 : 18} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: isMobile ? 13.5 : 14, fontWeight: 700, color: TOKENS.text }}>{title}</span>
          {id && SECTION_INFO[id] && <InfoDot text={SECTION_INFO[id]} color={iconColor} />}
        </div>
        <div style={{ fontSize: isMobile ? 10.5 : 11, color: TOKENS.textTer, marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );

  // Cuerpo de seccion (siempre renderizado, parte inferior de la tarjeta)
  const SectionBody = ({ children }: { id?: SeccionId; children: React.ReactNode }) => (
    <div className="section-card" style={{
      padding: isMobile ? 13 : 18, borderRadius: '0 0 14px 14px', background: TOKENS.bgCard,
      border: `1px solid ${TOKENS.border}`, borderTop: 'none', marginTop: 0,
    }}>
      {children}
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', background: TOKENS.bg, overflow: 'hidden' }}>
      <style>{ANIMATIONS}</style>
      {/* Demo guiada: spotlight sobre los botones de descarga PDF/CSV */}
      <DemoSpotlight targetRef={exportRef} active={demoExport} label="Descarga PDF · CSV" padding={8} radius={12} />

      {/* Topbar */}
      <div className="informe-topbar" style={{
        padding: isMobile ? '12px 16px' : '20px 28px 16px', borderBottom: `1px solid ${TOKENS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: isMobile ? 10 : 12,
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, color: TOKENS.text, margin: 0 }}>Informes</h1>
          <div style={{ fontSize: 12, color: TOKENS.textTer, marginTop: 2 }}>{periodoLabel}</div>
        </div>
        {/* flexWrap: en movil el selector de periodo y los botones CSV/PDF no
            caben en una linea; sin esto el PDF quedaba cortado fuera de pantalla */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Periodo selector */}
          <div style={{ display: 'flex', gap: 4, background: TOKENS.bgCard, borderRadius: 10, padding: 3, border: `1px solid ${TOKENS.border}` }}>
            {periodos.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                style={{
                  padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: isMobile ? 11.5 : 12, fontWeight: periodo === p.key ? 600 : 400,
                  background: periodo === p.key ? TOKENS.primary : 'transparent',
                  color: periodo === p.key ? '#fff' : TOKENS.textSec,
                  transition: 'all 0.2s ease',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div ref={(el) => { exportRef.current = el; }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Export CSV */}
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
            <Icon name="fileText" size={14} color="currentColor" />
            CSV
          </button>

          {/* Descargar PDF */}
          <button
            onClick={exportPDF}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '7px 12px' : '7px 16px',
              borderRadius: 10, border: 'none', cursor: 'pointer',
              background: `linear-gradient(180deg,#ff7a2e 0%,#f4501e 100%)`, color: '#fff',
              fontSize: 12, fontWeight: 600, boxShadow: '0 6px 18px rgba(244,80,30,0.40)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 22px rgba(244,80,30,0.50)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(244,80,30,0.40)'; }}
          >
            <Icon name="download" size={14} color="#fff" />
            {isMobile ? 'PDF' : 'Descargar PDF'}
          </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 14px 96px' : '20px 28px 40px' }}>
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
            {/* minmax(0,1fr): sin el minimo 0 las tarjetas no encogen por debajo
                de su contenido y la columna derecha se sale de la pantalla en movil */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) minmax(0,1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: isMobile ? 8 : 14, marginBottom: isMobile ? 14 : 24 }}>
              {[
                { label: 'Citas totales', value: totalCitas, icon: 'calendar', color: TOKENS.primary, bg: TOKENS.primarySoft },
                { label: hayCobros ? 'Ingresos (estim.)' : 'Ingresos', value: `${fmtEur(totalIngresos)} EUR`, icon: 'dollar', color: TOKENS.success, bg: TOKENS.successSoft },
                ...(hayCobros ? [{ label: 'Cobrado (real)', value: `${fmtEur(totalCobrado)} EUR`, icon: 'dollar', color: TOKENS.primary, bg: TOKENS.primarySoft }] : []),
                { label: 'Citas/profesional', value: `${Math.round(ocupacionGlobal * 10) / 10}`, icon: 'barChart', color: TOKENS.cyan, bg: TOKENS.cyanSoft },
                { label: 'No-shows', value: `${noShows.length} (${fmtPct(tasaNoShow)})`, icon: 'alertTriangle', color: TOKENS.danger, bg: TOKENS.dangerSoft },
                { label: 'Tiempo espera medio', value: `${Math.round(esperaData.avgGlobal)} min`, icon: 'clock', color: TOKENS.warning, bg: TOKENS.warningSoft },
                { label: 'Reposo aprovechado', value: fmtPct(reposoData.pctGlobal), icon: 'zap', color: TOKENS.violet, bg: TOKENS.violetSoft },
                { label: 'Clientes activos', value: retencionData.clientesActivos, icon: 'users', color: TOKENS.primary, bg: TOKENS.primarySoft },
                { label: 'Retencion (frec. media)', value: `${Math.round(retencionData.avgFreq)} dias`, icon: 'heart', color: TOKENS.rose, bg: TOKENS.roseSoft },
                { label: 'Valoración media', value: resenas.length > 0 ? `${ratingMedia} ★ (${resenas.length})` : 'Sin valorar', icon: 'star', color: TOKENS.amber, bg: TOKENS.amberSoft },
              ].map((kpi, i) => (
                <div key={kpi.label} className="kpi-card" style={{
                  padding: isMobile ? '12px 12px' : '16px 18px', borderRadius: 14, background: TOKENS.bgCard,
                  border: `1px solid ${TOKENS.border}`, animationDelay: `${i * 60}ms`,
                  display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default',
                  transition: 'all 0.2s ease', minWidth: 0,
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: TOKENS.textTer, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={kpi.label}>{kpi.label}</span>
                      {KPI_INFO[kpi.label] && <InfoDot text={KPI_INFO[kpi.label]} color={kpi.color} />}
                    </span>
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TOKENS.text, animation: 'countUp 0.6s ease both', animationDelay: `${i * 60 + 200}ms` }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ============================================================= */}
            {/* C4: Evolucion temporal                                        */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader icon="trendingUp" iconColor={TOKENS.success} title="Evolucion del periodo" subtitle="Ingresos y citas dia a dia" />
              <SectionBody>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ingresos</div>
                    <LineChart serie={tendenciaData} valueKey="ingresos" color={TOKENS.success} fmt={(n) => `${fmtEur(n)} EUR`} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Citas</div>
                    <LineChart serie={tendenciaData} valueKey="citas" color={TOKENS.primary} fmt={(n) => `${n}`} />
                  </div>
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.1: Ocupacion                                                */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
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
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader id="noshows" icon="alertTriangle" iconColor={TOKENS.danger} title="Tasa de no-shows" subtitle={`${noShows.length} no-shows de ${totalCitas} citas (${fmtPct(tasaNoShow)})`} />
              <SectionBody id="noshows">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
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
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
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
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
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
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isTablet ? '1fr 1fr' : '1fr 1fr 1fr'), gap: 16 }}>
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
            {/* Caja diaria (cobros reales del libro de caja)                 */}
            {/* ============================================================= */}
            {hayCobros && (
              <div style={{ marginBottom: 14, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: isMobile ? 14 : 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="dollar" size={15} color={TOKENS.primary} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: TOKENS.text }}>Caja diaria (cobrado real)</div>
                      <div style={{ fontSize: 11.5, color: TOKENS.textTer }}>Lo cobrado de verdad en el periodo, día a día · Total {fmtEur(totalCobrado)} EUR</div>
                    </div>
                  </div>
                  <button onClick={exportCajaDiaria} style={{
                    fontSize: 11, color: TOKENS.textTer, background: 'transparent', border: `1px solid ${TOKENS.border}`,
                    borderRadius: 6, padding: '5px 11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.primaryHi; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.primary; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = TOKENS.textTer; (e.currentTarget as HTMLElement).style.borderColor = TOKENS.border; }}
                  >
                    <Icon name="download" size={11} color="currentColor" /> Descargar caja diaria (CSV)
                  </button>
                </div>

                {/* Resumen del periodo: efectivo vs tarjeta + IVA estimado */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Efectivo', value: cajaTotales.efectivo, color: TOKENS.success },
                    { label: 'Tarjeta / datáfono', value: cajaTotales.datafono, color: TOKENS.primary },
                    { label: 'Propinas', value: cajaTotales.propina, color: TOKENS.text },
                    { label: 'IVA estim. (21%)', value: cajaTotales.iva, color: TOKENS.textSec },
                  ].map((k) => (
                    <div key={k.label} style={{ background: TOKENS.bg, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10.5, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: k.color, marginTop: 3 }}>{fmtEur(k.value / 100)} €</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: TOKENS.textTer }}>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}` }}>Día</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>Cobros</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>Efectivo</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>Datáfono</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>Propinas</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>IVA estim.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cajaPorDia.map((d) => (
                        <tr key={d.fecha}>
                          <td style={{ padding: '7px 8px', color: TOKENS.text, borderBottom: `1px solid ${TOKENS.border}`, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{format(parseISO(d.fecha), "EEE d MMM", { locale: es })}</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.textSec, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{d.n}</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.text, fontWeight: 700, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{fmtEur(d.total / 100)} €</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.textSec, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{fmtEur(d.efectivo / 100)} €</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.textSec, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{fmtEur(d.datafono / 100)} €</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.success, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{fmtEur(d.propina / 100)} €</td>
                          <td style={{ padding: '7px 8px', color: TOKENS.textSec, borderBottom: `1px solid ${TOKENS.border}`, textAlign: 'right' }}>{fmtEur(Math.round(d.total * 21 / 121) / 100)} €</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: '8px', color: TOKENS.text, fontWeight: 700 }}>TOTAL</td>
                        <td style={{ padding: '8px', color: TOKENS.textSec, fontWeight: 700, textAlign: 'right' }}>{cobros.length}</td>
                        <td style={{ padding: '8px', color: TOKENS.text, fontWeight: 800, textAlign: 'right' }}>{fmtEur(cajaTotales.total / 100)} €</td>
                        <td style={{ padding: '8px', color: TOKENS.text, fontWeight: 700, textAlign: 'right' }}>{fmtEur(cajaTotales.efectivo / 100)} €</td>
                        <td style={{ padding: '8px', color: TOKENS.text, fontWeight: 700, textAlign: 'right' }}>{fmtEur(cajaTotales.datafono / 100)} €</td>
                        <td style={{ padding: '8px', color: TOKENS.success, fontWeight: 700, textAlign: 'right' }}>{fmtEur(cajaTotales.propina / 100)} €</td>
                        <td style={{ padding: '8px', color: TOKENS.textSec, fontWeight: 700, textAlign: 'right' }}>{fmtEur(cajaTotales.iva / 100)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* 9.6: Servicios top + combinaciones                            */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader id="servicios" icon="scissors" iconColor={TOKENS.primary} title="Servicios mas solicitados" subtitle={`${serviciosData.totalServicios} servicios realizados`} />
              <SectionBody id="servicios">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
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
            {/* 9.7: Retencion de clientes                                    */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader id="retencion" icon="heart" iconColor={TOKENS.rose} title="Retencion de clientes" subtitle={`${retencionData.clientesActivos} clientes activos en el periodo`} />
              <SectionBody id="retencion">
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) minmax(0,1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
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

                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
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
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader id="comisiones" icon="percent" iconColor={TOKENS.amber} title="Comisiones por profesional" subtitle={`Porcentaje aplicado: ${comisionPct}%`} />
              <SectionBody id="comisiones">
                {/* Commission % selector — envuelve en movil para no salirse */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: TOKENS.amberSoft, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500 }}>Porcentaje de comision:</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
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

                {/* Table — en movil cabe sin scroll horizontal: columnas mas
                    estrechas, padding apretado y "€" en vez de " EUR". */}
                <div style={{ width: '100%' }}>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${TOKENS.border}` }}>
                    {/* Header */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.7fr 1fr 1fr' : '2fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                      background: TOKENS.bgPanel, borderBottom: `1px solid ${TOKENS.border}`,
                      fontSize: isMobile ? 10 : 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: isMobile ? 0.2 : 0.5,
                    }}>
                      <div>Profesional</div>
                      <div style={{ textAlign: 'right' }}>Citas</div>
                      <div style={{ textAlign: 'right' }}>Ingresos</div>
                      <div style={{ textAlign: 'right' }}>{isMobile ? 'Comis.' : 'Comision'}</div>
                    </div>

                    {/* Rows */}
                    {comisionesData.map((p, i) => (
                      <div key={p.profId} className="metric-row" style={{
                        display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.7fr 1fr 1fr' : '2fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                        borderBottom: i < comisionesData.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                        animation: 'fadeIn 0.3s ease both', animationDelay: `${i * 50}ms`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, minWidth: 0 }}>
                          <div style={{ width: 4, height: 20, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                        </div>
                        <div style={{ fontSize: 12, color: TOKENS.textSec, textAlign: 'right' }}>{p.citas}</div>
                        <div style={{ fontSize: 12, color: TOKENS.success, fontWeight: 600, textAlign: 'right' }}>{fmtEur(p.ingresos)}{isMobile ? ' €' : ' EUR'}</div>
                        <div style={{ fontSize: 12, color: TOKENS.warning, fontWeight: 600, textAlign: 'right' }}>{fmtEur(p.comision)}{isMobile ? ' €' : ' EUR'}</div>
                      </div>
                    ))}

                    {/* Totals */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.7fr 1fr 1fr' : '2fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                      background: TOKENS.bgPanel, borderTop: `1px solid ${TOKENS.border}`,
                      fontSize: 12, fontWeight: 700, color: TOKENS.text,
                    }}>
                      <div>Total</div>
                      <div style={{ textAlign: 'right' }}>{comisionesData.reduce((s, p) => s + p.citas, 0)}</div>
                      <div style={{ textAlign: 'right', color: TOKENS.success }}>{fmtEur(comisionesData.reduce((s, p) => s + p.ingresos, 0))}{isMobile ? ' €' : ' EUR'}</div>
                      <div style={{ textAlign: 'right', color: TOKENS.warning }}>{fmtEur(comisionesData.reduce((s, p) => s + p.comision, 0))}{isMobile ? ' €' : ' EUR'}</div>
                    </div>
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
