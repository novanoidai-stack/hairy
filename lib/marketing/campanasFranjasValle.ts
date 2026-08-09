/**
 * Pasada 2 / Micro-Tarea D8: Motor de Recomendación de Franjas Valle para Campañas de Marketing
 * Analiza la ocupación de la agenda de los próximos 7 a 14 días e identifica las horas con menor ocupación (<40%)
 * sugiriendo descuentos dinámicos (ej. "¡20% dto los martes de 12:00 a 16:00!").
 */

export interface OcupacionFranjaHora {
  diaSemana: string; // ej. "Martes"
  horaHHMM: string; // ej. "12:00"
  porcentajeOcupacion: number; // 0-100
}

export interface RecomendacionCampanaValle {
  diaSemana: string;
  horaHHMM: string;
  porcentajeOcupacion: number;
  descuentoSugeridoPorcentaje: number;
  frasePromocional: string;
}

export function identificarFranjasValleYRecomendar(franjas: OcupacionFranjaHora[]): RecomendacionCampanaValle[] {
  const result: RecomendacionCampanaValle[] = [];

  for (const f of franjas || []) {
    if (f.porcentajeOcupacion < 40) {
      let descuentoSugeridoPorcentaje = 15;
      if (f.porcentajeOcupacion < 20) {
        descuentoSugeridoPorcentaje = 25;
      }

      result.push({
        diaSemana: f.diaSemana,
        horaHHMM: f.horaHHMM,
        porcentajeOcupacion: f.porcentajeOcupacion,
        descuentoSugeridoPorcentaje,
        frasePromocional: `⚡ ¡Oferta Flash! ${descuentoSugeridoPorcentaje}% dto en tu servicio este ${f.diaSemana} a las ${f.horaHHMM}`,
      });
    }
  }

  return result.sort((a, b) => a.porcentajeOcupacion - b.porcentajeOcupacion);
}
