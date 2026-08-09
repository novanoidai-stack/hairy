/**
 * Pasada 2 / Micro-Tarea D15: Motor de Liquidación Automatizada de Nóminas por Estilista
 * Consolida salario base contractual, comisiones por tramos de facturación alcanzados y propinas netas del mes.
 */

export interface EntradasNominaProfesional {
  profesionalId: string;
  profesionalNombre: string;
  salarioBaseEuros: number;
  totalComisionesCalculadas: number;
  totalPropinasAcumuladas: number;
  retencionIrpfPorcentaje: number; // ej. 15%
}

export interface LiquidacionNominaCalculada {
  profesionalId: string;
  profesionalNombre: string;
  totalDevengadoBruto: number; // Salario base + comisiones + propinas
  cuotaRetencionIrpf: number;
  liquidoAPercibirNeto: number;
}

export function calcularLiquidacionNomina(e: EntradasNominaProfesional): LiquidacionNominaCalculada {
  const base = Math.max(e.salarioBaseEuros || 0, 0);
  const comisiones = Math.max(e.totalComisionesCalculadas || 0, 0);
  const propinas = Math.max(e.totalPropinasAcumuladas || 0, 0);

  const totalDevengadoBruto = Math.round((base + comisiones + propinas) * 100) / 100;
  
  const pctIrpf = Math.max(e.retencionIrpfPorcentaje || 0, 0) / 100;
  const cuotaRetencionIrpf = Math.round((totalDevengadoBruto * pctIrpf) * 100) / 100;

  const liquidoAPercibirNeto = Math.round((totalDevengadoBruto - cuotaRetencionIrpf) * 100) / 100;

  return {
    profesionalId: e.profesionalId,
    profesionalNombre: e.profesionalNombre,
    totalDevengadoBruto,
    cuotaRetencionIrpf,
    liquidoAPercibirNeto,
  };
}
