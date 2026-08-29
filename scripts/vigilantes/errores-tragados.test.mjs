// Tests del vigilante de errores tragados.
//
// Un vigilante del que nadie ha visto nunca un hallazgo es un vigilante del que
// no sabemos si mira. Aqui se le dan casos preparados y se comprueba que canta
// lo que tiene que cantar Y que se calla donde debe -- que es la mitad dificil:
// un detector que grita por todo se acaba apagando.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barrer, contarPorFichero, comparar } from './errores-tragados.mjs';

// --- El barrido real del repo ---------------------------------------------

test('barre el repo entero y encuentra las dos universos de ficheros', () => {
  const { contadores } = barrer();
  assert.ok(contadores.ficherosApp > 300, `pocos ficheros de cliente: ${contadores.ficherosApp}`);
  assert.ok(contadores.ficherosEdge > 40, `pocas edge functions: ${contadores.ficherosEdge}`);
});

test('las anclas siguen puestas: hay llamadas a supabase y respuestas dentro de catch', () => {
  const { contadores } = barrer();
  // Los suelos viven en el propio vigilante y `barrer` lanza AnclaPerdida si se
  // cruzan. Aqui se comprueba que hoy estamos comodamente por encima: si esto
  // empieza a ir justo, la ceguera esta cerca.
  assert.ok(contadores.llamadasSupabase > 300, `pocas llamadas a supabase reconocidas: ${contadores.llamadasSupabase}`);
  assert.ok(contadores.respuestasEnCatch > 40, `pocas respuestas de edge reconocidas: ${contadores.respuestasEnCatch}`);
});

test('el ancla NO es "distinto de cero": una ceguera parcial tambien tiene que fallar', () => {
  // El detector de edges perdio una vez el 89 % de su vista (57 respuestas -> 6)
  // al renombrarse el helper `json()`, y el ancla de entonces -- que preguntaba
  // "> 0" -- lo dejo pasar en verde. Los suelos tienen que estar MUY por encima
  // de cero para que una ceguera parcial no cuele.
  const fuente = readFileSync(new URL('./errores-tragados.mjs', import.meta.url), 'utf8');
  const m = /const SUELOS = \{([^}]+)\}/.exec(fuente);
  assert.ok(m, 'ya no existe la tabla de SUELOS: el vigilante ha perdido sus anclas');
  const valores = [...m[1].matchAll(/:\s*(\d+)/g)].map((x) => Number(x[1]));
  assert.equal(valores.length, 3, 'faltan suelos en la tabla de anclas');
  for (const v of valores) {
    assert.ok(v >= 20, `un suelo de ${v} es practicamente "distinto de cero": no caza una ceguera parcial`);
  }
});

test('encuentra el caso que justifica el vigilante: la serie de citas que miente', () => {
  const { hallazgos } = barrer();
  const serie = hallazgos.find(
    (h) => h.fichero.endsWith('NewCitaModal.web.tsx') && h.clase === 'escritura-sin-error',
  );
  assert.ok(serie, 'ya no se caza el insert de la serie de citas de NewCitaModal');
});

test('respeta la marca explicita: is_staff descarta el error a proposito y no se denuncia', () => {
  const { hallazgos } = barrer();
  // Solo el rpc de is_staff esta eximido. El resto de lib/auth.ts (el
  // auth.getUser() de mas arriba, p. ej.) sigue contando: la marca exime UNA
  // linea, no un fichero entero. Si eximiera el fichero, seria una alfombra.
  const isStaff = hallazgos.filter(
    (h) => h.fichero === 'lib/auth.ts' && /is_staff/.test(h.fragmento),
  );
  assert.deepEqual(
    isStaff, [],
    'el rpc de is_staff lleva "// error-ignorado:" encima (falla cerrado a proposito) y aun asi se denuncia',
  );
});

test('la marca exime la linea que marca, no el fichero entero', () => {
  const { hallazgos } = barrer();
  const otros = hallazgos.filter((h) => h.fichero === 'lib/auth.ts' && !/is_staff/.test(h.fragmento));
  assert.ok(
    otros.length > 0,
    'lib/auth.ts tiene una marca "error-ignorado:" y ha dejado de reportar TODO lo demas del fichero: la marca se ha vuelto una alfombra',
  );
});

test('el repo esta en verde contra su propia linea base', async () => {
  const { default: vigilante } = await import('./errores-tragados.mjs');
  const hallazgos = await vigilante.ejecutar();
  const subidas = hallazgos.filter((h) => !/baja la linea base/.test(h.titulo));
  assert.deepEqual(subidas, [], 'hay clases por encima de la linea base congelada');
});

// --- La comparacion contra la linea base -----------------------------------

test('un sitio nuevo en un fichero limpio es un hallazgo', () => {
  const d = comparar({ 'catch-mudo': { 'app/nuevo.tsx': 1 } }, {});
  assert.equal(d.length, 1);
  assert.match(d[0].titulo, /un sitio nuevo/);
  assert.equal(d[0].fichero, 'app/nuevo.tsx');
});

test('subir la deuda de un fichero que ya la tenia es un hallazgo, y dice cuanta habia', () => {
  const d = comparar({ 'lectura-sin-error': { 'a.tsx': 5 } }, { 'lectura-sin-error': { 'a.tsx': 3 } });
  assert.equal(d.length, 1);
  assert.match(d[0].titulo, /5 sitios .* \(antes 3\)/);
});

test('mantener la deuda igual no dice nada', () => {
  assert.deepEqual(comparar({ 'catch-mudo': { 'a.tsx': 4 } }, { 'catch-mudo': { 'a.tsx': 4 } }), []);
});

test('limpiar deuda avisa para que se BAJE la linea base', () => {
  const d = comparar({ 'catch-mudo': { 'a.tsx': 1 } }, { 'catch-mudo': { 'a.tsx': 4 } });
  assert.equal(d.length, 1);
  assert.equal(d[0].bajada, true);
  assert.match(d[0].titulo, /baja la linea base/);
});

test('mover deuda de un fichero a otro NO pasa desapercibido', () => {
  // Es la razon de contar por fichero y no en total: en global esto seria
  // "3 antes, 3 ahora, todo igual".
  const d = comparar(
    { 'catch-mudo': { 'a.tsx': 0, 'b.tsx': 3 } },
    { 'catch-mudo': { 'a.tsx': 3 } },
  );
  assert.equal(d.filter((x) => !x.bajada).length, 1, 'no ha visto la deuda nueva de b.tsx');
  assert.equal(d.filter((x) => x.bajada).length, 1, 'no ha visto que a.tsx se limpio');
});

test('cada clase se compara por separado', () => {
  const d = comparar(
    { 'catch-mudo': { 'a.tsx': 1 }, 'lectura-sin-error': { 'a.tsx': 1 } },
    { 'catch-mudo': { 'a.tsx': 1 } },
  );
  assert.equal(d.length, 1);
  assert.equal(d[0].clase, 'lectura-sin-error');
});

// --- El recuento ------------------------------------------------------------

test('contarPorFichero agrupa por clase y fichero', () => {
  const t = contarPorFichero([
    { clase: 'catch-mudo', fichero: 'a.tsx' },
    { clase: 'catch-mudo', fichero: 'a.tsx' },
    { clase: 'catch-mudo', fichero: 'b.tsx' },
    { clase: 'lectura-sin-error', fichero: 'a.tsx' },
  ]);
  assert.deepEqual(t, {
    'catch-mudo': { 'a.tsx': 2, 'b.tsx': 1 },
    'lectura-sin-error': { 'a.tsx': 1 },
  });
});
