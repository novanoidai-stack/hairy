// Vigilante de Planta: Meta-Trinquete (Ratchet Unidireccional de Deuda Técnica)
//
// POR QUE EXISTE:
// La deuda técnica y los avisos tolerados (ej. módulos desconectados, páginas
// secundarias de SEO heredadas) deben tender a CERO con el tiempo. El Trinquete
// impide que el número de avisos crezca silenciosamente: la deuda solo puede
// bajar o mantenerse; cualquier aumento no autorizado bloquea la CI.
//
// EL TRINQUETE NACIO SIN MEDIR NADA (arreglado el 1 sep 2026)
// Leía el recuento con `snapshot.avisos ?? 0`, y ese campo NO EXISTE en el
// snapshot: `compilar-estado.mjs` lo escribe DENTRO de `resumen`
// (`resumen.avisos`, hoy 39). Las claves de primer nivel son version,
// timestamp, duracion_ms, git, resumen, capas y hallazgos -- ninguna es
// `avisos`. El `?? 0` convertía ese hueco en un cero, así que la comparación
// real era siempre `evaluarTrinquete(0, 42)`: el trinquete llevaba en verde
// desde que se escribió sin haber comparado jamás una sola cifra.
//
// Los dos `if (!existsSync(...)) return []` y el `catch { return []; }` que
// había debajo eran la misma mentira con otras tres formas. Por eso ahora:
//
//   - Los dos ficheros que lee están VERSIONADOS (`git ls-files .sistema` y el
//     propio baseline), así que NO existe el caso legítimo de "aquí no aplica"
//     que sí tiene el bundle de `claves.mjs`. Si falta uno, alguien lo ha
//     borrado, y eso se dice en voz alta.
//   - Un JSON que no parsea, un `resumen` que no está o un `avisos` que no es
//     número son ANCLAS PERDIDAS: se lanzan y el runner (y el compilador) las
//     convierten en un hallazgo bloqueante. Un recuento que no se ha podido
//     leer NO es un cero.
//
// Regla general, que es la del repo: un vigilante que lee un campo ausente
// tiene que fallar a gritos, no leer cero. Ver `nucleo.mjs`.

import { AnclaPerdida, hallazgo, leer } from './nucleo.mjs';

const RUTA_SNAPSHOT = '.sistema/estado-salud.json';
const RUTA_LINEA_BASE = 'scripts/vigilantes/meta-trinquete-baseline.json';

const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Parsea uno de los dos ficheros del trinquete. Un JSON roto no puede pasar por
 * "sin novedad": sin poder leerlo no hay recuento que comparar, y un trinquete
 * que no compara nada solo sabe decir que sí.
 * @param {string} texto
 * @param {string} fichero
 */
function parsearJson(texto, fichero) {
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new AnclaPerdida(
      `${fichero} no es JSON válido: ${e?.message || e}. El trinquete no puede medir ` +
        'la deuda contra un fichero que no sabe leer, así que esto falla a propósito ' +
        'en vez de salir en verde.',
      { fichero, ancla: 'json' },
    );
  }
}

/**
 * Saca el recuento de avisos del snapshot de salud. Es EL ancla de este
 * vigilante: `resumen.avisos` es el campo exacto que escribe compilar-estado.mjs
 * y el único que el trinquete mide.
 * @param {unknown} snapshot
 * @param {string} fichero
 * @returns {number}
 */
export function leerAvisosDelSnapshot(snapshot, fichero = RUTA_SNAPSHOT) {
  const resumen = esObjeto(snapshot) ? snapshot.resumen : null;
  if (!esObjeto(resumen)) {
    throw new AnclaPerdida(
      `${fichero} no trae un objeto "resumen". Ahí es donde compilar-estado.mjs escribe ` +
        'el recuento de avisos del que vive el trinquete, así que sin él no hay nada que ' +
        'comparar. Si el snapshot ha cambiado de forma, hay que actualizar este vigilante ' +
        '-- no leer un cero y seguir.',
      { fichero, ancla: 'resumen' },
    );
  }

  const avisos = resumen.avisos;
  if (typeof avisos !== 'number' || !Number.isFinite(avisos)) {
    throw new AnclaPerdida(
      `${fichero} no trae un número en "resumen.avisos" (hay ${JSON.stringify(avisos)}). ` +
        'Este es exactamente el campo que el trinquete mide. Leerlo como 0 cuando falta es ' +
        'lo que hacía hasta el 1 sep 2026, y por eso no disparó nunca.',
      { fichero, ancla: 'resumen.avisos' },
    );
  }

  return avisos;
}

/**
 * Saca el techo congelado de la línea base.
 * @param {unknown} configBase
 * @param {string} fichero
 * @returns {number}
 */
export function leerLimiteDeLineaBase(configBase, fichero = RUTA_LINEA_BASE) {
  const limite = esObjeto(configBase) ? configBase.maximo_avisos_permitidos : undefined;
  if (typeof limite !== 'number' || !Number.isFinite(limite)) {
    throw new AnclaPerdida(
      `${fichero} no trae un número en "maximo_avisos_permitidos" (hay ${JSON.stringify(limite)}). ` +
        'Antes se caía a un 45 por defecto, que es MÁS PERMISIVO que el techo real (42): ' +
        'un fichero de línea base mal escrito aflojaba el trinquete en silencio, que es ' +
        'justo lo contrario de lo que hace un trinquete.',
      { fichero, ancla: 'maximo_avisos_permitidos' },
    );
  }

  return limite;
}

/**
 * Evalúa si el recuento de avisos supera la línea base permitida.
 * @param {number} avisosActuales
 * @param {number} limitePermitido
 * @returns {import('./nucleo.mjs').Hallazgo[]}
 */
export function evaluarTrinquete(avisosActuales, limitePermitido) {
  // Las dos cifras tienen que ser números de verdad. Cero avisos es un estado
  // legítimo, pero un `undefined` colado por un `??` río arriba NO puede
  // comparar como "no hay deuda": es como estuvo roto este vigilante.
  for (const [nombre, valor] of [
    ['avisosActuales', avisosActuales],
    ['limitePermitido', limitePermitido],
  ]) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new AnclaPerdida(
        `evaluarTrinquete recibió ${nombre}=${JSON.stringify(valor)}, que no es un número. ` +
          'Un trinquete que compara contra un hueco no mide nada y siempre pasa.',
        { fichero: 'scripts/vigilantes/meta-trinquete.mjs', ancla: nombre },
      );
    }
  }

  const hallazgos = [];

  if (avisosActuales > limitePermitido) {
    hallazgos.push(
      hallazgo({
        clave: 'meta-trinquete/desborde-deuda',
        nivel: 'bloqueante',
        ambito: 'meta',
        titulo: `Deuda técnica desbordada: ${avisosActuales} avisos actuales > ${limitePermitido} límite`,
        detalle:
          `El trinquete unidireccional ha detectado ${avisosActuales} avisos activos, superando ` +
          `el techo congelado de ${limitePermitido}.\n\n` +
          'Regla de Trinquete: No se permite introducir nueva deuda técnica sin resolver ' +
          'la existente o justificar explícitamente una actualización de la línea base.',
        fichero: 'scripts/vigilantes/meta-trinquete-baseline.json',
      }),
    );
  }

  return hallazgos;
}

async function ejecutar() {
  // `leer()` lanza AnclaPerdida si el fichero no está, que es lo que queremos:
  // los dos están versionados y su ausencia es un hallazgo, no un no-aplica.
  const limite = leerLimiteDeLineaBase(
    parsearJson(leer(RUTA_LINEA_BASE), RUTA_LINEA_BASE),
    RUTA_LINEA_BASE,
  );
  const avisosActuales = leerAvisosDelSnapshot(
    parsearJson(leer(RUTA_SNAPSHOT), RUTA_SNAPSHOT),
    RUTA_SNAPSHOT,
  );

  return evaluarTrinquete(avisosActuales, limite);
}

export default {
  nombre: 'meta-trinquete',
  ambito: 'meta',
  descripcion:
    'Vigilante de Planta: garantiza que la deuda técnica y avisos solo disminuyan (Trinquete unidireccional)',
  ejecutar,
};
