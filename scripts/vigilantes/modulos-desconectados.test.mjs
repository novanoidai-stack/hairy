import { test } from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { analizar, apunta, especificadoresDe } from './modulos-desconectados.mjs';
import { leer } from './nucleo.mjs';

const consumidor = (ruta, ...specs) => ({ ruta, specs });

test('lee los especificadores en las formas que se usan en el repo', () => {
  const t = `
    import { a } from '@/lib/fichas/colorAlergias';
    import b from './retrasos.ts';
    export { c } from '../agenda/solapeAlSoltar';
    const d = await import('@/lib/planes');
    const e = require('./nucleo.mjs');
  `;
  assert.deepEqual(especificadoresDe(t), [
    '@/lib/fichas/colorAlergias',
    './retrasos.ts',
    '../agenda/solapeAlSoltar',
    '@/lib/planes',
    './nucleo.mjs',
  ]);
});

test('casa alias, relativos y extension', () => {
  const m = 'lib/fichas/colorAlergias.ts';
  for (const spec of [
    '@/lib/fichas/colorAlergias',
    './colorAlergias',
    './colorAlergias.ts',
    '../fichas/colorAlergias',
  ]) {
    assert.ok(apunta(spec, m, new Set()), `deberia casar: ${spec}`);
  }
  assert.ok(!apunta('@/lib/fichas/otraCosa', m, new Set()));
});

// Dos modulos que se llaman igual en carpetas distintas es justo el caso en que
// comparar solo el nombre daria por vivo al que no lo esta.
test('con el nombre repetido exige que case tambien la carpeta', () => {
  const repes = new Set(['helpers']);
  assert.ok(apunta('@/lib/caja/helpers', 'lib/caja/helpers.ts', repes));
  assert.ok(!apunta('@/lib/caja/helpers', 'lib/agenda/helpers.ts', repes));
});

test('un modulo que solo usa su test sale; uno con consumidor real, no', () => {
  const modulos = ['lib/x/solo.ts', 'lib/x/vivo.ts'];
  const consumidores = [
    consumidor('lib/x/solo.test.ts', './solo'),
    consumidor('lib/x/vivo.test.ts', './vivo'),
    consumidor('app/(tabs)/pantalla.web.tsx', '@/lib/x/vivo'),
  ];
  assert.deepEqual(analizar({ modulos, consumidores }), ['lib/x/solo.ts']);
});

// Lo que NO usa nadie es deuda y ya lo cuenta knip. Aqui solo interesa lo que
// parece hecho porque tiene test.
test('lo que no importa nadie, ni su test, no es cosa de este vigilante', () => {
  assert.deepEqual(analizar({ modulos: ['lib/x/nadie.ts'], consumidores: [] }), []);
});

test('un consumidor en scripts/ o en supabase/ cuenta como vivo', () => {
  for (const ruta of ['scripts/worker.ts', 'supabase/functions/algo/index.ts']) {
    const out = analizar({
      modulos: ['lib/x/m.ts'],
      consumidores: [consumidor('lib/x/m.test.ts', './m'), consumidor(ruta, '../../lib/x/m')],
    });
    assert.deepEqual(out, [], `${ruta} deberia contar como consumidor`);
  }
});

test('la linea base cubre exactamente lo que hay hoy: 0 bloqueantes', async () => {
  const h = await vigilante.ejecutar();
  const bloqueantes = h.filter((x) => x.nivel === 'bloqueante').map((x) => x.fichero);
  assert.deepEqual(bloqueantes, [], 'hay un modulo desconectado nuevo, o falta en la linea base');
  assert.ok(h.length > 0, 'si esto diera 0 es que el recorrido se ha roto');
});

test('cada entrada de la linea base dice que hacer con su modulo', () => {
  const base = JSON.parse(leer('scripts/vigilantes/modulos-desconectados-baseline.json'));
  for (const [modulo, motivo] of Object.entries(base.heredados)) {
    assert.match(
      motivo,
      /^(DUPLICA|SIN ENCHUFAR|BORRAR|TRIAR)/,
      `${modulo}: la linea base tiene que empezar por la decision (DUPLICA / SIN ENCHUFAR / BORRAR / TRIAR)`,
    );
    assert.ok(motivo.length > 40, `${modulo}: el motivo tiene que explicar POR QUE, no solo etiquetar`);
  }
});
