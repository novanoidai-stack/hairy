// UNA COLUMNA DE DINERO NUEVA NO ENTRA SOLA EN EL GUARDA DE INMUTABILIDAD.
//
// POR QUE EXISTE (1 sep 2026)
//
// `cobros_prevent_financial_updates()` es lo que implementa la Ley Antifraude
// 11/2021 en este producto: un cobro registrado no se toca. Congela las columnas
// NOMBRANDOLAS UNA A UNA. Es la unica forma de escribirlo (no hay un "congela
// todo menos esto" en plpgsql), pero tiene un precio: cada columna de dinero que
// se añada despues nace FUERA del guarda, y nada lo dice.
//
// Ya paso. `bizum_cents` se añadio con la spec 10 el 30 ago 2026
// (20260830130000_recursos_en_disponibilidad_y_bizum.sql) y estuvo dos dias
// pudiendose reescribir en cobros ya cerrados. No fallaba nada: el guarda seguia
// verde, rechazaba los otros seis importes, y los tests y los advisors pasaban.
// El unico sintoma habria sido un arqueo que cuadra hoy y no cuadra mañana.
//
// LO QUE MIRA
//
//   1. Toda columna `*_cents` de `cobros` aparece en el cuerpo del guarda.
//   2. Las que son NULLABLE se comparan con `is distinct from`, no con `<>`.
//
// La segunda no es quisquillosa, es el mismo agujero un poco mas escondido: en
// SQL `0 <> NULL` no es true, es NULL, y una cadena de OR que da NULL no entra
// por la rama del `raise`. O sea que con `<>` una columna nullable se puede
// poner a NULL --y desde NULL a cualquier cosa-- sin que el guarda se entere.
// `bizum_cents` es nullable; las otras seis son NOT NULL y con `<>` van bien.
//
// DE DONDE SACA LA VERDAD
//
// La lista de columnas sale de `types/database.types.ts`, que se GENERA desde la
// base de datos: si alguien añade la columna y regenera los tipos --que es el
// flujo normal-- este vigilante se entera en el mismo PR. Y el cuerpo del guarda
// sale de la definicion mas reciente del repo. Las dos son anclas: si cualquiera
// de las dos deja de aparecer, esto FALLA en vez de pasar en verde.
//
// LO QUE **NO** MIRA, Y HAY QUE SABERLO
//
// Esto es capa 1: lee el repo, no la base de datos. No puede ver una deriva de
// dashboard (alguien reescribiendo la funcion desde el editor SQL, como paso con
// `guard_profile_identity_columns`). Para eso hace falta comparar contra
// `pg_get_functiondef()` en produccion, que es trabajo de la capa 2. El 1 sep
// 2026 se comprobo a mano que no habia deriva en esta funcion.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const TIPOS = 'types/database.types.ts';
const GUARDA = 'cobros_prevent_financial_updates';

// Donde puede vivir la definicion. `supabase/migrations` manda: sus nombres
// llevan timestamp, asi que la mas alta es la ultima palabra. `archive/` es
// historia aplicada y solo se mira si no hay ninguna en migrations.
const DIRS = ['supabase/migrations', 'archive/migraciones-legacy'];

// --- 1. Las columnas de dinero, leidas del esquema generado -------------------

/** Extrae `{ nombre, nullable }` de cada columna `*_cents` de la tabla cobros. */
export function columnasDeDinero(tipos) {
  // El bloque Row de cobros: 6 espacios para la tabla, 8 para Row, 10 para cada
  // columna. Si el generador cambia la sangria esto deja de casar -- y entonces
  // tiene que fallar, no callarse.
  //
  // El `\r?` no es decorativo: types/database.types.ts se paga con CRLF en un
  // checkout de Windows (que es donde se desarrolla esto), y un ancla escrita
  // con `\n` a secas no casa nunca. Lo bueno es que se noto: el vigilante grito
  // "no encuentro el bloque" en vez de devolver una lista vacia de columnas y
  // pasar en verde, que es exactamente para lo que existe AnclaPerdida.
  const m = /\r?\n {6}cobros: \{\r?\n {8}Row: \{\r?\n([\s\S]*?)\r?\n {8}\}/.exec(tipos);
  if (!m) {
    throw new AnclaPerdida(
      `No se encuentra el bloque "cobros: { Row: {" en ${TIPOS}. O se ha renombrado la ` +
        'tabla, o el generador de tipos escribe con otra forma. Sin la lista de columnas ' +
        'este vigilante no mira nada.',
      { fichero: TIPOS, ancla: 'cobros.Row' },
    );
  }

  const columnas = [];
  for (const linea of m[1].split('\n')) {
    const c = /^\s*(\w+):\s*(.+?)\s*$/.exec(linea);
    if (!c) continue;
    if (!c[1].endsWith('_cents')) continue;
    columnas.push({ nombre: c[1], nullable: /\|\s*null/.test(c[2]) });
  }
  return columnas;
}

// --- 2. El cuerpo del guarda, de su definicion mas reciente -------------------

/** Recorta el cuerpo de la funcion desde su `create or replace` hasta el cierre. */
export function cuerpoDelGuarda(sql) {
  const re = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${GUARDA}\\s*\\(`,
    'i',
  );
  const m = re.exec(sql);
  if (!m) return null;

  const desde = sql.slice(m.index);
  // El cuerpo va entre dollar-quotes ($$ o $function$). Se busca la etiqueta que
  // abre y su pareja, para no cortar en un `$$` de otra funcion del fichero.
  const abre = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(desde);
  if (!abre) return null;
  const inicio = abre.index + abre[0].length;
  const fin = desde.indexOf(abre[1], inicio);
  return fin === -1 ? desde.slice(inicio) : desde.slice(inicio, fin);
}

function ficherosCon(dir, texto) {
  let entradas;
  try {
    entradas = readdirSync(path.join(RAIZ, dir));
  } catch {
    return [];
  }
  return entradas
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.posix.join(dir, f))
    .filter((rel) => leer(rel).includes(texto))
    .sort(); // los de migrations llevan timestamp delante: el ultimo es el mayor
}

/** El fichero cuya definicion del guarda es la que manda hoy. */
export function definicionVigente() {
  for (const dir of DIRS) {
    const candidatos = ficherosCon(dir, `function public.${GUARDA}`).filter((rel) =>
      cuerpoDelGuarda(leer(rel)),
    );
    if (candidatos.length > 0) {
      const rel = candidatos[candidatos.length - 1];
      return { fichero: rel, cuerpo: cuerpoDelGuarda(leer(rel)) };
    }
  }
  return null;
}

// --- 3. La comprobacion ------------------------------------------------------

async function ejecutar() {
  const columnas = columnasDeDinero(leer(TIPOS));
  if (columnas.length < 5) {
    throw new AnclaPerdida(
      `Solo se han encontrado ${columnas.length} columnas *_cents en cobros (${TIPOS}), y ` +
        'hay al menos siete (total, efectivo, datafono, online, bizum, propina, descuento). ' +
        'O el esquema ha cambiado mucho o el recorte del bloque Row esta mal.',
      { fichero: TIPOS, ancla: 'cobros.*_cents' },
    );
  }

  const vigente = definicionVigente();
  if (!vigente) {
    throw new AnclaPerdida(
      `No hay ninguna definicion de ${GUARDA}() en ${DIRS.join(' ni ')}. Es el trigger que ` +
        'implementa la inmutabilidad de importes (Ley Antifraude 11/2021): si ha desaparecido ' +
        'del repo, eso es el hallazgo.',
      { fichero: DIRS[0], ancla: `create or replace function public.${GUARDA}` },
    );
  }

  // Prueba de que se ha recortado lo que se cree: el guarda TIENE que levantar
  // la excepcion de la ley. Si no aparece, el recorte ha pillado otra cosa.
  if (!/Ley Antifraude/i.test(vigente.cuerpo)) {
    throw new AnclaPerdida(
      `El cuerpo recortado de ${GUARDA}() en ${vigente.fichero} no menciona la Ley Antifraude. ` +
        'El recorte esta mal o la funcion ya no es la que era.',
      { fichero: vigente.fichero, ancla: 'raise ... Ley Antifraude' },
    );
  }

  const hallazgos = [];
  for (const { nombre, nullable } of columnas) {
    const nombrada = new RegExp(`\\b${nombre}\\b`, 'i').test(vigente.cuerpo);

    if (!nombrada) {
      hallazgos.push(
        hallazgo({
          clave: `inmutabilidad-cobros/columna-libre:${nombre}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `cobros.${nombre} guarda dinero y el guarda de inmutabilidad no la nombra`,
          detalle:
            `${GUARDA}() congela las columnas de un cobro nombrandolas una a una, y ` +
            `${nombre} no esta en la lista. Se puede reescribir en un cobro ya registrado, ` +
            'que es justo lo que prohibe la Ley Antifraude 11/2021.\n\n' +
            'No se manifiesta como un error: el guarda sigue rechazando las demas y todo ' +
            'parece verde. El sintoma llega despues, como un arqueo de caja que cuadraba ' +
            'ayer y hoy no.\n\n' +
            `Se arregla añadiendola al primer bloque de ${vigente.fichero}. Si es NULLABLE, ` +
            'con `is distinct from` (ver el otro hallazgo de este vigilante).\n\n' +
            'Precedente: bizum_cents, añadida por la spec 10 el 30 ago 2026 y libre hasta ' +
            'el 1 sep.',
          fichero: vigente.fichero,
        }),
      );
      continue;
    }

    // Nombrada, pero: ¿comparada de forma que aguante un null?
    if (!nullable) continue;
    const comparacion = new RegExp(
      `old\\.${nombre}\\s*(<>|!=|is\\s+distinct\\s+from)`,
      'i',
    ).exec(vigente.cuerpo);
    if (!comparacion) continue; // nombrada de otra forma (un to_jsonb, por ejemplo)
    if (/is\s+distinct\s+from/i.test(comparacion[1])) continue;

    hallazgos.push(
      hallazgo({
        clave: `inmutabilidad-cobros/nullable-con-desigualdad:${nombre}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `cobros.${nombre} es nullable y el guarda la compara con "${comparacion[1]}"`,
        detalle:
          `${nombre} admite NULL, y en SQL \`x <> NULL\` no es false: es NULL. Una cadena de ` +
          'OR que da NULL no entra por la rama del `raise`, asi que el cambio pasa.\n\n' +
          `Efecto real: se puede poner ${nombre} a NULL en un cobro cerrado --y desde NULL a ` +
          'cualquier importe-- sin que el guarda diga nada. Es el mismo agujero que tener la ' +
          'columna fuera de la lista, solo que mas dificil de ver.\n\n' +
          `Se arregla con \`OLD.${nombre} is distinct from NEW.${nombre}\`, como ya hace ` +
          'cita_id.',
        fichero: vigente.fichero,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'inmutabilidad-cobros',
  ambito: 'seguridad',
  descripcion: 'Toda columna de dinero de cobros esta congelada por el guarda antifraude',
  ejecutar,
};
