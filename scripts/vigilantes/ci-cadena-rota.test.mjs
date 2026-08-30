// Tests del vigilante de la cadena de CI. Validan la logica pura
// (revisarCadenaCI / denoTestSinAllowEnv / cargarTareasDeno), sin tocar workflows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { revisarCadenaCI, denoTestSinAllowEnv, cargarTareasDeno } from './ci-cadena-rota.mjs';

const TAREAS = {
  'test:ia': 'deno test --no-config --allow-net supabase/functions/shared/x.test.ts',
  'test:claves': 'deno test --no-config --allow-env shared/y.test.ts',
  'test:todo': 'deno test -A shared/z.test.ts',
};

describe('denoTestSinAllowEnv', () => {
  it('caza deno test inline sin --allow-env', () => {
    assert.equal(denoTestSinAllowEnv('deno test shared/x.test.ts', {}), true);
  });

  it('no marca deno test inline con --allow-env ni -A', () => {
    assert.equal(denoTestSinAllowEnv('deno test --allow-env shared/x.test.ts', {}), false);
    assert.equal(denoTestSinAllowEnv('deno test -A shared/x.test.ts', {}), false);
  });

  it('resuelve deno task a traves de deno.json: la forma del incidente real', () => {
    // El paso del yml parece inofensivo; el flag que falta vive en el JSON.
    assert.equal(denoTestSinAllowEnv('deno task test:ia', TAREAS), true);
  });

  it('no marca la tarea cuando deno.json ya lleva el flag', () => {
    assert.equal(denoTestSinAllowEnv('deno task test:claves', TAREAS), false);
    assert.equal(denoTestSinAllowEnv('deno task test:todo', TAREAS), false);
  });

  it('no confunde deno task con deno check ni con tareas inexistentes', () => {
    assert.equal(denoTestSinAllowEnv('deno task check:edges', TAREAS), false);
    assert.equal(denoTestSinAllowEnv('deno task no_existe', TAREAS), false);
  });
});

describe('cargarTareasDeno', () => {
  it('parsea JSON plano', () => {
    assert.deepEqual(cargarTareasDeno('{"tasks":{"a":"deno test a"}}'), { a: 'deno test a' });
  });

  it('parsea deno.jsonc con comentarios de linea', () => {
    const jsonc = '{\n  // tareas\n  "tasks": { "a": "deno test a" }\n}';
    assert.deepEqual(cargarTareasDeno(jsonc), { a: 'deno test a' });
  });

  it('devuelve {} con texto que no es JSON', () => {
    assert.deepEqual(cargarTareasDeno('esto no es json'), {});
    assert.deepEqual(cargarTareasDeno(undefined), {});
  });
});

describe('revisarCadenaCI', () => {
  const doc = (steps) => ({ jobs: { check: { steps } } });

  it('flaggea un deno task de test cuya tarea no lleva --allow-env', () => {
    const h = revisarCadenaCI(
      doc([{ name: 'Tests IA', run: 'deno task test:ia' }]),
      '.github/workflows/ci.yml',
      TAREAS,
    );
    assert.equal(h.length, 1);
    assert.equal(h[0].nivel, 'bloqueante');
    assert.match(h[0].detalle, /test:ia/);
  });

  it('no flaggea cuando la tarea lleva el flag', () => {
    const h = revisarCadenaCI(
      doc([{ name: 'Claves', run: 'deno task test:claves' }]),
      'ci.yml',
      TAREAS,
    );
    assert.equal(h.length, 0);
  });

  it('flaggea un vigilante detras de un paso fragil sin if: always()', () => {
    const h = revisarCadenaCI(
      doc([
        { name: 'Tests unitarios', run: 'npm test' },
        { name: 'Vigilantes de invariantes', run: 'node scripts/vigilantes/index.mjs' },
      ]),
      'ci.yml',
      {},
    );
    const skip = h.find((x) => x.clave.includes('cascade-skip'));
    assert.ok(skip, 'deberia haber hallazgo de cascade-skip');
    assert.equal(skip.nivel, 'aviso');
  });

  it('no flaggea al vigilante si lleva if: always() o va primero', () => {
    const conAlways = revisarCadenaCI(
      doc([
        { name: 'Tests unitarios', run: 'npm test' },
        { name: 'Vigilantes de invariantes', if: 'always()', run: 'node scripts/vigilantes/index.mjs' },
      ]),
      'ci.yml',
      {},
    );
    assert.equal(conAlways.filter((x) => x.clave.includes('cascade-skip')).length, 0);

    const primero = revisarCadenaCI(
      doc([
        { name: 'Vigilantes de invariantes', run: 'node scripts/vigilantes/index.mjs' },
        { name: 'Tests unitarios', run: 'npm test' },
      ]),
      'ci.yml',
      {},
    );
    assert.equal(primero.length, 0);
  });

  it('un paso de build previo no cuenta como rompe-cadena', () => {
    // El peso del bundle necesita el build: pedirle if: always() sin build seria
    // pedir un falso rojo. Si el build falla, el job ya va rojo ruidoso.
    const h = revisarCadenaCI(
      doc([
        { name: 'Compilar la app web', run: 'npm run build:web' },
        { name: 'Vigilante de peso del bundle', run: 'node scripts/vigilantes/peso-bundle.mjs' },
      ]),
      'ci.yml',
      {},
    );
    assert.equal(h.length, 0);
  });

  it('detecta vigilantes tambien por el run, no solo por el name', () => {
    const h = revisarCadenaCI(
      doc([
        { name: 'Tests unitarios', run: 'npm test' },
        { name: 'Puerta de claves', run: 'node scripts/vigilantes/index.mjs --solo claves' },
      ]),
      'ci.yml',
      {},
    );
    assert.ok(h.some((x) => x.clave.includes('cascade-skip')));
  });
});
