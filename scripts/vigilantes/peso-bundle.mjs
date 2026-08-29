#!/usr/bin/env node
// scripts/vigilantes/peso-bundle.mjs — familia 1b del plan de fase 2.
//
// Presupuesto de peso del bundle JS. El 7 MB ya se cacheo (decision 7), pero el
// PESO manda en la primera visita de cada cliente — y en la de cada prospecto
// de la demo. Este vigilante caza el dia que alguien importe una libreria de
// graficos entera para un icono.
//
//   node scripts/vigilantes/peso-bundle.mjs              compara contra la linea base
//   node scripts/vigilantes/peso-bundle.mjs --aprobar    congela el peso actual
//
// Se corre tras `npm run build:web` (en la CI, en el job e2e justo despues de
// compilar; web/app esta en .gitignore asi que fuera de ahi no hay nada que
// medir y se sale en verde sin ruido).
//
// Regla: aviso si sube mas de un 5% sobre la linea base. El trinquete solo
// gira hacia abajo; bajar la linea base es `--aprobar`, un acto consciente cuyo
// diff se ve en el repo.

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIR_JS = path.join(RAIZ, 'web/app/_expo/static/js/web');
const BASELINE = path.join(RAIZ, 'scripts/vigilantes/peso-baseline.json');

function medir() {
  if (!existsSync(DIR_JS)) return null;
  let total = 0;
  let entry = 0;
  for (const f of readdirSync(DIR_JS)) {
    if (!f.endsWith('.js')) continue;
    const bytes = statSync(path.join(DIR_JS, f)).size;
    total += bytes;
    if (f.startsWith('entry-')) entry += bytes;
  }
  return { total, entry };
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const aprobar = process.argv.includes('--aprobar');
const actual = medir();

if (!actual || actual.total === 0) {
  console.log('[peso-bundle] no hay build de web (web/app/_expo): nada que medir, se sale en verde.');
  process.exit(0);
}

if (aprobar) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total: actual.total, entry: actual.entry, congelado_en: new Date().toISOString() }, null, 2) + '\n',
    'utf8',
  );
  console.log(`[peso-bundle] linea base congelada: total ${mb(actual.total)}, entry ${mb(actual.entry)}.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[peso-bundle] no existe peso-baseline.json: corre una vez con --aprobar tras un build.');
  process.exit(2);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const hallazgos = [];

// La cuenta del entry es la que mas duele (bloquea el primer render); el total
// incluye chunks que se cargan bajo demanda.
const CUENTAS = [
  ['el bundle total', 'total', actual.total, base.total],
  ['el entry (primer render)', 'entry', actual.entry, base.entry],
];
for (const [nombre, clave, bytes, antes] of CUENTAS) {
  if (bytes > antes * 1.05) {
    hallazgos.push(
      hallazgo({
        clave: `peso-bundle/${clave}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `${nombre[0].toUpperCase() + nombre.slice(1)} ha subido de ${mb(antes)} a ${mb(bytes)} (+${Math.round((bytes / antes - 1) * 100)}%)`,
        detalle:
          `Linea base congelada: ${mb(antes)}. Sospechosos habituales: una libreria nueva importada ` +
          `entera (graficos, fechas, editores), o algo que dejo de code-splitearse. Si el subidon ` +
          `es legítimo, se aprueba con --aprobar y el diff queda en el repo.`,
        fichero: 'package.json',
      }),
    );
  }
}

for (const h of hallazgos) {
  console.log(`[peso-bundle] AVISO ${h.titulo}`);
}
if (!hallazgos.length) {
  console.log(`[peso-bundle] ok: total ${mb(actual.total)} (base ${mb(base.total)}), entry ${mb(actual.entry)} (base ${mb(base.entry)}).`);
}
process.exit(0);
