// UN ADD-ON PUEDE SER DE TODO EL SALON, Y QUIEN NO LO SEPA NO FALLA.
//
// Desde el 6 sep 2026, `service_addons.servicio_id` admite NULL y eso significa
// "vale para cualquier servicio del salon" (migracion
// 20260906120907_addons_globales_de_salon.sql). Nacio porque ofrecer "Espuma" en
// los 78 servicios del catalogo de Jose eran 78 filas mantenidas a mano.
//
// EL FALLO QUE VIGILA, que es de los que no se ven
// La consulta de add-ons estaba COPIADA en cuatro sitios, los cuatro asi:
//
//     .from('service_addons').select(...).eq('servicio_id', X)
//
// Con la columna nullable, esa consulta ya no dice lo que parece: deja fuera
// TODOS los add-ons de salon. Y no da error, ni excepcion, ni fila rara --
// devuelve menos filas y sigue. El sintoma es que un extra que existe no aparece
// al reservar o al cobrar, y eso se investiga como un problema de datos, no de
// codigo.
//
// La regla: quien lea `service_addons` desde el cliente pasa por
// `lib/datos/addons.ts`. Ahi la condicion es
// `(servicio_id = X or servicio_id is null)`, escrita UNA vez.
//
// Es literalmente el invariante repartido de la decision 10 del CLAUDE.md, con
// el agravante de que las cuatro copias parecian correctas hasta que cambio el
// significado de la columna.
//
// LO QUE NO MIRA, A PROPOSITO
// - `cita_addons`: es otra cosa. Guarda los add-ons YA enganchados a una cita y
//   se filtra por `cita_id`, no por servicio. Su join a `service_addons` es
//   legitimo y no tiene que pasar por el cargador. (El plan de bloques daba
//   CobroSheet.tsx:254 como cuarto cargador; no lo es, es esto.)
// - El propio `lib/datos/addons.ts`, que es donde vive la consulta buena.
// - SQL y edge functions: ahi la condicion se escribe en el propio SQL y el
//   vigilante de migraciones cubre otro terreno.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

// Donde vive el cliente que consulta Supabase.
const DONDE = ['app', 'components', 'lib'];

// El cargador unico. Ni se vigila a si mismo ni a su test.
const CARGADOR = 'lib/datos/addons.ts';
const EXENTOS = new Set([CARGADOR, 'lib/datos/addons.test.ts']);

const TABLA = 'service_addons';

// DEUDA CONOCIDA, CON DUENO Y FECHA.
//
// El 6 sep 2026 el trabajo se repartio en bloques por PROPIEDAD DE FICHEROS
// (informes/BLOQUES-PARALELOS-2026-09-06.md). El cargador unico lo publica el
// bloque C; estos dos ficheros son del bloque E, que cambia su llamada cuando le
// toque. Son hallazgos VERDADEROS -- hoy esas dos pantallas no ven los add-ons
// de salon -- pero tumbar la CI de todos hasta que E entre es la forma mas
// rapida de que se deje de mirar el panel: la deuda heredada nace en `aviso`
// con linea base congelada, y el trinquete solo gira hacia abajo.
//
// CUANDO E CAMBIE SU LLAMADA, QUITA SU LINEA DE AQUI. Si te olvidas, este mismo
// vigilante lo dice: una exencion sin hallazgo detras es un aviso.
export const PENDIENTES = new Map([
  ['components/agenda/modals/NewCitaModal.web.tsx', 'bloque E'],
  ['components/agenda/modals/DetalleCitaModal.web.tsx', 'bloque E'],
]);

// --- deteccion ---------------------------------------------------------------

/**
 * Consultas a `service_addons` que filtran por servicio_id sin admitir el NULL.
 *
 * Se busca el `.from('service_addons')` y se mira la cadena de metodos que
 * viene detras hasta el final de la sentencia. Si aparece un `.eq('servicio_id'`
 * y en toda esa cadena no se nombra el null, esa consulta no ve los globales.
 *
 * @param {string} codigo
 * @returns {{linea: number, fragmento: string}[]}
 */
export function consultasQueIgnoranLosGlobales(codigo) {
  const fuera = [];
  const re = new RegExp(`\\.from\\(\\s*["'\`]${TABLA}["'\`]\\s*\\)`, 'g');
  for (const m of codigo.matchAll(re)) {
    // La cadena de metodos encadenados: hasta el primer `;` o el fin de la
    // expresion. 600 caracteres cubren de sobra un builder de supabase-js.
    const cola = codigo.slice(m.index, m.index + 600);
    const cadena = cola.split(';')[0];

    if (!/\.eq\(\s*["'`]servicio_id["'`]/.test(cadena)) continue;
    // Formas validas de admitir el add-on de salon: `.or(...servicio_id.is.null)`,
    // `.is('servicio_id', null)` o la expresion que construye el cargador.
    if (/servicio_id\.is\.null|\.is\(\s*["'`]servicio_id["'`]\s*,\s*null/.test(cadena)) continue;

    fuera.push({
      linea: codigo.slice(0, m.index).split('\n').length,
      fragmento: cadena.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return fuera;
}

function ficheros(dir, acc = []) {
  let entradas;
  try {
    entradas = readdirSync(path.join(RAIZ, dir));
  } catch {
    return acc;
  }
  for (const e of entradas) {
    const rel = path.posix.join(dir, e);
    if (statSync(path.join(RAIZ, rel)).isDirectory()) {
      if (e === 'node_modules' || e === '__snapshots__') continue;
      ficheros(rel, acc);
    } else if (/\.tsx?$/.test(e)) {
      acc.push(rel);
    }
  }
  return acc;
}

async function ejecutar() {
  const todos = ficheros(DONDE[0]).concat(...DONDE.slice(1).map((d) => ficheros(d)));

  // El ancla: si el cargador unico desaparece o se queda sin la condicion que
  // admite el NULL, este vigilante esta comprobando que nadie copie una consulta
  // que ya no existe -- o sea, nada. Eso es un hallazgo, no un verde.
  const cargador = todos.includes(CARGADOR) ? leer(CARGADOR) : '';
  if (!cargador) {
    throw new AnclaPerdida(
      `No existe ${CARGADOR}. Es el cargador unico de add-ons: sin el, cada pantalla ` +
        'vuelve a escribir su consulta y los add-ons de salon dejan de verse sin dar error.',
      { fichero: CARGADOR, ancla: 'fichero' },
    );
  }
  if (!/servicio_id\.is\.null/.test(cargador)) {
    throw new AnclaPerdida(
      `${CARGADOR} ya no menciona servicio_id.is.null. O ha cambiado el modelo de add-ons ` +
        '(y entonces hay que replantear este vigilante) o el cargador ha dejado de ver los ' +
        'add-ons de salon, que es justo lo que viene a impedir.',
      { fichero: CARGADOR, ancla: 'servicio_id.is.null' },
    );
  }

  const hallazgos = [];
  const pendientesVistos = new Set();

  for (const rel of todos) {
    if (EXENTOS.has(rel)) continue;
    const codigo = leer(rel);
    if (!codigo.includes(TABLA)) continue;

    const dueno = PENDIENTES.get(rel);

    for (const c of consultasQueIgnoranLosGlobales(codigo)) {
      if (dueno) pendientesVistos.add(rel);
      hallazgos.push(
        hallazgo({
          clave: `addons/cargador-suelto-${path.posix.basename(rel)}-${c.linea}`,
          nivel: dueno ? 'aviso' : 'bloqueante',
          ambito: 'coherencia',
          titulo: dueno
            ? `${rel}:${c.linea} todavia no ve los add-ons de salon (pendiente del ${dueno})`
            : `${rel}:${c.linea} consulta service_addons sin ver los add-ons de salon`,
          detalle:
            `Desde el 6 sep 2026 un add-on con servicio_id NULL vale para TODO el salon. ` +
            `Un \`.eq('servicio_id', X)\` a secas los deja fuera y NO falla: devuelve menos ` +
            'filas y sigue. El sintoma llega despues, como "un extra que existe no aparece ' +
            'al reservar", y se investiga como un problema de datos.\n\n' +
            `Encontrado:\n  ${c.fragmento}\n\n` +
            `Usa el cargador unico:\n` +
            "  import { cargarAddonsAplicables } from '@/lib/datos/addons';\n" +
            '  const addons = await cargarAddonsAplicables(negocioId, servicioId);\n\n' +
            `Para administrar el catalogo (Ajustes) esta \`listarAddonsDeServicio\`, que ` +
            'devuelve tambien los apagados y los repetidos.' +
            (dueno
              ? `\n\nAVISO Y NO BLOQUEANTE porque este fichero es del ${dueno} del reparto ` +
                'del 6 sep (informes/BLOQUES-PARALELOS-2026-09-06.md) y su cambio entra con ' +
                'ese bloque. Al arreglarlo, quita su linea de PENDIENTES en este vigilante.'
              : ''),
          fichero: rel,
          linea: c.linea,
        }),
      );
    }
  }

  // Una exencion sin hallazgo detras es una exencion caducada, y una exencion
  // caducada es un agujero por donde vuelve a colarse lo mismo en silencio.
  for (const [rel, dueno] of PENDIENTES) {
    if (pendientesVistos.has(rel)) continue;
    hallazgos.push(
      hallazgo({
        clave: `addons/exencion-caducada-${path.posix.basename(rel)}`,
        nivel: 'aviso',
        ambito: 'coherencia',
        titulo: `${rel} ya no necesita la exencion de addons-cargador`,
        detalle:
          `Este fichero esta en la lista PENDIENTES de scripts/vigilantes/addons-cargador.mjs ` +
          `como deuda del ${dueno}, pero ya no tiene ninguna consulta suelta a ${TABLA}. ` +
          'Quita su linea: mientras siga ahi, una consulta rota nueva en este mismo fichero ' +
          'saldria como aviso en vez de parar la CI.',
        fichero: rel,
        linea: null,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'addons-cargador',
  ambito: 'coherencia',
  descripcion: 'Nadie consulta service_addons sin admitir los add-ons de salon (servicio_id null)',
  ejecutar,
};
