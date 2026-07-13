import { calcularHuella } from './huella';

// Puedes usar Deno.test o Jest dependiendo del runner que tenga el proyecto, 
// lo definimos con el vector de oro
async function runTest() {
  const params = {
    idEmisor: '89890001K',
    numSerieFactura: '12345678/G33',
    fechaExpedicion: '01-01-2024',
    tipoFactura: 'F1',
    cuotaTotal: '12.35',
    importeTotal: '123.45',
    huellaAnterior: '',
    fechaHoraRegistro: '2024-01-01T19:20:30+01:00'
  };

  const huella = await calcularHuella(params);
  const golden = '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60';

  if (huella === golden) {
    console.log('✅ TEST VECTOR ORO SUPERADO: ' + huella);
  } else {
    console.error('❌ TEST FALLIDO');
    console.error('Esperado: ' + golden);
    console.error('Obtenido: ' + huella);
    process.exit(1);
  }
}

runTest();
