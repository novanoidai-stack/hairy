// Decision 9 de CLAUDE.md: ninguna clave de Supabase se escribe en un fichero
// del repo, y las HEREDADAS (`anon` y `service_role`, JWT que empiezan por `eyJ`)
// estan DESACTIVADAS desde el 29 ago 2026, 11:18 UTC.
//
// POR QUE ESTE VIGILANTE EXISTE
// La fuga original -- cinco ficheros versionados con la `service_role` en claro,
// en un repositorio entonces publico -- no la caso ninguna herramienta: la
// encontro una persona mirando. Y las heredadas no se pueden rotar, asi que el
// unico remedio fue sustituirlas enteras. Volver a meter una clave en el codigo
// no rompe ningun test ni ningun tipo; simplemente la publica.
//
// Ademas hay una regresion mas barata de cometer y igual de cara: llamar a
// `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` o `...('SUPABASE_ANON_KEY')` a pelo
// en una edge function. Hoy esas dos variables apuntan a claves MUERTAS: la
// funcion no falla al desplegarse, falla en produccion la primera vez que un
// salon la usa. Por eso la unica puerta son `claveServicio()` y `clavePublicable()`
// de supabase/functions/shared/claveServicio.ts.
//
// La cuarta comprobacion es la que mas duele si falta: Metro incrusta los
// EXPO_PUBLIC_* como literal y CACHEA esa transformacion por fichero. Cambiar
// .env no invalida los ficheros que no tocaste, asi que el bundle puede salir
// con la clave vieja aunque el codigo fuente este limpio y los tests pasen. Ya
// paso una vez. Por eso aqui se mira el BUNDLE, no solo el codigo.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { leer, hallazgo, exigir, AnclaPerdida, RAIZ } from './nucleo.mjs';

// Cabecera de un JWT HS256 en base64url: `{"alg":"HS256","typ":"JWT"}`. Es como
// empiezan TODAS las claves heredadas de Supabase (anon y service_role).
//
// Partida en dos a proposito: si estuviera entera, este fichero se denunciaria
// a si mismo y habria que exceptuarlo por nombre -- y una excepcion por nombre
// es justo el agujero por el que alguien podria esconder una clave manana.
const JWT_HEREDADA = 'eyJhbGciOiJIUzI1NiIsInR5' + 'cCI6IkpXVCJ9';

// Una secret key de servidor: publica jamas, se salta todas las RLS.
//
// Se exige un cuerpo largo (>=20) para no confundir un valor de mentira de un
// test -- `sb_secret_nueva` -- con una clave de verdad, que ronda los 31
// caracteres despues del prefijo. Una real NUNCA es corta, asi que el filtro no
// deja pasar ninguna: solo deja de ladrar a las fixtures.
const SECRETA = /sb_secret_[A-Za-z0-9_-]{20,}/;

// Un TOKEN PERSONAL de Supabase. No abre una base de datos: abre la CUENTA --
// el Management API de toda la organizacion, todos los proyectos, sus claves y
// el boton de borrarlos. Es MAS grave que una service_role, no menos, y se
// colaba entero por delante de este vigilante porque solo se buscaba `eyJ` y
// `sb_secret_`.
//
// Partido en dos por el mismo motivo que la JWT: para no denunciarse solo.
const PERSONAL = new RegExp('sbp' + '_[A-Za-z0-9]{20,}');

const PUERTA = 'supabase/functions/shared/claveServicio.ts';

// Si esto vale '1', quien corre el vigilante afirma que el bundle TIENE que
// estar compilado. Sin esa afirmacion no se puede distinguir "aqui no aplica"
// (local, sin compilar) de "debia mirar y no he mirado" (CI). Ver el comentario
// largo de comprobarBundle().
const EXIGE_BUNDLE = process.env.VIGILAR_BUNDLE === '1';

// Solo codigo y configuracion. La prosa (.md) puede citar la clave muerta para
// explicar la historia -- de hecho CLAUDE.md y el informe de la migracion lo
// hacen -- y eso no es una fuga.
const EXTENSIONES = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.sql', '.html', '.css', '.yml', '.yaml', '.toml',
]);

// El export de Expo. Gitignored: en un checkout limpio de CI no existe todavia
// y solo aparece si el job ya ha corrido `build:web`. Por eso se recorre a mano
// y no sale en `git ls-files`.
const BUNDLE = 'web/app';

// El propio guardian de las claves nombra las variables heredadas a proposito
// (cae a ellas mientras convivan) y su test las fabrica de mentira.
const EXENTOS_ENV = new Set([
  PUERTA,
  'supabase/functions/shared/claveServicio.test.ts',
]);

const esTest = (rel) => /\.test\.[cm]?[jt]sx?$/.test(rel);

/**
 * Los ficheros de codigo y configuracion que ACABARIAN publicados.
 *
 * Se pregunta a git en vez de andar el arbol por dos razones. La primera es que
 * lo gitignorado no esta publicado: `.env` con la clave buena dentro es
 * exactamente donde debe estar, y denunciarlo seria ruido. La segunda es el
 * tiempo -- andar `web/` y `archive/` a mano costaba 45 s; esto tarda 70 ms.
 *
 * `--others --exclude-standard` anade los ficheros NUEVOS que aun no se han
 * anadido al indice. Sin eso, pegar una clave en un fichero recien creado no se
 * veria hasta despues del `git add` -- es decir, justo cuando ya es tarde para
 * el que lo estaba escribiendo. En la CI da igual (alli todo esta commiteado),
 * pero en local es la diferencia entre avisar a tiempo y no avisar.
 */
function ficherosVersionados() {
  let salida;
  try {
    salida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new AnclaPerdida(
      'No se ha podido preguntar a git que ficheros estan versionados, asi que ' +
        'este vigilante no puede mirar nada. Sin esto pasaria en verde sin haber ' +
        `comprobado una sola linea, que es peor que fallar. (${e?.message || e})`,
      { fichero: '.git', ancla: 'git ls-files' },
    );
  }
  return salida.split('\0').filter((rel) => rel && EXTENSIONES.has(path.extname(rel)));
}

function* ficherosDelBundle(rel, restantes = { n: 4000 }) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (restantes.n <= 0) return;
    const hijoRel = path.posix.join(rel, e.name);
    if (e.isDirectory()) yield* ficherosDelBundle(hijoRel, restantes);
    else if (['.js', '.html', '.json', '.map'].includes(path.extname(e.name))) {
      restantes.n--;
      yield hijoRel;
    }
  }
}

function lineaDelLiteral(texto, aguja) {
  const i = texto.indexOf(aguja);
  if (i < 0) return null;
  return texto.slice(0, i).split('\n').length;
}

/**
 * Todo lo que se le puede reprochar a UN fichero, a partir de su contenido.
 *
 * Vive separado del recorrido para que los tests puedan darle un texto y
 * comprobar que canta lo que tiene que cantar. Un vigilante del que nadie ha
 * visto nunca un hallazgo es un vigilante del que no sabemos si mira.
 */
export function revisarTexto(rel, texto) {
  const hallazgos = [];

  if (texto.includes(JWT_HEREDADA)) {
    hallazgos.push(
      hallazgo({
        clave: `claves/heredada-en-codigo:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `${rel} lleva una clave HEREDADA de Supabase incrustada`,
        detalle:
          'Las heredadas (anon y service_role) estan desactivadas desde el 29 ago ' +
          '2026: ademas de ser una fuga, ya no funciona. Y no se pueden rotar, asi ' +
          'que si la que hay aqui fuese buena la unica cura seria sustituirla entera. ' +
          'Va en .env o en el Vault. Ver decision 9 de CLAUDE.md.',
        fichero: rel,
        linea: lineaDelLiteral(texto, JWT_HEREDADA),
      }),
    );
  }

  const secreta = SECRETA.exec(texto);
  if (secreta) {
    hallazgos.push(
      hallazgo({
        clave: `claves/secreta-en-codigo:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `${rel} lleva una secret key (sb_secret_...) incrustada`,
        detalle:
          'Es la llave maestra: se salta TODAS las RLS de TODOS los salones. Nunca ' +
          'en un fichero del repo, ni "temporalmente". Va en .env (gitignored) o en ' +
          'el Vault, y quien la lee falla ruidosamente si falta. Decision 9 de CLAUDE.md.',
        fichero: rel,
        linea: lineaDelLiteral(texto, secreta[0]),
      }),
    );
  }

  const personal = PERSONAL.exec(texto);
  if (personal) {
    hallazgos.push(
      hallazgo({
        clave: `claves/personal-en-codigo:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `${rel} lleva un token personal de Supabase (sbp_...) incrustado`,
        detalle:
          'Un token personal no abre una base de datos: abre la CUENTA. Con el se entra al ' +
          'Management API de toda la organizacion -- todos los proyectos, sus claves, y el ' +
          'boton de borrarlos. Es mas grave que una service_role, no menos.\n\n' +
          'Y OJO: quitarlo del codigo NO lo desactiva. Hay que REVOCARLO en ' +
          'supabase.com -> cuenta -> Access Tokens, y luego crear otro si hace falta.',
        fichero: rel,
        linea: lineaDelLiteral(texto, personal[0]),
      }),
    );
  }

  // De aqui abajo, solo edge functions.
  if (!rel.startsWith('supabase/functions/') || EXENTOS_ENV.has(rel)) return hallazgos;

  // --- Nadie lee las variables heredadas a pelo ----------------------------
  const aPelo = /Deno\.env\.get\(\s*['"](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)['"]\s*\)/.exec(texto);
  if (aPelo) {
    hallazgos.push(
      hallazgo({
        clave: `claves/env-a-pelo:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `${rel} lee ${aPelo[1]} directamente del entorno`,
        detalle:
          `${aPelo[1]} es una clave HEREDADA y esta MUERTA desde el 29 ago 2026. ` +
          'Esto no rompe el despliegue: rompe la funcion en produccion la primera ' +
          'vez que un salon la usa. Usa claveServicio() o clavePublicable() de ' +
          `${PUERTA}, que prefieren la clave nueva.`,
        fichero: rel,
        linea: lineaDelLiteral(texto, aPelo[0]),
      }),
    );
  }

  // --- Todo cliente de Supabase pasa por una de las dos puertas -------------
  // Los tests quedan fuera: montan clientes de mentira contra hosts de mentira
  // y no se despliegan. Lo que NO quedan fuera es de las dos comprobaciones de
  // arriba -- una clave de verdad en un test se publica igual.
  if (
    !esTest(rel) &&
    /\bcreateClient\s*\(/.test(texto) &&
    !/claveServicio|clavePublicable/.test(texto)
  ) {
    hallazgos.push(
      hallazgo({
        clave: `claves/sin-puerta:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `${rel} crea un cliente de Supabase sin pasar por claveServicio()/clavePublicable()`,
        detalle:
          'Una sola puerta para las claves. Si esta funcion construye la suya por su ' +
          'cuenta, el dia que cambie una clave se queda fuera en silencio -- que es ' +
          'justo lo que le paso a 22 funciones con la anon heredada. Decision 9 de CLAUDE.md.',
        fichero: rel,
        linea: lineaDelLiteral(texto, 'createClient('),
      }),
    );
  }

  return hallazgos;
}

async function ejecutar() {
  const hallazgos = [];

  // --- Anclas: si la puerta desaparece, este vigilante no vale nada ---------
  const puerta = leer(PUERTA);
  exigir(puerta, /export function claveServicio\(/, { fichero: PUERTA, ancla: 'claveServicio()' });
  exigir(puerta, /export function clavePublicable\(/, { fichero: PUERTA, ancla: 'clavePublicable()' });
  exigir(leer('lib/supabase.ts'), /sb_publishable_/, {
    fichero: 'lib/supabase.ts',
    ancla: 'fallback a la clave publishable',
  });

  // --- El codigo versionado, fichero a fichero -----------------------------
  for (const rel of ficherosVersionados()) {
    let texto;
    try {
      const abs = path.join(RAIZ, rel);
      if (statSync(abs).size > 8_000_000) continue;
      texto = readFileSync(abs, 'utf8');
    } catch {
      continue; // borrado a medias, enlace roto: no es cosa de este vigilante
    }
    hallazgos.push(...revisarTexto(rel, texto));
  }

  hallazgos.push(...comprobarBundle());
  return hallazgos;
}

/**
 * El BUNDLE, no solo el codigo. Metro cachea por fichero la sustitucion de los
 * EXPO_PUBLIC_*, asi que el codigo fuente puede estar limpio y el bundle salir
 * con la clave vieja. Ya paso una vez.
 *
 * POR QUE ESTO LLEVA UNA VARIABLE DE ENTORNO
 * `web/app/` esta gitignorado y solo existe despues de `npm run build:web`.
 * Hasta el 29 ago 2026 esta comprobacion empezaba con un `if (!existsSync)
 * return`, y en la CI eso significaba que NUNCA MIRABA NADA: el job `check`
 * corre los vigilantes pero no compila la web, y el job `e2e` compila la web
 * pero no corria los vigilantes. Cero ficheros recorridos, cero hallazgos,
 * verde. Sin error, sin aviso, sin rastro en el log.
 *
 * Es exactamente el modo de pudrirse que la regla del ancla perdida existe para
 * impedir, y se colo porque el ancla que faltaba no era un regex sino un
 * DIRECTORIO. De ahi la leccion general: cuando un vigilante depende de un
 * artefacto que puede no estar, tiene que decir "no he podido mirar" en voz
 * alta. `existsSync(...) return` es la forma mas silenciosa de mentir.
 *
 * Con VIGILAR_BUNDLE=1, quien lo invoca AFIRMA que el bundle deberia estar ahi,
 * y entonces la ausencia es un hallazgo. Sin la variable (local, sin compilar)
 * sigue siendo un no-aplica legitimo.
 */
export function comprobarBundle() {
  const hallazgos = [];
  const abs = path.join(RAIZ, BUNDLE);
  const ficheros = [...ficherosDelBundle(BUNDLE)];

  if (ficheros.length === 0) {
    if (!EXIGE_BUNDLE) return hallazgos; // no aplica: nadie ha compilado
    hallazgos.push(
      hallazgo({
        clave: 'claves/bundle-sin-mirar',
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: 'Se pidio mirar el bundle y no hay bundle que mirar',
        detalle:
          `VIGILAR_BUNDLE=1 dice que ${BUNDLE}/ deberia estar compilado, y ` +
          (existsSync(abs)
            ? 'esta vacio (o no tiene ni un .js/.html/.json).'
            : 'no existe.') +
          '\n\nEsto NO es un no-aplica: es que la comprobacion mas importante de este ' +
          'vigilante -- la que mira si Metro ha incrustado una clave vieja en el bundle -- ' +
          'no se ha ejecutado. Un verde aqui seria mentira.\n\n' +
          'O se corre `npm run build:web` antes, o se quita VIGILAR_BUNDLE de ese paso.',
        fichero: BUNDLE,
      }),
    );
    return hallazgos;
  }

  for (const rel of ficheros) {
    let texto;
    try {
      texto = readFileSync(path.join(RAIZ, rel), 'utf8');
    } catch {
      continue;
    }
    if (!texto.includes(JWT_HEREDADA) && !SECRETA.test(texto) && !PERSONAL.test(texto)) continue;
    hallazgos.push(
      hallazgo({
        clave: `claves/bundle:${rel}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `El bundle construido (${rel}) lleva una clave vieja incrustada`,
        detalle:
          'El codigo fuente puede estar limpio y el bundle no: Metro cachea por fichero ' +
          'la sustitucion de los EXPO_PUBLIC_*, asi que tocar .env NO invalida los ' +
          'ficheros que no tocaste. Reconstruir con la cache limpia:\n' +
          '  rm -rf web/app .expo node_modules/.cache/metro && npm run build:web',
        fichero: rel,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'claves',
  ambito: 'seguridad',
  descripcion:
    'Ninguna clave de Supabase en el codigo ni en el bundle, y las edge functions ' +
    'solo las piden por claveServicio()/clavePublicable()',
  ejecutar,
};
