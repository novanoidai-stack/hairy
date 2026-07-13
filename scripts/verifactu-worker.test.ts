import { VerifactuClient } from './verifactu-worker';

function runTest() {
  try {
    const client = new VerifactuClient('/ruta/falsa/cert.pem', '/ruta/falsa/key.pem');
    console.error('❌ Deberia haber fallado por falta de certificados');
    process.exit(1);
  } catch (error: any) {
    if (error.message.includes('no encontrados')) {
      console.log('✅ TEST WORKER INSTANCE SUPERADO (Maneja error de certificados)');
    } else {
      console.error('❌ Error inesperado: ', error);
      process.exit(1);
    }
  }
}

runTest();
