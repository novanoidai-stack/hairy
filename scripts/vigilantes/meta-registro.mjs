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
import { RAIZ, hallazgo, NO_SON_VIGILANTES, codigoEjecutable, DE_RED } from './nucleo.mjs';

const DIR = 'scripts/vigilantes';
// Desde el 4 sep 2026 la lista vive en registro.mjs y la comparten el runner y
// compilar-estado (el que escribe el snapshot del panel). Se miran los DOS: el
// registro es donde tiene que estar un vigilante nuevo, e index.mjs sigue
// contando porque ahi viven el guardia y los modos del CLI.
const RUNNER = 'scripts/vigilantes/index.mjs';
const REGISTRO = 'scripts/vigilantes/registro.mjs';

// La lista de "esto no es un vigilante" vive en nucleo.mjs y la comparte con
// meta-contrato. Estuvo duplicada aqui y alli hasta el 4 sep 2026, y la copia
// vieja tumbaba el runner entero en silencio: ver el comentario de nucleo.mjs.

async function ejecutar() {
  const ficheros = readdirSync(path.join(RAIZ, DIR)).filter(
    (f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'),
  );

  const textoRunner =
    readFileSync(path.join(RAIZ, RUNNER), 'utf8') +
    readFileSync(path.join(RAIZ, REGISTRO), 'utf8');

  // Los de red no se nombran en ningun texto: son DATOS en la lista DE_RED. Se
  // pregunta a la lista, no al fichero donde este escrita hoy -- mover esa lista
  // de sitio (paso el 4 sep 2026, al romper un ciclo de importacion) dejaba
  // ciega la comprobacion si iba por texto.
  const estaRegistrado = (f) => textoRunner.includes(`./${f}`) || DE_RED.includes(`./${f}`);

  const hallazgos = [];

  for (const f of ficheros) {
    if (NO_SON_VIGILANTES.has(f)) continue;

    // Importar es EJECUTAR. Un fichero con process.exit() en el cuerpo se lleva
    // por delante el proceso entero al importarlo -- asi murio el runner del 1 al
    // 4 sep 2026 (forense en nucleo.mjs). Aqui no se importa: se dice que no se
    // ha podido mirar, que es lo unico honesto.
    let fuente;
    try {
      fuente = readFileSync(path.join(RAIZ, DIR, f), 'utf8');
    } catch (e) {
      // Borrado entre el readdir y el read (los tests del directorio crean y
      // quitan fixtures en paralelo). Lo que ya no existe no hay que registrarlo.
      if (e?.code === 'ENOENT') continue;
      throw e;
    }
    if (/\bprocess\s*\.\s*exit\s*\(/.test(codigoEjecutable(fuente))) {
      hallazgos.push(
        hallazgo({
          clave: `meta-registro/se-suicida-al-importar:${f}`,
          nivel: 'bloqueante',
          ambito: 'vigilancia',
          titulo: `${f} llama a process.exit() a nivel de modulo: no se puede inspeccionar`,
          detalle:
            `${DIR}/${f} no esta en NO_SON_VIGILANTES y llama a process.exit() fuera de ` +
            'cualquier funcion. Importarlo para comprobar si es un vigilante mataria este ' +
            'proceso y dejaria toda la vigilancia en un verde falso, que es exactamente lo ' +
            'que paso del 1 al 4 sep 2026. O es infraestructura --y entonces va a la lista de ' +
            'nucleo.mjs, a proposito-- o tiene que devolver hallazgos en vez de matar el proceso.',
          fichero: `${DIR}/${f}`,
        }),
      );
      continue;
    }

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
    if (!estaRegistrado(f)) {
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
          fichero: REGISTRO,
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
  // Los nombres salen del registro, no de una copia: esta lista escrita a mano
  // habria sido la cuarta copia de lo mismo el mismo dia que se unificaron las
  // otras tres. Lo que SI vive aqui es el mapa fichero -> RPC, que es
  // conocimiento propio de esta comprobacion.
  const deRed = DE_RED.map((r) => r.replace('./', ''));
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
    if (!estaRegistrado(f)) continue; // ya lo caza el chequeo de arriba
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
