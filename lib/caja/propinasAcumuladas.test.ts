import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularPropinasAcumuladas, type RegistroPropina } from './propinasAcumuladas.ts';

Deno.test('acumula propinas por estilista y ordena de mayor a menor total', () => {
  const registros: RegistroPropina[] = [
    { id: '1', profesionalId: 'p1', profesionalNombre: 'Ana', fechaISO: '2026-08-01T10:00:00Z', monto: 5 },
    { id: '2', profesionalId: 'p2', profesionalNombre: 'Carlos', fechaISO: '2026-08-01T11:00:00Z', monto: 20 },
    { id: '3', profesionalId: 'p1', profesionalNombre: 'Ana', fechaISO: '2026-08-02T12:00:00Z', monto: 10 },
  ];

  const res = calcularPropinasAcumuladas(registros);
  assertEquals(res.length, 2);

  // Carlos (15€) queda primero
  assertEquals(res[0].profesionalId, 'p2');
  assertEquals(res[0].totalPropinasPeriodo, 20);
  assertEquals(res[0].numAportaciones, 1);

  // Ana (15€ total, 2 aportaciones, media 7.50€)
  assertEquals(res[1].profesionalId, 'p1');
  assertEquals(res[1].totalPropinasPeriodo, 15);
  assertEquals(res[1].numAportaciones, 2);
  assertEquals(res[1].promedioPorAportacion, 7.50);
});
