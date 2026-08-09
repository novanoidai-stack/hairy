/**
 * Micro-Tarea C13: Calculador de Franjas de Desinfección y Preparación entre Citas
 * Inserta automáticamente pausas de limpieza/desinfección recomendadas según el tipo de servicio realizado.
 */

export interface CitaParaPausa {
  citaId: string;
  servicioNombre: string;
  categoriaServicio: 'tinte_color' | 'decoloracion' | 'corte' | 'estetica_facial' | 'manicura';
  finCitaISO: string;
}

export interface PausaDesinfeccionCalculada {
  citaId: string;
  inicioPausaISO: string;
  finPausaISO: string;
  duracionMin: number;
  motivo: string;
}

const TIEMPOS_DESINFECCION_MIN: Record<string, number> = {
  decoloracion: 10,
  tinte_color: 10,
  estetica_facial: 15,
  manicura: 10,
  corte: 5,
};

export function calcularPausaDesinfeccion(c: CitaParaPausa): PausaDesinfeccionCalculada {
  const duracion = TIEMPOS_DESINFECCION_MIN[c.categoriaServicio] || 5;
  const inicioDate = new Date(c.finCitaISO);
  const finDate = new Date(inicioDate.getTime() + duracion * 60 * 1000);

  return {
    citaId: c.citaId,
    inicioPausaISO: inicioDate.toISOString(),
    finPausaISO: finDate.toISOString(),
    duracionMin: duracion,
    motivo: `Desinfección de tocador y herramientas tras ${c.servicioNombre}`,
  };
}
