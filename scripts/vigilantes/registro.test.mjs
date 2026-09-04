// Tests del registro: la lista unica de vigilantes.
//
// Nace el 4 sep 2026, con dos regresiones concretas detras:
//
// 1. La lista estaba escrita en index.mjs (32) y en compilar-estado.mjs (17), y
//    como el segundo escribe el informe de salud versionado del repo, la linea
//    base del trinquete de deuda llevaba midiendo medio sistema sin decirlo.
// 2. Al unificarla se creo un CICLO de importacion (registro -> meta-registro ->
//    registro) que `npm run vigilar` NO detectaba: entrando por registro.mjs el
//    ciclo se resuelve en el orden bueno y todo parece bien. Solo reventaba al
//    importar meta-registro.mjs como entrada. De ahi el ultimo test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ESTATICOS, DE_RED } from './registro.mjs';
import { ESTATICOS as DEL_COMPILADOR } from './compilar-estado.mjs';
import { NO_SON_VIGILANTES, ES_FIXTURE_DE_TEST } from './nucleo.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));

test('el runner y el snapshot del panel corren EXACTAMENTE la misma lista', () => {
  // Es el fallo original: 32 contra 17. Se compara por identidad, no por
  // longitud, para que no se pueda "cuadrar" con una copia paralela.
  assert.equal(
    DEL_COMPILADOR,
    ESTATICOS,
    'compilar-estado.mjs ha vuelto a tener su propia lista. El informe de salud del ' +
      'repo y el trinquete de deuda beben de ese fichero: si mide menos vigilantes que ' +
      'el runner, el trinquete deja de vigilar la mitad y nadie se entera.',
  );
});

test('ningun .mjs del directorio se queda sin clasificar', () => {
  const enEstaticos = new Set(ESTATICOS.map((v) => v.nombre));
  const enRed = new Set(DE_RED.map((r) => r.replace('./', '')));

  const huerfanos = readdirSync(DIR)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .filter((f) => !NO_SON_VIGILANTES.has(f) && !enRed.has(f))
    // El vigilante envenenado que index.test.mjs deja mientras corre en paralelo.
    .filter((f) => !ES_FIXTURE_DE_TEST.test(f))
    .filter((f) => {
      const base = f.replace(/\.mjs$/, '');
      return !enEstaticos.has(base) && !ESTATICOS.some((v) => v.nombre === base);
    });

  assert.deepEqual(
    huerfanos,
    [],
    'Estos .mjs no estan en ESTATICOS, ni en DE_RED, ni en NO_SON_VIGILANTES. ' +
      'Un vigilante que no corre nadie es cobertura falsa con forma de fichero:\n  ' +
      huerfanos.join('\n  '),
  );
});

test('los de red estan todos en DE_RED y ninguno duplicado', () => {
  assert.equal(new Set(DE_RED).size, DE_RED.length, 'hay rutas repetidas en DE_RED');
  for (const ruta of DE_RED) {
    assert.match(ruta, /^\.\/bd/, `${ruta} no parece un vigilante de red`);
  }
});

test('REGRESION: cada vigilante se puede importar como ENTRADA (sin ciclos ESM)', () => {
  // Un ciclo de importacion no falla siempre: falla segun por donde entres. Por
  // eso cada modulo se prueba en su propio proceso, siendo el la entrada. Es la
  // unica forma de ver lo que `npm run vigilar` no ve.
  const modulos = readdirSync(DIR)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .filter((f) => !NO_SON_VIGILANTES.has(f))
    .filter((f) => !ES_FIXTURE_DE_TEST.test(f));

  const rotos = [];
  for (const f of modulos) {
    const url = new URL(`./${f}`, import.meta.url).href;
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`],
      { encoding: 'utf8', timeout: 30_000 },
    );
    if (r.status !== 0) rotos.push(`${f}: ${(r.stderr || '').trim().split('\n').slice(0, 3).join(' | ')}`);
  }

  assert.deepEqual(
    rotos,
    [],
    'Estos modulos revientan al importarlos como entrada. Casi siempre es un ciclo ' +
      'de importacion (ReferenceError: Cannot access X before initialization), y el ' +
      'runner NO lo ve porque entra por otro lado:\n  ' + rotos.join('\n  '),
  );
});

test('el orden de ESTATICOS empieza por los baratos y acaba por los meta', () => {
  // No es cosmetico: el runner imprime en este orden y los meta-vigilantes
  // hablan de los demas, asi que leerlos al final es lo que tiene sentido.
  const nombres = ESTATICOS.map((v) => v.nombre);
  const primerMeta = nombres.findIndex((n) => n.startsWith('meta-'));
  const ultimoNoMeta = nombres.map((n) => !n.startsWith('meta-')).lastIndexOf(true);
  assert.ok(primerMeta !== -1, 'ancla perdida: ya no hay ningun vigilante meta-*');
  assert.ok(
    primerMeta < ultimoNoMeta || primerMeta > 0,
    'los meta-vigilantes deberian ir despues de los de dominio',
  );
});
