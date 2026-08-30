// scripts/vigilantes/compilar-estado.stress.test.mjs
//
// ADVERSARIAL STRESS TEST SUITE for Milestone M1
// Tests compilar-estado.mjs, health calculation boundaries,
// corrupted smoke.json, non-git environments, 1000+ finding loads,
// malicious/escaped inputs, and edge cases.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  compilarEstado,
  generarMarkdownEstado,
  obtenerMetadatosGit,
} from './compilar-estado.mjs';
import { AnclaPerdida, hallazgo } from './nucleo.mjs';

test('STRESS: smoke.json corrupted (invalid JSON syntax) is swallowed safely', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-corrupt-smoke-'));
  const sistemaDir = path.join(tempDir, '.sistema');
  mkdirSync(sistemaDir, { recursive: true });
  writeFileSync(path.join(sistemaDir, 'smoke.json'), '{ invalid json syntax !!! @@##$$', 'utf8');

  try {
    const s = await compilarEstado({
      raiz: tempDir,
      dirSalida: sistemaDir,
      escribirArchivos: false,
      incluirBD: false,
      vigilantes: [],
    });

    assert.equal(s.capas.visual.hallazgos.length, 0, 'No debe cargar hallazgos de smoke corrupto');
    assert.equal(s.resumen.salud, 'optima');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('STRESS: smoke.json with non-array hallazgos property does not crash', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-nonarray-smoke-'));
  const sistemaDir = path.join(tempDir, '.sistema');
  mkdirSync(sistemaDir, { recursive: true });
  writeFileSync(path.join(sistemaDir, 'smoke.json'), JSON.stringify({ hallazgos: "not an array" }), 'utf8');

  try {
    const s = await compilarEstado({
      raiz: tempDir,
      dirSalida: sistemaDir,
      escribirArchivos: false,
      incluirBD: false,
      vigilantes: [],
    });

    assert.equal(s.capas.visual.hallazgos.length, 0);
    assert.equal(s.resumen.salud, 'optima');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('STRESS: Vigilante throwing arbitrary non-Error objects (null, string, circular)', async () => {
  const vNull = {
    nombre: 'v-null',
    ambito: 'seguridad',
    ejecutar: async () => { throw null; },
  };

  const vString = {
    nombre: 'v-string',
    ambito: 'seguridad',
    ejecutar: async () => { throw 'String error fatal'; },
  };

  const vObject = {
    nombre: 'v-obj',
    ambito: 'rendimiento',
    ejecutar: async () => {
      const err = { msg: 'custom error object' };
      throw err;
    },
  };

  const snapshot = await compilarEstado({
    vigilantes: [vNull, vString, vObject],
    escribirArchivos: false,
    incluirBD: false,
  });

  assert.equal(snapshot.resumen.salud, 'critica');
  assert.equal(snapshot.resumen.bloqueantes, 3, 'Los 3 fallos deben convertirse en bloqueantes');
  assert.equal(snapshot.hallazgos.length, 3);
  assert.ok(snapshot.hallazgos.some((h) => h.clave === 'v-null/ancla-perdida'));
  assert.ok(snapshot.hallazgos.some((h) => h.clave === 'v-string/ancla-perdida'));
  assert.ok(snapshot.hallazgos.some((h) => h.clave === 'v-obj/ancla-perdida'));
});

test('STRESS: Exact health boundary testing (15 avisos -> optima, 16 avisos -> degradada)', async () => {
  const generarAvisos = (n) => ({
    nombre: `v-avisos-${n}`,
    ambito: 'rendimiento',
    ejecutar: async () => Array.from({ length: n }, (_, i) =>
      hallazgo({
        clave: `aviso-${i}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `Aviso ${i}`,
      })
    ),
  });

  // Test exactly 15 avisos -> optima
  const s15 = await compilarEstado({
    vigilantes: [generarAvisos(15)],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(s15.resumen.avisos, 15);
  assert.equal(s15.resumen.bloqueantes, 0);
  assert.equal(s15.resumen.salud, 'optima', '15 avisos deben resultar en optima');

  // Test exactly 16 avisos -> degradada
  const s16 = await compilarEstado({
    vigilantes: [generarAvisos(16)],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(s16.resumen.avisos, 16);
  assert.equal(s16.resumen.bloqueantes, 0);
  assert.equal(s16.resumen.salud, 'degradada', '16 avisos deben resultar en degradada');

  // Test 1 bloqueante + 0 avisos -> critica
  const vBloq = {
    nombre: 'v-bloq',
    ambito: 'fiscal',
    ejecutar: async () => [
      hallazgo({
        clave: 'fiscal/iva-roto',
        nivel: 'bloqueante',
        ambito: 'fiscal',
        titulo: 'IVA incorrecto',
      }),
    ],
  };
  const sBloq = await compilarEstado({
    vigilantes: [vBloq],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(sBloq.resumen.salud, 'critica');

  // Test 1 critico + 0 avisos -> critica
  const vCrit = {
    nombre: 'v-crit',
    ambito: 'seguridad',
    ejecutar: async () => [
      hallazgo({
        clave: 'seguridad/rce',
        nivel: 'critico',
        ambito: 'seguridad',
        titulo: 'Vulnerabilidad RCE',
      }),
    ],
  };
  const sCrit = await compilarEstado({
    vigilantes: [vCrit],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(sCrit.resumen.salud, 'critica');
});

test('STRESS: Massive finding load (1,500 findings) renders Markdown and JSON without memory exhaustion', async () => {
  const totalFindings = 1500;
  const bigVigilante = {
    nombre: 'v-massive',
    ambito: 'rendimiento',
    ejecutar: async () => Array.from({ length: totalFindings }, (_, i) =>
      hallazgo({
        clave: `massive/perf-${i}`,
        nivel: i === 0 ? 'bloqueante' : 'aviso',
        ambito: 'rendimiento',
        titulo: `Detalle de rendimiento masivo índice #${i}`,
        detalle: `Detalle de consumo de memoria y queries N+1 en componente <PantallaMegaGrid_${i}> con caracteres especiales <>&"' y símbolos ¡¿€$`,
        fichero: `src/components/PantallaMegaGrid_${i}.tsx`,
        linea: i + 1,
      })
    ),
  };

  const t0 = Date.now();
  const snapshot = await compilarEstado({
    vigilantes: [bigVigilante],
    escribirArchivos: false,
    incluirBD: false,
  });

  assert.equal(snapshot.resumen.total_hallazgos, 1500);
  assert.equal(snapshot.resumen.bloqueantes, 1);
  assert.equal(snapshot.resumen.avisos, 1499);
  assert.equal(snapshot.resumen.salud, 'critica');

  const md = generarMarkdownEstado(snapshot);
  const elapsed = Date.now() - t0;

  assert.ok(md.includes('Detalle de Hallazgos Activos (1500)'));
  assert.ok(md.includes('PantallaMegaGrid_1499.tsx:1500'));
  assert.ok(elapsed < 5000, `El renderizado de 1500 hallazgos debe tardar <5s (tardó ${elapsed}ms)`);
});

test('STRESS: Special characters, Markdown injections and unicode in findings', () => {
  const maliciousSnapshot = {
    version: 1,
    timestamp: '2026-08-30T17:00:00Z',
    duracion_ms: 50,
    git: { branch: 'feat/test--<script>alert(1)</script>', commit: 'deadbeef12345678', dirty: true },
    resumen: {
      total_hallazgos: 2,
      bloqueantes: 1,
      avisos: 1,
      vigilantes_ejecutados: 2,
      salud: 'critica',
    },
    capas: {
      estatica: { vigilantes: 2, bloqueantes: 1, avisos: 1, detalle: [] },
      base_datos: { disponible: false, vectores: 10, hallazgos: [] },
      visual: { pilares: 3, hallazgos: [] },
      rendimiento: { hallazgos_rendimiento: 0 },
      meta: { anclas_vivas: false, hallazgos: [] },
    },
    hallazgos: [
      {
        clave: 'malicious/xss-md',
        ambito: 'seguridad',
        nivel: 'bloqueante',
        titulo: 'SQL Injection in `WHERE` clause: \' OR 1=1; DROP TABLE users; --',
        detalle: 'Injection payload: <script>alert("hacked")</script> and **bold** [link](https://evil.com)',
        fichero: 'supabase/functions/<evil>/index.ts',
        linea: 999999,
      },
      {
        clave: 'unicode/emojis',
        ambito: 'otros',
        nivel: 'aviso',
        titulo: 'Test de emojis y caracteres chinos: 🚀💥🔥 💇‍♂️✂️ 💈 中文测试 日本語',
        detalle: 'Detalle multilínea:\nLínea 2 con tab\t\ty comillas "dobles" y \'simples\'',
        fichero: null,
        linea: null,
      },
    ],
  };

  const md = generarMarkdownEstado(maliciousSnapshot);
  assert.ok(md.includes('CRÍTICA'));
  assert.ok(md.includes('DROP TABLE users; --'));
  assert.ok(md.includes('🚀💥🔥 💇‍♂️✂️ 💈 中文测试 日本語'));
  assert.ok(md.includes('supabase/functions/<evil>/index.ts:999999'));
});

test('STRESS: Writing files to deeply nested non-existent directory creates directories recursively', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-deep-dir-'));
  const deeplyNestedDir = path.join(tempDir, 'sub1', 'sub2', 'sub3', 'deep_sistema');

  try {
    const s = await compilarEstado({
      dirSalida: deeplyNestedDir,
      escribirArchivos: true,
      incluirBD: false,
      vigilantes: [],
    });

    const jsonPath = path.join(deeplyNestedDir, 'estado-salud.json');
    const mdPath = path.join(deeplyNestedDir, 'ESTADO_SALUD.md');

    assert.ok(existsSync(jsonPath), 'Debe crear estado-salud.json en ruta profunda');
    assert.ok(existsSync(mdPath), 'Debe crear ESTADO_SALUD.md en ruta profunda');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
