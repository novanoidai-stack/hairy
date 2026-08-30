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

/**
 * Mide la profundidad de anidamiento de estructuras de control y bloques de código,
 * ignorando cadenas de texto y comentarios para evitar falsos conteos de llaves.
 */
export function medirProfundidadAnidamiento(codigo) {
  if (!codigo || typeof codigo !== 'string') return 0;

  let maxNivel = 0;
  let nivelActual = 0;
  let enComentarioBloque = false;

  const lineas = codigo.split('\n');

  for (const lineaRaw of lineas) {
    let linea = lineaRaw.trim();
    if (!linea) continue;

    // Manejo de comentarios multilinea
    if (enComentarioBloque) {
      const fin = linea.indexOf('*/');
      if (fin !== -1) {
        enComentarioBloque = false;
        linea = linea.slice(fin + 2).trim();
      } else {
        continue;
      }
    }

    // Quitar comentarios de una linea y cadenas literales
    linea = linea.replace(/\/\*[\s\S]*?\*\//g, '');
    const idxComentLinea = linea.indexOf('//');
    if (idxComentLinea !== -1) {
      linea = linea.slice(0, idxComentLinea).trim();
    }

    if (linea.includes('/*')) {
      enComentarioBloque = true;
      linea = linea.slice(0, linea.indexOf('/*')).trim();
    }

    // Eliminar strings para no contar llaves dentro de textos
    linea = linea.replace(/'(?:\\.|[^'\\])*'/g, '');
    linea = linea.replace(/"(?:\\.|[^"\\])*"/g, '');
    linea = linea.replace(/`(?:\\.|[^`\\])*`/g, '');

    const aperturas = (linea.match(/\{/g) || []).length;
    const cierres = (linea.match(/\}/g) || []).length;

    nivelActual = Math.max(0, nivelActual + aperturas - cierres);
    if (nivelActual > maxNivel) {
      maxNivel = nivelActual;
    }
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
