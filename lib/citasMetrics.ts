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

// --- Helper de periodo ---
// Mes natural en hora local, comprobando mes Y anio (evita mezclar el mismo mes de otro anio).
export const enMes = (inicio: string | Date, year: number, month: number) => {
  const d = inicio instanceof Date ? inicio : new Date(inicio);
  return d.getMonth() === month && d.getFullYear() === year;
};
