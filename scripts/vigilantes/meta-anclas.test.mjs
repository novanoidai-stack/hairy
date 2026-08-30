import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { auditarAnclas, ANCLAS_VIGILADAS } from './meta-anclas.mjs';

test('el vigilante meta-anclas se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'meta-anclas');
  assert.equal(vigilante.ambito, 'vigilancia');
});

test('todas las anclas declaradas siguen vivas en el repo hoy', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('caza un ancla rota simulada como bloqueante', () => {
  const mockLista = [
    {
      vigilante: 'test-vigilante',
      fichero: 'lib/supabase.ts',
      anclas: [/este_texto_no_existe_en_absoluto_12345/],
    }
  ];
  const hallazgos = auditarAnclas(mockLista);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].nivel, 'bloqueante');
  assert.match(hallazgos[0].titulo, /Ancla perdida/);
});

test('caza un fichero desaparecido como bloqueante', () => {
  const mockLista = [
    {
      vigilante: 'test-vigilante',
      fichero: 'lib/fichero_inexistente_99999.ts',
      anclas: [/test/],
    }
  ];
  const hallazgos = auditarAnclas(mockLista);
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].nivel, 'bloqueante');
  assert.match(hallazgos[0].titulo, /no existe/);
});
