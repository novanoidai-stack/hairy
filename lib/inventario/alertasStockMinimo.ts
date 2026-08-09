/**
 * Pasada 2 / Micro-Tarea D9: Validador de Stock Mínimo y Alertas de Reposición en Almacén
 * Evalúa las existencias de productos de tocador (tintes, oxidantes, champús) y venta al público,
 * generando alertas preventivas antes de que se agoten en horas de alta demanda.
 */

export interface ProductoInventario {
  id: string;
  nombre: string;
  categoria: 'tinte' | 'decolorante' | 'trataminto' | 'retail_venta';
  stockActual: number;
  stockMinimoDeseado: number;
  unidadesPorPedidoProveedor: number;
}

export interface AlertaStockCalculada {
  productoId: string;
  nombreProducto: string;
  stockActual: number;
  stockMinimoDeseado: number;
  nivelRiesgo: 'critico' | 'bajo' | 'normal';
  unidadesSugeridasPedido: number;
  mensajeAlerta: string;
}

export function evaluarAlertasStock(productos: ProductoInventario[]): AlertaStockCalculada[] {
  const result: AlertaStockCalculada[] = [];

  for (const p of productos || []) {
    if (p.stockActual <= p.stockMinimoDeseado) {
      const esCritico = p.stockActual === 0 || p.stockActual <= Math.floor(p.stockMinimoDeseado / 2);
      const nivelRiesgo = esCritico ? 'critico' : 'bajo';
      const deficiencia = p.stockMinimoDeseado - p.stockActual;
      const paquetesNecesarios = Math.ceil(deficiencia / Math.max(p.unidadesPorPedidoProveedor, 1));
      const unidadesSugeridasPedido = paquetesNecesarios * Math.max(p.unidadesPorPedidoProveedor, 1);

      result.push({
        productoId: p.id,
        nombreProducto: p.nombre,
        stockActual: p.stockActual,
        stockMinimoDeseado: p.stockMinimoDeseado,
        nivelRiesgo,
        unidadesSugeridasPedido,
        mensajeAlerta: esCritico
          ? `⚠️ URGENTE: ${p.nombre} agotado o en nivel crítico (${p.stockActual} u. en stock). Pedir ${unidadesSugeridasPedido} u.`
          : `⚡ AVISO: ${p.nombre} por debajo del stock mínimo (${p.stockActual} u. de ${p.stockMinimoDeseado} u.). Pedir ${unidadesSugeridasPedido} u.`,
      });
    }
  }

  return result.sort((a, b) => (a.nivelRiesgo === 'critico' ? -1 : 1));
}
