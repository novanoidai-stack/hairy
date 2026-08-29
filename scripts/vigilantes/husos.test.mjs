import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { importa, libsSensibles } from './husos.mjs';

// --- que cuenta como importar una lib concreta -------------------------------

test('reconoce el import de una lib de la raiz desde una edge', () => {
  const codigo = `import { ventanaDelDia } from '../../../lib/organizarAgenda.ts';`;
  assert.equal(importa(codigo, 'lib/organizarAgenda.ts'), true);
});

test('vale con o sin extension', () => {
  assert.equal(importa(`from '../../../lib/organizarAgenda'`, 'lib/organizarAgenda.ts'), true);
});

test('regresion: un fichero propio que se llama igual NO cuenta', () => {
  // enviar-informe-periodico tiene su ./lib/lecturaSerie.ts, que no tiene nada
  // que ver con lib/informes/lecturaSerie.ts de la raiz. Comparar por nombre de
  // fichero la marcaba sin motivo; por eso se compara por RUTA.
  const codigo = `import { mediana } from './lib/lecturaSerie.ts';`;
  assert.equal(importa(codigo, 'lib/informes/lecturaSerie.ts'), false);
});

// --- que libs son sensibles --------------------------------------------------

const leerFalso = (mapa) => (f) => mapa[f] ?? '';

test('es sensible la que materializa horas con setHours', () => {
  const s = libsSensibles(leerFalso({ 'lib/a.ts': 'd.setHours(9, 0, 0, 0);' }), ['lib/a.ts']);
  assert.deepEqual([...s], ['lib/a.ts']);
});

test('leer componentes locales no basta para ser sensible', () => {
  // Se probo marcando tambien getDay/getDate/getMonth y salian 22 libs de 40:
  // un vigilante que marca media base de codigo no lo lee nadie.
  const s = libsSensibles(leerFalso({ 'lib/a.ts': 'if (d.getDay() === 0) return;' }), ['lib/a.ts']);
  assert.deepEqual([...s], []);
});

test('el contagio es transitivo: quien importa a una sensible, lo es', () => {
  const s = libsSensibles(
    leerFalso({
      'lib/base.ts': 'd.setHours(9);',
      'lib/medio.ts': `import { x } from './lib/base.ts';`,
      'lib/alto.ts': `import { y } from './lib/medio.ts';`,
    }),
    ['lib/base.ts', 'lib/medio.ts', 'lib/alto.ts'],
  );
  // Sin cierre transitivo, meter una capa intermedia bastaria para que el
  // vigilante dejase de ver el problema y pasara en verde.
  assert.deepEqual([...s].sort(), ['lib/alto.ts', 'lib/base.ts', 'lib/medio.ts']);
});

test('una lib que no toca horas no contagia nada', () => {
  const s = libsSensibles(
    leerFalso({ 'lib/a.ts': 'export const x = 1;', 'lib/b.ts': `import './lib/a.ts';` }),
    ['lib/a.ts', 'lib/b.ts'],
  );
  assert.deepEqual([...s], []);
});

// --- el estado de hoy --------------------------------------------------------

test('hoy ninguna edge usa horarios de salon sin el reloj del salon', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('organizarAgenda sigue siendo la lib sensible de referencia', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const walk = (d, a = []) => {
    for (const e of readdirSync(d)) {
      const f = path.posix.join(d, e);
      if (statSync(f).isDirectory()) walk(f, a);
      else if (/\.tsx?$/.test(e) && !/\.(test|spec)\./.test(e)) a.push(f);
    }
    return a;
  };
  const s = libsSensibles((f) => readFileSync(f, 'utf8'), walk('lib'));
  assert.ok(s.has('lib/organizarAgenda.ts'), 'organizarAgenda deberia seguir marcada');
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'husos');
  assert.equal(vigilante.ambito, 'seguridad');
});
