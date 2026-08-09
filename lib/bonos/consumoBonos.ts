/**
 * Pasada 2 / Micro-Tarea D14: Motor de Asignación y Consumo de Bonos Multisesión
 * Permite descontar automáticamente una sesión del bono prepagado del cliente al realizar un cobro,
 * validando caducidad y sesiones restantes.
 */

export interface BonoCliente {
  bonoId: string;
  clienteId: string;
  servicioNombre: string;
  sesionesTotales: number;
  sesionesRestantes: number;
  fechaCaducidadISO: string;
}

export interface ResultadoConsumoBono {
  exito: boolean;
  sesionesRestantesActualizadas: number;
  descontadoConExito: boolean;
  motivoRechazo?: string;
}

export function consumirSesionBono(bono: BonoCliente): ResultadoConsumoBono {
  const ahora = new Date();
  const caducidad = new Date(bono.fechaCaducidadISO);

  if (ahora > caducidad) {
    return {
      exito: false,
      sesionesRestantesActualizadas: bono.sesionesRestantes,
      descontadoConExito: false,
      motivoRechazo: `Bono caducado el ${caducidad.toLocaleDateString()}`,
    };
  }

  if (bono.sesionesRestantes <= 0) {
    return {
      exito: false,
      sesionesRestantesActualizadas: 0,
      descontadoConExito: false,
      motivoRechazo: 'El bono no tiene sesiones disponibles restantes.',
    };
  }

  const sesionesRestantesActualizadas = bono.sesionesRestantes - 1;

  return {
    exito: true,
    sesionesRestantesActualizadas,
    descontadoConExito: true,
  };
}
