// Higiene del SQL nuevo, comprobada en el PR.
//
// POR QUE ESTO EXISTE
// La auditoria del 29 ago 2026 encontro cuatro problemas criticos y la CI no vio
// ninguno, porque los cuatro viven donde no mira: dentro de Postgres. Doce RPC
// se colaron fiandose de su parametro -- entre ellas las que reescribian el NIF
// de otro salon y las que metian eslabones en la cadena de huellas VeriFactu de
// otro. Se cazaron DESPUES, leyendo la base de datos ya en produccion.
//
// Este vigilante mueve esa comprobacion al sitio barato: el fichero .sql del
// pull request, antes de aplicarlo. No sustituye a vigilancia_bd() --que mira lo
// que hay aplicado de verdad, incluido lo que se aplico a mano-- sino que evita
// que la proxima llegue a aplicarse.
//
// LIMITE DECLARADO: esto es analisis de texto, no un parser de SQL. Puede no
// ver algo escrito de forma rara. Por eso los hallazgos son BLOQUEANTES pero la
// red de seguridad de verdad sigue siendo la capa 2. Un vigilante barato que
// caza el 90 % en el PR vale mas que uno perfecto que nadie escribe.
//
// Solo mira supabase/migrations/. archive/migraciones-legacy/ es historia: ya
// esta aplicada y marcarla seria ruido permanente.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const DIR = 'supabase/migrations';

// Ids de los que se deduce un negocio. Si una funcion definer recibe uno de
// estos y no lo ata a quien llama, basta cambiar un uuid para operar sobre otro
// salon. Es literalmente "la regla del parametro" del CLAUDE.md.
const PARAMS_DE_NEGOCIO =
  /\b(p_)?(negocio_id|cliente_id|cobro_id|factura_id|profesional_id|cita_id|presupuesto_id)\b/i;

// Lo que ata una funcion a quien la llama. Con que mencione una, ya no se fia
// ciegamente del parametro.
const ATA_AL_LLAMANTE =
  /\b(exige_mi_negocio|auth\.uid|is_staff|my_negocio_id_text|auth\.jwt|auth\.role)\b/i;

// TERCERA prueba valida: el portal publico. Esas RPC son anonimas A PROPOSITO
// (decision 2) y no pueden atarse a auth.uid() porque no hay sesion. Lo que
// hacen es no fiarse tampoco del negocio_id que les pasen: lo DERIVAN del slug
// del portal, y ademas exigen un secreto por registro (el telefono del titular
// o un token del enlace). Quien no conoce el secreto no saca nada.
const DERIVA_DEL_PORTAL = /from\s+(?:public\.)?negocio_portal[\s\S]{0,240}?\bslug\s*=/i;
const EXIGE_UN_SECRETO = /\bp_(telefono|token|codigo|secreto|email)\b/i;

// La OTRA defensa valida, y hay que conocerla o el vigilante miente. Varias
// funciones internas se fian del parametro a proposito y se protegen quitando
// el permiso: si solo las puede llamar service_role o otra definer, nadie desde
// fuera les pasa un uuid ajeno. Es lo que hizo la migracion del 28 ago 2026 con
// diecisiete de ellas (registrar_auditoria_ia entre otras) en vez de reescribirlas.
export function nombresRevocados(sql) {
  const fuera = new Set();
  for (const m of sql.matchAll(
    /revoke\s+(?:all|execute)[\s\S]{0,120}?\bfrom\b[^;]*?\b(?:anon|authenticated|public)\b/gi,
  )) {
    for (const n of m[0].matchAll(/function\s+(?:public\.)?(\w+)/gi)) fuera.add(n[1]);
  }
  // El bucle `for r in select ... where p.proname = any (v_nombres)` que revoca
  // por nombre recorriendo las sobrecargas: los nombres van en un array literal.
  for (const bloque of sql.matchAll(
    /v_nombres\s+text\[\]\s*:=\s*array\s*\[([\s\S]*?)\]/gi,
  )) {
    for (const n of bloque[1].matchAll(/'(\w+)'/g)) fuera.add(n[1]);
  }
  return fuera;
}

// --- utilidades de texto -----------------------------------------------------

// Quita comentarios para que un `-- using (true)` explicativo no cuente como
// hallazgo, pero conserva la longitud para que los numeros de linea cuadren.
export function sinComentarios(sql) {
  return sql
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const lineaEn = (sql, i) => sql.slice(0, i).split('\n').length;

// Cuerpos de funcion delimitados por $$ ... $$ o $tag$ ... $tag$.
export function cuerposDeFuncion(sql) {
  const fuera = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(\$[a-z_]*\$)([\s\S]*?)\3/gi;
  for (const m of sql.matchAll(re)) {
    fuera.push({
      nombre: m[1],
      argumentos: m[2],
      cabecera: sql.slice(m.index, m.index + m[0].indexOf(m[3])),
      cuerpo: m[4],
      linea: lineaEn(sql, m.index),
    });
  }
  return fuera;
}

// --- las comprobaciones ------------------------------------------------------

export function analizarMigracion(rel, sqlCrudo, revocadas = new Set()) {
  const sql = sinComentarios(sqlCrudo);
  const hallazgos = [];
  const add = (clave, titulo, detalle, linea, nivel = 'bloqueante') =>
    hallazgos.push({
      clave: `migraciones/${clave}`,
      nivel,
      ambito: 'seguridad',
      titulo,
      detalle,
      fichero: rel,
      linea,
    });

  // 1. TABLA NUEVA SIN RLS.
  // Sin RLS, cualquier usuario autenticado lee y escribe la tabla entera: el
  // multi-tenant deja de existir para esa tabla. Paso con `profiles`.
  //
  // El esquema se captura APARTE. Antes el patron solo conocia `public.` y en
  // `create table respaldos.citas_antes_del_backfill_fases` se quedaba con
  // "respaldos", o sea que denunciaba una tabla que no existe con ese nombre.
  // Una tabla FUERA de public no la sirve PostgREST -- que es justo el motivo
  // de sacar ahi los respaldos de una operacion-- asi que no se le exige RLS
  // sino que la migracion CIERRE el esquema: sin el revoke, la unica barrera es
  // que nadie lo anada a los esquemas expuestos de Supabase, y eso no es una
  // barrera, es una casualidad.
  for (const m of sql.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\s*\.\s*)?"?(\w+)"?/gi,
  )) {
    const esquema = (m[1] || 'public').toLowerCase();
    const tabla = m[2];

    if (esquema !== 'public') {
      const cierraEsquema = new RegExp(
        `revoke\\s+all\\s+on\\s+schema\\s+"?${esquema}"?\\s+from[\\s\\S]{0,120}?;`,
        'i',
      ).test(sql);
      if (cierraEsquema) continue;
      add(
        `esquema-abierto-${esquema}`,
        `El esquema "${esquema}" se usa sin cerrarlo`,
        `${rel} crea ${esquema}.${tabla} fuera de public. Eso la deja fuera de PostgREST, que ` +
          'es lo correcto para datos que no son de producto (respaldos, staging de una ' +
          'operacion), pero solo mientras nadie anada ese esquema a los expuestos.\n\nCierralo ' +
          `en la misma migracion: "revoke all on schema ${esquema} from public, anon, ` +
          'authenticated;".',
        lineaEn(sql, m.index),
        'aviso',
      );
      continue;
    }

    const activaRls = new RegExp(
      `alter\\s+table[\\s\\S]{0,80}?\\b(?:public\\.)?${tabla}\\b[\\s\\S]{0,80}?enable\\s+row\\s+level\\s+security`,
      'i',
    ).test(sql);
    if (activaRls) continue;

    add(
      `tabla-sin-rls-${tabla}`,
      `La tabla nueva "${tabla}" se crea sin RLS`,
      `${rel} crea public.${tabla} y no ejecuta "alter table ${tabla} enable row level ` +
        'security" en la misma migracion. Sin RLS cualquier usuario con sesion lee y escribe ' +
        'la tabla ENTERA, de todos los salones.\n\nSi es a proposito (una tabla de catalogo ' +
        'global sin datos de negocio), activala igualmente y anade una politica de solo ' +
        'lectura: es una linea y quita la duda para siempre.',
      lineaEn(sql, m.index),
    );
  }

  // 2. POLITICA DE ESCRITURA ABIERTA.
  // "Nunca politicas USING (true) de escritura" -- decision 4 del CLAUDE.md.
  for (const m of sql.matchAll(/create\s+policy[\s\S]*?;/gi)) {
    const politica = m[0];
    const esEscritura = /\bfor\s+(insert|update|delete|all)\b/i.test(politica);
    const abierta = /\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(politica);
    if (!esEscritura || !abierta) continue;

    const nombre = /create\s+policy\s+"?([^"\s]+)"?/i.exec(politica)?.[1] ?? '(sin nombre)';
    const paraAnon = /\bto\s+[^;]*\banon\b/i.test(politica);
    add(
      `politica-abierta-${nombre}`,
      `La politica de escritura "${nombre}" no filtra nada (true)`,
      `${rel} crea una politica de escritura con "using (true)" o "with check (true)"` +
        (paraAnon ? ', y ademas concedida a anon' : '') +
        '. Eso permite escribir filas de CUALQUIER negocio.\n\nLo correcto es atarla al ' +
        'salon de quien llama, y por la decision 6 envuelta en un subselect para que ' +
        'Postgres la evalue una vez por consulta y no una por fila:\n\n' +
        '  using (negocio_id = (select public.my_negocio_id_text()))',
      lineaEn(sql, m.index),
    );
  }

  // 3. LA REGLA DEL PARAMETRO.
  // Una funcion definer que recibe un id de negocio y no lo ata a quien llama.
  for (const fn of cuerposDeFuncion(sql)) {
    const esDefiner = /security\s+definer/i.test(fn.cabecera);
    if (!esDefiner) continue;
    if (!PARAMS_DE_NEGOCIO.test(fn.argumentos)) continue;
    if (ATA_AL_LLAMANTE.test(fn.cuerpo)) continue;
    // Se fia del parametro, pero nadie de fuera puede llamarla: defensa valida.
    if (revocadas.has(fn.nombre.replace(/^public\./, ''))) continue;
    // Portal publico: deriva el negocio del slug y exige un secreto por registro.
    if (DERIVA_DEL_PORTAL.test(fn.cuerpo) && EXIGE_UN_SECRETO.test(fn.argumentos)) continue;

    add(
      `parametro-sin-atar-${fn.nombre}`,
      `${fn.nombre}() es security definer, recibe un id de negocio y se fia de el`,
      'La regla del parametro (CLAUDE.md, decision 4): si una RPC recibe negocio_id -- o un ' +
        'id del que se deduce (p_cliente_id, p_cobro_id, p_factura_id, p_profesional_id) -- ' +
        'TIENE que atarlo a quien llama. Al ser "security definer" corre con permisos del ' +
        'dueno de la funcion, asi que RLS no la protege: basta cambiar un uuid para operar ' +
        'sobre otro salon.\n\nAnadir al principio del cuerpo:\n\n' +
        '  perform public.exige_mi_negocio(<negocio>, <solo_gestor>);\n\n' +
        'Asi se colaron doce, incluidas las que reescribian el NIF de otro salon y las que ' +
        'metian eslabones en su cadena de huellas VeriFactu.',
      fn.linea,
    );
  }

  // 4. RPC CONCEDIDA A ANON SIN EXPLICACION.
  // Desde el round 4 las funciones no nacen ejecutables por anon: cada grant a
  // anon es una decision, y una decision sin motivo escrito no se puede revisar.
  for (const m of sql.matchAll(/grant\s+execute\s+on\s+function\s+([\s\S]*?);/gi)) {
    if (!/\bto\s+[^;]*\banon\b/i.test(m[0])) continue;
    const linea = lineaEn(sql, m.index);
    // El motivo puede ir en cualquier comentario de las 6 lineas de encima.
    const encima = sqlCrudo.split('\n').slice(Math.max(0, linea - 7), linea - 1).join('\n');
    if (/--/.test(encima)) continue;

    const fn = /([\w.]+)\s*\(/.exec(m[1])?.[1] ?? '(?)';
    add(
      `grant-anon-sin-motivo-${fn}`,
      `${fn}() se abre a anon sin decir por que`,
      'Toda RPC publica nueva necesita su "grant execute ... to anon" explicito (round 4 de ' +
        'seguridad), y por eso mismo cada uno tiene que venir con un comentario encima que ' +
        'diga que hace publica esa funcion y como se defiende del abuso (limites por ' +
        'telefono/IP/negocio, como el resto del portal publico).\n\nSin ese comentario nadie ' +
        'puede revisar en el PR si la exposicion es correcta.',
      linea,
    );
  }

  // 5. SQL DINAMICO EJECUTABLE.
  // Nunca funciones tipo exec_sql -- decision 4. Es una puerta a ejecutar
  // cualquier cosa con permisos de superusuario.
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w*exec\w*sql\w*|\w*sql\w*exec\w*)/gi)) {
    add(
      `exec-sql-${m[1]}`,
      `La migracion crea ${m[1]}(), que huele a ejecutor de SQL arbitrario`,
      'La decision 4 lo prohibe explicitamente ("nunca funciones tipo exec_sql"). Una funcion ' +
        'que ejecuta SQL que le llega por parametro convierte cualquier fallo de validacion ' +
        'del cliente en control total de la base de datos.',
      lineaEn(sql, m.index),
    );
  }

  return hallazgos;
}

// --- el vigilante ------------------------------------------------------------

// Deuda heredada: lo que ya estaba mal el 29 ago 2026 cuando se estreno esto.
// Nace congelado y en aviso (regla 2), para que el trinquete solo gire hacia
// abajo. Lo NUEVO es bloqueante desde el primer dia: aqui la deuda no se paga
// sola, pero al menos no crece.
export const HEREDADO = new Set([
  // Version vieja (firma uuid) de una RPC que el 2 ago 2026 se reescribio atada
  // a auth.uid() -- la buena vive en archive/migraciones-legacy/
  // qa-lanzamiento-rpc-toca-recompra.sql. Este fichero quedo suelto en la
  // carpeta activa; borrarlo es seguro pero no es trabajo de un vigilante.
  'migraciones/parametro-sin-atar-rpc_clientes_toca_recompra',
  // Politica del rate-limit de la landing: la tabla la escribe solo
  // service_role, que se salta RLS igualmente.
  'migraciones/politica-abierta-Service',
]);

async function ejecutar() {
  const dir = path.join(RAIZ, DIR);
  const ficheros = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  if (ficheros.length === 0) {
    throw new AnclaPerdida(
      `No hay ninguna migracion .sql en ${DIR}. O se han movido de sitio (y hay que ` +
        'actualizar este vigilante) o se han borrado.',
      { fichero: DIR, ancla: '*.sql' },
    );
  }

  // Las revocaciones valen vengan de donde vengan: una funcion puede definirse
  // en una migracion y cerrarse en otra posterior (fue justo lo que paso con
  // las diecisiete del 28 ago). El archivo tambien cuenta: esta aplicado.
  const revocadas = new Set();
  const fuentes = [
    ...ficheros.map((f) => path.posix.join(DIR, f)),
    ...leerArchivo().map((f) => path.posix.join('archive/migraciones-legacy', f)),
  ];
  for (const rel of fuentes) {
    for (const n of nombresRevocados(leer(rel))) revocadas.add(n);
  }

  const hallazgos = [];
  for (const f of ficheros) {
    const rel = path.posix.join(DIR, f);
    for (const h of analizarMigracion(rel, leer(rel), revocadas)) {
      if (HEREDADO.has(h.clave)) continue;
      hallazgos.push(hallazgo(h));
    }
  }
  return hallazgos;
}

function leerArchivo() {
  try {
    return readdirSync(path.join(RAIZ, 'archive/migraciones-legacy')).filter((f) =>
      f.endsWith('.sql'),
    );
  } catch {
    return []; // el archivo es opcional: si no esta, solo se pierden exenciones
  }
}

export default {
  nombre: 'migraciones',
  ambito: 'seguridad',
  descripcion: 'El SQL nuevo trae RLS, ata sus parametros y no se abre a anon a ciegas',
  ejecutar,
};
