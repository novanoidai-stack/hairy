/**
 * Micro-Tarea C12: Calculador de Bonificación / Sobrecoste por Reasignación Rápida de Profesional
 * Cuando una cita es reasignada a otro profesional libre para evitar solapes o retrasos,
 * calcula si aplica ajuste de tarifa (ej. categoría Senior vs Junior) o incentivo por aceptación rápida.
 */

export interface DatosReasignacion {
  citaId: string;
  categoriaProfOriginal: 'junior' | 'estandar' | 'senior' | 'master';
  categoriaProfNuevo: 'junior' | 'estandar' | 'senior' | 'master';
  precioBaseServicio: number;
  respetarPrecioOriginal: boolean; // Si el salon absorbe la diferencia para el cliente
}

export interface ResultadoCalculoReasignacion {
  precioFinalCliente: number;
  diferenciaTarifa: number;
  incentivoProfesional: number; // Bonificacion para el estilista que acepta la cita urgente
  ajusteAbsorbidoPorSalon: boolean;
}

const MULTIPLICADOR_CATEGORIA: Record<string, number> = {
  junior: 0.9,
  estandar: 1.0,
  senior: 1.15,
  master: 1.30,
};

export function calcularAjusteReasignacion(d: DatosReasignacion): ResultadoCalculoReasignacion {
  const multOrig = MULTIPLICADOR_CATEGORIA[d.categoriaProfOriginal] || 1.0;
  const multNuevo = MULTIPLICADOR_CATEGORIA[d.categoriaProfNuevo] || 1.0;

  const precioTeoricoOriginal = Math.round(d.precioBaseServicio * multOrig * 100) / 100;
  const precioTeoricoNuevo = Math.round(d.precioBaseServicio * multNuevo * 100) / 100;

  const diferencia = Math.round((precioTeoricoNuevo - precioTeoricoOriginal) * 100) / 100;

  let precioFinalCliente = precioTeoricoOriginal;
  let ajusteAbsorbidoPorSalon = false;

  if (!d.respetarPrecioOriginal && diferencia > 0) {
    precioFinalCliente = precioTeoricoNuevo;
  } else if (diferencia > 0) {
    ajusteAbsorbidoPorSalon = true;
  }

  // Incentivo fijo de 3€ para el profesional que absorbe el cambio inesperado
  const incentivoProfesional = 3.00;

  return {
    precioFinalCliente,
    diferenciaTarifa: diferencia,
    incentivoProfesional,
    ajusteAbsorbidoPorSalon,
  };
}
