/**
 * Micro-Tarea C10: Evaluador de Porosidad Capilar y Prueba de Mechón
 */

export interface PruebaMechon {
  clienteId: string;
  porosidad: 'baja' | 'media' | 'alta';
  elasticidad: 'excelente' | 'normal' | 'fragil' | 'quebradizo';
  historialDecoloracion: boolean;
  tonosAclaradosDeseados: number;
}

export interface RecomendacionTratamiento {
  aptoParaDecolorar: boolean;
  tratamientoRecomendado: string;
  advertencias: string[];
}

export function evaluarPruebaMechon(p: PruebaMechon): RecomendacionTratamiento {
  const advertencias: string[] = [];
  let aptoParaDecolorar = true;
  let tratamientoRecomendado = 'Hidratación estándar post-servicio';

  if (p.elasticidad === 'quebradizo') {
    aptoParaDecolorar = false;
    advertencias.push('PELIGRO: El cabello se rompe en la prueba de estiramiento. Cancelar decoloración.');
    tratamientoRecomendado = 'Reconstrucción intensiva con aminoácidos y Plex';
  } else if (p.elasticidad === 'fragil') {
    if (p.tonosAclaradosDeseados > 3) {
      aptoParaDecolorar = false;
      advertencias.push('Elasticidad frágil. No se recomiendan más de 2 tonos de aclarado en una sola sesión.');
    }
    tratamientoRecomendado = 'Tratamiento proteico preparador previo';
  }

  if (p.porosidad === 'alta') {
    advertencias.push('Porosidad alta: la cutícula absorberá el matiz muy rápido. Reducir tiempo de emulsión.');
  }

  return {
    aptoParaDecolorar,
    tratamientoRecomendado,
    advertencias,
  };
}
