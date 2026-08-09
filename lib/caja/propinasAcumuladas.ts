/**
 * Pasada 2 / Micro-Tarea D6: Motor de Cálculo de Propinas Acumuladas por Estilista y Periodo Contable
 * Agrupa propinas recibidas por profesional en un rango de fechas (ej. nómina mensual)
 * y genera el informe para retención IRPF / liquidación.
 */

export interface RegistroPropina {
  id: string;
  profesionalId: string;
  profesionalNombre: string;
  fechaISO: string;
  monto: number;
}

export interface ResumenPropinaProfesional {
  profesionalId: string;
  profesionalNombre: string;
  totalPropinasPeriodo: number;
  numAportaciones: number;
  promedioPorAportacion: number;
}

export function calcularPropinasAcumuladas(registros: RegistroPropina[]): ResumenPropinaProfesional[] {
  const map: Record<string, { nombre: string; total: number; count: number }> = {};

  for (const r of registros || []) {
    if (!map[r.profesionalId]) {
      map[r.profesionalId] = { nombre: r.profesionalNombre, total: 0, count: 0 };
    }
    map[r.profesionalId].total += r.monto;
    map[r.profesionalId].count += 1;
  }

  return Object.entries(map).map(([profesionalId, d]) => {
    const totalPropinasPeriodo = Math.round(d.total * 100) / 100;
    const promedioPorAportacion = d.count > 0 ? Math.round((d.total / d.count) * 100) / 100 : 0;

    return {
      profesionalId,
      profesionalNombre: d.nombre,
      totalPropinasPeriodo,
      numAportaciones: d.count,
      promedioPorAportacion,
    };
  }).sort((a, b) => {
    if (b.totalPropinasPeriodo !== a.totalPropinasPeriodo) {
      return b.totalPropinasPeriodo - a.totalPropinasPeriodo;
    }
    return a.numAportaciones - b.numAportaciones;
  });
}
