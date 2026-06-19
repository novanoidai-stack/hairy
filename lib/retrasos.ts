// Retrasos encadenados (IA de agenda) — calculo de la cascada.
// Funcion PURA y testeable: dado el dia de un profesional y un retraso, calcula como se
// desplazan las citas siguientes ABSORBIENDO los huecos. No toca BD ni UI.
// Spec: docs/superpowers/specs/2026-06-18-retrasos-encadenados-design.md

const MIN = 60000;

// Entrada minima (la UI mapea su tipo Cita a esto). inicio/fin en ISO.
export interface CitaCascada {
  id: string;
  inicio: string;
  fin: string;
  cliente?: string | null;
  telefono?: string | null;
  servicio?: string | null;
  grupoId?: string | null; // si pertenece a una cadena multiprofesional (mismo grupo)
}

export interface ItemPropuesta {
  cita_id: string;
  cliente: string | null;
  telefono: string | null;
  servicio: string | null;
  inicioPrevisto: string; // ISO original
  inicioNuevo: string; // ISO desplazado
  finNuevo: string; // ISO desplazado
  empujeMin: number; // minutos que se desplaza (> 0)
}

export interface PropuestaRetraso {
  items: ItemPropuesta[]; // solo las citas que de verdad se mueven
  totalAfectadas: number;
  cortaEn: string | null; // cita_id donde el hueco absorbe el retraso del todo (null = llega al final del dia)
}

// barreraMs = primer instante (ms) en que puede empezar la primera cita posterior.
// La UI lo calcula segun el disparador (ver proponerRetrasoPorCita / nivel profesional).
// citasPosteriores = citas del MISMO profesional cuyo inicio es >= origen del retraso.
export function calcularCascada(citasPosteriores: CitaCascada[], barreraMs: number): PropuestaRetraso {
  const orden = [...citasPosteriores].sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));
  const items: ItemPropuesta[] = [];
  let prevFin = barreraMs; // fin (nuevo) de la cita anterior de la cadena
  let cortaEn: string | null = null;

  for (const c of orden) {
    const ini = +new Date(c.inicio);
    const dur = +new Date(c.fin) - ini;
    const nuevoIni = Math.max(ini, prevFin); // ni antes de su hora, ni antes de que acabe la anterior
    const empuje = nuevoIni - ini;
    if (empuje <= 0) {
      // El hueco absorbio el retraso: esta cita conserva su hora -> la cascada se corta.
      cortaEn = c.id;
      break;
    }
    const nuevoFin = nuevoIni + dur;
    items.push({
      cita_id: c.id,
      cliente: c.cliente ?? null,
      telefono: c.telefono ?? null,
      servicio: c.servicio ?? null,
      inicioPrevisto: c.inicio,
      inicioNuevo: new Date(nuevoIni).toISOString(),
      finNuevo: new Date(nuevoFin).toISOString(),
      empujeMin: Math.round(empuje / MIN),
    });
    prevFin = nuevoFin;
  }

  return { items, totalAfectadas: items.length, cortaEn };
}

// Disparador "retraso de X min" sobre una cita concreta: empuja su fin +minutos y
// recalcula las citas posteriores del mismo profesional.
export function proponerRetrasoPorCita(
  citasDelProfesional: CitaCascada[],
  citaId: string,
  minutos: number,
): PropuestaRetraso {
  const c = citasDelProfesional.find((x) => x.id === citaId);
  if (!c || minutos <= 0) return { items: [], totalAfectadas: 0, cortaEn: null };
  // La cita marcada SE RETRASA X min (se desplaza ella misma); las siguientes del profesional
  // se recolocan en cascada absorbiendo huecos. La cita marcada es la PRIMERA de la cascada,
  // por eso la incluimos y ponemos la barrera en su inicio + X (no en su fin).
  const desde = +new Date(c.inicio);
  const barrera = desde + minutos * MIN;
  const afectadas = citasDelProfesional.filter((x) => +new Date(x.inicio) >= desde);
  return calcularCascada(afectadas, barrera);
}

// Cita original con las 4 marcas de tiempo (para desplazarlas todas el mismo delta al aplicar).
export interface CitaTiempos {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
}

// Construye los updates de BD para aplicar la propuesta: desplaza inicio/fin/fin_activa/fin_espera
// de cada cita afectada por su delta. Funcion PURA (no escribe): el llamador hace los update().
export function construirUpdatesRetraso(
  propuesta: PropuestaRetraso,
  citasOriginales: CitaTiempos[],
): Array<{ id: string; inicio: string; fin: string; fin_activa?: string; fin_espera?: string }> {
  const porId = new Map(citasOriginales.map((c) => [c.id, c]));
  const shift = (iso: string | null | undefined, delta: number): string | undefined =>
    iso ? new Date(+new Date(iso) + delta).toISOString() : undefined;
  const updates: Array<{ id: string; inicio: string; fin: string; fin_activa?: string; fin_espera?: string }> = [];
  for (const it of propuesta.items) {
    const orig = porId.get(it.cita_id);
    const delta = +new Date(it.inicioNuevo) - +new Date(it.inicioPrevisto);
    const u: { id: string; inicio: string; fin: string; fin_activa?: string; fin_espera?: string } = {
      id: it.cita_id,
      inicio: it.inicioNuevo,
      fin: it.finNuevo,
    };
    const fa = shift(orig?.fin_activa, delta);
    const fe = shift(orig?.fin_espera, delta);
    if (fa) u.fin_activa = fa;
    if (fe) u.fin_espera = fe;
    updates.push(u);
  }
  return updates;
}

// Disparador a nivel profesional ("vengo con X min de retraso"): desde ahora, sus citas
// no pueden empezar antes de ahora + minutos.
export function proponerRetrasoProfesional(
  citasDelProfesional: CitaCascada[],
  minutos: number,
  ahoraMs: number = Date.now(),
): PropuestaRetraso {
  if (minutos <= 0) return { items: [], totalAfectadas: 0, cortaEn: null };
  const barrera = ahoraMs + minutos * MIN;
  const posteriores = citasDelProfesional.filter((x) => +new Date(x.fin) > ahoraMs);
  return calcularCascada(posteriores, barrera);
}
