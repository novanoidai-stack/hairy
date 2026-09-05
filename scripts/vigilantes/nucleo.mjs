// Contrato comun de los vigilantes.
//
// Un vigilante es un modulo que exporta por defecto:
//   { nombre, ambito, descripcion, ejecutar() -> Promise<hallazgo[]> }
//
// La regla que sostiene todo esto: si un vigilante NO encuentra su ancla, FALLA.
// Un regex que deja de casar porque alguien reescribio la seccion no puede pasar
// en verde -- asi es exactamente como estas herramientas se pudren en silencio y
// acaban dando una falsa sensacion de seguridad, que es peor que no tenerlas.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const NIVELES = ['bloqueante', 'aviso'];

// Ficheros del directorio que NO son vigilantes: infraestructura, canales de
// salida y scripts que corren en su propio job. Vive AQUI, en el contrato, y no
// dentro de un vigilante, porque la preguntan dos: meta-registro (para no exigir
// que esten en el runner) y meta-contrato (para no exigirles el contrato). Si se
// anade uno nuevo, se anade aqui a proposito -- que no sea por olvido.
//
// POR QUE ES UNA SOLA LISTA (1 sep -> 4 sep 2026)
// Fueron dos, y la de meta-contrato era una copia incompleta a la que le
// faltaban cuatro nombres. Uno de ellos, `peso-bundle.mjs`, tiene un
// `process.exit(0)` a nivel de modulo: meta-contrato lo importaba dinamicamente
// para inspeccionar su export y ese exit MATABA AL RUNNER ENTERO. Efecto:
// `npm run vigilar` tardaba 43 s, imprimia una sola linea y salia 0 sin haber
// ejecutado ni un vigilante -- y con el se quedaban mudos la puerta de la CI, la
// pestana Salud, el aviso de Telegram y la apertura de issues. Lo mismo cegaba a
// `node --test`: meta-contrato.test.mjs moria dentro de su segundo test y el
// fichero se contaba como PASADO con 1 de 3.
//
// La causa no era peso-bundle --su exit es legitimo, corre suelto en el job
// e2e-- sino el invariante repartido: dos copias de la misma lista, una de ellas
// vieja. Que es exactamente la patologia que la decision 10 del CLAUDE.md dice
// que estas herramientas existen para cazar.
export const NO_SON_VIGILANTES = new Set([
  'index.mjs', // el propio runner
  'nucleo.mjs', // contrato comun (este fichero)
  'bd-comun.mjs', // credencial y RPC compartidos
  'enviar.mjs', // publica informes
  'pedir-bd.mjs', // cli de diagnostico
  'compilar-estado.mjs', // compilador del snapshot global
  'smoke-a-hallazgos.mjs', // traductor de informes de playwright
  'peso-bundle.mjs', // corre en el job e2e, no en el runner
  'rendimiento.mjs', // idem: traduce mediciones del smoke
  'silencios.mjs', // idem
  'notificar.mjs', // canal de salida (telegram)
  'issues.mjs', // canal de salida (github issues)
  'dr-backups.mjs', // corre en su propio workflow mensual
  'red-de-seguridad.mjs', // el guardia que oye al runner morir a destiempo
  'registro.mjs', // la lista unica de vigilantes que comparten runner y snapshot
]);

// Los ficheros trampa que crean los tests de este directorio.
//
// `index.test.mjs` deja un vigilante ENVENENADO (con process.exit() de cuerpo)
// en scripts/vigilantes/ para comprobar de punta a punta que el runner lo caza
// sin morirse. Los escaneres NO lo ignoran -- esa es justo la gracia del test.
// Pero `node --test` corre los ficheros EN PARALELO, asi que los otros tests,
// los que afirman "hoy esta todo limpio", se lo encuentran por el camino y
// fallarian por el fixture del vecino.
//
// Esta constante existe para que esos tests lo descuenten con UNA definicion y
// no con tres copias de un regex, que es la enfermedad que estas herramientas
// existen para cazar. Solo la usan los tests: el codigo de produccion no la mira.
export const ES_FIXTURE_DE_TEST = /^trampa-/;

// Los vigilantes de RED, por ruta. No van en la CI del PR: necesitan credencial
// y sus RPC no se crean por pull request, sino por migracion aplicada en remoto.
//
// Vive aqui y no en registro.mjs porque la pregunta meta-registro, y registro
// importa a meta-registro: ponerla alli creaba un CICLO de importacion. El
// sintoma fue bonito y conviene recordarlo -- `npm run vigilar` seguia en verde
// (entrando por registro.mjs el ciclo se resuelve en el orden bueno) y solo
// reventaba al importar meta-registro.mjs directamente, que es lo que hace su
// test. Un ciclo ESM no falla siempre: falla segun por donde entres.
export const DE_RED = [
  './bd.mjs',
  './bd-rendimiento.mjs',
  './bd-migraciones.mjs',
  './bd-ecosistema.mjs',
  './bd-profunda.mjs',
  './bd-triggers-ciegos.mjs',
  './bd-sobrecargas-rpc.mjs',
  './bd-escritura-critica.mjs',
  './bd-invariantes.mjs',
];

// El ancla ya no esta donde estaba: el vigilante se ha quedado ciego.
export class AnclaPerdida extends Error {
  constructor(mensaje, { fichero, ancla } = {}) {
    super(mensaje);
    this.name = 'AnclaPerdida';
    this.fichero = fichero ?? null;
    this.ancla = ancla ?? null;
  }
}

/**
 * Devuelve el codigo con los comentarios y los textos literales en blanco, para
 * poder buscar llamadas REALES y no menciones.
 *
 * POR QUE HACE FALTA: la comprobacion 1 buscaba /\bprocess\.exit\s*\(/ sobre el
 * fichero crudo, asi que se disparaba con la frase de su propia cabecera y con
 * el texto del hallazgo que emite. Este fichero llevaba desde que se escribio
 * acusandose a si mismo, y nadie lo vio porque el runner moria antes de
 * imprimir. Un vigilante que no distingue una llamada de una mencion no puede
 * sostener la regla que dice vigilar.
 *
 * Y ahora ademas importa para la CORRECCION, no solo para el ruido: si esto da
 * un falso positivo, el recorrido se salta la inspeccion del contrato de ese
 * fichero (ver la comprobacion 3) y deja de mirarle los exports en silencio.
 *
 * Es un barrido de un solo paso, no un parser: distingue comentarios, cadenas,
 * plantillas y literales de expresion regular. Suficiente para ficheros .mjs de
 * este directorio, y si algun dia se queda corto el fallo cae del lado seguro --
 * red-de-seguridad.mjs oye igual cualquier salida a destiempo.
 * @param {string} fuente
 * @returns {string}
 */
export function codigoEjecutable(fuente) {
  // Tras uno de estos, una barra abre una expresion regular; tras un identificador
  // o un cierre, es una division.
  const ABRE_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '\n', '+', '-', '*', '%', '<', '>', '~', '^']);
  let fuera = '';
  let i = 0;
  let ultimoSignificativo = '';

  while (i < fuente.length) {
    const c = fuente[i];
    const d = fuente[i + 1];

    if (c === '/' && d === '/') {
      while (i < fuente.length && fuente[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < fuente.length) {
        if (fuente[i] === '\\') { i += 2; continue; }
        if (fuente[i] === c) { i++; break; }
        i++;
      }
      ultimoSignificativo = '"';
      continue;
    }
    if (c === '/' && ABRE_REGEX.has(ultimoSignificativo)) {
      i++;
      let enClase = false;
      while (i < fuente.length) {
        if (fuente[i] === '\\') { i += 2; continue; }
        if (fuente[i] === '[') enClase = true;
        else if (fuente[i] === ']') enClase = false;
        else if (fuente[i] === '/' && !enClase) { i++; break; }
        else if (fuente[i] === '\n') break;
        i++;
      }
      ultimoSignificativo = '/';
      continue;
    }

    fuera += c;
    if (!/\s/.test(c)) ultimoSignificativo = c;
    else if (c === '\n') ultimoSignificativo = '\n';
    i++;
  }

  return fuera;
}

export function leer(rel) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) {
    throw new AnclaPerdida(`No existe el fichero ${rel}`, { fichero: rel, ancla: 'fichero' });
  }
  return readFileSync(abs, 'utf8');
}

export function lineaDe(texto, indice) {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === '\n') n++;
  return n;
}

// Busca `re` en `texto` y devuelve { valor, linea }. `re` DEBE tener un grupo 1.
export function capturar(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(
      `El ancla "${ancla}" ya no aparece en ${fichero}. O se ha reescrito esa parte ` +
      '(y hay que actualizar el vigilante) o se ha borrado. Un vigilante ciego no vale ' +
      'para nada, asi que esto falla a proposito.',
      { fichero, ancla },
    );
  }
  return { valor: m[1], linea: lineaDe(texto, m.index) };
}

// Igual que capturar pero para anclas que solo tienen que EXISTIR.
export function exigir(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(`El ancla "${ancla}" ya no aparece en ${fichero}.`, { fichero, ancla });
  }
  return { linea: lineaDe(texto, m.index) };
}

export function hallazgo({ clave, nivel, ambito, titulo, detalle, fichero = null, linea = null }) {
  if (!NIVELES.includes(nivel)) throw new Error(`Nivel no valido: ${nivel}`);
  if (!clave || !titulo) throw new Error('Un hallazgo necesita clave y titulo');
  return { clave, nivel, ambito, titulo, detalle: detalle || '', fichero, linea };
}

// Azucar para el caso comun: dos valores que TIENEN que ser iguales. Compara
// como texto a proposito, para que 39 y "39" cuadren sin castings por todas partes.
export function debenCuadrar({ clave, ambito, que, esperado, encontrado, fichero = null, linea = null, porque = '' }) {
  if (String(esperado) === String(encontrado)) return null;
  return hallazgo({
    clave,
    nivel: 'bloqueante',
    ambito,
    titulo: `${que}: se esperaba ${esperado} y hay ${encontrado}`,
    detalle: porque,
    fichero,
    linea,
  });
}
