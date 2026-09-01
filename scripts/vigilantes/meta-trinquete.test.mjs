// Tests para el vigilante de planta meta-trinquete

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import metaTrinquete, { evaluarTrinquete } from './meta-trinquete.mjs';

describe('meta-trinquete', () => {
  it('se declara con nombre y ámbito meta', () => {
    assert.equal(metaTrinquete.nombre, 'meta-trinquete');
    assert.equal(metaTrinquete.ambito, 'meta');
    assert.equal(typeof metaTrinquete.ejecutar, 'function');
  });

  it('bloquea si el número de avisos supera el límite', () => {
    const hallazgos = evaluarTrinquete(50, 42);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0].nivel, 'bloqueante');
    assert.ok(hallazgos[0].titulo.includes('Deuda técnica desbordada'));
  });

  it('pasa limpio si los avisos están dentro o por debajo de la línea base', () => {
    const hallazgos = evaluarTrinquete(35, 42);
    assert.equal(hallazgos.length, 0);
  });
});
