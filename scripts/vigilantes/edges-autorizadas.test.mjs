import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, {
  funcionesSinVerificacion,
  seConsumeElResultado,
} from './edges-autorizadas.mjs';
import { AnclaPerdida } from './nucleo.mjs';

test('saca del toml solo las que apagan verify_jwt', () => {
  const toml = `
project_id = "x"

[functions.una]
verify_jwt = false

[functions.otra]
verify_jwt = true

[functions.tercera]
import_map = "./map.json"
verify_jwt = false
`;
  assert.deepEqual(funcionesSinVerificacion(toml).sort(), ['tercera', 'una']);
});

test('si no hay bloques [functions.*], falla por ciego', () => {
  assert.throws(() => funcionesSinVerificacion('project_id = "x"\n'), AnclaPerdida);
});

// --- Lo que cuenta como usar la guarda de verdad -----------------------------

test('importarla no es usarla', () => {
  const codigo = `import { peticionDeServicio } from '../shared/claveServicio.ts';\nserve(async () => json({}));`;
  assert.equal(seConsumeElResultado(codigo, 'peticionDeServicio'), false);
});

test('llamarla y tirar el resultado tampoco', () => {
  // El bug sutil: parece que autoriza, pero no mira la respuesta.
  const codigo = `serve(async (req) => {\n  peticionDeServicio(req);\n  return json({});\n});`;
  assert.equal(seConsumeElResultado(codigo, 'peticionDeServicio'), false);
});

test('negada en un if, si', () => {
  const codigo = `  if (!peticionDeServicio(req)) return json({}, 401);`;
  assert.equal(seConsumeElResultado(codigo, 'peticionDeServicio'), true);
});

test('regresion: en la segunda mitad de un && tambien', () => {
  // agenda-optimizador la llama asi y una lista de formas permitidas la marcaba
  // como abierta. Es el falso positivo que hizo reescribir la deteccion.
  const codigo = `    if (body?.ojo === true && peticionDeServicio(req)) {`;
  assert.equal(seConsumeElResultado(codigo, 'peticionDeServicio'), true);
});

test('asignada a una variable, si', () => {
  assert.equal(
    seConsumeElResultado('  const esServicio = peticionDeServicio(req);', 'peticionDeServicio'),
    true,
  );
});

test('devuelta, si', () => {
  assert.equal(seConsumeElResultado('  return peticionDeServicio(req);', 'peticionDeServicio'), true);
});

// --- El estado de hoy --------------------------------------------------------

test('hoy ninguna edge con verify_jwt = false esta abierta', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('las seis de la BD siguen en el toml', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync('supabase/config.toml', 'utf8');
  assert.deepEqual(funcionesSinVerificacion(toml).sort(), [
    'agenda-optimizador',
    'avisar-fin-prueba',
    'enviar-informe-periodico',
    'registrar-vigilancia',
    'sincronizar-descuento-referidos',
    'vigilar-agenda',
  ]);
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'edges-autorizadas');
  assert.equal(vigilante.ambito, 'seguridad');
});
