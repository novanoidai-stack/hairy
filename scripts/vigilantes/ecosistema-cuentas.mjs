// Capa 1 del ecosistema de cuentas: lo que se puede cazar leyendo el repo.
//
// La capa 2 (public.vigilancia_bd_ecosistema) mira el estado REAL de la base:
// que salones no tienen titular, cual tiene el modo de acceso contradiciendo a
// sus cuentas, si el guarda de identidad sigue congelando. Esto de aqui mira lo
// otro: que el CODIGO no vuelva a dejar los huecos por los que se colaron.
//
// Los cuatro invariantes salen, uno a uno, de algo que estaba roto el 30 ago
// 2026 y que nadie habia notado:
//
//   1. El guarda de `profiles` congela con `new.x := old.x`, nunca con COALESCE.
//      La version desplegada usaba COALESCE --que solo rellena nulos-- y con eso
//      cualquier usuario con sesion se ponia role='owner' y se cambiaba el
//      negocio_id, que es de donde vive toda la RLS multi-tenant. El repo estaba
//      BIEN; lo que fallo es que nada comparaba el repo con lo desplegado. Esta
//      comprobacion es la barata (el .sql del PR); la de verdad esta en capa 2.
//
//   2. Nadie deduce al titular por su cuenta. La consulta
//      `role = 'owner' order by created_at limit 1` estaba copiada en seis
//      sitios y, cuando no encontraba a nadie, ninguno fallaba: devolvian un
//      cero razonable y seguian. Habia CINCO salones sin propietario y con
//      ellos el plan no se propagaba, la prueba no caducaba y el cobro no se
//      podia marcar. Hoy hay una sola definicion: titular_del_negocio().
//
//   3. El tope de profesionales no se lee de negocio_config, que es una tabla
//      que el propio salon escribe (se comprobo: 15 -> 999 en una sentencia).
//
//   4. Quien invita pregunta antes si puede. crear-acceso-empleado invitaba sin
//      mirar el modo de acceso, ni el plan, ni la prueba caducada, ni el tope.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';
import { sinComentarios } from './migraciones.mjs';

/**
 * Los tres hallazgos del estreno de este vigilante fueron sus PROPIOS
 * comentarios: el fichero del guarda explica el fallo escribiendo
 * `COALESCE(new.plan, old.plan)` para contar por que estaba mal, y las
 * migraciones nuevas nombran `negocio_config` justo para decir que ya no se lee
 * de ahi. Un vigilante que no distingue el codigo de lo que se dice SOBRE el
 * codigo es un vigilante que castiga documentar, y aqui se documenta mucho.
 *
 * sinComentarios() (de migraciones.mjs) quita los de SQL conservando la
 * longitud. Los `//` de TypeScript no los toca, asi que se anaden aqui.
 */
export function soloCodigo(texto) {
  return sinComentarios(texto).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const GUARDA = 'supabase/migrations/20260830002457_guard_profiles_congelar_de_verdad.sql';
const TITULAR = 'supabase/migrations/20260830002824_titular_del_salon.sql';
const EDGE_ACCESO = 'supabase/functions/crear-acceso-empleado/index.ts';
const DIR_MIGRACIONES = 'supabase/migrations';
const DIR_EDGES = 'supabase/functions';

// Las columnas de `profiles` que deciden quien eres y que has contratado. Si
// una deja de congelarse, su dueno se la puede reescribir.
export const COLUMNAS_CONGELADAS = [
  'role',
  'negocio_id',
  'plan',
  'ia_nivel',
  'trial_ends_at',
  'stripe_customer_id',
  'stripe_subscription_id',
  'suscripcion_estado',
];

// La consulta que estaba copiada en seis sitios. Se busca el patron completo
// --filtrar por owner Y quedarse con el primero-- para no marcar los sitios que
// legitimamente cuentan owners (staff_set_role, set_member_role) o los que
// listan el equipo.
export const DEDUCE_TITULAR_A_MANO =
  /role\s*=\s*'owner'[\s\S]{0,160}?order\s+by[\s\S]{0,80}?created_at[\s\S]{0,60}?limit\s+1/i;

// Ficheros que PUEDEN nombrar la consulta vieja sin que sea un defecto: el que
// define al titular, y el archivo historico (ya aplicado, no se reescribe).
const EXENTOS = new Set([TITULAR]);

/** Analiza el texto del guarda de identidad. Exportado para poder probarlo. */
export function analizarGuarda(sqlCrudo, rel) {
  const sql = soloCodigo(sqlCrudo);
  const fuera = [];
  const add = (clave, titulo, detalle, nivel = 'bloqueante') =>
    fuera.push({ clave: `cuentas/${clave}`, nivel, ambito: 'cuentas', titulo, detalle, fichero: rel });

  // Ancla: si la funcion ya no esta en este fichero, el vigilante se ha quedado
  // ciego y eso es un hallazgo, no un verde.
  if (!/create\s+or\s+replace\s+function\s+public\.guard_profile_identity_columns/i.test(sql)) {
    throw new AnclaPerdida(
      `${rel} ya no define guard_profile_identity_columns(). O se movio de fichero (y hay ` +
        'que actualizar este vigilante) o se borro. Esa funcion es el unico freno entre la ' +
        'politica profiles_update_all y las columnas de identidad y facturacion.',
      { fichero: rel, ancla: 'guard_profile_identity_columns' },
    );
  }

  if (/coalesce\s*\(\s*new\./i.test(sql)) {
    add(
      'guarda-con-coalesce',
      'El guarda de identidad usa COALESCE, que no congela nada',
      'COALESCE(new.x, old.x) devuelve new.x siempre que no sea null, o sea que deja pasar ' +
        'cualquier UPDATE. La forma que congela es `new.x := old.x` a secas.\n\n' +
        'Asi estuvo produccion hasta el 30 ago 2026: con COALESCE, un empleado se ponia ' +
        "role='owner' y negocio_id de otro salon en una sola llamada REST, y se llevaba por " +
        'delante el multi-tenant entero.',
    );
  }

  for (const col of COLUMNAS_CONGELADAS) {
    const re = new RegExp(`new\\.${col}\\s*:=\\s*old\\.${col}`, 'i');
    if (re.test(sql)) continue;
    add(
      `guarda-sin-${col}`,
      `El guarda de identidad ya no congela ${col}`,
      `Sin \`new.${col} := old.${col};\`, el dueno de la fila puede reescribir esa columna ` +
        'desde el cliente. `role` se habia caido de la lista sin que nadie lo notara, y es ' +
        'la que abre la caja, los informes y el PIN del propietario.',
    );
  }

  return fuera;
}

/** Busca copias de "deducir el titular a mano" en migraciones y edges. */
export function buscarDeduccionesAMano(ficheros) {
  const fuera = [];
  for (const { rel, texto } of ficheros) {
    if (EXENTOS.has(rel)) continue;
    if (!DEDUCE_TITULAR_A_MANO.test(soloCodigo(texto))) continue;
    fuera.push({
      clave: `cuentas/titular-deducido-a-mano-${rel.replace(/[^\w]+/g, '-')}`,
      nivel: 'bloqueante',
      ambito: 'cuentas',
      titulo: `${rel} vuelve a deducir el titular del salon por su cuenta`,
      detalle:
        "La consulta `role = 'owner' order by created_at limit 1` estaba copiada en seis " +
        'sitios, y ninguno fallaba cuando el salon no tenia propietario: devolvian un cero ' +
        'razonable y seguian. El 30 ago 2026 habia CINCO salones asi, y con ellos el plan no ' +
        'se propagaba al equipo, la prueba no caducaba nunca, el cobro fuera de Stripe no se ' +
        'podia marcar y el motor de referidos los contaba como cero.\n\n' +
        'Usar public.titular_del_negocio(negocio_id), que nunca devuelve null si el salon ' +
        'tiene cuentas.',
      fichero: rel,
    });
  }
  return fuera;
}

async function ejecutar() {
  const hallazgos = [];

  // --- 1. El guarda de identidad -------------------------------------------
  for (const h of analizarGuarda(leer(GUARDA), GUARDA)) hallazgos.push(hallazgo(h));

  // --- 2. Nadie deduce al titular a mano -----------------------------------
  const fuentes = [];
  for (const f of readdirSync(path.join(RAIZ, DIR_MIGRACIONES))) {
    if (!f.endsWith('.sql')) continue;
    const rel = path.posix.join(DIR_MIGRACIONES, f);
    fuentes.push({ rel, texto: leer(rel) });
  }
  for (const d of readdirSync(path.join(RAIZ, DIR_EDGES), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const rel = path.posix.join(DIR_EDGES, d.name, 'index.ts');
    try {
      fuentes.push({ rel, texto: leer(rel) });
    } catch {
      // error-ignorado: no todas las carpetas de functions tienen index.ts
      // (_shared, shared). Que falte no es un defecto.
    }
  }
  for (const h of buscarDeduccionesAMano(fuentes)) hallazgos.push(hallazgo(h));

  // --- 3. El tope no vuelve a negocio_config -------------------------------
  const titular = leer(TITULAR);
  if (!/titular_del_negocio/.test(titular)) {
    throw new AnclaPerdida(
      `${TITULAR} ya no define titular_del_negocio(). Sin esa funcion, las seis consultas ` +
        'que deducian al titular por su cuenta no tienen a donde ir.',
      { fichero: TITULAR, ancla: 'titular_del_negocio' },
    );
  }

  // Se comprueba en POSITIVO: el trigger que aplica el tope tiene que sacarlo de
  // limite_negocio(). Buscar "negocio_config" en negativo daba tres falsos
  // positivos en el estreno, porque las migraciones nuevas lo nombran justo para
  // explicar que ya NO se lee de ahi. Un ancla positiva no se puede confundir
  // con una explicacion, y ademas dice que hay que hacer en vez de que no.
  for (const { rel, texto } of fuentes) {
    const codigo = soloCodigo(texto);
    // La definicion, no una mencion: `create ... function ... limitar_...`.
    if (!/create\s+or\s+replace\s+function\s+public\.limitar_profesionales_por_negocio/i.test(codigo)) {
      continue;
    }
    // Las migraciones anteriores al cambio son historia ya aplicada.
    if (rel < 'supabase/migrations/20260830003349') continue;
    if (/limite_negocio\s*\(/i.test(codigo)) continue;
    hallazgos.push(
      hallazgo({
        clave: `cuentas/tope-fuera-de-negocio-limites-${rel.replace(/[^\w]+/g, '-')}`,
        nivel: 'bloqueante',
        ambito: 'cuentas',
        titulo: `${rel} redefine el tope de profesionales sin usar limite_negocio()`,
        detalle:
          'El tope vivia en negocio_config.config->>"limiteProfesionales", y negocio_config ' +
          'tiene una politica RLS que deja a cualquier miembro del salon escribir el blob ' +
          'entero. Comprobado el 30 ago 2026: el propietario se subio su tope de 15 a 999 con ' +
          'un solo insert ... on conflict do update, o sea que el tope del panel era decorado.' +
          '\n\nUn limite que pone Mecha no puede vivir en una tabla que escribe el cliente: ' +
          'va en public.negocio_limites (sin politicas, solo por RPC de staff) y se lee con ' +
          "public.limite_negocio(negocio_id, 'profesionales').",
        fichero: rel,
      }),
    );
  }

  // --- 4. Quien invita pregunta antes --------------------------------------
  const edge = leer(EDGE_ACCESO);
  if (!/evaluar_alta_de_acceso/.test(edge)) {
    hallazgos.push(
      hallazgo({
        clave: 'cuentas/edge-invita-sin-preguntar',
        nivel: 'bloqueante',
        ambito: 'cuentas',
        titulo: 'crear-acceso-empleado ya no consulta evaluar_alta_de_acceso()',
        detalle:
          'Es la unica puerta por la que se crean cuentas de acceso de un salon, y antes no ' +
          'miraba nada: ni el modo de acceso (un salon de correo unico seguia invitando ' +
          'cuentas individuales, que es tener dos modelos de identidad a la vez), ni el plan ' +
          '(equipo entra en Esencial y Estudio, no en free), ni si la prueba habia caducado, ' +
          'ni cuantas cuentas habia ya.\n\nLa regla vive entera en evaluar_alta_de_acceso() ' +
          'para que la edge y la pantalla de Accesos pregunten exactamente lo mismo.',
        fichero: EDGE_ACCESO,
      }),
    );
  } else if (!/alta\.ok\s*!==\s*true/.test(edge)) {
    // Llamarla y no mirar la respuesta es el fallo clasico: parece que hay un
    // control y no lo hay. Mismo espiritu que edges-autorizadas.mjs, que exige
    // que el resultado de peticionDeServicio se CONSUMA, no solo que se llame.
    hallazgos.push(
      hallazgo({
        clave: 'cuentas/edge-no-mira-la-respuesta',
        nivel: 'bloqueante',
        ambito: 'cuentas',
        titulo: 'crear-acceso-empleado llama a evaluar_alta_de_acceso() y no usa el resultado',
        detalle:
          'Llamar a un control y no mirar lo que contesta es peor que no llamarlo: el codigo ' +
          'parece protegido y no lo esta. Tiene que cortar con `if (alta.ok !== true)` antes ' +
          'de generar el enlace de invitacion.',
        fichero: EDGE_ACCESO,
      }),
    );
  }

  // Y que las dos pantallas que ofrecen el boton pregunten lo mismo.
  for (const rel of ['app/(tabs)/configuracion.web.tsx', 'app/(tabs)/equipo.web.tsx']) {
    if (/consultarAltaDeAcceso/.test(leer(rel))) continue;
    hallazgos.push(
      hallazgo({
        clave: `cuentas/pantalla-sin-preguntar-${rel.replace(/[^\w]+/g, '-')}`,
        nivel: 'aviso',
        ambito: 'cuentas',
        titulo: `${rel} ofrece invitar sin preguntar al servidor si se puede`,
        detalle:
          'El servidor va a rechazar la invitacion igual (la edge comprueba), asi que esto no ' +
          'abre ningun agujero: solo hace que la persona se coma un error donde podria haber ' +
          'leido una explicacion. Preguntar con consultarAltaDeAcceso() y esconder el boton.',
        fichero: rel,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'ecosistema-cuentas',
  ambito: 'cuentas',
  descripcion:
    'El guarda de identidad congela de verdad, nadie deduce al titular a mano, el tope no ' +
    'vive en una tabla del cliente y quien invita pregunta antes si puede',
  ejecutar,
};
