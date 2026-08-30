// Meta-vigilante: NINGUN vigilante puede quedarse fuera del runner.
//
// POR QUE EXISTE (30 ago 2026)
// El equipo multi-agente dejo seis ficheros de vigilante NUEVOS en el directorio
// sin registrarlos en index.mjs ni en la edge: ficheros que no corria nadie y
// que contaban como entregados. El mismo dia, la "suite profunda certificada"
// resulto no estar ni aplicada. Un vigilante que existe en el disco pero no en
// el runner es un verde falso con la forma de un fichero.
//
// La regla: todo .mjs del directorio que exporte un vigilante por defecto
// (objeto con `nombre` y `ejecutar`) TIENE que aparecer referenciado en
// index.mjs. Los scripts de infraestructura (enviar, pedir-bd, compiladores)
// viven en una lista explicita para que añadir uno sea un acto consciente.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIR = 'scripts/vigilantes';
const RUNNER = 'scripts/vigilantes/index.mjs';

// Ficheros que NO son vigilantes: herramientas y scripts de infraestructura.
// Si se añade uno nuevo, añadirlo aqui a proposito (que no sea por olvido).
const NO_SON_VIGILANTES = new Set([
  'index.mjs', // el propio runner
  'nucleo.mjs', // contrato comun
  'bd-comun.mjs', // credencial y RPC compartidos
  'enviar.mjs', // publica informes
  'pedir-bd.mjs', // cli de diagnostico
  'compilar-estado.mjs', // compilador del snapshot global
  'smoke-a-hallazgos.mjs', // traductor de informes de playwright
  'peso-bundle.mjs', // corre en el job e2e, no en el runner
  'rendimiento.mjs', // idem: traduce mediciones del smoke
  'silencios.mjs', // idem
  'notificar.mjs', // canal de salida (telegram)
  'issues.mjs', // canal de salida (github issues)
  'dr-backups.mjs', // corre en su propio workflow mensual
]);

async function ejecutar() {
  const ficheros = readdirSync(path.join(RAIZ, DIR)).filter(
    (f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'),
  );

  const textoRunner = readFileSync(path.join(RAIZ, RUNNER), 'utf8');

  const hallazgos = [];

  for (const f of ficheros) {
    if (NO_SON_VIGILANTES.has(f)) continue;

    let mod;
    try {
      mod = (await import(`./${f}`)).default;
    } catch (e) {
      // Un modulo que ni siquiera importa es un hallazgo del todo: ni correr
      // puede. El runner lo cazaria como reventado, pero aqui se ve antes.
      hallazgos.push(
        hallazgo({
          clave: `meta-registro/no-importa:${f}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `El fichero de vigilante ${f} ni siquiera importa`,
          detalle: `Error al importarlo: ${e.message}. Un vigilante que no carga es un verde falso.`,
          fichero: `${DIR}/${f}`,
        }),
      );
      continue;
    }

    const esVigilante = mod && typeof mod === 'object' && typeof mod.nombre === 'string' && typeof mod.ejecutar === 'function';
    if (!esVigilante) {
      // Exporta otra cosa y no esta en la lista de infraestructura: o es
      // infraestructura sin registrar (aviso, hay que anadirla a la lista) o es
      // un vigilante a medio escribir (tambien hay que decirlo).
      hallazgos.push(
        hallazgo({
          clave: `meta-registro/sin-clasificar:${f}`,
          nivel: 'aviso',
          ambito: 'vigilancia',
          titulo: `${f} no es un vigilante y no consta como infraestructura`,
          detalle:
            `${DIR}/${f} no exporta un vigilante (nombre + ejecutar) y no esta en la lista ` +
            'NO_SON_VIGILANTES de meta-registro.mjs. O es un script de infraestructura --' +
            'entonces anadelo a la lista, a proposito-- o es un vigilante a medio escribir.',
          fichero: 'scripts/vigilantes/meta-registro.mjs',
        }),
      );
      continue;
    }

    // El corazon: todo vigilante tiene que estar referenciado en el runner.
    // El runner referencia por ruta ('./bd.mjs') tanto en ESTATICOS como en
    // la lista dinamica de --bd.
    if (!textoRunner.includes(`./${f}`)) {
      hallazgos.push(
        hallazgo({
          clave: `meta-registro/fuera-del-runner:${f}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `El vigilante "${mod.nombre}" (${f}) no esta registrado en index.mjs`,
          detalle:
            `${DIR}/${f} define el vigilante "${mod.nombre}" pero index.mjs no lo referencia. ` +
            'Un vigilante que existe en el disco y no en el runner no corre nunca y cuenta ' +
            'como cobertura falsa. Anadirlo a ESTATICOS o a la lista --bd. Esto es ' +
            'exactamente lo que paso el 30 ago 2026 con seis ficheros del equipo multi-agente.',
          fichero: RUNNER,
        }),
      );
    }
  }

  // Y los de red, ademas, en la edge que los dispara cada 6 h. La edge
  // referencia las RPC, no los ficheros; se comprueba por nombre de RPC.
  const textoEdge = readFileSync(
    path.join(RAIZ, 'supabase/functions/ejecutar-vigilancia-bd/index.ts'),
    'utf8',
  );
  const deRed = ['bd.mjs', 'bd-rendimiento.mjs', 'bd-migraciones.mjs', 'bd-ecosistema.mjs',
    'bd-profunda.mjs', 'bd-triggers-ciegos.mjs', 'bd-sobrecargas-rpc.mjs',
    'bd-escritura-critica.mjs', 'bd-invariantes.mjs'];
  const rpcDe = {
    'bd.mjs': 'vigilancia_bd',
    'bd-rendimiento.mjs': 'vigilancia_bd_rendimiento',
    'bd-migraciones.mjs': 'migraciones_sin_aplicar',
    'bd-ecosistema.mjs': 'vigilancia_bd_ecosistema',
    'bd-profunda.mjs': 'vigilancia_bd_profunda',
    'bd-triggers-ciegos.mjs': 'vigilancia_bd_triggers_ciegos',
    'bd-sobrecargas-rpc.mjs': 'vigilancia_bd_sobrecargas_rpc',
    'bd-escritura-critica.mjs': 'vigilancia_bd_escritura_critica',
    'bd-invariantes.mjs': 'vigilancia_bd_invariantes',
  };
  for (const f of deRed) {
    if (!textoRunner.includes(`./${f}`)) continue; // ya lo caza el chequeo de arriba
    if (!textoEdge.includes(`'${rpcDe[f]}'`)) {
      hallazgos.push(
        hallazgo({
          clave: `meta-registro/fuera-de-la-edge:${f}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `El vigilante de red ${f} no corre en la edge ejecutar-vigilancia-bd`,
          detalle:
            'La edge es la que dispara la vigilancia de BD cada 6 h y en cada push a master. ' +
            `Falta la llamada a ${rpcDe[f]}(): fuera de ahi, este vigilante solo corre si ` +
            'alguien se acuerda de lanzar vigilar:bd a mano, que es exactamente el agujero ' +
            'que la edge venia a tapar.',
          fichero: 'supabase/functions/ejecutar-vigilancia-bd/index.ts',
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'meta-registro',
  ambito: 'vigilancia',
  descripcion:
    'Todo vigilante del directorio esta registrado en el runner y, si es de red, en la edge',
  ejecutar,
};
