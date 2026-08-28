import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './cache-app.mjs';

test('vercel.json sigue cacheando los estaticos de /app', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
