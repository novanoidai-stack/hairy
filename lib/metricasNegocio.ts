// Fuente unica de verdad para las metricas de NEGOCIO (ingresos, propinas,
// tickets, desgloses). Todas las paginas que muestran dinero (Mi Jornada, Caja,
// Informes, Equipo, Agenda) DEBEN usar estas funciones en vez de recalcular
// inline, para que las cifras cuadren al 100% entre pantallas.
//
// Convencion (no negociable):
//  - Ingresos REALES = cobros cobrados (total_cents) con la propina RESTADA.
//    La propina se muestra SIEMPRE por separado, nunca mezclada en el total.
//  - Ingresos PREVISTOS = catalogo sobre citas activas. Etiquetado "Previsto",
//    NUNCA como ingreso real.
//  - Ingresos se fechan por `cobrado_at`; citas por `inicio`.
//  - Todo trabaja en CENTIMOS (enteros) para evitar drift de coma flotante.
//    Los euros se calculan al mostrar (/100) con `aEuros`.

import { esActiva } from './citasMetrics';

// --- Tipos estructurales (compatibles con las filas crudas de cobros/citas) ---
export type Cobro = {
  total_cents?: number | null;
  propina_cents?: number | null;
  efectivo_cents?: number | null;
  datafono_cents?: number | null;
  online_cents?: number | null;
  metodo?: string | null;
  cobrado_at?: string | null;
  estado?: string | null;
};

export type Rango = { desde?: Date | null; hasta?: Date | null };

/** true si el cobro cuenta para el periodo: completado y dentro del rango por cobrado_at. */
export const esCobroEnRango = (c: Cobro, rango?: Rango): boolean => {
  // Si llega estado y no es completado, no cuenta (defensivo: muchas queries ya filtran).
  if (c.estado && c.estado !== 'completado') return false;
  if (!rango || (!rango.desde && !rango.hasta)) return true;
  if (!c.cobrado_at) return false;
  const ts = new Date(c.cobrado_at).getTime();
  if (isNaN(ts)) return false;
  if (rango.desde && ts < rango.desde.getTime()) return false;
  if (rango.hasta && ts > rango.hasta.getTime()) return false;
  return true;
};

const num = (x: number | null | undefined): number => x ?? 0;

/** Ingresos reales = total cobrado SIN la propina (la propina va siempre aparte). */
export const ingresosRealesCents = (cobros: Cobro[], rango?: Rango): number =>
  cobros.reduce(
    (s, c) => s + (esCobroEnRango(c, rango) ? num(c.total_cents) - num(c.propina_cents) : 0),
    0,
  );

/** Propinas del periodo (siempre separadas del total principal). */
export const propinasCents = (cobros: Cobro[], rango?: Rango): number =>
  cobros.reduce((s, c) => s + (esCobroEnRango(c, rango) ? num(c.propina_cents) : 0), 0);

/** Numero de cobros reales del periodo. */
export const numCobros = (cobros: Cobro[], rango?: Rango): number =>
  cobros.filter((c) => esCobroEnRango(c, rango)).length;

/** Ticket medio = ingresos reales / numero de cobros (0 si no hay cobros). */
export const ticketMedioCents = (cobros: Cobro[], rango?: Rango): number => {
  const n = numCobros(cobros, rango);
  return n > 0 ? Math.round(ingresosRealesCents(cobros, rango) / n) : 0;
};

/** Desglose por metodo de pago (total SIN propina, agrupado por `metodo`). */
export const desglosePorMetodoCents = (
  cobros: Cobro[],
  rango?: Rango,
): Record<string, number> => {
  const acc: Record<string, number> = {};
  for (const c of cobros) {
    if (!esCobroEnRango(c, rango)) continue;
    const m = c.metodo ?? 'otros';
    acc[m] = (acc[m] ?? 0) + (num(c.total_cents) - num(c.propina_cents));
  }
  return acc;
};

/**
 * Desglose por canal contable (efectivo / datafono / online) usando las columnas
 * *_cents que ya vienen desglosadas en el cobro. Util para el arqueo de caja,
 * que historicamente usa estas columnas en vez de `metodo`.
 */
export const desglosePorCanalCents = (
  cobros: Cobro[],
  rango?: Rango,
): { efectivo: number; datafono: number; online: number; propinas: number } => {
  let efectivo = 0;
  let datafono = 0;
  let online = 0;
  let propinas = 0;
  for (const c of cobros) {
    if (!esCobroEnRango(c, rango)) continue;
    efectivo += num(c.efectivo_cents);
    datafono += num(c.datafono_cents);
    online += num(c.online_cents);
    propinas += num(c.propina_cents);
  }
  return { efectivo, datafono, online, propinas };
};

// --- Ingresos PREVISTOS (catalogo sobre citas activas) ---
// Etiquetado como "Previsto", NUNCA como ingreso real. El llamante pasa un
// resolver que devuelve el precio en centimos del servicio de cada cita
// (tipicamente un Map<servicio_id, precio_cents> construido del catalogo).
export type CitaParaPrevisto = { inicio?: string | Date | null; estado?: string | null };

export const ingresosPrevistosCents = (
  citas: CitaParaPrevisto[],
  precioCentsFor: (cita: CitaParaPrevisto) => number,
  rango?: Rango,
): number =>
  citas.reduce((s, c) => {
    if (!esActiva(c)) return s;
    if (rango && (rango.desde || rango.hasta)) {
      const ts = new Date((c.inicio as string | Date | null) ?? 0).getTime();
      if (isNaN(ts)) return s;
      if (rango.desde && ts < rango.desde.getTime()) return s;
      if (rango.hasta && ts > rango.hasta.getTime()) return s;
    }
    return s + (precioCentsFor(c) || 0);
  }, 0);

/** Helper de muestra: centimos -> euros. */
export const aEuros = (cents: number): number => cents / 100;
