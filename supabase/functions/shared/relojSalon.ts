// Reloj del salon para las edge functions.
//
// EL PROBLEMA QUE RESUELVE (ago-2026). Las libs puras de agenda
// (lib/organizarAgenda.ts, lib/retrasos.ts, lib/organizador/*) materializan las
// horas de apertura con `Date.setHours()`, es decir en la ZONA LOCAL DEL
// RUNTIME. En el navegador eso es Madrid y todo cuadra. En una edge function el
// runtime es UTC, asi que "el salon abre a las 09:00" se convierte en 09:00Z,
// que en agosto son las 11:00 de Madrid: dos horas de desfase en toda la
// geometria (jornadas, tramos, huecos, fuera_jornada).
//
// agenda-asistente ya lo sabia y compensa a mano con timeZone:'Europe/Madrid'
// en cada formateo. Este modulo hace lo mismo de forma reutilizable, y ademas
// aporta lo que faltaba: poder alimentar a las libs puras con un horario
// PRE-DESPLAZADO para que su aritmetica local acabe cayendo en la hora de
// Madrid correcta, sin tener que reescribir las libs.
//
// Si algun dia el runtime pasa a ser Madrid (o se fija TZ), `desfaseRuntimeMin`
// devuelve 0 y todo esto se vuelve la identidad: no hay que deshacer nada.

export const TZ_SALON = 'Europe/Madrid';

/** Minutos que `tz` va por delante de UTC en ese instante (DST incluido). */
export function offsetMinutos(instante: Date, tz: string = TZ_SALON): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instante)) p[part.type] = part.value;
  // formatToParts da 24 como hora de medianoche en algunas plataformas.
  const hora = p.hour === '24' ? 0 : Number(p.hour);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hora, +p.minute, +p.second);
  return Math.round((asUTC - instante.getTime()) / 60000);
}

/**
 * Cuantos minutos se adelanta el reloj del SALON respecto al reloj LOCAL del
 * runtime. 0 = el runtime ya piensa en hora de Madrid (navegador español);
 * 120 en verano / 60 en invierno = el runtime va en UTC (edge function).
 */
export function desfaseRuntimeMin(referencia: Date = new Date()): number {
  return offsetMinutos(referencia, TZ_SALON) + referencia.getTimezoneOffset();
}

/**
 * Interpreta una hora "ingenua" (sin Z ni offset) como hora local del salon.
 * Es lo que hay que usar con cualquier fecha que venga de un LLM o de un
 * formulario: `new Date('2026-08-27T15:30')` en la edge son las 15:30 UTC, o
 * sea las 17:30 de Madrid, y la cita acaba dos horas tarde.
 */
export function parseInstanteSalon(s: string): Date {
  const v = String(s ?? '').trim();
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(v);
  if (tieneZona) return new Date(v);
  const provisional = new Date(v.replace(' ', 'T') + 'Z');
  if (isNaN(provisional.getTime())) return provisional;
  return new Date(provisional.getTime() - offsetMinutos(provisional) * 60000);
}

/** ISO -> 'YYYY-MM-DD HH:MM' en hora del salon (para enseñarsela al modelo). */
export function enHoraSalon(iso: string | number | Date): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const fecha = d.toLocaleDateString('sv-SE', { timeZone: TZ_SALON }); // YYYY-MM-DD
  const hora = d.toLocaleTimeString('es-ES', { timeZone: TZ_SALON, hour: '2-digit', minute: '2-digit' });
  return `${fecha} ${hora}`;
}

/** 'YYYY-MM-DD' del dia del salon al que pertenece ese instante. */
export function fechaSalon(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ_SALON });
}

/** 'HH:MM' del salon. */
export function horaSalon(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString('es-ES', { timeZone: TZ_SALON, hour: '2-digit', minute: '2-digit' });
}

// 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche. null si no parsea.
function aMinutos(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function aHHMM(minutos: number): string {
  // Se recorta al dia: un horario desplazado por debajo de 00:00 o por encima
  // de 23:59 no existe. Recortar es mas seguro que envolver: envolver colocaria
  // la apertura DESPUES del cierre y la jornada quedaria vacia sin avisar.
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Desplaza las horas de un horario para que la aritmetica LOCAL del runtime
 * acabe cayendo en la hora de Madrid correcta.
 *
 * Ejemplo en la edge (UTC, agosto, desfase +120): el salon abre a las '09:00'
 * de Madrid, asi que se le entrega '07:00' a la lib; `setHours(7)` produce
 * 07:00Z, que son las 09:00 de Madrid. Correcto.
 *
 * `referencia` fija el desfase (importa por el horario de verano). Un rango que
 * cruce el ultimo domingo de octubre tendra una hora de desviacion en los dias
 * posteriores al cambio: aceptable para una ventana de analisis de 1-14 dias, y
 * preferible a los 120 min de desfase permanente que habia sin esto.
 *
 * `desfaseMin` solo existe para los tests: Deno ignora la variable TZ en
 * Windows, asi que no hay forma de simular el runtime UTC de la edge sin poder
 * inyectar el desfase a mano.
 */
export function horariosAlRelojDelRuntime<T extends Record<string, unknown>>(
  filas: T[] | null | undefined,
  campos: (keyof T)[],
  opts: { referencia?: Date; desfaseMin?: number } = {},
): T[] {
  const desfase = opts.desfaseMin ?? desfaseRuntimeMin(opts.referencia ?? new Date());
  if (!filas || filas.length === 0) return filas ?? [];
  if (desfase === 0) return filas;
  return filas.map((f) => {
    const copia = { ...f };
    for (const campo of campos) {
      const mins = aMinutos(f[campo] as string | null);
      if (mins == null) continue;
      (copia[campo] as unknown as string) = aHHMM(mins - desfase);
    }
    return copia;
  });
}
