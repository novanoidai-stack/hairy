// Guardia de migraciones: "el historial remoto manda" es la norma, y hasta hoy
// no la vigilaba nadie.
//
// Un fichero sin aplicar no rompe nada -- hasta que alguien depende de lo que
// traia. Y a las dos semanas ya nadie recuerda si quedarse sin aplicar fue a
// proposito. Esa es toda la razon de que esto exista.
//
// EL FALSO POSITIVO QUE TRAE DE SERIE, y que casi la deja inservible el primer
// dia: el editor SQL del dashboard aplica el SQL pero registra la version con
// SU PROPIO timestamp. Una migracion aplicada por ahi sale como "sin aplicar"
// PARA SIEMPRE. Al estrenarla dio dos, y las dos estaban aplicadas de verdad.
//
// De ahi la leccion, que es la mitad util de este fichero:
//   "la version no consta" NO es "no se aplico".
//
// Por eso las conocidas viven en migraciones-conocidas.json CON LA PRUEBA de
// cada una -- que se miro para saberlo, no "seguro que si". Lo que este
// vigilante no puede hacer es re-ejecutar esa prueba: no hay `exec_sql` y la
// decision 4 lo prohibe explicitamente. Lo que SI hace es vigilar que la lista
// no se pudra: si una conocida aparece ya en el historial, o si su fichero
// desaparece, la exencion sobra y lo dice.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida } from './nucleo.mjs';
import { hayCredencial, llamarRpc, sinCredencial } from './bd-comun.mjs';

const DIR = 'supabase/migrations';
const CONOCIDAS = 'scripts/vigilantes/migraciones-conocidas.json';

// El CLI de Supabase nombra <14 digitos>_<nombre>.sql.
const VERSION = /^(\d{14})_(.+)\.sql$/;

export function leerConocidas(texto) {
  const j = JSON.parse(texto);
  if (!Array.isArray(j.conocidas)) {
    throw new AnclaPerdida(
      `${CONOCIDAS} ya no tiene una lista "conocidas". Sin ella este vigilante gritaria en ` +
        'falso por las migraciones aplicadas desde el editor del dashboard.',
      { fichero: CONOCIDAS, ancla: 'conocidas' },
    );
  }
  return j.conocidas;
}

async function ejecutar() {
  const ficheros = readdirSync(path.join(RAIZ, DIR)).filter((f) => f.endsWith('.sql'));
  if (ficheros.length === 0) {
    throw new AnclaPerdida(`No hay migraciones en ${DIR}: el vigilante esta ciego.`, {
      fichero: DIR,
      ancla: '*.sql',
    });
  }

  const hallazgos = [];
  const conVersion = new Map(); // version -> fichero
  const sinVersion = [];

  for (const f of ficheros) {
    const m = VERSION.exec(f);
    if (!m) {
      sinVersion.push(f);
      continue;
    }
    // DOS FICHEROS CON LA MISMA VERSION es un fallo callado de los buenos: el
    // historial se indexa por version, asi que solo uno de los dos puede constar
    // aplicado, y este mapa se quedaria con el ultimo -- el otro desapareceria
    // del radar sin decir nada. Paso al mergear la rama de la auditoria, que
    // traia un 20260829120000_avisos_... y ya habia un 20260829120000_vigilancia_...
    if (conVersion.has(m[1])) {
      hallazgos.push(
        hallazgo({
          clave: `migraciones/version-repetida-${m[1]}`,
          nivel: 'bloqueante',
          ambito: 'base-de-datos',
          titulo: `Dos migraciones comparten la version ${m[1]}`,
          detalle:
            `${conVersion.get(m[1])} y ${f}. El historial remoto se indexa por version, asi ` +
            'que solo una de las dos puede constar aplicada y la otra queda fuera del radar ' +
            'en silencio. El CLI tampoco sabria cual aplicar primero.\n\nRenombrar una de las ' +
            'dos a la version con la que consta aplicada de verdad (mirar ' +
            'schema_migrations por nombre, no por version).',
          fichero: path.posix.join(DIR, f),
        }),
      );
      continue;
    }
    conVersion.set(m[1], f);
  }

  // PUNTO CIEGO, no un silencio: de estos no se puede saber si estan aplicados,
  // porque no hay version que buscar en el historial. Saltarselos callando seria
  // la ceguera de siempre.
  for (const f of sinVersion) {
    hallazgos.push(
      hallazgo({
        clave: `migraciones/sin-version-${f}`,
        nivel: 'aviso',
        ambito: 'base-de-datos',
        titulo: `${f} no lleva prefijo de version: no se puede saber si esta aplicada`,
        detalle:
          'El historial remoto se indexa por version (14 digitos), asi que de este fichero ' +
          'la guardia no puede decir nada -- ni que si ni que no. No es que este bien: es ' +
          'que no se ve.\n\nRenombrarlo a <AAAAMMDDHHMMSS>_<nombre>.sql lo mete en el radar. ' +
          'Si ya esta aplicado, ademas hay que registrar su version.',
        fichero: path.posix.join(DIR, f),
      }),
    );
  }

  if (!hayCredencial()) {
    hallazgos.push(
      sinCredencial('migraciones/sin-credencial', 'base-de-datos', 'La guardia de migraciones'),
    );
    return hallazgos;
  }

  const conocidas = leerConocidas(readFileSync(path.join(RAIZ, CONOCIDAS), 'utf8'));
  const porVersion = new Map(conocidas.map((c) => [c.version, c]));

  const faltan = await llamarRpc('migraciones_sin_aplicar', {
    p_versiones: [...conVersion.keys()],
  });
  if (!Array.isArray(faltan)) {
    throw new Error(
      `migraciones_sin_aplicar() no ha devuelto una lista: ${JSON.stringify(faltan).slice(0, 300)}`,
    );
  }
  const faltanSet = new Set(faltan);

  for (const version of faltan) {
    if (porVersion.has(version)) continue; // conocida y probada
    const fichero = conVersion.get(version);
    hallazgos.push(
      hallazgo({
        clave: `migraciones/sin-aplicar-${version}`,
        nivel: 'aviso',
        ambito: 'base-de-datos',
        titulo: `${fichero} no consta aplicada en el historial remoto`,
        detalle:
          'El historial remoto manda. O falta aplicarla, o se aplico desde el editor SQL del ' +
          'dashboard --que registra la version con SU PROPIO timestamp-- y entonces esto es ' +
          'un falso positivo.\n\nANTES de darla por aplicada, MIRA que lo este: comprueba el ' +
          'efecto que traia (la funcion que crea, la politica que cambia, la columna que ' +
          'anade). Si lo esta, anadela a ' +
          `${CONOCIDAS} con esa prueba escrita. "La version no consta" no es "no se aplico", ` +
          'pero tampoco es "seguro que si".',
        fichero: path.posix.join(DIR, fichero ?? ''),
      }),
    );
  }

  // Que la lista de conocidas no se pudra: una exencion que ya no hace falta es
  // una excepcion permanente que nadie vuelve a revisar.
  for (const c of conocidas) {
    if (!conVersion.has(c.version)) {
      hallazgos.push(
        hallazgo({
          clave: `migraciones/conocida-huerfana-${c.version}`,
          nivel: 'aviso',
          ambito: 'base-de-datos',
          titulo: `${CONOCIDAS} exime a ${c.version} y ese fichero ya no existe`,
          detalle:
            `La exencion era para ${c.fichero}, que ya no esta en ${DIR}. Quitarla de la ` +
            'lista: una exencion sin fichero solo sirve para que la proxima lectura confunda.',
          fichero: CONOCIDAS,
        }),
      );
      continue;
    }
    if (!faltanSet.has(c.version)) {
      hallazgos.push(
        hallazgo({
          clave: `migraciones/conocida-ya-consta-${c.version}`,
          nivel: 'aviso',
          ambito: 'base-de-datos',
          titulo: `${c.version} ya consta en el historial: sobra su exencion`,
          detalle:
            `${CONOCIDAS} la eximia porque se aplico desde el dashboard sin registrar la ` +
            'version. Ahora la version SI consta, asi que la exencion no hace falta y lo unico ' +
            'que hace es tapar un futuro fallo de verdad en ese mismo fichero.',
          fichero: CONOCIDAS,
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'bd-migraciones',
  ambito: 'base-de-datos',
  descripcion: 'Todo fichero de supabase/migrations/ consta aplicado en el historial remoto',
  necesitaRed: true,
  ejecutar,
};
