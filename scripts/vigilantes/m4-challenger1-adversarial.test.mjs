import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import rendimientoVigilante, {
  calcularP95,
  evaluarLatenciaEdges,
  evaluarPresupuestos,
  analizarMediciones,
  PRESUPUESTO_MS_CARGA,
  LIMITE_LONG_TASKS_N,
  CUOTA_PETICIONES_N1,
  LATENCIA_EDGE_P95_MAX,
  CARGA_EXTREMA_MS,
} from './rendimiento.mjs';

import calidadVigilante, {
  medirProfundidadAnidamiento,
  calcularComplejidadCiclomatica,
  detectarDuplicacion,
  revisarArchivo,
  LIMITE_LINEAS_COMPONENTE,
  LIMITE_PROFUNDIDAD_ANIDAMIENTO,
  MINIMO_LINEAS_DUPLICADAS,
} from './calidad-codigo.mjs';

import { AnclaPerdida } from './nucleo.mjs';

const SCRIPT_RENDIMIENTO = fileURLToPath(new URL('./rendimiento.mjs', import.meta.url));

// ============================================================================
// PART 1: ADVERSARIAL STRESS TESTS ON RENDIMIENTO.MJS
// ============================================================================

test('ADVERSARIAL [Rendimiento]: Catastrophically slow screens (>15s and >3x baseline)', () => {
  const base = {
    agenda: { ms_carga: 1200, long_tasks_n: 1, long_tasks_ms: 40, peticiones: 4 },
    caja: { ms_carga: 2000, long_tasks_n: 0, long_tasks_ms: 0, peticiones: 3 },
    clientes: { ms_carga: 4000, long_tasks_n: 2, long_tasks_ms: 80, peticiones: 5 },
    servicios: { ms_carga: 6000, long_tasks_n: 1, long_tasks_ms: 50, peticiones: 4 },
  };

  const actuals = {
    // 1. Catastrophic: 16,000ms > max(1200*3, 15000) = 15000 -> Bloqueante
    agenda: { ms_carga: 16000, long_tasks_n: 1, long_tasks_ms: 40, peticiones: 4 },
    // 2. Catastrophic extreme: 35,000ms > max(2000*3, 15000) = 15000 -> Bloqueante
    caja: { ms_carga: 35000, long_tasks_n: 10, long_tasks_ms: 1500, peticiones: 30 },
    // 3. Catastrophic on high base: base=6000, 3x=18000, actual=19000 > max(18000, 15000) = 18000 -> Bloqueante
    servicios: { ms_carga: 19000, long_tasks_n: 1, long_tasks_ms: 50, peticiones: 4 },
    // 4. Slow but under 3x and 15s (12,000ms vs 4,000ms base -> 3x is 12000, not strictly greater, and <15000) -> Not bloqueante
    clientes: { ms_carga: 12000, long_tasks_n: 2, long_tasks_ms: 80, peticiones: 5 },
  };

  const { hallazgos, vigilantes } = analizarMediciones(actuals, base);

  const bloqueantes = hallazgos.filter((h) => h.nivel === 'bloqueante');
  assert.equal(bloqueantes.length, 3, 'Debe detectar exactamente 3 degeneraciones críticas bloqueantes');

  const clavesBloqueantes = bloqueantes.map((b) => b.clave);
  assert.ok(clavesBloqueantes.includes('rendimiento/carga-agenda'));
  assert.ok(clavesBloqueantes.includes('rendimiento/carga-caja'));
  assert.ok(clavesBloqueantes.includes('rendimiento/carga-servicios'));
  assert.ok(!clavesBloqueantes.includes('rendimiento/carga-clientes'));

  // Verificar que los vigilantes de pantalla marcaron ok = false
  const vigAgenda = vigilantes.find((v) => v.nombre === 'rendimiento/agenda');
  const vigCaja = vigilantes.find((v) => v.nombre === 'rendimiento/caja');
  const vigServicios = vigilantes.find((v) => v.nombre === 'rendimiento/servicios');
  const vigClientes = vigilantes.find((v) => v.nombre === 'rendimiento/clientes');

  assert.equal(vigAgenda.ok, false);
  assert.equal(vigCaja.ok, false);
  assert.equal(vigServicios.ok, false);
  assert.equal(vigClientes.ok, true);
});

test('ADVERSARIAL [Rendimiento]: Corrupted JSONL stream & malformed entries via CLI', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-adv-jsonl-'));
  try {
    const jsonlPath = path.join(tempDir, 'corrupted-telemetry.jsonl');
    const outJsonPath = path.join(tempDir, 'out-rendimiento.json');

    // Synthetic corrupted JSONL with mixed valid lines, truncated JSON, binary chunks, and empty lines
    // La base de CI de caja ronda los 15,7 s: el bloqueante de degeneracion
    // extrema exige >15 s Y >3x base (regla de "rendimiento medido" de
    // CLAUDE.md). Un 22.000 magico solo supera la mitad de la condicion y la
    // pantalla salia en aviso: el test verificaba una regla que no existe.
    const baseCaja = JSON.parse(
      readFileSync(new URL('../../tests/smoke/rendimiento-baseline.json', import.meta.url), 'utf8'),
    ).caja;
    const msCatastrofe = Math.max(baseCaja.ms_carga * 3 + 1000, CARGA_EXTREMA_MS + 1000);

    const lines = [
      '', // empty line
      '   ', // whitespace line
      '{"pantalla": "agenda", "ms_carga": 1400, "long_tasks_n": 1, "long_tasks_ms": 40, "fps_medio": 60, "peticiones": 4}',
      '{ malformed json syntax: 12345 }',
      `{"pantalla": "caja", "ms_carga": ${msCatastrofe}, "long_tasks_n": 8, "long_tasks_ms": 900, "fps_medio": 30, "peticiones": 12}`, // catastrophic slow
      'NUL\u0000\u0001\u0002binary_garbage',
      '{"no_pantalla": true, "ms_carga": 1500}', // missing pantalla
      '{"pantalla": null, "ms_carga": 900}',
      '{"pantalla": "clientes", "ms_carga": 850, "long_tasks_n": 0, "long_tasks_ms": 0, "fps_medio": 60, "peticiones": 3}',
    ];

    writeFileSync(jsonlPath, lines.join('\n'), 'utf8');

    // Run CLI on corrupted file
    const res = spawnSync(process.execPath, [SCRIPT_RENDIMIENTO, jsonlPath, outJsonPath, 'ci'], {
      encoding: 'utf8',
      timeout: 15_000,
    });

    // Since 'caja' had a catastrophic load (> 15s and > 3x base), CLI must report the blocker and exit with status 1
    assert.equal(res.status, 1, `Debe salir con código 1 debido al fallo bloqueante. Salida: ${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /BLOQUEANTE/);
    assert.match(res.stdout, /pantalla caja/);

    // Verify valid metrics were parsed despite corrupt lines around them
    assert.match(res.stdout, /3 pantallas medidas/); // agenda, caja, clientes
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ADVERSARIAL [Rendimiento]: Missing and invalid fields in metric payloads', () => {
  // Empty inputs
  assert.equal(calcularP95([]), 0);
  assert.equal(calcularP95(null), 0);
  assert.equal(calcularP95(undefined), 0);
  assert.equal(calcularP95('invalid'), 0);
  assert.equal(calcularP95([NaN, null, undefined, 'abc']), 0);

  // Negative and extreme numbers in p95
  assert.equal(calcularP95([-100, -50, 0]), 0);
  assert.equal(calcularP95([100, 100_000_000]), 100_000_000);

  // Missing fields in evaluarPresupuestos
  const medidasConNulos = {
    pantallaIncompleta: {
      ms_carga: undefined,
      long_tasks_n: null,
      peticiones: NaN,
    },
  };
  const hallazgosPres = evaluarPresupuestos(medidasConNulos);
  // Should not throw or crash
  assert.ok(Array.isArray(hallazgosPres));

  // Missing fields in evaluarLatenciaEdges
  const edgesCorruptas = {
    edgeNull: null,
    edgeUndef: undefined,
    edgeString: 'no es numero',
    edgeVacio: {},
    edgeArrayVacio: [],
    edgeArrayCorrupto: [null, NaN, 'x'],
    edgeNormalOk: 120,
    edgeNormalLenta: 450,
  };
  const hallazgosEdges = evaluarLatenciaEdges(edgesCorruptas);
  assert.equal(hallazgosEdges.length, 1);
  assert.ok(hallazgosEdges[0].clave.includes('edgeNormalLenta'));
});

test('ADVERSARIAL [Rendimiento]: Edge Function exact p95 boundary and outlier resistance', () => {
  // Exact boundary 350ms
  const limite = LATENCIA_EDGE_P95_MAX; // 350

  const metricasBorde = {
    justoDebajo: limite - 0.001,
    justoEnLimite: limite,
    justoEncima: limite + 0.001,
    conPercentilArray: [100, 150, 200, 250, 349, 350, 400],
  };

  const hallazgos = evaluarLatenciaEdges(metricasBorde);
  const claves = hallazgos.map((h) => h.clave);

  assert.ok(!claves.includes('rendimiento/latencia-edge-p95:justoDebajo'));
  assert.ok(claves.includes('rendimiento/latencia-edge-p95:justoEnLimite'));
  assert.ok(claves.includes('rendimiento/latencia-edge-p95:justoEncima'));
  assert.ok(claves.includes('rendimiento/latencia-edge-p95:conPercentilArray'));
});

test('ADVERSARIAL [Rendimiento]: Degraded baseline and unparseable baseline files', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mecha-adv-base-'));
  try {
    const smokeDir = path.join(tempDir, 'tests', 'smoke');
    mkdirSync(smokeDir, { recursive: true });
    const baselineFile = path.join(smokeDir, 'rendimiento-baseline.json');

    // Corrupt JSON in baseline
    writeFileSync(baselineFile, '{ invalid json baseline ::: 12345 }', 'utf8');

    await assert.rejects(
      async () => {
        await rendimientoVigilante.ejecutar({ raiz: tempDir });
      },
      (err) => err instanceof AnclaPerdida && err.message.includes('Error al parsear'),
      'Debe lanzar AnclaPerdida con mensaje explicativo si el baseline está corrupto',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// PART 2: ADVERSARIAL STRESS TESTS ON CALIDAD-CODIGO.MJS
// ============================================================================

test('ADVERSARIAL [Calidad]: Complex nested objects and JSX property structures', () => {
  const codigoObjetosAnidados = `
    import React from 'react';
    export const ComponenteEstilos = () => {
      const config = {
        tema: {
          colores: {
            primario: {
              claro: '#fff',
              oscuro: {
                base: '#000',
                variantes: {
                  sombra: 'rgba(0,0,0,0.5)',
                  brillo: { alpha: 0.8 }
                }
              }
            }
          }
        }
      };
      return <div style={{ margin: { top: 10, left: { inner: 5 } } }}>Hola</div>;
    };
  `;

  const prof = medirProfundidadAnidamiento(codigoObjetosAnidados);
  // Verify that nesting depth is measured without crashing or producing negative levels
  assert.ok(prof >= 1, `Profundidad calculada: ${prof}`);

  const rev = revisarArchivo('components/Estilos.web.tsx', codigoObjetosAnidados);
  assert.ok(Array.isArray(rev.hallazgos));
});

test('ADVERSARIAL [Calidad]: Unescaped & escaped braces inside single, double & template strings', () => {
  const codigoConBracesEnStrings = `
    export function generarTemplates() {
      const a = '{ esta llave no es bloque }';
      const b = "{{{{ multiple unescaped braces }}}}";
      const c = 'escaped \\' { quote } \\' brace';
      const d = "escaped \\" { double } \\" brace";
      const regex1 = /\\{[a-z]+\\}/g;
      const regex2 = /\\}{2,}/;
      
      // Comentarios con trampas:
      // function trampa() { { { { { { { { {
      /* bloque comentario { { { { 
         linea intermedia { { 
         fin bloque } } } */
         
      if (true) {
        return a + b + c + d;
      }
    }
  `;

  const prof = medirProfundidadAnidamiento(codigoConBracesEnStrings);
  // Function (level 1) + if (level 2) = max depth 2. Strings and comments should not inflate depth to 10+
  assert.equal(prof, 2, `Profundidad esperada 2 pero fue ${prof}`);
});

test('ADVERSARIAL [Calidad]: Deeply nested control flow (if/for/while/try/switch > 6 levels)', () => {
  const codigoAnidadoExtremo = `
    export function procesarMatrizCompleja(matriz) {
      if (matriz) { // level 1
        for (const fila of matriz) { // level 2
          if (fila && fila.activa) { // level 3
            while (fila.items.length > 0) { // level 4
              try { // level 5
                if (fila.items[0].prioritario) { // level 6
                  for (let k = 0; k < 5; k++) { // level 7
                    if (k % 2 === 0) { // level 8
                      switch (fila.tipo) { // level 9
                        case 'especial': { // level 10
                          console.log('Nivel 10 alcanzado');
                          break;
                        }
                      }
                    }
                  }
                }
              } catch (err) {
                console.error(err);
              }
            }
          }
        }
      }
    }
  `;

  const prof = medirProfundidadAnidamiento(codigoAnidadoExtremo);
  assert.ok(prof >= 8, `Profundidad esperada >= 8 pero fue ${prof}`);

  const rev = revisarArchivo('app/super-anidado.web.tsx', codigoAnidadoExtremo);
  const hallazgoProf = rev.hallazgos.find((h) => h.clave.includes('anidamiento-profundo'));
  assert.ok(hallazgoProf, 'Debe emitir hallazgo de anidamiento profundo');
  assert.equal(hallazgoProf.nivel, 'aviso');
  assert.match(hallazgoProf.titulo, /complejidad\/anidamiento excesivo/);
});

test('ADVERSARIAL [Calidad]: High cyclomatic complexity calculation with ternary & boolean operators', () => {
  const codigoComplejo = `
    export function resolverPermisos(usuario, recurso, contexto) {
      if (usuario.esAdmin || (usuario.esStaff && contexto.horarioLaboral)) {
        return true;
      } else if (recurso.publico && !recurso.bloqueado) {
        return contexto.ipValida ? true : false;
      } else if (usuario.roles.includes('editor')) {
        for (let i = 0; i < recurso.reglas.length; i++) {
          const r = recurso.reglas[i];
          if (r.activo && (r.permitir || r.heredado)) {
            while (r.intentos < 3) {
              if (r.verificar()) return true;
            }
          }
        }
      }
      try {
        return usuario.esPropietario ? true : false;
      } catch (e) {
        return false;
      }
    }
  `;

  const comp = calcularComplejidadCiclomatica(codigoComplejo);
  assert.ok(comp >= 12, `Complejidad ciclomática calculada (${comp}) debe ser >= 12`);
});

test('ADVERSARIAL [Calidad]: Duplicate block detection with comments, whitespace and deduplication', () => {
  const bloqueDuplicado = [
    'const validarFormatoCita = (cita) => {',
    '  if (!cita || typeof cita !== "object") return false;',
    '  const { id, negocio_id, cliente_id, servicios } = cita;',
    '  if (!id || !negocio_id || !cliente_id) return false;',
    '  if (!Array.isArray(servicios) || servicios.length === 0) return false;',
    '  const sumaDuracion = servicios.reduce((acc, s) => acc + (s.duracion_min || 0), 0);',
    '  const sumaPrecio = servicios.reduce((acc, s) => acc + (s.precio_centimos || 0), 0);',
    '  return { valido: true, sumaDuracion, sumaPrecio };',
    '};',
  ].join('\n');

  const archivo1 = `
    import React from 'react';
    // Componente de modal de cita
    export const ModalCita = () => {
      ${bloqueDuplicado}
      return <div>Modal</div>;
    };
  `;

  const archivo2 = `
    import React from 'react';
    /* Validador de citas */
    export const PanelCita = () => {
      ${bloqueDuplicado}
      return <div>Panel</div>;
    };
  `;

  const archivo3 = `
    import React from 'react';
    export const VistaCita = () => {
      // Bloque corto no duplicado
      const x = 1;
      return <div>Vista {x}</div>;
    };
  `;

  const archivos = [
    { rel: 'components/ModalCita.web.tsx', contenido: archivo1 },
    { rel: 'components/PanelCita.web.tsx', contenido: archivo2 },
    { rel: 'components/VistaCita.web.tsx', contenido: archivo3 },
  ];

  const hallazgos = detectarDuplicacion(archivos);
  assert.equal(hallazgos.length, 1, 'Debe detectar exactamente 1 hallazgo de duplicación entre el par archivo1 y archivo2');
  assert.ok(hallazgos[0].clave.includes('duplicacion:components/PanelCita.web.tsx:components/ModalCita.web.tsx'));
  assert.equal(hallazgos[0].nivel, 'aviso');
});

test('ADVERSARIAL [Calidad]: Monster component boundary test (exact 450 vs 451 lines)', () => {
  // Exact 450 lines -> no finding
  const lineas450 = Array(450).fill('const a = 1;').join('\n');
  const res450 = revisarArchivo('app/limite450.web.tsx', lineas450);
  assert.equal(res450.hallazgos.filter((h) => h.clave.includes('componente-monstruo')).length, 0);

  // 451 lines -> triggers finding
  const lineas451 = Array(451).fill('const a = 1;').join('\n');
  const res451 = revisarArchivo('app/limite451.web.tsx', lineas451);
  const hallazgos451 = res451.hallazgos.filter((h) => h.clave.includes('componente-monstruo'));
  assert.equal(hallazgos451.length, 1);
  assert.match(hallazgos451[0].titulo, /451 líneas > 450/);
});
