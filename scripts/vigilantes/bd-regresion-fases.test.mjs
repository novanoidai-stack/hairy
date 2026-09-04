// Tests del vigilante de regresion de fases (paso 3 de la spec 1). Es un puente
// a una funcion SQL: aqui solo se valida el CONTRATO, agnostico del entorno
// (con credencial en .env llama a produccion, sin credencial avisa y no revienta).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hayCredencial } from './bd-comun.mjs';
import vigilante from './bd-regresion-fases.mjs';

describe('bd-regresion-fases', () => {
  it('exporta nombre, ambito y ejecutar', () => {
    assert.equal(vigilante.nombre, 'bd-regresion-fases');
    assert.equal(vigilante.ambito, 'base-de-datos');
    assert.equal(typeof vigilante.ejecutar, 'function');
    assert.equal(vigilante.necesitaRed, true);
  });

  it(hayCredencial()
      ? 'con credencial devuelve hallazgos o un error que nombra la RPC que falta'
      : 'sin credencial devuelve un aviso en vez de reventar', async () => {
    if (!hayCredencial()) {
      const h = await vigilante.ejecutar();
      assert.ok(Array.isArray(h));
      assert.equal(h.length, 1);
      assert.equal(h[0].nivel, 'aviso');
      assert.match(h[0].clave, /sin-credencial/);
      return;
    }

    // Con credencial: la foto intacta es 0 hallazgos (verde silencioso), y la
    // migracion 20260904190000 puede no estar aplicada aun — entonces tiene
    // que fallar RUIDOSOSAMENTE nombrando la funcion, nunca un verde por
    // accidente.
    try {
      const h = await vigilante.ejecutar();
      assert.ok(Array.isArray(h));
      for (const x of h) {
        assert.ok(x.clave && x.titulo && x.nivel && x.ambito);
        assert.equal(x.ambito, 'base-de-datos');
      }
      // Foto intacta = 0 filas; solo hay hallazgos si hay duraciones cambiadas,
      // y entonces todas son bloqueantes (el tripwire del paso 4).
      for (const x of h) {
        assert.equal(x.nivel, 'bloqueante');
      }
    } catch (e) {
      assert.match(e.message, /regresion_citas_fases_v2/);
    }
  });
});
