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
import process from 'node:process';
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

const PUERTA = 'supabase/functions/shared/claveServicio.ts';

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

  // La cuarta comprobacion (el bundle) solo puede mirar si alguien ha compilado
  // antes. En la CI eso pasa UNICAMENTE en el job `e2e`, despues de build:web,
  // asi que ese paso es parte del vigilante tanto como el codigo de aqui: si
  // desaparece del workflow, esta comprobacion deja de correr en toda la CI y
  // nadie se entera. Por eso se exige aqui.
  exigir(leer('.github/workflows/ci.yml'), /VIGILAR_BUNDLE:\s*'1'/, {
    fichero: '.github/workflows/ci.yml',
    ancla: 'paso que revisa el bundle compilado (VIGILAR_BUNDLE)',
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

  // --- El BUNDLE, no solo el codigo ----------------------------------------
  // Metro cachea por fichero la sustitucion de los EXPO_PUBLIC_*: el codigo
  // puede estar limpio y el bundle salir con la clave vieja. Ya paso.
  //
  // ESTA COMPROBACION SE PASO MESES SIN MIRAR NADA, EN VERDE. `web/app` esta
  // gitignorado: en el job `check` de la CI, que es el que corre los vigilantes,
  // no existe. El recorrido hacia `if (!existsSync(abs)) return;`, devolvia cero
  // ficheros, el bucle no iteraba y salia verde -- sin error, sin aviso, sin
  // rastro en el log. Un vigilante ciego dando el visto bueno, que es
  // exactamente lo que la regla del ancla perdida existe para impedir; se colo
  // porque el ancla que faltaba no era un regex sino un DIRECTORIO.
  //
  // Ahora distingue las tres situaciones en vez de callarse en las tres:
  //   - hay bundle          -> se revisa (lo de siempre)
  //   - no hay y no tocaba  -> silencio legitimo (un `npm run vigilar` en local
  //                            sin haber compilado; es lo normal)
  //   - no hay y SI tocaba  -> BLOQUEANTE. Quien pone VIGILAR_BUNDLE=1 esta
  //                            afirmando que acaba de compilar; si no hay nada
  //                            que mirar, el build fallo o el paso esta mal
  //                            puesto, y en ambos casos la clave del bundle se
  //                            queda sin vigilar.
  const debiaHaberBundle = process.env.VIGILAR_BUNDLE === '1';
  const delBundle = [...ficherosDelBundle(BUNDLE)];
  if (debiaHaberBundle && delBundle.length === 0) {
    hallazgos.push(
      hallazgo({
        clave: 'claves/bundle-sin-revisar',
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: 'Se pidio revisar el bundle y no hay bundle que revisar',
        detalle:
          `VIGILAR_BUNDLE=1 dice que este paso corre despues de build:web, pero ${BUNDLE} esta vacio ` +
          'o no existe. O el build ha fallado, o el paso esta puesto en el job equivocado. En cualquiera ' +
          'de los dos casos la comprobacion que caza la trampa de la cache de Metro NO se ha hecho, y ' +
          'esa es la que ya dejo salir un bundle con la clave vieja teniendo el codigo limpio.',
        fichero: BUNDLE,
      }),
    );
  }
  if (!debiaHaberBundle && delBundle.length === 0) {
    console.log('[claves] sin bundle compilado en web/app: la comprobacion del bundle NO se ha hecho.');
  }
  for (const rel of delBundle) {
    let texto;
    try {
      texto = readFileSync(path.join(RAIZ, rel), 'utf8');
    } catch {
      continue;
    }
    if (!texto.includes(JWT_HEREDADA) && !SECRETA.test(texto)) continue;
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
