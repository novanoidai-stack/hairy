// Planes generativos de Chispa (F1 del motor generativo, ago-2026).
//
// El motor determinista (motorPropuestas.ts) evalua miles de movimientos, pero
// de CUATRO tipos cerrados: compactar, aprovechar_reposo, cambiar_dia,
// cambiar_trabajador. Cuando el problema no se resuelve con A/B/C/D, calla.
// Aqui la IA propone la solucion ELLA MISMA como un plan de movimientos —
// pueda llamarse J, Z o "alinear los reposos de la manana" — y este modulo la
// somete a la MISMA geometria que el motor barato antes de dejarla tocar nada.
//
// REGLA DE ORO: el plan NO se ejecuta tal cual sale del modelo. Todo lo que
// devuelve el LLM es una INTENCION (que cita, a que hora, con quien). La
// geometria (las 4 marcas de fase), el consentimiento de la clienta y el score
// los calcula ESTE codigo a partir del estado real. Si el modelo se inventa una
// hora imposible, el movimiento se poda; si se inventa que "no hace falta
// avisar", se le corrige por regla (§4 del informe), no por confianza.
//
// PURO: no toca BD ni UI. Reutiliza las primitivas de fase de lib/retrasos.ts y
// los tramos/cierres de lib/organizarAgenda.ts. Determinista: mismo plan +
// mismo estado -> mismo veredicto. Tests en planIA.test.ts.
//
// Extensiones .ts explicitas: se ejecuta bajo Metro (app), bajo Deno (tests) y
// dentro de la edge agenda-optimizador.

import {
  type Fases,
  type UpdateRetraso,
  fasesDe,
  reubicar,
  chocaActivaActiva,
  ventanasActivas,
} from '../retrasos.ts';
import {
  type CitaOrganizar,
  type HorarioNegocio,
  type HorarioProfesional,
  type CierreNegocio,
  type BloqueoOrganizar,
  type ZonaProblema,
  tramosDelProfesional,
  ventanaDelDia,
  esCierreDelDia,
} from '../organizarAgenda.ts';
import {
  fasesEnJornada,
  PENAL_CAMBIO_DIA,
  PENAL_CAMBIO_TRABAJADOR,
  PENAL_RETRASO,
  BONUS_REPOSO,
} from './motorPropuestas.ts';
import {
  AGENDA_MAX_ADELANTO_MIN_DEFAULT,
  AGENDA_MARGEN_REACCION_MIN_DEFAULT,
  categoriaCumple,
} from '../constants.ts';

const MIN = 60000;

// Mas de 5 movimientos no es un plan: es una reorganizacion de jornada que
// nadie va a leer antes de pulsar "Aplicar" (informe §3.2).
export const TOPE_MOVIMIENTOS_PLAN = 5;
// Un plan calculado sobre datos de hace 2 h esta caducado: la agenda se ha
// movido debajo. Lo usa la tabla planes_ia (expira_en) y el panel.
export const TTL_PLAN_MIN = 120;
// Bonus por sacar una cita de un tramo no laborable. Mismo valor que usa el
// motor determinista en su regimen de reubicacion: es lo que hace que un plan
// que rescata una cita mal colocada gane a cualquier micro-compactacion.
export const BONUS_RESCATE_JORNADA = 2000;
// Anti-spam de clienta (informe §4): ni 2 propuestas el mismo dia ni 3 en 7
// dias. Se cuenta lo ya enviado MAS lo que el propio plan pretende enviar.
export const ANTISPAM_MAX_DIA = 1;
export const ANTISPAM_MAX_SEMANA = 2;

export type Confianza = 'alta' | 'media' | 'baja';

// Estados que ocupan hueco (y por tanto son obstaculo para un movimiento).
// Espeja la seccion 2 del system prompt del optimizador.
const ESTADOS_BLOQUEANTES = new Set(['pendiente', 'confirmada', 'completada']);
// Estados que se pueden mover. 'completada' bloquea pero ya no se toca.
const ESTADOS_MOVIBLES = new Set(['pendiente', 'confirmada']);

// ---------------------------------------------------------------------------
// 1. Lo que devuelve el modelo (SIN validar)
// ---------------------------------------------------------------------------

// Un movimiento tal y como lo emite el LLM. Deliberadamente MINIMO: que cita,
// a que hora empieza y (si reasigna) con quien.
//
// DESVIACION CONSCIENTE del §2 del informe, que pedia al modelo las cuatro
// marcas de fase. Pedirselas es regalarle cuatro oportunidades de alucinar una
// geometria que el sistema ya conoce: las duraciones de fase salen de la cita
// REAL y el validador las traslada con reubicar(). Si el modelo manda `fases`
// igualmente, se ignoran (se guardan solo para auditar cuanto se equivoca).
export interface MovimientoPlanBruto {
  citaId: string;
  // Vocabulario ABIERTO: 'mover', 'mover_y_encadenar', 'reasignar',
  // 'alinear_reposo'... El string se guarda tal cual para analitica y para la
  // graduacion a detector determinista (§5 del informe). Lo que el validador
  // exige no es el nombre, es que el movimiento sea una REUBICACION valida.
  tipo?: string;
  // ISO del nuevo inicio. Es el unico dato geometrico que se le pide.
  inicio: string;
  // Solo si el plan reasigna la cita a otra persona.
  profesionalId?: string | null;
  // Ignorado por el validador (ver arriba). Se conserva para auditoria.
  fases?: { ini?: string; finA?: string; finE?: string; fin?: string } | null;
  // Lo que el modelo CREE sobre el consentimiento. No se usa para decidir: la
  // clasificacion es determinista (§4). Se guarda para medir su criterio.
  requiereConsentimiento?: boolean | null;
}

export interface PlanIABruto {
  id?: string;
  tipoProblema: string;
  titulo: string;
  diagnostico: string;
  razonamiento: string;
  confianza?: Confianza;
  // Lo que el modelo estima recuperar. El validador calcula el suyo aparte:
  // los dos se guardan para poder comparar estimado vs real (F4, aprendizaje).
  impactoMin?: number;
  movimientos: MovimientoPlanBruto[];
  riesgos?: string[];
}

// ---------------------------------------------------------------------------
// 2. Lo que sale del validador (YA ejecutable)
// ---------------------------------------------------------------------------

export type MotivoPoda =
  | 'plan_vacio'
  | 'cita_inexistente'
  | 'cita_no_movible'
  | 'cita_duplicada'
  | 'cita_comprometida'
  | 'tope_movimientos'
  | 'hora_invalida'
  | 'en_el_pasado'
  | 'dia_cerrado'
  | 'fuera_jornada'
  | 'profesional_desconocido'
  | 'categoria_insuficiente'
  | 'colision'
  | 'techo_adelanto'
  | 'margen_reaccion'
  | 'antispam_clienta'
  | 'cadena_incompleta'
  | 'cadena_desigual'
  | 'cadena_reasignada'
  | 'dependencia_podada';

export interface MovimientoPodado {
  citaId: string;
  tipo: string;
  motivo: MotivoPoda;
  // Frase en español para el "¿por que?" y para la columna
  // movimientos_podados de planes_ia: el dueño tiene derecho a saber que se
  // cayo y por que.
  detalle: string;
}

// Un movimiento que ya paso TODAS las comprobaciones. Sus campos ISO estan
// listos para chispaOps.ejecutarAccion({tipo:'optimizar_agenda'}).
export interface MovimientoPlanValidado {
  citaId: string;
  tipo: string;
  clienteNombre: string | null;
  telefono: string | null;
  profesionalOrigenId: string;
  profesionalId: string;
  cambioProfesional: boolean;
  cambioDia: boolean;
  // ISO del destino. fin_activa / fin_espera solo si la cita original los tenia
  // (mismo criterio que toUpdate de lib/retrasos.ts).
  inicio: string;
  fin: string;
  finActiva?: string;
  finEspera?: string;
  // Minutos que la cita se ADELANTA. Negativo = se retrasa. Mismo signo que
  // gananciaMin del motor determinista.
  desplazoMin: number;
  // Clasificacion DETERMINISTA (§4 del informe). El modelo no vota aqui.
  requiereConsentimiento: boolean;
  motivoConsentimiento: string | null;
  // Para "Enséñamelo": de donde sale y a donde va.
  zonaOrigen: ZonaProblema;
  zona: ZonaProblema;
  // Encaja dentro del reposo de otra cita (tiempo muerto aprovechado).
  aprovechaReposo: boolean;
  // La cita estaba fuera de jornada / en un dia cerrado y el plan la rescata.
  rescataFueraJornada: boolean;
}

export interface PlanIAValidado {
  id: string;
  origen: 'ia';
  tipoProblema: string;
  titulo: string;
  diagnostico: string;
  razonamiento: string;
  confianza: Confianza;
  riesgos: string[];
  movimientos: MovimientoPlanValidado[];
  podados: MovimientoPodado[];
  // true si ALGUN movimiento necesita el visto bueno de una clienta.
  requiereConsentimiento: boolean;
  // Cuantos se aplican en caliente y cuantos se convierten en propuesta de
  // WhatsApp. Es lo que pinta la tarjeta: "Aplicar 2 · Proponer 3".
  aplicablesEnCaliente: number;
  requierenPropuesta: number;
  // Minutos de agenda recuperados que el validador MIDE (suma de adelantos).
  impactoMin: number;
  // Lo que el modelo dijo. Se guardan los dos a proposito (F4).
  impactoDeclaradoMin: number;
  // Score con la MISMA tabla de penalizaciones que el motor determinista.
  score: number;
  zonas: ZonaProblema[];
  // false = no sobrevivio ni un movimiento; la tarjeta no se pinta.
  valido: boolean;
}

export interface ValidarPlanOpts {
  ahoraMs: number;
  // Estado REAL de la agenda: todas las citas del buffer (no solo las del
  // plan). Sin las de alrededor no hay forma de detectar colisiones.
  citas: CitaOrganizar[];
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[];
  horarios?: HorarioNegocio[];
  horariosProfesional?: HorarioProfesional[];
  cierres?: CierreNegocio[];
  bloqueos?: BloqueoOrganizar[];
  // Ajustes del salon. Solo acotan los movimientos que AFECTAN a la clienta:
  // compactar un hueco interno sin mover su hora no los mira.
  maxAdelantoMin?: number;
  maxRetrasoMin?: number;
  margenReaccionMin?: number;
  maxMovimientos?: number;
  // Citas ya tocadas por otro plan activo o por una propuesta abierta. Evita
  // dos tarjetas dando ordenes contradictorias sobre la misma cita.
  citasComprometidas?: Iterable<string>;
  // Propuestas de cambio ya enviadas (ultimos 7 dias) para el anti-spam.
  // clienteRef se calcula con refDeCliente(): telefono normalizado o nombre.
  propuestasRecientes?: { clienteRef: string; enviadaEn: string }[];
}

// ---------------------------------------------------------------------------
// 3. Utilidades
// ---------------------------------------------------------------------------

function fechaYmdLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function zonaDe(profesionalId: string, desdeMs: number, hastaMs: number): ZonaProblema {
  return {
    profesionalId,
    desde: new Date(desdeMs).toISOString(),
    hasta: new Date(hastaMs).toISOString(),
  };
}

function fmtHora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Clave con la que se agrupan las propuestas de una misma persona. El telefono
// manda (dos "Maria" distintas no son la misma clienta); el nombre es el
// respaldo, y el id de cita el ultimo recurso (walk-in sin ficha).
//
// El prefijo 34/0034 se quita a proposito: la MISMA clienta guardada como
// "+34 600 11 22 33" en una ficha y "600112233" en otra tiene que contar como
// una sola persona, o el anti-spam se le escapa por la puerta de atras.
// (La normalizacion completa a E.164 vive en lib/reservaPublica.ts, pero ese
// modulo arrastra el cliente de supabase y esta lib tiene que ser pura.)
export function refDeCliente(c: { telefono?: string | null; cliente?: string | null; id: string }): string {
  let tel = (c.telefono ?? '').replace(/\D/g, '');
  if (tel.length > 9) tel = tel.replace(/^(0034|34)/, '');
  if (tel.length >= 6) return `tel:${tel}`;
  const nombre = (c.cliente ?? '').trim().toLowerCase();
  if (nombre) return `nom:${nombre}`;
  return `cita:${c.id}`;
}

// Estado sombra: la agenda TAL Y COMO QUEDARIA con los movimientos ya
// aceptados. Es lo que permite planes de 3-4 pasos encadenados sin que se
// pisen entre si (informe §3.2). Mismo truco que el `efectivo` de
// detectarHuecos en lib/organizarAgenda.ts, pero con profesional incluido.
interface EstadoSombra {
  fases: Map<string, Fases>;
  profesional: Map<string, string>;
  cita: Map<string, CitaOrganizar>;
}

function estadoInicial(citas: CitaOrganizar[]): EstadoSombra {
  const fases = new Map<string, Fases>();
  const profesional = new Map<string, string>();
  const cita = new Map<string, CitaOrganizar>();
  for (const c of citas) {
    cita.set(c.id, c);
    if (!ESTADOS_BLOQUEANTES.has(c.estado)) continue;
    fases.set(c.id, fasesDe(c));
    profesional.set(c.id, c.profesional_id);
  }
  return { fases, profesional, cita };
}

// Contexto de jornada de un profesional en un dia concreto. Se cachea porque un
// plan de 5 movimientos consulta los mismos tramos una y otra vez.
interface CtxJornada {
  tramos: { desdeMs: number; hastaMs: number }[];
  bloqueosMs: [number, number][];
  diaCerrado: boolean;
}

function hacerCacheJornada(opts: ValidarPlanOpts) {
  const cache = new Map<string, CtxJornada>();
  const bloqueosPorProf = new Map<string, [number, number][]>();
  for (const b of opts.bloqueos ?? []) {
    const lista = bloqueosPorProf.get(b.profesional_id) ?? [];
    lista.push([+new Date(b.inicio), +new Date(b.fin)]);
    bloqueosPorProf.set(b.profesional_id, lista);
  }
  return (profId: string, refMs: number): CtxJornada => {
    const refIso = new Date(refMs).toISOString();
    const key = `${profId}|${fechaYmdLocal(refMs)}`;
    let v = cache.get(key);
    if (!v) {
      const salon = ventanaDelDia(refIso, opts.horarios, opts.cierres);
      v = {
        tramos: tramosDelProfesional(refIso, profId, opts.horariosProfesional, salon),
        bloqueosMs: bloqueosPorProf.get(profId) ?? [],
        diaCerrado: esCierreDelDia(refIso, opts.cierres),
      };
      cache.set(key, v);
    }
    return v;
  };
}

// ---------------------------------------------------------------------------
// 4. La linea roja: quien necesita el visto bueno de la clienta
// ---------------------------------------------------------------------------

// Clasificacion DETERMINISTA (informe §4). El orden importa: gana siempre lo
// de MAS riesgo. Una cadena, un cambio de dia o un cambio de profesional
// requieren consentimiento aunque la clienta ya este sentada en el salon.
export function clasificarConsentimiento(args: {
  original: Fases;
  destino: Fases;
  grupoId?: string | null;
  cambioProfesional: boolean;
  ahoraMs: number;
}): { requiere: boolean; motivo: string | null } {
  const { original, destino, grupoId, cambioProfesional, ahoraMs } = args;
  if (grupoId) {
    return { requiere: true, motivo: 'La cita forma parte de una cadena: mover un eslabon le cambia toda la visita.' };
  }
  if (fechaYmdLocal(original.ini) !== fechaYmdLocal(destino.ini)) {
    return { requiere: true, motivo: 'Cambia de dia.' };
  }
  if (cambioProfesional) {
    return { requiere: true, motivo: 'La atenderia otra persona.' };
  }
  if (destino.ini === original.ini) {
    // Misma hora y misma persona: la clienta ni se entera (es una
    // recolocacion interna del salon).
    return { requiere: false, motivo: null };
  }
  if (original.ini <= ahoraMs && ahoraMs < original.fin) {
    // Ya esta en el salon: se le dice de viva voz, no por WhatsApp.
    return { requiere: false, motivo: null };
  }
  if (destino.ini < original.ini) {
    return { requiere: true, motivo: `Se adelanta a las ${fmtHora(destino.ini)}: tiene que venir antes de lo pactado.` };
  }
  return { requiere: true, motivo: `Se retrasa a las ${fmtHora(destino.ini)}.` };
}

// ---------------------------------------------------------------------------
// 5. El validador
// ---------------------------------------------------------------------------

// Un "paso" del plan: un movimiento suelto, o TODOS los eslabones de una cadena
// (que se validan y se aplican como una unidad, informe §3 punto 4d).
interface Paso {
  grupoId: string | null;
  movimientos: MovimientoPlanBruto[];
}

interface MovPreparado {
  bruto: MovimientoPlanBruto;
  cita: CitaOrganizar;
  original: Fases;
  destino: Fases;
  profDestino: string;
  profOrigen: string;
}

function poda(m: MovimientoPlanBruto, motivo: MotivoPoda, detalle: string): MovimientoPodado {
  return { citaId: m.citaId, tipo: m.tipo || 'mover', motivo, detalle };
}

/**
 * Somete un plan del modelo a la geometria real de la agenda.
 *
 * Nunca lanza: un plan basura devuelve `valido:false` con todos sus movimientos
 * en `podados` y el motivo de cada uno. Eso es deliberado — el generador puede
 * fallar de mil maneras y el panel tiene que poder contarlo, no romperse.
 */
export function validarPlan(plan: PlanIABruto, opts: ValidarPlanOpts): PlanIAValidado {
  const ahoraMs = opts.ahoraMs;
  const tope = opts.maxMovimientos ?? TOPE_MOVIMIENTOS_PLAN;
  const maxAdelantoMs = (opts.maxAdelantoMin ?? AGENDA_MAX_ADELANTO_MIN_DEFAULT) * MIN;
  const maxRetrasoMs = (opts.maxRetrasoMin ?? opts.maxAdelantoMin ?? AGENDA_MAX_ADELANTO_MIN_DEFAULT) * MIN;
  const margenReaccionMs = Math.max(0, opts.margenReaccionMin ?? AGENDA_MARGEN_REACCION_MIN_DEFAULT) * MIN;
  const comprometidas = new Set<string>(opts.citasComprometidas ?? []);
  const jornadaDe = hacerCacheJornada(opts);
  const profsPorId = new Map(opts.profesionales.map((p) => [p.id, p]));

  const sombra = estadoInicial(opts.citas);
  const podados: MovimientoPodado[] = [];
  const validados: MovimientoPlanValidado[] = [];

  // --- Fase A: filtro barato, movimiento a movimiento y sin mirar geometria ---
  const vistas = new Set<string>();
  const admitidos: MovimientoPlanBruto[] = [];
  for (const m of plan.movimientos ?? []) {
    if (admitidos.length >= tope) {
      podados.push(poda(m, 'tope_movimientos', `Un plan no puede tener mas de ${tope} movimientos.`));
      continue;
    }
    const cita = sombra.cita.get(m?.citaId ?? '');
    if (!cita) {
      podados.push(poda(m ?? { citaId: '?', inicio: '' }, 'cita_inexistente', 'Esa cita no existe en la agenda cargada.'));
      continue;
    }
    if (vistas.has(cita.id)) {
      podados.push(poda(m, 'cita_duplicada', 'El plan mueve la misma cita dos veces.'));
      continue;
    }
    if (!ESTADOS_MOVIBLES.has(cita.estado)) {
      podados.push(poda(m, 'cita_no_movible', `Una cita ${cita.estado} ya no se mueve.`));
      continue;
    }
    if (comprometidas.has(cita.id)) {
      podados.push(poda(m, 'cita_comprometida', 'Otra propuesta abierta ya toca esta cita.'));
      continue;
    }
    const iniMs = +new Date(m.inicio);
    if (!Number.isFinite(iniMs)) {
      podados.push(poda(m, 'hora_invalida', `"${m.inicio}" no es una hora valida.`));
      continue;
    }
    if (iniMs < ahoraMs) {
      podados.push(poda(m, 'en_el_pasado', 'No se puede mover una cita al pasado.'));
      continue;
    }
    vistas.add(cita.id);
    admitidos.push(m);
  }

  // --- Fase B: agrupar en pasos (las cadenas viajan juntas) ---
  const pasos: Paso[] = [];
  const pasoPorGrupo = new Map<string, Paso>();
  for (const m of admitidos) {
    const grupoId = sombra.cita.get(m.citaId)?.grupoId ?? null;
    if (!grupoId) {
      pasos.push({ grupoId: null, movimientos: [m] });
      continue;
    }
    const existente = pasoPorGrupo.get(grupoId);
    if (existente) {
      existente.movimientos.push(m);
    } else {
      const nuevo: Paso = { grupoId, movimientos: [m] };
      pasoPorGrupo.set(grupoId, nuevo);
      pasos.push(nuevo);
    }
  }

  // --- Fase C: validar paso a paso contra el estado YA modificado ---
  // Anti-spam: lo ya enviado + lo que este plan quiere enviar.
  const enviadasPorRef = new Map<string, number[]>();
  for (const p of opts.propuestasRecientes ?? []) {
    const t = +new Date(p.enviadaEn);
    if (!Number.isFinite(t)) continue;
    const lista = enviadasPorRef.get(p.clienteRef) ?? [];
    lista.push(t);
    enviadasPorRef.set(p.clienteRef, lista);
  }
  const propuestasDelPlan = new Map<string, number>();

  let cortado = false;
  for (const paso of pasos) {
    if (cortado) {
      for (const m of paso.movimientos) {
        podados.push(poda(m, 'dependencia_podada', 'Se cayo un movimiento anterior del que dependia.'));
      }
      continue;
    }

    const res = validarPaso(paso, {
      ahoraMs, maxAdelantoMs, maxRetrasoMs, margenReaccionMs,
      sombra, jornadaDe, profsPorId, enviadasPorRef, propuestasDelPlan,
    });

    if (res.error) {
      podados.push(res.error);
      for (const m of paso.movimientos) {
        if (m.citaId === res.error.citaId) continue;
        podados.push(poda(m, 'dependencia_podada', 'Otro eslabon de la misma cadena no encajaba.'));
      }
      // Poda k..n: los anteriores ya encajaron, los siguientes se calcularon
      // asumiendo que este pasaba.
      cortado = true;
      continue;
    }

    // Commit al estado sombra y a la lista de validados.
    for (const v of res.validados) {
      sombra.fases.set(v.mov.citaId, v.destino);
      sombra.profesional.set(v.mov.citaId, v.mov.profesionalId);
      validados.push(v.mov);
      if (v.mov.requiereConsentimiento) {
        const ref = refDeCliente(sombra.cita.get(v.mov.citaId)!);
        propuestasDelPlan.set(ref, (propuestasDelPlan.get(ref) ?? 0) + 1);
      }
    }
  }

  // --- Fase D: cuentas del plan ---
  let impactoMin = 0;
  let score = 0;
  for (const v of validados) {
    if (v.desplazoMin > 0) impactoMin += v.desplazoMin;
    if (v.aprovechaReposo) score += BONUS_REPOSO;
    if (v.rescataFueraJornada) score += BONUS_RESCATE_JORNADA;
    if (v.cambioDia) score -= PENAL_CAMBIO_DIA;
    if (v.cambioProfesional) score -= PENAL_CAMBIO_TRABAJADOR;
    if (v.desplazoMin >= 0) {
      score += v.desplazoMin;
    } else {
      // Mismo castigo que el motor: retrasar cuesta 1 + PENAL_RETRASO por min.
      score += v.desplazoMin - Math.abs(v.desplazoMin) * PENAL_RETRASO;
    }
  }

  const requierenPropuesta = validados.filter((v) => v.requiereConsentimiento).length;
  const zonas: ZonaProblema[] = [];
  for (const v of validados) {
    zonas.push(v.zonaOrigen, v.zona);
  }

  return {
    id: plan.id || nuevoIdPlan(),
    origen: 'ia',
    tipoProblema: (plan.tipoProblema || 'otro').slice(0, 60),
    titulo: plan.titulo ?? 'Plan de Chispa',
    diagnostico: plan.diagnostico ?? '',
    razonamiento: plan.razonamiento ?? '',
    confianza: plan.confianza === 'alta' || plan.confianza === 'baja' ? plan.confianza : 'media',
    riesgos: Array.isArray(plan.riesgos) ? plan.riesgos.slice(0, 6) : [],
    movimientos: validados,
    podados,
    requiereConsentimiento: requierenPropuesta > 0,
    aplicablesEnCaliente: validados.length - requierenPropuesta,
    requierenPropuesta,
    impactoMin,
    impactoDeclaradoMin: Number.isFinite(plan.impactoMin) ? Math.max(0, Math.round(plan.impactoMin as number)) : 0,
    score: Math.round(score),
    zonas,
    valido: validados.length > 0,
  };
}

interface CtxPaso {
  ahoraMs: number;
  maxAdelantoMs: number;
  maxRetrasoMs: number;
  margenReaccionMs: number;
  sombra: EstadoSombra;
  jornadaDe: (profId: string, refMs: number) => CtxJornada;
  profsPorId: Map<string, { id: string; nombre: string; categoria?: string | null; activo?: boolean }>;
  enviadasPorRef: Map<string, number[]>;
  propuestasDelPlan: Map<string, number>;
}

// Valida un paso completo (un movimiento suelto o una cadena entera) contra el
// estado sombra actual. Devuelve o bien el error que lo tumba, o bien los
// movimientos listos para commitear. NO muta el estado sombra.
function validarPaso(
  paso: Paso,
  ctx: CtxPaso,
): { error: MovimientoPodado | null; validados: { mov: MovimientoPlanValidado; destino: Fases }[] } {
  const { sombra, ahoraMs } = ctx;
  const preparados: MovPreparado[] = [];

  for (const m of paso.movimientos) {
    const cita = sombra.cita.get(m.citaId)!;
    const original = sombra.fases.get(m.citaId) ?? fasesDe(cita);
    const destino = reubicar(original, +new Date(m.inicio));
    const profOrigen = sombra.profesional.get(m.citaId) ?? cita.profesional_id;
    const profDestino = (m.profesionalId ?? '').trim() || profOrigen;
    preparados.push({ bruto: m, cita, original, destino, profDestino, profOrigen });
  }

  // --- Reglas de cadena (informe §3.4d): o entera o nada ---
  if (paso.grupoId) {
    const eslabones = [...sombra.fases.keys()].filter(
      (id) => sombra.cita.get(id)?.grupoId === paso.grupoId,
    );
    const enPlan = new Set(preparados.map((p) => p.cita.id));
    const faltan = eslabones.filter((id) => !enPlan.has(id));
    if (faltan.length > 0) {
      return {
        error: poda(
          preparados[0].bruto,
          'cadena_incompleta',
          `La cadena tiene ${eslabones.length} tramos y el plan solo mueve ${enPlan.size}: o se mueve entera o no se toca.`,
        ),
        validados: [],
      };
    }
    const delta = preparados[0].destino.ini - preparados[0].original.ini;
    const desigual = preparados.find((p) => p.destino.ini - p.original.ini !== delta);
    if (desigual) {
      return {
        error: poda(desigual.bruto, 'cadena_desigual', 'Todos los tramos de una cadena tienen que desplazarse lo mismo; si no, se rompe la continuidad.'),
        validados: [],
      };
    }
    const reasignado = preparados.find((p) => p.profDestino !== p.profOrigen);
    if (reasignado) {
      return {
        error: poda(reasignado.bruto, 'cadena_reasignada', 'Cambiar de profesional dentro de una cadena descuadra el orden de la visita: fuera de alcance por ahora.'),
        validados: [],
      };
    }
  }

  // --- Geometria de cada movimiento contra el estado sombra ---
  // Las citas del propio paso se retiran de los obstaculos: dentro de una
  // cadena los eslabones se mueven a la vez y no deben estorbarse.
  const enPaso = new Set(preparados.map((p) => p.cita.id));
  const salidas: { mov: MovimientoPlanValidado; destino: Fases }[] = [];

  for (const p of preparados) {
    const { bruto, cita, original, destino, profDestino, profOrigen } = p;
    const cambioProfesional = profDestino !== profOrigen;

    if (cambioProfesional) {
      const prof = ctx.profsPorId.get(profDestino);
      if (!prof || prof.activo === false) {
        return { error: poda(bruto, 'profesional_desconocido', 'Ese profesional no existe o esta inactivo.'), validados: [] };
      }
      if (!categoriaCumple(prof.categoria, cita.categoriaMinima ?? null)) {
        return { error: poda(bruto, 'categoria_insuficiente', `${prof.nombre} no tiene la categoria que pide este servicio.`), validados: [] };
      }
    }

    const jornada = ctx.jornadaDe(profDestino, destino.ini);
    if (jornada.diaCerrado) {
      return { error: poda(bruto, 'dia_cerrado', `El ${fechaYmdLocal(destino.ini)} el salon esta cerrado.`), validados: [] };
    }
    if (!fasesEnJornada(destino, jornada.tramos, jornada.bloqueosMs)) {
      return {
        error: poda(bruto, 'fuera_jornada', `A las ${fmtHora(destino.ini)} esa persona no trabaja, esta bloqueada, o la cita no cabe entera en el turno.`),
        validados: [],
      };
    }

    // Obstaculos: todo lo que ocupe al profesional destino, menos el paso.
    // Los bloqueos NO se añaden aqui: fasesEnJornada (arriba) ya los mira con
    // la misma regla (solo pisan las ventanas ACTIVAS), y meterlos otra vez
    // solo cambiaria el mensaje de error de "fuera de jornada" a "colision".
    const obstaculos: Fases[] = [];
    for (const [id, f] of sombra.fases) {
      if (enPaso.has(id)) continue;
      if ((sombra.profesional.get(id) ?? '') !== profDestino) continue;
      obstaculos.push(f);
    }
    // Y los OTROS movimientos del mismo paso que ya han encajado.
    for (const s of salidas) {
      if (s.mov.profesionalId === profDestino) obstaculos.push(s.destino);
    }
    const choque = obstaculos.find((o) => chocaActivaActiva(destino, o));
    if (choque) {
      return {
        error: poda(bruto, 'colision', `A las ${fmtHora(destino.ini)} se pisaria con lo que ya hay a las ${fmtHora(choque.ini)}.`),
        validados: [],
      };
    }

    // --- Linea roja y limites que solo miran los movimientos que afectan a
    //     la clienta (§4). Un compactado interno no los toca. ---
    const consent = clasificarConsentimiento({
      original, destino, grupoId: cita.grupoId, cambioProfesional, ahoraMs,
    });
    const desplazoMs = original.ini - destino.ini; // >0 adelanta
    const cambioDia = fechaYmdLocal(original.ini) !== fechaYmdLocal(destino.ini);

    if (consent.requiere) {
      // Los topes de adelanto/retraso son de MISMO DIA. Aplicarlos a un cambio
      // de dia no tiene sentido: "mover al martes" son 1440 min de diferencia y
      // cualquier tope los rompe, asi que ningun plan podria cambiar de dia
      // jamas. El motor determinista hace lo mismo (regimen COMPACTAR con topes
      // vs regimen REUBICAR con penalizaciones). Lo que si acota un cambio de
      // dia es el margen de reaccion de la clienta, que se comprueba abajo.
      if (!cambioDia && desplazoMs > ctx.maxAdelantoMs) {
        return {
          error: poda(bruto, 'techo_adelanto', `Adelantar ${Math.round(desplazoMs / MIN)} min supera el tope del salon (${Math.round(ctx.maxAdelantoMs / MIN)} min).`),
          validados: [],
        };
      }
      if (!cambioDia && -desplazoMs > ctx.maxRetrasoMs) {
        return {
          error: poda(bruto, 'techo_adelanto', `Retrasar ${Math.round(-desplazoMs / MIN)} min supera el tope del salon (${Math.round(ctx.maxRetrasoMs / MIN)} min).`),
          validados: [],
        };
      }
      if (destino.ini < ahoraMs + ctx.margenReaccionMs) {
        return {
          error: poda(bruto, 'margen_reaccion', `No da tiempo a avisarla: la hora nueva cae a menos de ${Math.round(ctx.margenReaccionMs / MIN)} min de ahora.`),
          validados: [],
        };
      }
      const antispam = superaAntispam(cita, ahoraMs, ctx.enviadasPorRef, ctx.propuestasDelPlan);
      if (antispam) {
        return { error: poda(bruto, 'antispam_clienta', antispam), validados: [] };
      }
    }

    // --- Etiquetas para el score y para el "por que" ---
    const aprovechaReposo = obstaculos.some(
      (o) => o.finE > o.finA && destino.ini >= o.finA && destino.ini < o.finE,
    );
    const jornadaOrigen = ctx.jornadaDe(profOrigen, original.ini);
    const rescataFueraJornada =
      jornadaOrigen.diaCerrado || !fasesEnJornada(original, jornadaOrigen.tramos, jornadaOrigen.bloqueosMs);

    const mov: MovimientoPlanValidado = {
      citaId: cita.id,
      tipo: (bruto.tipo || 'mover').slice(0, 40),
      clienteNombre: cita.cliente ?? null,
      telefono: cita.telefono ?? null,
      profesionalOrigenId: profOrigen,
      profesionalId: profDestino,
      cambioProfesional,
      cambioDia,
      inicio: new Date(destino.ini).toISOString(),
      fin: new Date(destino.fin).toISOString(),
      finActiva: cita.fin_activa ? new Date(destino.finA).toISOString() : undefined,
      finEspera: cita.fin_espera ? new Date(destino.finE).toISOString() : undefined,
      desplazoMin: Math.round(desplazoMs / MIN),
      requiereConsentimiento: consent.requiere,
      motivoConsentimiento: consent.motivo,
      zonaOrigen: zonaDe(profOrigen, original.ini, original.fin),
      zona: zonaDe(profDestino, destino.ini, destino.fin),
      aprovechaReposo,
      rescataFueraJornada,
    };
    salidas.push({ mov, destino });
  }

  return { error: null, validados: salidas };
}

// Devuelve el motivo del veto, o null si la clienta puede recibir la propuesta.
function superaAntispam(
  cita: CitaOrganizar,
  ahoraMs: number,
  enviadas: Map<string, number[]>,
  delPlan: Map<string, number>,
): string | null {
  const ref = refDeCliente(cita);
  const previas = enviadas.get(ref) ?? [];
  const hoy = fechaYmdLocal(ahoraMs);
  const enElDia = previas.filter((t) => fechaYmdLocal(t) === hoy).length;
  const enLaSemana = previas.filter((t) => t >= ahoraMs - 7 * 24 * 60 * MIN).length;
  const yaEnPlan = delPlan.get(ref) ?? 0;
  // Se compara con >= porque estamos a punto de sumar UNA mas: si ya iguala el
  // tope, la siguiente lo rompe.
  if (enElDia + yaEnPlan >= ANTISPAM_MAX_DIA) {
    return `${cita.cliente ?? 'Esta clienta'} ya tiene una propuesta de cambio hoy: no se le manda otra.`;
  }
  if (enLaSemana + yaEnPlan >= ANTISPAM_MAX_SEMANA) {
    return `${cita.cliente ?? 'Esta clienta'} ya ha recibido ${enLaSemana + yaEnPlan} propuestas esta semana: no se le manda otra.`;
  }
  return null;
}

// Id de plan. En la app hay crypto.randomUUID; en Deno tambien. El respaldo
// existe para no depender de eso en ningun runtime raro.
function nuevoIdPlan(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// 6. Varios planes a la vez
// ---------------------------------------------------------------------------

/**
 * Valida una tanda de planes. Cada plan que sobrevive COMPROMETE sus citas para
 * los siguientes: sin esto dos tarjetas podrian dar ordenes contradictorias
 * sobre la misma cita (riesgo "plan pisa plan", informe §13).
 *
 * Devuelve solo los validos, ordenados por impacto ponderado por confianza —
 * el mismo criterio con el que el panel los pinta.
 */
export function validarPlanes(planes: PlanIABruto[], opts: ValidarPlanOpts): PlanIAValidado[] {
  const comprometidas = new Set<string>(opts.citasComprometidas ?? []);
  const out: PlanIAValidado[] = [];
  for (const p of planes ?? []) {
    const v = validarPlan(p, { ...opts, citasComprometidas: comprometidas });
    if (!v.valido) continue;
    v.movimientos.forEach((m) => comprometidas.add(m.citaId));
    out.push(v);
  }
  return out.sort((a, b) => puntuacionOrden(b) - puntuacionOrden(a));
}

const PESO_CONFIANZA: Record<Confianza, number> = { alta: 1, media: 0.7, baja: 0.4 };

export function puntuacionOrden(p: PlanIAValidado): number {
  return p.impactoMin * PESO_CONFIANZA[p.confianza] + p.score / 100;
}

// ---------------------------------------------------------------------------
// 7. Geometria PRECALCULADA para el generador
// ---------------------------------------------------------------------------

export interface HuecoLibre {
  profesionalId: string;
  desde: string;
  hasta: string;
  minutos: number;
}

/**
 * Tramos en los que un profesional esta REALMENTE libre un dia dado.
 *
 * Es la primitiva `huecosLibres` del §3 del informe. Existe para que el
 * generador razone con numeros del sistema en vez de deducir horas de una lista
 * de citas — que es exactamente donde un LLM se inventa la geometria.
 *
 * El REPOSO de una cita cuenta como hueco: ahi el profesional esta libre
 * (misma regla que ventanasActivas / detectarHuecosVacios). Lo ya pasado no se
 * ofrece: el corte inferior es `ahoraMs`.
 */
export function huecosLibresProfesional(
  profesionalId: string,
  refMs: number,
  citas: CitaOrganizar[],
  opts: {
    ahoraMs: number;
    horarios?: HorarioNegocio[];
    horariosProfesional?: HorarioProfesional[];
    cierres?: CierreNegocio[];
    bloqueos?: BloqueoOrganizar[];
    minMinutos?: number;
  },
): HuecoLibre[] {
  const refIso = new Date(refMs).toISOString();
  if (esCierreDelDia(refIso, opts.cierres)) return [];
  const minMs = (opts.minMinutos ?? 15) * MIN;
  const salon = ventanaDelDia(refIso, opts.horarios, opts.cierres);
  const tramos = tramosDelProfesional(refIso, profesionalId, opts.horariosProfesional, salon);
  const diaYmd = fechaYmdLocal(refMs);

  const ocupado: [number, number][] = [];
  for (const c of citas) {
    if (c.profesional_id !== profesionalId) continue;
    if (!ESTADOS_BLOQUEANTES.has(c.estado)) continue;
    if (fechaYmdLocal(+new Date(c.inicio)) !== diaYmd) continue;
    for (const w of ventanasActivas(fasesDe(c))) ocupado.push([w[0], w[1]]);
  }
  for (const b of opts.bloqueos ?? []) {
    if (b.profesional_id !== profesionalId) continue;
    ocupado.push([+new Date(b.inicio), +new Date(b.fin)]);
  }
  ocupado.sort((a, b) => a[0] - b[0]);

  const fundido: [number, number][] = [];
  for (const w of ocupado) {
    const ultimo = fundido[fundido.length - 1];
    if (ultimo && w[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], w[1]);
    else fundido.push([w[0], w[1]]);
  }

  const huecos: HuecoLibre[] = [];
  const empuja = (desde: number, hasta: number) => {
    if (hasta - desde < minMs) return;
    huecos.push({
      profesionalId,
      desde: new Date(desde).toISOString(),
      hasta: new Date(hasta).toISOString(),
      minutos: Math.round((hasta - desde) / MIN),
    });
  };

  for (const t of tramos) {
    let cursor = Math.max(t.desdeMs, opts.ahoraMs);
    for (const [oIni, oFin] of fundido) {
      if (oFin <= cursor) continue;
      if (oIni >= t.hastaMs) break;
      if (oIni > cursor) empuja(cursor, Math.min(oIni, t.hastaMs));
      cursor = Math.max(cursor, oFin);
      if (cursor >= t.hastaMs) break;
    }
    if (cursor < t.hastaMs) empuja(cursor, t.hastaMs);
  }
  return huecos;
}

// ---------------------------------------------------------------------------
// 8. Puente a la unica puerta de escritura
// ---------------------------------------------------------------------------

export interface MovimientoEjecutable {
  cita_id: string;
  nuevo_inicio: string;
  nuevo_fin: string;
  nuevo_fin_activa?: string;
  nuevo_fin_espera?: string;
  nuevo_profesional_id?: string;
  cliente_nombre: string;
}

/**
 * Traduce los movimientos EN CALIENTE del plan al formato de
 * chispaOps.ejecutarAccion({tipo:'optimizar_agenda'}). Los que requieren
 * consentimiento NO salen por aqui: esos van por proponer_cambio_cita (F2).
 * Es la misma puerta de escritura (y la misma auditoria) que el resto del
 * organizador; nada escribe citas por su cuenta.
 */
export function planAMovimientos(plan: PlanIAValidado): MovimientoEjecutable[] {
  return plan.movimientos
    .filter((m) => !m.requiereConsentimiento)
    .map((m) => ({
      cita_id: m.citaId,
      nuevo_inicio: m.inicio,
      nuevo_fin: m.fin,
      nuevo_fin_activa: m.finActiva,
      nuevo_fin_espera: m.finEspera,
      nuevo_profesional_id: m.cambioProfesional ? m.profesionalId : undefined,
      cliente_nombre: m.clienteNombre ?? '',
    }));
}

/** Updates de los movimientos en caliente, para refrescar la rejilla al aplicar. */
export function planAUpdates(plan: PlanIAValidado): UpdateRetraso[] {
  return plan.movimientos
    .filter((m) => !m.requiereConsentimiento)
    .map((m) => {
      const u: UpdateRetraso = { id: m.citaId, inicio: m.inicio, fin: m.fin };
      if (m.finActiva) u.fin_activa = m.finActiva;
      if (m.finEspera) u.fin_espera = m.finEspera;
      if (m.cambioProfesional) u.profesional_id = m.profesionalId;
      return u;
    });
}

/**
 * Devuelve un plan validado a su forma BRUTA (la intencion: que cita, a que
 * hora, con quien) para poder volver a validarlo.
 *
 * Existe por dos motivos, los dos del informe:
 *  - §7: "Aplicar" tiene que re-validar contra el estado ACTUAL, porque la
 *    agenda ha podido moverse desde que se genero el plan.
 *  - El plan se genera en el servidor y se pinta en el navegador, que es donde
 *    el reloj es de verdad el del salon. Re-validar alli es la ultima red.
 */
export function rehidratarPlan(plan: PlanIAValidado): PlanIABruto {
  return {
    id: plan.id,
    tipoProblema: plan.tipoProblema,
    titulo: plan.titulo,
    diagnostico: plan.diagnostico,
    razonamiento: plan.razonamiento,
    confianza: plan.confianza,
    impactoMin: plan.impactoDeclaradoMin,
    riesgos: plan.riesgos,
    movimientos: plan.movimientos.map((m) => ({
      citaId: m.citaId,
      tipo: m.tipo,
      inicio: m.inicio,
      profesionalId: m.cambioProfesional ? m.profesionalId : undefined,
    })),
  };
}
