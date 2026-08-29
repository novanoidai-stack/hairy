// LAS EDGE FUNCTIONS CORREN EN UTC. EL SALON, NO.
//
// Las libs puras de agenda materializan las horas de apertura con
// `Date.setHours()`, o sea en la zona LOCAL del runtime. En el navegador esa
// zona es Europe/Madrid y todo cuadra. En una edge function el runtime es UTC,
// asi que "el salon abre a las 09:00" acaba siendo 09:00Z = las 11:00 de Madrid
// en verano: jornadas, tramos, huecos y `fuera_jornada` salen corridos 1-2 h.
//
// Un horario movido una hora es una cita perdida, y no lo canta ningun tipo ni
// ningun test: el codigo es correcto, el resultado no.
//
// El arreglo (27 ago 2026) es `shared/relojSalon.ts`:
// `horariosAlRelojDelRuntime(filas, campos, {referencia})` desplaza las horas
// para que la aritmetica local del runtime caiga en la hora de Madrid correcta,
// y es la identidad si el runtime ya es Madrid. Por eso el `setHours()` que se
// ve DENTRO de esas funciones no es un fallo: los datos ya vienen desplazados.
// Lo que hay que vigilar no es el setHours, es que nadie importe las libs
// sensibles sin pasar los horarios por el shim.
//
// NO se puede reproducir en local con la variable TZ: Deno la ignora en Windows
// (`TZ=UTC deno eval` sigue diciendo Europe/Madrid). De ahi que esto sea un
// vigilante estatico y no un test.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const SHIM = 'supabase/functions/shared/relojSalon.ts';
const SHIM_EXPORTA = 'horariosAlRelojDelRuntime';
const DIR_FUNCIONES = 'supabase/functions';

// SOLO `setHours`, y a proposito. Es la operacion que MATERIALIZA una hora de
// apertura sobre una fecha ("el salon abre a las 09:00" -> un instante), que es
// justo donde la zona del runtime cambia el resultado.
//
// Se probo con getDay/getDate/getMonth/getFullYear tambien y no vale: leer
// componentes locales de un instante es corriente y esta por todas partes (22
// libs de 40 salian "sensibles"). Un vigilante que marca media base de codigo
// no lo lee nadie, y el que lo lea aprendera a ignorarlo.
const ARITMETICA_LOCAL = /\.setHours\s*\(/;

// Hueco para las que compensen por su cuenta, con la senal que lo demuestre.
// HOY ESTA VACIO A PROPOSITO y conviene que siga asi: la unica candidata era
// agenda-asistente, que formatea cada instante con timeZone 'Europe/Madrid',
// pero resulta que no importa organizarAgenda (solo fasesDe/chocaActivaActiva
// de lib/retrasos.ts, que no materializan horas de apertura), asi que ni
// siquiera le hace falta. Y una exencion suya seria PELIGROSA: formatear la
// salida en Madrid no arregla una hora de apertura ya materializada mal, asi
// que si algun dia importa organizarAgenda tiene que pasar por el shim como
// todas. Se deja el mecanismo porque el dia que haga falta hara falta de
// verdad, no para colar la primera que moleste.
const COMPENSAN_A_SU_MANERA = {};

// --- que libs son sensibles a la zona ---------------------------------------

// Se compara por RUTA, no por nombre de fichero. Una edge function puede tener
// su propio `lib/lecturaSerie.ts` que no tiene nada que ver con
// `lib/informes/lecturaSerie.ts` de la raiz -- y de hecho enviar-informe-periodico
// lo tiene, y por nombre salia marcada sin motivo.
export function importa(texto, libRelativa) {
  const sinExt = libRelativa.replace(/\.tsx?$/, ''); // lib/organizarAgenda
  return new RegExp(`from\\s+'[^']*/${sinExt}(\\.tsx?)?'`).test(texto);
}

function ficherosTs(dir, acc = []) {
  for (const e of readdirSync(path.join(RAIZ, dir))) {
    const rel = path.posix.join(dir, e);
    const abs = path.join(RAIZ, rel);
    if (statSync(abs).isDirectory()) ficherosTs(rel, acc);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\.tsx?$/.test(e)) acc.push(rel);
  }
  return acc;
}

// Un modulo de lib/ es sensible si hace aritmetica local O si importa a otro que
// lo sea. El cierre transitivo importa: el dia que alguien meta una capa
// intermedia, la comprobacion directa dejaria de ver el problema y pasaria en
// verde, que es exactamente como se pudren estas herramientas.
export function libsSensibles(leerFichero, ficheros) {
  const contenido = new Map(ficheros.map((f) => [f, leerFichero(f)]));
  const sensibles = new Set(
    ficheros.filter((f) => ARITMETICA_LOCAL.test(contenido.get(f))),
  );

  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const f of ficheros) {
      if (sensibles.has(f)) continue;
      const texto = contenido.get(f);
      for (const s of sensibles) {
        if (importa(texto, s)) {
          sensibles.add(f);
          cambio = true;
          break;
        }
      }
    }
  }
  return sensibles;
}

async function ejecutar() {
  // Sin el shim, todo lo de abajo carece de sentido.
  const shim = leer(SHIM);
  if (!shim.includes(SHIM_EXPORTA)) {
    throw new AnclaPerdida(
      `${SHIM} ya no exporta ${SHIM_EXPORTA}(). O se ha renombrado (y hay que actualizar este ` +
        'vigilante) o se ha quitado, y entonces las edge functions que dependian de el estan ' +
        'devolviendo horarios corridos 1-2 h sin que nadie lo note.',
      { fichero: SHIM, ancla: SHIM_EXPORTA },
    );
  }

  const sensibles = libsSensibles(leer, ficherosTs('lib'));
  if (sensibles.size === 0) {
    throw new AnclaPerdida(
      'Ninguna lib de lib/ hace aritmetica de calendario local. Era organizarAgenda.ts con ocho ' +
        'setHours(). Si de verdad se ha parametrizado la zona horaria, este vigilante sobra y ' +
        'hay que borrarlo a conciencia; mientras tanto, se ha quedado ciego.',
      { fichero: 'lib', ancla: 'setHours' },
    );
  }

  const hallazgos = [];

  for (const dir of readdirSync(path.join(RAIZ, DIR_FUNCIONES))) {
    if (dir === 'shared' || dir === '_shared') continue;
    const carpeta = path.posix.join(DIR_FUNCIONES, dir);
    if (!statSync(path.join(RAIZ, carpeta)).isDirectory()) continue;

    const ficheros = ficherosTs(carpeta);
    const codigo = ficheros.map((f) => leer(f)).join('\n');

    const importadas = [...sensibles].filter((s) => importa(codigo, s));
    if (importadas.length === 0) continue;
    if (codigo.includes(SHIM_EXPORTA)) continue;

    const excepcion = COMPENSAN_A_SU_MANERA[dir];
    if (excepcion && excepcion.senal.test(codigo)) continue;

    hallazgos.push(
      hallazgo({
        clave: `husos/sin-reloj-salon-${dir}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `La edge function "${dir}" usa horarios de salon en un runtime en UTC`,
        detalle:
          `Importa ${importadas.join(', ')}, que materializa horas de apertura con setHours() ` +
          '-- o sea, en la zona local del runtime -- y no pasa por ' +
          `${SHIM_EXPORTA}().\n\n` +
          'En el navegador esa zona es Europe/Madrid y cuadra; aqui el runtime es UTC, asi que ' +
          '"abre a las 09:00" se convierte en las 11:00 de Madrid en verano. Jornadas, tramos, ' +
          'huecos y fuera_jornada salen corridos 1-2 h: citas perdidas, y ningun test lo canta ' +
          'porque el codigo es correcto.\n\n' +
          'Antes de pasar los horarios a las libs:\n\n' +
          `  import { ${SHIM_EXPORTA} } from '../shared/relojSalon.ts';\n` +
          `  const horarios = ${SHIM_EXPORTA}(filas, ['apertura', 'cierre'], { referencia: dia });\n\n` +
          'Si compensa de otra forma (como agenda-asistente, que formatea todo con ' +
          "timeZone: 'Europe/Madrid'), declararlo en COMPENSAN_A_SU_MANERA de " +
          'scripts/vigilantes/husos.mjs con su senal y su porque.',
        fichero: `${carpeta}/index.ts`,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'husos',
  ambito: 'seguridad',
  descripcion: 'Ninguna edge usa horarios de salon sin pasarlos por el reloj del salon',
  ejecutar,
};
