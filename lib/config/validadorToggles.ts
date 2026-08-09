/**
 * Micro-Tarea C16: Validador de Consistencia de Toggles de Configuración (`negocio_config`)
 * Garantiza que cada toggle activado (ej. depositoExigirClientesRiesgo, listaEsperaMatchingActivo)
 * tenga sus parámetros dependientes coherentes y sin contradicciones.
 */

export interface NegocioConfigPayload {
  listaEsperaMatchingActivo?: boolean;
  listaEsperaVentanaMin?: number;
  listaEsperaMaxBloqueoHoras?: number;
  depositoExigirClientesRiesgo?: boolean;
  depositoPorcentajeDefecto?: number;
  retrasoAvisoAutomatico?: boolean;
  retrasoUmbralMinutos?: number;
}

export interface ResultadoValidacionConfig {
  coherente: boolean;
  advertencias: string[];
}

export function validarConsistenciaConfig(config: NegocioConfigPayload): ResultadoValidacionConfig {
  const advertencias: string[] = [];

  if (config.listaEsperaMatchingActivo) {
    if (!config.listaEsperaVentanaMin || config.listaEsperaVentanaMin < 5) {
      advertencias.push('Matching de lista de espera activo pero la ventana de respuesta es menor a 5 minutos.');
    }
    if (!config.listaEsperaMaxBloqueoHoras || config.listaEsperaMaxBloqueoHoras < 1) {
      advertencias.push('Matching activo pero el tiempo máximo de retención de la oferta es menor a 1 hora.');
    }
  }

  if (config.depositoExigirClientesRiesgo) {
    if (!config.depositoPorcentajeDefecto || config.depositoPorcentajeDefecto <= 0) {
      advertencias.push('Cobro de depósito a clientes de riesgo activo pero el porcentaje de señal es 0%.');
    }
  }

  if (config.retrasoAvisoAutomatico) {
    if (!config.retrasoUmbralMinutos || config.retrasoUmbralMinutos < 5) {
      advertencias.push('Aviso automático por retraso activo pero el umbral de disparo es menor a 5 minutos.');
    }
  }

  return {
    coherente: advertencias.length === 0,
    advertencias,
  };
}
