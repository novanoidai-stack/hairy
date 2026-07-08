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

// =====================================================================================
// Estrategias alternativas de resolucion de retraso (Sesion 4 del PLAN-IA-CHISPA).
// La cascada de arriba es la estrategia "empujar todo". Aqui se calculan alternativas
// que respetan las fases activa/reposo (activa-sobre-activa = solape real, prohibido;
// activa-sobre-reposo = valido, tiempo muerto productivo): mover UNA cita a otro hueco,
// encajarla en el reposo de otra, o pedir al siguiente cliente venir mas tarde.
// Todo PURO y testeable (lib/retrasos.test.ts). Nada muta BD ni UI.
// =====================================================================================

const SLOT_MIN = 15; // rejilla de la agenda (INTERVALO_MINUTOS)

// Entrada enriquecida con las 4 marcas de fase (como CitaCascada + fin_activa/fin_espera).
export interface CitaRetraso {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  cliente?: string | null;
  telefono?: string | null;
  servicio?: string | null;
  grupoId?: string | null;
}

// Update puro para aplicar (el llamador ejecuta el .update() con la sesion del usuario).
export interface UpdateRetraso {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
}

export type EstrategiaTipo =
  | 'cascada'
  | 'mover_hueco'
  | 'aprovechar_reposo'
  | 'pedir_retraso_siguiente';

// Aviso a un cliente afectado (lo consume el motor WhatsApp via flag retraso_aviso_pendiente).
export interface AvisoRetraso {
  cita_id: string;
  cliente: string | null;
  telefono: string | null;
  inicioNuevo: string; // ISO
  minutos: number; // cuanto se le pide desplazar (puede ser negativo si se adelanta)
}

// Una estrategia con su propuesta comparable para que el profesional elija.
export interface EstrategiaRetraso {
  tipo: EstrategiaTipo;
  titulo: string;
  resumen: string; // frase comparable para la tarjeta
  citasMovidas: number; // cuantas OTRAS citas (ademas de la retrasada) cambian de hora
  retrasoCierreMin: number; // cuanto se retrasa el cierre del dia (min, >= 0)
  updates: UpdateRetraso[]; // desplazamientos a aplicar (incluye la cita retrasada)
  avisos: AvisoRetraso[]; // clientes a avisar por WhatsApp (vacio si ninguno)
  recomendada?: boolean;
}

export interface EstrategiasOpts {
  cierreMs?: number; // instante de cierre del dia (ms). Default: ultimo fin + 3h.
}

// ---- Modelo de fases en ms (compartido con lib/organizarAgenda.ts) ----
export interface Fases {
  id: string;
  ini: number;
  finA: number; // fin fase activa 1
  finE: number; // fin reposo/espera
  fin: number; // fin total (incluye 2a fase activa si la hay)
}

export function fasesDe(c: CitaRetraso): Fases {
  const ini = +new Date(c.inicio);
  const fin = +new Date(c.fin);
  const finA = c.fin_activa ? +new Date(c.fin_activa) : fin;
  const finE = c.fin_espera ? +new Date(c.fin_espera) : finA;
  return { id: c.id, ini, finA, finE, fin };
}

// Ventanas en que el profesional esta OCUPADO de verdad (fase activa 1 y, si existe, 2).
// El reposo [finA, finE] NO cuenta: ahi el profesional esta libre.
function ventanasActivas(f: Fases): Array<[number, number]> {
  const w: Array<[number, number]> = [[f.ini, f.finA]];
  if (f.finE < f.fin) w.push([f.finE, f.fin]);
  return w;
}

function solapan(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

// Choque REAL: alguna ventana activa de a pisa alguna ventana activa de b.
export function chocaActivaActiva(a: Fases, b: Fases): boolean {
  if (a.id === b.id) return false;
  const wa = ventanasActivas(a);
  const wb = ventanasActivas(b);
  return wa.some((x) => wb.some((y) => solapan(x, y)));
}

export function hayColision(fs: Fases[]): boolean {
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      if (chocaActivaActiva(fs[i], fs[j])) return true;
    }
  }
  return false;
}

// Reubica una cita a un nuevo inicio conservando la duracion de todas sus fases.
export function reubicar(f: Fases, nuevoIniMs: number): Fases {
  const d = nuevoIniMs - f.ini;
  return { id: f.id, ini: f.ini + d, finA: f.finA + d, finE: f.finE + d, fin: f.fin + d };
}

export function toUpdate(orig: CitaRetraso, f: Fases): UpdateRetraso {
  const u: UpdateRetraso = {
    id: orig.id,
    inicio: new Date(f.ini).toISOString(),
    fin: new Date(f.fin).toISOString(),
  };
  if (orig.fin_activa) u.fin_activa = new Date(f.finA).toISOString();
  if (orig.fin_espera) u.fin_espera = new Date(f.finE).toISOString();
  return u;
}

function cierreDefault(citas: CitaRetraso[]): number {
  const max = Math.max(...citas.map((c) => +new Date(c.fin)));
  return max + 3 * 60 * MIN; // 3h de margen para reubicar al final del dia
}

// Cuanto se desplaza el cierre del dia (ultimo fin) tras aplicar los updates.
function cierreDelta(citas: CitaRetraso[], updates: UpdateRetraso[]): number {
  const upById = new Map(updates.map((u) => [u.id, u]));
  let origMax = -Infinity;
  let newMax = -Infinity;
  for (const c of citas) {
    const of = +new Date(c.fin);
    origMax = Math.max(origMax, of);
    const u = upById.get(c.id);
    newMax = Math.max(newMax, u ? +new Date(u.fin) : of);
  }
  return Math.max(0, Math.round((newMax - origMax) / MIN));
}

// Busca el primer inicio (snap a slot) >= desdeMs donde `cita` no choca activa-activa
// con ninguno de `obstaculos`. Si soloReposo, ademas exige que arranque dentro de un
// reposo de algun obstaculo (tiempo muerto productivo).
export function buscarHueco(
  citaFases: Fases,
  obstaculos: Fases[],
  desdeMs: number,
  hastaMs: number,
  soloReposo: boolean,
): number | null {
  const dur = citaFases.fin - citaFases.ini;
  const step = SLOT_MIN * MIN;
  let t = Math.ceil(desdeMs / step) * step;
  for (; t + dur <= hastaMs; t += step) {
    const cand = reubicar(citaFases, t);
    if (obstaculos.some((o) => chocaActivaActiva(cand, o))) continue;
    if (soloReposo) {
      const enReposo = obstaculos.some((o) => o.finE > o.finA && t >= o.finA && t < o.finE);
      if (!enReposo) continue;
    }
    return t;
  }
  return null;
}

// --- Estrategia 0: empujar todo en cascada (envuelve el motor existente) ---
function estrategiaCascada(
  citas: CitaRetraso[],
  citaId: string,
  minutos: number,
): EstrategiaRetraso | null {
  const prop = proponerRetrasoPorCita(citas, citaId, minutos);
  if (prop.items.length === 0) return null;
  const updates = construirUpdatesRetraso(prop, citas);
  const otras = prop.items.filter((it) => it.cita_id !== citaId);
  const avisos: AvisoRetraso[] = otras
    .filter((it) => it.telefono)
    .map((it) => ({
      cita_id: it.cita_id,
      cliente: it.cliente,
      telefono: it.telefono,
      inicioNuevo: it.inicioNuevo,
      minutos: it.empujeMin,
    }));
  return {
    tipo: 'cascada',
    titulo: 'Empujar todo en cascada',
    resumen:
      otras.length === 0
        ? 'Solo se retrasa esta cita; el resto del dia se mantiene.'
        : `Se recolocan ${otras.length} cita${otras.length > 1 ? 's' : ''} siguiente${otras.length > 1 ? 's' : ''} del profesional.`,
    citasMovidas: otras.length,
    retrasoCierreMin: cierreDelta(citas, updates),
    updates,
    avisos,
  };
}

// --- Estrategias 1 y 2: mover UNA cita afectada a otro hueco (o a un reposo) ---
// Desplaza la cita retrasada +minutos y saca la PRIMERA cita afectada a un hueco valido
// (soloReposo => dentro del reposo de otra cita). Solo se ofrece si el dia queda limpio
// moviendo unicamente esas dos citas (si no, la cascada es la unica salida coherente).
function estrategiaMoverUna(
  citas: CitaRetraso[],
  citaId: string,
  minutos: number,
  soloReposo: boolean,
  opts?: EstrategiasOpts,
): EstrategiaRetraso | null {
  const marcada = citas.find((c) => c.id === citaId);
  if (!marcada) return null;
  const cascada = proponerRetrasoPorCita(citas, citaId, minutos);
  const otras = cascada.items.filter((it) => it.cita_id !== citaId);
  if (otras.length === 0) return null; // no hay nada que reubicar
  const bOrig = citas.find((c) => c.id === otras[0].cita_id);
  if (!bOrig) return null;

  const marcadaFases = fasesDe(marcada);
  const shiftedC = reubicar(marcadaFases, marcadaFases.ini + minutos * MIN);
  const bFases = fasesDe(bOrig);

  // Obstaculos: la marcada desplazada + todas las demas EN SU SITIO, excepto B.
  const obst: Fases[] = [];
  for (const c of citas) {
    if (c.id === bOrig.id) continue;
    obst.push(c.id === citaId ? shiftedC : fasesDe(c));
  }
  const cierreMs = opts?.cierreMs ?? cierreDefault(citas);
  const desde = marcadaFases.ini + minutos * MIN; // no antes de que empiece el retraso
  const slot = buscarHueco(bFases, obst, desde, cierreMs, soloReposo);
  if (slot == null) return null;

  const nuevaB = reubicar(bFases, slot);
  // El dia entero debe quedar sin solapes activa-activa moviendo SOLO C y B.
  if (hayColision([...obst, nuevaB])) return null;

  const updates: UpdateRetraso[] = [toUpdate(marcada, shiftedC), toUpdate(bOrig, nuevaB)];
  const desplazoB = Math.round((slot - bFases.ini) / MIN);
  const aviso: AvisoRetraso = {
    cita_id: bOrig.id,
    cliente: bOrig.cliente ?? null,
    telefono: bOrig.telefono ?? null,
    inicioNuevo: new Date(slot).toISOString(),
    minutos: desplazoB,
  };
  const horaB = new Date(slot).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return {
    tipo: soloReposo ? 'aprovechar_reposo' : 'mover_hueco',
    titulo: soloReposo
      ? `Atender a ${bOrig.cliente ?? 'la siguiente'} en un reposo`
      : `Mover a ${bOrig.cliente ?? 'la siguiente'} a otro hueco`,
    resumen: soloReposo
      ? `Aprovechas un tiempo muerto: ${bOrig.cliente ?? 'la siguiente clienta'} pasa a las ${horaB} (durante un reposo) y el resto del dia no se mueve.`
      : `${bOrig.cliente ?? 'La siguiente clienta'} pasa a las ${horaB} y el resto del dia se mantiene.`,
    citasMovidas: 1,
    retrasoCierreMin: cierreDelta(citas, updates),
    updates,
    avisos: aviso.telefono ? [aviso] : [],
  };
}

// --- Estrategia 3: pedir al siguiente cliente venir X min mas tarde ---
// Misma recolocacion que la cascada, pero enmarcada como un aviso proactivo a los
// clientes afectados (para que no esperen en el local). El motor WhatsApp los avisa.
function estrategiaPedirRetraso(
  citas: CitaRetraso[],
  citaId: string,
  minutos: number,
): EstrategiaRetraso | null {
  const cascada = proponerRetrasoPorCita(citas, citaId, minutos);
  const otras = cascada.items.filter((it) => it.cita_id !== citaId);
  if (otras.length === 0) return null;
  const updates = construirUpdatesRetraso(cascada, citas);
  const B = otras[0];
  const avisos: AvisoRetraso[] = otras
    .filter((it) => it.telefono)
    .map((it) => ({
      cita_id: it.cita_id,
      cliente: it.cliente,
      telefono: it.telefono,
      inicioNuevo: it.inicioNuevo,
      minutos: it.empujeMin,
    }));
  return {
    tipo: 'pedir_retraso_siguiente',
    titulo: `Pedir a ${B.cliente ?? 'la siguiente'} venir ${B.empujeMin} min mas tarde`,
    resumen:
      avisos.length > 0
        ? `Avisas por WhatsApp a ${avisos.length} cliente${avisos.length > 1 ? 's' : ''} de su nueva hora; nadie espera en el local.`
        : 'Recolocas en cascada; sin telefonos no se puede avisar.',
    citasMovidas: otras.length,
    retrasoCierreMin: cierreDelta(citas, updates),
    updates,
    avisos,
  };
}

// Calcula todas las estrategias APLICABLES para un retraso, ordenadas por menor
// disrupcion (menos citas movidas, luego menor retraso de cierre). Marca la primera
// como recomendada. La cascada siempre esta si hay afectadas (es el fallback seguro).
export function calcularEstrategiasRetraso(
  citasDelProfesional: CitaRetraso[],
  citaId: string,
  minutos: number,
  opts?: EstrategiasOpts,
): EstrategiaRetraso[] {
  const marcada = citasDelProfesional.find((c) => c.id === citaId);
  if (!marcada || minutos <= 0) return [];

  const out: EstrategiaRetraso[] = [];
  const push = (e: EstrategiaRetraso | null) => {
    if (e) out.push(e);
  };

  push(estrategiaCascada(citasDelProfesional, citaId, minutos));
  push(estrategiaMoverUna(citasDelProfesional, citaId, minutos, true, opts)); // reposo
  push(estrategiaMoverUna(citasDelProfesional, citaId, minutos, false, opts)); // hueco
  push(estrategiaPedirRetraso(citasDelProfesional, citaId, minutos));

  // Dedup: si "mover_hueco" acabo en el mismo slot que "aprovechar_reposo", quita el hueco.
  const reposo = out.find((e) => e.tipo === 'aprovechar_reposo');
  if (reposo) {
    const dupIdx = out.findIndex(
      (e) => e.tipo === 'mover_hueco' && e.updates[1]?.inicio === reposo.updates[1]?.inicio,
    );
    if (dupIdx >= 0) out.splice(dupIdx, 1);
  }

  out.sort((a, b) => a.citasMovidas - b.citasMovidas || a.retrasoCierreMin - b.retrasoCierreMin);
  if (out.length > 0) out[0].recomendada = true;
  return out;
}

// =====================================================================================
// Duracion real aprendida por clienta+servicio (Sesion 4).
// Sin migracion: se deriva del historial de citas de esa clienta para ese servicio.
// =====================================================================================

export interface CitaHistorial {
  servicio_id: string | null;
  inicio: string;
  fin: string;
  estado?: string | null;
}

export interface DuracionAprendida {
  minutos: number; // mediana real redondeada a slot
  muestras: number;
  catalogoMin: number;
  difMin: number; // minutos - catalogoMin (positivo = suele tardar mas)
}

// Calcula la duracion tipica REAL de un servicio para una clienta a partir de su
// historial. Devuelve null si no hay muestras suficientes o si la diferencia con el
// catalogo es despreciable (no merece sugerir). Es una SUGERENCIA, no una imposicion.
export function duracionRealAprendida(
  historial: CitaHistorial[],
  servicioId: string,
  catalogoMin: number,
  opts?: { minMuestras?: number; umbralMin?: number },
): DuracionAprendida | null {
  const minMuestras = opts?.minMuestras ?? 2;
  const umbral = opts?.umbralMin ?? 10;
  const durs = historial
    .filter(
      (h) =>
        h.servicio_id === servicioId &&
        (!h.estado || h.estado === 'completada' || h.estado === 'confirmada'),
    )
    .map((h) => (+new Date(h.fin) - +new Date(h.inicio)) / MIN)
    .filter((d) => d > 0 && d < 600);
  if (durs.length < minMuestras) return null;
  durs.sort((a, b) => a - b);
  const mid = Math.floor(durs.length / 2);
  const mediana = durs.length % 2 ? durs[mid] : (durs[mid - 1] + durs[mid]) / 2;
  const slotted = Math.max(SLOT_MIN, Math.round(mediana / SLOT_MIN) * SLOT_MIN);
  const dif = slotted - catalogoMin;
  if (Math.abs(dif) < umbral) return null;
  return { minutos: slotted, muestras: durs.length, catalogoMin, difMin: dif };
}

// =====================================================================================
// Anti-solape inteligente al arrastrar (Sesion 4).
// Al soltar una cita en un punto que choca activa-activa, propone el inicio VALIDO mas
// cercano (misma columna) en vez de solo bloquear. Funcion pura.
// =====================================================================================

export function mejorAlternativaSlot(
  citaMovida: CitaRetraso,
  nuevoInicioMs: number,
  citasDelProfesionalDestino: CitaRetraso[], // sin la cita movida
  opts?: { cierreMs?: number; aperturaMs?: number },
): string | null {
  const base = fasesDe(citaMovida);
  const dur = base.fin - base.ini;
  const obst = citasDelProfesionalDestino.filter((c) => c.id !== citaMovida.id).map(fasesDe);
  const step = SLOT_MIN * MIN;
  const apertura = opts?.aperturaMs ?? nuevoInicioMs - 6 * 60 * MIN;
  const cierre = opts?.cierreMs ?? nuevoInicioMs + 6 * 60 * MIN;
  const centro = Math.round(nuevoInicioMs / step) * step;

  // Busca hacia fuera (antes y despues) el slot valido mas cercano al punto soltado.
  for (let k = 0; k <= Math.ceil((cierre - apertura) / step); k++) {
    for (const cand of k === 0 ? [centro] : [centro + k * step, centro - k * step]) {
      if (cand < apertura || cand + dur > cierre) continue;
      const f = reubicar(base, cand);
      if (!obst.some((o) => chocaActivaActiva(f, o))) return new Date(cand).toISOString();
    }
  }
  return null;
}
