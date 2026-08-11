// Fuente unica de verdad para CONTAR citas en KPIs. Todos los sitios que calculan
// cifras (agenda, informes, CRM de citas, ficha de cliente, caja) deben usar estos
// predicados en vez de comparar c.estado con strings sueltos: asi la semantica vive
// en un solo lugar y las cifras cuadran al 100% entre pantallas.

import { CITA_STATUS } from './constants';

type ConEstado = { estado?: string | null };

// --- Predicados de estado simples ---
export const esPendiente = (c: ConEstado) => c.estado === CITA_STATUS.PENDIENTE;
export const esConfirmada = (c: ConEstado) => c.estado === CITA_STATUS.CONFIRMADA;
export const esCompletada = (c: ConEstado) => c.estado === CITA_STATUS.COMPLETADA;
export const esCancelada = (c: ConEstado) => c.estado === CITA_STATUS.CANCELADA;
export const esNoShow = (c: ConEstado) => c.estado === CITA_STATUS.NO_PRESENTADA;

// --- Predicados compuestos (definicion canonica de cada KPI) ---

// Una cita completada SI estuvo confirmada; para el KPI de "confirmadas" cuenta como tal
// (marcarla completada no debe restar del contador).
export const cuentaComoConfirmada = (c: ConEstado) => esConfirmada(c) || esCompletada(c);

// Actividad real de la agenda: ni cancelada ni no-show. Es lo que en informes se llama "activas".
export const esActiva = (c: ConEstado) => esPendiente(c) || esConfirmada(c) || esCompletada(c);

// Citas "perdidas": cancelaciones + ausencias sin avisar. Es lo que agrupa el KPI "canceladas"
// del rail de la agenda.
export const esCanceladaONoShow = (c: ConEstado) => esCancelada(c) || esNoShow(c);

// --- Visibilidad en calendario (politica pendiente de aplicar uniformemente) ---
// Una cita oculta_en_calendario no se muestra en la rejilla de la Agenda. Como
// hoy el flag se pone junto a estado='cancelada', las metricas basadas en
// esActiva ya excluyen esas citas. Este predicado existe como hook por si se
// decide excluir tambien las ocultas MANUALES (no canceladas) en Informes,
// Citas y Mi Jornada. Ver docs/coherencia-metricas.md (politica pendiente).
type CitaOculta = ConEstado & { oculta_en_calendario?: boolean | null };
export const citaVisible = (c: CitaOculta) => !c.oculta_en_calendario;

// --- "Sin confirmar" (definicion canonica compartida) ---
// Una cita cuenta como "sin confirmar" si el salon la tiene confirmada pero el
// cliente aun no ha respondido, no esta oculta del calendario y empieza en las
// proximas 48 horas. Campana de avisos, banner de la agenda y pagina de Citas
// DEBEN usar este predicado (o su equivalente SQL) para que las cifras cuadren.
export const VENTANA_SIN_CONFIRMAR_MS = 48 * 3600000;

type CitaConfirmable = ConEstado & {
  inicio?: string | Date | null;
  confirmada_cliente?: boolean | null;
  oculta_en_calendario?: boolean | null;
};

export const esSinConfirmar48h = (c: CitaConfirmable, ahoraMs: number = Date.now()) => {
  if (!esConfirmada(c) || c.confirmada_cliente) return false;
  if (c.oculta_en_calendario) return false;
  const ts = c.inicio instanceof Date ? c.inicio.getTime() : new Date(c.inicio ?? 0).getTime();
  if (isNaN(ts)) return false;
  return ts > ahoraMs && ts - ahoraMs <= VENTANA_SIN_CONFIRMAR_MS;
};

// --- Helper de periodo ---
// Mes natural en hora local, comprobando mes Y anio (evita mezclar el mismo mes de otro anio).
export const enMes = (inicio: string | Date, year: number, month: number) => {
  const d = inicio instanceof Date ? inicio : new Date(inicio);
  return d.getMonth() === month && d.getFullYear() === year;
};
