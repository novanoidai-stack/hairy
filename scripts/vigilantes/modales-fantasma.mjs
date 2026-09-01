// Vigilante de Modales Fantasma y Cierre de Diálogos
//
// POR QUE EXISTE:
// En aplicaciones móviles y web, si un Modal no maneja el cierre al pulsar fuera
// (backdrop click / onRequestClose) o carece de botón explícito de cancelación,
// el usuario puede quedarse bloqueado en la pantalla sin salida (UI trap / scroll lock).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIRECTORIOS = ['components', 'app'];

function obtenerArchivos(dir) {
  const abs = path.join(RAIZ, dir);
  const salida = [];
  try {
    const entradas = readdirSync(abs);
    for (const ent of entradas) {
      const ruta = path.join(abs, ent);
      const st = statSync(ruta);
      if (st.isDirectory()) {
        salida.push(...obtenerArchivos(path.join(dir, ent)));
      } else if (/\.(tsx|jsx)$/.test(ent) && !ent.includes('.test.')) {
        salida.push(path.join(dir, ent));
      }
    }
  } catch {
    // Si no existe, ignorar
  }
  return salida;
}

/**
 * Analiza modales para asegurar que implementan mecanismos de salida.
 * @param {string} codigo
 * @param {string} fichero
 * @returns {import('./nucleo.mjs').Hallazgo[]}
 */
export function analizarModales(codigo, fichero) {
  const hallazgos = [];

  // Buscar declaraciones <Modal ...>
  const reModal = /<Modal\b([\s\S]*?)>/g;

  for (const match of codigo.matchAll(reModal)) {
    const props = match[1];

    const tieneOnRequestClose = /onRequestClose\s*=/.test(props);
    const tieneOnDismiss = /onDismiss\s*=/.test(props);

    if (!tieneOnRequestClose && !tieneOnDismiss) {
      hallazgos.push(
        hallazgo({
          clave: `modales-fantasma/sin-cierre-${fichero.replace(/\W+/g, '-')}-${hallazgos.length}`,
          nivel: 'aviso',
          ambito: 'codigo',
          titulo: `${fichero}: <Modal> no implementa onRequestClose / onDismiss`,
          detalle:
            `En ${fichero}, un componente <Modal> carece de onRequestClose o onDismiss. ` +
            'En dispositivos móviles o navegadores con botón atrás/tecla Escape, esto impide ' +
            'que el usuario cierre el diálogo de forma estándar.',
          fichero,
        }),
      );
    }
  }

  return hallazgos;
}

async function ejecutar() {
  const hallazgos = [];
  const archivos = DIRECTORIOS.flatMap((d) => obtenerArchivos(d));

  for (const arch of archivos) {
    const rel = arch.replace(/\\/g, '/');
    const codigo = readFileSync(path.join(RAIZ, arch), 'utf8');
    hallazgos.push(...analizarModales(codigo, rel));
  }

  return hallazgos;
}

export default {
  nombre: 'modales-fantasma',
  ambito: 'codigo',
  descripcion:
    'Detecta modales sin onRequestClose / onDismiss que pueden atrapar la navegación del usuario',
  ejecutar,
};
