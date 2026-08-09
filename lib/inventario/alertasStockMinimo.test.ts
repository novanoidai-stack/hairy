import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluarAlertasStock, type ProductoInventario } from './alertasStockMinimo.ts';

Deno.test('producto agotado genera alerta critica con sugerencia de pedido completa', () => {
  const productos: ProductoInventario[] = [
    {
      id: 'p1',
      nombre: 'Oxigenada 20 vol 1000ml',
      categoria: 'tinte',
      stockActual: 0,
      stockMinimoDeseado: 5,
      unidadesPorPedidoProveedor: 6, // Cajas de 6
    },
  ];

  const res = evaluarAlertasStock(productos);
  assertEquals(res.length, 1);
  assertEquals(res[0].nivelRiesgo, 'critico');
  assertEquals(res[0].unidadesSugeridasPedido, 6); // 1 caja de 6 cubre las 5 faltantes
  assertEquals(res[0].mensajeAlerta.includes('URGENTE'), true);
});

Deno.test('producto con stock normal no genera alerta', () => {
  const productos: ProductoInventario[] = [
    {
      id: 'p2',
      nombre: 'Champú Matizador Violeta 500ml',
      categoria: 'retail_venta',
      stockActual: 10,
      stockMinimoDeseado: 4,
      unidadesPorPedidoProveedor: 6,
    },
  ];

  const res = evaluarAlertasStock(productos);
  assertEquals(res.length, 0);
});
