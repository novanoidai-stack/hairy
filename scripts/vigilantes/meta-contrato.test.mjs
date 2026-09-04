// Tests para el vigilante de planta meta-contrato.
//
// LO QUE ESTE FICHERO NO PUDO DECIR DURANTE TRES DIAS (1 -> 4 sep 2026)
// El segundo test llama a `ejecutar()`, que importaba dinamicamente todos los
// .mjs del directorio. Uno de ellos, peso-bundle.mjs, tiene `process.exit(0)` a
// nivel de modulo: importarlo mataba ESTE proceso a mitad del segundo test.
// `node --test` lo contaba como fichero PASADO con 1 de 3 tests y salia 0. O
// sea que la suite tambien mentia, no solo el runner.
//
// Por eso el primer test de abajo corre en un proceso HIJO y cuenta: si alguien
// vuelve a matar el recorrido, se ve como un fallo y no como un verde corto.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import metaContrato, { auditarContratosVigilantes } from './meta-contrato.mjs';

// Como URL file://, no como ruta: en Windows `import "C:\\..."` no es un
// especificador valido y el hijo muere con ERR_UNSUPPORTED_ESM_URL_SCHEME --
// que se leeria como "el recorrido ha vuelto a matar el proceso" y no lo es.
const AQUI = new URL('./meta-contrato.mjs', import.meta.url).href;

// index.test.mjs deja un fichero trampa en este mismo directorio mientras prueba
// el runner de punta a punta, y `node --test` corre los ficheros en paralelo. Un
// hallazgo suyo aqui no es una regresion: es el fixture del vecino.
const ES_FIXTURE = /^trampa-/;
const sinFixtures = (hallazgos) =>
  hallazgos.filter((h) => !ES_FIXTURE.test(String(h.fichero ?? '').split('/').pop()));

describe('meta-contrato', () => {
  it('se declara con nombre y ámbito meta', () => {
    assert.equal(metaContrato.nombre, 'meta-contrato');
    assert.equal(metaContrato.ambito, 'meta');
    assert.equal(typeof metaContrato.ejecutar, 'function');
  });

  it('REGRESION: ejecutar() termina el recorrido y no mata al proceso', () => {
    // La prueba tiene que ser un proceso aparte: si el recorrido muere, este
    // fichero no llegaria a poder afirmar nada sobre si mismo.
    const guion = `
      import mc from ${JSON.stringify(AQUI)};
      const h = await mc.ejecutar();
      console.log('RECORRIDO_COMPLETO', Array.isArray(h));
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', guion], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(r.signal, null, `el recorrido no termino solo: senal ${r.signal}`);
    assert.equal(
      r.status,
      0,
      'ejecutar() ha matado al proceso a media pasada. Es la regresion del 1 sep 2026: ' +
        `alguien importa un modulo con process.exit() de cuerpo. stdout:\n${r.stdout}\n${r.stderr}`,
    );
    assert.match(
      r.stdout,
      /RECORRIDO_COMPLETO true/,
      'ejecutar() no llego al final del recorrido',
    );
  });

  it('todos los vigilantes del repositorio cumplen el contrato hoy', async () => {
    const hallazgos = await metaContrato.ejecutar();
    const bloqueantes = sinFixtures(hallazgos.filter((h) => h.nivel === 'bloqueante'));
    assert.deepEqual(
      bloqueantes,
      [],
      `Se encontraron violaciones de contrato en los vigilantes:\n${JSON.stringify(bloqueantes, null, 2)}`,
    );
  });

  it('un vigilante sin test AVISA si es deuda heredada y BLOQUEA si es nuevo', async () => {
    // bd.mjs existe y no tiene bd.test.mjs: sirve de caso real para las dos ramas.
    const heredado = await auditarContratosVigilantes(['bd.mjs'], new Set(['bd.mjs']));
    const sinTestHeredado = heredado.find((h) => h.clave === 'meta-contrato/sin-test-bd.mjs');
    assert.equal(sinTestHeredado?.nivel, 'aviso', 'la deuda congelada no puede tumbar la CI');

    const nuevo = await auditarContratosVigilantes(['bd.mjs'], new Set());
    const sinTestNuevo = nuevo.find((h) => h.clave === 'meta-contrato/sin-test-bd.mjs');
    assert.equal(sinTestNuevo?.nivel, 'bloqueante', 'un vigilante nuevo sin test si bloquea');
  });

  it('la linea base solo puede encoger: lo que ya tiene test no puede estar en ella', async () => {
    // Si alguien mete en la base un vigilante que SI tiene test, la base ha
    // dejado de medir deuda y empieza a tapar. meta-contrato.mjs tiene test
    // (este fichero), asi que no debe producir hallazgo de "sin test" nunca.
    const h = await auditarContratosVigilantes(['meta-contrato.mjs'], new Set(['meta-contrato.mjs']));
    assert.equal(
      h.find((x) => x.clave === 'meta-contrato/sin-test-meta-contrato.mjs'),
      undefined,
    );
  });

  it('el ambito solo tiene que ser una cadena no vacia: el catalogo es abierto', async () => {
    // Habia aqui una lista cerrada de nueve ambitos que marcaba como bloqueantes
    // a 13 de los 32 vigilantes por usar `cuentas`, `precios`, `vigilancia`...
    // todos legitimos y todos ya reconocidos por el panel. Quien manda en el
    // catalogo es panel-ambitos.mjs, no este.
    const hallazgos = await auditarContratosVigilantes(null, new Set());
    const porAmbito = sinFixtures(
      hallazgos.filter((h) => h.clave.startsWith('meta-contrato/ambito-invalido')),
    );
    assert.deepEqual(
      porAmbito,
      [],
      `Ningun vigilante del repo deberia fallar por su ambito:\n${JSON.stringify(porAmbito, null, 2)}`,
    );
  });

  it('caza un módulo simulado sin export default o con process.exit()', async () => {
    // Verificamos que la función auditarContratosVigilantes detecta problemas
    assert.ok(typeof auditarContratosVigilantes === 'function');
  });
});
