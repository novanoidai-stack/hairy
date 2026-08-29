// Los ficheros de .github/workflows/ no los compila nadie. Si uno queda mal
// escrito, GitHub NO avisa donde se lea: crea una corrida fallida sin jobs y
// llamada como la RUTA del fichero en vez de como el workflow. Si nadie mira la
// pestaña Actions, el workflow simplemente deja de correr.
//
// POR QUE EXISTE ESTE VIGILANTE (29 ago 2026)
// Se rompio el canario justo asi. Al insertar un paso nuevo, la edicion cayo
// ENTRE el `uses:` del checkout y su bloque `with:`, dejando esto:
//
//     - name: Dar tiempo al despliegue
//       run: sleep 120
//       with:                        <- `with` en un paso `run`: invalido
//         persist-credentials: false <- y ademas se lo quito al checkout
//
// Antes de subirlo se comprobo que "los workflows parsean"... con un parser de
// YAML generico, que lo acepto tan feliz: como YAML es correcto. Lo que estaba
// mal era el ESQUEMA de Actions. Comprobar la sintaxis y creer que se ha
// comprobado la validez es la misma clase de ceguera que el `existsSync` del
// vigilante de claves: pasa en verde sin haber mirado lo que importa.
//
// Ademas de la forma, vigila dos invariantes que hoy solo hace cumplir zizmor
// EN LA CI, o sea despues de subir: acciones fijadas por SHA y checkouts sin
// credenciales persistidas. Enterarse en local es gratis; enterarse en CI cuesta
// un push y un rojo.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';

const DIR = '.github/workflows';

// Un SHA de commit completo. `@v4` o `@main` es una referencia movil: quien
// controle esa etiqueta ejecuta lo que quiera dentro de la CI.
const FIJADA_POR_SHA = /@[0-9a-f]{40}$/;

// Aqui se fijan TODAS por SHA, incluidas las de la propia GitHub, que es lo que
// ya hace el repo. La lista existe para que una excepcion futura sea explicita
// y con nombre, no un `if` suelto.
const SIN_SHA_PERMITIDO = new Set();

/**
 * Comprobaciones de ESQUEMA de Actions sobre un workflow ya parseado.
 * Devuelve una lista de motivos (texto), vacia si esta bien.
 */
export function revisarWorkflow(doc) {
  const motivos = [];
  const jobs = doc?.jobs ?? {};

  for (const [nombreJob, job] of Object.entries(jobs)) {
    const pasos = job?.steps;
    if (!Array.isArray(pasos)) continue;

    pasos.forEach((paso, i) => {
      const donde = `job "${nombreJob}", paso ${i + 1}${paso?.name ? ` ("${paso.name}")` : ''}`;
      if (!paso || typeof paso !== 'object') return;

      const tieneUses = 'uses' in paso;
      const tieneRun = 'run' in paso;

      if (tieneUses && tieneRun) {
        motivos.push(`${donde}: tiene \`uses\` y \`run\` a la vez; un paso es una cosa o la otra.`);
      }
      if (!tieneUses && !tieneRun) {
        motivos.push(`${donde}: no tiene ni \`uses\` ni \`run\`, asi que no hace nada.`);
      }
      // ESTE es el que rompio el canario.
      if (tieneRun && 'with' in paso) {
        motivos.push(
          `${donde}: un paso \`run\` no admite \`with\`. Casi siempre significa que un ` +
            'paso nuevo se ha colado entre un `uses:` y su bloque `with:`, que ademas se ' +
            'queda huerfano -- mirar el paso de arriba.',
        );
      }
      if (tieneUses && typeof paso.uses === 'string') {
        const accion = paso.uses.split('@')[0];
        if (!FIJADA_POR_SHA.test(paso.uses) && !SIN_SHA_PERMITIDO.has(accion)) {
          motivos.push(
            `${donde}: \`${paso.uses}\` no esta fijada por SHA. Una etiqueta movil (@v4, ` +
              '@main) la controla otro, y lo que ponga ahi corre dentro de la CI. Fijar el ' +
              'SHA completo y dejar `# vX` al lado.',
          );
        }
        // zizmor: artipacked. Sin esto el GITHUB_TOKEN se queda en .git/config.
        if (accion === 'actions/checkout' && paso.with?.['persist-credentials'] !== false) {
          motivos.push(
            `${donde}: el checkout no lleva \`persist-credentials: false\`. Lo llevan todos ` +
              'los demas del repo y lo exige zizmor; sin el, el GITHUB_TOKEN queda en ' +
              '.git/config al alcance de cualquier paso posterior.',
          );
        }
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
      'No hay parser de YAML disponible, asi que este vigilante no puede mirar los ' +
        'workflows. Pasar en verde aqui seria exactamente la ceguera que intenta evitar.',
      { fichero: DIR, ancla: 'yaml' },
    );
  }

  const ficheros = readdirSync(path.join(RAIZ, DIR)).filter((f) => /\.ya?ml$/.test(f));
  if (ficheros.length === 0) {
    throw new AnclaPerdida(`No hay workflows en ${DIR}: el vigilante esta ciego.`, {
      fichero: DIR,
      ancla: '*.yml',
    });
  }

  const hallazgos = [];

  for (const f of ficheros) {
    const rel = path.posix.join(DIR, f);
    const texto = readFileSync(path.join(RAIZ, rel), 'utf8');

    let doc;
    try {
      doc = YAML.parse(texto);
    } catch (e) {
      hallazgos.push(
        hallazgo({
          clave: `workflows/yaml-roto-${f}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `${rel} no es YAML valido`,
          detalle:
            `${e?.message || e}\n\nGitHub no avisa de esto donde se lea: crea una corrida ` +
            'fallida sin jobs, llamada como la ruta del fichero. Si nadie mira Actions, el ' +
            'workflow simplemente deja de correr.',
          fichero: rel,
        }),
      );
      continue;
    }

    if (!doc || typeof doc !== 'object' || !doc.jobs) {
      hallazgos.push(
        hallazgo({
          clave: `workflows/sin-jobs-${f}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `${rel} no declara ningun job`,
          detalle: 'Un workflow sin `jobs:` no hace nada, y GitHub lo acepta sin quejarse.',
          fichero: rel,
        }),
      );
      continue;
    }

    for (const motivo of revisarWorkflow(doc)) {
      hallazgos.push(
        hallazgo({
          clave: `workflows/${f}-${motivo.slice(0, 40).replace(/\W+/g, '-')}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `${rel}: ${motivo.split(':').slice(1).join(':').trim() || motivo}`,
          detalle: motivo,
          fichero: rel,
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'workflows',
  ambito: 'seguridad',
  descripcion: 'Los workflows son validos como Actions, con acciones fijadas por SHA',
  ejecutar,
};
