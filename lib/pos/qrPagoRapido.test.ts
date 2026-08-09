import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { generarPayloadQRPago, type DatosCobroQR } from './qrPagoRapido.ts';

Deno.test('genera URL de checkout y payload Bizum correctamente', () => {
  const d: DatosCobroQR = {
    ticketId: 't-9988',
    salonSlug: 'mecha-madrid',
    importeTotalEuros: 42.50,
    concepto: 'Corte + Peinado',
  };

  const res = generarPayloadQRPago(d, 10);
  assertEquals(res.urlCheckout.includes('ticket=t-9988'), true);
  assertEquals(res.urlCheckout.includes('total=42.50'), true);
  assertEquals(res.payloadBizum, 'BIZUM|mecha-madrid|t-9988|42.50|EUR');
  assertEquals(typeof res.expiracionISO, 'string');
});
