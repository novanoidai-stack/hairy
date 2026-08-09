import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { DemoSpotlight } from '@/components/ui/DemoSpotlight';
import { withClientDataGate } from '@/components/PrivacyGateOverlay';
import { LiquidacionesSection } from '@/components/informes/LiquidacionesSection';
import { GastosSection } from '@/components/informes/GastosSection';
import { getUserProfile, canAccessInformes } from '@/lib/auth';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { NEGOCIO_ID_FALLBACK, HORARIO_APERTURA, HORARIO_CIERRE, CITA_STATUS } from '@/lib/constants';
import { esCompletada, esConfirmada, esPendiente, esNoShow, esCancelada, esActiva } from '@/lib/citasMetrics';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths,
  differenceInMinutes, differenceInDays, format, parseISO, isValid,
  eachDayOfInterval, eachHourOfInterval, startOfDay, endOfDay, startOfHour, getDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { usePaginaManualVista } from '@/lib/hooks/usePaginaManualVista';
import { manualInformes } from '@/lib/manuals/informes';
import { AvisoPrimeraVisita } from '@/components/manuals/AvisoPrimeraVisita.web';
import { ManualPanel } from '@/components/manuals/ManualPanel.web';
import { AvisosBell } from '@/components/avisos/AvisosBell';
import { GraficaExplicada } from '@/components/charts/GraficaExplicada.web';
import { BandaLectura } from '@/components/charts/BandaLectura.web';
import { InfoDot } from '@/components/ui/InfoDot.web';
import { leerReparto, nombreGrano, type Granularidad } from '@/lib/informes/lecturaSerie';
// Mismo motor que la calculadora publica /calculadora-comisiones: una sola cuenta.
import { calcularComisiones } from '@/lib/comisiones/motor';
import { CUOTA_PATRONAL_PCT, DESGLOSE_CUOTA_PATRONAL, AVISO_LEGAL } from '@/lib/comisiones/parametrosLegales';
import {
  serieBaseFidelizada, embudoFidelizacion, cohortesRetencion, frasesCohortes,
  frecuenciaRetorno, fraseFrecuencia, VENTANA_ACTIVO_DIAS,
  type VisitaHistorica,
} from '@/lib/informes/retencionClientes';
import { useAyudaIA } from '@/lib/hooks/useAyudaIA';
import { TarjetaAyudaIA } from '@/components/chispa/TarjetaAyudaIA.web';
import type { AccionEstado } from '@/components/chispa/BloqueRenderer.web';
import { ejecutarAccion } from '@/lib/chispaOps';

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
    background: rgba(244,80,30,0.06) !important;
  }
  .metric-row {
    transition: all 0.2s ease;
  }
  /* Selectores segmentados (periodo, comision): el fondo va inline, asi que el
     hover necesita !important y separar el activo. */
  .seg-btn:hover:not(.is-active) {
    background: rgba(40, 30, 24, 0.06) !important;
    color: ${TOKENS.text} !important;
  }
  .seg-btn.is-active:hover {
    filter: brightness(0.96);
  }
  @keyframes infoPop {
    from { opacity: 0; transform: translate(-50%, 4px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }
`;

// ---------------------------------------------------------------------------
// Explicaciones de cada KPI del dashboard (clave = label de la tarjeta).
const KPI_INFO: Record<string, string> = {
  'Citas totales': 'Numero total de citas registradas en el periodo elegido (semana, mes, 3 meses o ano). Es la foto global de actividad del salon.',
  'Ingresos': 'Suma del precio de los servicios de las citas completadas en el periodo. No cuenta no-shows ni canceladas: es tu facturacion real estimada.',
  'Citas/profesional': 'Media de citas por profesional activo en el periodo (total de citas dividido entre profesionales). Muestra como se reparte la carga del equipo.',
  'No-shows': 'Clientes que no se presentaron. El porcentaje es sobre el total de citas del periodo. Si sube, conviene reforzar los recordatorios.',
  'Tiempo espera medio': 'Minutos medios que un cliente espera desde que llega hasta que empieza su servicio, calculado con las marcas de tiempo de cada cita. Cuanto mas bajo, mejor.',
  'Reposo aprovechado': 'Porcentaje del tiempo de reposo (p. ej. mientras actua un tinte) que se reutiliza para atender a otro cliente. Mide la eficiencia de la agenda.',
  'Clientes activos': 'Clientes distintos con al menos una cita en el periodo. Es tu base de clientes viva, no el historico total acumulado.',
  'Vuelven cada': 'Dias que pasan entre una visita y la siguiente del mismo cliente. Es la MEDIANA sobre los 13 meses de historial, no la media del periodo: la media la destroza un cliente que reaparece al año y medio, y el periodo del filtro es demasiado corto para ver un ciclo completo. Cuanto mas baja la cifra, antes vuelven.',
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
  retencion: 'Si el salon esta retiendo o no: cuantos clientes fidelizados tienes mes a mes, cada cuanto vuelven y que porcentaje de los nuevos acaba quedandose. Se calcula sobre 13 meses de historial, no sobre el periodo del filtro, porque un ciclo de visitas no cabe en una semana.',
  comisiones: 'Comisiones por profesional sobre la base SIN IVA (el IVA es de Hacienda, no del salon) y coste real de empresa con la cuota patronal. Puedes verlo con el porcentaje que tiene configurado cada uno o simular otro escenario para ver cuanto costaria antes de prometer nada.',
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
  /** % de comision configurado en su ficha de equipo. null = no tiene. */
  comision_pct?: number | null;
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

type Periodo = 'hoy' | 'semana' | 'mes' | '3meses' | 'anio';

/**
 * Grano del eje X para cada periodo. Antes habia DOS filtros de tiempo peleando:
 * este de arriba y un selector dia/semana/mes escondido dentro de la tarjeta de
 * evolucion. Se podia elegir "semana" arriba y "mes" abajo, con lo que la grafica
 * mostraba un solo punto. Ahora el grano se deduce del periodo y no hay forma de
 * pedir una combinacion sin sentido.
 */
function granularidadDe(p: Periodo): Granularidad {
  switch (p) {
    case 'hoy': return 'hora';
    case 'semana': return 'dia';
    case 'mes': return 'dia';
    case '3meses': return 'semana';
    case 'anio': return 'mes';
  }
}

/** Escenario de comision que se esta mirando en la seccion. */
type ModeloComision = 'configurado' | 'plano' | 'tramos';

type LineaEntradaComision = { nombre: string; facturacion: number; porcentaje?: number };

/** Porcentaje de partida cuando un profesional no tiene el suyo configurado. */
const COMISION_PCT_POR_DEFECTO = 30;

/** Tramos con los que arranca el simulador si el salon no tiene ninguno guardado. */
const TRAMOS_POR_DEFECTO = [
  { desde: 0, hasta: 2000, porcentaje: 25 },
  { desde: 2000, hasta: null as number | null, porcentaje: 35 },
];

type SeccionId = 'ocupacion' | 'noshows' | 'espera' | 'reposo' | 'ingresos' | 'servicios' | 'retencion' | 'comisiones';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getRango(p: Periodo): { desde: Date; hasta: Date } {
  const now = new Date();
  switch (p) {
    case 'hoy':
      return { desde: startOfDay(now), hasta: endOfDay(now) };
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

/** Puntos de margen con coma decimal: se veia "13.2 puntos" en castellano. */
function fmtPuntos(n: number) {
  const abs = Math.abs(n);
  return (Math.round(abs * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

/** "1 cita" / "3 citas". Sin esto las barras decian "1 citas". */
function fmtCitas(n: number) {
  return `${n} ${n === 1 ? 'cita' : 'citas'}`;
}

function diasLaborales(desde: Date, hasta: Date): number {
  const dias = eachDayOfInterval({ start: desde, end: hasta });
  return dias.filter(d => getDay(d) !== 0).length; // excluir domingos
}

// Ventana del historico de fidelizacion: 13 meses permiten comparar el mes
// actual con el mismo mes del ano pasado y dan 12 cohortes.
const MESES_HISTORICO = 13;
// Tope de filas del historico. Supabase corta en 1000 por defecto, asi que hay
// que pedirlo explicito; si se alcanza, la UI avisa de que va recortado.
const TOPE_HISTORICO = 20000;

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
function InformesScreen() {
  const { isMobile, isTablet } = useResponsive();
  const [showManualPanel, setShowManualPanel] = useState(false);
  const paginaManual = usePaginaManualVista('informes');
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
  const [cobros, setCobros] = useState<{ total_cents: number; cobrado_at?: string; efectivo_cents?: number; datafono_cents?: number; propina_cents?: number; profesional_id?: string | null }[]>([]);
  const [gastos, setGastos] = useState<{ importe_cents: number }[]>([]);
  // Historico de visitas cumplidas de los ultimos 13 meses. Hace falta aparte de
  // `citas` porque la fidelizacion NO se puede medir dentro del periodo del
  // filtro: para saber si un cliente esta fidelizado hay que ver si volvio, y
  // eso pasa fuera de la ventana elegida.
  const [historico, setHistorico] = useState<{ cliente_id: string | null; inicio: string; servicio_id?: string | null }[]>([]);
  // true si la consulta llego al tope de filas: entonces el historico esta
  // recortado y hay que decirlo en vez de dar las cifras por completas.
  const [historicoRecortado, setHistoricoRecortado] = useState(false);

  // UI
  const [comisionPct, setComisionPct] = useState<number>(COMISION_PCT_POR_DEFECTO);
  const [comisionCustom, setComisionCustom] = useState<string>('');
  // Escenario de comision: lo configurado en las fichas, un % plano simulado, o
  // por tramos de facturacion.
  const [modeloComision, setModeloComision] = useState<ModeloComision>('configurado');
  const [tramos, setTramos] = useState(TRAMOS_POR_DEFECTO);
  // Las cohortes van plegadas: son el analisis mas potente y el mas duro de leer,
  // asi que no se le ponen delante a quien solo quiere el titular.
  const [verCohortes, setVerCohortes] = useState(false);

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

    const [citaRes, profRes, srvRes, cltRes, resRes, cobRes, gastosRes, histRes] = await Promise.all([
      supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
        .eq('negocio_id', nId)
        .gte('inicio', desde.toISOString())
        .lte('inicio', hasta.toISOString()),
      supabase.from('profesionales').select('id, nombre, color, activo, categoria, comision_pct').eq('negocio_id', nId),
      supabase.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min').eq('negocio_id', nId),
      supabase.from('clientes').select('id, nombre, telefono').eq('negocio_id', nId),
      supabase
        .from('resenas')
        .select('puntuacion')
        .eq('negocio_id', nId)
        .gte('created_at', desde.toISOString())
        .lte('created_at', hasta.toISOString()),
      // Cobros reales del periodo (libro de caja): para comparar estimado vs cobrado
      // y para comisiones reales por profesional.
      supabase
        .from('cobros')
        .select('total_cents, cobrado_at, efectivo_cents, datafono_cents, propina_cents, profesional_id')
        .eq('negocio_id', nId)
        .eq('estado', 'completado')
        .gte('cobrado_at', desde.toISOString())
        .lte('cobrado_at', hasta.toISOString()),
      supabase
        .from('gastos')
        .select('importe_cents')
        .eq('negocio_id', nId)
        .gte('fecha', desde.toISOString())
        .lte('fecha', hasta.toISOString()),
      // Historico de 13 meses, solo lo imprescindible (tres columnas) para que
      // el payload sea pequeno. Ver MESES_HISTORICO / TOPE_HISTORICO.
      supabase
        .from('citas')
        .select('cliente_id, inicio, servicio_id')
        .eq('negocio_id', nId)
        .eq('estado', CITA_STATUS.COMPLETADA)
        .not('cliente_id', 'is', null)
        .gte('inicio', subMonths(new Date(), MESES_HISTORICO).toISOString())
        .order('inicio', { ascending: true })
        .limit(TOPE_HISTORICO),
    ]);

    setCitas(citaRes.data ?? []);
    setProfesionales(profRes.data ?? []);
    setServicios(srvRes.data ?? []);
    setClientes(cltRes.data ?? []);
    setResenas(resRes.data ?? []);
    setCobros(cobRes.data ?? []);
    setGastos(gastosRes.data ?? []);
    const hist = histRes.data ?? [];
    setHistorico(hist);
    setHistoricoRecortado(hist.length >= TOPE_HISTORICO);

    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Lookup maps
  // -------------------------------------------------------------------------
  const profMap = useMemo(() => new Map(profesionales.map(p => [p.id, p])), [profesionales]);
  const srvMap = useMemo(() => new Map(servicios.map(s => [s.id, s])), [servicios]);
  const cltMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);

  const { desde, hasta } = useMemo(() => getRango(periodo), [periodo]);

  // El grano del eje X lo manda el periodo elegido arriba: no hay segundo selector.
  const granularidad = useMemo(() => granularidadDe(periodo), [periodo]);

  /**
   * Hasta donde llega de verdad el eje X.
   *
   * Dos recortes, los dos por honestidad:
   *
   * 1. NO SE PINTA EL FUTURO. Con el periodo "Mes" el rango va al 31 aunque hoy
   *    sea el 9, y aquellos 22 dias vacios hacian que la lectura dijera "va
   *    bajando un 100 %": comparaba la primera mitad del mes contra una mitad que
   *    todavia no ha ocurrido. La media y el dia mas flojo salian igual de mal.
   * 2. NI EL CUBO INCOMPLETO. Con grano de semana o de mes, el ultimo cubo estaria
   *    a medias y hundiria la tendencia por el mismo motivo. Se corta en el ultimo
   *    periodo CERRADO, que es lo unico comparable.
   */
  const hastaEfectivo = useMemo(() => {
    const ahora = new Date();
    let fin = hasta.getTime() > ahora.getTime() ? endOfDay(ahora) : hasta;

    if (granularidad === 'semana') {
      if (endOfWeek(fin, { weekStartsOn: 1 }).getTime() > fin.getTime()) {
        fin = subDays(startOfWeek(fin, { weekStartsOn: 1 }), 1);
      }
    } else if (granularidad === 'mes') {
      if (endOfMonth(fin).getTime() > fin.getTime()) {
        fin = subDays(startOfMonth(fin), 1);
      }
    }
    // Si al recortar nos quedamos por detras del inicio (p. ej. la primera semana
    // de un periodo que acaba de empezar), se deja al menos el dia de inicio.
    return fin.getTime() < desde.getTime() ? desde : fin;
  }, [granularidad, desde, hasta]);

  /** true si el periodo elegido aun no ha terminado: hay que decirlo en pantalla. */
  const periodoEnCurso = useMemo(
    () => hasta.getTime() > new Date().getTime(),
    [hasta],
  );


  // -------------------------------------------------------------------------
  // Derived metrics
  // -------------------------------------------------------------------------

  // Filter active professionals only
  const profsActivos = useMemo(() => profesionales.filter(p => p.activo), [profesionales]);

  const completadas = useMemo(() => citas.filter(esCompletada), [citas]);
  const confirmadas = useMemo(() => citas.filter(esConfirmada), [citas]);
  const pendientes = useMemo(() => citas.filter(esPendiente), [citas]);
  const noShows = useMemo(() => citas.filter(esNoShow), [citas]);
  const canceladas = useMemo(() => citas.filter(esCancelada), [citas]);
  const activas = useMemo(() => citas.filter(esActiva), [citas]);

  // -- 9.10: KPIs --
  const totalCitas = citas.length;
  const totalIngresos = useMemo(() => {
    return activas.reduce((sum, c) => sum + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
  }, [activas, srvMap]);
  // Cobrado REAL del periodo (libro de cobros). Si el negocio usa el POS, esta es la
  // cifra autoritativa; si no, queda en 0 y se sigue mostrando solo el estimado.
  const totalCobrado = useMemo(() => cobros.reduce((s, c) => s + (c.total_cents || 0), 0) / 100, [cobros]);
  const hayCobros = cobros.length > 0;
  
  const totalGastos = useMemo(() => gastos.reduce((s, g) => s + (g.importe_cents || 0), 0) / 100, [gastos]);
  const margenAproximado = totalCobrado - totalGastos;

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
  // Lo que ha facturado cada profesional en el periodo. Real cuando tiene cobros
  // (libro de caja, sin la propina porque esa es integra suya); si no, estimado
  // por catalogo — mismo patron que totalIngresos vs totalCobrado mas arriba.
  const facturacionPorProf = useMemo(() => {
    return profsActivos.map(p => {
      const profCitas = activas.filter(c => c.profesional_id === p.id);
      const profCobros = cobros.filter(c => c.profesional_id === p.id);
      const real = profCobros.length > 0;
      const ingresos = real
        // total_cents ya viene neto de descuento y señal.
        ? profCobros.reduce((s, c) => s + ((c.total_cents || 0) - (c.propina_cents || 0)), 0) / 100
        : profCitas.reduce((s, c) => s + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
      return {
        profId: p.id,
        nombre: p.nombre,
        color: p.color,
        // El % que este profesional tiene CONFIGURADO en su ficha de equipo.
        pctConfigurado: typeof p.comision_pct === 'number' ? p.comision_pct : null,
        ingresos,
        citas: profCitas.length,
        real,
      };
    }).sort((a, b) => b.ingresos - a.ingresos);
  }, [profsActivos, activas, cobros, srvMap]);

  /**
   * Calcula las comisiones con el motor COMPARTIDO con la calculadora publica
   * (lib/comisiones/motor.js). Antes esta pantalla tenia su propia cuenta a mano,
   * que solo sabia aplicar un porcentaje plano igual para todo el equipo — e
   * ignoraba el `comision_pct` que cada profesional tiene configurado en su ficha.
   */
  const calcularCon = useCallback((modelo: ModeloComision, pctPlano: number) => {
    const lineas = facturacionPorProf.map(p => {
      const linea: LineaEntradaComision = { nombre: p.nombre, facturacion: p.ingresos };
      // En modo "configurado" manda el % de la ficha de cada uno; si no lo tiene,
      // cae al porcentaje general (y la UI lo señala).
      if (modelo === 'configurado') linea.porcentaje = p.pctConfigurado ?? pctPlano;
      return linea;
    });
    return calcularComisiones(lineas, {
      modelo: modelo === 'tramos' ? 'tramos' : 'plano',
      porcentaje: pctPlano,
      tramos: modelo === 'tramos' ? tramos : undefined,
      ivaIncluido: true,
      // Las propinas ya se han restado de la facturacion, asi que no se pasan aqui.
      propinasComisionables: false,
      calcularCosteEmpresa: true,
      gastosFijosSalon: totalGastos,
    });
  }, [facturacionPorProf, tramos, totalGastos]);

  // Escenario que se esta mirando ahora mismo.
  const comisionCalculo = useMemo(
    () => calcularCon(modeloComision, comisionPct),
    [calcularCon, modeloComision, comisionPct],
  );

  // Escenario de referencia: lo que el salon tiene configurado hoy. Es contra
  // esto contra lo que se compara al simular, y es lo que hace util el "¿que pasa
  // si...?": sin una referencia, mover el porcentaje solo da un numero suelto.
  const comisionReferencia = useMemo(
    () => calcularCon('configurado', COMISION_PCT_POR_DEFECTO),
    [calcularCon],
  );

  const hayConfiguracionPropia = useMemo(
    () => facturacionPorProf.some(p => p.pctConfigurado !== null),
    [facturacionPorProf],
  );

  // Diferencia entre el escenario simulado y el configurado, en euros de coste
  // real (con cuota patronal) y en puntos de margen.
  const deltaComision = useMemo(() => {
    const a = comisionCalculo.totales;
    const b = comisionReferencia.totales;
    return {
      comision: a.comisiones - b.comisiones,
      coste: a.costeEmpresa - b.costeEmpresa,
      margen: a.margenSalon - b.margenSalon,
      puntosMargen: a.margenPct - b.margenPct,
      esSimulacion: modeloComision !== 'configurado',
    };
  }, [comisionCalculo, comisionReferencia, modeloComision]);

  // Forma que espera el resto de la pantalla (tabla, CSV y PDF).
  const comisionesData = useMemo(() => {
    return facturacionPorProf.map((p, i) => {
      const l = comisionCalculo.lineas[i];
      return {
        ...p,
        baseSinIva: l?.baseSinIva ?? 0,
        comision: l?.comision ?? 0,
        pctEfectivo: l?.porcentajeEfectivo ?? 0,
        costeEmpresa: l?.costeEmpresa ?? 0,
        avisos: l?.avisos ?? [],
      };
    });
  }, [facturacionPorProf, comisionCalculo]);

  // -------------------------------------------------------------------------
  // CSV export callbacks (9.9)
  // -------------------------------------------------------------------------
  const exportOcupacion = useCallback(() => {
    const headers = ['Profesional', 'Citas', '% del total'];
    const rows = ocupacionData.porProf.map(p => [p.nombre, String(p.citas), fmtPct(p.pct)]);
    descargarCSV(`ocupacion_${periodo}.csv`, headers, rows);
  }, [ocupacionData, periodo]);

  const exportIngresos = useCallback(() => {
    const headers = [
      'Profesional', 'Citas', 'Facturado (EUR)', 'Base sin IVA (EUR)',
      'Comision (EUR)', '% aplicado', 'Coste empresa (EUR)', 'Origen del dato',
    ];
    const rows = comisionesData.map(p => [
      p.nombre, String(p.citas), p.ingresos.toFixed(2), p.baseSinIva.toFixed(2),
      p.comision.toFixed(2), String(Math.round(p.pctEfectivo)),
      p.costeEmpresa.toFixed(2), p.real ? 'Real (cobros)' : 'Estimado (catalogo)',
    ]);
    descargarCSV(`comisiones_${periodo}.csv`, headers, rows);
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

  // Como se lee el eje X con el periodo elegido, para decirlo en la cabecera de
  // la seccion en vez de dejar que el usuario lo adivine.
  const etiquetaGrano = useMemo(() => {
    switch (granularidad) {
      case 'hora': return 'hora a hora';
      case 'dia': return 'día a día';
      case 'semana': return 'semana a semana';
      case 'mes': return 'mes a mes';
    }
  }, [granularidad]);

  // -------------------------------------------------------------------------
  // Fidelizacion (parte B). Se calcula sobre el historico de 13 meses, NO sobre
  // el periodo del filtro: si solo mirases la ventana elegida, un cliente que
  // vuelve cada mes y medio pareceria nuevo cada vez.
  // -------------------------------------------------------------------------
  const visitasHistoricas = useMemo<VisitaHistorica[]>(
    () => historico
      .filter(h => h.cliente_id)
      .map(h => ({ clienteId: h.cliente_id as string, fecha: parseISO(h.inicio), servicioId: h.servicio_id ?? null }))
      .filter(v => isValid(v.fecha)),
    [historico],
  );

  const baseFidelizadaSerie = useMemo(
    () => serieBaseFidelizada(visitasHistoricas, { meses: 12, hasta: new Date() }),
    [visitasHistoricas],
  );

  const embudo = useMemo(
    () => embudoFidelizacion(visitasHistoricas, { desde, hasta }),
    [visitasHistoricas, desde, hasta],
  );

  const cohortes = useMemo(
    () => cohortesRetencion(visitasHistoricas, { meses: 12, hasta: new Date(), offsets: 6 }),
    [visitasHistoricas],
  );

  const fraseCohortes = useMemo(() => frasesCohortes(cohortes), [cohortes]);

  // Ultimo punto de la serie: la base fidelizada de hoy mismo.
  const baseFidelizadaHoy = baseFidelizadaSerie.length > 0
    ? baseFidelizadaSerie[baseFidelizadaSerie.length - 1].valor
    : 0;

  const frecuencia = useMemo(() => frecuenciaRetorno(visitasHistoricas), [visitasHistoricas]);

  const fraseDeFrecuencia = useMemo(
    () => fraseFrecuencia(frecuencia, (id) => srvMap.get(id)?.nombre),
    [frecuencia, srvMap],
  );

  // -------------------------------------------------------------------------
  // Lecturas de las secciones de barras (A5). Las graficas de linea se explican
  // solas via GraficaExplicada; las barras necesitan lo mismo, porque un reparto
  // de siete barras tampoco se lee de un vistazo.
  // -------------------------------------------------------------------------
  const lecturaOcupacion = useMemo(() => {
    const profs = leerReparto(
      ocupacionData.porProf.map(p => ({ etiqueta: p.nombre, valor: p.citas })),
      { dimension: 'profesional', sustantivo: 'citas', sustantivoSing: 'cita' },
    );
    const franjas = leerReparto(
      FRANJAS.map((f, i) => ({ etiqueta: f, valor: ocupacionData.franjaCount[i] })),
      { dimension: 'franja', sustantivo: 'citas', sustantivoSing: 'cita' },
    );
    const dias = leerReparto(
      [1, 2, 3, 4, 5, 6, 0].map(d => ({ etiqueta: DIAS_SEMANA[d], valor: ocupacionData.diaCount[d] })),
      { dimension: 'día', sustantivo: 'citas', sustantivoSing: 'cita' },
    );
    if (ocupacionData.total === 0) {
      return { frase: 'Sin citas en este periodo, así que no hay reparto que leer.', vacio: true, chips: [] as { etiqueta: string; valor: string }[] };
    }
    const partes = [franjas.frase];
    if (dias.fuerte) partes.push(`El día que más se llena es el ${dias.fuerte.etiqueta.toLowerCase()}.`);
    if (profs.concentrado && profs.fuerte) {
      partes.push(`${profs.fuerte.etiqueta} lleva más de la mitad de las citas: si falta, lo notas entero.`);
    }
    return {
      frase: partes.join(' '),
      vacio: false,
      chips: [
        ...(franjas.fuerte ? [{ etiqueta: 'Franja fuerte', valor: franjas.fuerte.etiqueta }] : []),
        ...(dias.fuerte ? [{ etiqueta: 'Día fuerte', valor: dias.fuerte.etiqueta }] : []),
        ...(profs.fuerte ? [{ etiqueta: 'Más citas', valor: profs.fuerte.etiqueta }] : []),
      ],
    };
  }, [ocupacionData]);

  const lecturaNoShows = useMemo(() => {
    if (noShows.length === 0) {
      return { frase: 'Ni una ausencia en este periodo. Eso es una buena noticia: los clientes están cumpliendo.', vacio: true, chips: [] as { etiqueta: string; valor: string }[] };
    }
    const porProf = leerReparto(
      Object.entries(noShowData.porProf).map(([id, n]) => ({ etiqueta: profMap.get(id)?.nombre || id, valor: n })),
      { dimension: 'profesional', sustantivo: 'ausencias', sustantivoSing: 'ausencia' },
    );
    const porSrv = leerReparto(
      Object.entries(noShowData.porServicio).map(([id, n]) => ({ etiqueta: srvMap.get(id)?.nombre || id, valor: n })),
      { dimension: 'servicio', sustantivo: 'ausencias', sustantivoSing: 'ausencia' },
    );
    const partes: string[] = [
      `De cada 100 citas, ${Math.round(tasaNoShow)} se quedan sin venir.`,
    ];
    if (porSrv.fuerte) partes.push(`Donde más pasa es en ${porSrv.fuerte.etiqueta} (${porSrv.fuerte.valor} de ${noShows.length}).`);
    if (porProf.fuerte && porProf.concentrado) partes.push(`Se concentran en la agenda de ${porProf.fuerte.etiqueta}.`);
    // Umbral del sector: por encima de un 10% deja de ser mala suerte.
    partes.push(tasaNoShow >= 10
      ? 'Por encima del 10 % ya no es mala suerte: conviene pedir señal o reforzar el recordatorio.'
      : 'Por debajo del 10 % está dentro de lo razonable para el sector.');
    return {
      frase: partes.join(' '),
      vacio: false,
      chips: [
        { etiqueta: 'Tasa', valor: `${Math.round(tasaNoShow)} %` },
        ...(porSrv.fuerte ? [{ etiqueta: 'Servicio', valor: porSrv.fuerte.etiqueta }] : []),
      ],
    };
  }, [noShows.length, noShowData, profMap, srvMap, tasaNoShow]);

  const lecturaServicios = useMemo(() => {
    const items = serviciosData.ranking.map(r => ({ etiqueta: r.nombre, valor: r.count }));
    const r = leerReparto(items, { dimension: 'servicio', sustantivo: 'veces' });
    if (!r.fuerte) return { frase: r.frase, vacio: true, chips: [] as { etiqueta: string; valor: string }[] };
    const partes = [r.frase];
    const combo = serviciosData.topCombos[0];
    if (combo) {
      partes.push(`La pareja que más se repite es «${combo.combo}» (${combo.count} veces): es tu upsell natural.`);
    }
    return {
      frase: partes.join(' '),
      vacio: false,
      chips: [{ etiqueta: 'Top', valor: r.fuerte.etiqueta }],
    };
  }, [serviciosData]);

  // Lo que se le dice al usuario sobre el recorte del eje, para que no eche en
  // falta los dias que no salen.
  const etiquetaPieGrafica = useMemo(
    () => (periodoEnCurso ? 'Total hasta hoy' : 'Total en periodo'),
    [periodoEnCurso],
  );

  const avisoRecorte = useMemo(() => {
    if (!periodoEnCurso) return '';
    if (granularidad === 'mes') return ' · solo meses cerrados';
    if (granularidad === 'semana') return ' · solo semanas cerradas';
    return ' · hasta hoy';
  }, [periodoEnCurso, granularidad]);

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mes' },
    { key: '3meses', label: '3 Meses' },
    { key: 'anio', label: 'Anual' },
  ];

  // -------------------------------------------------------------------------
  // Informe narrado (Sesion 7 V2): patron "AyudaIA por pagina" (useAyudaIA +
  // TarjetaAyudaIA, informes/PATRON-IA-POR-PAGINA.md). El resumen determinista
  // usa SOLO cifras YA cargadas en esta pantalla (nunca inventadas); el LLM
  // anade la lectura narrada y pide al edge mostrar_grafica/mostrar_comparativa
  // (calculo real server-side, Sesion 6 de PLAN-IA-CHISPA) para contrastar con
  // el periodo anterior equivalente.
  // -------------------------------------------------------------------------
  const informeIA = useAyudaIA();
  const [accionEstadoInformeIA, setAccionEstadoInformeIA] = useState<AccionEstado>('pendiente');

  const resumenInformeDeterminista = useMemo(() => {
    const partes = [
      `${totalCitas} citas`,
      hayCobros ? `${fmtEur(totalCobrado)} EUR cobrados` : `${fmtEur(totalIngresos)} EUR estimados`,
    ];
    if (noShows.length > 0) partes.push(`${noShows.length} no-shows (${fmtPct(tasaNoShow)})`);
    return `${periodoLabel}: ${partes.join(' · ')}.`;
  }, [periodoLabel, totalCitas, hayCobros, totalCobrado, totalIngresos, noShows.length, tasaNoShow]);

  const analizarInformeIA = () => {
    setAccionEstadoInformeIA('pendiente');
    // La tool mostrar_comparativa solo admite 'semana'|'mes'; los periodos mas
    // largos (3meses/anio) piden la comparativa mensual, la granularidad mas
    // cercana disponible.
    const periodoComparativa = periodo === 'semana' ? 'semana' : 'mes';
    // Orden explicito + prohibicion de sugerir_enlace (redundante, ya estamos en
    // Informes): probado en vivo que sin esto el texto narrado se escribe en un
    // turno intermedio (tras llamar a mostrar_grafica/mostrar_comparativa) y luego
    // una llamada de cierre a sugerir_enlace deja el turno FINAL vacio — el patron
    // useAyudaIA solo usa el texto de la ULTIMA respuesta, así que el informe
    // narrado se perdia (bloques visuales sin texto). Mismo tipo de ajuste de
    // prompt que la Sesion 3 V2 (probar en vivo, reforzar con regla explicita).
    const prompt = `Necesito un informe narrado del periodo ${periodoLabel}. Sigue este orden EXACTO:
1) Llama a mostrar_grafica con metrica "ingresos" desde "${format(desde, 'yyyy-MM-dd')}" hasta "${format(hasta, 'yyyy-MM-dd')}",
   y a mostrar_comparativa con metrica "ingresos" y periodo "${periodoComparativa}" para contrastar con el periodo anterior equivalente.
2) En cuanto termines esas llamadas, tu SIGUIENTE respuesta (sin mas llamadas a tools) tiene que ser el INFORME:
   3-4 frases en tono profesional y directo interpretando estas cifras YA CALCULADAS (no inventes otras): ${totalCitas} citas,
   ${hayCobros ? `${totalCobrado.toFixed(2)}€ cobrados de verdad` : `${totalIngresos.toFixed(2)}€ estimados (aun sin cobros registrados)`},
   ocupacion media ${Math.round(ocupacionGlobal * 10) / 10} citas/profesional, ${noShows.length} no-shows (${Math.round(tasaNoShow)}%).
   No repitas estos numeros tal cual (ya se ven en el panel de arriba): interpreta que significan para el negocio. Si la
   comparativa muestra una caida relevante (mas de 10%), señalalo con franqueza como alerta; si sube, celebralo brevemente.
   No inventes cifras que no te haya dado o que no devuelvan las tools.
NO uses sugerir_enlace en esta respuesta (ya estamos en Informes, un enlace aqui es redundante). Tu ULTIMA respuesta
SIEMPRE debe llevar el texto del informe: nunca termines con una respuesta vacia sin el texto.`;
    informeIA.analizar(prompt);
  };

  const confirmarAccionInformeIA = async () => {
    if (informeIA.estado.tipo !== 'listo') return;
    const bloqueAccion = informeIA.estado.bloques.find((b) => b.tipo === 'accion');
    if (!bloqueAccion || bloqueAccion.tipo !== 'accion') return;
    setAccionEstadoInformeIA('aplicando');
    const profile = await getUserProfile();
    const res = await ejecutarAccion(bloqueAccion.accion, profile?.id || '');
    setAccionEstadoInformeIA(res.ok ? 'aplicada' : 'pendiente');
  };

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
      // Mediana sobre 13 meses, igual que en pantalla: la media del periodo no
      // aguanta un periodo corto ni una reaparicion tardia.
      { label: 'Vuelven cada', value: frecuencia.global.intervalos > 0 ? `${Math.round(frecuencia.global.medianaDias)} días` : 'Sin datos' },
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

    // Fidelizacion: las mismas cifras que en pantalla (historico de 13 meses),
    // para que el PDF no contradiga a la app.
    const retCards = [
      { label: 'Base fidelizada hoy', value: String(baseFidelizadaHoy) },
      { label: 'Vuelven cada', value: frecuencia.global.intervalos > 0 ? `${Math.round(frecuencia.global.medianaDias)} días` : 'Sin datos' },
      { label: 'Estrenaron el salón', value: String(embudo.nuevos) },
      { label: 'Volvieron 2ª vez', value: `${embudo.volvieron} (${Math.round(embudo.pctVuelven)} %)` },
      { label: 'Ya son del salón (3+)', value: `${embudo.fieles} (${Math.round(embudo.pctFieles)} %)` },
      { label: 'En riesgo (60+ días)', value: String(retencionData.inactivos) },
    ].map(k => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`).join('');

    // Comisiones
    const esCabeceraComisionConfigurada = modeloComision === 'configurado';
    const comRows = comisionesData.map(p => `<tr><td>${esc(p.nombre)}</td><td class="num">${p.citas}</td><td class="num">${fmtEur(p.baseSinIva)} €</td><td class="num">${fmtEur(p.comision)} €</td><td class="num">${Math.round(p.pctEfectivo)}%</td><td class="num">${fmtEur(p.costeEmpresa)} €</td><td>${p.real ? 'Real' : 'Estimado'}</td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">Sin datos</td></tr>';
    const comTotCitas = comisionesData.reduce((s, p) => s + p.citas, 0);

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
    <h2>Fidelización de clientes</h2>
    <div class="kpis">${retCards}</div>
  </section>

  <section>
    <h2>Comisiones · ${esc(esCabeceraComisionConfigurada ? 'porcentaje configurado de cada profesional' : (modeloComision === 'tramos' ? 'simulación por tramos' : `simulación al ${comisionPct}%`))}</h2>
    <table>
      <thead><tr><th>Profesional</th><th class="num">Citas</th><th class="num">Base sin IVA</th><th class="num">Comisión</th><th class="num">%</th><th class="num">Coste empresa</th><th>Origen</th></tr></thead>
      <tbody>${comRows}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${comTotCitas}</td><td class="num">${fmtEur(comisionCalculo.totales.baseSinIva)} €</td><td class="num">${fmtEur(comisionCalculo.totales.comisiones)} €</td><td></td><td class="num">${fmtEur(comisionCalculo.totales.costeEmpresa)} €</td><td></td></tr></tfoot>
    </table>
    <p style="font-size:9.5px;color:#736658;margin-top:7px;line-height:1.5">
      Comisión sobre la base sin IVA (el IVA es de Hacienda, no del salón). El coste de empresa
      añade la cuota patronal del ${esc(CUOTA_PATRONAL_PCT)}%. ${esc(AVISO_LEGAL)}
    </p>
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

  // -- C4: serie temporal (ingresos y citas por periodo agrupado) --
  const agruparFecha = useCallback((d: Date) => {
    if (granularidad === 'hora') return format(startOfHour(d), "yyyy-MM-dd'T'HH");
    if (granularidad === 'semana') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (granularidad === 'mes') return format(startOfMonth(d), 'yyyy-MM-dd');
    return format(d, 'yyyy-MM-dd');
  }, [granularidad]);

  // Momentos que forman el eje X. Con grano de hora se recorren solo las horas de
  // apertura del salon: un eje de 24 puntos con 13 a cero no se lee.
  const momentosDelPeriodo = useCallback((): Date[] => {
    const ahora = new Date();
    if (granularidad === 'hora') {
      const ini = new Date(desde); ini.setHours(HORARIO_APERTURA.horas, 0, 0, 0);
      const cierre = new Date(desde); cierre.setHours(HORARIO_CIERRE.horas, 0, 0, 0);
      // Tampoco se pintan las horas de hoy que no han llegado.
      const fin = cierre.getTime() > ahora.getTime() ? startOfHour(ahora) : cierre;
      if (fin.getTime() < ini.getTime()) return [ini];
      return eachHourOfInterval({ start: ini, end: fin });
    }
    return eachDayOfInterval({ start: desde, end: hastaEfectivo });
  }, [granularidad, desde, hastaEfectivo]);

  const tendenciaData = useMemo(() => {
    const dias = momentosDelPeriodo();
    const map = new Map<string, { fecha: Date, ingresos: number; citas: number }>();
    dias.forEach(d => {
      const g = agruparFecha(d);
      if (!map.has(g)) map.set(g, { fecha: d, ingresos: 0, citas: 0 }); // Usamos el primer dia del grupo
    });
    activas.forEach(c => {
      const key = agruparFecha(parseISO(c.inicio));
      const b = map.get(key);
      if (b) { b.ingresos += srvMap.get(c.servicio_id ?? '')?.precio || 0; b.citas += 1; }
    });
    return Array.from(map.values()).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [activas, srvMap, momentosDelPeriodo, agruparFecha]);

  const noShowEvolucionData = useMemo(() => {
    const dias = momentosDelPeriodo();
    const map = new Map<string, { fecha: Date, count: number }>();
    dias.forEach(d => {
      const g = agruparFecha(d);
      if (!map.has(g)) map.set(g, { fecha: d, count: 0 });
    });
    noShows.forEach(c => {
      const key = agruparFecha(parseISO(c.inicio));
      const b = map.get(key);
      if (b) b.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [noShows, momentosDelPeriodo, agruparFecha]);

  const retencionEvolucionData = useMemo(() => {
    const dias = momentosDelPeriodo();
    const map = new Map<string, { fecha: Date, nuevos: number; recurrentes: number }>();
    dias.forEach(d => {
      const g = agruparFecha(d);
      if (!map.has(g)) map.set(g, { fecha: d, nuevos: 0, recurrentes: 0 });
    });
    
    // Calculate if it's the first appointment overall.
    // For simplicity with currently fetched 'citas', a client is 'nuevo' in this period if they only have 1 appointment or this is their chronologically first in this fetched set. 
    // If they have multiple, the subsequent ones are recurrent.
    const clienteVisitasGlobal: Record<string, Date[]> = {};
    citas.forEach(c => {
      if (!c.cliente_id) return;
      if (!clienteVisitasGlobal[c.cliente_id]) clienteVisitasGlobal[c.cliente_id] = [];
      clienteVisitasGlobal[c.cliente_id].push(parseISO(c.inicio));
    });

    Object.keys(clienteVisitasGlobal).forEach(cid => {
      clienteVisitasGlobal[cid].sort((a, b) => a.getTime() - b.getTime());
    });

    activas.forEach(c => {
      if (!c.cliente_id) return;
      const d = parseISO(c.inicio);
      const key = agruparFecha(d);
      const b = map.get(key);
      if (b) {
        // Is this the very first visit?
        const isFirst = clienteVisitasGlobal[c.cliente_id][0].getTime() === d.getTime();
        if (isFirst) b.nuevos += 1;
        else b.recurrentes += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [activas, citas, momentosDelPeriodo, agruparFecha]);

  const eficienciaReposoEvolucionData = useMemo(() => {
    const dias = momentosDelPeriodo();
    const map = new Map<string, { fecha: Date, totalMin: number; usedMin: number }>();
    dias.forEach(d => {
      const g = agruparFecha(d);
      if (!map.has(g)) map.set(g, { fecha: d, totalMin: 0, usedMin: 0 });
    });

    const byProf: Record<string, Cita[]> = {};
    activas.forEach(c => {
      if (!byProf[c.profesional_id]) byProf[c.profesional_id] = [];
      byProf[c.profesional_id].push(c);
    });

    Object.values(byProf).forEach(profCitas => {
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

        const min = (restEnd - restStart) / 60000;
        const start = new Date(c.fin_activa!);
        
        let overlapMin = 0;
        profCitas.forEach(other => {
          if (other.id === c.id) return;
          const oS = new Date(other.inicio).getTime();
          const oE = new Date(other.fin).getTime();
          const overlapStart = Math.max(restStart, oS);
          const overlapEnd = Math.min(restEnd, oE);
          if (overlapEnd > overlapStart) {
            overlapMin += (overlapEnd - overlapStart) / 60000;
          }
        });
        const used = Math.min(min, overlapMin);

        const key = agruparFecha(start);
        const b = map.get(key);
        if (b) {
          b.totalMin += min;
          b.usedMin += used;
        }
      });
    });

    return Array.from(map.values()).map(d => ({
      fecha: d.fecha,
      pct: d.totalMin > 0 ? (d.usedMin / d.totalMin) * 100 : 0
    })).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [activas, momentosDelPeriodo, agruparFecha]);

  // Graficas: components/charts/GraficaExplicada envuelve a LineChartMini (que
  // reutiliza tambien el bloque 'grafica' de Chispa) y le añade el icono "i" con
  // el concepto y la banda con la lectura real de los datos.

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
          <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, color: TOKENS.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            Informes
            <button
              onClick={() => setShowManualPanel(true)}
              className="m-btn-icon"
              title="Manual de esta pagina"
              style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, color: TOKENS.textSec, cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <AvisosBell mode="header" />
          </h1>
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
                className={periodo === p.key ? 'seg-btn is-active' : 'seg-btn'}
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
        {!paginaManual.loading && !paginaManual.visto && (
          <div style={{ marginBottom: 16 }}>
            <AvisoPrimeraVisita
              content={manualInformes}
              isMobile={isMobile}
              onVerManual={() => { paginaManual.marcarVisto(); setShowManualPanel(true); }}
              onCerrar={paginaManual.marcarVisto}
            />
          </div>
        )}
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
                ...(hayCobros ? [
                  { label: 'Cobrado (real)', value: `${fmtEur(totalCobrado)} EUR`, icon: 'dollar', color: TOKENS.primary, bg: TOKENS.primarySoft },
                  { label: 'Margen (aprox)', value: `${fmtEur(margenAproximado)} EUR`, icon: 'trendingUp', color: TOKENS.success, bg: TOKENS.successSoft }
                ] : []),
                { label: 'Citas/profesional', value: `${Math.round(ocupacionGlobal * 10) / 10}`, icon: 'barChart', color: TOKENS.cyan, bg: TOKENS.cyanSoft },
                { label: 'No-shows', value: `${noShows.length} (${fmtPct(tasaNoShow)})`, icon: 'alertTriangle', color: TOKENS.danger, bg: TOKENS.dangerSoft },
                { label: 'Tiempo espera medio', value: `${Math.round(esperaData.avgGlobal)} min`, icon: 'clock', color: TOKENS.warning, bg: TOKENS.warningSoft },
                { label: 'Reposo aprovechado', value: fmtPct(reposoData.pctGlobal), icon: 'zap', color: TOKENS.violet, bg: TOKENS.violetSoft },
                { label: 'Clientes activos', value: retencionData.clientesActivos, icon: 'users', color: TOKENS.primary, bg: TOKENS.primarySoft },
                { label: 'Vuelven cada', value: frecuencia.global.intervalos > 0 ? `${Math.round(frecuencia.global.medianaDias)} dias` : 'Sin datos', icon: 'heart', color: TOKENS.rose, bg: TOKENS.roseSoft },
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
                      <span style={isMobile
                        ? { fontSize: 11, color: TOKENS.textTer, fontWeight: 500, flex: 1, lineHeight: 1.25 }
                        : { fontSize: 11, color: TOKENS.textTer, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }
                      } title={kpi.label}>{kpi.label}</span>
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
            {/* Sesion 7 V2: informe narrado proactivo (patron TarjetaAyudaIA) */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <TarjetaAyudaIA
                titulo="Informe narrado"
                subtitulo="Lectura de Chispa sobre este periodo"
                estado={informeIA.estado}
                onAnalizar={analizarInformeIA}
                botonLabel="Analizar periodo"
                mensajeVacio="Chispa no ha encontrado nada que destacar en este periodo."
                resumenDeterminista={resumenInformeDeterminista}
                accionEstado={accionEstadoInformeIA}
                onConfirmarAccion={confirmarAccionInformeIA}
                onCancelarAccion={() => setAccionEstadoInformeIA('cancelada')}
                isMobile={isMobile}
              />
            </div>

            {/* ============================================================= */}
            {/* C4: Evolucion temporal                                        */}
            {/* Cada grafica se explica sola: el icono "i" dice que mide y la   */}
            {/* banda de abajo dice que esta diciendo con ESTOS datos. El grano */}
            {/* del eje X lo manda el filtro de arriba (ya no hay dos filtros). */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader icon="trendingUp" iconColor={TOKENS.success} title="Evolución temporal" subtitle={`${periodoLabel} · ${etiquetaGrano}${avisoRecorte}`} />
              <SectionBody>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 20 : 26 }}>
                  <GraficaExplicada
                    titulo="Ingresos"
                    queEs={`Lo que factura el salón en cada ${nombreGrano(granularidad)}, sumando el precio de los servicios de las citas que no se cancelaron. Sirve para ver si la facturación crece o se estanca y para localizar los huecos flojos que rellenar con campañas.`}
                    serie={tendenciaData.map(d => ({ fecha: d.fecha, valor: d.ingresos }))}
                    color={TOKENS.success}
                    unidad="eur"
                    granularidad={granularidad}
                    etiquetaPie={etiquetaPieGrafica}
                    labelExplicativo="Ingresos del periodo"
                    isMobile={isMobile}
                  />
                  <GraficaExplicada
                    titulo="Volumen de citas"
                    queEs={`Cuántas citas entran en cada ${nombreGrano(granularidad)}. No depende del precio: si las citas suben y los ingresos no, estás vendiendo servicios más baratos que antes.`}
                    serie={tendenciaData.map(d => ({ fecha: d.fecha, valor: d.citas }))}
                    color={TOKENS.primary}
                    unidad="conteo"
                    sustantivo="citas"
                    sustantivoSing="cita"
                    granularidad={granularidad}
                    etiquetaPie={etiquetaPieGrafica}
                    labelExplicativo="Citas reservadas"
                    isMobile={isMobile}
                  />
                  <GraficaExplicada
                    titulo="Ausencias (no-shows)"
                    queEs={`Clientes que no aparecieron y no avisaron, en cada ${nombreGrano(granularidad)}. Si la línea sube, toca reforzar los recordatorios o pedir señal para reservar.`}
                    serie={noShowEvolucionData.map(d => ({ fecha: d.fecha, valor: d.count }))}
                    color={TOKENS.danger}
                    unidad="conteo"
                    sustantivo="ausencias"
                    sustantivoSing="ausencia"
                    granularidad={granularidad}
                    etiquetaPie={etiquetaPieGrafica}
                    labelExplicativo="No se presentaron"
                    isMobile={isMobile}
                  />
                  <GraficaExplicada
                    titulo="Aprovechamiento del reposo"
                    queEs="Del tiempo que un cliente pasa en reposo (mientras actúa un tinte, por ejemplo), qué porcentaje se reaprovecha para atender a otra persona. Cuanto más alto, más partido le saca tu agenda al tiempo muerto."
                    serie={eficienciaReposoEvolucionData.map(d => ({ fecha: d.fecha, valor: d.pct }))}
                    color={TOKENS.violet}
                    unidad="pct"
                    granularidad={granularidad}
                    labelExplicativo="Reposo reutilizado"
                    isMobile={isMobile}
                  />
                </div>

                <div style={{
                  marginTop: 18, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(244,80,30,0.05)', border: `1px solid ${TOKENS.borderHi}`,
                  fontSize: 11.5, color: TOKENS.textSec, lineHeight: 1.5
                }}>
                  Cada gráfica lleva debajo su lectura. Si quieres el dato de un punto concreto,
                  pasa el cursor o tócalo: sale la fecha exacta, la cifra y la variación respecto
                  al punto anterior. La línea de puntos gris es tu media del periodo.
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
                    <BarHorizontal key={p.profId} pct={p.pct} color={p.color} label={p.nombre} sublabel={fmtCitas(p.citas)} delay={i * 80} />
                  ))}
                </div>

                {/* By franja */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por franja horaria</div>
                  {FRANJAS.map((f, i) => {
                    const total = ocupacionData.total;
                    const cnt = ocupacionData.franjaCount[i];
                    return <BarHorizontal key={f} pct={total > 0 ? (cnt / total) * 100 : 0} color={TOKENS.cyan} label={f} sublabel={fmtCitas(cnt)} delay={i * 80} />;
                  })}
                </div>

                {/* By day */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Por dia de la semana</div>
                  {[1, 2, 3, 4, 5, 6, 0].map((d, i) => {
                    const total = ocupacionData.total;
                    const cnt = ocupacionData.diaCount[d];
                    return <BarHorizontal key={d} pct={total > 0 ? (cnt / total) * 100 : 0} color={TOKENS.primary} label={DIAS_SEMANA[d]} sublabel={fmtCitas(cnt)} delay={i * 80} />;
                  })}
                </div>

                <BandaLectura
                  frase={lecturaOcupacion.frase}
                  chips={lecturaOcupacion.chips}
                  color={TOKENS.cyan}
                  atenuada={lecturaOcupacion.vacio}
                  isMobile={isMobile}
                />
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

                <BandaLectura
                  frase={lecturaNoShows.frase}
                  chips={lecturaNoShows.chips}
                  color={TOKENS.danger}
                  atenuada={lecturaNoShows.vacio}
                  isMobile={isMobile}
                />
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

                <BandaLectura
                  frase={lecturaServicios.frase}
                  chips={lecturaServicios.chips}
                  color={TOKENS.primary}
                  atenuada={lecturaServicios.vacio}
                  isMobile={isMobile}
                />
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.7: Fidelizacion — la seccion que dice si el salon mejora     */}
            {/* Sustituye a la vieja "Retencion", que medi­a dias medios entre  */}
            {/* visitas DENTRO del periodo del filtro. Con el filtro en semana */}
            {/* aquello era ruido puro, y ademas no respondia a la unica       */}
            {/* pregunta que importa: cuantos clientes consigues retener.      */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader
                id="retencion"
                icon="heart"
                iconColor={TOKENS.rose}
                title="Fidelización: ¿está creciendo tu base?"
                subtitle={`${baseFidelizadaHoy} clientes fidelizados ahora mismo · calculado sobre 13 meses de historial`}
              />
              <SectionBody id="retencion">
                {historicoRecortado && (
                  <div style={{
                    marginBottom: 14, padding: '9px 12px', borderRadius: 8,
                    background: TOKENS.warningSoft, border: `1px solid ${TOKENS.warning}44`,
                    fontSize: 11.5, color: TOKENS.textSec, lineHeight: 1.5,
                  }}>
                    <strong>Aviso:</strong> tienes tantas citas en estos 13 meses que el historial se ha
                    tenido que recortar, así que las cifras de esta sección se quedan cortas. Dínoslo y
                    lo pasamos a un cálculo en servidor.
                  </div>
                )}

                {/* --- B1: la curva que mide la mejora real del salon --- */}
                <GraficaExplicada
                  titulo="Base fidelizada, mes a mes"
                  queEs={`Al cerrar cada mes, cuántos clientes habían venido ya al menos dos veces y seguían vivos (con una visita en los últimos ${VENTANA_ACTIVO_DIAS} días). Es la métrica que mide de verdad si el salón mejora: no los que entran por la puerta una vez, sino los que consigues que vuelvan. Si esta línea sube, vas bien pase lo que pase con el resto.`}
                  serie={baseFidelizadaSerie}
                  color={TOKENS.rose}
                  unidad="conteo"
                  sustantivo="clientes"
                  sustantivoSing="cliente"
                  granularidad="mes"
                  etiquetaX="mes a mes"
                  labelExplicativo="Clientes fidelizados y activos"
                  isMobile={isMobile}
                />

                {/* --- A6: cada cuanto vuelven --- */}
                <div style={{
                  marginTop: 20, padding: isMobile ? '12px 13px' : '14px 16px', borderRadius: 12,
                  background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Cada cuánto vuelven
                    </span>
                    <InfoDot
                      text="Días que pasan entre una visita y la siguiente del mismo cliente, medido sobre los 13 meses de historial. Se da la mediana y no la media porque un cliente que reaparece al año y medio infla la media y te hace creer que el salón va peor de lo que va."
                      color={TOKENS.rose}
                    />
                  </div>

                  {frecuencia.global.intervalos === 0 ? (
                    <div style={{ fontSize: 12, color: TOKENS.textTer }}>
                      Todavía no hay clientes con dos visitas, así que no se puede medir el ciclo de retorno.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                        {[
                          { label: 'Ciclo típico', value: `${Math.round(frecuencia.global.medianaDias)} días`, color: TOKENS.rose, ayuda: 'La mediana: la mitad de tus clientes vuelven antes de este plazo y la otra mitad después. Es la cifra honesta.' },
                          { label: 'Media', value: `${Math.round(frecuencia.global.mediaDias)} días`, color: TOKENS.textTer, ayuda: 'El promedio a secas. Si es muy superior al ciclo típico, tienes clientes que reaparecen muy de tarde en tarde y te estiran la cuenta.' },
                          { label: 'Los fieles', value: frecuencia.fieles.intervalos > 0 ? `${Math.round(frecuencia.fieles.medianaDias)} días` : '—', color: TOKENS.success, ayuda: 'Ciclo de los clientes con tres visitas o más: los que ya son del salón.' },
                          { label: 'Los de dos visitas', value: frecuencia.ocasionales.intervalos > 0 ? `${Math.round(frecuencia.ocasionales.medianaDias)} días` : '—', color: TOKENS.warning, ayuda: 'Ciclo de los que volvieron una vez y no más. Cuanto más se separe del de los fieles, más gente se te escapa por el camino.' },
                        ].map(k => (
                          <div key={k.label} style={{
                            padding: '10px 12px', borderRadius: 10,
                            background: `${k.color}10`, border: `1px solid ${k.color}22`,
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10.5, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                {k.label}
                              </span>
                              <InfoDot text={k.ayuda} color={k.color} />
                            </span>
                            <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: k.color, marginTop: 3 }}>{k.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: isMobile ? 11.5 : 12, lineHeight: 1.55, color: TOKENS.textSec }}>
                        {fraseDeFrecuencia}
                      </div>
                      {frecuencia.fichasDescartadas > 0 && (
                        <div style={{ fontSize: 10.5, lineHeight: 1.5, color: TOKENS.textTer, marginTop: 6 }}>
                          Se {frecuencia.fichasDescartadas === 1 ? 'ha dejado' : 'han dejado'} fuera{' '}
                          {frecuencia.fichasDescartadas === 1 ? 'una ficha' : `${frecuencia.fichasDescartadas} fichas`} con
                          visitas casi a diario: son las que se usan para atender sin cita y no son una
                          persona, así que falsearían el ciclo.
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* --- B2: el embudo, de donde sale la base --- */}
                <div style={{
                  marginTop: 14, padding: isMobile ? '12px 13px' : '14px 16px', borderRadius: 12,
                  background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textSec, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      De dónde sale esa base · {periodoLabel}
                    </span>
                    <InfoDot
                      text="De los clientes que estrenaron el salón en este periodo, cuántos han vuelto una segunda vez y cuántos han llegado a tres visitas. Cada porcentaje es sobre el peldaño de arriba: esa es la conversión que puedes mejorar."
                      color={TOKENS.cyan}
                    />
                  </div>

                  {embudo.nuevos === 0 ? (
                    <div style={{ fontSize: 12, color: TOKENS.textTer }}>
                      Ningún cliente ha estrenado el salón en este periodo. Prueba con un periodo más amplio.
                    </div>
                  ) : (
                    <>
                      {[
                        {
                          label: 'Estrenaron el salón', valor: embudo.nuevos, pct: 100,
                          sangria: 0, color: TOKENS.cyan,
                          nota: 'Primera visita de su vida en tu salón.',
                        },
                        {
                          label: 'Volvieron una segunda vez', valor: embudo.volvieron, pct: embudo.pctVuelven,
                          sangria: 1, color: TOKENS.rose,
                          nota: 'La conversión que más manda: quien no vuelve una segunda vez, casi nunca vuelve.',
                        },
                        {
                          label: 'Ya son del salón (3 visitas o más)', valor: embudo.fieles, pct: embudo.pctFieles,
                          sangria: 2, color: TOKENS.success,
                          nota: 'A partir de la tercera visita el cliente ya cuenta como tuyo.',
                        },
                      ].map(p => (
                        <div key={p.label} style={{ marginBottom: 10, paddingLeft: p.sangria * (isMobile ? 12 : 20) }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: TOKENS.text, flex: 1 }}>{p.label}</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: p.color }}>{p.valor}</span>
                            {p.sangria > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textTer, minWidth: 38, textAlign: 'right' }}>
                                {Math.round(p.pct)} %
                              </span>
                            )}
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.10)', overflow: 'hidden' }}>
                            <div className="bar-fill" style={{
                              width: `${Math.max(2, (p.valor / Math.max(1, embudo.nuevos)) * 100)}%`,
                              height: '100%', borderRadius: 4, background: p.color,
                            }} />
                          </div>
                          <div style={{ fontSize: 10.5, color: TOKENS.textTer, marginTop: 3 }}>{p.nota}</div>
                        </div>
                      ))}
                      <div style={{ fontSize: isMobile ? 11.5 : 12, lineHeight: 1.55, color: TOKENS.textSec, marginTop: 8 }}>
                        {embudo.pctVuelven >= 40
                          ? `De cada 10 clientes nuevos vuelven ${Math.round(embudo.pctVuelven / 10)}. Eso está bien: lo que entra, se queda.`
                          : `De cada 10 clientes nuevos solo vuelven ${Math.round(embudo.pctVuelven / 10)}. Ahí tienes el agujero más grande del salón: no te hace falta más gente entrando, te hace falta que la que entra vuelva.`}
                      </div>
                    </>
                  )}
                </div>

                {/* --- B3: cohortes, plegado para no abrumar --- */}
                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={() => setVerCohortes(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                      padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
                      background: 'transparent', border: `1px dashed ${TOKENS.borderHi}`,
                      fontSize: 11.5, fontWeight: 600, color: TOKENS.textSec, textAlign: 'left',
                    }}
                  >
                    <span style={{ color: TOKENS.primary, fontSize: 13 }}>{verCohortes ? '−' : '+'}</span>
                    {verCohortes ? 'Ocultar el análisis avanzado por cohortes' : 'Ver el análisis avanzado por cohortes'}
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: TOKENS.textTer, fontWeight: 400 }}>
                      para cuando quieras entrar al detalle
                    </span>
                  </button>

                  {verCohortes && (
                    <div style={{
                      marginTop: 10, padding: isMobile ? '12px 11px' : '14px 16px', borderRadius: 12,
                      background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`,
                    }}>
                      <div style={{ fontSize: 11.5, color: TOKENS.textSec, lineHeight: 1.55, marginBottom: 12 }}>
                        <strong style={{ color: TOKENS.text }}>Cómo se lee:</strong> cada fila es un grupo de clientes
                        según el mes en que estrenaron el salón. Las columnas son los meses que pasaron después. El número
                        es el porcentaje de ese grupo que volvió en ese mes. Cuanto más oscura la casilla, mejor aguanta ese
                        grupo. Un punto significa que ese mes todavía no ha llegado.
                      </div>

                      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 420 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '5px 8px', color: TOKENS.textTer, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
                                Entraron en
                              </th>
                              <th style={{ textAlign: 'right', padding: '5px 8px', color: TOKENS.textTer, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                Nº
                              </th>
                              {Array.from({ length: cohortes.offsets }, (_, i) => (
                                <th key={i} style={{ padding: '5px 8px', color: TOKENS.textTer, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {i + 1}{i === 0 ? ' mes' : ' meses'}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...cohortes.cohortes].reverse().map(c => (
                              <tr key={c.mes.toISOString()}>
                                <td style={{ padding: '5px 8px', color: TOKENS.text, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                  {format(c.mes, 'MMM yyyy', { locale: es })}
                                </td>
                                <td style={{ padding: '5px 8px', textAlign: 'right', color: c.tamano > 0 ? TOKENS.textSec : TOKENS.textTer, fontWeight: 600 }}>
                                  {c.tamano || '—'}
                                </td>
                                {c.retencion.map((r, i) => (
                                  <td key={i} style={{
                                    padding: '5px 8px', textAlign: 'center',
                                    // La intensidad del fondo codifica el %: 0 transparente,
                                    // 100 naranja de marca. Se topa en 0.8 para que el numero
                                    // siga leyendose encima.
                                    background: r === null ? 'transparent' : `rgba(244,80,30,${(r / 100) * 0.8})`,
                                    color: r === null ? TOKENS.textTer : (r > 55 ? '#fff' : TOKENS.text),
                                    fontWeight: r === null ? 400 : 600,
                                    borderRadius: 4,
                                  }}>
                                    {r === null ? '·' : `${Math.round(r)}%`}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{
                        marginTop: 12, padding: '10px 12px', borderRadius: 10,
                        background: `${TOKENS.rose}0d`, border: `1px solid ${TOKENS.rose}33`,
                        fontSize: isMobile ? 11.5 : 12, lineHeight: 1.55, color: TOKENS.textSec,
                      }}>
                        {fraseCohortes}
                      </div>
                    </div>
                  )}
                </div>
              </SectionBody>
            </div>

            {/* ============================================================= */}
            {/* 9.8: Comisiones — simulador                                    */}
            {/* Usa el motor compartido con la calculadora publica. Antes esta  */}
            {/* pantalla solo sabia aplicar un % plano igual para todos, e      */}
            {/* ignoraba el comision_pct configurado en cada ficha de equipo.   */}
            {/* ============================================================= */}
            <div style={{ marginBottom: isMobile ? 10 : 14 }}>
              <SectionHeader
                id="comisiones"
                icon="percent"
                iconColor={TOKENS.amber}
                title="Comisiones por profesional"
                subtitle={
                  modeloComision === 'configurado'
                    ? (hayConfiguracionPropia
                        ? 'Con el porcentaje que tiene configurado cada uno en su ficha'
                        : `Nadie tiene porcentaje en su ficha, así que se aplica el ${comisionPct} % general`)
                    : modeloComision === 'tramos'
                      ? 'Simulación por tramos de facturación'
                      : `Simulación con un ${comisionPct} % igual para todos`
                }
              />
              <SectionBody id="comisiones">

                {/* --- Escenario --- */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                  padding: '9px 12px', borderRadius: 10, background: TOKENS.amberSoft, flexWrap: 'wrap',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 600 }}>Escenario:</span>
                    <InfoDot
                      text="«Como lo tienes» aplica a cada profesional el porcentaje de su ficha de equipo. Los otros dos son simulaciones: no cambian nada, solo te dicen qué pasaría. Todo se calcula sobre la base sin IVA, porque el IVA es de Hacienda."
                      color={TOKENS.warning}
                    />
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {([
                      { key: 'configurado' as ModeloComision, label: 'Como lo tienes' },
                      { key: 'plano' as ModeloComision, label: 'Simular un % único' },
                      { key: 'tramos' as ModeloComision, label: 'Simular por tramos' },
                    ]).map(m => (
                      <button
                        key={m.key}
                        className={modeloComision === m.key ? 'seg-btn is-active' : 'seg-btn'}
                        onClick={() => setModeloComision(m.key)}
                        style={{
                          padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: modeloComision === m.key ? 600 : 400,
                          background: modeloComision === m.key ? TOKENS.warning : 'transparent',
                          color: modeloComision === m.key ? '#000' : TOKENS.textSec,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Porcentaje (para "configurado" es solo el respaldo) --- */}
                {modeloComision !== 'tramos' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: TOKENS.textSec }}>
                      {modeloComision === 'configurado' ? 'Para quien no lo tenga configurado:' : 'Porcentaje a simular:'}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {[20, 25, 30, 35, 40].map(pct => (
                        <button
                          key={pct}
                          className={comisionPct === pct && !comisionCustom ? 'seg-btn is-active' : 'seg-btn'}
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
                        className="m-input"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Otro"
                        aria-label="Otro porcentaje de comision"
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
                )}

                {/* --- Tramos --- */}
                {modeloComision === 'tramos' && (
                  <div style={{
                    marginBottom: 12, padding: '12px 13px', borderRadius: 10,
                    background: TOKENS.bgCardHi, border: `1px solid ${TOKENS.border}`,
                  }}>
                    <div style={{ fontSize: 11.5, color: TOKENS.textSec, lineHeight: 1.5, marginBottom: 10 }}>
                      Cada porción de la facturación se paga a su tipo, como el IRPF: con 25 % hasta
                      2.000 € y 35 % de ahí en adelante, quien factura 3.000 € cobra el 25 % de los
                      primeros 2.000 y el 35 % de los 1.000 restantes. Deja el «hasta» del último
                      vacío para decir «de aquí en adelante».
                    </div>
                    {tramos.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: TOKENS.textTer, minWidth: 42 }}>Desde</span>
                        <input
                          className="m-input" type="number" min={0} step={100} value={t.desde}
                          aria-label={`Desde, tramo ${i + 1}`}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setTramos(prev => prev.map((x, j) => (j === i ? { ...x, desde: v } : x)));
                          }}
                          style={{ width: 90, padding: '5px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.text, outline: 'none' }}
                        />
                        <span style={{ fontSize: 11, color: TOKENS.textTer }}>hasta</span>
                        <input
                          className="m-input" type="number" min={0} step={100}
                          value={t.hasta === null ? '' : t.hasta}
                          placeholder="en adelante"
                          aria-label={`Hasta, tramo ${i + 1}`}
                          onChange={e => {
                            const raw = e.target.value.trim();
                            const v = raw === '' ? null : (parseFloat(raw) || 0);
                            setTramos(prev => prev.map((x, j) => (j === i ? { ...x, hasta: v } : x)));
                          }}
                          style={{ width: 100, padding: '5px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.text, outline: 'none' }}
                        />
                        <span style={{ fontSize: 11, color: TOKENS.textTer }}>al</span>
                        <input
                          className="m-input" type="number" min={0} max={100} step={0.5} value={t.porcentaje}
                          aria-label={`Porcentaje, tramo ${i + 1}`}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0;
                            setTramos(prev => prev.map((x, j) => (j === i ? { ...x, porcentaje: v } : x)));
                          }}
                          style={{ width: 66, padding: '5px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.text, outline: 'none' }}
                        />
                        <span style={{ fontSize: 11, color: TOKENS.textTer }}>%</span>
                        {tramos.length > 1 && (
                          <button
                            onClick={() => setTramos(prev => prev.filter((_, j) => j !== i))}
                            aria-label={`Quitar el tramo ${i + 1}`}
                            style={{ marginLeft: 'auto', border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textTer, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setTramos(prev => {
                        const ultimo = prev[prev.length - 1];
                        const desde = ultimo ? (ultimo.hasta ?? ultimo.desde + 2000) : 0;
                        return [...prev, { desde, hasta: null, porcentaje: 40 }];
                      })}
                      style={{
                        marginTop: 4, fontSize: 12, fontWeight: 600, color: TOKENS.primaryHi,
                        background: 'transparent', border: `1px dashed ${TOKENS.borderHi}`,
                        borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                      }}
                    >
                      + Añadir tramo
                    </button>
                  </div>
                )}

                {/* --- Resultado en grande --- */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    {
                      label: 'Comisiones', valor: `${fmtEur(comisionCalculo.totales.comisiones)} €`, color: TOKENS.warning,
                      ayuda: 'Suma de las comisiones del periodo, calculadas sobre la base sin IVA de lo que ha facturado cada uno.',
                    },
                    {
                      label: 'Te cuesta', valor: `${fmtEur(comisionCalculo.totales.costeEmpresa)} €`, color: TOKENS.danger,
                      ayuda: `Coste real de empresa: la comisión más la cuota patronal de la Seguridad Social (${CUOTA_PATRONAL_PCT} % en 2026 para un indefinido en peluquería). El sueldo nunca es lo que cuesta un empleado.`,
                    },
                    {
                      label: 'Cada punto de %', valor: `${fmtEur(comisionCalculo.totales.costePorPuntoDeComision)} €`, color: TOKENS.cyan,
                      ayuda: 'Lo que te costaría subir la comisión un punto porcentual en este periodo, con su cuota patronal. Es la cifra que necesitas cuando negocias con tu equipo.',
                    },
                    {
                      label: 'Margen del salón', valor: `${fmtEur(comisionCalculo.totales.margenSalon)} €`, color: comisionCalculo.totales.margenSalon >= 0 ? TOKENS.success : TOKENS.danger,
                      ayuda: 'Lo que queda de la base sin IVA después del coste del equipo y de los gastos que tengas registrados en la sección de Gastos.',
                    },
                  ].map(k => (
                    <div key={k.label} style={{
                      padding: '11px 13px', borderRadius: 10,
                      background: `${k.color}10`, border: `1px solid ${k.color}22`,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10.5, color: TOKENS.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {k.label}
                        </span>
                        <InfoDot text={k.ayuda} color={k.color} />
                      </span>
                      <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: k.color, marginTop: 3 }}>{k.valor}</div>
                    </div>
                  ))}
                </div>

                {/* --- ¿Qué pasa si...? Solo tiene sentido al simular --- */}
                {deltaComision.esSimulacion && (
                  <div style={{
                    marginBottom: 14, padding: '12px 14px', borderRadius: 10,
                    background: Math.abs(deltaComision.coste) < 1 ? 'rgba(115,102,88,0.06)' : (deltaComision.coste > 0 ? TOKENS.dangerSoft : TOKENS.successSoft),
                    border: `1px solid ${Math.abs(deltaComision.coste) < 1 ? TOKENS.border : (deltaComision.coste > 0 ? TOKENS.danger : TOKENS.success)}44`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                      ¿Qué pasa si lo cambias?
                    </div>
                    <div style={{ fontSize: isMobile ? 12 : 12.5, lineHeight: 1.55, color: TOKENS.textSec }}>
                      {Math.abs(deltaComision.coste) < 1 ? (
                        <>Este escenario te sale prácticamente igual que lo que ya tienes configurado.</>
                      ) : deltaComision.coste > 0 ? (
                        <>
                          Comparado con lo que tienes hoy, este escenario te costaría{' '}
                          <strong style={{ color: TOKENS.danger }}>{fmtEur(deltaComision.coste)} € más</strong> en
                          este periodo y tu margen bajaría{' '}
                          <strong style={{ color: TOKENS.danger }}>{fmtPuntos(deltaComision.puntosMargen)} puntos</strong>{' '}
                          (de {Math.round(comisionReferencia.totales.margenPct)} % a {Math.round(comisionCalculo.totales.margenPct)} %).
                        </>
                      ) : (
                        <>
                          Comparado con lo que tienes hoy, este escenario te ahorraría{' '}
                          <strong style={{ color: TOKENS.success }}>{fmtEur(Math.abs(deltaComision.coste))} €</strong> en
                          este periodo y tu margen subiría{' '}
                          <strong style={{ color: TOKENS.success }}>{fmtPuntos(deltaComision.puntosMargen)} puntos</strong>{' '}
                          (de {Math.round(comisionReferencia.totales.margenPct)} % a {Math.round(comisionCalculo.totales.margenPct)} %).
                          Ojo: bajar la comisión también suele bajar la motivación del equipo.
                        </>
                      )}
                      {!hayConfiguracionPropia && (
                        <> Como nadie tiene su porcentaje puesto en la ficha, la comparación se hace contra
                        un {COMISION_PCT_POR_DEFECTO} % para todos. Configúralos en Equipo y esta cifra será
                        la de tu salón de verdad.</>
                      )}
                    </div>
                  </div>
                )}

                {/* --- Tabla por profesional --- */}
                <div style={{ width: '100%' }}>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${TOKENS.border}` }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.9fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                      background: TOKENS.bgPanel, borderBottom: `1px solid ${TOKENS.border}`,
                      fontSize: isMobile ? 10 : 11, fontWeight: 600, color: TOKENS.textTer, textTransform: 'uppercase', letterSpacing: isMobile ? 0.2 : 0.5,
                    }}>
                      <div>Profesional</div>
                      <div style={{ textAlign: 'right' }}>{isMobile ? 'Base' : 'Base sin IVA'}</div>
                      <div style={{ textAlign: 'right' }}>{isMobile ? 'Comis.' : 'Comision'}</div>
                      <div style={{ textAlign: 'right' }}>%</div>
                      {!isMobile && <div style={{ textAlign: 'right' }}>Te cuesta</div>}
                    </div>

                    {comisionesData.length === 0 && (
                      <div style={{ fontSize: 12, color: TOKENS.textTer, padding: '14px' }}>
                        Sin profesionales activos en este periodo.
                      </div>
                    )}

                    {comisionesData.map((p, i) => (
                      <div key={p.profId} className="metric-row" style={{
                        display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.9fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                        borderBottom: i < comisionesData.length - 1 ? `1px solid ${TOKENS.border}` : 'none',
                        animation: 'fadeIn 0.3s ease both', animationDelay: `${i * 50}ms`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, minWidth: 0 }}>
                          <div style={{ width: 4, height: 20, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: TOKENS.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                          <span
                            title={p.real ? 'Calculado sobre los cobros reales del periodo' : 'Sin cobros en el periodo: estimado con los precios del catálogo'}
                            style={{
                              fontSize: 9, fontWeight: 700, color: p.real ? TOKENS.success : TOKENS.textTer,
                              background: p.real ? TOKENS.successSoft : TOKENS.bgPanel,
                              border: `1px solid ${p.real ? TOKENS.success : TOKENS.border}`,
                              borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                            }}
                          >
                            {p.real ? 'real' : 'estim.'}
                          </span>
                          {modeloComision === 'configurado' && p.pctConfigurado === null && (
                            <span
                              title="Este profesional no tiene porcentaje en su ficha de equipo, así que se le aplica el general"
                              style={{
                                fontSize: 9, fontWeight: 700, color: TOKENS.warning, background: TOKENS.warningSoft,
                                border: `1px solid ${TOKENS.warning}`, borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                              }}
                            >
                              sin config.
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: TOKENS.textSec, textAlign: 'right' }}>{fmtEur(p.baseSinIva)}{isMobile ? '' : ' €'}</div>
                        <div style={{ fontSize: 12, color: TOKENS.warning, fontWeight: 600, textAlign: 'right' }}>{fmtEur(p.comision)}{isMobile ? '' : ' €'}</div>
                        <div style={{ fontSize: 12, color: TOKENS.textSec, textAlign: 'right' }}>{Math.round(p.pctEfectivo)}%</div>
                        {!isMobile && <div style={{ fontSize: 12, color: TOKENS.textTer, textAlign: 'right' }}>{fmtEur(p.costeEmpresa)} €</div>}
                      </div>
                    ))}

                    {comisionesData.length > 0 && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: isMobile ? '1.5fr 0.9fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', padding: isMobile ? '9px 10px' : '10px 14px',
                        background: TOKENS.bgPanel, borderTop: `1px solid ${TOKENS.border}`,
                        fontSize: 12, fontWeight: 700, color: TOKENS.text,
                      }}>
                        <div>Total</div>
                        <div style={{ textAlign: 'right' }}>{fmtEur(comisionCalculo.totales.baseSinIva)}{isMobile ? '' : ' €'}</div>
                        <div style={{ textAlign: 'right', color: TOKENS.warning }}>{fmtEur(comisionCalculo.totales.comisiones)}{isMobile ? '' : ' €'}</div>
                        <div style={{ textAlign: 'right' }}></div>
                        {!isMobile && <div style={{ textAlign: 'right', color: TOKENS.textTer }}>{fmtEur(comisionCalculo.totales.costeEmpresa)} €</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* --- Avisos del motor (suelo salarial, tramos con huecos...) --- */}
                {(() => {
                  const vistos = new Set<string>();
                  const lista: string[] = [];
                  comisionCalculo.avisos.forEach(a => {
                    if (vistos.has(a.texto)) return;
                    vistos.add(a.texto);
                    lista.push(a.texto);
                  });
                  comisionesData.forEach(p => p.avisos.forEach(texto => {
                    // El mismo aviso para media plantilla se dice una vez, no cinco.
                    if (vistos.has(texto)) return;
                    vistos.add(texto);
                    lista.push(`${p.nombre}: ${texto}`);
                  }));
                  if (lista.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      {lista.map(texto => (
                        <div key={texto} style={{
                          fontSize: 11.5, lineHeight: 1.5, color: TOKENS.textSec,
                          padding: '10px 12px', borderRadius: 8,
                          background: TOKENS.warningSoft, border: `1px solid ${TOKENS.warning}44`,
                        }}>
                          {texto}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* --- De donde sale la cuota patronal + aviso legal --- */}
                <details style={{ marginTop: 14 }}>
                  <summary style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.textSec, cursor: 'pointer' }}>
                    De dónde sale el {CUOTA_PATRONAL_PCT} % de cuota patronal
                  </summary>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                    {DESGLOSE_CUOTA_PATRONAL.map(d => (
                      <span key={d.concepto} style={{
                        fontSize: 10.5, color: TOKENS.textSec, border: `1px solid ${TOKENS.border}`,
                        borderRadius: 999, padding: '3px 9px',
                      }}>
                        {d.concepto} <strong style={{ color: TOKENS.text }}>{d.pct} %</strong>
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.55, color: TOKENS.textTer, marginTop: 10 }}>
                    {AVISO_LEGAL}
                  </div>
                </details>

                <div style={{
                  marginTop: 12, fontSize: 11.5, lineHeight: 1.55, color: TOKENS.textSec,
                  padding: '10px 12px', borderRadius: 8, background: 'rgba(244,80,30,0.05)',
                  border: `1px solid ${TOKENS.borderHi}`,
                }}>
                  Cuando tengas claro el escenario, la liquidación mensual se genera y se marca como
                  pagada en <strong>Liquidaciones</strong>, justo debajo. Los porcentajes de cada
                  profesional se configuran en <strong>Equipo</strong>.
                </div>
              </SectionBody>
            </div>
            {/* Gastos (fijos/variables) */}
            <GastosSection negocioId={negocioId} onGastosChange={cargar} />

            {/* Liquidaciones persistentes (generar, marcar pagada, exportar) */}
            <LiquidacionesSection negocioId={negocioId} />
          </>
        )}
      </div>
      {showManualPanel && (
        <ManualPanel
          content={manualInformes}
          isMobile={isMobile}
          onClose={() => setShowManualPanel(false)}
        />
      )}
    </div>
  );
}

export default withClientDataGate(InformesScreen, 'Informes');
