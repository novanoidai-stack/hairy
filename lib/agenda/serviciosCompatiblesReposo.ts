/**
 * Micro-Tarea C14: Buscador de Compatibilidad de Servicios Paralelos en Tiempos de Reposo
 * Evalúa si un servicio secundario (ej. Manicura, Peinado, Arreglo de barba) cabe exactamente
 * dentro del tiempo muerto de reposo de un servicio principal (ej. Tinte o Decoloración).
 */

export interface ServicioCandidato {
  id: string;
  nombre: string;
  duracionTotalMin: number;
  requiereTocadoEstilista: boolean;
}

export interface EvaluacionReposo {
  minutosLibresReposo: number;
  profesionalDisponible: boolean;
  serviciosDisponibles: ServicioCandidato[];
}

export function filtrarServiciosCompatiblesEnReposo(evaluacion: EvaluacionReposo): ServicioCandidato[] {
  if (evaluacion.minutosLibresReposo <= 0 || !evaluacion.serviciosDisponibles) {
    return [];
  }

  return evaluacion.serviciosDisponibles.filter(s => {
    // Debe caber holgadamente con 5 min de margen para limpieza
    const cabe = s.duracionTotalMin + 5 <= evaluacion.minutosLibresReposo;
    return cabe;
  });
}
