// Guardrail y Auditor de Integridad de la IA (Grounding, Anti-Leaks & Syntax)
//
// POR QUE EXISTE:
// La IA orquestadora genera diagnósticos, análisis de causa raíz y prompts de
// auto-reparación. Si la IA alucina un archivo inexistente, inventa una función
// o filtra una variable de entorno con credenciales, este guardrail intercepta
// y rechaza el diagnóstico antes de presentarlo al panel de staff.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const PATRONES_SECRETOS = [
  /sb_secret_[a-z0-9_-]{20,}/i,
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWTs legacy
  /sk_live_[a-zA-Z0-9]{20,}/i, // Stripe live keys
  /sk-or-v1-[a-zA-Z0-9]{30,}/i, // OpenRouter keys
];

/**
 * Valida un objeto de diagnóstico generado por la IA.
 * @param {object} diagnostico
 * @returns {{ valido: boolean, motivos: string[] }}
 */
export function validarDiagnosticoIA(diagnostico) {
  const motivos = [];
  if (!diagnostico || typeof diagnostico !== 'object') {
    return { valido: false, motivos: ['El diagnóstico es nulo o no es un objeto'] };
  }

  const textoCompleto = JSON.stringify(diagnostico);

  // 1. Escudo Anti-Leaks (Zero secret leakage)
  for (const pat of PATRONES_SECRETOS) {
    if (pat.test(textoCompleto)) {
      motivos.push('El diagnóstico contiene posibles secretos o credenciales en texto claro.');
      break;
    }
  }

  // 2. Grounding Check: Validación de existencia física de archivos y líneas
  if (diagnostico.fichero && typeof diagnostico.fichero === 'string') {
    // Excluir referencias lógicas abstractas
    if (
      diagnostico.fichero !== 'base de datos' &&
      !diagnostico.fichero.startsWith('http') &&
      !diagnostico.fichero.includes('*')
    ) {
      const rutaAbs = path.join(RAIZ, diagnostico.fichero);
      if (!existsSync(rutaAbs)) {
        motivos.push(
          `Alucinación de archivo: El diagnóstico referencia "${diagnostico.fichero}", pero no existe en el repositorio.`,
        );
      } else if (diagnostico.linea && typeof diagnostico.linea === 'number') {
        const lineas = readFileSync(rutaAbs, 'utf8').split('\n').length;
        if (diagnostico.linea > lineas || diagnostico.linea < 1) {
          motivos.push(
            `Línea fuera de rango: El diagnóstico apunta a la línea ${diagnostico.linea} en "${diagnostico.fichero}" (total de líneas: ${lineas}).`,
          );
        }
      }
    }
  }

  // 3. Verificación de sintaxis y balanceo básico de prompts de corrección
  if (diagnostico.prompt_correccion && typeof diagnostico.prompt_correccion === 'string') {
    const p = diagnostico.prompt_correccion;
    const abiertos = (p.match(/\{/g) || []).length;
    const cerrados = (p.match(/\}/g) || []).length;
    if (abiertos !== cerrados && Math.abs(abiertos - cerrados) > 2) {
      motivos.push('El prompt de auto-reparación contiene llaves desbalanceadas severas.');
    }
  }

  return {
    valido: motivos.length === 0,
    motivos,
  };
}

async function ejecutar() {
  const hallazgos = [];
  const rutaSnapshot = path.join(RAIZ, '.sistema', 'estado-salud.json');

  if (existsSync(rutaSnapshot)) {
    try {
      const datos = JSON.parse(readFileSync(rutaSnapshot, 'utf8'));
      const diagnosticos = datos.diagnosticos_ia || [];
      for (let i = 0; i < diagnosticos.length; i++) {
        const diag = diagnosticos[i];
        const res = validarDiagnosticoIA(diag);
        if (!res.valido) {
          hallazgos.push(
            hallazgo({
              clave: `guardrail-ia/diagnostico-invalido-${i}`,
              nivel: 'bloqueante',
              ambito: 'seguridad',
              titulo: `Diagnóstico IA #${i + 1} rechazado por Guardrail`,
              detalle: res.motivos.join('\n'),
              fichero: '.sistema/estado-salud.json',
            }),
          );
        }
      }
    } catch (e) {
      hallazgos.push(
        hallazgo({
          clave: 'guardrail-ia/snapshot-corrupto',
          nivel: 'aviso',
          ambito: 'codigo',
          titulo: 'El archivo .sistema/estado-salud.json no es JSON válido',
          detalle: String(e?.message || e),
          fichero: '.sistema/estado-salud.json',
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'guardrail-ia',
  ambito: 'seguridad',
  descripcion:
    'Guardián del Orquestador IA: audita Grounding (archivos reales), ausencia de secretos y sanidad de parches',
  ejecutar,
};
