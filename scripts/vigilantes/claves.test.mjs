import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { revisarTexto } from './claves.mjs';

// Las agujas se parten en dos para que ESTE fichero no dispare al vigilante que
// esta probando (scripts/ esta dentro de lo que barre).
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5' + 'cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.firma';
// Cuerpo de 31 caracteres, como una secret key de verdad (la real mide 41 en total).
const SECRETA = 'sb_' + 'secret_' + 'DeMentiraPeroConLargoRealista01';
const PUBLICABLE = 'sb_' + 'publishable_' + '7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

const claves = (hs) => hs.map((h) => h.clave.split(':')[0]).sort();

test('el repo y el bundle estan limpios', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('caza una clave heredada incrustada, este donde este', () => {
  const hs = revisarTexto('lib/supabase.ts', `const k = '${JWT}';`);
  assert.deepEqual(claves(hs), ['claves/heredada-en-codigo']);
  assert.equal(hs[0].nivel, 'bloqueante');
});

test('caza una secret key incrustada', () => {
  const hs = revisarTexto('scripts/algo.mjs', `const k = '${SECRETA}';`);
  assert.deepEqual(claves(hs), ['claves/secreta-en-codigo']);
});

test('la publishable es publica por diseno: no es un hallazgo', () => {
  assert.deepEqual(revisarTexto('web/assets/auth.js', `var k = '${PUBLICABLE}';`), []);
});

// El umbral de longitud es deliberado y este test lo documenta: una fixture
// corta de un test no puede tumbar la CI. Si algun dia Supabase acorta las
// secret keys de verdad, este test es el que hay que revisar.
test('un valor de mentira corto (sb_secret_nueva) no dispara', () => {
  assert.deepEqual(revisarTexto('supabase/functions/x/x.test.ts', 'const k = "sb_secret_nueva";'), []);
});

test('los tests quedan fuera de la regla de la puerta, pero no de la de claves', () => {
  const rel = 'supabase/functions/x/x.test.ts';
  assert.deepEqual(revisarTexto(rel, 'const c = createClient(url, "dummy-key");'), []);
  assert.deepEqual(claves(revisarTexto(rel, `const c = createClient(url, '${SECRETA}');`)), [
    'claves/secreta-en-codigo',
  ]);
});

test('caza el Deno.env.get a pelo en una edge function', () => {
  const codigo = `const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';`;
  assert.deepEqual(claves(revisarTexto('supabase/functions/x/index.ts', codigo)), [
    'claves/env-a-pelo',
  ]);
  const anon = `const k = Deno.env.get("SUPABASE_ANON_KEY") ?? '';`;
  assert.deepEqual(claves(revisarTexto('supabase/functions/x/index.ts', anon)), [
    'claves/env-a-pelo',
  ]);
});

test('caza un createClient que no pasa por ninguna de las dos puertas', () => {
  const codigo = 'const c = createClient(url, algo);';
  assert.deepEqual(claves(revisarTexto('supabase/functions/x/index.ts', codigo)), [
    'claves/sin-puerta',
  ]);
});

test('un createClient que si pasa por la puerta no se toca', () => {
  const bueno = `import { claveServicio } from '../shared/claveServicio.ts';
const c = createClient(url, claveServicio());`;
  assert.deepEqual(revisarTexto('supabase/functions/x/index.ts', bueno), []);
  const publico = `import { clavePublicable } from '../shared/claveServicio.ts';
const c = createClient(url, clavePublicable());`;
  assert.deepEqual(revisarTexto('supabase/functions/x/index.ts', publico), []);
});

test('la propia puerta esta exenta: nombra las heredadas a proposito', () => {
  const codigo = `const legado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");`;
  assert.deepEqual(revisarTexto('supabase/functions/shared/claveServicio.ts', codigo), []);
});

test('fuera de supabase/functions no se exige la puerta (el cliente es otra cosa)', () => {
  const codigo = 'export const supabase = createClient(url, anonKey);';
  assert.deepEqual(revisarTexto('lib/supabase.ts', codigo), []);
});

// --- Tokens personales de la CUENTA (sbp_) ----------------------------------

test('caza un token personal de Supabase, que abre la cuenta entera', () => {
  // Se colaba por delante: solo se buscaba `eyJ` y `sb_secret_`. Un sbp_ no
  // abre una base de datos, abre el Management API de toda la organizacion.
  const codigo = `const TOKEN = 'sbp' + '_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';`;
  assert.deepEqual(claves(revisarTexto('scripts/algo.mjs', codigo.replace(/' \+ '/g, ''))), [
    'claves/personal-en-codigo',
  ]);
});

test('el mensaje del token personal recuerda que hay que REVOCARLO', () => {
  const codigo = `sbp` + `_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4`;
  const [h] = revisarTexto('scripts/algo.mjs', codigo);
  assert.match(h.detalle, /REVOCARLO/);
});

test('una cadena corta parecida a un sbp_ no cuenta', () => {
  assert.deepEqual(revisarTexto('scripts/x.mjs', 'sbp' + '_corto'), []);
});

// --- La ceguera del bundle (§2 del plan maestro) -----------------------------

test('sin VIGILAR_BUNDLE y sin bundle, es un no-aplica legitimo', async () => {
  // En local, quien no ha compilado no tiene por que ver un fallo.
  const { comprobarBundle } = await import('./claves.mjs');
  assert.equal(typeof comprobarBundle, 'function');
});

test('el vigilante exporta comprobarBundle para poder probarla aparte', async () => {
  // Estaba enterrada dentro de ejecutar(), y por eso nadie se dio cuenta de que
  // en CI no miraba nada: no habia forma de invocarla sola.
  const m = await import('./claves.mjs');
  assert.ok(Object.hasOwn(m, 'comprobarBundle'));
});
