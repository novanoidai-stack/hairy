// Tests para el vigilante de planta meta-mutaciones

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import metaMutaciones, { probarMutaciones } from './meta-mutaciones.mjs';

describe('meta-mutaciones', () => {
  it('se declara con nombre y ámbito meta', () => {
    assert.equal(metaMutaciones.nombre, 'meta-mutaciones');
    assert.equal(metaMutaciones.ambito, 'meta');
    assert.equal(typeof metaMutaciones.ejecutar, 'function');
  });

  it('todas las mutaciones inyectadas son detectadas por los vigilantes (0 sordos)', async () => {
    const hallazgos = await metaMutaciones.ejecutar();
    const bloqueantes = hallazgos.filter((h) => h.nivel === 'bloqueante');
    assert.deepEqual(
      bloqueantes,
      [],
      `Hay vigilantes que no reaccionan ante fallos inyectados:\n${JSON.stringify(bloqueantes, null, 2)}`,
    );
  });
});
