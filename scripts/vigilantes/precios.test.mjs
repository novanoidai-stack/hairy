import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './precios.mjs';

test('lee la fuente de verdad de lib/planes.ts', async () => {
  const p = await vigilante.precios();
  assert.deepEqual(p, { esencial: 39, estudio: 59, whatsapp: 19, voz: 29, completa: 39 });
});

test('hoy los tres sitios cuadran', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
