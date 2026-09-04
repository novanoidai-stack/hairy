// Tests de meta-registro: ningun vigilante puede quedarse fuera del runner.
//
// Este fichero no existia hasta el 4 sep 2026. meta-registro era uno de los diez
// vigilantes sin test, y no por descuido de nadie: meta-contrato --el que exige
// que cada vigilante lleve el suyo-- llevaba desde que se escribio muriendo a
// media pasada sin llegar a decirlo. Al arreglar el runner aparecieron los diez
// de golpe.

import test from 'node:test';
import assert from 'node:assert/strict';
import metaRegistro from './meta-registro.mjs';
import { codigoEjecutable } from './nucleo.mjs';

// index.test.mjs deja un fichero trampa en este mismo directorio mientras
// prueba el runner de punta a punta, y `node --test` corre los ficheros en
// paralelo. Un hallazgo suyo aqui no es una regresion: es el fixture del vecino.
const ES_FIXTURE = /^trampa-/;

test('se declara con nombre, ambito y ejecutar', () => {
  assert.equal(metaRegistro.nombre, 'meta-registro');
  assert.equal(typeof metaRegistro.ambito, 'string');
  assert.ok(metaRegistro.ambito.trim(), 'el ambito no puede venir vacio');
  assert.equal(typeof metaRegistro.ejecutar, 'function');
});

test('hoy no hay ningun vigilante fuera del runner ni fuera de la edge', async () => {
  const hallazgos = await metaRegistro.ejecutar();
  const bloqueantes = hallazgos
    .filter((h) => h.nivel === 'bloqueante')
    .filter((h) => !ES_FIXTURE.test(String(h.fichero ?? '').split('/').pop()));
  assert.deepEqual(
    bloqueantes,
    [],
    `Hay vigilantes sin registrar:\n${JSON.stringify(bloqueantes, null, 2)}`,
  );
});

test('la guarda de importacion mira el codigo ejecutable, no las menciones', () => {
  // Es la condicion exacta que decide si meta-registro importa un fichero o se
  // niega a hacerlo. Se prueba aqui, sin tocar el disco: crear ficheros trampa
  // en scripts/vigilantes/ contamina a los demas tests, que escanean ese mismo
  // directorio en paralelo. El caso end-to-end --el runner entero contra un
  // fichero envenenado de verdad-- vive en index.test.mjs, que es donde tiene
  // sentido pagar ese precio una sola vez.
  const seSuicida = (fuente) => /\bprocess\s*\.\s*exit\s*\(/.test(codigoEjecutable(fuente));

  assert.equal(seSuicida('process.exit(0);\nexport default {};'), true, 'llamada real');
  assert.equal(seSuicida('// nunca uses process.exit(0)\nexport default {};'), false, 'comentario');
  assert.equal(seSuicida("const m = 'process.exit(';\nexport default {};"), false, 'texto');
});
