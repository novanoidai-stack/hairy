import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { proyectarComprasStock, type ConsumoHistoricoProducto } from './proyeccionCompras.ts';

Deno.test('proyecta 15 dias de autonomia con consumo de 2u/dia y requiere pedido si proveedor tarda 15 dias', () => {
  const p: ConsumoHistoricoProducto = {
    productoId: 'p10',
    nombreProducto: 'Tinte 6.0 Rubio Oscuro 60ml',
    stockActual: 30, // 30 / 2u/dia = 15 dias
    unidadesConsumidasUltimos30Dias: 60, // 2u/dia
    diasDemoraProveedor: 15,
  };

  const res = proyectarComprasStock(p);
  assertEquals(res.consumoDiarioPromedio, 2);
  assertEquals(res.diasAutonomiaRestantes, 15);
  assertEquals(res.requierePedidoInmediato, true);
});

Deno.test('proyecta autonomia holgada de 30 dias si el proveedor tarda solo 3 dias', () => {
  const p: ConsumoHistoricoProducto = {
    productoId: 'p11',
    nombreProducto: 'Laca Fuerte 500ml',
    stockActual: 30,
    unidadesConsumidasUltimos30Dias: 30, // 1u/dia -> 30 dias
    diasDemoraProveedor: 3,
  };

  const res = proyectarComprasStock(p);
  assertEquals(res.consumoDiarioPromedio, 1);
  assertEquals(res.diasAutonomiaRestantes, 30);
  assertEquals(res.requierePedidoInmediato, false);
});
