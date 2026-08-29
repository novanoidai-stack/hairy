// El panel tiene que conocer TODOS los ambitos que emiten los vigilantes.
//
// POR QUE EXISTE ESTE VIGILANTE
// Un ambito vive en tres sitios a la vez: el vigilante que lo emite, el
// `<select>` del filtro de la pestana Salud y el mapa de etiquetas
// AMBITO_SAL_LABEL, los dos ultimos en web/admin.html. Es un invariante
// repartido de manual -- de los que la decision 10 llama "la fabrica de
// regresiones" -- y ya se derivo una vez: al estrenar las familias 2a y 2b sus
// hallazgos llegaban a la base pero el panel no los podia filtrar y los pintaba
// con el identificador en crudo por etiqueta.
//
// Lo que se pierde cuando esto se desincroniza es sutil y por eso duele: el
// hallazgo NO desaparece, simplemente se vuelve incomodo de encontrar. Nadie
// nota que falta algo; solo que el panel es un poco peor cada vez.
//
// Nivel BLOQUEANTE a proposito: aqui no hay deuda heredada que respetar (hoy
// cuadra), es de arreglo trivial -- dos lineas en admin.html -- y el coste de
// dejarlo pasar es que la familia siguiente nazca medio invisible.

import { leer, hallazgo, capturar } from './nucleo.mjs';

import precios from './precios.mjs';
import referidos from './referidos.mjs';
import rutasPublicas from './rutas-publicas.mjs';
import cacheApp from './cache-app.mjs';
import claves from './claves.mjs';
import codigoMuerto from './codigo-muerto.mjs';
import erroresTragados from './errores-tragados.mjs';

const PANEL = 'web/admin.html';

// Los que emiten scripts sueltos, que no son modulos de vigilante y por tanto no
// se pueden preguntar por su `.ambito`. Van a mano, con quien los emite al lado.
const DE_LOS_SCRIPTS = [
  ['pantallas', 'scripts/vigilantes/smoke-a-hallazgos.mjs'],
  ['rendimiento', 'scripts/vigilantes/rendimiento.mjs'],
  ['silencios', 'scripts/vigilantes/silencios.mjs'],
  ['base-de-datos', 'supabase/functions/ejecutar-vigilancia-bd/index.ts'],
  // El comodin al que cae registrar_vigilancia cuando un hallazgo llega sin
  // ambito. Tiene que estar en el mapa o esas filas saldrian sin etiqueta.
  ['otros', 'la RPC registrar_vigilancia (coalesce)'],
];

async function ejecutar() {
  const html = leer(PANEL);

  // Anclas: si cualquiera de las dos desaparece, este vigilante se ha quedado
  // ciego y hay que enterarse -- no dar verde porque no encuentra nada que mirar.
  const mapa = capturar(html, /var AMBITO_SAL_LABEL = \{([\s\S]*?)\};/, {
    fichero: PANEL,
    ancla: 'AMBITO_SAL_LABEL',
  });
  const select = capturar(html, /<select[^>]*id="fAmbitoSal"[^>]*>([\s\S]*?)<\/select>/, {
    fichero: PANEL,
    ancla: 'select fAmbitoSal',
  });

  const enElMapa = new Set(
    [...mapa.valor.matchAll(/(?:'([a-z-]+)'|\b([a-z][a-z-]*)\s*):/g)].map((m) => m[1] || m[2]),
  );
  const enElSelect = new Set(
    [...select.valor.matchAll(/value="([a-z-]+)"/g)].map((m) => m[1]),
  );

  const emitidos = [
    ...[precios, referidos, rutasPublicas, cacheApp, claves, codigoMuerto, erroresTragados].map(
      (v) => [v.ambito, `scripts/vigilantes/${v.nombre}.mjs`],
    ),
    ...DE_LOS_SCRIPTS,
  ];

  const hallazgos = [];
  const vistos = new Set();

  for (const [ambito, quien] of emitidos) {
    if (vistos.has(ambito)) continue;
    vistos.add(ambito);

    const faltaEnMapa = !enElMapa.has(ambito);
    // `otros` es el comodin: se pinta pero no tiene sentido como filtro, asi que
    // no se le exige estar en el desplegable.
    const faltaEnSelect = ambito !== 'otros' && !enElSelect.has(ambito);
    if (!faltaEnMapa && !faltaEnSelect) continue;

    const donde = [faltaEnMapa && 'el mapa AMBITO_SAL_LABEL', faltaEnSelect && 'el desplegable de filtro']
      .filter(Boolean)
      .join(' y ');

    hallazgos.push(
      hallazgo({
        clave: `panel-salud/ambito-desconocido:${ambito}`,
        nivel: 'bloqueante',
        ambito: 'otros',
        titulo: `El panel no conoce el ambito "${ambito}"`,
        detalle:
          `Lo emite ${quien}, y falta en ${donde} de ${PANEL}. Los hallazgos siguen llegando ` +
          'a la base, pero no se pueden filtrar y salen con el identificador en crudo por ' +
          'etiqueta: no desaparecen, solo se vuelven incomodos de encontrar, que es la forma ' +
          'de deriva que nadie nota. Se arregla anadiendo una <option> y una entrada al mapa.',
        fichero: PANEL,
        linea: faltaEnSelect ? select.linea : mapa.linea,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'panel-salud',
  ambito: 'otros',
  descripcion: 'El panel de staff conoce todos los ambitos que emiten los vigilantes',
  ejecutar,
};
