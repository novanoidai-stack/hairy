// Botones que fallan en silencio (familia 2b del plan de fase 2).
//
// POR QUE ESTE VIGILANTE EXISTE, Y POR QUE NO BUSCA LO QUE EL PLAN DECIA
//
// El plan original proponia buscar `onClick={() => { algoAsync() }}` sin await
// ni catch. Ese patron existe (13 casos) pero NO es como se traga un error en
// este repo, porque **las promesas de supabase-js no rechazan**: resuelven con
// `{ data, error }`. Un try/catch alrededor de una consulta no captura NADA
// cuando falla por RLS, por una restriccion o por un 4xx -- el error viaja
// dentro del valor devuelto, y la unica forma de tragarselo es no mirarlo.
//
// Medido con el compilador de TypeScript sobre las fuentes de app/, components/
// y lib/: 147 sitios descartan el error en el propio destructuring. Ese es el
// fallo silencioso de esta casa, y ninguno lo habria encontrado el detector que
// proponia el plan.
//
// EL CASO QUE LO DEMUESTRA (positivo de libro)
// components/agenda/modals/NewCitaModal.web.tsx inserta una serie entera de
// citas periodicas con `const { data: serieInsertadas } = await ...insert(...)`.
// Si la insercion falla, serieInsertadas es null, los dos `if (serieInsertadas)`
// siguientes se saltan en silencio, y tres lineas despues la pantalla hace
// `alert('Serie creada: 8 de 8 citas')`. No es que falle callando: es que MIENTE.
//
// EL CASO QUE OBLIGO A CAMBIAR EL DISENO (falso positivo deliberado)
// lib/auth.ts hace `const { data } = await supabase.rpc('is_staff'); return
// data === true`. Aqui descartar el error es LO CORRECTO: si la RPC falla, data
// es null, null === true es false, y responde "no eres staff". Falla cerrado,
// que es lo que debe hacer un chequeo de permisos. Por AST los dos casos son
// identicos: `const { data } = await`. Lo que los distingue es que uno tiene una
// razon y el otro un olvido.
//
// LA REGLA QUE SALE DE AHI: tragarse un error es legitimo si esta escrito por
// que. Un comentario en la linea, en la de arriba o dentro del bloque exime el
// hallazgo. No es una concesion: es la norma que el repo YA practica sin
// haberla escrito -- de los 76 catch vacios, 65 llevan su motivo
// (`catch { /* la lista es secundaria */ }`) y los 11 que no lo llevan son, uno
// por uno, los sospechosos. El vigilante no inventa una norma: hace cumplir la
// que ya habia. Es la misma filosofia que `// nosemgrep` con su explicacion al
// lado, o que `--aprobar` para bajar una linea base: un acto consciente que
// queda en el diff y que alguien puede discutir en la revision.
//
// Corre en cada PR, sin red. Nivel `aviso` con linea base congelada por fichero
// y por clase -- asi mover deuda de un fichero a otro no la esconde.
//
//   node scripts/vigilantes/errores-tragados.mjs --listar    ver todo con fichero:linea
//   node scripts/vigilantes/errores-tragados.mjs --aprobar   congelar la linea base

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const require = createRequire(import.meta.url);
// typescript ya es dependencia del repo (npx tsc --noEmit). Se usa su parser en
// vez de anadir ts-morph: el plan prohibe dependencias nuevas sin discutirlas, y
// para recorrer un AST no hace falta nada mas.
const ts = require('typescript');

const BASELINE = 'scripts/vigilantes/errores-tragados-baseline.json';

// Las ocho clases, con la frase que explica QUE le pasa a un salon real. Esa
// frase va en el hallazgo: "lectura-sin-error" no le dice nada a nadie; "ve una
// pantalla vacia y se la cree" si.
const CLASES = {
  'escritura-sin-error': {
    que: 'guarda sin mirar si ha guardado',
    duele: 'La escritura puede fallar (RLS, una restriccion, sin red) y la pantalla seguir como si nada: el salon cree que ha guardado y no ha guardado.',
  },
  'lectura-sin-error': {
    que: 'lee sin mirar si ha leido',
    duele: 'Si la consulta falla, los datos llegan a null y la pantalla pinta vacio o un total a 0 EUR. Nadie distingue "no hay nada" de "no he podido mirar".',
  },
  'sesion-sin-error': {
    que: 'usa auth/storage/functions sin mirar el error',
    duele: 'La foto no sube, la sesion no cambia o la edge no responde, y no hay ningun aviso.',
  },
  'error-sin-leer': {
    que: 'recoge el error y no lo lee nunca',
    duele: 'La variable existe y nadie la mira. Es el unico caso en el que el descuido esta escrito negro sobre blanco.',
  },
  'catch-mudo': {
    que: 'catch vacio sin motivo escrito',
    duele: 'Se traga lo que sea que haya pasado. Si es deliberado, escribe el motivo dentro y este vigilante se calla.',
  },
  'catch-solo-consola': {
    que: 'catch que solo escribe en la consola',
    duele: 'La consola la ve la CI; la peluquera no. Para ella el boton no ha hecho nada.',
  },
  'catch-flotante-mudo': {
    que: '.catch(() => {}) sin motivo escrito',
    duele: 'Igual que el catch mudo, en una promesa suelta. Si es deliberado, escribe el motivo dentro.',
  },
  'handler-flotante': {
    que: 'handler que llama a una funcion async y no la espera',
    duele: 'El clic dispara la funcion y sigue. Si falla, nadie se entera: ni un aviso, ni un reintento, ni un rastro.',
  },
  'edge-traga-error': {
    que: 'edge function que responde con exito desde un catch',
    duele: 'Quien la llama mira response.ok, ve 200 y da la operacion por buena. El error se queda dentro del cuerpo, donde casi nadie mira.',
  },
};

// Ficheros del cliente: es donde vive el fallo que ve un salon.
const GLOBS_APP = ['app/**/*.tsx', 'app/**/*.ts', 'app/*.tsx', 'components/**/*.tsx', 'components/**/*.ts', 'lib/**/*.ts', 'lib/*.ts'];
// Y las edge functions, que fallan en el servidor pero se notan igual.
const GLOBS_EDGE = ['supabase/functions/*/index.ts', 'supabase/functions/shared/*.ts'];

const esTest = (rel) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

function ficheros(globs) {
  const salida = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...globs], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return salida.split('\n').filter((f) => f && !esTest(f));
}

// --- La regla del motivo escrito ------------------------------------------
//
// Tragarse un error es legitimo SI ESTA ESCRITO POR QUE. Pero "esta escrito"
// tiene dos formas muy distintas, y confundirlas deja al vigilante ciego.
//
// La primera version de esto eximia cualquier comentario cercano, y al auditarla
// resulto que eximia 35 de 123 lecturas por comentarios como
// `// Arqueo del dia: lo cobrado HOY de verdad`, que explican QUE HACE LA
// CONSULTA, no por que se ignora su error. En un repo que comenta cada linea en
// espanol, esa regla acaba eximiendolo todo: el vigilante se apaga solo, poco a
// poco, sin que nadie lo note. Que es exactamente lo que no puede pasar.
//
// La regla buena distingue por AMBIGUEDAD:
//
//   1. Un comentario DENTRO de un bloque por lo demas vacio -- `catch { /* la
//      lista es secundaria */ }` -- solo puede querer decir una cosa: por que se
//      traga. No hay nada mas ahi dentro a lo que pueda referirse. Exime.
//      (65 de los 76 catch vacios del repo ya estan escritos asi: la casa ya
//      practicaba la norma, solo que nadie la contaba.)
//
//   2. Donde no hay bloque -- un `const { data } = await supabase...` -- un
//      comentario encima es ambiguo, asi que hace falta una MARCA EXPLICITA:
//
//        // error-ignorado: sin permiso data es null y esto responde "no eres
//        // staff". Fallar cerrado es lo correcto en un chequeo de permisos.
//        const { data } = await supabase.rpc('is_staff');
//
//      Es el mismo trato que `// nosemgrep` con su explicacion al lado
//      (precedente del 3DES de Redsys). No se pone sin querer, se ve en el diff,
//      y `grep -rn "error-ignorado:"` da la lista completa de errores que este
//      producto se traga a proposito. Esa lista, por si sola, ya vale.

const MARCA = 'error-ignorado:';

/** Caso 1: comentario dentro de un bloque vacio. Solo puede hablar del silencio. */
function motivoEnBloque(bloque, src) {
  return /\/\/|\/\*/.test(bloque.getFullText(src));
}

/**
 * Caso 2: la marca explicita, en la misma linea o en el bloque de comentarios
 * pegado justo encima. Se sube linea a linea mientras sigan siendo comentario o
 * esten en blanco, para que una justificacion de tres lineas valga igual que una.
 */
function marcaExplicita(lineas, linea) {
  if ((lineas[linea - 1] || '').includes(MARCA)) return true;
  for (let i = linea - 2; i >= 0; i--) {
    const l = (lineas[i] || '').trim();
    if (l === '') continue;
    if (!l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*')) return false;
    if (l.includes(MARCA)) return true;
  }
  return false;
}

/** Recorre un fichero y devuelve sus hallazgos crudos. */
function analizarApp(rel, texto, contadores) {
  const src = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineas = texto.split('\n');
  const enLinea = (n) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const trozo = (n) => n.getText(src).slice(0, 120).replace(/\s+/g, ' ');
  const encontrados = [];
  const apunta = (clase, n, extra = '') =>
    encontrados.push({ clase, fichero: rel, linea: enLinea(n), fragmento: trozo(n), extra });

  // Funciones locales declaradas async: `function x()`, `const x = async () => {}`
  // y `const x = useCallback(async () => {}, [])` -- esta ultima es la forma
  // normal en este repo y sin ella el detector de handlers se pierde la mitad.
  const asyncLocales = new Set();
  (function recogerAsync(n) {
    if (ts.isFunctionDeclaration(n) && n.name && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      asyncLocales.add(n.name.text);
    }
    if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name) && n.initializer) {
      let init = n.initializer;
      if (ts.isCallExpression(init) && init.arguments.length) {
        const a0 = init.arguments[0];
        if (a0 && (ts.isArrowFunction(a0) || ts.isFunctionExpression(a0))) init = a0;
      }
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
        asyncLocales.add(n.name.text);
      }
    }
    ts.forEachChild(n, recogerAsync);
  })(src);

  const contenedor = (n) => {
    let p = n.parent;
    while (p && !ts.isFunctionDeclaration(p) && !ts.isArrowFunction(p) && !ts.isFunctionExpression(p) && !ts.isMethodDeclaration(p) && !ts.isSourceFile(p)) p = p.parent;
    return p || src;
  };
  const usosDe = (nombre, ambito) => {
    let n = 0;
    (function w(x) { if (ts.isIdentifier(x) && x.text === nombre) n++; ts.forEachChild(x, w); })(ambito);
    return n;
  };

  (function walk(n) {
    // 1-4. Destructuring del resultado de una llamada a Supabase.
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isObjectBindingPattern(n.name)) {
      const init = n.initializer.getText(src);
      if (/\bsupabase\b/.test(init)) {
        contadores.llamadasSupabase++;
        const elementos = n.name.elements.map((e) => ({ prop: (e.propertyName || e.name).getText(src), local: e.name.getText(src) }));
        const err = elementos.find((e) => e.prop === 'error');
        const linea = enLinea(n);
        if (!err) {
          if (!marcaExplicita(lineas, linea)) {
            if (/\.(insert|update|delete|upsert)\s*\(/.test(init) || /\.rpc\s*\(/.test(init)) apunta('escritura-sin-error', n);
            else if (/\.select\s*\(/.test(init)) apunta('lectura-sin-error', n);
            else apunta('sesion-sin-error', n);
          }
        } else if (usosDe(err.local, contenedor(n)) <= 1 && !marcaExplicita(lineas, linea)) {
          // El error se recoge y no se lee en toda la funcion que lo contiene.
          apunta('error-sin-leer', n, err.local);
        }
      }
    }

    // 5-6. Bloques catch.
    if (ts.isCatchClause(n)) {
      contadores.catches++;
      const cuerpo = n.block.statements;
      const linea = enLinea(n);
      if (cuerpo.length === 0) {
        if (!motivoEnBloque(n.block, src)) apunta('catch-mudo', n);
      } else if (cuerpo.every((s) => /^console\s*\./.test(s.getText(src).trim()))) {
        if (!marcaExplicita(lineas, linea)) apunta('catch-solo-consola', n);
      }
    }

    // 7. .catch(() => {}) con cuerpo vacio.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'catch') {
      const a = n.arguments[0];
      if (a && (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && ts.isBlock(a.body) && a.body.statements.length === 0) {
        if (!motivoEnBloque(a.body, src)) apunta('catch-flotante-mudo', n);
      }
    }

    // 8. Handler JSX (onPress/onClick/onChange...) que llama a una funcion
    // async local sin esperarla. El handler async (`onPress={async () => ...}`)
    // no cuenta: ahi el await esta dentro y el error se maneja donde toca.
    if (ts.isJsxAttribute(n) && /^on[A-Z]/.test(n.name.getText(src)) && n.initializer && ts.isJsxExpression(n.initializer)) {
      const e = n.initializer.expression;
      if (e && ts.isArrowFunction(e) && !e.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) && ts.isBlock(e.body)) {
        for (const st of e.body.statements) {
          if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && ts.isIdentifier(st.expression.expression)) {
            const nombre = st.expression.expression.text;
            if (asyncLocales.has(nombre) && !marcaExplicita(lineas, enLinea(st))) apunta('handler-flotante', st, nombre);
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  })(src);

  return encontrados;
}

/**
 * Edge functions: un catch que responde con exito.
 *
 * OJO CON ESTE DETECTOR. La primera version buscaba `new Response(...)` dentro
 * del catch y daba 0 de 111 bloques -- pero no por disciplina, sino porque las
 * edges de esta casa responden con un helper `json(cuerpo, status)`. Un cero que
 * en realidad significaba "no estoy mirando". Por eso el contador de respuestas
 * halladas es un ANCLA: si baja a cero, esto falla en vez de dar verde.
 */
function analizarEdge(rel, texto, contadores) {
  const src = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineas = texto.split('\n');
  const enLinea = (n) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const encontrados = [];

  (function walk(n) {
    if (ts.isCatchClause(n)) {
      (function dentro(x) {
        let status = null;
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && /^(json|respuesta|responder)$/.test(x.expression.text)) {
          const a = x.arguments[1];
          status = a ? (ts.isNumericLiteral(a) ? Number(a.text) : null) : 200;
        } else if (ts.isNewExpression(x) && x.expression.getText(src) === 'Response') {
          const t = x.arguments?.[1]?.getText(src) || '';
          const m = /status\s*:\s*(\d{3})/.exec(t);
          status = m ? Number(m[1]) : 200;
        }
        if (status !== null) {
          contadores.respuestasEnCatch++;
          if (status < 400 && !marcaExplicita(lineas, enLinea(x))) {
            encontrados.push({
              clase: 'edge-traga-error',
              fichero: rel,
              linea: enLinea(x),
              fragmento: x.getText(src).slice(0, 120).replace(/\s+/g, ' '),
              extra: String(status),
            });
          }
        }
        ts.forEachChild(x, dentro);
      })(n.block);
    }
    ts.forEachChild(n, walk);
  })(src);

  return encontrados;
}

/** Recorre todo el repo y devuelve { hallazgos, contadores }. */
export function barrer() {
  const contadores = { ficherosApp: 0, ficherosEdge: 0, llamadasSupabase: 0, catches: 0, respuestasEnCatch: 0 };
  const encontrados = [];

  for (const rel of ficheros(GLOBS_APP)) {
    let texto;
    try { texto = readFileSync(path.join(RAIZ, rel), 'utf8'); } catch { continue; }
    contadores.ficherosApp++;
    encontrados.push(...analizarApp(rel, texto, contadores));
  }
  for (const rel of ficheros(GLOBS_EDGE)) {
    let texto;
    try { texto = readFileSync(path.join(RAIZ, rel), 'utf8'); } catch { continue; }
    contadores.ficherosEdge++;
    encontrados.push(...analizarEdge(rel, texto, contadores));
  }

  // --- Anclas. Un vigilante ciego no puede dar verde ------------------------
  //
  // OJO CON LA FORMA DE ESTAS COMPROBACIONES. La primera version preguntaba
  // "> 0", y al probarla renombrando el helper `json()` de las edges resulto que
  // el detector se quedaba con 6 de 57 respuestas (un 89 % ciego) y seguia dando
  // verde, porque 6 no es cero. Un ancla que solo distingue "algo" de "nada" no
  // sirve: la ceguera de verdad casi nunca es total, es parcial y silenciosa.
  //
  // Por eso los umbrales son SUELOS con holgura sobre lo que hay hoy (315
  // ficheros, 473 llamadas, 57 respuestas). Un refactor legitimo que se acerque
  // al suelo lo hara saltar una vez, alguien mirara, y lo subira o bajara a
  // conciencia -- que es exactamente el trato.
  const SUELOS = { ficherosApp: 100, llamadasSupabase: 150, respuestasEnCatch: 25 };

  if (contadores.ficherosApp < SUELOS.ficherosApp) {
    throw new AnclaPerdida(
      `Solo se han encontrado ${contadores.ficherosApp} ficheros de app/components/lib (hoy hay 315, el suelo esta en ${SUELOS.ficherosApp}). ` +
      'O se ha reorganizado el arbol y hay que actualizar GLOBS_APP, o este vigilante ha dejado de mirar donde importa.',
      { fichero: 'scripts/vigilantes/errores-tragados.mjs', ancla: 'GLOBS_APP' },
    );
  }
  if (contadores.llamadasSupabase < SUELOS.llamadasSupabase) {
    throw new AnclaPerdida(
      `Solo ${contadores.llamadasSupabase} llamadas a supabase con destructuring en todo el cliente (hoy hay 473, el suelo esta en ${SUELOS.llamadasSupabase}). ` +
      'Eso no es que el codigo este limpio: es que el detector ya no reconoce la forma de las llamadas ' +
      '(un envoltorio nuevo, otro nombre de cliente). Mientras siga asi, este vigilante casi no mira nada.',
      { fichero: 'scripts/vigilantes/errores-tragados.mjs', ancla: 'destructuring de supabase' },
    );
  }
  if (contadores.ficherosEdge > 0 && contadores.respuestasEnCatch < SUELOS.respuestasEnCatch) {
    throw new AnclaPerdida(
      `${contadores.catches} bloques catch en las edge functions y solo ${contadores.respuestasEnCatch} respuestas reconocidas dentro de ellos ` +
      `(hoy hay 57, el suelo esta en ${SUELOS.respuestasEnCatch}). Es el fallo que ya tuvo dos veces este detector: primero buscaba ` +
      '`new Response` cuando las edges responden con un helper `json(cuerpo, status)` y daba 0 de 111 creyendo que era ' +
      'disciplina; luego el ancla preguntaba "> 0" y dejaba pasar un 89 % de ceguera. Si el helper ha cambiado de nombre, ' +
      'anadelo en analizarEdge.',
      { fichero: 'scripts/vigilantes/errores-tragados.mjs', ancla: 'respuestas dentro de catch' },
    );
  }

  return { hallazgos: encontrados, contadores };
}

/** { clase: { fichero: n } } */
export function contarPorFichero(hallazgos) {
  const t = {};
  for (const h of hallazgos) {
    (t[h.clase] ||= {});
    t[h.clase][h.fichero] = (t[h.clase][h.fichero] || 0) + 1;
  }
  return t;
}

/**
 * Compara el barrido de hoy con la linea base congelada.
 *
 * Se cuenta POR FICHERO Y POR CLASE, no en total: con un unico numero global,
 * limpiar dos en un sitio y meter dos en otro daria "todo igual", que es
 * justamente la deriva que esto tiene que ver.
 */
export function comparar(hoy, base) {
  const hallazgos = [];
  for (const [clase, info] of Object.entries(CLASES)) {
    const porFicheroHoy = hoy[clase] || {};
    const porFicheroBase = base[clase] || {};
    for (const [fichero, n] of Object.entries(porFicheroHoy)) {
      const antes = porFicheroBase[fichero] || 0;
      if (n <= antes) continue;
      hallazgos.push({
        clase, fichero,
        nuevos: n - antes,
        titulo: antes === 0
          ? `${fichero}: ${n === 1 ? 'un sitio nuevo' : n + ' sitios nuevos'} donde ${info.que}`
          : `${fichero}: ${n} sitios donde ${info.que} (antes ${antes})`,
        detalle: info.duele,
      });
    }
    // Deuda limpiada: avisa para que BAJE la linea base. El trinquete solo gira
    // hacia abajo, pero solo si alguien lo gira.
    for (const [fichero, antes] of Object.entries(porFicheroBase)) {
      const n = porFicheroHoy[fichero] || 0;
      if (n < antes) {
        hallazgos.push({
          clase, fichero, nuevos: 0, bajada: true,
          titulo: `${fichero}: ${antes - n} menos de "${info.que}" — baja la linea base`,
          detalle: `Quedan ${n} (habia ${antes}). Congela el nuevo suelo con: node scripts/vigilantes/errores-tragados.mjs --aprobar`,
        });
      }
    }
  }
  return hallazgos;
}

async function ejecutar() {
  const { hallazgos: crudos } = barrer();
  const base = JSON.parse(leer(BASELINE));
  const hoy = contarPorFichero(crudos);

  return comparar(hoy, base).map((d) =>
    hallazgo({
      clave: `errores-tragados/${d.clase}:${d.fichero}`,
      nivel: 'aviso',
      ambito: 'errores-tragados',
      titulo: d.titulo,
      detalle: d.detalle,
      fichero: d.fichero,
      linea: crudos.find((h) => h.clase === d.clase && h.fichero === d.fichero)?.linea ?? null,
    }),
  );
}

export default {
  nombre: 'errores-tragados',
  ambito: 'errores-tragados',
  descripcion:
    'Errores que nadie mira: el `error` de supabase descartado en el destructuring, catch mudos, ' +
    'promesas sueltas y edges que responden 200 desde un catch',
  ejecutar,
};

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const argv = process.argv.slice(2);
  const { hallazgos: crudos, contadores } = barrer();
  const hoy = contarPorFichero(crudos);

  if (argv.includes('--aprobar')) {
    const contenido = {
      _comentario:
        'Deuda de errores tragados CONGELADA. Cuenta por fichero y por clase: el vigilante solo grita ' +
        'si algun numero SUBE, y avisa para que se baje aqui cuando alguien limpia. Un total global no ' +
        'valdria: limpiar dos en un sitio y meter dos en otro daria "todo igual". ' +
        'Regenerar con: node scripts/vigilantes/errores-tragados.mjs --aprobar',
      _regla:
        'Tragarse un error es legitimo si esta escrito por que, y hay dos formas de escribirlo. ' +
        'Dentro de un bloque vacio (`catch { /* la lista es secundaria */ }`) basta el comentario: ' +
        'ahi no puede referirse a otra cosa. Donde no hay bloque hace falta la marca explicita ' +
        '`// error-ignorado: <motivo>` encima de la linea -- un comentario suelto describe lo que ' +
        'hace el codigo, no por que se ignora el error, y eximir por eso apagaria el vigilante solo. ' +
        'Lo eximido no cuenta aqui. Para ver todo lo que este producto se traga a proposito: ' +
        'grep -rn "error-ignorado:" app components lib supabase/functions',
      ...hoy,
    };
    writeFileSync(path.join(RAIZ, BASELINE), JSON.stringify(contenido, null, 2) + '\n', 'utf8');
    console.log(`[errores-tragados] linea base congelada: ${crudos.length} sitios en ${new Set(crudos.map((h) => h.fichero)).size} ficheros -> ${BASELINE}`);
    process.exit(0);
  }

  if (argv.includes('--listar')) {
    for (const clase of Object.keys(CLASES)) {
      const suyos = crudos.filter((h) => h.clase === clase);
      if (!suyos.length) continue;
      console.log(`\n=== ${clase} (${suyos.length}) — ${CLASES[clase].que}`);
      for (const h of suyos) console.log(`  ${h.fichero}:${h.linea}  ${h.fragmento}`);
    }
    console.log(`\n${contadores.ficherosApp} ficheros de cliente, ${contadores.ficherosEdge} de edge; ` +
      `${contadores.llamadasSupabase} llamadas a supabase, ${contadores.catches} catch, ${contadores.respuestasEnCatch} respuestas dentro de catch.`);
    process.exit(0);
  }

  const base = JSON.parse(leer(BASELINE));
  const diffs = comparar(hoy, base);
  for (const d of diffs) console.log(`[errores-tragados] ${d.bajada ? 'BAJADA' : 'AVISO'} ${d.titulo}`);
  console.log(`[errores-tragados] ${crudos.length} sitios, ${diffs.length} avisos.`);
  process.exit(0);
}
