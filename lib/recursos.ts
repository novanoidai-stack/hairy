// Puestos fisicos del salon: lavacabezas, cabinas, sillones, aparatologia.
//
// Responde una pregunta que la agenda no sabia hacerse: el profesional esta
// libre, si, pero ¿queda lavacabezas? Si tres tintes salen del reposo a la vez y
// hay dos pilas, la tercera clienta espera con el color pasado de tiempo.
//
// Esto NO sustituye ni toca la ocupacion del profesional, que sigue viviendo en
// lib/retrasos.ts (fasesDe / ventanasActivas). Son dos preguntas distintas: una
// es "¿quien puede atenderla?" y otra "¿donde la siento?".
//
// El equivalente en servidor esta en migrations/recursos-fisicos-cuellos-botella.sql
// (recursos_capacidad / recursos_ocupados / recurso_hay_hueco). Este modulo es
// para avisar en el momento, mientras se arrastra una cita, sin ir y volver.

export type TipoRecurso = 'lavacabezas' | 'cabina' | 'sillon' | 'aparatologia';

export type FaseRecurso =
  // Ocupa el puesto de punta a punta: la cabina de estetica no se comparte.
  | 'completa'
  // Solo el tramo de lavado y acabado, el que va despues del reposo.
  | 'final';

export type Recurso = {
  id: string;
  nombre: string;
  tipo: TipoRecurso;
  capacidad: number;
  activo: boolean;
};

export type CitaConRecurso = {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
  estado?: string | null;
  oculta_en_calendario?: boolean | null;
  recurso_tipo?: TipoRecurso | null;
  recurso_fase?: FaseRecurso | null;
};

export type Tramo = { desde: number; hasta: number };

export const TIPOS_RECURSO: readonly TipoRecurso[] = [
  'lavacabezas',
  'cabina',
  'sillon',
  'aparatologia',
];

export const RECURSO_LABEL: Record<TipoRecurso, string> = {
  lavacabezas: 'Lavacabezas',
  cabina: 'Cabina',
  sillon: 'Sillon',
  aparatologia: 'Aparato',
};

// Plural para los avisos ("se usan los 2 lavacabezas a la vez").
export const RECURSO_LABEL_PLURAL: Record<TipoRecurso, string> = {
  lavacabezas: 'lavacabezas',
  cabina: 'cabinas',
  sillon: 'sillones',
  aparatologia: 'aparatos',
};

// Cada tipo con su genero, para que el aviso no salga escrito como una maquina
// ("el cabina ya esta ocupado").
const FRASE_UNICO: Record<TipoRecurso, string> = {
  lavacabezas: 'el lavacabezas ya está ocupado',
  cabina: 'la cabina ya está ocupada',
  sillon: 'el sillón ya está ocupado',
  aparatologia: 'el aparato ya está ocupado',
};

const ARTICULO_PLURAL: Record<TipoRecurso, string> = {
  lavacabezas: 'los',
  cabina: 'las',
  sillon: 'los',
  aparatologia: 'los',
};

// Mismos estados que bloquean solape en el resto del sistema: una cancelada o
// una no presentada devuelven el puesto al salon.
const ESTADOS_QUE_OCUPAN = new Set(['pendiente', 'confirmada', 'completada']);

/**
 * Tramo en el que una cita tiene cogido su puesto fisico, o null si su servicio
 * no pide ninguno.
 *
 * El tramo "final" arranca donde acaba el reposo, con el mismo coalesce que usa
 * todo el sistema: una cita sin fases marcadas no tiene reposo que valga y
 * ocupa desde el principio.
 */
export function tramoDeRecurso(cita: CitaConRecurso): Tramo | null {
  if (!cita.recurso_tipo) return null;
  const fin = new Date(cita.fin).getTime();
  if (Number.isNaN(fin)) return null;

  const arranque =
    cita.recurso_fase === 'completa'
      ? cita.inicio
      : (cita.fin_espera ?? cita.fin_activa ?? cita.inicio);
  const desde = new Date(arranque).getTime();
  if (Number.isNaN(desde) || desde >= fin) return null;

  return { desde, hasta: fin };
}

function solapan(a: Tramo, b: Tramo): boolean {
  // A medio abrir: dos tramos que solo se tocan en el borde no compiten. La
  // clienta que sale del lavacabezas a y cuarto y la que entra a y cuarto caben.
  return a.desde < b.hasta && a.hasta > b.desde;
}

/** Puestos totales de un tipo. Cero significa "el salon no lo controla". */
export function capacidadDe(recursos: Recurso[], tipo: TipoRecurso): number {
  return recursos
    .filter((r) => r.activo && r.tipo === tipo)
    .reduce((suma, r) => suma + (r.capacidad || 0), 0);
}

/** Citas que tienen cogido un puesto de ese tipo durante el tramo dado. */
export function ocupacionEnTramo(
  citas: CitaConRecurso[],
  tipo: TipoRecurso,
  tramo: Tramo,
  excluirCitaId?: string,
): CitaConRecurso[] {
  return citas.filter((c) => {
    if (c.id === excluirCitaId) return false;
    if (c.recurso_tipo !== tipo) return false;
    if (c.oculta_en_calendario) return false;
    if (!ESTADOS_QUE_OCUPAN.has(c.estado ?? 'pendiente')) return false;
    const suyo = tramoDeRecurso(c);
    return !!suyo && solapan(suyo, tramo);
  });
}

export type AvisoRecurso = {
  tipo: TipoRecurso;
  ocupados: number;
  capacidad: number;
  mensaje: string;
};

/**
 * Devuelve el aviso a enseñar si la cita candidata se queda sin puesto fisico,
 * o null si cabe.
 *
 * Nunca bloquea por falta de configuracion: un salon sin recursos dados de alta
 * tiene capacidad cero y eso quiere decir "no lo controlo", jamas "no cabe".
 */
export function avisoDeRecurso(
  candidata: CitaConRecurso,
  citasDelDia: CitaConRecurso[],
  recursos: Recurso[],
): AvisoRecurso | null {
  const tipo = candidata.recurso_tipo;
  if (!tipo) return null;

  const capacidad = capacidadDe(recursos, tipo);
  if (capacidad === 0) return null;

  const tramo = tramoDeRecurso(candidata);
  if (!tramo) return null;

  const ocupados = ocupacionEnTramo(citasDelDia, tipo, tramo, candidata.id).length;
  if (ocupados < capacidad) return null;

  return {
    tipo,
    ocupados,
    capacidad,
    mensaje:
      capacidad === 1
        ? `A esa hora ${FRASE_UNICO[tipo]}.`
        : `A esa hora ya se usan ${ARTICULO_PLURAL[tipo]} ${capacidad} ${RECURSO_LABEL_PLURAL[tipo]} a la vez.`,
  };
}
