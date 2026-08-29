#!/usr/bin/env node
// scripts/vigilantes/silencios.mjs
//
// Traduce a hallazgos lo que los sensores de fallo silencioso del smoke han
// apuntado en silencios.jsonl (una linea por pantalla, escrita por
// tests/smoke/silencios.ts). Familia 2a del plan de fase 2.
//
//   node scripts/vigilantes/silencios.mjs silencios.jsonl [salida.json] [origen]
//   node scripts/vigilantes/silencios.mjs silencios.jsonl --aprobar [--origen canario]
//
// POR QUE HAY LINEA BASE SI ESTO SON FALLOS
// Porque manosear una pantalla a ciegas dispara cosas legitimas: un `alert` de
// "elige primero una clienta", un error de permiso al pulsar algo que la cuenta
// de demo no puede hacer. Congelar lo que sale hoy y gritar solo cuando SUBE es
// la unica forma de que esto siga encendido dentro de tres meses. Es la misma
// regla del resto: el trinquete solo gira hacia abajo.
//
// Nivel: AVISO. Un boton que falla en silencio no deja la pantalla rota -- eso
// ya lo tumba el smoke -- pero es exactamente lo que nadie ve hasta que un salon
// llama diciendo que "guardar no guarda".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const TIPOS = {
  'promesa-rota': {
    etiqueta: 'promesas rotas',
    porque:
      'Una promesa se rechazo y no la recogio nadie. Es el fallo silencioso puro: no hay ' +
      'error en consola que mirar y la pantalla se queda igual.',
  },
  dialogo: {
    etiqueta: 'avisos con alert()',
    porque:
      'El boton contesto con un alert() del navegador. En la CI se descarta solo, asi que ' +
      'hasta ahora era invisible; para una persona es un fallo con toda la letra.',
  },
  'error-en-pantalla': {
    etiqueta: 'errores pintados en pantalla',
    porque:
      'Tras el clic aparecio un mensaje de error de sistema (permiso, red, choque de datos) ' +
      'que no estaba antes.',
  },
};

const argv = process.argv.slice(2);
const aprobar = argv.includes('--aprobar');
const posicionales = argv.filter((a) => !a.startsWith('--'));
const entrada = posicionales[0];
const iOrigen = argv.indexOf('--origen');
const origen = (iOrigen >= 0 ? argv[iOrigen + 1] : null) || posicionales[2] || 'ci';

// Linea base por origen, igual que el rendimiento: la CI manosea un espejo local
// y el canario manosea produccion con datos de verdad. No son lo mismo.
const BASE = path.join(
  RAIZ,
  `tests/smoke/silencios-baseline${origen === 'canario' ? '.canario' : ''}.json`,
);

if (!entrada || !existsSync(entrada)) {
  console.error(
    'Uso: node scripts/vigilantes/silencios.mjs <silencios.jsonl> [salida.json] [origen] | --aprobar [--origen canario]',
  );
  process.exit(2);
}

// JSONL -> { pantalla: { incidentes, cuentas } }
const porPantalla = {};
for (const linea of readFileSync(entrada, 'utf8').split('\n')) {
  if (!linea.trim()) continue;
  const s = JSON.parse(linea);
  const cuentas = {};
  for (const t of Object.keys(TIPOS)) cuentas[t] = 0;
  for (const i of s.incidentes || []) {
    if (cuentas[i.tipo] === undefined) cuentas[i.tipo] = 0;
    cuentas[i.tipo] += 1;
  }
  porPantalla[s.pantalla] = { incidentes: s.incidentes || [], cuentas };
}

if (aprobar) {
  const base = {};
  for (const [pantalla, d] of Object.entries(porPantalla)) base[pantalla] = d.cuentas;
  writeFileSync(BASE, `${JSON.stringify(base, null, 2)}\n`, 'utf8');
  const total = Object.values(porPantalla).reduce((n, d) => n + d.incidentes.length, 0);
  console.log(
    `[silencios] linea base congelada: ${total} incidentes en ` +
      `${Object.keys(porPantalla).length} pantallas -> ${path.relative(RAIZ, BASE)}`,
  );
  process.exit(0);
}

if (!existsSync(BASE)) {
  if (origen === 'canario') {
    console.log(
      `[silencios] sin linea base de canario (${path.relative(RAIZ, BASE)}): se mide sin comparar.`,
    );
    process.exit(0);
  }
  console.error(
    '[silencios] no existe tests/smoke/silencios-baseline.json: corre una vez con --aprobar antes de vigilar.',
  );
  process.exit(2);
}

const base = JSON.parse(readFileSync(BASE, 'utf8'));
const hallazgos = [];
const vigilantes = [];

for (const [pantalla, d] of Object.entries(porPantalla)) {
  const b = base[pantalla] || {};
  const vig = { nombre: `silencios/${pantalla}`, ambito: 'pantallas', ms: null, ok: true };
  vigilantes.push(vig);

  for (const [tipo, meta] of Object.entries(TIPOS)) {
    const antes = Number(b[tipo] ?? 0);
    const ahora = Number(d.cuentas[tipo] ?? 0);
    if (ahora <= antes) continue;

    vig.ok = false;
    const nuevos = d.incidentes.filter((i) => i.tipo === tipo);
    // Los botones son la informacion util: sin ellos el hallazgo dice "algo
    // falla aqui" y con ellos dice "el boton Aprobar falla aqui".
    const botones = [...new Set(nuevos.map((i) => i.boton).filter(Boolean))];
    hallazgos.push({
      clave: `pantallas/boton-error-${pantalla}-${tipo}`,
      nivel: 'aviso',
      ambito: 'pantallas',
      titulo:
        `${pantalla}: suben las ${meta.etiqueta} al pulsar botones (${antes} -> ${ahora})` +
        (botones.length ? ` — ${botones.slice(0, 3).join(', ')}` : ''),
      detalle:
        `${meta.porque}\n\n` +
        nuevos
          .slice(0, 8)
          .map((i) => `  · "${i.boton}" -> ${i.detalle}`)
          .join('\n') +
        `\n\nSi es flujo legitimo, sube el numero en ${path.relative(RAIZ, BASE)} y ` +
        'explica por que en el commit.',
      fichero: 'tests/smoke/silencios.ts',
      linea: null,
    });
  }

  // El trinquete tambien hacia abajo: si se ha arreglado algo, que se note.
  for (const [tipo, meta] of Object.entries(TIPOS)) {
    const antes = Number(b[tipo] ?? 0);
    const ahora = Number(d.cuentas[tipo] ?? 0);
    if (ahora >= antes) continue;
    hallazgos.push({
      clave: `pantallas/mejora-boton-error-${pantalla}-${tipo}`,
      nivel: 'aviso',
      ambito: 'pantallas',
      titulo: `${pantalla}: bajan las ${meta.etiqueta} (${antes} -> ${ahora}). Baja la linea base`,
      detalle: `Se ha arreglado algo. Poner ${ahora} en ${path.relative(RAIZ, BASE)} para que no vuelva a subir.`,
      fichero: path.relative(RAIZ, BASE),
      linea: null,
    });
  }
}

// Vigilante ciego: pantalla con linea base que hoy no ha dejado ninguna linea.
for (const pantalla of Object.keys(base)) {
  if (porPantalla[pantalla]) continue;
  hallazgos.push({
    clave: `pantallas/sin-silencios-${pantalla}`,
    nivel: 'aviso',
    ambito: 'pantallas',
    titulo: `Sin datos de fallo silencioso para ${pantalla}`,
    detalle:
      'El smoke no ha apuntado nada de esta pantalla: o acaba de romperse (y su hallazgo de ' +
      'pantalla rota ya lo dice) o los sensores de la familia 2a se han quedado ciegos para ella.',
    fichero: 'tests/smoke/silencios.ts',
    linea: null,
  });
}

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
for (const h of hallazgos) console.log(`[silencios] ${h.nivel.toUpperCase()} ${h.titulo}`);
console.log(
  `[silencios] ${vigilantes.length} pantallas miradas, ${bloq} bloqueantes, ${hallazgos.length - bloq} avisos.`,
);
process.exit(bloq > 0 ? 1 : 0);
