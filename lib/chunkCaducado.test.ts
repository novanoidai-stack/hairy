// Ejecutar: deno test --allow-read --allow-env --sloppy-imports --no-check lib/chunkCaducado.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { esChunkCaducado } from './chunkCaducado.ts';

// Este detector solo sirve si reconoce lo que los navegadores dicen DE VERDAD.
// Estuvo un tiempo sin reconocer la redaccion de Firefox y el precio lo pagaron
// tres salones: pantalla rota tras un despliegue en vez de una recarga. Los
// casos de abajo son textos copiados de errores_cliente, no inventados.

Deno.test('reconoce los mensajes vistos en produccion', () => {
  const reales = [
    'Loading module https://www.mechaa.es/app/_expo/static/js/web/mi-jornada-4ca253cae9b2a8695ac72dac41ab0d15.js failed.\n(error: https://www.mechaa.es/app/_expo/static/js/web/mi-jornada-4ca253cae9b2a8695ac72dac41ab0d15.js)',
    'Loading module https://www.mechaa.es/app/_expo/static/js/web/equipo-2213ed051bd2ad75f356b097fd6fc321.js failed.\n(error: https://www.mechaa.es/app/_expo/static/js/web/equipo-2213ed051bd2ad75f356b097fd6fc321.js)',
    'Loading module https://www.mechaa.es/app/_expo/static/js/web/configuracion-6bc1c33d1665e34ec666fd4c111e479b.js failed.\n(error: https://www.mechaa.es/app/_expo/static/js/web/configuracion-6bc1c33d1665e34ec666fd4c111e479b.js)',
  ];
  for (const mensaje of reales) {
    assert(esChunkCaducado(mensaje), `no reconocido: ${mensaje.slice(0, 60)}`);
    assert(esChunkCaducado(new Error(mensaje)), 'no reconocido como Error');
  }
});

Deno.test('reconoce las redacciones del resto de navegadores', () => {
  for (
    const mensaje of [
      'Failed to fetch dynamically imported module: https://x/y.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 42 failed.',
      'Loading CSS chunk 7 failed.',
      'Unable to preload CSS for /assets/x.css',
    ]
  ) {
    assert(esChunkCaducado(mensaje), `no reconocido: ${mensaje}`);
  }
});

Deno.test('no confunde un error cualquiera con un despliegue', () => {
  // Recargar por estos seria esconderle al usuario un fallo que sigue ahi.
  for (
    const mensaje of [
      'Cannot read properties of undefined (reading \'inicio\')',
      'permission denied for function jornada_config',
      'Failed to fetch',
      'column clientes.apellidos does not exist',
      '',
    ]
  ) {
    assertEquals(esChunkCaducado(mensaje), false, `falso positivo: ${mensaje}`);
  }
  assertEquals(esChunkCaducado(null), false);
  assertEquals(esChunkCaducado(undefined), false);
  assertEquals(esChunkCaducado({}), false);
});
