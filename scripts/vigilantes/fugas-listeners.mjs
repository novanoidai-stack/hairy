// Vigilante de Fugas de Memoria y Limpieza de Listeners / Canales Realtime
//
// POR QUE EXISTE:
// En aplicaciones React/SPA, crear un canal de WebSocket (`supabase.channel(...)`),
// un `addEventListener` o un `setInterval` dentro de un `useEffect` sin devolver
// una función de limpieza (`return () => ...`) acumula listeners zombi, degrada
// el rendimiento y provoca fugas de memoria silenciosas.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIRECTORIOS = ['app', 'components', 'lib/hooks'];

function obtenerArchivosTsx(dir) {
  const abs = path.join(RAIZ, dir);
  const salida = [];
  try {
    const entradas = readdirSync(abs);
    for (const ent of entradas) {
      const ruta = path.join(abs, ent);
      const st = statSync(ruta);
      if (st.isDirectory()) {
        salida.push(...obtenerArchivosTsx(path.join(dir, ent)));
      } else if (/\.(tsx|ts|jsx|js)$/.test(ent) && !ent.includes('.test.')) {
        salida.push(path.join(dir, ent));
      }
    }
  } catch {
    // Si no existe la carpeta, ignorar
  }
  return salida;
}

/**
 * Analiza el código buscando useEffects con listeners o canales sin cleanup.
 * @param {string} codigo
 * @param {string} fichero
 * @returns {import('./nucleo.mjs').Hallazgo[]}
 */
export function analizarFugasMemoria(codigo, fichero) {
  const hallazgos = [];

  // Buscar bloques useEffect(...)
  const reUseEffect = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([\s\S]*?)\]\s*\)/g;

  for (const match of codigo.matchAll(reUseEffect)) {
    const cuerpo = match[1];

    const tieneInterval = /setInterval\s*\(/.test(cuerpo);
    const tieneEventListener = /addEventListener\s*\(/.test(cuerpo);
    const tieneChannel = /\.channel\s*\(/.test(cuerpo) || /\.subscribe\s*\(/.test(cuerpo);

    if (tieneInterval || tieneEventListener || tieneChannel) {
      const tieneReturnCleanup = /return\s*\(\s*\)\s*=>/.test(cuerpo) || /return\s+function/.test(cuerpo);

      if (!tieneReturnCleanup) {
        let motivo = '';
        if (tieneInterval) motivo = 'crea un setInterval()';
        else if (tieneEventListener) motivo = 'añade un addEventListener()';
        else if (tieneChannel) motivo = 'se suscribe a un canal de Supabase Realtime';

        hallazgos.push(
          hallazgo({
            clave: `fugas-listeners/sin-cleanup-${fichero.replace(/\W+/g, '-')}-${hallazgos.length}`,
            nivel: 'aviso',
            ambito: 'codigo',
            titulo: `${fichero}: useEffect ${motivo} sin función de limpieza (return () => ...)`,
            detalle:
              `En ${fichero}, un useEffect inicializa recursos persistentes (${motivo}) pero ` +
              'no devuelve una función de desmontaje para liberarlos (clearInterval / removeEventListener / removeChannel). ' +
              'Esto provoca fugas de memoria y listeners zombi al navegar entre pantallas.',
            fichero,
          }),
        );
      }
    }
  }

  return hallazgos;
}

async function ejecutar() {
  const hallazgos = [];
  const archivos = DIRECTORIOS.flatMap((d) => obtenerArchivosTsx(d));

  for (const arch of archivos) {
    const rel = arch.replace(/\\/g, '/');
    const codigo = readFileSync(path.join(RAIZ, arch), 'utf8');
    hallazgos.push(...analizarFugasMemoria(codigo, rel));
  }

  return hallazgos;
}

export default {
  nombre: 'fugas-listeners',
  ambito: 'codigo',
  descripcion:
    'Detecta useEffects con setInterval, addEventListener o canales Realtime sin función de limpieza (memory leaks)',
  ejecutar,
};
