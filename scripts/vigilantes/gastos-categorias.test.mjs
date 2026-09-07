// Pruebas del vigilante de categorias de gasto.
//
// Lo que hay que demostrar de un vigilante NEGATIVO (busca algo malo y espera no
// encontrarlo) son dos cosas, y la segunda es la que se olvida:
//   1. que hoy no encuentra nada, y
//   2. que SI encontraria algo si lo hubiera.
// Sin (2), un regex roto y un sistema sano dan el mismo cero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './gastos-categorias.mjs';
import { CATEGORIAS_GASTO, METODOS_PAGO_GASTO } from '../../lib/gastos.ts';

// --- Las piezas puras, probadas a traves de la comparacion real -------------

test('hoy el codigo y el CHECK dicen lo mismo', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(
    hallazgos,
    [],
    'Si esto falla, lib/gastos.ts y la migracion de gastos se han separado. ' +
      'No lo arregles tocando el vigilante: arregla la lista que falte.',
  );
});

test('y no lo dice por no haber leido nada', () => {
  // El cero de arriba solo vale si las listas tienen contenido: dos listas
  // vacias tambien "coinciden". El vigilante lanza AnclaPerdida si algun parser
  // se queda a cero, pero aqui se comprueba ademas contra la fuente de verdad.
  assert.ok(
    CATEGORIAS_GASTO.length >= 13,
    `Se esperaban al menos las 13 categorias del 7 sep 2026 y hay ${CATEGORIAS_GASTO.length}`,
  );
  assert.ok(
    METODOS_PAGO_GASTO.length >= 5,
    `Se esperaban al menos las 5 formas de pago y hay ${METODOS_PAGO_GASTO.length}`,
  );
});

test('el vigilante se declara con nombre, ambito y sin red', () => {
  assert.equal(vigilante.nombre, 'gastos-categorias');
  assert.equal(vigilante.ambito, 'coherencia');
  assert.equal(vigilante.necesitaRed, false);
  assert.ok(vigilante.descripcion.length > 10);
});

// --- Que SI cazaria una deriva ----------------------------------------------
//
// No se puede tocar el fichero real para probarlo, asi que se replica la
// comparacion sobre listas de mentira. Es la misma logica de conjuntos que usa
// `comparar`: lo que esta en uno y no en el otro, en las dos direcciones.

function diferencias(enCodigo, enSql) {
  return {
    soloCodigo: enCodigo.filter((v) => !enSql.includes(v)),
    soloSql: enSql.filter((v) => !enCodigo.includes(v)),
  };
}

test('caza una categoria que solo esta en el codigo', () => {
  const d = diferencias(['alquiler', 'nueva'], ['alquiler']);
  assert.deepEqual(d.soloCodigo, ['nueva']);
  assert.deepEqual(d.soloSql, []);
});

test('caza una categoria que solo esta en el CHECK', () => {
  const d = diferencias(['alquiler'], ['alquiler', 'huerfana']);
  assert.deepEqual(d.soloCodigo, []);
  assert.deepEqual(d.soloSql, ['huerfana']);
});

test('el orden no cuenta como diferencia', () => {
  const d = diferencias(['a', 'b'], ['b', 'a']);
  assert.deepEqual(d.soloCodigo, []);
  assert.deepEqual(d.soloSql, []);
});

// --- Invariantes de la propia lista -----------------------------------------

test('no hay categorias repetidas ni etiquetas vacias', () => {
  const valores = CATEGORIAS_GASTO.map((c) => c.valor);
  assert.equal(
    new Set(valores).size,
    valores.length,
    'Una categoria repetida sale dos veces en el desplegable y parte el desglose en dos barras.',
  );
  for (const c of CATEGORIAS_GASTO) {
    assert.ok(c.etiqueta.trim().length > 0, `La categoria ${c.valor} no tiene etiqueta`);
  }
});

test('"otros" existe y va al final: es el cajon de sastre', () => {
  const valores = CATEGORIAS_GASTO.map((c) => c.valor);
  assert.ok(valores.includes('otros'));
  assert.equal(
    valores[valores.length - 1],
    'otros',
    'Si "Otros" sube en la lista, se convierte en la opcion por defecto de quien no quiere pensar y el desglose deja de servir.',
  );
});

test('las formas de pago tampoco se repiten', () => {
  const valores = METODOS_PAGO_GASTO.map((m) => m.valor);
  assert.equal(new Set(valores).size, valores.length);
});
