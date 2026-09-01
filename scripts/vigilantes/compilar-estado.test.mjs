// scripts/vigilantes/compilar-estado.test.mjs
//
// Tests unitarios para el compilador de estado de salud del sistema Mecha OS.
// Verifica la consolidación de capas, cálculo de salud, renderizado Markdown,
// manejo de errores, git fallback y ejecución CLI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  compilarEstado,
  generarMarkdownEstado,
  obtenerMetadatosGit,
  ESTATICOS,
} from './compilar-estado.mjs';
import { RAIZ, AnclaPerdida, hallazgo } from './nucleo.mjs';

const RUNNER = fileURLToPath(new URL('./compilar-estado.mjs', import.meta.url));

// Los dos artefactos de `.sistema/` estan VERSIONADOS: correr la suite no puede
// degradarlos. Se leen antes y despues de lanzar el CLI para probarlo.
const ARTEFACTOS_VERSIONADOS = [
  path.join(RAIZ, '.sistema', 'estado-salud.json'),
  path.join(RAIZ, '.sistema', 'ESTADO_SALUD.md'),
];
const leerSiExiste = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

test('compilarEstado devuelve un snapshot con la estructura de contrato requerida', async () => {
  const snapshot = await compilarEstado({ escribirArchivos: false, incluirBD: false, rapido: true });

  assert.equal(snapshot.version, 1, 'Versión de snapshot debe ser 1');
  assert.ok(typeof snapshot.timestamp === 'string', 'Timestamp debe ser string');
  assert.ok(typeof snapshot.duracion_ms === 'number', 'Duración debe ser numérico');
  assert.ok(snapshot.git && typeof snapshot.git.branch === 'string', 'Git debe incluir rama');
  assert.ok(typeof snapshot.git.dirty === 'boolean', 'Git debe incluir flag dirty');

  assert.ok(snapshot.resumen, 'Debe incluir resumen');
  assert.ok(typeof snapshot.resumen.total_hallazgos === 'number', 'total_hallazgos debe ser numérico');
  assert.ok(typeof snapshot.resumen.bloqueantes === 'number', 'bloqueantes debe ser numérico');
  assert.ok(typeof snapshot.resumen.avisos === 'number', 'avisos debe ser numérico');
  assert.ok(['optima', 'degradada', 'critica'].includes(snapshot.resumen.salud), 'Salud debe ser válida');

  assert.ok(snapshot.capas, 'Debe contener desglose de capas');
  assert.ok(snapshot.capas.estatica, 'Capa estática requerida');
  assert.ok(snapshot.capas.base_datos, 'Capa base de datos requerida');
  assert.ok(snapshot.capas.visual, 'Capa visual requerida');
  assert.ok(snapshot.capas.rendimiento, 'Capa rendimiento requerida');
  assert.ok(snapshot.capas.meta, 'Capa meta requerida');
  assert.ok(Array.isArray(snapshot.hallazgos), 'Hallazgos debe ser un array');
});

test('cálculo de salud general clasifica correctamente optima, degradada y critica', async () => {
  // Mock 1: Sin fallos -> optima
  const vigilanteLimpio = {
    nombre: 'mock-limpio',
    ambito: 'seguridad',
    ejecutar: async () => [],
  };

  const s1 = await compilarEstado({
    vigilantes: [vigilanteLimpio],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(s1.resumen.salud, 'optima');
  assert.equal(s1.resumen.bloqueantes, 0);

  // Mock 2: Más de 15 avisos -> degradada
  const vigilanteAvisos = {
    nombre: 'mock-avisos',
    ambito: 'rendimiento',
    ejecutar: async () => Array.from({ length: 18 }, (_, i) =>
      hallazgo({
        clave: `aviso-${i}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `Aviso ${i}`,
      })
    ),
  };

  const s2 = await compilarEstado({
    vigilantes: [vigilanteAvisos],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(s2.resumen.salud, 'degradada');
  assert.equal(s2.resumen.bloqueantes, 0);
  assert.equal(s2.resumen.avisos, 18);

  // Mock 3: Al menos 1 bloqueante -> critica
  const vigilanteCritico = {
    nombre: 'mock-critico',
    ambito: 'seguridad',
    ejecutar: async () => [
      hallazgo({
        clave: 'seguridad/bloqueo',
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: 'Fallo crítico de seguridad',
      }),
    ],
  };

  const s3 = await compilarEstado({
    vigilantes: [vigilanteCritico],
    escribirArchivos: false,
    incluirBD: false,
  });
  assert.equal(s3.resumen.salud, 'critica');
  assert.equal(s3.resumen.bloqueantes, 1);
});

test('captura errores y AnclaPerdida de vigilantes como hallazgos bloqueantes sin tumbar el compilador', async () => {
  const vigilanteCiego = {
    nombre: 'mock-ciego',
    ambito: 'precios',
    ejecutar: async () => {
      throw new AnclaPerdida('El regex de precios ya no casa', {
        fichero: 'web/index.html',
        ancla: 'precio-esencial',
      });
    },
  };

  const snapshot = await compilarEstado({
    vigilantes: [vigilanteCiego],
    escribirArchivos: false,
    incluirBD: false,
  });

  assert.equal(snapshot.resumen.salud, 'critica');
  assert.equal(snapshot.resumen.bloqueantes, 1);
  const h = snapshot.hallazgos.find((x) => x.clave === 'mock-ciego/ancla-perdida');
  assert.ok(h, 'Debe registrar hallazgo de ancla perdida');
  assert.equal(h.nivel, 'bloqueante');
  assert.ok(h.detalle.includes('Ancla perdida'));
});

test('generarMarkdownEstado formatea correctamente tablas, insignias y hallazgos', () => {
  const mockSnapshot = {
    version: 1,
    timestamp: '2026-08-30T17:00:00Z',
    duracion_ms: 120,
    git: { branch: 'master', commit: 'abcdef123456', dirty: false },
    resumen: {
      total_hallazgos: 1,
      bloqueantes: 0,
      avisos: 1,
      vigilantes_ejecutados: 17,
      salud: 'optima',
    },
    capas: {
      estatica: { vigilantes: 17, bloqueantes: 0, avisos: 1, detalle: [] },
      base_datos: { disponible: true, vectores: 10, hallazgos: [] },
      visual: { pilares: 3, hallazgos: [] },
      rendimiento: { hallazgos_rendimiento: 1 },
      meta: { anclas_vivas: true, hallazgos: [] },
    },
    hallazgos: [
      {
        clave: 'rendimiento/peso-bundle',
        ambito: 'rendimiento',
        nivel: 'aviso',
        titulo: 'Peso de bundle superior al objetivo',
        detalle: '8.4 MB vs 8.2 MB',
        fichero: 'web/app',
        linea: 1,
      },
    ],
  };

  const md = generarMarkdownEstado(mockSnapshot);

  assert.ok(md.includes('# 🛡️ Estado de Salud del Sistema — MECHA OS'));
  assert.ok(md.includes('🟢 ÓPTIMA'));
  assert.ok(md.includes('Rama `master` · Commit `abcdef12`'));
  assert.ok(md.includes('### 1. Capa 1: Invariantes Estáticos'));
  assert.ok(md.includes('### 2. Capa 2: Base de Datos PostgreSQL'));
  assert.ok(md.includes('### 3. Capa 3: Vigilancia Visual'));
  assert.ok(md.includes('### 4. Capa 4: Rendimiento'));
  assert.ok(md.includes('### 5. Capa 5: Meta-Vigilancia'));
  assert.ok(md.includes('Peso de bundle superior al objetivo'));
  assert.ok(md.includes('`web/app:1`'));
});

test('persistencia de archivos escribe correctamente estado-salud.json y ESTADO_SALUD.md', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-salud-test-'));
  try {
    const s = await compilarEstado({
      dirSalida: tempDir,
      escribirArchivos: true,
      incluirBD: false,
      rapido: true,
    });

    const jsonPath = path.join(tempDir, 'estado-salud.json');
    const mdPath = path.join(tempDir, 'ESTADO_SALUD.md');

    assert.ok(existsSync(jsonPath), 'Debe crear estado-salud.json');
    assert.ok(existsSync(mdPath), 'Debe crear ESTADO_SALUD.md');

    const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(jsonContent.version, 1);
    assert.equal(jsonContent.resumen.salud, s.resumen.salud);

    const mdContent = readFileSync(mdPath, 'utf8');
    assert.ok(mdContent.includes('Estado de Salud del Sistema'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('obtenerMetadatosGit gestiona errores y directorios sin git sin reventar', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-nogit-'));
  try {
    const meta = obtenerMetadatosGit(tempDir);
    assert.equal(meta.commit, 'desconocido');
    assert.equal(meta.branch, 'desconocido');
    assert.equal(meta.dirty, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ejecución CLI como proceso hijo completa con código 0 sin tocar los artefactos versionados', () => {
  const antes = ARTEFACTOS_VERSIONADOS.map(leerSiExiste);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-salud-cli-'));

  try {
    const r = spawnSync(process.execPath, [RUNNER, '--rapido', '--salida', tempDir], {
      encoding: 'utf8',
      timeout: 60_000,
    });

    assert.equal(r.signal, null, 'El proceso terminó limpiamente');
    assert.equal(r.status, 0, `Esperaba salida 0, obtuvo ${r.status}. stderr:\n${r.stderr}`);
    assert.ok(r.stdout.includes('MECHA OS - Compilación de Estado de Salud'));

    assert.ok(existsSync(path.join(tempDir, 'estado-salud.json')), '--salida debe recibir el snapshot');
    assert.ok(existsSync(path.join(tempDir, 'ESTADO_SALUD.md')), '--salida debe recibir el markdown');

    assert.deepEqual(
      ARTEFACTOS_VERSIONADOS.map(leerSiExiste),
      antes,
      'La suite no puede degradar el snapshot versionado de .sistema/: un panel de salud ' +
        'reescrito por una corrida parcial de pruebas es exactamente el "verde porque nadie mira"',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('el CLI rechaza --salida sin ruta en vez de escribir en .sistema por descuido', () => {
  const antes = ARTEFACTOS_VERSIONADOS.map(leerSiExiste);

  const r = spawnSync(process.execPath, [RUNNER, '--salida'], {
    encoding: 'utf8',
    timeout: 60_000,
  });

  assert.equal(r.status, 1, `Esperaba salida 1, obtuvo ${r.status}. stderr:\n${r.stderr}`);
  assert.ok(r.stderr.includes('--salida requiere una ruta'), 'Debe explicar el uso correcto');
  assert.deepEqual(ARTEFACTOS_VERSIONADOS.map(leerSiExiste), antes, 'Un --salida mal escrito no escribe nada');
});
