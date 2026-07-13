import { generarUrlCotejoAEAT } from './qr';

function runTest() {
  const urlPre = generarUrlCotejoAEAT({
    entorno: 'preproduccion',
    nifEmisor: 'B12345678',
    numSerieFactura: 'A/2026/000001',
    fechaExpedicion: '13-07-2026',
    importeTotal: '123.45'
  });

  const urlProd = generarUrlCotejoAEAT({
    entorno: 'produccion',
    nifEmisor: 'B12345678',
    numSerieFactura: 'A/2026/000001',
    fechaExpedicion: '13-07-2026',
    importeTotal: '123.45'
  });

  console.log('Preproduccion:', urlPre);
  console.log('Produccion:', urlProd);

  if (!urlPre.includes('prewww2.aeat.es')) throw new Error('Error en preprod URL');
  if (!urlProd.includes('www2.agenciatributaria.gob.es')) throw new Error('Error en prod URL');

  console.log('✅ TEST QR SUPERADO');
}

runTest();
