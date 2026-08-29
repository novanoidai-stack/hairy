import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './panel-salud.mjs';

test('hoy el panel conoce todos los ambitos', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(
    hallazgos, [],
    'algun vigilante emite un ambito que la pestana Salud no sabe filtrar ni etiquetar:\n' +
      JSON.stringify(hallazgos, null, 2),
  );
});

test('el vigilante conoce los ambitos que emiten los scripts sueltos', async () => {
  // Estos no son modulos de vigilante (no se les puede preguntar su `.ambito`),
  // asi que van a mano en DE_LOS_SCRIPTS. Si alguien anade un script que emite un
  // ambito nuevo y no lo apunta ahi, este vigilante no lo comprobara nunca --
  // seria ciego para el sin decirlo. Esto al menos fija los que ya hay.
  const fuente = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('./panel-salud.mjs', import.meta.url), 'utf8'),
  );
  for (const esperado of ['pantallas', 'rendimiento', 'silencios', 'base-de-datos', 'otros']) {
    assert.ok(
      fuente.includes(`'${esperado}'`),
      `DE_LOS_SCRIPTS ya no menciona "${esperado}": ese ambito ha dejado de vigilarse`,
    );
  }
});
