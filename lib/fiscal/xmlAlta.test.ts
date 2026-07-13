import { generarXmlAlta } from './xmlAlta';

function runTest() {
  const xml = generarXmlAlta({
    idEmisor: '89890001K',
    nombreEmisor: 'Salon Belleza',
    numSerieFactura: 'A/2026/000001',
    fechaExpedicion: '13-07-2026',
    tipoFactura: 'F2',
    baseImponible: '10.00',
    tipoIva: '21.00',
    cuotaIva: '2.10',
    importeTotal: '12.10',
    huella: 'ABCDEF',
    fechaHoraHusoGenRegistro: '2026-07-13T12:00:00+01:00',
    qrUrl: 'https://test.aeat'
  }, {
    nifColaborador: 'B00000000',
    nombreColaborador: 'Novanoid AI S.L.',
    esColaboradorSocial: true
  });

  if (!xml.includes('89890001K') || !xml.includes('Novanoid AI S.L.') || !xml.includes('Representante')) {
    throw new Error('El XML no se ha generado correctamente con el Colaborador Social');
  }

  console.log('✅ TEST XML ALTA SUPERADO');
  console.log(xml.substring(0, 150) + '...');
}

runTest();
