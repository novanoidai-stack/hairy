/**
 * Pasada 2 / Micro-Tarea D5: Validador de Consistencia de Turnos Rotativos y Festivos Locales / Nacionales
 * Previene la asignación accidental de citas en días declarados como festivos cerrados o fuera de turnos rotativos.
 */

export interface FestivoLocal {
  fechaYYYYMMDD: string;
  nombreFestivo: string;
  esCerradoCompleto: boolean;
}

export interface TurnoRotativo {
  profesionalId: string;
  diaSemana: number; // 0 = Domingo, 1 = Lunes, etc.
  turno: 'manana' | 'tarde' | 'completo' | 'libre';
}

export interface EvaluacionDisponibilidadFecha {
  profesionalId: string;
  fechaISO: string;
  festivos: FestivoLocal[];
  turnos: TurnoRotativo[];
}

export interface ResultadoValidacionTurnoFestivo {
  disponible: boolean;
  motivoBloqueo?: string;
}

export function validarTurnoYFestivo(e: EvaluacionDisponibilidadFecha): ResultadoValidacionTurnoFestivo {
  const dateObj = new Date(e.fechaISO);
  const yyyymmdd = e.fechaISO.substring(0, 10);
  const diaSemana = dateObj.getUTCDay();

  // 1. Verificar si la fecha es festivo cerrado completo
  const festivoEncontrado = (e.festivos || []).find(f => f.fechaYYYYMMDD === yyyymmdd && f.esCerradoCompleto);
  if (festivoEncontrado) {
    return {
      disponible: false,
      motivoBloqueo: `Día festivo cerrado: ${festivoEncontrado.nombreFestivo}`,
    };
  }

  // 2. Verificar turno rotativo del profesional
  const turnoEncontrado = (e.turnos || []).find(t => t.profesionalId === e.profesionalId && t.diaSemana === diaSemana);
  if (turnoEncontrado && turnoEncontrado.turno === 'libre') {
    return {
      disponible: false,
      motivoBloqueo: 'El profesional tiene día libre asignado en su turno rotativo',
    };
  }

  return {
    disponible: true,
  };
}
