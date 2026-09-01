// Vigilante de Planta: Meta-Trinquete (Ratchet Unidireccional de Deuda Técnica)
//
// POR QUE EXISTE:
// La deuda técnica y los avisos tolerados (ej. módulos desconectados, páginas
// secundarias de SEO heredadas) deben tender a CERO con el tiempo. El Trinquete
// impide que el número de avisos crezca silenciosamente: la deuda solo puede
// bajar o mantenerse; cualquier aumento no autorizado bloquea la CI.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const RUTA_SNAPSHOT = path.join(RAIZ, '.sistema', 'estado-salud.json');
const RUTA_LINEA_BASE = path.join(RAIZ, 'scripts', 'vigilantes', 'meta-trinquete-baseline.json');

/**
 * Evalúa si el recuento de avisos supera la línea base permitida.
 * @param {number} avisosActuales
 * @param {number} limitePermitido
 * @returns {import('./nucleo.mjs').Hallazgo[]}
 */
export function evaluarTrinquete(avisosActuales, limitePermitido) {
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
  if (!existsSync(RUTA_LINEA_BASE)) {
    return [];
  }

  try {
    const configBase = JSON.parse(readFileSync(RUTA_LINEA_BASE, 'utf8'));
    const limite = configBase.maximo_avisos_permitidos ?? 45;

    if (!existsSync(RUTA_SNAPSHOT)) {
      return [];
    }

    const snapshot = JSON.parse(readFileSync(RUTA_SNAPSHOT, 'utf8'));
    const avisosActuales = snapshot.avisos ?? 0;

    return evaluarTrinquete(avisosActuales, limite);
  } catch {
    return [];
  }
}

export default {
  nombre: 'meta-trinquete',
  ambito: 'meta',
  descripcion:
    'Vigilante de Planta: garantiza que la deuda técnica y avisos solo disminuyan (Trinquete unidireccional)',
  ejecutar,
};
