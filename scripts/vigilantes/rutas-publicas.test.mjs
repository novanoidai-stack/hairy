import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { RUTAS_PUBLICAS_ESPERADAS } from './rutas-publicas.mjs';

test('la lista esperada es la de hoy', () => {
  assert.deepEqual(
    [...RUTAS_PUBLICAS_ESPERADAS].sort(),
    ['cita', 'contacto', 'pagar', 'pago', 'presupuesto', 'r', 'resena'],
  );
});

test('app/_layout.tsx dice exactamente eso', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
