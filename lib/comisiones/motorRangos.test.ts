import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

export interface TramoComision {
  hastaEuros: number | null; // null = infinito
  porcentaje: number;
}

export function calcularComisionTramos(facturacionTotal: number, tramos: TramoComision[]): number {
  if (facturacionTotal <= 0 || !tramos || tramos.length === 0) return 0;

  let comisionAcumulada = 0;
  let facturacionRestante = facturacionTotal;
  let cotaAnterior = 0;

  const ordenados = [...tramos].sort((a, b) => {
    if (a.hastaEuros === null) return 1;
    if (b.hastaEuros === null) return -1;
    return a.hastaEuros - b.hastaEuros;
  });

  for (const tramo of ordenados) {
    if (facturacionRestante <= 0) break;

    const limiteSuperior = tramo.hastaEuros !== null ? tramo.hastaEuros : Infinity;
    const anchoTramo = limiteSuperior - cotaAnterior;

    const baseEnTramo = Math.min(facturacionRestante, anchoTramo);
    comisionAcumulada += baseEnTramo * (tramo.porcentaje / 100);

    facturacionRestante -= baseEnTramo;
    cotaAnterior = limiteSuperior;
  }

  return Math.round(comisionAcumulada * 100) / 100;
}

Deno.test('comision 0 si no hay facturacion', () => {
  const tramos: TramoComision[] = [
    { hastaEuros: 1000, porcentaje: 10 },
    { hastaEuros: null, porcentaje: 20 },
  ];
  assertEquals(calcularComisionTramos(0, tramos), 0);
});

Deno.test('comision dentro del primer tramo', () => {
  const tramos: TramoComision[] = [
    { hastaEuros: 1000, porcentaje: 10 },
    { hastaEuros: null, porcentaje: 20 },
  ];
  assertEquals(calcularComisionTramos(500, tramos), 50);
});

Deno.test('comision progresiva cruzando dos tramos', () => {
  const tramos: TramoComision[] = [
    { hastaEuros: 1000, porcentaje: 10 }, // 1000 * 0.10 = 100
    { hastaEuros: null, porcentaje: 20 }, // 1000 * 0.20 = 200
  ];
  assertEquals(calcularComisionTramos(2000, tramos), 300);
});

Deno.test('comision progresiva en tres tramos', () => {
  const tramos: TramoComision[] = [
    { hastaEuros: 1000, porcentaje: 10 }, // 100
    { hastaEuros: 3000, porcentaje: 15 }, // 2000 * 0.15 = 300
    { hastaEuros: null, porcentaje: 25 }, // 1000 * 0.25 = 250
  ];
  // Facturacion 4000: 100 + 300 + 250 = 650
  assertEquals(calcularComisionTramos(4000, tramos), 650);
});
