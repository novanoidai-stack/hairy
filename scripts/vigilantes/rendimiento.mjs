#!/usr/bin/env node
// scripts/vigilantes/rendimiento.mjs
//
// Compara las mediciones del smoke (rendimiento.jsonl, una linea por pantalla,
// escrito por tests/smoke/mediciones.ts) contra la linea base congelada
// (tests/smoke/rendimiento-baseline.json). Familia 1a del plan de fase 2.
//
//   node scripts/vigilantes/rendimiento.mjs rendimiento.jsonl [salida.json] [origen]
//   node scripts/vigilantes/rendimiento.mjs rendimiento.jsonl --aprobar
//
// Reglas (heredadas de la fase 1):
//   - Solo grita si EMPEORA. Si mejora, no se emite hallazgo: la linea base se
//     baja a mano con --aprobar (acto consciente, el diff del repo lo ensena).
//   - Umbrales holgados: el entorno de CI mide con ruido (una corrida fria, una
//     Supabase lenta). Degeneracion extrema (carga > 3x linea base y > 15 s) si
//     es bloqueante: eso es una pantalla en blanco para un usuario real.
//   - Pantalla de la linea base SIN medida: aviso (vigilante ciego), salvo que
//     ya este rota arriba, que entonces el bloqueante es el suyo.
//
// Nivel normal: AVISO. Es deuda de rendimiento, no una pantalla rota.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

// Linea base por origen: la CI mide un espejo local recien compilado, el
// canario mide produccion a traves de la red real (1c). Comparar una contra la
// base de la otra seria puro ruido.
const argv = process.argv.slice(2);
const aprobar = argv.includes('--aprobar');
const posicionales = argv.filter((a) => !a.startsWith('--'));
const entrada = posicionales[0];
// El origen entra como tercer posicional ([entrada, salida, origen]) o con
// --origen canario cuando solo se congela base (--aprobar).
const iOrigen = argv.indexOf('--origen');
const origen = (iOrigen >= 0 ? argv[iOrigen + 1] : null) || posicionales[2] || 'ci';
const BASELINE = path.join(RAIZ, `tests/smoke/rendimiento-baseline${origen === 'canario' ? '.canario' : ''}.json`);

if (!entrada || !existsSync(entrada)) {
  console.error('Uso: node scripts/vigilantes/rendimiento.mjs <rendimiento.jsonl> [salida.json] [origen] | --aprobar --origen canario');
  process.exit(2);
}

// JSONL -> { pantalla: medias }. Cada pantalla corre UNA vez por corrida, pero
// el formato admite repetidas (retries) por si un dia se mide mas fino.
const medidas = {};
for (const linea of readFileSync(entrada, 'utf8').split('\n')) {
  if (!linea.trim()) continue;
  const m = JSON.parse(linea);
  medidas[m.pantalla] = {
    ms_carga: Math.round(m.ms_carga),
    long_tasks_n: m.long_tasks_n,
    long_tasks_ms: Math.round(m.long_tasks_ms),
    fps_medio: m.fps_medio,
    peticiones: m.peticiones,
  };
}

if (aprobar) {
  writeFileSync(BASELINE, JSON.stringify(medidas, null, 2) + '\n', 'utf8');
  console.log(`[rendimiento] linea base congelada con ${Object.keys(medidas).length} pantallas -> ${path.relative(RAIZ, BASELINE)}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  if (origen === 'canario') {
    // La base del canario nace de su primera corrida contra produccion: hasta
    // que alguien la congele (--aprobar --origen canario), medir sin comparar.
    console.log(`[rendimiento] sin linea base de canario (${path.relative(RAIZ, BASELINE)}): se mide sin comparar.`);
    process.exit(0);
  }
  console.error('[rendimiento] no existe tests/smoke/rendimiento-baseline.json: corre una vez con --aprobar antes de vigilar.');
  process.exit(2);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const hallazgos = [];
const vigilantes = [];

// Holguras: la CI mide con ruido, y las tres metricas no tienen la misma
// varianza. Holgura = margen absoluto + margen proporcional, lo mas grande.
const peor = (actual, antes, prop, abs) =>
  actual > antes * (1 + prop) + abs;

for (const [pantalla, m] of Object.entries(medidas)) {
  const b = base[pantalla];
  const vig = { nombre: `rendimiento/${pantalla}`, ambito: 'rendimiento', ms: m.ms_carga, ok: true };
  vigilantes.push(vig);

  if (!b) {
    // Pantalla nueva: nace su linea base (se aprueba con el siguiente --aprobar)
    // y sale un aviso para que alguien decida si congelarla.
    hallazgos.push({
      clave: `rendimiento/nueva-${pantalla}`,
      nivel: 'aviso',
      ambito: 'rendimiento',
      titulo: `Pantalla nueva (${pantalla}) sin linea base de rendimiento`,
      detalle: `Medida de hoy: ${m.ms_carga} ms de carga, ${m.long_tasks_ms} ms en long tasks, ${m.peticiones} peticiones. Congelala con --aprobar si es lo esperable.`,
      fichero: 'tests/smoke/rendimiento-baseline.json',
      linea: null,
    });
    continue;
  }

  const detalle =
    `Linea base: ${b.ms_carga} ms de carga, ${b.long_tasks_ms} ms en ${b.long_tasks_n} long tasks, ` +
    `${b.fps_medio != null ? b.fps_medio + ' fps' : 'fps sin medir'}, ${b.peticiones} peticiones. ` +
    `Hoy: ${m.ms_carga} ms, ${m.long_tasks_ms} ms en ${m.long_tasks_n} long tasks, ` +
    `${m.fps_medio != null ? m.fps_medio + ' fps' : 'fps sin medir'}, ${m.peticiones} peticiones.`;

  // Degeneracion extrema: bloqueante (pantalla en blanco durante 15 s).
  if (m.ms_carga > Math.max(b.ms_carga * 3, 15_000)) {
    vig.ok = false;
    hallazgos.push({
      clave: `rendimiento/carga-${pantalla}`,
      nivel: 'bloqueante',
      ambito: 'rendimiento',
      titulo: `La pantalla ${pantalla} tarda ${Math.round(m.ms_carga / 1000)} s en cargar`,
      detalle,
      fichero: 'tests/smoke/mediciones.ts',
      linea: null,
    });
    continue;
  }

  // Detector de N+1: peticiones de mas es la senal mas limpia (casi sin ruido).
  if (peor(m.peticiones, b.peticiones, 0.2, 8)) {
    vig.ok = false;
    hallazgos.push({
      clave: `rendimiento/peticiones-${pantalla}`,
      nivel: 'aviso',
      ambito: 'rendimiento',
      titulo: `La pantalla ${pantalla} ha pasado de ${b.peticiones} a ${m.peticiones} peticiones a Supabase`,
      detalle: `${detalle} Sospecha de N+1 o de una consulta que se ha multiplicado.`,
      fichero: 'tests/smoke/mediciones.ts',
      linea: null,
    });
  }

  if (peor(m.long_tasks_ms, b.long_tasks_ms, 0.5, 500)) {
    vig.ok = false;
    hallazgos.push({
      clave: `rendimiento/longtasks-${pantalla}`,
      nivel: 'aviso',
      ambito: 'rendimiento',
      titulo: `La pantalla ${pantalla} bloquea el hilo ${m.long_tasks_ms} ms (antes ${b.long_tasks_ms})`,
      detalle,
      fichero: 'tests/smoke/mediciones.ts',
      linea: null,
    });
  }

  // FPS: SE MIDE Y SE GUARDA, PERO NO AVISA. Ni en la CI ni en el canario.
  //
  // Aqui ponia que "el aviso de fps util es el del canario, que mide como un
  // usuario de verdad". Para la red y el backend es cierto; para el fps no,
  // y esa media verdad costo cuatro tardes de avisos falsos. El canario corre
  // en `runs-on: ubuntu-latest`, el MISMO runner headless y sin GPU que la CI
  // (.github/workflows/canario.yml). Lo unico que cambia entre los dos es la
  // URL que miran. El fps sale de restar marcas de requestAnimationFrame, que
  // sin pantalla ni vsync las marca un compositor por software: por eso la
  // linea base de equipo son 106 fps, un numero que ninguna pantalla real
  // puede dar, y por eso baila.
  //
  // Lo que se vio en el panel el 29 ago 2026, en cuatro corridas del canario:
  //   11:14  (ninguna)      15:44  equipo, clientes
  //   21:50  configuracion, inventario, equipo, clientes
  //   23:38  inventario, equipo, clientes, informes, bandeja
  // Seis pantallas distintas, nunca el mismo grupo dos veces, y con la carga
  // MEJORANDO en las mismas corridas (configuracion 1760 -> 1324 ms). Una
  // regresion de verdad no elige pantalla nueva cada hora: eso es ruido.
  //
  // Un vigilante que grita en falso cada hora no es una red de seguridad, es
  // el motivo por el que se deja de mirar el panel -- y debajo de ese ruido
  // estaba el crash de un salon de verdad. Asi que el numero se sigue
  // guardando en rendimiento.jsonl (no cuesta nada, y el dia que esto corra en
  // un dispositivo con pantalla volvera a significar algo), pero no emite
  // hallazgo. Lo que SI se vigila de esa misma medicion son ms_carga,
  // long_tasks y peticiones: CPU y red, que un runner mide bien.
}

// Vigilante ciego: pantalla con linea base que hoy no ha dejado medida.
for (const pantalla of Object.keys(base)) {
  if (medidas[pantalla]) continue;
  hallazgos.push({
    clave: `rendimiento/sin-medida-${pantalla}`,
    nivel: 'aviso',
    ambito: 'rendimiento',
    titulo: `Sin medicion de rendimiento para ${pantalla}`,
    detalle: 'El smoke no ha apuntado medidas de esta pantalla: o acaba de romperse (y su hallazgo de pantalla rota ya lo dice) o el vigilante de rendimiento se ha quedado ciego para ella.',
    fichero: 'tests/smoke/mediciones.ts',
    linea: null,
  });
}

const salida = posicionales[1];
if (salida && !salida.startsWith('--')) {
  writeFileSync(salida, JSON.stringify({
    version: 1,
    origen,
    commit: process.env.GITHUB_SHA || null,
    rama: process.env.GITHUB_REF_NAME || null,
    ejecutado_en: new Date().toISOString(),
    duracion_ms: null,
    vigilantes,
    hallazgos,
  }, null, 2), 'utf8');
}

const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
for (const h of hallazgos) console.log(`[rendimiento] ${h.nivel.toUpperCase()} ${h.titulo}`);
console.log(`[rendimiento] ${vigilantes.length} pantallas medidas, ${bloq} bloqueantes, ${hallazgos.length - bloq} avisos.`);
process.exit(bloq > 0 ? 1 : 0);
