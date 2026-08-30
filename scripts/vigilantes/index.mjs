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
import erroresTragados from './errores-tragados.mjs';
import panelAmbitos from './panel-ambitos.mjs';
import edgesAutorizadas from './edges-autorizadas.mjs';
import migraciones from './migraciones.mjs';
import husos from './husos.mjs';
import planes from './planes.mjs';
import horariosConvenio from './horarios-convenio.mjs';
import workflows from './workflows.mjs';
import ecosistemaCuentas from './ecosistema-cuentas.mjs';
import codigoMuerto from './codigo-muerto.mjs';
import claimsFiscales from './claims-fiscales.mjs';
import modulosDesconectados from './modulos-desconectados.mjs';

const ESTATICOS = [
  precios,
  referidos,
  rutasPublicas,
  cacheApp,
  claves,
  erroresTragados,
  panelAmbitos,
  edgesAutorizadas,
  migraciones,
  husos,
  planes,
  horariosConvenio,
  workflows,
  ecosistemaCuentas,
  codigoMuerto,
  claimsFiscales,
  modulosDesconectados,
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

// NUNCA `process.exit()` en este runner. Matar el proceso a mano justo despues
// de una peticion de red hace que libuv asserte en Windows
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c,
// line 76`) y el proceso muere con codigo 127 AUNQUE el informe haya salido en
// verde: cualquier hook, pre-push o CI que mire el codigo de salida lo lee como
// fallo. Solo pasa con `--bd`, que es el unico vigilante que abre sockets.
//
// Medido el 29 ago 2026 (Node 24.14, Windows 11): la ventana peligrosa dura unos
// 50 ms desde que resuelve el fetch de bd.mjs -- esperar 1 ms revienta, esperar
// 50 ya no. Es trabajo de fondo de la propia plataforma, no un handle nuestro:
// cerrar y hasta destruir el dispatcher de undici NO lo evita (probado, sigue
// reventando). Lo unico que lo evita es no matar el proceso.
//
// Dejarlo salir solo tampoco cuelga: el socket de undici ya no aparece en
// `getActiveResourcesInfo()` en el tick siguiente al fetch. `vigia` es la red de
// seguridad por si algun dia si queda algo enganchado -- en vez de un cuelgue
// mudo, dice QUE lo retiene y sale con el mismo codigo.
function salir(codigo) {
  process.exitCode = codigo;
  const vigia = setTimeout(() => {
    const handles = [...new Set(process.getActiveResourcesInfo())].join(', ');
    console.error(
      `\nEl proceso deberia haber terminado ya y algo mantiene vivo el bucle de ` +
        `eventos: ${handles}. Se sale igual con ${codigo}.`,
    );
    process.exit(codigo);
  }, 5000);
  // unref: no mantiene vivo el proceso por si mismo, solo salta si ya habia algo
  // mas manteniendolo. Si todo esta limpio, el proceso sale antes de que corra.
  vigia.unref();
}

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
  const conRed = flag('--bd')
    ? [
        (await import('./bd.mjs')).default,
        (await import('./bd-rendimiento.mjs')).default,
        (await import('./bd-migraciones.mjs')).default,
        (await import('./bd-ecosistema.mjs')).default,
      ]
    : [];

  const aCorrer = [...ESTATICOS, ...conRed]
    .filter((v) => !soloUno || v.nombre === soloUno)
    .filter((v) => !(rapido && v.lento));

  if (!aCorrer.length) {
    console.error(`No hay ningun vigilante llamado "${soloUno}".`);
    console.error('Disponibles: ' + [...ESTATICOS, ...conRed].map((v) => v.nombre).join(', '));
    return salir(2);
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
      // Se apunta AQUI quien encontro que, mientras se sabe con certeza.
      // Antes la linea de resumen lo deducia con `h.ambito === v.ambito`, y eso
      // dejo de valer en cuanto dos vigilantes compartieron ambito: `cache-app`
      // salia "AVISA" por los hallazgos de `bd-rendimiento` (los dos son de
      // ambito `rendimiento`) sin haber encontrado nada suyo. Un resumen que
      // acusa al vigilante equivocado es exactamente la clase de mentira
      // pequena que estas herramientas existen para evitar.
      bloqueantes: hallazgos.filter((h) => h.nivel === 'bloqueante').length,
      avisos: hallazgos.filter((h) => h.nivel !== 'bloqueante').length,
    });
    todos.push(...hallazgos);
  }

  // --- Informe por pantalla ---
  console.log('');
  for (const v of porVigilante) {
    const bloq = v.bloqueantes;
    const avi = v.avisos;
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

  salir(bloqueantes.length ? 1 : 0);
}

main().catch((e) => {
  console.error('El runner de vigilantes ha reventado:', e);
  salir(2);
});
