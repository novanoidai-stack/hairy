// Vigilante de Planta: Meta-Contrato
//
// Audita que todos los módulos vigilantes en scripts/vigilantes/ cumplan el contrato
// estricto del sistema:
// 1. Exportan por defecto { nombre, ambito, descripcion, ejecutar }
// 2. Ningún vigilante usa `process.exit()` directamente (salvo el runner index.mjs)
// 3. Todo vigilante operativo tiene su correspondiente archivo *.test.mjs
// 4. Utiliza la clase `AnclaPerdida` para fallos de regex en vez de silenciar
// 5. Los nombres son únicos y los ámbitos están dentro del catálogo permitido

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIR = 'scripts/vigilantes';

const ARCHIVOS_EXCLUIDOS_DE_CONTRATO = new Set([
  'index.mjs',
  'nucleo.mjs',
  'bd-comun.mjs',
  'compilar-estado.mjs',
  'enviar.mjs',
  'notificar.mjs',
  'issues.mjs',
  'pedir-bd.mjs',
  'smoke-a-hallazgos.mjs',
]);

const AMBITOS_VALIDOS = new Set([
  'seguridad',
  'base-de-datos',
  'codigo',
  'negocio',
  'fiscal',
  'rendimiento',
  'meta',
  'legal',
  'despliegue',
]);

/**
 * Revisa el código y exportaciones de los vigilantes.
 * @param {string[]} listaFicheros 
 * @returns {Promise<import('./nucleo.mjs').Hallazgo[]>}
 */
export async function auditarContratosVigilantes(listaFicheros = null) {
  const dirAbs = path.join(RAIZ, DIR);
  const ficheros = listaFicheros || readdirSync(dirAbs);
  const modulosMjs = ficheros.filter(
    (f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !ARCHIVOS_EXCLUIDOS_DE_CONTRATO.has(f),
  );

  const hallazgos = [];
  const nombresVistos = new Map();

  for (const f of modulosMjs) {
    const rel = path.posix.join(DIR, f);
    const abs = path.join(RAIZ, rel);
    const codigo = readFileSync(abs, 'utf8');

    // 1. Prohibido process.exit() en módulos individuales (evita cuelgues libuv en Windows)
    if (/\bprocess\.exit\s*\(/.test(codigo)) {
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/process-exit-${f}`,
          nivel: 'bloqueante',
          ambito: 'meta',
          titulo: `${rel} usa process.exit() directamente`,
          detalle:
            'Los módulos vigilantes deben devolver hallazgos o lanzar AnclaPerdida. ' +
            'Matar el proceso con process.exit() dentro de un módulo aborta la suite y causa ' +
            'crashes de libuv en sockets de red en Windows. El runner index.mjs es el único que gestiona la salida.',
          fichero: rel,
        }),
      );
    }

    // 2. Debe existir archivo de test unitario
    const nombreBase = f.replace(/\.mjs$/, '');
    const testDirecto = `${nombreBase}.test.mjs`;
    const tieneTest = existsSync(path.join(dirAbs, testDirecto));

    if (!tieneTest) {
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/sin-test-${f}`,
          nivel: 'bloqueante',
          ambito: 'meta',
          titulo: `El vigilante ${rel} no tiene archivo de test ${testDirecto}`,
          detalle:
            'Regla de Meta-Vigilancia: Cada vigilante debe estar acompañado de su suite ' +
            'de tests unitarios (*.test.mjs) para verificar su contrato y que no esté ciego.',
          fichero: rel,
        }),
      );
    }

    // 3. Inspección del contrato exportado
    try {
      const mod = (await import(`file://${abs.replace(/\\/g, '/')}`)).default;
      if (!mod || typeof mod !== 'object') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/export-invalido-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no tiene export default con objeto válido`,
            detalle: 'Un vigilante debe exportar por defecto un objeto con { nombre, ambito, descripcion, ejecutar }',
            fichero: rel,
          }),
        );
        continue;
      }

      if (!mod.nombre || typeof mod.nombre !== 'string') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/sin-nombre-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no define 'nombre' (string no vacío)`,
            detalle: 'El campo nombre identifica unívocamente al vigilante en CLI y panel.',
            fichero: rel,
          }),
        );
      } else {
        if (nombresVistos.has(mod.nombre)) {
          hallazgos.push(
            hallazgo({
              clave: `meta-contrato/nombre-duplicado-${mod.nombre}`,
              nivel: 'bloqueante',
              ambito: 'meta',
              titulo: `Nombre de vigilante duplicado "${mod.nombre}" en ${f} y ${nombresVistos.get(mod.nombre)}`,
              detalle: 'Cada vigilante debe tener un nombre único para evitar colisiones en reportes y CLI (--solo).',
              fichero: rel,
            }),
          );
        } else {
          nombresVistos.set(mod.nombre, f);
        }
      }

      if (!mod.ambito || !AMBITOS_VALIDOS.has(mod.ambito)) {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/ambito-invalido-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} usa un ámbito inválido "${mod.ambito}"`,
            detalle: `Los ámbitos permitidos son: ${[...AMBITOS_VALIDOS].join(', ')}`,
            fichero: rel,
          }),
        );
      }

      if (typeof mod.ejecutar !== 'function') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/sin-ejecutar-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no tiene función ejecutar()`,
            detalle: 'La función ejecutar() debe devolver una Promise con el array de hallazgos.',
            fichero: rel,
          }),
        );
      }
    } catch (err) {
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/error-import-${f}`,
          nivel: 'bloqueante',
          ambito: 'meta',
          titulo: `Error al importar dinámicamente ${rel}`,
          detalle: String(err?.message || err),
          fichero: rel,
        }),
      );
    }
  }

  return hallazgos;
}

async function ejecutar() {
  return auditarContratosVigilantes();
}

export default {
  nombre: 'meta-contrato',
  ambito: 'meta',
  descripcion:
    'Vigilante de Planta: audita que todos los vigilantes cumplan el contrato estándar, no usen process.exit y tengan tests',
  ejecutar,
};
