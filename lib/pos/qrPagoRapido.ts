/**
 * Pasada 2 / Micro-Tarea D10: Generador de Payload y URL de Código QR para Pago Rápido Bizum/Stripe
 * Permite mostrar un código QR dinámico en la pantalla del salón o teléfono del cliente para cobrar al instante.
 */

export interface DatosCobroQR {
  ticketId: string;
  salonSlug: string;
  importeTotalEuros: number;
  concepto: string;
}

export interface PayloadQRPago {
  urlCheckout: string;
  payloadBizum: string;
  expiracionISO: string;
}

export function generarPayloadQRPago(d: DatosCobroQR, minutosValidez: number = 15): PayloadQRPago {
  const expDate = new Date(Date.now() + minutosValidez * 60 * 1000);
  const totalFormat = (d.importeTotalEuros || 0).toFixed(2);

  const urlCheckout = `https://mecha.app/r/${d.salonSlug}/pagar?ticket=${encodeURIComponent(d.ticketId)}&total=${totalFormat}`;
  const payloadBizum = `BIZUM|${d.salonSlug}|${d.ticketId}|${totalFormat}|EUR`;

  return {
    urlCheckout,
    payloadBizum,
    expiracionISO: expDate.toISOString(),
  };
}
