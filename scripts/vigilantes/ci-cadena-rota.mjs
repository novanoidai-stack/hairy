// Vigilante de la cadena de CI: detecta configuraciones que pueden dejar a
// los vigilantes sin correr cuando mas falta hacen.
//
// POR QUE EXISTE (30 ago 2026)
// Un `deno task test:tecnificador` sin --allow-env en deno.json rompio la CI.
// Los pasos de vigilancia estaban DETRAS, sin `if: always()`. Resultado: CI en
// rojo, vigilantes nunca corrieron, vigilancia.json no se genero, el canario
// quedo en skipped. El desastre entro 3 horas despues y nadie se entero hasta
// que un humano miro el portal.
//
// Lo que vigila:
// 1. Tests de Deno sin --allow-env ni -A: en el paso (inline) o resuelto a
//    traves de la tarea de deno.json (que es como se colo de verdad: el paso
//    dice `deno task test:ia` y el flag que falta vive en el JSON).
// 2. Pasos de vigilancia que se saltan si un paso anterior falla (cascade-skip)
//
// Con lo que NO molesta: un paso de build/compilacion previo NO cuenta como
// "rompe-cadena" para el chequeo 2. Si el build falla el job va a rojo ruidoso
// de todos modos, y hay vigilantes (peso del bundle, claves contra el bundle)
// que SIN build no tienen nada que mirar: pedirles if: always() seria pedir un
// falso rojo. La regla que salvo el incidente es otra: lo que INFORMA no puede
// colgar de un TEST frágil.

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida, leer } from './nucleo.mjs';

const DIR = '.github/workflows';
const DENO_JSON = 'deno.json';

/**
 * Carga las tareas de deno.json (o deno.jsonc). Devuelve {} si no existe:
 * entonces solo se analizan los `deno test` inline en los pasos.
 * Exportada para testing.
 */
export function cargarTareasDeno(texto) {
  if (!texto) return {};
  try {
    return JSON.parse(texto)?.tasks ?? {};
  } catch {
    // deno.jsonc admite comentarios: quitarlos y reintentar una vez
    const sinComentarios = texto
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    try {
      return JSON.parse(sinComentarios)?.tasks ?? {};
    } catch {
      return {};
    }
  }
}

/**
 * Dado el `run` de un paso y las tareas de deno.json, devuelve true si ese
 * paso acaba corriendo `deno test` SIN permiso de entorno.
 * Exportada para testing.
 */
export function denoTestSinAllowEnv(run, tareas) {
  const candidatos = [];

  // 1. `deno test ...` directo en el paso
  for (const m of run.matchAll(/deno\s+test\b[^\n]*/gi)) candidatos.push(m[0]);

  // 2. `deno task <t>`: el flag que falta vive en deno.json, no en el yml.
  //    Esta es la forma EXACTA del incidente: el paso parecia inofensivo.
  for (const m of run.matchAll(/deno\s+task\s+([\w:-]+)/gi)) {
    const cmd = tareas[m[1]];
    if (typeof cmd === 'string' && /\bdeno\s+test\b/i.test(cmd)) candidatos.push(cmd);
  }

  return candidatos.some(
    (cmd) => !/--allow-env/.test(cmd) && !/--allow-all/.test(cmd) && !/(^|\s)-A\b/.test(cmd),
  );
}

const esPasoVigilante = (paso) =>
  (typeof paso.name === 'string' &&
    (/vigilant/i.test(paso.name) || /invariant/i.test(paso.name) || /vigilar/i.test(paso.name))) ||
  (typeof paso.run === 'string' && /scripts\/vigilantes\//.test(paso.run));

/**
 * Analiza un documento YAML de workflow parseado y devuelve hallazgos.
 * Exportada para testing.
 */
export function revisarCadenaCI(doc, fichero, tareas = {}) {
  const motivos = [];
  const jobs = doc?.jobs ?? {};

  for (const [nombreJob, job] of Object.entries(jobs)) {
    const pasos = job?.steps;
    if (!Array.isArray(pasos)) continue;

    // ---- 1. Tests de Deno sin --allow-env (directo o via deno task) ----
    pasos.forEach((paso, i) => {
      if (!paso?.run) return;
      if (!denoTestSinAllowEnv(paso.run, tareas)) return;

      // Que tarea concreta fue, para el mensaje
      const via = [...paso.run.matchAll(/deno\s+task\s+([\w:-]+)/g)].map((m) => m[1]).join(', ');

      motivos.push(
        hallazgo({
          clave: `ci-cadena-rota/deno-sin-allow-env-${nombreJob}-${i}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `Test de Deno sin --allow-env: job "${nombreJob}", paso ${i + 1}`,
          detalle:
            `${fichero}: el paso "${paso.name || `#${i + 1}`}" corre un test de Deno sin ` +
            '`--allow-env`' +
            (via ? ` (via la tarea${via.includes(',') ? 's' : ''} \`${via}\` de deno.json)` : '') +
            '. Si el codigo bajo test lee `Deno.env` — y las edge functions lo leen — el test ' +
            'revienta con PermissionDenied sin decir que falta un flag, la CI se para y TODO lo ' +
            'que viene detras se salta. El 30 ago 2026 esta forma exacta dejo el sistema cinco ' +
            'horas sin vigilancia mientras produccion se rompia. Anadir `--allow-env` a la tarea.',
          fichero,
        }),
      );
    });

    // ---- 2. Pasos de vigilancia cascade-skippable ----
    let hayPasoQueRompe = false;
    pasos.forEach((paso, i) => {
      if (!paso) return;
      const esContinue = paso['continue-on-error'] === true;
      const esAlways = typeof paso.if === 'string' && /always\s*\(\s*\)/.test(paso.if);
      const esBuild =
        typeof paso.name === 'string' && /compilar|build/i.test(paso.name);

      // Un paso que puede fallar, no tiene continue-on-error y no es build
      // marca la cadena para lo que venga detras.
      if (!esContinue && !esAlways && !esBuild && paso.run && !esPasoVigilante(paso)) {
        hayPasoQueRompe = true;
      }

      if (esPasoVigilante(paso) && hayPasoQueRompe && !esAlways) {
        motivos.push(
          hallazgo({
            clave: `ci-cadena-rota/vigilante-cascade-skip-${nombreJob}-${i}`,
            nivel: 'aviso',
            ambito: 'seguridad',
            titulo: `Vigilante cascade-skippable: job "${nombreJob}", paso "${paso.name || `#${i + 1}`}"`,
            detalle:
              `${fichero}: el paso de vigilancia "${paso.name || `#${i + 1}`}" esta despues de ` +
              'pasos que pueden fallar y NO tiene `if: always()`. Si un paso anterior falla, ' +
              'este vigilante nunca corre y su informe no se genera: el panel se queda con la ' +
              'ultima foto vieja sin decirlo.\n\n' +
              'Solucion: anadir `if: always()` al paso, o mover el vigilante antes de los pasos fragiles.',
            fichero,
          }),
        );
      }
    });
  }

  return motivos;
}

async function ejecutar() {
  let YAML;
  try {
    YAML = (await import('yaml')).default;
  } catch {
    throw new AnclaPerdida(
      'No hay parser de YAML disponible. Este vigilante no puede verificar la cadena de CI.',
      { fichero: DIR, ancla: 'yaml' },
    );
  }

  const ficheros = readdirSync(path.join(RAIZ, DIR)).filter((f) => /\.ya?ml$/.test(f));
  if (ficheros.length === 0) {
    throw new AnclaPerdida(`No hay workflows en ${DIR}.`, { fichero: DIR, ancla: '*.yml' });
  }

  // Las tareas de Deno: el yml dice `deno task X` y el flag vive aqui
  const rutaDeno = ['deno.json', 'deno.jsonc'].find((f) => existsSync(path.join(RAIZ, f)));
  const tareas = rutaDeno ? cargarTareasDeno(leer(rutaDeno)) : {};

  const hallazgos = [];

  for (const f of ficheros) {
    const rel = path.posix.join(DIR, f);
    const texto = leer(rel);

    let doc;
    try {
      doc = YAML.parse(texto);
    } catch {
      continue; // workflows.mjs ya reporta YAML roto
    }

    if (!doc?.jobs) continue;
    hallazgos.push(...revisarCadenaCI(doc, rel, tareas));
  }

  return hallazgos;
}

export default {
  nombre: 'ci-cadena-rota',
  ambito: 'seguridad',
  descripcion:
    'Tests de Deno sin --allow-env (directos o via deno task) y vigilantes ' +
    'que se saltan en cascada cuando un paso previo falla',
  ejecutar,
};
