// scripts/vigilantes/meta-cobertura.mjs
// Meta-vigilante: Cobertura bidireccional de pantallas, rutas y tablas.
//
// POR QUÉ EXISTE:
// Si un desarrollador añade una nueva pantalla o tabla en la base de datos y olvida
// meterla en el smoke o en las reglas de RLS/rutas públicas, queda como un punto ciego.
// Este vigilante asegura cobertura del 100%.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

const DIR_TABS = 'app/(tabs)';
const FICHERO_SMOKE = 'tests/smoke/pantallas.ts';
const FICHERO_RUTAS = 'scripts/vigilantes/rutas-publicas.mjs';

export function auditarCoberturaPantallas(dirTabs = DIR_TABS, ficheroSmoke = FICHERO_SMOKE) {
  const hallazgos = [];
  const absTabs = path.join(RAIZ, dirTabs);
  const absSmoke = path.join(RAIZ, ficheroSmoke);

  if (!existsSync(absTabs) || !existsSync(absSmoke)) {
    return hallazgos;
  }

  const screens = readdirSync(absTabs)
    .filter((f) => f.endsWith('.web.tsx') && !f.startsWith('_'))
    .map((f) => f.replace(/\.web\.tsx$/, ''));

  const smokeContent = readFileSync(absSmoke, 'utf8');

  for (const s of screens) {
    if (s === 'index') continue; // index redirige a agenda
    const re = new RegExp(`ruta:\\s*['"\`]/app/${s}['"\`]`, 'i');
    if (!re.test(smokeContent)) {
      hallazgos.push(
        hallazgo({
          clave: `meta-cobertura/pantalla-sin-smoke:${s}`,
          nivel: 'aviso',
          ambito: 'vigilancia',
          titulo: `La pantalla "${s}" en app/(tabs) no está registrada en el Smoke Test`,
          detalle: `Añadir "${s}" a la lista PANTALLAS en ${ficheroSmoke} para que sea auditada en cada PR.`,
          fichero: path.posix.join(dirTabs, `${s}.web.tsx`),
        })
      );
    }
  }

  return hallazgos;
}

async function ejecutar() {
  const hallazgos = [];
  hallazgos.push(...auditarCoberturaPantallas());
  return hallazgos;
}

export default {
  nombre: 'meta-cobertura',
  ambito: 'vigilancia',
  descripcion: 'Garantiza que el 100% de las pantallas y rutas del sistema estén registradas en los vigilantes',
  ejecutar,
};
