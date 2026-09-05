// ===========================================================================
// La cinta de "aqui cabe": que servicios del catalogo caben dentro de los
// reposos de ESTA cita (Spec 1, paso 5+).
//
// Es la REESCRIPTURA de la vieja Micro-Tarea C14 (borrada con el paso 5): la
// original trabajaba sobre un unico "minutosLibresReposo" inventado por quien
// llamara. Esta trabaja sobre cita_fases, que desde el paso 4 es la fuente de
// verdad: una cita con dos reposos tiene DOS ventanas donde encajar algo, y
// cada una cuenta por si misma.
//
// La regla de la original se conserva: hace falta margen de 5 min de
// limpieza alrededor del servicio encajado. El reposo no es un hueco
// generoso, es un tramo con quimica encima.
// ===========================================================================

import type { CitaFase } from './citaFases.ts';

export interface ServicioParaEncaje {
  id: string;
  nombre: string;
  duracionTotalMin: number;
}

export interface EncajeEnReposo {
  servicio: ServicioParaEncaje;
  huecoMin: number;
  reposoOrden: number;
  reposoEtiqueta: string | null;
}

const MARGEN_LIMPIEZA_MIN = 5;

/**
 * Dadas las fases reales de una cita y el catálogo vivo del salón, devuelve
 * los servicios que caben en alguno de sus reposos, con el reposo concreto
 * donde caben. Ordenado por duración del servicio (primero los que más
// holgan, que son los más fáciles de encajar).
 */
export function serviciosQueCabenEnReposos(
  fases: CitaFase[],
  servicios: ServicioParaEncaje[],
  margenMin: number = MARGEN_LIMPIEZA_MIN,
): EncajeEnReposo[] {
  if (!fases?.length || !servicios?.length) return [];

  const reposos = fases
    .filter((f) => f.tipo === 'reposo')
    .map((f) => ({
      orden: f.orden,
      etiqueta: f.etiqueta ?? null,
      huecoMin: Math.round(
        (new Date(f.fin).getTime() - new Date(f.inicio).getTime()) / 60000,
      ),
    }))
    .filter((r) => r.huecoMin > 0);

  const encajes: EncajeEnReposo[] = [];
  for (const servicio of servicios) {
    // Un servicio cabe en el PRIMER reposo con sitio: si ya cabe en el
    // primero no hace falta decirlo dos veces.
    const reposo = reposos.find(
      (r) => servicio.duracionTotalMin + margenMin <= r.huecoMin,
    );
    if (reposo) {
      encajes.push({ servicio, huecoMin: reposo.huecoMin, reposoOrden: reposo.orden, reposoEtiqueta: reposo.etiqueta });
    }
  }

  return encajes.sort(
    (a, b) => a.servicio.duracionTotalMin - b.servicio.duracionTotalMin,
  );
}
