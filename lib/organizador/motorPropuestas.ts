// Motor de propuestas del organizador inteligente (Fase 2).
//
// Esta es la pieza que el usuario pidio explicitamente: "deberias de poder
// evaluar miles de posibles cambios cuando con el organizador... que el
// organizador sea capaz de tener localizada esa cita todo el rato".
//
// Para cada cita movible genera cientos/miles de MOVIMIENTOS CANDIDATOS (deltas
// de SLOT_MIN, cambio de trabajador, cambio de dia ±N) y los puntua. Los que
// violan un hard constraint (fuera de jornada, choque activa-activa, cambio de
// dia/trabajador a un slot ocupado) se descartan (score = SCORE_DESCARTADO).
// El resto se ordena por score: el [0] es la propuesta recomendada.
//
// PURO: no toca BD ni UI. Reutiliza las primitivas de fase de lib/retrasos.ts y
// los tramos de lib/organizarAgenda.ts (tramosDelProfesional, ventanaDelDia).
// Determinista: misma entrada -> misma salida. Sin LLM.
//
// Limites de diseño:
// - "Mover al dia siguiente" es el tipo de idea que el usuario quiere que el
//   organizador SEA CAPAZ de ver. Aqui se genera como candidato 'cambiar_dia'.
// - Un micro-movimiento que no gana compactacion (< umbralHuecoMin) NO se
//   propone: el score lo penaliza por debajo del "quedarse donde esta". Es el
//   "si mueves una cita un poquito, no te lo propongo" del usuario.

import {
  type Fases,
  fasesDe,
  reubicar,
  chocaActivaActiva,
  buscarHueco,
} from '../retrasos.ts';
import {
  tramosDelProfesional,
  ventanaDelDia,
  esCierreDelDia,
  type HorarioProfesional,
  type HorarioNegocio,
  type CierreNegocio,
  type TramoJornada,
  type JornadaDia,
} from '../organizarAgenda.ts';
import type { CitaOrganizar } from '../organizarAgenda.ts';
import {
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  AGENDA_MAX_ADELANTO_MIN_DEFAULT,
  AGENDA_UMBRAL_HUECO_MIN_DEFAULT,
} from '../constants.ts';
import {
  type MovimientoCandidato,
  type PropuestasCita,
  type TipoMovimiento,
  SCORE_DESCARTADO,
} from './__types.ts';

const MIN = 60000;
const SLOT_MS = 15 * MIN; // SLOT_MIN (lib/constants.ts) = 15 min

export interface MotorOpts {
  ahoraMs: number;
  // Limite del rango a evaluar (analizarAgendaRango ya acota el analisis; el
  // motor ademas no propone mover citas a fechas fuera de este rango).
  desdeMs: number;
  hastaMs: number;
  horarios?: HorarioNegocio[];
  horariosProfesional?: HorarioProfesional[];
  cierres?: CierreNegocio[];
  bloqueos?: { profesional_id: string; inicio: string; fin: string }[];
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[];
  maxAdelantoMin?: number;
  maxRetrasoMin?: number; // simetrico al adelanto; default = maxAdelantoMin
  umbralHuecoMin?: number;
  // Cuantos dias hacia delante se permite mover una cita (cambio de dia).
  // Default 7. Lo fija organizadorVentanaDias en negocio_config (Fase 3).
  ventanaDias?: number;
}

// Penalizaciones del score. Valores en "puntos": un minuto de compactacion = 1
// punto. Asi se puede razonar cuanto pesa cada cosa en terminos de minutos.
const PENAL_CAMBIO_DIA = 90; // mover de dia cuesta como 90 min de compactacion
const PENAL_CAMBIO_TRABAJADOR = 60; // reasignar cuesta como 60 min
const PENAL_RETRASO = 0.5; // cada minuto que se retrasa la cita resta 0.5
const BONUS_REPOSO = 25; // aprovechar un reposo libre suma 25

// ¿La cita (sus fases) cabe COMPLETA dentro de algun tramo del profesional ese
// dia, sin caer en un bloqueo? Hard constraint: si no, score = DESCARTADO.
function fasesEnJornada(
  f: Fases,
  tramos: TramoJornada[],
  bloqueosMs: [number, number][],
): boolean {
  // Debe caber cada ventana activa dentro de un tramo. Si la cita tiene 2a fase
  // (fin_espera < fin), esa tambien.
  const ventanas: [number, number][] = [[f.ini, f.finA]];
  if (f.finE < f.fin) ventanas.push([f.finE, f.fin]);
  for (const v of ventanas) {
    const enTramo = tramos.some((t) => v[0] >= t.desdeMs && v[1] <= t.hastaMs);
    if (!enTramo) return false;
    // Y no chocar con un bloqueo.
    const chocaBloqueo = bloqueosMs.some(([bIni, bFin]) => v[0] < bFin && v[1] > bIni);
    if (chocaBloqueo) return false;
  }
  return true;
}

function fechaYmdLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Contexto de ocupacion por profesional: sus citas y bloqueos (en ms) para
// calcular choques. Se precalcula una vez por invocacion del motor.
interface OcupacionProf {
  fases: Fases[]; // citas del profesional (excluyendo la que se esta moviendo)
  bloqueosMs: [number, number][];
  tramosPorDia: Map<string, TramoJornada[]>;
}

function jornadaProfesional(
  pid: string,
  fechaRefIso: string,
  horariosProf: HorarioProfesional[] | undefined,
  horarios: HorarioNegocio[] | undefined,
  cierres: CierreNegocio[] | undefined,
): { tramos: TramoJornada[]; salon: JornadaDia } {
  const salon = ventanaDelDia(fechaRefIso, horarios, cierres);
  const tramos = tramosDelProfesional(fechaRefIso, pid, horariosProf, salon);
  return { tramos, salon };
}

// Genera todos los candidatos para una cita y los puntua. Devuelve la lista
// ordenada por score descendente (sin los descartados).
export function proponerMovimientosCita(
  cita: CitaOrganizar,
  citas: CitaOrganizar[],
  opts: MotorOpts,
): PropuestasCita {
  const propia = fasesDe(cita);
  const umbralMs = (opts.umbralHuecoMin ?? AGENDA_UMBRAL_HUECO_MIN_DEFAULT) * MIN;
  const maxAdelantoMs = (opts.maxAdelantoMin ?? AGENDA_MAX_ADELANTO_MIN_DEFAULT) * MIN;
  const maxRetrasoMs = (opts.maxRetrasoMin ?? opts.maxAdelantoMin ?? AGENDA_MAX_ADELANTO_MIN_DEFAULT) * MIN;
  const ventanaDias = opts.ventanaDias ?? 7;

  // Cadenas multiprofesionales: no se mueven solas (romperian la continuidad).
  if (cita.grupoId) {
    return { citaId: cita.id, scoreActual: 0, candidatos: [] };
  }

  const candidatos: MovimientoCandidato[] = [];
  const diaActualYmd = fechaYmdLocal(propia.ini);
  const profActualId = cita.profesional_id;

  // Ocupacion por profesional (solo la calculamos bajo demanda por dia, pero
  // pre-armamos un helper para no recalcular tramos).
  const tramosCache = new Map<string, { tramos: TramoJornada[]; salon: JornadaDia; bloqueosMs: [number, number][] }>();
  const ctxPara = (pid: string, fechaRefIso: string) => {
    const key = `${pid}|${fechaRefIso.substring(0, 10)}`;
    let v = tramosCache.get(key);
    if (!v) {
      const { tramos, salon } = jornadaProfesional(pid, fechaRefIso, opts.horariosProfesional, opts.horarios, opts.cierres);
      const bloqueosMs: [number, number][] = (opts.bloqueos ?? [])
        .filter((b) => b.profesional_id === pid)
        .map((b) => [+new Date(b.inicio), +new Date(b.fin)]);
      v = { tramos, salon, bloqueosMs };
      tramosCache.set(key, v);
    }
    return v;
  };

  // Fases de los obstaculos (otras citas) por profesional.
  const fasesPorProf = new Map<string, Fases[]>();
  for (const c of citas) {
    if (c.id === cita.id) continue;
    if (c.estado !== 'confirmada' && c.estado !== 'pendiente') continue;
    const arr = fasesPorProf.get(c.profesional_id) ?? [];
    arr.push(fasesDe(c));
    fasesPorProf.set(c.profesional_id, arr);
  }

  // ¿La cita esta fuera de jornada en su posicion actual? Se calcula una sola
  // vez y lo usa addCandidato para dar bonus a cualquier reubicacion valida.
  const ctxActualPre = ctxPara(profActualId, new Date(propia.ini).toISOString());
  const enJornadaActual = fasesEnJornada(propia, ctxActualPre.tramos, ctxActualPre.bloqueosMs);

  const addCandidato = (
    nuevoInicioMs: number,
    pid: string,
    fechaYmd: string,
    tipo: TipoMovimiento,
  ) => {
    const cand = reubicar(propia, nuevoInicioMs);
    // Hard constraints (descartan):
    const ctx = ctxPara(pid, new Date(nuevoInicioMs).toISOString());
    // 1. Dia cerrado por el salon.
    if (esCierreDelDia(new Date(nuevoInicioMs).toISOString(), opts.cierres)) return;
    // 2. Fuera de los tramos del profesional o dentro de un bloqueo.
    if (!fasesEnJornada(cand, ctx.tramos, ctx.bloqueosMs)) return;
    // 3. Choque activa-activa con otra cita del profesional destino.
    const obstaculos = (fasesPorProf.get(pid) ?? []);
    if (obstaculos.some((o) => chocaActivaActiva(cand, o))) return;

    const cambioDia = fechaYmd !== diaActualYmd;
    const cambioTrabajador = pid !== profActualId;
    const umbralMin = umbralMs / MIN;

    // ---- Score ----
    // El score mide "cuanto mejor queda el dia si aplico esto". Hay dos regimenes:
    //  - COMPACTAR (mismo dia, mismo trabajador): la ganancia es lineal en min
    //    adelantados. Cada minuto adelantado suma 1; retrasar resta.
    //  - REUBICAR (cambio de dia o de trabajador): la "ganancia" no es lineal
    //    (mover al dia siguiente son -960 min lineales, absurdo). Aqui lo que
    //    cuenta es: (a) dejar la cita DENTRO de jornada si ahora esta fuera, y
    //    (b) cuanto de antes cae dentro del dia destino. Por eso el score de
    //    reubicacion se mide contra la APERTURA del dia destino, no contra el
    //    inicio original.
    let score = 0;
    const razones: string[] = [];
    // Bonus por aprovechar reposo de otra cita (aplica a ambos regimenes).
    const enReposo = obstaculos.some((o) => o.finE > o.finA && nuevoInicioMs >= o.finA && nuevoInicioMs < o.finE);
    if (enReposo) {
      score += BONUS_REPOSO;
      razones.push('aprovecha un reposo libre');
    }

    let gananciaMin: number;
    if (cambioDia || cambioTrabajador) {
      // Regimen REUBICAR. La cita va a otro dia/trabajador: lo que importa es
      // colocar lo antes posible dentro del dia destino (mas manana = mas
      // compacto), mas un bonus grande si la cita estaba fuera de jornada.
      const ctxDest = ctxPara(pid, new Date(nuevoInicioMs).toISOString());
      const tempranoEnElDia = Math.round((nuevoInicioMs - ctxDest.salon.aperturaMs) / MIN);
      // Cuanto mas cerca de la apertura, mayor score (negativo si va despues).
      score -= tempranoEnElDia;
      if (!enJornadaActual) {
        // Estaba fuera de jornada: cualquier reubicacion valida es una mejora
        // enorme. Esto hace que el motor SI proponga "mover al dia siguiente"
        // para una cita mal colocada.
        score += 2000;
        razones.push('saca la cita de un tramo no laborable');
      }
      if (cambioDia) {
        score -= PENAL_CAMBIO_DIA;
        razones.push('cambia de día (requiere avisar al cliente)');
      }
      if (cambioTrabajador) {
        score -= PENAL_CAMBIO_TRABAJADOR;
        razones.push('cambia de profesional');
      }
      // Para la UI: ganancia "aproximada" (no lineal). Reportamos 0 porque no
      // adelanta compactando, reubica.
      gananciaMin = enReposo ? BONUS_REPOSO : 0;
      razones.push(`coloca a las ${new Date(nuevoInicioMs).getHours()}:${String(new Date(nuevoInicioMs).getMinutes()).padStart(2, '0')}`);
    } else {
      // Regimen COMPACTAR: mismo dia, mismo trabajador.
      gananciaMin = Math.round((propia.ini - nuevoInicioMs) / MIN);
      score += gananciaMin;
      if (gananciaMin < 0) {
        score += Math.abs(gananciaMin) * (PENAL_RETRASO - 1);
        razones.push(`retrasa ${Math.abs(gananciaMin)} min`);
      } else if (gananciaMin >= umbralMin) {
        razones.push(`compacta ${gananciaMin} min`);
      } else if (gananciaMin > 0) {
        // Micro-movimiento por debajo del umbral: penaliza para que NO supere
        // al "quedarse donde esta". Es el requisito del usuario: "si mueves una
        // cita un poquito, no te lo propongo".
        score -= umbralMin;
        razones.push(`micro-movimiento de ${gananciaMin} min (por debajo del umbral ${Math.round(umbralMin)})`);
      }
    }

    candidatos.push({
      citaId: cita.id,
      profesionalId: pid,
      cambioTrabajador,
      fechaDia: fechaYmd,
      cambioDia,
      fases: cand,
      score,
      razonScore: razones.join('; ') || 'sin cambios netos',
      tipo,
      gananciaMin,
    });
  };

  // --- Generador de candidatos ---
  const profsActivos = opts.profesionales.filter((p) => p.activo !== false);

  // A) Deltas dentro del mismo dia (compactar), solo profesional actual.
  // Rango: desde ahora+margen hasta cierre, acotado por maxAdelanto/maxRetraso.
  const ctxActual = ctxPara(profActualId, new Date(propia.ini).toISOString());
  const aperturaActual = ctxActual.salon.aperturaMs;
  const cierreActual = ctxActual.salon.cierreMs;
  const limiteInf = Math.max(opts.ahoraMs, aperturaActual, propia.ini - maxAdelantoMs);
  const limiteSup = Math.min(cierreActual, propia.ini + maxRetrasoMs);
  for (let t = limiteInf; t <= limiteSup; t += SLOT_MS) {
    if (Math.abs(t - propia.ini) < SLOT_MS) continue; // mismo sitio
    addCandidato(t, profActualId, diaActualYmd, 'compactar');
  }

  // B) Snap a reposos de otras citas del mismo profesional (bonus alto).
  for (const o of fasesPorProf.get(profActualId) ?? []) {
    if (o.finE > o.finA) {
      // Probar a colocar la cita al inicio del reposo.
      addCandidato(o.finA, profActualId, diaActualYmd, 'aprovechar_reposo');
    }
  }

  // C) Otros profesionales (mismo dia). Reutiliza buscarHueco por tramo.
  for (const p of profsActivos) {
    if (p.id === profActualId) continue;
    const ctxP = ctxPara(p.id, new Date(propia.ini).toISOString());
    for (const tramo of ctxP.tramos) {
      const slot = buscarHueco(propia, fasesPorProf.get(p.id) ?? [], tramo.desdeMs, tramo.hastaMs, false);
      if (slot != null) addCandidato(slot, p.id, diaActualYmd, 'cambiar_trabajador');
    }
  }

  // D) Cambio de dia (±1..±ventanaDias), mismo profesional. Para cada dia,
  // buscar el primer hueco valido en sus tramos.
  for (let d = 1; d <= ventanaDias; d++) {
    for (const signo of [1, -1] as const) {
      const fechaOtro = new Date(propia.ini);
      fechaOtro.setDate(fechaOtro.getDate() + signo * d);
      const t = fechaOtro.getTime();
      if (t < opts.desdeMs || t > opts.hastaMs) continue;
      const ctxOtro = ctxPara(profActualId, fechaOtro.toISOString());
      const fechaYmd = fechaYmdLocal(t);
      for (const tramo of ctxOtro.tramos) {
        const slot = buscarHueco(propia, fasesPorProf.get(profActualId) ?? [], tramo.desdeMs, tramo.hastaMs, false);
        if (slot != null) addCandidato(slot, profActualId, fechaYmd, 'cambiar_dia');
      }
    }
  }

  // Score de la posicion actual (para que la UI sepa si mover compensa).
  // Si la cita está fuera de jornada, scoreActual es muy bajo: cualquier
  // candidato valido (dentro de jornada) lo supera, aunque tenga penalizacion
  // por cambio de dia/trabajador. Asi el motor SI propone reubicar una cita
  // mal puesta al dia siguiente.
  const scoreActual = enJornadaActual
    ? 0
    : -(PENAL_CAMBIO_DIA + PENAL_CAMBIO_TRABAJADOR + 1000); // fuera de jornada: gravísimo

  // Filtrar descartados, ordenar por score desc, y descartar los que no ganan
  // nada respecto a quedarse (score <= scoreActual). Esto cumple el requisito
  // "si mueves una cita un poquito, no te lo propongo".
  const validos = candidatos
    .filter((c) => c.score > SCORE_DESCARTADO && c.score > scoreActual)
    .sort((a, b) => b.score - a.score);

  return { citaId: cita.id, scoreActual, candidatos: validos };
}

// Evaluacion de todas las citas movibles de un rango. El panel llama a esto en
// cada latido (Fase 2.6) o tras un cambio. Mantiene cada cita "localizada" por
// su id: aunque se haya movido, el motor la reencuentra y repropone.
export function evaluarTodas(
  citas: CitaOrganizar[],
  opts: MotorOpts,
): PropuestasCita[] {
  const movibles = citas.filter(
    (c) => !c.grupoId && (c.estado === 'confirmada' || c.estado === 'pendiente') &&
      +new Date(c.inicio) >= opts.ahoraMs,
  );
  const out: PropuestasCita[] = [];
  for (const c of movibles) {
    const p = proponerMovimientosCita(c, citas, opts);
    if (p.candidatos.length > 0) out.push(p);
  }
  return out;
}
