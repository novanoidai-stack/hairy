/**
 * Pasada 2 / Micro-Tarea D13: Motor de Estimación de Demanda y Proyección de Compras de Stock
 * Analiza el ritmo de consumo de producto de los últimos 30 días y estima la fecha en que se agotará el stock,
 * calculando la fecha óptima para emitir el pedido al proveedor.
 */

export interface ConsumoHistoricoProducto {
  productoId: string;
  nombreProducto: string;
  stockActual: number;
  unidadesConsumidasUltimos30Dias: number;
  diasDemoraProveedor: number; // Días que tarda el proveedor en entregar el pedido
}

export interface ProyeccionCompraCalculada {
  productoId: string;
  nombreProducto: string;
  consumoDiarioPromedio: number;
  diasAutonomiaRestantes: number;
  fechaProyectadaAgotamientoISO: string;
  fechaLimiteEmitirPedidoISO: string;
  requierePedidoInmediato: boolean;
}

export function proyectarComprasStock(p: ConsumoHistoricoProducto): ProyeccionCompraCalculada {
  const consumoDiarioPromedio = Math.round((p.unidadesConsumidasUltimos30Dias / 30) * 100) / 100;
  
  // Evitar división por cero si no hay consumo
  const tasaConsumo = consumoDiarioPromedio > 0 ? consumoDiarioPromedio : 0.01;
  const diasAutonomiaRestantes = Math.floor(p.stockActual / tasaConsumo);

  const nowMs = Date.now();
  const fechaAgotamientoMs = nowMs + (diasAutonomiaRestantes * 24 * 60 * 60 * 1000);
  const fechaProyectadaAgotamientoISO = new Date(fechaAgotamientoMs).toISOString();

  // Fecha límite = fecha agotamiento - días de demora del proveedor
  const diasHastaPedido = Math.max(diasAutonomiaRestantes - p.diasDemoraProveedor, 0);
  const fechaLimiteMs = nowMs + (diasHastaPedido * 24 * 60 * 60 * 1000);
  const fechaLimiteEmitirPedidoISO = new Date(fechaLimiteMs).toISOString();

  const requierePedidoInmediato = diasAutonomiaRestantes <= p.diasDemoraProveedor;

  return {
    productoId: p.productoId,
    nombreProducto: p.nombreProducto,
    consumoDiarioPromedio,
    diasAutonomiaRestantes,
    fechaProyectadaAgotamientoISO,
    fechaLimiteEmitirPedidoISO,
    requierePedidoInmediato,
  };
}
