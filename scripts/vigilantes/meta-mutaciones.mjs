// Vigilante de Planta: Meta-Mutaciones (Inyección de Fallos Sintéticos)
//
// POR QUE EXISTE:
// Si el código base hoy está limpio, un vigilante devuelve 0 hallazgos. Pero,
// ¿cómo sabemos si el vigilante realmente está viendo o si sus expresiones
// regulares/lógica interna se rompieron?
//
// Meta-Mutaciones inyecta fragmentos de código corrupto simulado en memoria
// contra los analizadores centrales de cada vigilante. Si alguno devuelve VERDE
// ante un fallo evidente, se marca como BLOQUEANTE: "El vigilante X se ha quedado sordo".

import { hallazgo } from './nucleo.mjs';
import { revisarCadenaCI } from './ci-cadena-rota.mjs';
import { analizarCadenasTriggers } from './trigger-cadenas.mjs';
import { revisarWorkflow } from './workflows.mjs';

/**
 * Ejecuta una suite de mutaciones e inyecciones de fallo en memoria.
 * @returns {import('./nucleo.mjs').Hallazgo[]}
 */
export function probarMutaciones() {
  const hallazgos = [];

  // Mutación 1: Inyectar fallo en CI (Deno sin --allow-env)
  const docWorkflowInvalido = {
    jobs: {
      test: {
        steps: [
          {
            name: 'Correr tests de edge functions',
            run: 'deno test supabase/functions/mi-edge/index.ts',
          },
        ],
      },
    },
  };
  const resCI = revisarCadenaCI(docWorkflowInvalido, 'simulacion-workflow.yml');
  const cazoDeno = resCI.some((h) => h.clave.includes('deno-sin-allow-env'));
  if (!cazoDeno) {
    hallazgos.push(
      hallazgo({
        clave: 'meta-mutaciones/ci-cadena-rota-sordo',
        nivel: 'bloqueante',
        ambito: 'meta',
        titulo: 'El vigilante "ci-cadena-rota" está sordo ante pasos Deno sin permisos',
        detalle: 'Se inyectó un paso `deno test` sin `--allow-env` y el vigilante no emitió hallazgo bloqueante.',
        fichero: 'scripts/vigilantes/ci-cadena-rota.mjs',
      }),
    );
  }

  // Mutación 2: Inyectar trigger auto-referencial y cascada mutua
  const sqlMutado = `
    CREATE OR REPLACE FUNCTION trg_sync_func() RETURNS trigger AS $$
    BEGIN
      UPDATE citas SET fin = NEW.inicio + interval '1 hour' WHERE id = NEW.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_sync AFTER INSERT ON citas
    FOR EACH ROW EXECUTE FUNCTION trg_sync_func();

    CREATE OR REPLACE FUNCTION trg_update_func() RETURNS trigger AS $$
    BEGIN
      UPDATE citas SET inicio = NEW.fin WHERE id = NEW.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_upd AFTER UPDATE ON citas
    FOR EACH ROW EXECUTE FUNCTION trg_update_func();
  `;
  const resTrig = analizarCadenasTriggers(sqlMutado, 'simulacion-migracion.sql');
  const cazoAutoRef = resTrig.some((h) => h.clave.includes('auto-ref'));
  const cazoCascada = resTrig.some((h) => h.clave.includes('cascada-mutua'));

  if (!cazoAutoRef || !cazoCascada) {
    hallazgos.push(
      hallazgo({
        clave: 'meta-mutaciones/trigger-cadenas-sordo',
        nivel: 'bloqueante',
        ambito: 'meta',
        titulo: 'El vigilante "trigger-cadenas" no detectó la cascada mutua inyectada',
        detalle: `Se inyectó una cascada mutua AFTER INSERT ↔ AFTER UPDATE. AutoRef: ${cazoAutoRef}, Cascada: ${cazoCascada}.`,
        fichero: 'scripts/vigilantes/trigger-cadenas.mjs',
      }),
    );
  }

  // Mutación 3: Inyectar esquema de Actions con uses + run simultáneos
  const docWorkflowActionsInvalido = {
    jobs: {
      build: {
        steps: [
          {
            name: 'Paso roto con uses y run',
            uses: 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
            run: 'echo "hola"',
          },
        ],
      },
    },
  };
  const motivos = revisarWorkflow(docWorkflowActionsInvalido);
  const cazoUsesRun = motivos.some((m) => m.includes('tiene `uses` y `run` a la vez'));
  if (!cazoUsesRun) {
    hallazgos.push(
      hallazgo({
        clave: 'meta-mutaciones/workflows-sordo',
        nivel: 'bloqueante',
        ambito: 'meta',
        titulo: 'El vigilante "workflows" no detectó un paso con `uses` y `run` juntos',
        detalle: 'Se inyectó un paso con ambos atributos y el validador no emitió error de esquema.',
        fichero: 'scripts/vigilantes/workflows.mjs',
      }),
    );
  }

  return hallazgos;
}

async function ejecutar() {
  return probarMutaciones();
}

export default {
  nombre: 'meta-mutaciones',
  ambito: 'meta',
  descripcion:
    'Vigilante de Planta: inyecta mutaciones y fallos controlados para certificar que los vigilantes responden en rojo',
  ejecutar,
};
