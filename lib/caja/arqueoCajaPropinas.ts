/**
 * Subtarea 1.2: Motor de Arqueo de Caja con Desglose de Propinas por Estilista
 */

export interface PropinaEstilista {
  profesionalId: string;
  profesionalNombre: string;
  monto: number;
}

export interface ArqueoCajaTicket {
  ticketId: string;
  total: number;
  metodoPago: 'efectivo' | 'tarjeta' | 'stripe';
  propinas: PropinaEstilista[];
}

export interface ResumenArqueoCaja {
  totalEfectivo: number;
  totalTarjeta: number;
  totalStripe: number;
  totalPropinas: number;
  propinasPorProfesional: Record<string, { nombre: string; totalPropinas: number }>;
}

export function calcularArqueoCaja(tickets: ArqueoCajaTicket[]): ResumenArqueoCaja {
  let totalEfectivo = 0;
  let totalTarjeta = 0;
  let totalStripe = 0;
  let totalPropinas = 0;
  const propinasMap: Record<string, { nombre: string; totalPropinas: number }> = {};

  for (const t of tickets || []) {
    if (t.metodoPago === 'efectivo') totalEfectivo += t.total;
    else if (t.metodoPago === 'tarjeta') totalTarjeta += t.total;
    else if (t.metodoPago === 'stripe') totalStripe += t.total;

    for (const prop of t.propinas || []) {
      totalPropinas += prop.monto;
      if (!propinasMap[prop.profesionalId]) {
        propinasMap[prop.profesionalId] = { nombre: prop.profesionalNombre, totalPropinas: 0 };
      }
      propinasMap[prop.profesionalId].totalPropinas += prop.monto;
    }
  }

  return {
    totalEfectivo: Math.round(totalEfectivo * 100) / 100,
    totalTarjeta: Math.round(totalTarjeta * 100) / 100,
    totalStripe: Math.round(totalStripe * 100) / 100,
    totalPropinas: Math.round(totalPropinas * 100) / 100,
    propinasPorProfesional: propinasMap,
  };
}
