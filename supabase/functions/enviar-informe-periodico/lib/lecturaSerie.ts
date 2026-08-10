// Lectura automatica de una serie o de un reparto: convierte los numeros de una
// grafica en una frase que un jefe de salon entiende sin pararse a descifrarla.
//
// El problema que resuelve: hasta ahora las explicaciones de informes eran
// ESTATICAS ("esta grafica mide los ingresos del periodo"). Eso dice para que
// sirve el grafico, no que esta diciendo. Aqui se calcula lo segundo: donde esta
// el pico, donde el valle, cuanto sube o baja y cual es el nivel normal.
//
// Modulo PURO y sin dependencias (ni React ni date-fns) para poder probarlo con
// `deno test lib/informes/lecturaSerie.test.ts`.

export interface PuntoSerie {
  fecha: Date;
  valor: number;
}

/** Grano del eje X. Manda en como se nombran los puntos ("dia", "mes"...). */
export type Granularidad = 'hora' | 'dia' | 'semana' | 'mes';

/** Naturaleza del valor. Manda en el formato y en si sumar tiene sentido. */
export type Unidad = 'eur' | 'conteo' | 'pct' | 'dias';

export type Direccion = 'sube' | 'baja' | 'estable' | 'sin_datos';

export interface LecturaSerie {
  pico: PuntoSerie | null;
  valle: PuntoSerie | null;
  total: number;
  media: number;
  /** Robusta frente a valores extremos, que en frecuencias y tickets son la norma. */
  mediana: number;
  /** Segunda mitad del periodo frente a la primera, en %. null si no es calculable. */
  tendenciaPct: number | null;
  direccion: Direccion;
  /** Frase en castellano llano, lista para pintar bajo la grafica. */
  frase: string;
  /**
   * false cuando sumar los valores no significa nada (porcentajes, medias de
   * dias). Evita el "Total en periodo" que hasta ahora sumaba porcentajes.
   */
  totalTieneSentido: boolean;
}

export interface OpcionesLectura {
  unidad: Unidad;
  granularidad: Granularidad;
  /** Sustantivo del conteo en plural, para que la frase diga "412 citas" y no "412". */
  sustantivo?: string;
  /**
   * El mismo sustantivo en singular. Sin esto se leia "1 citas". No se deduce
   * quitando la "s" porque hay palabras donde eso falla ("veces" -> "vece").
   */
  sustantivoSing?: string;
}

// Por debajo de este movimiento no se llama tendencia: es ruido.
const UMBRAL_ESTABLE_PCT = 5;
// Hacen falta al menos 4 puntos para partir el periodo en dos mitades con sentido.
const MIN_PUNTOS_TENDENCIA = 4;

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Formatea un valor segun su unidad, en castellano y sin decimales de mas. */
export function formatearValor(n: number, unidad: Unidad, sustantivo?: string, sustantivoSing?: string): string {
  switch (unidad) {
    case 'eur':
      return `${Math.round(n).toLocaleString('es-ES')} €`;
    case 'pct':
      return `${Math.round(n)} %`;
    case 'dias': {
      const d = Math.round(n);
      return `${d} ${d === 1 ? 'día' : 'días'}`;
    }
    case 'conteo': {
      const c = Math.round(n);
      if (!sustantivo) return String(c);
      return `${c} ${c === 1 ? (sustantivoSing ?? sustantivo) : sustantivo}`;
    }
  }
}

/** Nombre del grano en singular, para "tu mejor DIA fue...". */
export function nombreGrano(g: Granularidad): string {
  switch (g) {
    case 'hora': return 'hora';
    case 'dia': return 'día';
    case 'semana': return 'semana';
    case 'mes': return 'mes';
  }
}

/** Como se nombra un punto concreto del eje X. */
export function etiquetarPunto(fecha: Date, g: Granularidad): string {
  switch (g) {
    case 'hora':
      return `las ${String(fecha.getHours()).padStart(2, '0')}:00`;
    case 'dia':
      return fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    case 'semana':
      return `la semana del ${fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
    case 'mes':
      return fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
}

// ---------------------------------------------------------------------------
// Estadistica basica
// ---------------------------------------------------------------------------

export function media(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Mediana. Va aparte de la media a proposito: en "cada cuanto vuelven los
 * clientes", un cliente que reaparece tras 400 dias sube la media y engaña. La
 * mediana no se mueve.
 */
export function mediana(vals: number[]): number {
  if (vals.length === 0) return 0;
  const orden = [...vals].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 === 0
    ? (orden[mitad - 1] + orden[mitad]) / 2
    : orden[mitad];
}

/**
 * Variacion de la segunda mitad del periodo respecto a la primera, en %.
 * Se comparan MEDIAS y no sumas para que funcione con un numero impar de puntos
 * (el central se queda fuera de las dos mitades, que es lo correcto: no pertenece
 * ni al principio ni al final).
 */
export function tendenciaMitades(vals: number[]): number | null {
  if (vals.length < MIN_PUNTOS_TENDENCIA) return null;
  const mitad = Math.floor(vals.length / 2);
  const primera = media(vals.slice(0, mitad));
  const segunda = media(vals.slice(vals.length - mitad));
  if (primera === 0) return segunda === 0 ? 0 : null;
  return ((segunda - primera) / primera) * 100;
}

// ---------------------------------------------------------------------------
// Lectura de una serie temporal
// ---------------------------------------------------------------------------

export function leerSerie(serie: PuntoSerie[], opts: OpcionesLectura): LecturaSerie {
  const { unidad, granularidad, sustantivo, sustantivoSing } = opts;
  const vals = serie.map((p) => p.valor);
  const totalTieneSentido = unidad === 'eur' || unidad === 'conteo';
  const total = vals.reduce((a, b) => a + b, 0);
  const med = media(vals);
  const mdn = mediana(vals);

  const vacio = serie.length < 2 || vals.every((v) => v === 0);
  if (vacio) {
    return {
      pico: null, valle: null, total, media: med, mediana: mdn,
      tendenciaPct: null, direccion: 'sin_datos', totalTieneSentido,
      frase: 'Todavía no hay suficientes datos en este periodo para sacar una lectura. Prueba con un periodo más amplio.',
    };
  }

  let pico = serie[0];
  let valle = serie[0];
  for (const p of serie) {
    if (p.valor > pico.valor) pico = p;
    if (p.valor < valle.valor) valle = p;
  }

  const tendenciaPct = tendenciaMitades(vals);
  let direccion: Direccion = 'estable';
  if (tendenciaPct !== null && Math.abs(tendenciaPct) >= UMBRAL_ESTABLE_PCT) {
    direccion = tendenciaPct > 0 ? 'sube' : 'baja';
  }

  const partes: string[] = [];

  // 1) La tendencia primero: es el titular.
  if (tendenciaPct !== null) {
    const abs = Math.round(Math.abs(tendenciaPct));
    if (direccion === 'sube') {
      partes.push(`Va subiendo: la segunda mitad del periodo va un ${abs} % por encima de la primera.`);
    } else if (direccion === 'baja') {
      partes.push(`Va bajando: la segunda mitad del periodo va un ${abs} % por debajo de la primera.`);
    } else {
      partes.push('Se mantiene estable: el principio y el final del periodo van casi igual.');
    }
  }

  // 2) Pico y valle, que es donde el dueño puede actuar.
  const grano = nombreGrano(granularidad);
  const vPico = formatearValor(pico.valor, unidad, sustantivo, sustantivoSing);
  let fraseExtremos = `Tu mejor ${grano} fue ${etiquetarPunto(pico.fecha, granularidad)}, con ${vPico}`;
  if (valle !== pico && serie.length >= 3) {
    const vValle = formatearValor(valle.valor, unidad, sustantivo, sustantivoSing);
    fraseExtremos += `; el más flojo, ${etiquetarPunto(valle.fecha, granularidad)}, con ${vValle}`;
  }
  partes.push(`${fraseExtremos}.`);

  // 3) El nivel normal, para saber si el pico fue un buen dia o un milagro.
  partes.push(`Lo normal en tu salón es ${formatearValor(med, unidad, sustantivo, sustantivoSing)} por ${grano}.`);

  return {
    pico, valle, total, media: med, mediana: mdn,
    tendenciaPct, direccion, totalTieneSentido,
    frase: partes.join(' '),
  };
}

// ---------------------------------------------------------------------------
// Lectura de un reparto (graficas de barras: por franja, por profesional...)
// ---------------------------------------------------------------------------

export interface ItemReparto {
  etiqueta: string;
  valor: number;
}

export interface LecturaReparto {
  fuerte: ItemReparto | null;
  flojo: ItemReparto | null;
  total: number;
  /** % del total que se lleva el mas fuerte. */
  pctFuerte: number;
  /** true si un solo item concentra mas de la mitad. */
  concentrado: boolean;
  frase: string;
}

/**
 * Lee un reparto por categorias. `dimension` es como se llama el eje en la frase
 * ("franja", "profesional", "servicio") y va sin articulo.
 */
export function leerReparto(
  items: ItemReparto[],
  opts: { dimension: string; unidad?: Unidad; sustantivo?: string; sustantivoSing?: string },
): LecturaReparto {
  const { dimension, unidad = 'conteo', sustantivo, sustantivoSing } = opts;
  const conDatos = items.filter((i) => i.valor > 0);
  const total = items.reduce((s, i) => s + i.valor, 0);

  if (conDatos.length === 0) {
    return {
      fuerte: null, flojo: null, total: 0, pctFuerte: 0, concentrado: false,
      frase: 'Sin datos en este periodo, así que no hay reparto que leer.',
    };
  }

  const orden = [...conDatos].sort((a, b) => b.valor - a.valor);
  const fuerte = orden[0];
  const flojo = orden[orden.length - 1];
  const pctFuerte = total > 0 ? (fuerte.valor / total) * 100 : 0;
  const concentrado = pctFuerte > 50;

  const partes: string[] = [];
  partes.push(
    `Tu ${dimension} más fuerte es ${fuerte.etiqueta}: ${formatearValor(fuerte.valor, unidad, sustantivo, sustantivoSing)}` +
    (total > 0 ? `, un ${Math.round(pctFuerte)} % del total` : '') + '.',
  );

  if (flojo !== fuerte) {
    const pctFlojo = total > 0 ? (flojo.valor / total) * 100 : 0;
    partes.push(
      `${flojo.etiqueta} es donde menos se mueve: ${formatearValor(flojo.valor, unidad, sustantivo, sustantivoSing)} ` +
      `(${Math.round(pctFlojo)} %).`,
    );
  }

  if (concentrado) {
    partes.push(`Ojo: ${fuerte.etiqueta} concentra más de la mitad, así que si falla ahí lo notas entero.`);
  }

  return { fuerte, flojo, total, pctFuerte, concentrado, frase: partes.join(' ') };
}
