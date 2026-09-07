// LA LISTA DE CATEGORIAS DE GASTO VIVE EN DOS SITIOS Y TIENEN QUE DECIR LO MISMO.
//
// Desde el 7 sep 2026 (peticion 14 de Jose) los gastos tienen trece categorias
// en vez de cuatro. Esa lista existe:
//
//   1. en `lib/gastos.ts`  -> CATEGORIAS_GASTO, que llena el desplegable del
//      formulario y da nombre a las barras del desglose.
//   2. en el CHECK de la tabla -> `gastos_categoria_check`, migracion
//      20260907142944_gastos_completos_de_salon.sql.
//
// COMO SE ROMPE, que es lo que hace falta saber:
//   * Se anade una categoria a lib/gastos.ts y no al CHECK: sale en el
//     desplegable, el usuario la elige, y al guardar salta un 23514 que en
//     pantalla parece un fallo del formulario. Se descubre en produccion.
//   * Se anade al CHECK y no a lib/gastos.ts: nadie puede elegirla, y si alguna
//     fila la tiene (importador, script, SQL a mano) el desglose la ensena con el
//     valor crudo -- 'gestoria' en vez de 'Gestoria y asesoria'.
//
// Ninguno de los dos falla al escribir el codigo, y por eso hace falta esto.
//
// Lo mismo con `METODOS_PAGO_GASTO` y `gastos_metodo_pago_check`.
//
// POR QUE CONTRA LA MIGRACION Y NO CONTRA LA BASE
// Esta es la capa 1: sin red, en cada PR. Comparar contra produccion es trabajo
// de la capa 2 (vigilancia_bd). Aqui se compara contra el .sql del repo, que es
// lo que se va a aplicar; si alguien cambia el CHECK desde el dashboard sin
// migracion, eso lo caza `bd-migraciones`, que es su terreno.

import { leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const FICHERO_TS = 'lib/gastos.ts';
const FICHERO_SQL =
  'supabase/migrations/20260907142944_gastos_completos_de_salon.sql';

/**
 * Valores de una lista `export const X: {...}[] = [ { valor: 'a', ... } ]`.
 * Se leen los `valor:` que hay entre la apertura y el `];` que la cierra.
 */
function valoresDeLista(codigo, nombre) {
  const abre = codigo.indexOf(`export const ${nombre}`);
  if (abre < 0) {
    throw new AnclaPerdida(
      `No se encuentra "export const ${nombre}" en ${FICHERO_TS}. Si la lista se ha renombrado, actualiza este vigilante: mientras el ancla este perdida, nadie compara nada.`,
      { fichero: FICHERO_TS, ancla: `export const ${nombre}` },
    );
  }
  const cierra = codigo.indexOf('];', abre);
  if (cierra < 0) {
    throw new AnclaPerdida(
      `"export const ${nombre}" no cierra con "];" en ${FICHERO_TS}.`,
      { fichero: FICHERO_TS, ancla: `export const ${nombre}` },
    );
  }
  const cuerpo = codigo.slice(abre, cierra);
  return [...cuerpo.matchAll(/valor:\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Valores de un `check (col in ('a','b',...))` dentro del .sql. */
function valoresDelCheck(sql, constraint) {
  const abre = sql.indexOf(`add constraint ${constraint}`);
  if (abre < 0) {
    throw new AnclaPerdida(
      `No se encuentra "add constraint ${constraint}" en ${FICHERO_SQL}. Si la migracion se ha renombrado o el constraint se define en otra, actualiza este vigilante.`,
      { fichero: FICHERO_SQL, ancla: `add constraint ${constraint}` },
    );
  }
  const cierra = sql.indexOf(';', abre);
  const cuerpo = sql.slice(abre, cierra);
  return [...cuerpo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

function comparar({ que, enCodigo, enSql, clave, fuenteCodigo, fuenteSql }) {
  // CONTROL POSITIVO. Dos listas VACIAS "coinciden", asi que sin esto un regex
  // que deja de casar --se renombra la constante, el CHECK pasa a escribirse con
  // ANY(ARRAY[...]) en vez de IN(...)-- daria verde sin haber comparado nada. Es
  // el modo de fallo tipico de un vigilante negativo, y el unico que no se ve.
  if (enCodigo.length === 0 || enSql.length === 0) {
    throw new AnclaPerdida(
      `${que}: no se ha extraido ningun valor de ${enCodigo.length === 0 ? fuenteCodigo : fuenteSql}. El formato ha cambiado y este vigilante ya no lee nada; mientras siga asi, su verde no significa que las listas cuadren, sino que nadie las esta mirando.`,
      { fichero: enCodigo.length === 0 ? FICHERO_TS : FICHERO_SQL },
    );
  }

  const soloCodigo = enCodigo.filter((v) => !enSql.includes(v));
  const soloSql = enSql.filter((v) => !enCodigo.includes(v));
  if (soloCodigo.length === 0 && soloSql.length === 0) return null;

  const partes = [];
  if (soloCodigo.length > 0) {
    partes.push(
      `Solo en ${FICHERO_TS}: ${soloCodigo.join(', ')}. El desplegable las ofrece y la base las RECHAZA: quien las elija recibira un 23514 al guardar, y en pantalla parecera un fallo del formulario.`,
    );
  }
  if (soloSql.length > 0) {
    partes.push(
      `Solo en el CHECK: ${soloSql.join(', ')}. Nadie puede elegirlas desde la interfaz, y si alguna fila las tiene el desglose las ensena con el valor crudo en vez de con su nombre.`,
    );
  }

  return hallazgo({
    clave,
    nivel: 'bloqueante',
    ambito: 'coherencia',
    titulo: `${que}: el codigo y la base no dicen lo mismo`,
    detalle: `${partes.join(' ')} Las dos listas van SIEMPRE juntas: ${FICHERO_TS} y ${FICHERO_SQL}.`,
    fichero: FICHERO_TS,
  });
}

async function ejecutar() {
  // `leer` toma la ruta RELATIVA (ya une la raiz por dentro) y LANZA
  // AnclaPerdida si el fichero no esta. Eso es justo lo que se quiere: si la
  // migracion se archiva o se renombra, este vigilante tiene que decir "no he
  // podido mirar" en voz alta, no salir en verde sin comparar nada.
  const ts = leer(FICHERO_TS);
  const sql = leer(FICHERO_SQL);

  const hallazgos = [];

  const cat = comparar({
    que: 'Categorias de gasto',
    enCodigo: valoresDeLista(ts, 'CATEGORIAS_GASTO'),
    enSql: valoresDelCheck(sql, 'gastos_categoria_check'),
    clave: 'gastos-categorias/categorias-descuadradas',
    fuenteCodigo: 'CATEGORIAS_GASTO',
    fuenteSql: 'gastos_categoria_check',
  });
  if (cat) hallazgos.push(cat);

  const met = comparar({
    que: 'Formas de pago de un gasto',
    enCodigo: valoresDeLista(ts, 'METODOS_PAGO_GASTO'),
    enSql: valoresDelCheck(sql, 'gastos_metodo_pago_check'),
    clave: 'gastos-categorias/metodos-descuadrados',
    fuenteCodigo: 'METODOS_PAGO_GASTO',
    fuenteSql: 'gastos_metodo_pago_check',
  });
  if (met) hallazgos.push(met);

  return hallazgos;
}

export default {
  nombre: 'gastos-categorias',
  ambito: 'coherencia',
  descripcion:
    'Las categorias y formas de pago de un gasto dicen lo mismo en lib/gastos.ts y en el CHECK de la tabla',
  necesitaRed: false,
  ejecutar,
};
