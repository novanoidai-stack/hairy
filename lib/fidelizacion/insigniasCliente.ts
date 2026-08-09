/**
 * Pasada 2 / Micro-Tarea D11: Evaluador de Nivel de Fidelización e Insignia VIP de Cliente
 * Otorga categorías de fidelidad (Bronce, Plata, Oro, Platino VIP) según frecuencia de visita,
 * gasto acumulado histórico y puntualidad, para otorgar prioridad automática en lista de espera y trato preferente.
 */

export interface DatosHistorialFidelidad {
  clienteId: string;
  totalVisitas: number;
  gastoTotalEuros: number;
  totalNoShows: number;
}

export interface InsigniaFidelidadCalculada {
  clienteId: string;
  nivel: 'bronce' | 'plata' | 'oro' | 'platino_vip';
  prioridadListaEsperaBonus: number; // +0 a +3 puntos de prioridad
  requiereAnticipoSeguro: boolean;
  beneficiosTexto: string;
}

export function evaluarInsigniaCliente(d: DatosHistorialFidelidad): InsigniaFidelidadCalculada {
  let nivel: 'bronce' | 'plata' | 'oro' | 'platino_vip' = 'bronce';
  let prioridadListaEsperaBonus = 0;
  let requiereAnticipoSeguro = false;

  // Si tiene alto ratio de no-shows, exige depósito independientemente de nivel
  if (d.totalNoShows >= 2) {
    requiereAnticipoSeguro = true;
  }

  if (d.totalVisitas >= 15 || d.gastoTotalEuros >= 800) {
    nivel = 'platino_vip';
    prioridadListaEsperaBonus = 3;
  } else if (d.totalVisitas >= 8 || d.gastoTotalEuros >= 400) {
    nivel = 'oro';
    prioridadListaEsperaBonus = 2;
  } else if (d.totalVisitas >= 3 || d.gastoTotalEuros >= 150) {
    nivel = 'plata';
    prioridadListaEsperaBonus = 1;
  }

  const beneficiosMap: Record<string, string> = {
    platino_vip: '👑 Cliente Platino VIP: Máxima prioridad en lista de espera (+3) y tratamiento exprés preferente',
    oro: '⭐ Cliente Oro: Alta prioridad en lista de espera (+2) y aviso preferente de huecos',
    plata: '✨ Cliente Plata: Prioridad estándar (+1) en lista de espera',
    bronce: 'Clienta habitual sin prioridad adicional',
  };

  return {
    clienteId: d.clienteId,
    nivel,
    prioridadListaEsperaBonus,
    requiereAnticipoSeguro,
    beneficiosTexto: beneficiosMap[nivel],
  };
}
