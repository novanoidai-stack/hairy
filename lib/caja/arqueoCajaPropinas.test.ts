import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularArqueoCaja, type ArqueoCajaTicket } from './arqueoCajaPropinas.ts';

Deno.test('arqueo calcula correctamente efectivo, tarjeta y propinas por estilista', () => {
  const tickets: ArqueoCajaTicket[] = [
    {
      ticketId: 't1',
      total: 30,
      metodoPago: 'efectivo',
      propinas: [{ profesionalId: 'p1', profesionalNombre: 'Carlos', monto: 5 }],
    },
    {
      ticketId: 't2',
      total: 70,
      metodoPago: 'tarjeta',
      propinas: [
        { profesionalId: 'p1', profesionalNombre: 'Carlos', monto: 3 },
        { profesionalId: 'p2', profesionalNombre: 'Marta', monto: 4 },
      ],
    },
  ];

  const res = calcularArqueoCaja(tickets);
  assertEquals(res.totalEfectivo, 30);
  assertEquals(res.totalTarjeta, 70);
  assertEquals(res.totalPropinas, 12);
  assertEquals(res.propinasPorProfesional['p1'].totalPropinas, 8);
  assertEquals(res.propinasPorProfesional['p2'].totalPropinas, 4);
});
