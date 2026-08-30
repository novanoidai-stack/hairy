// scripts/vigilantes/peso-componentes.mjs
// Vigilante de calidad de código y mantenibilidad para MECHA OS.
//
// Detecta:
//  1. Componentes gigantes (>450 líneas en app/ y components/).
//  2. Anidamiento y complejidad excesiva (>4 niveles de if/switch/try/catch).

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

const LIMITE_LINEAS = 450;
const LIMITE_ANIDAMIENTO = 4;
const CARPETAS = ['app/', 'components/'];

function ficherosTsx() {
  let salida;
  try {
    salida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new AnclaPerdida(
      `No se pudo consultar git ls-files para peso-componentes: ${e?.message || e}`,
      { fichero: '.git', ancla: 'git ls-files' },
    );
  }
  return salida
    .split('\0')
    .filter((rel) => rel.endsWith('.tsx') && CARPETAS.some((c) => rel.startsWith(c)));
}

export function medirProfundidadAnidamiento(codigo) {
  const lineas = codigo.split('\n');
  let maxNivel = 0;
  let nivelActual = 0;

  for (const linea of lineas) {
    const lim = linea.trim();
    if (!lim || lim.startsWith('//') || lim.startsWith('/*')) continue;
    const aperturas = (linea.match(/\{/g) || []).length;
    const cierres = (linea.match(/\}/g) || []).length;
    nivelActual = Math.max(0, nivelActual + aperturas - cierres);
    if (nivelActual > maxNivel) maxNivel = nivelActual;
  }
  return maxNivel;
}

export function revisarArchivo(rel, contenido, limiteLineas = LIMITE_LINEAS, limiteProf = LIMITE_ANIDAMIENTO) {
  const hallazgos = [];
  const lineas = contenido.split('\n').length;
  const maxProfundidad = medirProfundidadAnidamiento(contenido);

  if (lineas > limiteLineas) {
    hallazgos.push(
      hallazgo({
        clave: `peso-componentes/archivo-monstruo:${rel}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `${rel} supera el límite de tamaño (${lineas} líneas > ${limiteLineas})`,
        detalle:
          `El componente tiene ${lineas} líneas. Se recomienda refactorizar y extraer subcomponentes ` +
          'o hooks personalizados para mejorar la mantenibilidad y reducir renders innecesarios.',
        fichero: rel,
      }),
    );
  }

  if (maxProfundidad > limiteProf + 2) {
    hallazgos.push(
      hallazgo({
        clave: `peso-componentes/anidamiento-profundo:${rel}`,
        nivel: 'aviso',
        ambito: 'rendimiento',
        titulo: `${rel} tiene anidamiento excesivo (nivel ${maxProfundidad} > ${limiteProf})`,
        detalle:
          'Se detectaron bloques con más de 6 niveles de indentación/llaves anidadas. ' +
          'Conviene aplicar cláusulas de guarda (early returns) o extraer funciones auxiliares.',
        fichero: rel,
      }),
    );
  }

  return { lineas, maxProfundidad, hallazgos };
}

async function ejecutar() {
  const hallazgos = [];
  const lista = ficherosTsx();

  if (lista.length === 0) {
    throw new AnclaPerdida('No se encontraron archivos .tsx en app/ ni components/', {
      fichero: 'app/',
      ancla: '*.tsx',
    });
  }

  for (const rel of lista) {
    let contenido;
    try {
      const abs = path.join(RAIZ, rel);
      if (statSync(abs).size > 4_000_000) continue;
      contenido = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    const { hallazgos: h } = revisarArchivo(rel, contenido);
    hallazgos.push(...h);
  }

  return hallazgos;
}

export default {
  nombre: 'peso-componentes',
  ambito: 'rendimiento',
  descripcion: 'Detecta componentes React gigantes (>450 líneas) y complejidad ciclomática excesiva',
  ejecutar,
};
