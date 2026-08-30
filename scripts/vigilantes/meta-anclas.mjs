// scripts/vigilantes/meta-anclas.mjs
// Meta-vigilante: Comprueba que TODOS los vigilantes mantengan sus ANCLAS VIVAS.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

export const ANCLAS_VIGILADAS = [
  {
    vigilante: 'claves',
    fichero: 'supabase/functions/shared/claveServicio.ts',
    anclas: [/export function claveServicio\(/, /export function clavePublicable\(/],
  },
  {
    vigilante: 'claves',
    fichero: 'lib/supabase.ts',
    anclas: [/sb_publishable_/],
  },
  {
    vigilante: 'ecosistema-cuentas',
    fichero: 'supabase/migrations/20260830002457_guard_profiles_congelar_de_verdad.sql',
    anclas: [/create\s+or\s+replace\s+function\s+public\.guard_profile_identity_columns/i],
  },
  {
    vigilante: 'claims-fiscales',
    fichero: 'lib/fiscal/estadoVerifactu.ts',
    anclas: [/export const ENVIO_AEAT_DISPONIBLE = (true|false);/, /export const QR_COTEJO_DISPONIBLE = (true|false);/],
  },
  {
    vigilante: 'planes',
    fichero: 'lib/planes.ts',
    anclas: [/export const PLANES_CONTRATABLES/, /export const PLAN_FUNCIONES/],
  },
  {
    vigilante: 'horarios-convenio',
    fichero: 'scripts/vigilantes/horarios-convenio.mjs',
    anclas: [/TABLA_LUNES = 'negocio_horarios'/, /TABLA_DOMINGO = 'horarios_profesional'/],
  },
  {
    vigilante: 'panel-ambitos',
    fichero: 'web/admin.html',
    anclas: [/var AMBITO_SAL_LABEL = \{/],
  },
];

export function auditarAnclas(lista = ANCLAS_VIGILADAS) {
  const hallazgos = [];
  for (const item of lista) {
    const abs = path.join(RAIZ, item.fichero);
    if (!existsSync(abs)) {
      hallazgos.push(
        hallazgo({
          clave: `meta-anclas/fichero-desaparecido:${item.fichero}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `El fichero ancla ${item.fichero} del vigilante ${item.vigilante} no existe`,
          detalle: 'Un vigilante depende de este fichero para validar invariantes. Si se ha movido o renombrado, actualizar el vigilante.',
          fichero: item.fichero,
        })
      );
      continue;
    }
    const texto = readFileSync(abs, 'utf8');
    for (const re of item.anclas) {
      if (!re.test(texto)) {
        hallazgos.push(
          hallazgo({
            clave: `meta-anclas/ancla-ciega:${item.vigilante}:${item.fichero}`,
            nivel: 'bloqueante',
            ambito: 'vigilancia',
            titulo: `Ancla perdida en ${item.fichero} (vigilante: ${item.vigilante})`,
            detalle: `El patrón ${re.toString()} ya no casa con el código en ${item.fichero}. El vigilante ${item.vigilante} está ciego y pasaría en verde falsamente.`,
            fichero: item.fichero,
          })
        );
      }
    }
  }
  return hallazgos;
}

async function ejecutar() {
  return auditarAnclas(ANCLAS_VIGILADAS);
}

export default {
  nombre: 'meta-anclas',
  ambito: 'vigilancia',
  descripcion: 'Garantiza que ningún vigilante quede ciego verificando la existencia de todas sus anclas de código',
  ejecutar,
};
