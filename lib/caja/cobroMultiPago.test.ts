import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validarCobroMultiPago, type DetalleCobroTicket } from './cobroMultiPago.ts';

Deno.test('cobro exacto en efectivo y tarjeta es valido', () => {
  const ticket: DetalleCobroTicket = {
    ticketId: 't1',
    subtotalBruto: 50.00,
    tipoIvaPorcentaje: 21,
    pagos: [
      { metodo: 'efectivo', importe: 20.00 },
      { metodo: 'tarjeta', importe: 30.00 },
    ],
  };
  const res = validarCobroMultiPago(ticket);
  assertEquals(res.validado, true);
  assertEquals(res.totalPagado, 50.00);
  assertEquals(res.diferencia, 0);
  assertEquals(res.baseImponible, 41.32);
  assertEquals(res.cuotaIva, 8.68);
});

Deno.test('cobro insuficiente reporta error con importe faltante', () => {
  const ticket: DetalleCobroTicket = {
    ticketId: 't2',
    subtotalBruto: 100.00,
    tipoIvaPorcentaje: 21,
    pagos: [
      { metodo: 'tarjeta', importe: 60.00 },
    ],
  };
  const res = validarCobroMultiPago(ticket);
  assertEquals(res.validado, false);
  assertEquals(res.diferencia, -40.00);
  assertEquals(res.errores.length, 1);
});

Deno.test('cobro con sobrepago devuelve cambio positivo', () => {
  const ticket: DetalleCobroTicket = {
    ticketId: 't3',
    subtotalBruto: 45.00,
    tipoIvaPorcentaje: 21,
    pagos: [
      { metodo: 'efectivo', importe: 50.00 },
    ],
  };
  const res = validarCobroMultiPago(ticket);
  assertEquals(res.validado, true);
  assertEquals(res.diferencia, 5.00);
});
