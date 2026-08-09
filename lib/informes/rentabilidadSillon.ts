/**
 * Pasada 2 / Micro-Tarea D7: Motor de Análisis de Rentabilidad por Sillón / Cabina de Trabajo
 * Mide la facturación por hora, tasa de ocupación y margen generado por puesto físico en el salón.
 */

export interface DatosSillonTrabajo {
  sillonId: string;
  nombreSillon: string; // ej. "Sillón 1 - Color", "Cabina Estética 2"
  horasDisponiblesMes: number;
  horasOcupadasMes: number;
  facturacionTotalMes: number;
}

export interface MetricastRentabilidadSillon {
  sillonId: string;
  nombreSillon: string;
  porcentajeOcupacion: number;
  facturacionPorHoraOcupada: number;
  facturacionPorHoraDisponible: number;
  nivelEficiencia: 'optimo' | 'aceptable' | 'infrautilizado';
}

export function calcularRentabilidadSillon(d: DatosSillonTrabajo): MetricastRentabilidadSillon {
  const horasDisp = Math.max(d.horasDisponiblesMes || 0, 1);
  const horasOcup = Math.max(d.horasOcupadasMes || 0, 0);

  const porcentajeOcupacion = Math.round((horasOcup / horasDisp) * 10000) / 100; // ej. 75.5%
  const facturacionPorHoraOcupada = horasOcup > 0 ? Math.round((d.facturacionTotalMes / horasOcup) * 100) / 100 : 0;
  const facturacionPorHoraDisponible = Math.round((d.facturacionTotalMes / horasDisp) * 100) / 100;

  let nivelEficiencia: 'optimo' | 'aceptable' | 'infrautilizado' = 'infrautilizado';
  if (porcentajeOcupacion >= 70 && facturacionPorHoraOcupada >= 30) {
    nivelEficiencia = 'optimo';
  } else if (porcentajeOcupacion >= 45) {
    nivelEficiencia = 'aceptable';
  }

  return {
    sillonId: d.sillonId,
    nombreSillon: d.nombreSillon,
    porcentajeOcupacion,
    facturacionPorHoraOcupada,
    facturacionPorHoraDisponible,
    nivelEficiencia,
  };
}
