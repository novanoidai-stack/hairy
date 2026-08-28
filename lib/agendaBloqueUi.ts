// La ley del bloque de cita (agenda) — canal 1 de 4: el ESTADO.
//
// Un bloque de la agenda tiene que contar cuatro cosas a la vez, y cada una
// necesita su canal EXCLUSIVO:
//
//   estado -> el color del bloque (fondo, borde y barra izquierda). Esto.
//   cadena -> el riel exterior (ChainFlowOverlay). No toca el bloque.
//   fases  -> las franjas internas (activa / reposo). Neutras.
//   quien  -> la columna y el avatar. Nunca un borde de color.
//
// Mezclarlos es lo que dejó tarjetas con el borde superior del color de la
// categoría, el izquierdo del color del profesional, el resto gris y un aro
// ámbar girando por encima: cuatro colores sin jerarquía en 120 píxeles. Desde
// aquí sale el ÚNICO color del bloque, y ningún otro sitio pinta su fondo, su
// borde ni su barra.
//
// El color no codifica el estado literal, codifica QUÉ HAY QUE HACER con la
// cita:
//
//   neutro -> nada, va según lo previsto      ámbar -> te falta algo
//   fuego  -> está pasando ahora              rojo  -> algo va mal
//   verde  -> cerrado y cobrado
//
// Por eso "sin confirmar" y "sin cobrar" comparten ámbar: son la misma
// pregunta ("te falta algo") en dos momentos distintos, y es el texto del chip
// el que dice cuál. Y por eso una cita confirmada no lleva chip: lo normal no
// grita, si gritara todo, no destacaría nada.

import { CITA_STATUS } from './constants';
import { DESIGN_TOKENS as TOKENS } from './designTokens';

export type ClaveBloque =
  | 'sin_confirmar'
  | 'confirmada'
  | 'curso'
  | 'sin_cobrar'
  | 'cobrada'
  | 'no_presentada'
  | 'sin_cerrar'
  | 'cancelada';

export interface BloqueUi {
  clave: ClaveBloque;
  /** Texto del chip de estado. Cadena vacía = sin chip. */
  label: string;
  /** Barra izquierda de 3px. null = sin barra (nada que hacer aquí). */
  acento: string | null;
  /** Color del texto del chip: variante profunda, legible a 9.5px. */
  acentoTexto: string | null;
  fondo: string;
  borde: string;
  /** Fondo del chip. null cuando no hay chip. */
  chipBg: string | null;
  /** Clase de motion que late en bucle. Vacía = quieto. Solo late lo vivo. */
  loop: string;
  /** Clase de motion que se ejecuta UNA vez al montar y se para. */
  entrada: string;
  sombra: string;
  /** Baja la opacidad del bloque entero (cita muerta). */
  atenuado: boolean;
  /** Tacha el nombre de la clienta. */
  tachado: boolean;
}

const NEUTRO_FONDO = TOKENS.bgCard;
const NEUTRO_BORDE = 'rgba(40,30,24,0.12)';
const SOMBRA = '0 1px 3px rgba(28,24,20,0.07)';

const SIN_CONFIRMAR: BloqueUi = {
  clave: 'sin_confirmar',
  label: 'Sin confirmar',
  acento: TOKENS.warning,
  acentoTexto: TOKENS.warningHi,
  fondo: 'rgba(224,138,0,0.10)',
  borde: 'rgba(224,138,0,0.32)',
  chipBg: 'rgba(224,138,0,0.18)',
  loop: '',
  entrada: '',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

const CONFIRMADA: BloqueUi = {
  clave: 'confirmada',
  label: '',
  acento: null,
  acentoTexto: null,
  fondo: NEUTRO_FONDO,
  borde: NEUTRO_BORDE,
  chipBg: null,
  loop: '',
  entrada: '',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

const EN_CURSO: BloqueUi = {
  clave: 'curso',
  label: 'En curso',
  acento: TOKENS.primary,
  acentoTexto: TOKENS.primaryHi,
  // Sube a 0.14 a proposito: con el 0.10 de antes, el fuego al 10% y el rojo al
  // 7% caian los dos en el mismo rosa palido y una cita en curso y un no-show
  // eran indistinguibles de un vistazo. Comprobado en pantalla.
  fondo: 'rgba(244,80,30,0.14)',
  borde: 'rgba(244,80,30,0.42)',
  chipBg: 'rgba(244,80,30,0.16)',
  loop: 'm-st-curso',
  entrada: '',
  sombra: '0 4px 14px rgba(244,80,30,0.20)',
  atenuado: false,
  tachado: false,
};

const SIN_COBRAR: BloqueUi = {
  clave: 'sin_cobrar',
  label: 'Sin cobrar',
  acento: TOKENS.warning,
  acentoTexto: TOKENS.warningHi,
  fondo: 'rgba(224,138,0,0.08)',
  borde: 'rgba(224,138,0,0.30)',
  chipBg: 'rgba(224,138,0,0.18)',
  loop: 'm-st-sincobrar',
  entrada: '',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

const COBRADA: BloqueUi = {
  clave: 'cobrada',
  label: 'Cobrada',
  acento: TOKENS.success,
  acentoTexto: TOKENS.successHi,
  fondo: NEUTRO_FONDO,
  borde: NEUTRO_BORDE,
  chipBg: 'rgba(15,157,107,0.14)',
  loop: '',
  entrada: '',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

// Los dos estados rojos NO llevan relleno: solo barra, borde y chip. Asi la
// familia "tenida" se queda en dos (ambar = te falta algo, fuego = esta
// pasando) y el rojo no puede confundirse con el naranja de una cita en curso.
// Ademas es honesto: un no-show ya no se puede trabajar, no tiene que gritar
// tanto como lo que esta sucediendo delante de ti.
const NO_PRESENTADA: BloqueUi = {
  clave: 'no_presentada',
  label: 'No presentada',
  acento: TOKENS.danger,
  acentoTexto: TOKENS.dangerHi,
  fondo: NEUTRO_FONDO,
  borde: 'rgba(226,59,52,0.28)',
  chipBg: 'rgba(226,59,52,0.12)',
  loop: '',
  entrada: 'm-st-entra',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

const SIN_CERRAR: BloqueUi = {
  clave: 'sin_cerrar',
  label: 'Sin cerrar',
  acento: TOKENS.danger,
  acentoTexto: TOKENS.dangerHi,
  fondo: NEUTRO_FONDO,
  // Esta si pide accion, y por eso se lleva el borde mas marcado de los dos.
  borde: 'rgba(226,59,52,0.45)',
  chipBg: 'rgba(226,59,52,0.12)',
  loop: '',
  entrada: 'm-st-sacude',
  sombra: SOMBRA,
  atenuado: false,
  tachado: false,
};

const CANCELADA: BloqueUi = {
  clave: 'cancelada',
  label: 'Cancelada',
  acento: null,
  acentoTexto: TOKENS.textTertiary,
  fondo: 'rgba(40,30,24,0.04)',
  borde: 'rgba(40,30,24,0.10)',
  chipBg: 'rgba(115,102,88,0.10)',
  loop: '',
  entrada: '',
  sombra: 'none',
  atenuado: true,
  tachado: true,
};

interface CitaBloque {
  estado?: string | null;
  cobrada?: boolean | null;
  // La web trae ISO de Supabase y el nativo ya trae Date construidos.
  inicio: string | Date;
  fin: string | Date;
}

const ms = (v: string | Date) =>
  v instanceof Date ? v.getTime() : new Date(v).getTime();

/**
 * Traduce una cita al único tratamiento visual que le corresponde.
 * `nowMs` entra por parámetro (no se lee el reloj aquí dentro) para que la
 * función sea pura y el mismo instante valga para todas las citas de un render.
 */
export function bloqueDeCita(cita: CitaBloque, nowMs: number): BloqueUi {
  const estado = cita.estado ?? CITA_STATUS.PENDIENTE;

  if (estado === CITA_STATUS.CANCELADA) return CANCELADA;
  if (estado === CITA_STATUS.NO_PRESENTADA) return NO_PRESENTADA;
  if (estado === CITA_STATUS.COMPLETADA) {
    return cita.cobrada ? COBRADA : SIN_COBRAR;
  }

  const finMs = ms(cita.fin);
  const iniMs = ms(cita.inicio);
  const viva =
    estado === CITA_STATUS.PENDIENTE || estado === CITA_STATUS.CONFIRMADA;

  // `finalizada` solo existe en el frontend: la cita acabó su horario y nadie
  // cerró el ciclo. Es el mismo problema que una confirmada cuya hora ya pasó.
  if (estado === CITA_STATUS.FINALIZADA || (viva && finMs <= nowMs)) {
    return SIN_CERRAR;
  }
  if (viva && iniMs <= nowMs && nowMs < finMs) return EN_CURSO;

  return estado === CITA_STATUS.PENDIENTE ? SIN_CONFIRMAR : CONFIRMADA;
}

/** Porcentaje recorrido de una cita en curso (0–100). */
export function progresoCita(cita: CitaBloque, nowMs: number): number {
  const iniMs = ms(cita.inicio);
  const finMs = ms(cita.fin);
  if (finMs <= iniMs) return 0;
  const pct = ((nowMs - iniMs) / (finMs - iniMs)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Minutos que le quedan a una cita en curso. */
export function minutosRestantes(cita: CitaBloque, nowMs: number): number {
  return Math.max(0, Math.round((ms(cita.fin) - nowMs) / 60000));
}

export const BLOQUEO_COLORS: Record<string, string> = {
  // Fuera de la jornada del profesional: gris apagado, deliberadamente distinto
  // de "libre" (blanco) y de una ausencia puntual (vacaciones, baja...).
  fuera_jornada: "#94a3b8",
  // Salon cerrado (negocio_horarios / cierres_negocio): tono distinto y mas
  // oscuro que fuera_jornada, porque es un bloqueo del NEGOCIO entero, no de
  // un profesional individual — no deben confundirse a simple vista.
  salon_cerrado: "#57534e",
  vacaciones: "#0f9d6b",
  reunion: "#3b82f6",
  baja: "#e23b34",
  formacion: "#c0260a",
  descanso: "#e08a00",
  // Reserva temporal: hueco retenido mientras una clienta decide si acepta un
  // cambio propuesto (citas_propuestas_cambio). Violeta, deliberadamente
  // distinto de cualquier bloqueo de persona, para que se vea que es un hueco
  // "con nombre" esperando confirmacion, no un tramo no laborable.
  reserva_temporal: "#7c3aed",
};
export const BLOQUEO_LABELS: Record<string, string> = {
  fuera_jornada: "Fuera de jornada",
  salon_cerrado: "Salón cerrado",
  vacaciones: "Vacaciones",
  reunion: "Reunión",
  baja: "Baja",
  formacion: "Formación",
  descanso: "Descanso",
  reserva_temporal: "Hueco reservado",
};

