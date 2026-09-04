// Saneador de lo que devuelve el modelo al tecnificar el catalogo.
//
// Vive aparte de index.ts A PROPOSITO. index.ts llama a Deno.serve() y lee
// Deno.env en el nivel superior: importarlo desde un test levanta un servidor
// HTTP y exige permisos que un test unitario no deberia necesitar. Eso tuvo la
// CI en rojo desde el 30 ago a las 12:03, y con ella mudos los vigilantes y el
// canario, que van detras en el mismo job.
//
// Regla que sale de ahi: si una edge function tiene logica que merece test, esa
// logica va en su propio modulo. El index.ts es la puerta HTTP, no la libreria.

export const RECURSOS = ['lavacabezas', 'cabina', 'sillon', 'aparatologia'] as const;
export const FASES = ['completa', 'final'] as const;
export const TIPOS_FASE = ['activa', 'reposo', 'transicion'] as const;

export type Servicio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  duracion_activa_min: number | null;
  duracion_espera_min: number | null;
  recurso_tipo: string | null;
  recurso_fase: string | null;
};

// Una fase de la plantilla (servicios.fases). La forma es la MISMA que exige el
// CHECK servicios_fases_forma de la base de datos: este saneador es su espejo en
// TypeScript, para que lo que sale de aqui pueda escribirse tal cual.
export type FasePropuesta = {
  tipo: 'activa' | 'reposo' | 'transicion';
  min: number;
  etiqueta?: string | null;
  recurso_tipo?: string | null;
};

export type Propuesta = {
  id: string;
  duracion_activa_min: number;
  duracion_espera_min: number;
  recurso_tipo: string | null;
  recurso_fase: string | null;
  fases: FasePropuesta[] | null;
  confianza: string;
  motivo: string;
};

const entero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * Sanea la SECUENCIA de fases con las mismas reglas que el CHECK
 * servicios_fases_forma de la base de datos (fases_servicio_validas). Si la
 * secuencia no las cumple TODAS, se devuelve null -- y solo la secuencia: los
 * dos numeros siguen valiendo, igual que con un recurso inventado. Una
 * plantilla a medias es peor que ninguna: proyectaria fases que contradicen a
 * las 4 marcas.
 *
 * Reglas (las mismas del CHECK, en el mismo orden):
 *   - array de 1 a 12 objetos, cada uno con tipo conocido y min entero 1..300
 *   - etiqueta opcional <= 40 caracteres; recurso_tipo del catalogo cerrado
 *   - nunca dos reposos seguidos, al menos una fase que no sea reposo
 *   - suma total <= 600 min
 */
export function sanearFases(cruda: unknown): FasePropuesta[] | null {
  if (cruda === null || cruda === undefined) return null;
  if (!Array.isArray(cruda) || cruda.length < 1 || cruda.length > 12) return null;

  const limpias: FasePropuesta[] = [];
  for (const item of cruda) {
    const f = (item ?? {}) as Record<string, unknown>;
    const tipo = typeof f.tipo === 'string' ? f.tipo.toLowerCase() : '';
    if (!TIPOS_FASE.includes(tipo as (typeof TIPOS_FASE)[number])) return null;
    const min = entero(f.min);
    if (min === null || min < 1 || min > 300) return null;

    let etiqueta: string | null = typeof f.etiqueta === 'string' ? f.etiqueta.trim() : null;
    if (etiqueta === '') etiqueta = null;
    if (etiqueta && etiqueta.length > 40) return null;

    let recurso: string | null = typeof f.recurso_tipo === 'string' ? f.recurso_tipo.toLowerCase() : null;
    if (recurso && !RECURSOS.includes(recurso as (typeof RECURSOS)[number])) recurso = null;

    limpias.push({ tipo, min, etiqueta, recurso_tipo: recurso } as FasePropuesta);
  }

  let hayTrabajo = false;
  let suma = 0;
  for (let i = 0; i < limpias.length; i++) {
    if (limpias[i].tipo === 'reposo' && limpias[i - 1]?.tipo === 'reposo') return null;
    if (limpias[i].tipo !== 'reposo') hayTrabajo = true;
    suma += limpias[i].min;
  }
  if (!hayTrabajo) return null;
  if (suma > 600) return null;

  return limpias;
}

/**
 * Todo lo que devuelve el modelo pasa por aqui. Devuelve la propuesta saneada o
 * el motivo por el que se descarta -- que se enseña, porque un descarte mudo es
 * lo que hace que nadie sepa por que faltan servicios.
 */
export function sanear(cruda: unknown, conocidos: Map<string, Servicio>): Propuesta | { descartada: string; id?: string } {
  const p = (cruda ?? {}) as Record<string, unknown>;
  const id = typeof p.id === 'string' ? p.id : '';
  const servicio = conocidos.get(id);
  if (!servicio) return { descartada: 'id que no estaba en la tanda', id };

  const activa = entero(p.duracion_activa_min);
  let espera = entero(p.duracion_espera_min);
  if (activa === null || activa < 5 || activa > 300) {
    return { descartada: `duracion activa fuera de rango (${p.duracion_activa_min})`, id };
  }
  if (espera === null || espera < 0 || espera > 120) {
    return { descartada: `reposo fuera de rango (${p.duracion_espera_min})`, id };
  }

  let tipo = typeof p.recurso_tipo === 'string' ? p.recurso_tipo.toLowerCase() : null;
  if (tipo && !RECURSOS.includes(tipo as (typeof RECURSOS)[number])) {
    // Un recurso inventado no invalida el resto de la propuesta: los minutos son
    // lo que vale, y el puesto se puede poner despues a mano.
    tipo = null;
  }
  let fase = typeof p.recurso_fase === 'string' ? p.recurso_fase.toLowerCase() : null;
  if (fase && !FASES.includes(fase as (typeof FASES)[number])) fase = null;
  if (!tipo) fase = null;
  if (tipo && !fase) fase = espera > 0 ? 'final' : 'completa';

  // La secuencia pasa por su propio espejo del CHECK. Si no lo cumple, se cae
  // ella sola y quedan los dos numeros -- nunca una plantilla a medias.
  let fases = sanearFases(p.fases);
  if (fases) {
    // Las 4 marcas son un RESUMEN de la plantilla (migracion 20260904151604):
    // fin_espera = fin del PRIMER reposo. Si el modelo dijo un reposo distinto
    // en la secuencia, manda la secuencia: el resumen no puede contradecir a la
    // plantilla, porque el resumen es lo que leen las 8 funciones de ocupacion.
    const primerReposo = fases.find((f) => f.tipo === 'reposo');
    const esperaDeFases = primerReposo ? primerReposo.min : 0;
    // El CHECK de la secuencia admite reposos de hasta 300 min, pero la RPC
    // (y este saneador) acota el resumen a 120: una secuencia cuyo resumen no
    // se pudiera guardar entera es una secuencia que no sale de aqui.
    if (esperaDeFases >= 0 && esperaDeFases <= 120) {
      espera = esperaDeFases;
    } else {
      fases = null;
    }
  }

  const confianza = ['alta', 'media', 'baja'].includes(String(p.confianza))
    ? String(p.confianza)
    : 'baja';

  return {
    id,
    duracion_activa_min: activa,
    duracion_espera_min: espera,
    recurso_tipo: tipo,
    recurso_fase: fase,
    fases,
    confianza,
    motivo: String(p.motivo ?? '').slice(0, 200),
  };
}
