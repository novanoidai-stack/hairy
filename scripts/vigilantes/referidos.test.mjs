import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { TABLA_REFERIDOS } from './referidos.mjs';

test('la tabla declarada es la que se fijo el 23 ago 2026', () => {
  assert.deepEqual(TABLA_REFERIDOS, { nivel1: 10, nivel2: 4, nivel3: 2, tope: 30, bienvenida: 15 });
});

test('hoy los cuatro sitios cuadran', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
