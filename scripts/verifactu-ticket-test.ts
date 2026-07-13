/**
 * scripts/verifactu-ticket-test.ts
 * Smoke test de generacion de URL de cotejo (QR) para impresion en ticket.
 */

import { generarUrlCotejoAEAT } from '../lib/fiscal/qr';

function imprimirTicketSimulado() {
  const params = {
    entorno: 'preproduccion' as const,
    nifEmisor: 'B12345678',
    numSerieFactura: 'A/2026/000001',
    fechaExpedicion: '13-07-2026',
    importeTotal: '123.45',
  };

  const url = generarUrlCotejoAEAT(params);

  console.log('====================================');
  console.log('         NOVA BEAUTY SALON          ');
  console.log('          NIF: B12345678            ');
  console.log('====================================');
  console.log(` Factura Simplificada: ${params.numSerieFactura}`);
  console.log(` Fecha: ${params.fechaExpedicion}`);
  console.log('------------------------------------');
  console.log(' 1x Corte de Pelo             23.45');
  console.log(' 1x Tinte                    100.00');
  console.log('------------------------------------');
  console.log(` TOTAL                     ${params.importeTotal} €`);
  console.log('====================================');
  console.log(' Escanee el siguiente codigo QR para ');
  console.log(' cotejar esta factura en la AEAT:    ');
  console.log('');
  console.log(` [ QR DATA: ${url} ] `);
  console.log('');
  console.log('====================================');
}

if (require.main === module) {
  imprimirTicketSimulado();
}
