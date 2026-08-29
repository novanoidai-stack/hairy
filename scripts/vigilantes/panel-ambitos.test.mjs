import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { ambitosDelPanel } from './panel-ambitos.mjs';
import { AnclaPerdida } from './nucleo.mjs';

// Un panel de juguete con la misma forma que el de verdad: sirve para probar el
// lector sin tocar web/admin.html.
const panel = ({ etiquetas, opciones }) => `
  <select class="ad-sel" id="fAmbitoSal">
    <option value="">Todos los ámbitos</option>
${opciones.map((o) => `    <option value="${o}">${o}</option>`).join('\n')}
  </select>
  <script>
  var AMBITO_SAL_LABEL = {
    ${etiquetas.map((e) => `'${e}': 'X'`).join(', ')}
  };
  </script>
`;

test('lee las etiquetas y las opciones del panel', () => {
  const { etiquetas, opciones } = ambitosDelPanel(
    panel({ etiquetas: ['precios', 'base-de-datos'], opciones: ['precios', 'landing'] }),
  );
  assert.deepEqual([...etiquetas].sort(), ['base-de-datos', 'precios']);
  // La opcion vacia ("Todos los ambitos") cuenta como opcion y esta exenta.
  assert.deepEqual([...opciones].sort(), ['', 'landing', 'precios']);
});

test('el diccionario admite claves con y sin comillas', () => {
  // admin.html mezcla los dos estilos: `precios:` y `'codigo-muerto':`.
  const { etiquetas } = ambitosDelPanel(`
    <select id="fAmbitoSal"><option value="">T</option></select>
    var AMBITO_SAL_LABEL = { precios: 'Precios', 'codigo-muerto': 'Código muerto' };
  `);
  assert.deepEqual([...etiquetas].sort(), ['codigo-muerto', 'precios']);
});

test('si reescriben el diccionario, falla por ciego en vez de pasar en verde', () => {
  assert.throws(
    () =>
      ambitosDelPanel(`
        <select id="fAmbitoSal"><option value="">T</option></select>
        var ETIQUETAS = { precios: 'Precios' };
      `),
    AnclaPerdida,
  );
});

test('si desaparece el desplegable, tambien falla por ciego', () => {
  assert.throws(
    () => ambitosDelPanel(`var AMBITO_SAL_LABEL = { precios: 'Precios' };`),
    AnclaPerdida,
  );
});

test('hoy el panel conoce todos los ambitos que se emiten', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'panel-ambitos');
  assert.equal(vigilante.ambito, 'pantallas');
  assert.equal(typeof vigilante.ejecutar, 'function');
});
