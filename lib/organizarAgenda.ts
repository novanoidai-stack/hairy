// "Organizar mi agenda" (Sesion 5, PLAN-IA-CHISPA-V2-REDISENO.md).
//
// Analizador DETERMINISTA del dia de un negocio: por cada profesional detecta
// el problema MAS urgente (retraso real > solape de datos > hueco/reposo
// compactable) y calcula su arreglo de un clic reutilizando las mismas
// primitivas de fase de lib/retrasos.ts (nunca solapa activa-activa; siempre
// desplazamientos puros que mueven juntas las 4 marcas inicio/fin/fin_activa/
// fin_espera). PURO: no toca BD ni UI.
//
// Saca 'optimizar_agenda' del monopolio del chatbot: antes esa logica solo
// existia como criterio libre del LLM (tool 'optimizar_agenda' del edge, sin
// ningun calculo determinista detras). Este modulo es el que usa el boton de
// Agenda; el chatbot puede seguir usando su propio criterio (no es obligatorio
// unificarlo, PLAN-IA-CHISPA-V2-REDISENO.md Sesion 5 punto 2 lo deja opcional).
//
// Prioridad por profesional (para no proponer dos arreglos que se pisen sobre
// la misma cita): 1) retraso activo, 2) solape de datos, 3) huecos/reposo.
// Si hay un retraso o un solape, no se buscan huecos ese profesional en esta
// pasada: se vuelve a pulsar el boton tras aplicar para ver lo que quede.

// Extensiones .ts explicitas: este modulo es puro y se ejecuta tanto bajo el
// bundler de la app (Metro, resolucion "bundler" de TS 5) como bajo
// `deno test` (Deno exige especificadores de modulo completos).
import {
  type CitaRetraso,
  type UpdateRetraso,
  type EstrategiaRetraso,
  type Fases,
  type CandidatoReasignacion,
  calcularEstrategiasRetraso,
  calcularEstrategiasSolape,
  fasesDe,
  chocaActivaActiva,
  reubicar,
  toUpdate,
  buscarHueco,
  hayColision,
} from './retrasos.ts';
import { HORARIO_APERTURA, HORARIO_CIERRE } from './constants.ts';

const MIN = 60000;
const UMBRAL_RETRASO_MIN = 10; // por debajo, no merece abrir el flujo de retraso
const MAX_RETRASO_MIN = 240; // citas "olvidadas" de hace horas no cuentan como retraso activo
export const UMBRAL_HUECO_MIN_DEFAULT = 5; // huecos menores no merecen una propuesta

export type TipoProblemaAgenda = 'retraso' | 'solape' | 'hueco_muerto' | 'reposo_desaprovechado';

// Cita de entrada: lo que ya pide CitaRetraso (fases + cliente/telefono/servicio
// para las tarjetas) mas lo que este modulo necesita para agrupar y filtrar.
// grupoId (heredado de CitaRetraso) = cadena multiprofesional (grupo_id en
// BD): nunca se propone mover sola una cita encadenada (rompería la
// continuidad con el resto de la cadena).
export interface CitaOrganizar extends CitaRetraso {
  profesional_id: string;
  estado: string;
  categoriaMinima?: string | null;
}

export interface ProblemaAgenda {
  id: string;
  tipo: TipoProblemaAgenda;
  profesionalId: string;
  profesionalNombre: string;
  titulo: string;
  descripcion: string;
  citaIds: string[];
  // >=1 opciones aplicables; estrategias[0] es la recomendada/unica. El tipo
  // 'retraso' puede traer varias (cascada/hueco/reposo/pedir), igual que el
  // picker de retraso de una sola cita; el resto siempre trae una.
  estrategias: EstrategiaRetraso[];
  // Solo tipo 'retraso': minutos de retraso detectados (para reutilizar
  // RetrasoEstrategiasModal, que los muestra en su cabecera).
  minutos?: number;
}

// Bloqueo tal cual viene de la tabla bloqueos_profesional (no hace falta filtrarlos al dia:
// uno que no intersecta el dia nunca choca con un slot de ese dia).
export interface BloqueoOrganizar {
  profesional_id: string;
  inicio: string;
  fin: string;
}

// Fila cruda de negocio_horarios. OJO: dia_semana es 0 = LUNES ... 6 = DOMINGO (ver DAY_LABELS
// en configuracion.web.tsx), mientras que Date.getDay() es 0 = domingo. De ahi el (+6) % 7.
export interface HorarioNegocio {
  dia_semana: number;
  abierto: boolean;
  apertura: string | null; // 'HH:MM' o 'HH:MM:SS'
  cierre: string | null;
}

export interface JornadaDia {
  aperturaMs: number;
  cierreMs: number;
}

export interface AnalisisAgendaOpts {
  ahoraMs?: number;
  umbralHuecoMin?: number;
  bloqueos?: BloqueoOrganizar[];
  horarios?: HorarioNegocio[];
}

// 'HH:MM' o 'HH:MM:SS' -> ms sobre la fecha de referencia (hora local del salon).
function horaSobreFecha(fechaRefIso: string, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(fechaRefIso);
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

// Ventana [apertura, cierre] del dia. Fallback a las constantes globales cuando no hay horario
// util: sin fila, dia cerrado (apertura excepcional: mejor reorganizar que no ofrecer nada),
// campos a NULL, formato invalido o cierre <= apertura.
function ventanaDelDia(fechaRefIso: string, horarios?: HorarioNegocio[]): JornadaDia {
  const porDefecto = (): JornadaDia => {
    const a = new Date(fechaRefIso);
    a.setHours(HORARIO_APERTURA.horas, HORARIO_APERTURA.minutos, 0, 0);
    const c = new Date(fechaRefIso);
    c.setHours(HORARIO_CIERRE.horas, HORARIO_CIERRE.minutos, 0, 0);
    return { aperturaMs: a.getTime(), cierreMs: c.getTime() };
  };
  if (!horarios || horarios.length === 0) return porDefecto();
  const dia = (new Date(fechaRefIso).getDay() + 6) % 7; // JS 0=domingo -> tabla 0=lunes
  const fila = horarios.find((h) => h.dia_semana === dia);
  if (!fila || !fila.abierto || !fila.apertura || !fila.cierre) return porDefecto();
  const aperturaMs = horaSobreFecha(fechaRefIso, fila.apertura);
  const cierreMs = horaSobreFecha(fechaRefIso, fila.cierre);
  if (aperturaMs == null || cierreMs == null || cierreMs <= aperturaMs) return porDefecto();
  return { aperturaMs, cierreMs };
}

function esMismoDiaLocal(iso: string, refMs: number): boolean {
  const a = new Date(iso);
  const b = new Date(refMs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long' });
  const fecha = d.getDate();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  // ej: "el martes 14 a las 10:30"
  return `el ${dia} ${fecha} a las ${time}`;
}

// --- 1) Retraso real: la cita activa (pendiente/confirmada) mas antigua que
//        ya deberia haber acabado (fin_activa/fin < ahora) y sigue abierta. ---
function detectarRetraso(citasProf: CitaOrganizar[], ahoraMs: number, cierreMs: number, aperturaMs: number): ProblemaAgenda | null {
  const candidata = citasProf
    .filter((c) => +new Date(c.inicio) <= ahoraMs)
    .map((c) => ({ c, retrasoMin: (ahoraMs - +new Date(c.fin_activa || c.fin)) / MIN }))
    .filter((x) => x.retrasoMin >= UMBRAL_RETRASO_MIN && x.retrasoMin <= MAX_RETRASO_MIN)
    .sort((a, b) => +new Date(a.c.inicio) - +new Date(b.c.inicio))[0];
  if (!candidata) return null;

  const minutos = Math.max(5, Math.round(candidata.retrasoMin / 5) * 5);
  const estrategias = calcularEstrategiasRetraso(citasProf, candidata.c.id, minutos, { cierreMs, aperturaMs });
  if (estrategias.length === 0) return null; // algun hueco ya absorbe el retraso: nada que reorganizar

  const citaIds = new Set<string>([candidata.c.id]);
  estrategias.forEach((e) => e.updates.forEach((u) => citaIds.add(u.id)));

  return {
    id: `retraso:${candidata.c.id}`,
    tipo: 'retraso',
    profesionalId: candidata.c.profesional_id,
    profesionalNombre: '',
    titulo: `Retraso de ${minutos} min`,
    descripcion: `${candidata.c.cliente ?? 'La clienta'} deberia haber terminado ${fmtFechaHora(candidata.c.fin_activa || candidata.c.fin)} y la cita sigue abierta.`,
    citaIds: Array.from(citaIds),
    estrategias,
    minutos,
  };
}

// --- 2) Solape activa-activa: estado inconsistente (no deberia ocurrir, pero si
//        aparece hay que poder arreglarlo desde aqui). Por cada par que choca, la
//        que empieza antes es la 'fija' y la de despues la 'intrusa'; delega en
//        calcularEstrategiasSolape las multiples formas de resolverlo. ---
function detectarSolapes(
  citasProf: CitaOrganizar[],
  ahoraMs: number,
  cierreMs: number,
  candidatos: CandidatoReasignacion[],
  aperturaMs: number,
): ProblemaAgenda[] {
  const problemas: ProblemaAgenda[] = [];
  const resueltas = new Set<string>();
  const fases = citasProf.map(fasesDe);

  for (let i = 0; i < citasProf.length; i++) {
    for (let j = i + 1; j < citasProf.length; j++) {
      if (resueltas.has(citasProf[i].id) || resueltas.has(citasProf[j].id)) continue;
      if (!chocaActivaActiva(fases[i], fases[j])) continue;

      const [fijaIdx, intrusaIdx] = fases[i].ini <= fases[j].ini ? [i, j] : [j, i];
      const fija = citasProf[fijaIdx];
      const intrusa = citasProf[intrusaIdx];

      const estrategias = calcularEstrategiasSolape(citasProf, intrusa.id, fija.id, {
        cierreMs,
        ahoraMs,
        aperturaMs,
        reasignacion: { categoriaMinima: intrusa.categoriaMinima ?? null, candidatos },
      });
      if (estrategias.length === 0) continue;

      resueltas.add(intrusa.id);
      problemas.push({
        id: `solape:${intrusa.id}`,
        tipo: 'solape',
        profesionalId: intrusa.profesional_id,
        profesionalNombre: '',
        titulo: 'Dos citas se solapan',
        descripcion: `${intrusa.cliente ?? 'Una cita'} choca con ${fija.cliente ?? 'otra cita'}. Hay ${estrategias.length} forma${estrategias.length > 1 ? 's' : ''} de resolverlo.`,
        citaIds: [intrusa.id, fija.id],
        estrategias,
      });
    }
  }
  return problemas;
}

// --- 3) Huecos muertos / reposo desaprovechado: compacta citas FUTURAS (no
//        empezadas, sin cadena multiprofesional) al primer hueco valido mas
//        temprano. Pasada secuencial: cada decision se usa como obstaculo de
//        la siguiente, para no proponer dos citas al mismo hueco. Siempre se
//        calcula contra el estado REAL (nunca asume que otra propuesta de
//        esta misma lista ya se aplico), asi que cada tarjeta es segura de
//        aplicar por separado. ---
function detectarHuecos(
  citasProf: CitaOrganizar[],
  ahoraMs: number,
  cierreMs: number,
  umbralMs: number,
  aperturaMs: number,
): ProblemaAgenda[] {
  const problemas: ProblemaAgenda[] = [];
  const efectivo = new Map<string, Fases>(citasProf.map((c) => [c.id, fasesDe(c)]));

  const movibles = citasProf
    .filter((c) => !c.grupoId && +new Date(c.inicio) > ahoraMs)
    .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));

  for (const cand of movibles) {
    const propia = efectivo.get(cand.id)!;
    const obstaculos = citasProf.filter((c) => c.id !== cand.id).map((c) => efectivo.get(c.id)!);
    const slot = buscarHueco(propia, obstaculos, Math.max(ahoraMs, aperturaMs), cierreMs, false);
    if (slot == null) continue;
    if (propia.ini - slot < umbralMs) continue; // no merece la pena

    const nueva = reubicar(propia, slot);
    if (hayColision([...obstaculos, nueva])) continue;
    efectivo.set(cand.id, nueva); // encadena: la siguiente cita de la pasada ya la ve movida

    const enReposo = obstaculos.some((o) => o.finE > o.finA && slot >= o.finA && slot < o.finE);
    const update = toUpdate(cand, nueva);
    const desplazoMin = Math.round((propia.ini - slot) / MIN);
    problemas.push({
      id: `${enReposo ? 'reposo_desaprovechado' : 'hueco_muerto'}:${cand.id}`,
      tipo: enReposo ? 'reposo_desaprovechado' : 'hueco_muerto',
      profesionalId: cand.profesional_id,
      profesionalNombre: '',
      titulo: enReposo ? 'Reposo desaprovechado' : 'Hueco muerto',
      descripcion: enReposo
        ? `${cand.cliente ?? 'Una cita'} puede adelantarse a ${fmtFechaHora(update.inicio)}, aprovechando un reposo libre.`
        : `Hay un hueco sin usar antes de ${cand.cliente ?? 'esta cita'}; puede adelantarse a ${fmtFechaHora(update.inicio)}.`,
      citaIds: [cand.id],
      estrategias: [
        {
          tipo: enReposo ? 'aprovechar_reposo' : 'mover_hueco',
          titulo: `Adelantar ${desplazoMin} min (a ${fmtFechaHora(update.inicio)})`,
          resumen: enReposo
            ? `Aprovechas un tiempo muerto: ${cand.cliente ?? 'la cita'} pasa a ${fmtFechaHora(update.inicio)}.`
            : `${cand.cliente ?? 'La cita'} pasa a ${fmtFechaHora(update.inicio)}, compactando el hueco.`,
          citasMovidas: 1,
          retrasoCierreMin: 0,
          updates: [update],
          avisos: [],
          recomendada: true,
        },
      ],
    });
  }
  return problemas;
}

// --- Orquestador: agrupa por profesional, prioriza retraso > solape > huecos,
//     filtra al dia de ahoraMs y rellena el nombre del profesional. ---
export function analizarAgendaDia(
  citas: CitaOrganizar[],
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[],
  opts?: AnalisisAgendaOpts,
): ProblemaAgenda[] {
  const ahoraMs = opts?.ahoraMs ?? Date.now();
  const umbralHuecoMs = (opts?.umbralHuecoMin ?? UMBRAL_HUECO_MIN_DEFAULT) * MIN;
  const nombrePorId = new Map(profesionales.map((p) => [p.id, p.nombre]));
  const inicioPorId = new Map(citas.map((c) => [c.id, +new Date(c.inicio)]));

  const porProfesional = new Map<string, CitaOrganizar[]>();
  for (const c of citas) {
    if (c.estado !== 'confirmada' && c.estado !== 'pendiente') continue;
    if (!esMismoDiaLocal(c.inicio, ahoraMs)) continue;
    const lista = porProfesional.get(c.profesional_id) ?? [];
    lista.push(c);
    porProfesional.set(c.profesional_id, lista);
  }

  const activos = profesionales.filter((p) => p.activo !== false);

  const bloqueosPorProf = new Map<string, { inicio: string; fin: string }[]>();
  for (const b of opts?.bloqueos ?? []) {
    const lista = bloqueosPorProf.get(b.profesional_id) ?? [];
    lista.push({ inicio: b.inicio, fin: b.fin });
    bloqueosPorProf.set(b.profesional_id, lista);
  }

  const problemas: ProblemaAgenda[] = [];
  for (const [profId, citasProfSinOrdenar] of porProfesional) {
    const citasProf = [...citasProfSinOrdenar].sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));
    const { aperturaMs, cierreMs } = ventanaDelDia(citasProf[0].inicio, opts?.horarios);

    const retraso = detectarRetraso(citasProf, ahoraMs, cierreMs, aperturaMs);
    if (retraso) {
      problemas.push(retraso);
      continue;
    }

    const candidatos = activos
      .filter((p) => p.id !== profId)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria ?? null,
        ocupacion: (porProfesional.get(p.id) ?? []) as CitaRetraso[],
        bloqueos: bloqueosPorProf.get(p.id) ?? [],
      }));

    const solapes = detectarSolapes(citasProf, ahoraMs, cierreMs, candidatos, aperturaMs);
    if (solapes.length > 0) {
      problemas.push(...solapes);
      continue;
    }

    problemas.push(...detectarHuecos(citasProf, ahoraMs, cierreMs, umbralHuecoMs, aperturaMs));
  }

  return problemas
    .map((p) => ({ ...p, profesionalNombre: nombrePorId.get(p.profesionalId) ?? 'Profesional' }))
    .sort((a, b) => (inicioPorId.get(a.citaIds[0]) ?? 0) - (inicioPorId.get(b.citaIds[0]) ?? 0));
}

// --- Movimientos listos para chispaOps.ejecutarAccion({tipo:'optimizar_agenda'}):
//     mismo camino de escritura (y auditoria) que usa el chatbot. ---
export function estrategiaAMovimientos(
  estrategia: EstrategiaRetraso,
  citasPorId: Map<string, CitaOrganizar>,
): { cita_id: string; nuevo_inicio: string; nuevo_fin: string; nuevo_fin_activa?: string; nuevo_fin_espera?: string; nuevo_profesional_id?: string; cliente_nombre: string }[] {
  return estrategia.updates.map((u: UpdateRetraso) => ({
    cita_id: u.id,
    nuevo_inicio: u.inicio,
    nuevo_fin: u.fin,
    nuevo_fin_activa: u.fin_activa,
    nuevo_fin_espera: u.fin_espera,
    nuevo_profesional_id: u.profesional_id,
    cliente_nombre: citasPorId.get(u.id)?.cliente ?? '',
  }));
}
