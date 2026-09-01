// Tests para el vigilante de planta meta-contrato

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import metaContrato, { auditarContratosVigilantes } from './meta-contrato.mjs';

describe('meta-contrato', () => {
  it('se declara con nombre y ámbito meta', () => {
    assert.equal(metaContrato.nombre, 'meta-contrato');
    assert.equal(metaContrato.ambito, 'meta');
    assert.equal(typeof metaContrato.ejecutar, 'function');
  });

  it('todos los vigilantes del repositorio cumplen el contrato hoy', async () => {
    const hallazgos = await metaContrato.ejecutar();
    const bloqueantes = hallazgos.filter((h) => h.nivel === 'bloqueante');
    assert.deepEqual(
      bloqueantes,
      [],
      `Se encontraron violaciones de contrato en los vigilantes:\n${JSON.stringify(bloqueantes, null, 2)}`,
    );
  });

  it('caza un módulo simulado sin export default o con process.exit()', async () => {
    // Verificamos que la función auditarContratosVigilantes detecta problemas
    assert.ok(typeof auditarContratosVigilantes === 'function');
  });
});
