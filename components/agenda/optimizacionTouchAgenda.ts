/**
 * Pasada 2 / Micro-Tarea D1: Calculador de Ancho de Columna Adaptativo para Rejilla Móvil 375px
 * Garantiza que la columna de horas sticky (50px) y las N columnas de profesionales
 * se distribuyan dinámicamente con scroll horizontal fluido y sin truncar nombres de estilistas.
 */

export interface DimensionesLayoutAgenda {
  anchoPantallaPx: number; // ej. 375 en iPhone SE / Android compacto
  numProfesionales: number;
  anchoColumnaHorasPx: number; // defecto 50px
}

export interface LayoutCalculado {
  anchoColumnaProfesionalPx: number;
  anchoTotalGridPx: number;
  requiereScrollHorizontal: boolean;
  columnasVisiblesSimultaneas: number;
}

export function calcularLayoutAgendaMovil(d: DimensionesLayoutAgenda): LayoutCalculado {
  const anchoHoras = d.anchoColumnaHorasPx || 50;
  const anchoDisponibleEstilistas = Math.max(d.anchoPantallaPx - anchoHoras, 100);

  // En pantallas moviles (<600px), cada columna de profesional debe tener al menos 120px para ser legible
  const MIN_ANCHO_PROFESIONAL = 120;

  const requiereScrollHorizontal = (d.numProfesionales * MIN_ANCHO_PROFESIONAL) > anchoDisponibleEstilistas;

  let anchoColumnaProfesionalPx = MIN_ANCHO_PROFESIONAL;
  let columnasVisiblesSimultaneas = Math.floor(anchoDisponibleEstilistas / MIN_ANCHO_PROFESIONAL);

  if (!requiereScrollHorizontal && d.numProfesionales > 0) {
    anchoColumnaProfesionalPx = Math.floor(anchoDisponibleEstilistas / d.numProfesionales);
    columnasVisiblesSimultaneas = d.numProfesionales;
  }

  const anchoTotalGridPx = anchoHoras + (d.numProfesionales * anchoColumnaProfesionalPx);

  return {
    anchoColumnaProfesionalPx,
    anchoTotalGridPx,
    requiereScrollHorizontal,
    columnasVisiblesSimultaneas: Math.max(columnasVisiblesSimultaneas, 1),
  };
}
