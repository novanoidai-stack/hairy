// UN TEST VERDE NO DEMUESTRA QUE EL PRODUCTO HAGA NADA.
//
// El 30 ago 2026 la reauditoria encontro seis modulos con logica de negocio
// escrita, comentada y con tests que pasan, y CERO consumidores fuera de esos
// tests: el diagnostico de alergias de una formula de color, la rentabilidad por
// sillon, la huella fiscal, la pausa de desinfeccion... Meses en verde, contando
// como "hecho" en los informes, sin que ningun usuario los haya visto nunca.
//
// POR QUE NO LOS CAZABA knip (esto es lo importante)
//
// `knip.json` declara `lib/**/*.test.ts` como ENTRY POINT. Tiene que hacerlo: si
// no, knip marcaria cada fichero de test como fichero muerto. Pero la
// consecuencia es que **lo que importa un test cuenta como usado**, o sea que
// TENER UN TEST TE EXIME de tener consumidores. El vigilante que existe para
// cazar codigo muerto estaba configurado para dar por vivo justo a este.
//
// No se arregla en knip --quitar los tests de `entry` cambia un falso negativo
// por sesenta falsos positivos--, se arregla preguntando otra cosa: no "¿lo
// importa alguien?" sino "¿lo importa alguien QUE NO SEA SU PROPIO TEST?".
//
// LA DIFERENCIA CON codigo-muerto.mjs
//
//   codigo-muerto  -> "esto no lo usa nadie". Deuda, ruido, bundle de mas.
//   este           -> "esto lo usa SOLO su test". Es peor: parece hecho.
//                     Se escribio, se probo, se documento y no se enchufo.
//
// EL TRINQUETE
//
// Los seis heredados nacen en `aviso` con linea base congelada, con la spec que
// los enchufara anotada al lado (decision 10 del CLAUDE.md: si nace bloqueando,
// la CI arranca en rojo y alguien acaba quitando el vigilante). Uno NUEVO es
// BLOQUEANTE: la deuda solo puede bajar.

import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const BASE = 'scripts/vigilantes/modulos-desconectados-baseline.json';

// Donde viven los modulos que nos importan.
const DIRS_MODULOS = ['lib', 'components'];
// Donde puede estar quien los use. `scripts` y `supabase` incluidos: un modulo
// que solo usa un worker de Node o una edge sigue estando enchufado.
const DIRS_CONSUMIDORES = ['app', 'components', 'lib', 'scripts', 'supabase'];

const ES_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;
const ES_FUENTE = /\.[cm]?[jt]sx?$/;

function recorrer(rel, out = []) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) return out;
  for (const nombre of readdirSync(abs)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const hijo = `${rel}/${nombre}`;
    if (statSync(path.join(RAIZ, hijo)).isDirectory()) recorrer(hijo, out);
    else if (ES_FUENTE.test(nombre)) out.push(hijo);
  }
  return out;
}

const sinExt = (p) => p.replace(/\.[cm]?[jt]sx?$/, '');

// Todo lo que un fichero importa, sea como sea que lo escriba.
const ESPECIFICADORES =
  /(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function especificadoresDe(texto) {
  const out = [];
  for (const m of texto.matchAll(ESPECIFICADORES)) out.push(m[1] || m[2] || m[3]);
  return out;
}

/**
 * ¿El especificador `spec`, escrito dentro de `desde`, apunta a `modulo`?
 *
 * Se comparan COLAS de ruta y no rutas resueltas a proposito: aqui conviven
 * alias (`@/lib/x`), relativos (`../x`) y el split .web.tsx, y resolverlo todo
 * de verdad seria reimplementar el resolver de Metro para ganar muy poco. Lo
 * que si se cuida es el caso que hace mentir a una comparacion por nombre: si
 * dos modulos distintos se llaman igual, se exige que casen DOS segmentos.
 */
export function apunta(spec, modulo, basenamesRepetidos) {
  const limpio = sinExt(spec.split('?')[0]).replace(/\/index$/, '');
  const cola = limpio.split('/').filter((s) => s && s !== '.' && s !== '..');
  if (!cola.length) return false;

  const objetivo = sinExt(modulo).replace(/\.web$/, '').split('/');
  const base = objetivo[objetivo.length - 1];
  if (cola[cola.length - 1] !== base) return false;

  // Nombre unico en el repo: casar el nombre basta.
  if (!basenamesRepetidos.has(base)) return true;

  // Nombre repetido: hay que ver tambien la carpeta.
  return cola.length >= 2 && objetivo.length >= 2 && cola[cola.length - 2] === objetivo[objetivo.length - 2];
}

export function analizar({ modulos, consumidores }) {
  const cuenta = new Map();
  for (const m of modulos) {
    const b = sinExt(m).replace(/\.web$/, '').split('/').pop();
    cuenta.set(b, (cuenta.get(b) ?? 0) + 1);
  }
  const repetidos = new Set([...cuenta].filter(([, n]) => n > 1).map(([b]) => b));

  const sueltos = [];
  for (const m of modulos) {
    let vivos = 0;
    let soloTests = 0;
    for (const c of consumidores) {
      if (sinExt(c.ruta) === sinExt(m)) continue;
      if (!c.specs.some((spec) => apunta(spec, m, repetidos))) continue;
      if (ES_TEST.test(c.ruta)) soloTests++;
      else vivos++;
      if (vivos) break;
    }
    // Lo que no usa NADIE es deuda y ya lo cuenta knip. Lo que interesa aqui es
    // lo que usa SOLO su test: eso no es codigo muerto, es codigo que parece hecho.
    if (!vivos && soloTests > 0) sueltos.push(m);
  }
  return sueltos.sort();
}

// { ruta, specs }[]. Se separa de analizar() para que esa sea pura y se pueda
// probar sin tocar disco.
function recogerConsumidores() {
  const vistos = new Set();
  const out = [];
  for (const d of DIRS_CONSUMIDORES) {
    for (const ruta of recorrer(d)) {
      if (vistos.has(ruta)) continue; // lib/ y components/ salen en las dos listas
      vistos.add(ruta);
      out.push({ ruta, specs: especificadoresDe(leer(ruta)) });
    }
  }
  return out;
}

async function ejecutar() {
  const modulos = DIRS_MODULOS.flatMap((d) => recorrer(d)).filter(
    (f) => !ES_TEST.test(f) && existsSync(path.join(RAIZ, sinExt(f) + '.test.ts')),
  );

  // El ancla: si un dia no queda ni un modulo con test al lado, es que el
  // recorrido se ha roto (o el proyecto ha cambiado de forma). No pasar en verde.
  if (modulos.length === 0) {
    throw new AnclaPerdida(
      'No se ha encontrado ni un solo modulo con su .test.ts al lado en lib/ ni components/. ' +
        'O se ha movido la convencion de tests, o este recorrido esta roto. En cualquiera de ' +
        'los dos casos el vigilante esta ciego y eso no puede salir en verde.',
      { fichero: 'lib', ancla: 'modulos con test' },
    );
  }

  const sueltos = analizar({ modulos, consumidores: recogerConsumidores() });

  const base = JSON.parse(leer(BASE));
  const conocidos = new Set(Object.keys(base.heredados));
  const hallazgos = [];

  for (const m of sueltos) {
    const heredado = conocidos.has(m);
    hallazgos.push(
      hallazgo({
        clave: `modulos-desconectados/${m}`,
        nivel: heredado ? 'aviso' : 'bloqueante',
        ambito: 'codigo-muerto',
        titulo: heredado
          ? `${m} sigue sin enchufar (solo lo usa su test)`
          : `${m} tiene test y NINGUN consumidor fuera de el`,
        detalle: heredado
          ? `${base.heredados[m]}\n\nSigue en la linea base de ${BASE}. Cuando se enchufe, ` +
            'quitarlo de ahi: el trinquete solo gira hacia abajo.'
          : 'Se ha escrito logica de negocio, se le han puesto tests y no la llama ninguna ' +
            'pantalla, RPC ni script. Eso no es codigo muerto --que ya lo cuenta knip-- es ' +
            'algo que PARECE hecho: pasa la CI, cuenta como entregado en los informes, y ' +
            'ningun usuario lo ha visto nunca.\n\n' +
            'knip no lo caza porque knip.json declara lib/**/*.test.ts como entry point (y ' +
            'tiene que hacerlo, o marcaria cada test como fichero muerto): lo que importa un ' +
            'test le cuenta como usado.\n\n' +
            'Enchufalo, o borralo si duplica algo que ya existe. Si de verdad tiene que ' +
            'esperar, anadelo a la linea base con el motivo y la spec que lo enchufara.',
        fichero: m,
      }),
    );
  }

  // El trinquete en el otro sentido: algo de la linea base ya esta enchufado y
  // nadie bajo la linea. Si no se avisa, la lista se vuelve un cajon.
  const sueltosSet = new Set(sueltos);
  for (const m of conocidos) {
    if (sueltosSet.has(m)) continue;
    hallazgos.push(
      hallazgo({
        clave: `modulos-desconectados/baja-${m}`,
        nivel: 'aviso',
        ambito: 'codigo-muerto',
        titulo: `${m} ya esta enchufado: quitalo de la linea base`,
        detalle:
          `${BASE} sigue listandolo como pendiente y ya tiene consumidores de verdad. ` +
          'Una linea base que no baja deja de ser una lista de deuda y pasa a ser un cajon.',
        fichero: BASE,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'modulos-desconectados',
  ambito: 'codigo-muerto',
  descripcion: 'Ningun modulo con tests se queda sin consumidores fuera de sus propios tests',
  ejecutar,
};
