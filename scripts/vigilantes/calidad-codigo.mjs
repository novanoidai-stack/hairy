#!/usr/bin/env node
// scripts/vigilantes/calidad-codigo.mjs
//
// Vigilante de calidad de código y complejidad para MECHA OS:
//   1. Detección de componentes React monstruo (> 450 líneas en app/ y components/).
//   2. Detección de complejidad ciclomática y anidamiento excesivo (> 4 niveles de control).
//   3. Detección de duplicación de lógica transversal / patrones repetidos.
//
// Exporta el contrato estándar de núcleo:
//   { nombre: 'calidad-codigo', ambito: 'rendimiento', descripcion, ejecutar }

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

export const LIMITE_LINEAS_COMPONENTE = 450;
export const LIMITE_PROFUNDIDAD_ANIDAMIENTO = 4;
export const MINIMO_LINEAS_DUPLICADAS = 8;
export const CARPETAS_OBJETIVO = ['app/', 'components/'];

/**
 * Obtiene la lista de ficheros .tsx y .jsx rastreados por git en app/ y components/.
 */
export function listarFicherosObjetivo(raiz = RAIZ) {
  let salida;
  try {
    salida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: raiz,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new AnclaPerdida(
      `No se pudo consultar git ls-files para calidad-codigo: ${e?.message || e}`,
      { fichero: '.git', ancla: 'git ls-files' },
    );
  }
  return salida
    .split('\0')
    .filter((rel) => (rel.endsWith('.tsx') || rel.endsWith('.jsx')) && CARPETAS_OBJETIVO.some((c) => rel.startsWith(c)));
}

// Caracteres tras los que un `/` abre un LITERAL DE REGEX y no es una division.
// Es la desambiguacion clasica de JS y no hay forma de hacerla sin mirar atras.
const ANTES_DE_REGEX = new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '\n',
]);

/**
 * Mide la profundidad de anidamiento de estructuras de control y bloques de código,
 * ignorando cadenas de texto, comentarios y literales de regex.
 *
 * Va carácter a carácter en vez de línea a línea con regex de limpieza, porque lo
 * segundo no puede acertar: una comilla escapada dentro de una cadena, o unas
 * llaves dentro de un literal de regex, descuadran el conteo y el nivel se va a
 * cero sin que se note. El caso que lo destapó es real y de manual —`/\}{2,}/`
 * tiene dos `}` y una `{`, así que RESTABA un nivel— y el efecto es el peor
 * posible en un vigilante: mide de MENOS, así que el código profundo deja de
 * salir y el panel se queda en verde por ceguera, no por limpieza.
 */
export function medirProfundidadAnidamiento(codigo) {
  if (!codigo || typeof codigo !== 'string') return 0;

  let maxNivel = 0;
  let nivel = 0;
  let i = 0;
  // Último carácter con significado: es lo que distingue `a / b` de `/regex/`.
  let previo = '';
  const n = codigo.length;

  while (i < n) {
    const c = codigo[i];
    const sig = codigo[i + 1];

    // Comentario de línea
    if (c === '/' && sig === '/') {
      while (i < n && codigo[i] !== '\n') i++;
      continue;
    }

    // Comentario de bloque
    if (c === '/' && sig === '*') {
      i += 2;
      while (i < n && !(codigo[i] === '*' && codigo[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Cadenas: comilla simple, doble y plantilla. Se saltan enteras, respetando
    // el escape, que es justo lo que fallaba antes.
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n) {
        if (codigo[i] === '\\') { i += 2; continue; }
        if (codigo[i] === c) { i++; break; }
        i++;
      }
      previo = c;
      continue;
    }

    // Literal de regex. `[...]` puede contener un `/` sin cerrarlo.
    if (c === '/' && ANTES_DE_REGEX.has(previo)) {
      i++;
      let enClase = false;
      while (i < n) {
        const d = codigo[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '\n') break;
        if (d === '[') enClase = true;
        else if (d === ']') enClase = false;
        else if (d === '/' && !enClase) { i++; break; }
        i++;
      }
      previo = '/';
      continue;
    }

    if (c === '{') {
      nivel++;
      if (nivel > maxNivel) maxNivel = nivel;
    } else if (c === '}') {
      nivel = Math.max(0, nivel - 1);
    }

    if (!/\s/.test(c)) previo = c;
    i++;
  }

  return maxNivel;
}

/**
 * Calcula una aproximación de complejidad ciclomática basada en puntos de decisión (if, for, while, case, catch, &&, ||, ?).
 */
export function calcularComplejidadCiclomatica(codigo) {
  if (!codigo || typeof codigo !== 'string') return 1;
  const limpio = codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '');

  const decisiones = (limpio.match(/\b(if|else if|for|while|case|catch)\b|\&\&|\|\||\?/g) || []).length;
  return 1 + decisiones;
}

/**
 * Detecta bloques idénticos o casi idénticos de código (> 8 líneas) entre pares de archivos.
 */
export function detectarDuplicacion(archivosContenido, opciones = {}) {
  const minLineas = opciones.minLineas ?? MINIMO_LINEAS_DUPLICADAS;
  const hallazgos = [];
  const bloquesVistos = new Map(); // hash normalizado -> { rel, linea, snippet }

  for (const { rel, contenido } of archivosContenido) {
    const lineas = contenido.split('\n');
    const normalizadas = lineas.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('import ') && !l.startsWith('export '));

    for (let i = 0; i <= normalizadas.length - minLineas; i++) {
      const bloque = normalizadas.slice(i, i + minLineas).join('\n');
      // Filtramos bloques triviales (solo llaves o cierres)
      if (bloque.replace(/[\{\}\(\)\,\;\s]/g, '').length < 60) continue;

      if (bloquesVistos.has(bloque)) {
        const previo = bloquesVistos.get(bloque);
        if (previo.rel !== rel) {
          hallazgos.push(
            hallazgo({
              clave: `calidad-codigo/duplicacion:${rel}:${previo.rel}`,
              nivel: 'aviso',
              ambito: 'rendimiento',
              titulo: `Lógica duplicada (${minLineas}+ líneas) entre ${rel} y ${previo.rel}`,
              detalle:
                `Se detectó un bloque de lógica idéntica entre ${rel} y ${previo.rel}.\n` +
                'Se recomienda abstraer este comportamiento en un helper común dentro de lib/ o un hook compartido.',
              fichero: rel,
              linea: 1,
            }),
          );
          // Evitamos saturar con demasiadas alertas del mismo par
          break;
        }
      } else {
        bloquesVistos.set(bloque, { rel, linea: i + 1, snippet: bloque.slice(0, 80) });
      }
    }
  }

  return hallazgos;
}

/**
 * Revisa un archivo individual contra tamaño de líneas y profundidad de anidamiento.
 */
export function revisarArchivo(rel, contenido, opciones = {}) {
  const limiteLineas = opciones.limiteLineas ?? LIMITE_LINEAS_COMPONENTE;
  const limiteProf = opciones.limiteProfundidad ?? LIMITE_PROFUNDIDAD_ANIDAMIENTO;
  const hallazgos = [];

  const lineas = contenido.split('\n').length;
  const maxProfundidad = medirProfundidadAnidamiento(contenido);
  const complejidad = calcularComplejidadCiclomatica(contenido);

  if (lineas > limiteLineas) {
    hallazgos.push(
      hallazgo({
        clave: `calidad-codigo/componente-monstruo:${rel}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `${rel} supera el límite de tamaño (${lineas} líneas > ${limiteLineas})`,
        detalle:
          `El componente tiene ${lineas} líneas. Se recomienda modularizar y extraer subcomponentes ` +
          'o custom hooks para optimizar el ciclo de render y mejorar la mantenibilidad.',
        fichero: rel,
        linea: 1,
      }),
    );
  }

  if (maxProfundidad > limiteProf + 2) {
    hallazgos.push(
      hallazgo({
        clave: `calidad-codigo/anidamiento-profundo:${rel}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `${rel} tiene complejidad/anidamiento excesivo (nivel ${maxProfundidad} > ${limiteProf})`,
        detalle:
          `Se detectaron bloques de control con profundidad de ${maxProfundidad} niveles anidados. ` +
          'Conviene aplicar cláusulas de guarda (early returns) o descomponer en funciones auxiliares.',
        fichero: rel,
        linea: 1,
      }),
    );
  }

  return { lineas, maxProfundidad, complejidad, hallazgos };
}

/**
 * Ejecución estándar del vigilante de calidad de código y complejidad.
 */
async function ejecutar(opciones = {}) {
  const raizRepo = opciones.raiz || RAIZ;
  const hallazgos = [];
  const lista = opciones.ficheros || listarFicherosObjetivo(raizRepo);

  if (lista.length === 0) {
    throw new AnclaPerdida('No se encontraron archivos .tsx ni .jsx en app/ ni components/', {
      fichero: 'app/',
      ancla: '*.tsx',
    });
  }

  const contenidosCargados = [];

  for (const rel of lista) {
    let contenido;
    try {
      const abs = path.join(raizRepo, rel);
      if (statSync(abs).size > 4_000_000) continue;
      contenido = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    contenidosCargados.push({ rel, contenido });
    const { hallazgos: h } = revisarArchivo(rel, contenido, opciones);
    hallazgos.push(...h);
  }

  // Detección de duplicación transversal si hay suficientes archivos cargados
  if (contenidosCargados.length > 1 && opciones.verificarDuplicacion !== false) {
    const hallazgosDup = detectarDuplicacion(contenidosCargados, opciones);
    hallazgos.push(...hallazgosDup);
  }

  return hallazgos;
}

export default {
  nombre: 'calidad-codigo',
  ambito: 'rendimiento',
  descripcion: 'Vigila componentes React monstruo (>450 líneas), anidamiento (>4) y lógica duplicada en app/ y components/',
  ejecutar,
};
