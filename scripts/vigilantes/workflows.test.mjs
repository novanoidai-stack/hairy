import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import vigilante, { revisarWorkflow } from './workflows.mjs';

const revisar = (yaml) => revisarWorkflow(YAML.parse(yaml));
const CHECKOUT = 'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';

test('regresion: el canario que se rompio de verdad el 29 ago 2026', () => {
  // Al insertar un paso nuevo, la edicion cayo ENTRE el `uses:` del checkout y
  // su bloque `with:`. GitHub no dijo donde nadie lo leyera: creo una corrida
  // fallida sin jobs y llamada como la RUTA del fichero. Un parser de YAML
  // generico lo acepta tan feliz -- como YAML es correcto; lo que estaba mal era
  // el esquema de Actions.
  const motivos = revisar(`
jobs:
  humo:
    steps:
      - uses: ${CHECKOUT}
      - name: Dar tiempo al despliegue
        run: sleep 120
        with:
          persist-credentials: false
`);
  assert.equal(motivos.length, 2);
  assert.ok(
    motivos.some((m) => /`run` no admite `with`/.test(m)),
    'deberia cazar el `with` huerfano',
  );
  assert.ok(
    motivos.some((m) => /persist-credentials/.test(m)),
    'y que el checkout se quedo sin persist-credentials',
  );
});

test('regresion: checkout sin persist-credentials (zizmor artipacked)', () => {
  const motivos = revisar(`
jobs:
  vigilar:
    steps:
      - uses: ${CHECKOUT}
      - run: node algo.mjs
`);
  assert.equal(motivos.length, 1);
  assert.match(motivos[0], /persist-credentials/);
});

test('un checkout bien puesto no se toca', () => {
  assert.deepEqual(
    revisar(`
jobs:
  x:
    steps:
      - uses: ${CHECKOUT}
        with:
          persist-credentials: false
      - run: echo hola
`),
    [],
  );
});

test('una accion con etiqueta movil es un hallazgo', () => {
  const motivos = revisar(`
jobs:
  x:
    steps:
      - uses: actions/cache@v4
`);
  assert.equal(motivos.length, 1);
  assert.match(motivos[0], /no esta fijada por SHA/);
});

test('un paso con uses y run a la vez', () => {
  const motivos = revisar(`
jobs:
  x:
    steps:
      - uses: ${CHECKOUT}
        with:
          persist-credentials: false
        run: echo no
`);
  assert.ok(motivos.some((m) => /`uses` y `run` a la vez/.test(m)));
});

test('un paso que no hace nada', () => {
  const motivos = revisar(`
jobs:
  x:
    steps:
      - name: solo un nombre
`);
  assert.equal(motivos.length, 1);
  assert.match(motivos[0], /no hace nada/);
});

test('los 4 workflows de hoy estan bien', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'workflows');
  assert.equal(vigilante.ambito, 'seguridad');
});
