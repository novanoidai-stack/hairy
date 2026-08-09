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
  ventanasActivas,
} from './retrasos.ts';
import {
  HORARIO_APERTURA,
  HORARIO_CIERRE,
  AGENDA_MAX_ADELANTO_MIN_DEFAULT,
  AGENDA_MARGEN_REACCION_MIN_DEFAULT,
  AGENDA_UMBRAL_HUECO_MIN_DEFAULT,
} from './constants.ts';

const MIN = 60000;
const UMBRAL_RETRASO_MIN = 10; // por debajo, no merece abrir el flujo de retraso
const MAX_RETRASO_MIN = 240; // citas "olvidadas" de hace horas no cuentan como retraso activo
// Re-export por compatibilidad: el default vive en constants.ts junto al techo de adelanto,
// porque los dos son ajustes de salon (claves agendaUmbralHuecoMin / agendaMaxAdelantoMin).
export const UMBRAL_HUECO_MIN_DEFAULT = AGENDA_UMBRAL_HUECO_MIN_DEFAULT;

export type TipoProblemaAgenda =
  | 'retraso'
  | 'solape'
  | 'hueco_muerto'
  | 'reposo_desaprovechado'
  // Hueco INTERIOR (entre dos citas) que ninguna cita del dia puede tapar
  // adelantandose. No tiene arreglo de un clic: es un aviso para ofrecerlo a la
  // lista de espera. Antes este caso no generaba ningun problema y por eso "el
  // organizador no avisaba de los huecos".
  | 'hueco_vacio';

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

// Tramo de la rejilla al que apunta un problema. Lo consume el modo "Enseñamelo"
// de la agenda para resaltar la zona exacta en la columna del profesional.
export interface ZonaProblema {
  profesionalId: string;
  desde: string; // ISO
  hasta: string; // ISO
}

export interface ProblemaAgenda {
  id: string;
  tipo: TipoProblemaAgenda;
  profesionalId: string;
  profesionalNombre: string;
  titulo: string;
  descripcion: string;
  citaIds: string[];
  // Opciones aplicables; estrategias[0] es la recomendada/unica. El tipo
  // 'retraso' puede traer varias (cascada/hueco/reposo/pedir), igual que el
  // picker de retraso de una sola cita. OJO: 'hueco_vacio' viene con la lista
  // VACIA (es informativo, no hay nada que aplicar) — quien lo pinte debe
  // tolerar estrategias.length === 0.
  estrategias: EstrategiaRetraso[];
  // Solo tipo 'retraso': minutos de retraso detectados (para reutilizar
  // RetrasoEstrategiasModal, que los muestra en su cabecera).
  minutos?: number;
  // Donde mirar en la rejilla: el DESTINO de la accion (el hueco que se tapa),
  // no la posicion actual de la cita. Siempre presente.
  zona: ZonaProblema;
  // Solo cuando la accion mueve una cita: de donde sale. Permite pintar la cita
  // de origen y una flecha hacia el destino ("mueve ESTA hasta AQUI"), que es lo
  // que hace entendible el resalte.
  zonaOrigen?: ZonaProblema;
  // Etiqueta corta e imperativa para pintar sobre la zona ("Adelantar a 14:30").
  // El titulo ('Hueco muerto') describe el problema; esto describe la ACCION.
  accionCorta: string;
  // Por que esa hora y no otra. El tope de adelanto y la ganancia minima son
  // ajustes del salon, y sin explicarlos la propuesta parece arbitraria.
  porQue?: string;
}

// --- Prioridad: por donde empezar cuando hay varios problemas a la vez ---
//
// Un dia cargado saca diez avisos y, pintados todos igual, la agenda se
// emborrona y no se sabe cual duele mas. Esto los ordena por lo que le cuesta
// al salon si no se toca nada:
//
//   1. Solape: dos clientas a la misma hora con la misma persona. Se rompe hoy.
//   2. Retraso: la cadena se va detras; cuanto mas retraso, mas urgente.
//   3. Hueco muerto / reposo desaprovechado: dinero parado que se puede
//      recuperar adelantando a alguien.
//   4. Hueco vacio: solo informativo (nada que aplicar de un clic).
//
// Dentro de cada grupo manda el tamaño (minutos de retraso o de hueco), asi que
// un retraso de 40' pesa mas que uno de 5'.
const PESO_TIPO: Record<TipoProblemaAgenda, number> = {
  solape: 4000,
  retraso: 3000,
  hueco_muerto: 2000,
  reposo_desaprovechado: 1800,
  hueco_vacio: 1000,
};

export function prioridadProblema(p: ProblemaAgenda): number {
  const base = PESO_TIPO[p.tipo] ?? 0;
  let magnitud = p.minutos ?? 0;
  if (!magnitud && p.zona) {
    const dur =
      (new Date(p.zona.hasta).getTime() - new Date(p.zona.desde).getTime()) / 60000;
    magnitud = Number.isFinite(dur) && dur > 0 ? dur : 0;
  }
  // Se recorta a 240' para que un hueco enorme no adelante a un solape.
  return base + Math.min(240, Math.round(magnitud));
}

// Copia ordenada de mas urgente a menos. A igualdad de peso, manda la hora:
// lo que pasa antes se atiende antes.
export function ordenarPorPrioridad(problemas: ProblemaAgenda[]): ProblemaAgenda[] {
  return problemas.slice().sort((a, b) => {
    const d = prioridadProblema(b) - prioridadProblema(a);
    if (d !== 0) return d;
    return new Date(a.zona.desde).getTime() - new Date(b.zona.desde).getTime();
  });
}

function zona(profesionalId: string, desdeMs: number, hastaMs: number): ZonaProblema {
  return {
    profesionalId,
    desde: new Date(desdeMs).toISOString(),
    hasta: new Date(hastaMs).toISOString(),
  };
}

// --- Adaptador de la fila cruda de `citas` a la entrada del analizador. ---
// Vive aqui (y no en el panel) porque hay DOS consumidores: el panel
// "Organizar mi agenda" y el contador/resalte de la propia rejilla. Duplicar el
// mapeo llevaba a que el badge y el panel contasen cosas distintas.
export interface CitaCrudaAnalisis {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  estado: string;
  profesional_id: string;
  servicio_id?: string | null;
  cliente_id?: string | null;
  grupo_id?: string | null;
}

export function prepararCitas(
  citas: CitaCrudaAnalisis[],
  clientes: { id: string; nombre: string; telefono?: string | null }[],
  servicios: { id: string; nombre: string; categoria_minima?: string | null; duracion_minima_min?: number | null }[],
): CitaOrganizar[] {
  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  const porServicio = new Map(servicios.map((s) => [s.id, s]));
  return citas.map((c) => {
    const cliente = c.cliente_id ? porCliente.get(c.cliente_id) : undefined;
    const servicio = c.servicio_id ? porServicio.get(c.servicio_id) : undefined;
    return {
      id: c.id,
      inicio: c.inicio,
      fin: c.fin,
      fin_activa: c.fin_activa,
      fin_espera: c.fin_espera,
      estado: c.estado,
      profesional_id: c.profesional_id,
      grupoId: c.grupo_id ?? null,
      cliente: cliente?.nombre ?? null,
      telefono: cliente?.telefono ?? null,
      servicio: servicio?.nombre ?? null,
      categoriaMinima: servicio?.categoria_minima ?? null,
      duracionMinimaMin: servicio?.duracion_minima_min ?? null,
    };
  });
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

// Fila de horarios_profesional. Un profesional puede tener varios turnos el
// mismo dia (turno 1 = mañana, turno 2 = tarde); el hueco ENTRE turnos es la
// pausa de comida, y por eso no hace falta modelarla aparte.
//
// TRAMPA: dia_semana aqui es 0=DOMINGO (extract(dow) de Postgres, igual que
// getDay() de JS), mientras que negocio_horarios usa 0=LUNES. Por eso
// ventanaDelDia hace (getDay()+6)%7 y esta funcion NO. Verificado contra datos
// reales: el 2026-08-09 (domingo) disponibilidad_publica devuelve 0 huecos y
// ningun profesional del demo tiene fila dia_semana=0.
export interface HorarioProfesional {
  profesional_id: string;
  dia_semana: number;
  hora_inicio: string; // 'HH:MM' o 'HH:MM:SS'
  hora_fin: string;
  turno?: number;
}

// Tramo trabajable del dia. Una cita solo puede colocarse dentro de UNO.
export interface TramoJornada {
  desdeMs: number;
  hastaMs: number;
}

export interface AnalisisAgendaOpts {
  ahoraMs?: number;
  // Dia que se esta MIRANDO en la agenda (cualquier instante dentro de el).
  // Por defecto, el dia de ahoraMs. Sin esto el analisis solo veia HOY y el
  // contador de problemas no cuadraba con la pantalla al cambiar de fecha.
  diaMs?: number;
  umbralHuecoMin?: number;
  bloqueos?: BloqueoOrganizar[];
  horarios?: HorarioNegocio[];
  // Jornada propia de cada profesional. Sin esto, el analisis usaba la ventana
  // del SALON para todos y podia proponer adelantar una cita a una hora en la
  // que ese profesional no trabaja.
  horariosProfesional?: HorarioProfesional[];
  // Techo de adelanto en minutos (ajuste del salon). Default: AGENDA_MAX_ADELANTO_MIN_DEFAULT.
  maxAdelantoMin?: number;
  // Margen minimo entre AHORA y la hora nueva: lo que la clienta necesita para
  // enterarse y contestar. Es el limite que de verdad manda; el techo de
  // adelanto queda como red de seguridad. 0 lo desactiva.
  margenReaccionMin?: number;
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

// Tramos trabajables de UN profesional en el dia de fechaRefIso.
// Sin filas para ese profesional y ese dia, se cae a la ventana del salon: no
// se inventa un horario que nadie configuro, y el comportamiento es el de antes.
export function tramosDelProfesional(
  fechaRefIso: string,
  profesionalId: string,
  horariosProf: HorarioProfesional[] | undefined,
  respaldo: JornadaDia,
): TramoJornada[] {
  if (!horariosProf || horariosProf.length === 0) return [{ desdeMs: respaldo.aperturaMs, hastaMs: respaldo.cierreMs }];
  // getDay() TAL CUAL: esta tabla es 0=domingo. No usar (getDay()+6)%7.
  const dow = new Date(fechaRefIso).getDay();
  const filas = horariosProf.filter((h) => h.profesional_id === profesionalId && h.dia_semana === dow);
  if (filas.length === 0) return [{ desdeMs: respaldo.aperturaMs, hastaMs: respaldo.cierreMs }];

  const tramos: TramoJornada[] = [];
  for (const f of filas) {
    const desdeMs = horaSobreFecha(fechaRefIso, f.hora_inicio);
    const hastaMs = horaSobreFecha(fechaRefIso, f.hora_fin);
    if (desdeMs == null || hastaMs == null || hastaMs <= desdeMs) continue;
    tramos.push({ desdeMs, hastaMs });
  }
  if (tramos.length === 0) return [{ desdeMs: respaldo.aperturaMs, hastaMs: respaldo.cierreMs }];
  return tramos.sort((a, b) => a.desdeMs - b.desdeMs);
}

// Primer hueco valido DENTRO de los tramos del profesional. Se llama a
// buscarHueco una vez por tramo en vez de cambiar su contrato: asi un hueco
// nunca cae fuera de la jornada ni a caballo entre dos turnos (la comida).
function buscarHuecoEnTramos(
  propia: Fases,
  obstaculos: Fases[],
  desdeMs: number,
  hastaMs: number,
  tramos: TramoJornada[],
  soloReposo: boolean,
): number | null {
  for (const t of tramos) {
    const ini = Math.max(desdeMs, t.desdeMs);
    const fin = Math.min(hastaMs, t.hastaMs);
    if (fin <= ini) continue;
    const slot = buscarHueco(propia, obstaculos, ini, fin, soloReposo);
    if (slot != null) return slot;
  }
  return null;
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
function detectarRetraso(citasProf: CitaOrganizar[], ahoraMs: number, cierreMs: number, aperturaMs: number, maxAdelantoMs: number): ProblemaAgenda | null {
  const candidata = citasProf
    .filter((c) => +new Date(c.inicio) <= ahoraMs)
    .map((c) => ({ c, retrasoMin: (ahoraMs - +new Date(c.fin_activa || c.fin)) / MIN }))
    .filter((x) => x.retrasoMin >= UMBRAL_RETRASO_MIN && x.retrasoMin <= MAX_RETRASO_MIN)
    .sort((a, b) => +new Date(a.c.inicio) - +new Date(b.c.inicio))[0];
  if (!candidata) return null;

  const minutos = Math.max(5, Math.round(candidata.retrasoMin / 5) * 5);
  const estrategias = calcularEstrategiasRetraso(citasProf, candidata.c.id, minutos, { cierreMs, aperturaMs, maxAdelantoMs });
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
    zona: zona(candidata.c.profesional_id, +new Date(candidata.c.inicio), +new Date(candidata.c.fin)),
    accionCorta: `Va ${minutos} min tarde`,
    porQue: `Se cuenta como retraso a partir de ${UMBRAL_RETRASO_MIN} min de desfase y hasta ${MAX_RETRASO_MIN / 60} h (mas alla se da por olvidada, no por retrasada).`,
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
  maxAdelantoMs: number,
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
        maxAdelantoMs,
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
        // La zona cubre las dos citas: el resalte tiene que dejar ver el choque.
        zona: zona(
          intrusa.profesional_id,
          Math.min(fases[fijaIdx].ini, fases[intrusaIdx].ini),
          Math.max(fases[fijaIdx].fin, fases[intrusaIdx].fin),
        ),
        accionCorta: 'Aqui chocan dos citas',
        porQue: 'Solo cuenta como choque cuando se pisan dos fases ACTIVAS: una cita encajada en el reposo de otra es valida (tiempo muerto aprovechado).',
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
  maxAdelantoMs: number,
  // Margen minimo entre ahora y la hora nueva (tiempo de reaccion de la clienta).
  margenReaccionMs: number,
  // Tramos trabajables del profesional (turnos). Un hueco nunca puede caer
  // fuera de ellos ni a caballo entre dos (la pausa de comida).
  tramos: TramoJornada[],
  // Citas ya comprometidas por un arreglo de retraso o de solape en esta misma
  // pasada: moverlas otra vez daria dos propuestas contradictorias sobre la
  // misma cita. Antes esto se evitaba saltandose ENTERA la busqueda de huecos
  // del profesional (un `continue`), y por eso un dia con un retraso nunca
  // avisaba de sus huecos.
  excluirIds: Set<string>,
): ProblemaAgenda[] {
  const problemas: ProblemaAgenda[] = [];
  const efectivo = new Map<string, Fases>(citasProf.map((c) => [c.id, fasesDe(c)]));

  const movibles = citasProf
    .filter((c) => !c.grupoId && !excluirIds.has(c.id) && +new Date(c.inicio) > ahoraMs)
    .sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));

  for (const cand of movibles) {
    const propia = efectivo.get(cand.id)!;
    const obstaculos = citasProf.filter((c) => c.id !== cand.id).map((c) => efectivo.get(c.id)!);
    // El techo acota la busqueda: sin el, una cita de las 17:00 con la manana libre se
    // proponia adelantar 180 min, que ningun salon aplica.
    // La hora NUEVA nunca puede caer antes de ahora + margen de reaccion: si no,
    // se le mueve la cita a alguien que no ha tenido tiempo ni de leer el aviso.
    const desde = Math.max(ahoraMs + margenReaccionMs, aperturaMs, propia.ini - maxAdelantoMs);

    // Dos candidatos, no uno. Antes solo se buscaba el hueco MAS TEMPRANO y
    // despues se miraba si por casualidad habia caido dentro de un reposo: el
    // reposo nunca se buscaba, solo se etiquetaba. Por eso el organizador
    // "proponia adelantar en vez de aprovechar un reposo".
    const slotReposo = buscarHuecoEnTramos(propia, obstaculos, desde, cierreMs, tramos, true);
    const slotNormal = buscarHuecoEnTramos(propia, obstaculos, desde, cierreMs, tramos, false);

    const valido = (s: number | null) => s != null && propia.ini - s >= umbralMs;
    // Se aplica el candidato preferido (el reposo si lo hay): es el que queda
    // como estado encadenado para la siguiente cita de la pasada.
    const slot = valido(slotReposo) ? slotReposo! : valido(slotNormal) ? slotNormal! : null;
    if (slot == null) continue;

    const nueva = reubicar(propia, slot);
    if (hayColision([...obstaculos, nueva])) continue;
    efectivo.set(cand.id, nueva); // encadena: la siguiente cita de la pasada ya la ve movida

    const enReposo = valido(slotReposo);
    const update = toUpdate(cand, nueva);
    const desplazoMin = Math.round((propia.ini - slot) / MIN);

    // Segunda estrategia: el adelanto normal, cuando existe y es DISTINTO del
    // reposo. El usuario pidio ver las dos y elegir, no que decidiera el
    // sistema por el.
    const alternativas: EstrategiaRetraso[] = [];
    if (enReposo && valido(slotNormal) && slotNormal !== slot) {
      const nuevaAlt = reubicar(propia, slotNormal!);
      if (!hayColision([...obstaculos, nuevaAlt])) {
        const updAlt = toUpdate(cand, nuevaAlt);
        alternativas.push({
          tipo: 'mover_hueco',
          titulo: `Adelantar ${Math.round((propia.ini - slotNormal!) / MIN)} min (a ${fmtFechaHora(updAlt.inicio)})`,
          resumen: `${cand.cliente ?? 'La cita'} pasa a ${fmtFechaHora(updAlt.inicio)}, compactando el hueco.`,
          citasMovidas: 1,
          retrasoCierreMin: 0,
          updates: [updAlt],
          avisos: [],
          recomendada: false,
        });
      }
    }
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
        ...alternativas,
      ],
      // Zona = el hueco que se va a tapar (destino), no la posicion actual de la
      // cita: es lo que hay que mirar en la rejilla.
      zona: zona(cand.profesional_id, nueva.ini, nueva.fin),
      // De donde sale, para poder pintar la flecha "mueve ESTA hasta AQUI".
      zonaOrigen: zona(cand.profesional_id, propia.ini, propia.fin),
      accionCorta: `Adelantar a las ${fmtHora(update.inicio)}`,
      // El "por que no antes" es la duda numero uno al ver la propuesta: casi
      // siempre la respuesta es el techo de adelanto del salon.
      porQue: (() => {
        const topeMin = Math.round(maxAdelantoMs / MIN);
        const tocaTecho = propia.ini - slot >= maxAdelantoMs - 1;
        const base = `No se propone antes porque ${
          tocaTecho
            ? `el salon no adelanta una cita mas de ${topeMin} min sobre su hora (ajuste "adelanto maximo")`
            : 'antes de esa hora el hueco no cabe entero o hay otra cita delante'
        }.`;
        return `${base} Solo se avisa si se ganan al menos ${Math.round(umbralMs / MIN)} min.`;
      })(),
    });
  }
  return problemas;
}

// --- 4) Huecos INTERIORES que nadie puede tapar adelantandose: el aviso que
//        faltaba. Solo entre dos tramos ocupados (un dia que empieza tarde o
//        acaba pronto no es un "problema", es que no esta lleno). El reposo NO
//        cuenta como ocupacion: ahi el profesional esta libre. ---
function detectarHuecosVacios(
  citasProf: CitaOrganizar[],
  ahoraMs: number,
  umbralMs: number,
  bloqueos: { inicio: string; fin: string }[],
  // Destinos ya propuestos por detectarHuecos: ese hueco ya tiene tarjeta con
  // arreglo, no hace falta duplicarlo como aviso informativo.
  yaPropuestos: [number, number][],
  esHoy: boolean,
): ProblemaAgenda[] {
  if (citasProf.length === 0) return [];

  const ocupado: [number, number][] = [];
  for (const c of citasProf) {
    const f = fasesDe(c);
    const w = ventanasActivas(f);
    // Una cita que ya deberia haber acabado y sigue abierta ocupa al profesional
    // HASTA AHORA: sin esto se anunciaba como libre un tramo que esta pisado.
    // Si estamos dentro de su reposo la ultima ventana aun no ha llegado, asi
    // que no se estira (ahi el profesional si esta libre de verdad).
    const ult = w[w.length - 1];
    if (esHoy && f.ini <= ahoraMs && ult[1] < ahoraMs && ahoraMs - ult[1] <= MAX_RETRASO_MIN * MIN) {
      ult[1] = ahoraMs;
    }
    for (const v of w) ocupado.push(v);
  }
  for (const b of bloqueos) ocupado.push([+new Date(b.inicio), +new Date(b.fin)]);
  ocupado.sort((a, b) => a[0] - b[0]);

  const fundido: [number, number][] = [];
  for (const w of ocupado) {
    const ultimo = fundido[fundido.length - 1];
    if (ultimo && w[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], w[1]);
    else fundido.push([w[0], w[1]]);
  }

  const problemas: ProblemaAgenda[] = [];
  for (let i = 1; i < fundido.length; i++) {
    const fin = fundido[i][0];
    // Lo ya pasado no se puede aprovechar: cuenta solo el tramo desde ahora.
    const ini = Math.max(fundido[i - 1][1], ahoraMs);
    if (fin - ini < umbralMs) continue;
    if (yaPropuestos.some(([a, b]) => ini < b && a < fin)) continue;

    const min = Math.round((fin - ini) / MIN);
    problemas.push({
      id: `hueco_vacio:${citasProf[0].profesional_id}:${ini}`,
      tipo: 'hueco_vacio',
      profesionalId: citasProf[0].profesional_id,
      profesionalNombre: '',
      titulo: `Hueco libre de ${min} min`,
      descripcion: `Entre las ${fmtHora(new Date(ini).toISOString())} y las ${fmtHora(new Date(fin).toISOString())} no hay nada, y ninguna cita del dia puede adelantarse a taparlo. Ofrecelo a la lista de espera.`,
      citaIds: [],
      estrategias: [],
      zona: zona(citasProf[0].profesional_id, ini, fin),
      accionCorta: `${min} min libres`,
      porQue: `Ninguna cita del dia puede adelantarse hasta aqui sin romper otra cosa (o su clienta tendria que venir demasiado antes de su hora). Solo se avisa a partir de ${Math.round(umbralMs / MIN)} min.`,
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
  // Dia analizado: el que se esta mirando en la agenda (por defecto, hoy).
  const diaMs = opts?.diaMs ?? ahoraMs;
  const esHoy = esMismoDiaLocal(new Date(diaMs).toISOString(), ahoraMs);
  // Corte "lo que ya no se puede aprovechar". Hoy es el reloj; en un dia futuro
  // es el arranque del dia (esta entero por delante, da igual a que hora se mire).
  const inicioDelDia = new Date(diaMs);
  inicioDelDia.setHours(0, 0, 0, 0);
  const corteMs = esHoy ? ahoraMs : inicioDelDia.getTime();
  const umbralHuecoMs = (opts?.umbralHuecoMin ?? AGENDA_UMBRAL_HUECO_MIN_DEFAULT) * MIN;
  const maxAdelantoMs = (opts?.maxAdelantoMin ?? AGENDA_MAX_ADELANTO_MIN_DEFAULT) * MIN;
  const margenReaccionMs = Math.max(0, opts?.margenReaccionMin ?? AGENDA_MARGEN_REACCION_MIN_DEFAULT) * MIN;
  const nombrePorId = new Map(profesionales.map((p) => [p.id, p.nombre]));
  const inicioPorId = new Map(citas.map((c) => [c.id, +new Date(c.inicio)]));

  // Un dia que ya termino no se reorganiza: no hay nada que mover.
  const finDelDia = new Date(diaMs);
  finDelDia.setHours(23, 59, 59, 999);
  if (finDelDia.getTime() < ahoraMs) return [];

  const porProfesional = new Map<string, CitaOrganizar[]>();
  for (const c of citas) {
    if (c.estado !== 'confirmada' && c.estado !== 'pendiente') continue;
    if (!esMismoDiaLocal(c.inicio, diaMs)) continue;
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
    const jornadaSalon = ventanaDelDia(citasProf[0].inicio, opts?.horarios);
    const { aperturaMs, cierreMs } = jornadaSalon;
    // Jornada REAL del profesional. Sin esto se usaba la ventana del salon para
    // todos, y el organizador podia proponer una hora en la que esa persona no
    // trabaja.
    const tramos = tramosDelProfesional(
      citasProf[0].inicio,
      profId,
      opts?.horariosProfesional,
      jornadaSalon,
    );

    // Citas ya comprometidas por un arreglo de este profesional. Antes, con un
    // retraso o un solape se hacia `continue` y ese profesional se quedaba sin
    // analizar los huecos en toda la pasada; ahora solo se excluyen las citas
    // concretas que ya tienen propuesta, para no dar dos ordenes sobre la misma.
    const comprometidas = new Set<string>();

    // El retraso solo tiene sentido HOY: en un dia futuro nadie llega tarde
    // todavia, y mirando un dia pasado saldria todo retrasado.
    const retraso = esHoy
      ? detectarRetraso(citasProf, ahoraMs, cierreMs, aperturaMs, maxAdelantoMs)
      : null;
    if (retraso) {
      problemas.push(retraso);
      retraso.citaIds.forEach((id) => comprometidas.add(id));
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

    const solapes = detectarSolapes(citasProf, corteMs, cierreMs, candidatos, aperturaMs, maxAdelantoMs);
    for (const s of solapes) {
      problemas.push(s);
      s.citaIds.forEach((id) => comprometidas.add(id));
    }

    const huecos = detectarHuecos(
      citasProf,
      corteMs,
      cierreMs,
      umbralHuecoMs,
      aperturaMs,
      maxAdelantoMs,
      margenReaccionMs,
      tramos,
      comprometidas,
    );
    problemas.push(...huecos);

    problemas.push(
      ...detectarHuecosVacios(
        citasProf,
        corteMs,
        umbralHuecoMs,
        bloqueosPorProf.get(profId) ?? [],
        huecos.map((h) => [+new Date(h.zona.desde), +new Date(h.zona.hasta)] as [number, number]),
        esHoy,
      ),
    );
  }

  // Orden temporal: por la cita implicada o, si no hay ninguna (hueco_vacio),
  // por el inicio de la zona resaltada.
  const claveTemporal = (p: ProblemaAgenda) =>
    inicioPorId.get(p.citaIds[0] ?? '') ?? +new Date(p.zona.desde);

  return problemas
    .map((p) => ({ ...p, profesionalNombre: nombrePorId.get(p.profesionalId) ?? 'Profesional' }))
    .sort((a, b) => claveTemporal(a) - claveTemporal(b));
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
