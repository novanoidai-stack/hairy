// Tests de los vigilantes de sistema de BD (triggers-ciegos, sobrecargas-rpc,
// escritura-critica). Son puentes a funciones SQL: aqui solo se valida el
// CONTRATO, agnostico del entorno (con credencial en .env llaman a produccion,
// sin credencial deben avisar y no reventar).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hayCredencial } from './bd-comun.mjs';
import bdTriggersCiegos from './bd-triggers-ciegos.mjs';
import bdSobrecargasRpc from './bd-sobrecargas-rpc.mjs';
import bdEscrituraCritica from './bd-escritura-critica.mjs';

const casos = [
  [bdTriggersCiegos, 'bd-triggers-ciegos', 'vigilancia_bd_triggers_ciegos'],
  [bdSobrecargasRpc, 'bd-sobrecargas-rpc', 'vigilancia_bd_sobrecargas_rpc'],
  [bdEscrituraCritica, 'bd-escritura-critica', 'vigilancia_bd_escritura_critica'],
];

for (const [vigilante, nombre, rpc] of casos) {
  describe(nombre, () => {
    it('exporta nombre, ambito y ejecutar', () => {
      assert.equal(vigilante.nombre, nombre);
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

      // Con credencial: la migracion puede no estar aplicada aun, y eso no es
      // un fallo del vigilante — pero tiene que fallar RUIDOSAMENTE nombrando
      // la funcion, nunca devolver un verde por accidente.
      try {
        const h = await vigilante.ejecutar();
        assert.ok(Array.isArray(h));
        for (const x of h) {
          assert.ok(x.clave && x.titulo && x.nivel && x.ambito);
          assert.equal(x.ambito, 'base-de-datos');
        }
      } catch (e) {
        assert.match(e.message, new RegExp(rpc));
      }
    });
  });
}
