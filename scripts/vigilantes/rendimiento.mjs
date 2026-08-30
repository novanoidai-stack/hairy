#!/usr/bin/env node
// scripts/vigilantes/rendimiento.mjs
//
// Vigilante de métricas extremas de rendimiento para MECHA OS:
//   1. Presupuestos de carga por pantalla (< 1.8s).
//   2. Límite de Long Tasks en hilo principal (<= 2 tareas > 50ms).
//   3. Cuota de peticiones N+1 en carga inicial (<= 6 peticiones a Supabase).
//   4. Latencia p95 de Edge Functions (< 350ms).
//
// Exporta el contrato estándar de núcleo:
//   { nombre: 'rendimiento', ambito: 'rendimiento', descripcion, ejecutar }
// Y mantiene compatibilidad CLI para los workflows de CI/Canario:
//   node scripts/vigilantes/rendimiento.mjs [rendimiento.jsonl] [salida.json] [origen]
//   node scripts/vigilantes/rendimiento.mjs --aprobar

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

export const PRESUPUESTO_MS_CARGA = 1800; // < 1.8s
export const LIMITE_LONG_TASKS_N = 2;    // <= 2 tareas > 50ms
export const CUOTA_PETICIONES_N1 = 6;    // <= 6 peticiones por pantalla
export const LATENCIA_EDGE_P95_MAX = 350; // < 350ms p95
export const CARGA_EXTREMA_MS = 15000;    // > 15s o 3x línea base es bloqueante

export const FICHERO_BASELINE_LOCAL = 'tests/smoke/rendimiento-baseline.json';
export const FICHERO_BASELINE_CANARIO = 'tests/smoke/rendimiento-baseline.canario.json';

/**
 * Calcula el percentil 95 (p95) de un array de latencias en milisegundos.
 */
export function calcularP95(latencias) {
  if (!Array.isArray(latencias) || latencias.length === 0) return 0;
  const ordenadas = [...latencias].filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (ordenadas.length === 0) return 0;
  const idx = Math.min(Math.floor(ordenadas.length * 0.95), ordenadas.length - 1);
  return ordenadas[idx];
}

/**
 * Evalúa latencias p95 de Edge Functions frente al umbral objetivo (<350ms).
 */
export function evaluarLatenciaEdges(metricasEdges = {}, opciones = {}) {
  const limiteP95 = opciones.limiteP95 ?? LATENCIA_EDGE_P95_MAX;
  const hallazgos = [];

  for (const [nombreEdge, datos] of Object.entries(metricasEdges)) {
    let p95 = 0;
    if (typeof datos === 'number') {
      p95 = datos;
    } else if (Array.isArray(datos)) {
      p95 = calcularP95(datos);
    } else if (datos && typeof datos.p95 === 'number') {
      p95 = datos.p95;
    } else if (datos && Array.isArray(datos.latencias)) {
      p95 = calcularP95(datos.latencias);
    }

    if (p95 >= limiteP95) {
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/latencia-edge-p95:${nombreEdge}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Edge Function "${nombreEdge}" supera latencia p95 objetivo (${p95} ms >= ${limiteP95} ms)`,
          detalle:
            `La latencia p95 registrada para la Edge Function "${nombreEdge}" es de ${p95} ms, ` +
            `superando el presupuesto de ${limiteP95} ms. Conviene optimizar consultas a base de datos, ` +
            'reducir overhead de serialización o aplicar caché en llamadas recurrentes.',
          fichero: `supabase/functions/${nombreEdge}/index.ts`,
        }),
      );
    }
  }

  return hallazgos;
}

/**
 * Evalúa un mapa de pantallas con medidas { ms_carga, long_tasks_n, long_tasks_ms, peticiones }
 * frente a los 3 presupuestos de rendimiento:
 *   - Carga < 1.8s
 *   - Long Tasks <= 2
 *   - Cuota N+1 <= 6
 */
export function evaluarPresupuestos(medidas = {}, opciones = {}) {
  const limiteCarga = opciones.presupuestoCarga ?? PRESUPUESTO_MS_CARGA;
  const limiteLT = opciones.limiteLongTasks ?? LIMITE_LONG_TASKS_N;
  const cuotaN1 = opciones.cuotaPeticiones ?? CUOTA_PETICIONES_N1;
  const ficheroOrigen = opciones.fichero || FICHERO_BASELINE_LOCAL;
  const hallazgos = [];

  for (const [pantalla, m] of Object.entries(medidas)) {
    // 1. Presupuesto de carga
    if (m.ms_carga > limiteCarga) {
      const segs = (m.ms_carga / 1000).toFixed(2);
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/presupuesto-carga:${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Pantalla "${pantalla}" supera presupuesto de carga (${segs} s > ${(limiteCarga / 1000).toFixed(1)} s)`,
          detalle:
            `Tiempo de carga medido: ${m.ms_carga} ms (presupuesto: ${limiteCarga} ms). ` +
            'Se aconseja aplazar renderizado de componentes secundarios y agrupar peticiones iniciales.',
          fichero: ficheroOrigen,
        }),
      );
    }

    // 2. Límite de Long Tasks (>50ms)
    if (m.long_tasks_n > limiteLT) {
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/longtasks-exceso:${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Pantalla "${pantalla}" supera límite de Long Tasks (${m.long_tasks_n} tareas > ${limiteLT})`,
          detalle:
            `Se registraron ${m.long_tasks_n} tareas largas en el hilo principal acumulando ${m.long_tasks_ms} ms de bloqueo. ` +
            'Conviene trocear computación pesada con requestIdleCallback o Web Workers.',
          fichero: ficheroOrigen,
        }),
      );
    }

    // 3. Cuota de consultas N+1
    if (m.peticiones > cuotaN1) {
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/cuota-n1:${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Pantalla "${pantalla}" supera cuota de peticiones iniciales (${m.peticiones} > ${cuotaN1})`,
          detalle:
            `La carga inicial disparó ${m.peticiones} consultas a Supabase (máximo permitido: ${cuotaN1}). ` +
            'Sospecha de consultas N+1 en cascada. Agrupar en una RPC compuesta o usar vistas desnormalizadas.',
          fichero: ficheroOrigen,
        }),
      );
    }
  }

  return hallazgos;
}

/**
 * Compara mediciones dinámicas contra una línea base congelada.
 */
export function analizarMediciones(medidas, base, opciones = {}) {
  const hallazgos = [];
  const vigilantes = [];

  const peor = (actual, antes, prop, abs) => actual > antes * (1 + prop) + abs;

  for (const [pantalla, m] of Object.entries(medidas)) {
    const b = base[pantalla];
    const vig = { nombre: `rendimiento/${pantalla}`, ambito: 'rendimiento', ms: m.ms_carga, ok: true };
    vigilantes.push(vig);

    if (!b) {
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/nueva-${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `Pantalla nueva (${pantalla}) sin línea base de rendimiento`,
          detalle: `Medida actual: ${m.ms_carga} ms de carga, ${m.long_tasks_ms} ms en long tasks, ${m.peticiones} peticiones.`,
          fichero: FICHERO_BASELINE_LOCAL,
        }),
      );
      continue;
    }

    const detalle =
      `Línea base: ${b.ms_carga} ms de carga, ${b.long_tasks_ms} ms en ${b.long_tasks_n} long tasks, ` +
      `${b.peticiones} peticiones. Hoy: ${m.ms_carga} ms, ${m.long_tasks_ms} ms en ${m.long_tasks_n} long tasks, ` +
      `${m.peticiones} peticiones.`;

    // Degeneración extrema: bloqueante (pantalla en blanco > 15 s y > 3x base)
    if (m.ms_carga > Math.max(b.ms_carga * 3, CARGA_EXTREMA_MS)) {
      vig.ok = false;
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/carga-${pantalla}`,
          nivel: 'bloqueante',
          ambito: 'rendimiento',
          titulo: `La pantalla ${pantalla} tarda ${Math.round(m.ms_carga / 1000)} s en cargar (degeneración crítica)`,
          detalle,
          fichero: 'tests/smoke/mediciones.ts',
        }),
      );
      continue;
    }

    // Regresión de peticiones N+1
    if (peor(m.peticiones, b.peticiones, 0.2, 8)) {
      vig.ok = false;
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/peticiones-${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `La pantalla ${pantalla} ha pasado de ${b.peticiones} a ${m.peticiones} peticiones a Supabase`,
          detalle: `${detalle} Sospecha de N+1 o consulta multiplicada.`,
          fichero: 'tests/smoke/mediciones.ts',
        }),
      );
    }

    // Regresión de Long Tasks
    if (peor(m.long_tasks_ms, b.long_tasks_ms, 0.5, 500)) {
      vig.ok = false;
      hallazgos.push(
        hallazgo({
          clave: `rendimiento/longtasks-${pantalla}`,
          nivel: 'aviso',
          ambito: 'rendimiento',
          titulo: `La pantalla ${pantalla} bloquea el hilo ${m.long_tasks_ms} ms (antes ${b.long_tasks_ms})`,
          detalle,
          fichero: 'tests/smoke/mediciones.ts',
        }),
      );
    }
  }

  // Comprobar si falta alguna pantalla de la línea base
  for (const pantalla of Object.keys(base)) {
    if (medidas[pantalla]) continue;
    hallazgos.push(
      hallazgo({
        clave: `rendimiento/sin-medida-${pantalla}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `Sin medición de rendimiento para ${pantalla}`,
        detalle: 'El smoke no ha apuntado medidas de esta pantalla en la corrida actual.',
        fichero: 'tests/smoke/mediciones.ts',
      }),
    );
  }

  return { hallazgos, vigilantes };
}

/**
 * Ejecución estándar del vigilante de rendimiento (núcleo).
 */
async function ejecutar(opciones = {}) {
  const raizRepo = opciones.raiz || RAIZ;
  const rutaBaselineLocal = path.join(raizRepo, FICHERO_BASELINE_LOCAL);
  const rutaBaselineCanario = path.join(raizRepo, FICHERO_BASELINE_CANARIO);

  if (!existsSync(rutaBaselineLocal)) {
    throw new AnclaPerdida(`No existe ${FICHERO_BASELINE_LOCAL}`, {
      fichero: FICHERO_BASELINE_LOCAL,
      ancla: 'rendimiento-baseline.json',
    });
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(rutaBaselineLocal, 'utf8'));
  } catch (err) {
    throw new AnclaPerdida(`Error al parsear ${FICHERO_BASELINE_LOCAL}: ${err?.message}`, {
      fichero: FICHERO_BASELINE_LOCAL,
      ancla: 'json-valido',
    });
  }

  // Si existe línea base canario, la usamos preferentemente para verificar presupuestos reales de producción
  let datosEvaluar = baseline;
  let ficheroEvaluado = FICHERO_BASELINE_LOCAL;
  if (existsSync(rutaBaselineCanario)) {
    try {
      datosEvaluar = JSON.parse(readFileSync(rutaBaselineCanario, 'utf8'));
      ficheroEvaluado = FICHERO_BASELINE_CANARIO;
    } catch {}
  }

  const hallazgos = [];

  // 1. Evaluar presupuestos de carga, long tasks y cuota N+1 sobre la línea base
  const hallazgosPresupuestos = evaluarPresupuestos(datosEvaluar, { fichero: ficheroEvaluado });
  hallazgos.push(...hallazgosPresupuestos);

  // 2. Evaluar telemetría / presupuestos de latencia Edge p95 si existen
  const telemetriaEdgesPath = path.join(raizRepo, '.sistema', 'edge-latencia.json');
  if (existsSync(telemetriaEdgesPath)) {
    try {
      const datosEdges = JSON.parse(readFileSync(telemetriaEdgesPath, 'utf8'));
      const hallazgosEdges = evaluarLatenciaEdges(datosEdges);
      hallazgos.push(...hallazgosEdges);
    } catch {}
  }

  return hallazgos;
}

// -----------------------------------------------------------------------------
// Soporte de ejecución CLI para workflows (ci.yml / canario.yml)
// -----------------------------------------------------------------------------
const esEjecucionDirecta =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (esEjecucionDirecta) {
  const argv = process.argv.slice(2);
  const aprobar = argv.includes('--aprobar');
  const posicionales = argv.filter((a) => !a.startsWith('--'));
  const entrada = posicionales[0];
  const iOrigen = argv.indexOf('--origen');
  const origen = (iOrigen >= 0 ? argv[iOrigen + 1] : null) || posicionales[2] || 'ci';
  const BASELINE = path.join(RAIZ, `tests/smoke/rendimiento-baseline${origen === 'canario' ? '.canario' : ''}.json`);

  if (!entrada || !existsSync(entrada)) {
    console.error(
      'Uso: node scripts/vigilantes/rendimiento.mjs <rendimiento.jsonl> [salida.json] [origen] | --aprobar --origen canario',
    );
    process.exit(2);
  }

  const medidas = {};
  for (const linea of readFileSync(entrada, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    try {
      const m = JSON.parse(linea);
      // Una fila sin `pantalla` utilizable no es una medicion: antes entraba
      // igual y creaba pantallas fantasma llamadas "undefined" y "null", que
      // ademas salian como "pantalla nueva sin linea base". Ruido que tapa las
      // medidas de verdad, y encima estable — el fantasma vuelve cada corrida.
      const pantalla = typeof m.pantalla === 'string' ? m.pantalla.trim() : '';
      if (!pantalla) continue;
      const ms = Number(m.ms_carga);
      if (!Number.isFinite(ms)) continue;
      medidas[pantalla] = {
        ms_carga: Math.round(ms),
        long_tasks_n: m.long_tasks_n,
        long_tasks_ms: Math.round(Number(m.long_tasks_ms) || 0),
        fps_medio: m.fps_medio,
        peticiones: m.peticiones,
      };
    } catch {}
  }

  if (aprobar) {
    writeFileSync(BASELINE, JSON.stringify(medidas, null, 2) + '\n', 'utf8');
    console.log(`[rendimiento] Línea base congelada con ${Object.keys(medidas).length} pantallas -> ${path.relative(RAIZ, BASELINE)}`);
    process.exit(0);
  }

  if (!existsSync(BASELINE)) {
    if (origen === 'canario') {
      console.log(`[rendimiento] Sin línea base de canario (${path.relative(RAIZ, BASELINE)}): se mide sin comparar.`);
      process.exit(0);
    }
    console.error('[rendimiento] No existe tests/smoke/rendimiento-baseline.json: corre una vez con --aprobar.');
    process.exit(2);
  }

  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { hallazgos, vigilantes } = analizarMediciones(medidas, base);

  const salida = posicionales[1];
  if (salida && !salida.startsWith('--')) {
    writeFileSync(
      salida,
      JSON.stringify(
        {
          version: 1,
          origen,
          commit: process.env.GITHUB_SHA || null,
          rama: process.env.GITHUB_REF_NAME || null,
          ejecutado_en: new Date().toISOString(),
          duracion_ms: null,
          vigilantes,
          hallazgos,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
  for (const h of hallazgos) console.log(`[rendimiento] ${h.nivel.toUpperCase()} ${h.titulo}`);
  console.log(`[rendimiento] ${vigilantes.length} pantallas medidas, ${bloq} bloqueantes, ${hallazgos.length - bloq} avisos.`);
  process.exit(bloq > 0 ? 1 : 0);
}

export default {
  nombre: 'rendimiento',
  ambito: 'rendimiento',
  descripcion: 'Vigila presupuestos de carga (<1.8s), long tasks (<=2), cuota N+1 (<=6) y latencia Edge (p95 <350ms)',
  ejecutar,
};
