/**
 * Subtarea 1.1: Motor de Validación de Cobro Multi-pago y Desglose de IVA
 */

export interface PagoDesglosado {
  metodo: 'efectivo' | 'tarjeta' | 'stripe' | 'bono' | 'puntos';
  importe: number;
}

export interface DetalleCobroTicket {
  ticketId: string;
  subtotalBruto: number;
  tipoIvaPorcentaje: number; // ej. 21 para peluqueria/estetica en España
  pagos: PagoDesglosado[];
}

export interface ResultadoCobroValidado {
  validado: boolean;
  totalPagado: number;
  totalRequerido: number;
  diferencia: number;
  baseImponible: number;
  cuotaIva: number;
  errores: string[];
}

export function validarCobroMultiPago(ticket: DetalleCobroTicket): ResultadoCobroValidado {
  const errores: string[] = [];
  
  const totalPagado = Math.round((ticket.pagos || []).reduce((acc, p) => acc + (p.importe || 0), 0) * 100) / 100;
  const totalRequerido = Math.round(ticket.subtotalBruto * 100) / 100;
  const diferencia = Math.round((totalPagado - totalRequerido) * 100) / 100;

  if (diferencia < 0) {
    errores.push(`Importe insuficiente. Faltan ${Math.abs(diferencia).toFixed(2)}€`);
  }

  // Calculo de base e IVA
  const factor = 1 + (ticket.tipoIvaPorcentaje / 100);
  const baseImponible = Math.round((totalRequerido / factor) * 100) / 100;
  const cuotaIva = Math.round((totalRequerido - baseImponible) * 100) / 100;

  return {
    validado: errores.length === 0,
    totalPagado,
    totalRequerido,
    diferencia,
    baseImponible,
    cuotaIva,
    errores,
  };
}
