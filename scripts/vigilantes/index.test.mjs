// Regresion del 29 ago 2026: el runner terminaba con `process.exit()` y en
// Windows, justo despues del fetch del vigilante de base de datos (`--bd`),
// libuv assertaba --
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
// -- y el proceso moria con codigo 127 AUNQUE el informe hubiera salido en
// verde. Es decir: un run perfecto se leia como fallo en cualquier hook,
// pre-push o script que mirase el codigo de salida. La CI (Linux) no lo sufre,
// asi que esto se pudre en silencio si nadie lo amarra.
//
// La cura es no matar el proceso a mano: `salir()` pone `process.exitCode` y
// deja que el bucle de eventos se vacie solo. Estos tests amarran las dos
// mitades del arreglo: que nadie devuelve `process.exit()` a la ruta normal, y
// que los codigos de salida siguen siendo exactamente los de antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('./index.mjs', import.meta.url));

// Los comentarios del runner hablan de `process.exit()` en prosa a proposito
// (explican por que NO se usa), asi que se vacian antes de buscar llamadas de
// verdad. Se rellenan con espacios para no mover las posiciones.
const fuente = readFileSync(RUNNER, 'utf8')
  .split('\n')
  .map((linea) => {
    const i = linea.indexOf('//');
    return i === -1 ? linea : linea.slice(0, i) + ' '.repeat(linea.length - i);
  })
  .join('\n');

test('el runner solo mata el proceso dentro de salir(), nunca en la ruta normal', () => {
  const ini = fuente.indexOf('function salir(');
  assert.notEqual(ini, -1, 'ancla perdida: ya no existe function salir() en index.mjs');
  // El final de la funcion es la primera llave en columna 0 tras su apertura.
  const fin = fuente.indexOf('\n}', ini);
  assert.notEqual(fin, -1, 'ancla perdida: no se encuentra el cierre de salir()');

  const llamadas = [...fuente.matchAll(/process\.exit\(/g)].map((m) => m.index);
  const fuera = llamadas.filter((i) => i < ini || i > fin);
  assert.deepEqual(
    fuera,
    [],
    'Alguien ha vuelto a poner process.exit() en la ruta normal del runner. En ' +
      'Windows eso revienta con la assertion de libuv (UV_HANDLE_CLOSING) justo ' +
      'despues del fetch de --bd y devuelve 127 con el informe en verde. Usa ' +
      'salir(codigo): pone process.exitCode y deja que el proceso salga solo.',
  );
  assert.equal(
    llamadas.length,
    1,
    'salir() deberia tener exactamente un process.exit(): el del vigia anti-cuelgue',
  );
});

test('los codigos de salida siguen siendo los de siempre', () => {
  // Un vigilante que no existe da 2. No toca red ni ficheros del producto, asi
  // que es igual de deterministico en Windows y en la CI. El `timeout` esta
  // para que la otra mitad del arreglo tampoco pase desapercibida: si algun dia
  // dejar salir al proceso solo lo CUELGA, este test falla por senal, no se
  // queda esperando.
  const r = spawnSync(process.execPath, [RUNNER, '--solo', 'no-existe'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(r.signal, null, `el runner no ha terminado solo: senal ${r.signal}`);
  assert.equal(r.status, 2, `esperaba salir con 2 y ha salido con ${r.status}. stderr:\n${r.stderr}`);
});

// --- La red de seguridad (4 sep 2026) ---------------------------------------
//
// Del 1 al 4 sep el runner salio en VERDE tres dias sin ejecutar un vigilante:
// meta-contrato importaba peso-bundle.mjs, que llama a process.exit(0) a nivel
// de modulo, y eso mata el proceso con SU codigo. 43 s, una linea, exit 0.
//
// Estos dos tests amarran las dos mitades de la cura: que morir a destiempo se
// OIGA (el guardia), y que el caso concreto ya no llegue a matar a nadie porque
// se caza y se nombra (el recorrido).

test('el guardia convierte una muerte a destiempo en exit 2, no en un verde', () => {
  const guardia = new URL('./red-de-seguridad.mjs', import.meta.url).href;
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import ${JSON.stringify(guardia)};\nprocess.exit(0);`],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(
    r.status,
    2,
    `un process.exit(0) ajeno sin veredicto tiene que acabar en 2 y ha acabado en ${r.status}`,
  );
  assert.match(r.stderr, /SIN emitir veredicto/, 'y tiene que decirlo en voz alta');
});

test('el guardia se calla cuando el veredicto ya se ha emitido', () => {
  const guardia = new URL('./red-de-seguridad.mjs', import.meta.url).href;
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { marcarVeredictoEmitido } from ${JSON.stringify(guardia)};\n` +
        'marcarVeredictoEmitido();\nprocess.exit(0);',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(r.status, 0, 'una salida legitima no puede convertirse en fallo');
  assert.doesNotMatch(r.stderr, /SIN emitir veredicto/);
});

test('un vigilante que se suicida al importarlo se caza y NO tumba el recorrido', () => {
  // El fichero se descubre por el directorio (meta-registro y meta-contrato lo
  // importarian dinamicamente): es exactamente la forma del incidente.
  const trampa = fileURLToPath(new URL('./trampa-de-prueba.mjs', import.meta.url));
  writeFileSync(
    trampa,
    'process.exit(0);\n' +
      'export default { nombre: "trampa-de-prueba", ambito: "meta", descripcion: "x", ejecutar: async () => [] };\n',
    'utf8',
  );
  try {
    const r = spawnSync(process.execPath, [RUNNER, '--json', ''], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(r.signal, null, `el runner no termino solo: senal ${r.signal}`);
    assert.notEqual(
      r.status,
      0,
      'un vigilante que se mata al importarlo NO puede acabar en verde. stdout:\n' + r.stdout,
    );
    assert.match(
      r.stdout,
      /trampa-de-prueba\.mjs llama a process\.exit\(\) a nivel de modulo/,
      'el hallazgo tiene que NOMBRAR al culpable, no ser un fallo generico',
    );
    assert.match(
      r.stdout,
      /32 vigilantes|3\d vigilantes/,
      'y el recorrido tiene que haber terminado igual, no pararse en el primero',
    );
  } finally {
    rmSync(trampa, { force: true });
  }
});
