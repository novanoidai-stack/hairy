#!/usr/bin/env node
// Runner de los vigilantes. Los corre todos, imprime lo que encuentran y decide
// si la CI se para.
//
//   node scripts/vigilantes/index.mjs                 los estaticos (sin red)
//   node scripts/vigilantes/index.mjs --rapido        se salta los lentos (knip)
//   node scripts/vigilantes/index.mjs --bd            anade los de base de datos
//   node scripts/vigilantes/index.mjs --solo precios  uno concreto
//   node scripts/vigilantes/index.mjs --json out.json ademas escribe el informe
//
// Codigo de salida: 1 si hay algun hallazgo BLOQUEANTE. Los avisos no paran nada.
// 2 si el propio runner revienta.

import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { AnclaPerdida, hallazgo } from './nucleo.mjs';

import precios from './precios.mjs';
import referidos from './referidos.mjs';
import rutasPublicas from './rutas-publicas.mjs';
import cacheApp from './cache-app.mjs';
import claves from './claves.mjs';
import codigoMuerto from './codigo-muerto.mjs';
import erroresTragados from './errores-tragados.mjs';
import panelSalud from './panel-salud.mjs';

const ESTATICOS = [precios, referidos, rutasPublicas, cacheApp, claves, erroresTragados, panelSalud, codigoMuerto];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const C = process.stdout.isTTY
  ? {
      rojo: '\x1b[31m',
      ambar: '\x1b[33m',
      verde: '\x1b[32m',
      gris: '\x1b[90m',
      neg: '\x1b[1m',
      fin: '\x1b[0m',
    }
  : { rojo: '', ambar: '', verde: '', gris: '', neg: '', fin: '' };

async function main() {
  const soloUno = valor('--solo');
  const rapido = flag('--rapido');
  const destinoJson = valor('--json');

  // Los de red no van en la CI: necesitan credencial y las RPC no se crean por
  // pull request, sino por migracion aplicada en remoto. Con --bd se anaden.
  const conRed = flag('--bd') ? [(await import('./bd.mjs')).default] : [];

  const aCorrer = [...ESTATICOS, ...conRed]
    .filter((v) => !soloUno || v.nombre === soloUno)
    .filter((v) => !(rapido && v.lento));

  if (!aCorrer.length) {
    console.error(`No hay ningun vigilante llamado "${soloUno}".`);
    console.error('Disponibles: ' + [...ESTATICOS, ...conRed].map((v) => v.nombre).join(', '));
    process.exit(2);
  }

  const t0 = Date.now();
  const todos = [];
  const porVigilante = [];

  for (const v of aCorrer) {
    const t = Date.now();
    let hallazgos = [];
    let reventado = false;
    try {
      hallazgos = await v.ejecutar();
    } catch (e) {
      reventado = true;
      // Un ancla perdida es un hallazgo bloqueante, no un crash del runner: el
      // vigilante se ha quedado ciego y hay que enterarse igual que de un fallo.
      hallazgos = [
        hallazgo({
          clave: `${v.nombre}/ancla-perdida`,
          nivel: 'bloqueante',
          ambito: v.ambito,
          titulo:
            e instanceof AnclaPerdida
              ? `El vigilante "${v.nombre}" se ha quedado ciego`
              : `El vigilante "${v.nombre}" ha reventado`,
          detalle: e?.message || String(e),
          fichero: e?.fichero || null,
        }),
      ];
    }
    const ms = Date.now() - t;
    porVigilante.push({
      nombre: v.nombre,
      ambito: v.ambito,
      ms,
      ok: !reventado && hallazgos.length === 0,
    });
    todos.push(...hallazgos);
  }

  // --- Informe por pantalla ---
  console.log('');
  for (const v of porVigilante) {
    const suyos = todos.filter((h) => h.clave.startsWith(v.nombre + '/') || h.ambito === v.ambito);
    const bloq = suyos.filter((h) => h.nivel === 'bloqueante').length;
    const avi = suyos.length - bloq;
    const icono = bloq
      ? `${C.rojo}FALLA${C.fin}`
      : avi
        ? `${C.ambar}AVISA${C.fin}`
        : `${C.verde}  ok ${C.fin}`;
    console.log(`  ${icono}  ${v.nombre.padEnd(16)} ${C.gris}${v.ms} ms${C.fin}`);
  }

  const bloqueantes = todos.filter((h) => h.nivel === 'bloqueante');
  const avisos = todos.filter((h) => h.nivel === 'aviso');

  for (const grupo of [
    { lista: bloqueantes, titulo: 'BLOQUEANTES', color: C.rojo },
    { lista: avisos, titulo: 'AVISOS', color: C.ambar },
  ]) {
    if (!grupo.lista.length) continue;
    console.log(`\n${grupo.color}${C.neg}${grupo.titulo} (${grupo.lista.length})${C.fin}`);
    for (const h of grupo.lista) {
      const donde = h.fichero
        ? ` ${C.gris}${h.fichero}${h.linea ? ':' + h.linea : ''}${C.fin}`
        : '';
      console.log(`\n  ${grupo.color}*${C.fin} ${C.neg}${h.titulo}${C.fin}${donde}`);
      if (h.detalle) console.log(`    ${C.gris}${h.detalle}${C.fin}`);
    }
  }

  const ms = Date.now() - t0;
  console.log('');
  if (!todos.length) {
    console.log(`${C.verde}Todo en orden.${C.fin} ${aCorrer.length} vigilantes, ${ms} ms.\n`);
  } else {
    console.log(
      `${bloqueantes.length} bloqueante(s), ${avisos.length} aviso(s). ` +
        `${aCorrer.length} vigilantes, ${ms} ms.\n`,
    );
  }

  if (destinoJson) {
    const informe = {
      version: 1,
      origen: process.env.GITHUB_ACTIONS ? 'ci' : 'local',
      commit: process.env.GITHUB_SHA || null,
      rama: process.env.GITHUB_REF_NAME || null,
      ejecutado_en: new Date().toISOString(),
      duracion_ms: ms,
      vigilantes: porVigilante,
      hallazgos: todos,
    };
    writeFileSync(destinoJson, JSON.stringify(informe, null, 2), 'utf8');
    console.log(`${C.gris}Informe escrito en ${destinoJson}${C.fin}\n`);
  }

  process.exit(bloqueantes.length ? 1 : 0);
}

main().catch((e) => {
  console.error('El runner de vigilantes ha reventado:', e);
  process.exit(2);
});
