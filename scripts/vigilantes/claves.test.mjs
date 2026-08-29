import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { revisarTexto } from './claves.mjs';

// Las agujas se parten en dos para que ESTE fichero no dispare al vigilante que
// esta probando (scripts/ esta dentro de lo que barre).
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5' + 'cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.firma';
// Cuerpo de 31 caracteres, como una secret key de verdad (la real mide 41 en total).
const SECRETA = 'sb_' + 'secret_' + 'DeMentiraPeroConLargoRealista01';
const PUBLICABLE = 'sb_' + 'publishable_' + '7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';
// Un token personal (Management API). Cuerpo de 40 hex, como los de verdad.
const PERSONAL = 'sb' + 'p_' + '0123456789abcdef0123456789abcdef01234567';

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
test('caza un token personal de cuenta (sbp_...), que abre toda la organizacion', () => {
  const hs = revisarTexto('scripts/lo-que-sea.mjs', `const t = '${PERSONAL}';`);
  assert.ok(
    claves(hs).includes('claves/token-personal-en-codigo'),
    'un sbp_ pasaba antes por delante del vigilante sin que lo viera: no es una clave de ' +
    'proyecto, es de CUENTA, y abre el Management API de toda la organizacion',
  );
});

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
