import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import vigilante, {
  calcularP95,
  evaluarLatenciaEdges,
  evaluarPresupuestos,
  analizarMediciones,
  PRESUPUESTO_MS_CARGA,
  LIMITE_LONG_TASKS_N,
  CUOTA_PETICIONES_N1,
  LATENCIA_EDGE_P95_MAX,
} from './rendimiento.mjs';
import { AnclaPerdida } from './nucleo.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./rendimiento.mjs', import.meta.url));

test('el vigilante rendimiento cumple el contrato estándar de núcleo', () => {
  assert.equal(vigilante.nombre, 'rendimiento');
  assert.equal(vigilante.ambito, 'rendimiento');
  assert.ok(typeof vigilante.descripcion === 'string');
  assert.equal(typeof vigilante.ejecutar, 'function');
});

test('calcularP95 calcula correctamente el percentil 95', () => {
  assert.equal(calcularP95([]), 0);
  assert.equal(calcularP95([100]), 100);

  // 100 elementos de 1 a 100 -> p95 debe ser 95 o 96
  const muestra = Array.from({ length: 100 }, (_, i) => i + 1);
  const p95 = calcularP95(muestra);
  assert.ok(p95 >= 95 && p95 <= 96, `p95 calculado fue ${p95}`);

  // Filtra NaNs y valores no numéricos
  assert.equal(calcularP95([50, NaN, 'invalido', 150, 200]), 200);
});

test('evaluarLatenciaEdges audita latencias frente al objetivo p95 < 350ms', () => {
  const metricasOptimas = {
    'chispa-landing': [120, 140, 180, 210, 250],
    'crear-checkout-cobro': { p95: 280 },
    'validate-captcha': 95,
  };

  const hallazgosOptimos = evaluarLatenciaEdges(metricasOptimas);
  assert.equal(hallazgosOptimos.length, 0, 'No debe haber hallazgos cuando todas las edges están < 350ms');

  const metricasDegradadas = {
    'orquestador-ia': [150, 200, 320, 420, 480], // p95 > 350ms
    'chispa-vision-corte': { p95: 520 },        // p95 > 350ms
    'portal-suscripcion': 110,                  // ok
  };

  const hallazgosDegradados = evaluarLatenciaEdges(metricasDegradadas);
  assert.equal(hallazgosDegradados.length, 2);
  assert.ok(hallazgosDegradados.some((h) => h.clave.includes('orquestador-ia')));
  assert.ok(hallazgosDegradados.some((h) => h.clave.includes('chispa-vision-corte')));
  assert.equal(hallazgosDegradados[0].nivel, 'aviso');
  assert.equal(hallazgosDegradados[0].ambito, 'rendimiento');
});

test('evaluarPresupuestos comprueba carga <1.8s, long tasks <=2 y peticiones N+1 <=6', () => {
  const medidasBuenas = {
    agenda: {
      ms_carga: 1450,
      long_tasks_n: 1,
      long_tasks_ms: 60,
      peticiones: 4,
    },
    caja: {
      ms_carga: 1790,
      long_tasks_n: 2,
      long_tasks_ms: 90,
      peticiones: 6,
    },
  };

  const hallazgosBuenos = evaluarPresupuestos(medidasBuenas);
  assert.equal(hallazgosBuenos.length, 0, 'Medidas dentro de presupuesto no emiten hallazgos');

  const medidasExcedidas = {
    clientes: {
      ms_carga: 3200,      // > 1800ms
      long_tasks_n: 5,     // > 2
      long_tasks_ms: 380,
      peticiones: 18,      // > 6
    },
  };

  const hallazgosExcedidos = evaluarPresupuestos(medidasExcedidas);
  assert.equal(hallazgosExcedidos.length, 3, 'Debe emitir 3 avisos para las 3 violaciones');

  const claves = hallazgosExcedidos.map((h) => h.clave);
  assert.ok(claves.includes('rendimiento/presupuesto-carga:clientes'));
  assert.ok(claves.includes('rendimiento/longtasks-exceso:clientes'));
  assert.ok(claves.includes('rendimiento/cuota-n1:clientes'));
});

test('analizarMediciones detecta degeneración crítica y variaciones de consultas', () => {
  const base = {
    agenda: { ms_carga: 2000, long_tasks_n: 1, long_tasks_ms: 60, peticiones: 10 },
    caja: { ms_carga: 1500, long_tasks_n: 1, long_tasks_ms: 50, peticiones: 5 },
  };

  const actuales = {
    agenda: { ms_carga: 18000, long_tasks_n: 1, long_tasks_ms: 70, peticiones: 10 }, // > 15s y > 3x -> bloqueante
    caja: { ms_carga: 1600, long_tasks_n: 1, long_tasks_ms: 50, peticiones: 25 },     // fuerte aumento peticiones -> aviso
  };

  const { hallazgos, vigilantes } = analizarMediciones(actuales, base);
  assert.equal(vigilantes.length, 2);

  const bloqueante = hallazgos.find((h) => h.nivel === 'bloqueante');
  assert.ok(bloqueante, 'Debe haber un hallazgo bloqueante por degeneración extrema de carga');
  assert.match(bloqueante.titulo, /degeneración crítica/);

  const avisoPeticiones = hallazgos.find((h) => h.clave === 'rendimiento/peticiones-caja');
  assert.ok(avisoPeticiones, 'Debe alertar sobre salto brusco en peticiones a Supabase');
});

test('analizarMediciones reporta pantallas nuevas y pantallas no medidas', () => {
  const base = {
    pantallaA: { ms_carga: 1200, long_tasks_n: 0, long_tasks_ms: 0, peticiones: 2 },
  };

  const actuales = {
    pantallaNueva: { ms_carga: 1500, long_tasks_n: 1, long_tasks_ms: 50, peticiones: 3 },
  };

  const { hallazgos } = analizarMediciones(actuales, base);
  assert.ok(hallazgos.some((h) => h.clave === 'rendimiento/nueva-pantallaNueva'));
  assert.ok(hallazgos.some((h) => h.clave === 'rendimiento/sin-medida-pantallaA'));
});

test('ejecutar lanza AnclaPerdida si la línea base no existe', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-rend-test-'));
  try {
    await assert.rejects(
      async () => {
        await vigilante.ejecutar({ raiz: tempDir });
      },
      AnclaPerdida,
      'Debe fallar con AnclaPerdida si no existe la línea base',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ejecutar en el repositorio real devuelve hallazgos válidos sin reventar', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.ok(Array.isArray(hallazgos), 'Debe devolver un array');
  for (const h of hallazgos) {
    assert.ok(h.clave, 'Cada hallazgo debe tener clave');
    assert.equal(h.ambito, 'rendimiento');
    assert.ok(['aviso', 'bloqueante'].includes(h.nivel));
    assert.ok(h.titulo);
  }
});

test('ejecución CLI como proceso hijo procesa JSONL y genera salida', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-rend-cli-'));
  try {
    const jsonlPath = path.join(tempDir, 'mediciones.jsonl');
    const outJsonPath = path.join(tempDir, 'salida-rendimiento.json');

    const lineaMock = JSON.stringify({
      pantalla: 'citas',
      ms_carga: 1400,
      long_tasks_n: 1,
      long_tasks_ms: 70,
      fps_medio: 60,
      peticiones: 5,
    });
    writeFileSync(jsonlPath, `${lineaMock}\n`, 'utf8');

    const r = spawnSync(process.execPath, [SCRIPT_PATH, jsonlPath, outJsonPath, 'ci'], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    assert.equal(r.signal, null, 'El proceso no debe colgarse');
    assert.equal(r.status, 0, `Esperaba código 0. Stderr: ${r.stderr}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
