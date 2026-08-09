import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularLiquidacionNomina, type EntradasNominaProfesional } from './liquidacionNominas.ts';

Deno.test('calcula devolucion bruta y liquido neto aplicando 15% IRPF', () => {
  const e: EntradasNominaProfesional = {
    profesionalId: 'p-1',
    profesionalNombre: 'Sofía Martínez',
    salarioBaseEuros: 1300.00,
    totalComisionesCalculadas: 450.00,
    totalPropinasAcumuladas: 50.00,
    retencionIrpfPorcentaje: 15,
  };

  const res = calcularLiquidacionNomina(e);
  // Bruto: 1300 + 450 + 50 = 1800.00
  // IRPF (15%): 270.00
  // Neto: 1530.00
  assertEquals(res.totalDevengadoBruto, 1800.00);
  assertEquals(res.cuotaRetencionIrpf, 270.00);
  assertEquals(res.liquidoAPercibirNeto, 1530.00);
});
