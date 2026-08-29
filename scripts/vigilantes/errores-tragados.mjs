// Familia 2b del plan de fase 2: botones que fallan en SILENCIO.
//
// POR QUE ESTE VIGILANTE EXISTE
// El smoke pulsa cada boton y comprueba que la pantalla no se rompe. Pero el
// fallo que mas duele en un salon no rompe nada: se pulsa "Guardar", la promesa
// se rechaza, nadie la captura, y la pantalla se queda EXACTAMENTE igual. La
// persona cree que ha guardado. No hay error en consola que mirar, no hay test
// que falle, no hay tipo que se queje. Solo un dato que no esta.
//
// Se buscan tres formas del mismo bug, las tres comprobables sin ejecutar nada:
//
//   1. fuego-y-olvido      onClick={() => guardar()} donde `guardar` es async y
//                          PUEDE rechazar. La promesa se tira a la basura; su
//                          rechazo no lo recoge nadie.
//   2. handler-async-sin-catch
//                          onClick={async () => { await guardar(); }} sin
//                          try/catch. React no hace nada con la promesa que
//                          devuelve un handler: el rechazo tambien se pierde.
//   3. supabase-sin-comprobar
//                          await supabase.from(...).update(...) y a otra cosa.
//                          La forma MAS COMUN aqui, y la mas invisible de todas.
//
// LO QUE HAY QUE SABER DE supabase-js PARA QUE ESTO NO SEA RUIDO
// Sus promesas NO rechazan: resuelven con `{ data, error }`. Un `await` a
// supabase, aunque no lleve try/catch, no lanza nunca -- asi que contarlo como
// "puede rechazar" marca cientos de sitios correctos. Medido: por ahi entraba el
// unico falso positivo que se encontro al estrenar esto (`eliminarClienteDirecto`
// en clientes.web.tsx, que SI avisa con un alert al mirar `error`).
//
// La diferencia entre el codigo bueno y el malo no es el try/catch, es si
// alguien MIRA el `error` que vuelve:
//
//   const { error } = await supabase.from('clientes').delete()...;   // bien
//   if (error) alert('No se pudo eliminar al cliente.');
//
//   await supabase.from('bloqueos_profesional').update({...})...;    // silencio
//   cargarAusenciasPendientes();
//
// El segundo es el boton "Aprobar" de la bandeja: si RLS lo deniega, la ausencia
// no se aprueba, no sale ningun aviso y la pantalla se recarga igual de contenta.
// Por eso las dos comprobaciones estan separadas: los `await` de supabase salen
// de la regla 1 y 2 y entran en la 3, que mira lo que de verdad importa.
//
// LA EXENCION QUE HACE QUE ESTO NO SEA RUIDO
// El plan original proponia eximir la llamada si estaba "envuelta en try/catch
// dentro del handler". Eso es falso y ademas al reves:
//
//   - Un try/catch alrededor de una llamada NO esperada no captura nada. La
//     promesa se rechaza despues, cuando el bloque ya termino. Eximir por ahi
//     seria dejar pasar el bug entero.
//   - Lo que SI es seguro -- y es el patron idiomatico de este repo -- es que la
//     funcion llamada se guarde a si misma:
//         const guardar = async () => { try { ... } catch (e) { setError(...) } };
//         <Boton onPress={() => guardar()} />
//     Ahi el fuego-y-olvido es correcto, y hay 800+ handlers asi.
//
// Por eso solo se señala la llamada cuando la funcion destino PUEDE rechazar:
// tiene un `await` o un `throw` fuera de cualquier `try` con `catch`. Es decir,
// cuando no hay ni un solo manejo de errores en el camino.
//
// Se mira solo lo declarado en el MISMO fichero. Una funcion importada de otro
// sitio no se juzga: sin type checker no se sabe si es async ni si se guarda, y
// adivinar produciria justo el ruido que hace que alguien acabe quitando esto.
//
// Nivel: AVISO con linea base congelada POR FICHERO. Hay deuda heredada; el
// trinquete solo gira hacia abajo. Por fichero y no un total global a proposito:
// con un unico numero, borrar un caso viejo en una pantalla y meter uno nuevo en
// otra sale a cero y no se entera nadie.

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { leer, hallazgo, AnclaPerdida, RAIZ } from './nucleo.mjs';

const BASE = 'scripts/vigilantes/errores-tragados-baseline.json';

// Solo el software. `web/` es HTML plano con sus propios scripts y no tiene
// handlers de JSX; el nativo va por detras de la web y no se vigila (regla del
// plan maestro).
const CARPETAS = ['app/', 'components/'];

export const TIPOS = {
  'fuego-y-olvido': 'llamadas async tiradas a la basura en un handler',
  'handler-async-sin-catch': 'handlers async con await sin try/catch',
  'supabase-sin-comprobar': 'llamadas a supabase cuyo error no mira nadie',
};

// --- Utilidades de AST -----------------------------------------------------

const esFuncion = (n) =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);

const esAsync = (n) => (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

/**
 * ¿El nodo esta dentro del bloque `try` de un `try/catch` que quede por debajo
 * de `tope`? Se sube de uno en uno para saber POR DONDE se ha entrado: un await
 * dentro del `catch` no esta protegido por ese mismo catch.
 */
function protegido(nodo, tope) {
  let hijo = nodo;
  let p = nodo.parent;
  while (p && p !== tope) {
    if (ts.isTryStatement(p) && p.catchClause && p.tryBlock === hijo) return true;
    hijo = p;
    p = p.parent;
  }
  return false;
}

/**
 * Recorre el cuerpo de `fn` SIN entrar en funciones anidadas: los `await` de una
 * funcion de dentro son problema de esa funcion, no de esta.
 */
function recorrerCuerpo(fn, visita) {
  if (!fn.body) return;
  const andar = (n) => {
    if (n !== fn.body && esFuncion(n)) return;
    visita(n);
    ts.forEachChild(n, andar);
  };
  andar(fn.body);
}

/**
 * El identificador de mas a la izquierda de una cadena: en
 * `supabase.from('x').update(y).eq('id', z)` devuelve `supabase`.
 */
function raizDeCadena(expr) {
  let n = expr;
  for (;;) {
    if (ts.isCallExpression(n) || ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) {
      n = n.expression;
    } else if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      n = n.expression;
    } else if (ts.isAwaitExpression(n)) {
      n = n.expression;
    } else {
      return ts.isIdentifier(n) ? n.text : null;
    }
  }
}

/** supabase-js resuelve con { data, error }: nunca rechaza. Ver cabecera. */
const esCadenaSupabase = (expr) => raizDeCadena(expr) === 'supabase';

/**
 * Una funcion async "puede rechazar" si tiene un `throw`, o un `await` de algo
 * que pueda lanzar, fuera de un try con catch.
 *
 * Se resuelve en cadena: si lo que espera es OTRA funcion async de este mismo
 * fichero, se le pregunta a ella en vez de suponer. Sin esto, un
 * `await recargar()` cuyo cuerpo entero es supabase marcaba al que la llama.
 * Lo que viene de un import no se puede seguir sin type checker y se supone que
 * lanza: es la suposicion prudente -- pero como la unica consecuencia es un
 * aviso con linea base, prudente aqui no significa ruidoso.
 */
function puedeRechazar(fn, asyncs, pila = new Set()) {
  if (pila.has(fn)) return false; // recursion mutua: no es motivo de hallazgo
  pila.add(fn);

  let puede = false;
  recorrerCuerpo(fn, (n) => {
    if (puede) return;

    if (ts.isThrowStatement(n)) {
      if (!protegido(n, fn)) puede = true;
      return;
    }
    if (!ts.isAwaitExpression(n) || protegido(n, fn)) return;
    if (esCadenaSupabase(n.expression)) return;

    const llamada = n.expression;
    if (ts.isCallExpression(llamada) && ts.isIdentifier(llamada.expression)) {
      const destino = asyncs?.get(llamada.expression.text);
      if (destino) {
        if (puedeRechazar(destino, asyncs, pila)) puede = true;
        return;
      }
    }
    puede = true;
  });

  pila.delete(fn);
  return puede;
}

/**
 * `await supabase...` a pelo, como sentencia suelta: la llamada se hizo, pudo
 * fallar y el `error` que devolvio no lo mira nadie. Si el resultado se
 * desestructura, se asigna o se devuelve, alguien se esta haciendo cargo y no
 * se juzga.
 */
function supabaseSinComprobar(fn) {
  const sitios = [];
  recorrerCuerpo(fn, (n) => {
    if (!ts.isAwaitExpression(n)) return;
    if (!esCadenaSupabase(n.expression)) return;
    if (!ts.isExpressionStatement(n.parent)) return;
    sitios.push(n);
  });
  return sitios;
}

/**
 * La funcion async que hay detras de un inicializador, desenvolviendo el
 * `useCallback` de React.
 *
 * Sin esto, `const cargar = useCallback(async () => {...}, [])` no se reconocia
 * como funcion local, y entonces cualquiera que hiciera `await cargar()` pasaba
 * por "espera algo desconocido, puede lanzar". Es el patron mas comun de React,
 * asi que ese descuido marcaba pantallas enteras que estaban bien (se encontro
 * en SugerenciasServicios.web.tsx al estrenar esto).
 */
function funcionAsyncDe(expr) {
  if (!expr) return null;
  if ((ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) && esAsync(expr)) return expr;
  if (ts.isCallExpression(expr)) {
    const nombre = ts.isPropertyAccessExpression(expr.expression)
      ? expr.expression.name.text
      : ts.isIdentifier(expr.expression)
        ? expr.expression.text
        : '';
    if (nombre === 'useCallback') return funcionAsyncDe(expr.arguments[0]);
  }
  return null;
}

/** Nombre -> funcion async declarada en este fichero. */
function asyncsDelFichero(sf) {
  const mapa = new Map();
  const andar = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && esAsync(n)) {
      mapa.set(n.name.text, n);
    } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const fn = funcionAsyncDe(n.initializer);
      if (fn) mapa.set(n.name.text, fn);
    }
    ts.forEachChild(n, andar);
  };
  ts.forEachChild(sf, andar);
  return mapa;
}

/**
 * ¿Se tira la promesa de esta llamada?
 *
 * Se cuenta como tirada solo en los casos inequivocos: sentencia suelta, cuerpo
 * conciso de una flecha, `return` (React ignora lo que devuelve un handler) y
 * `void`, que marca intencion pero NO captura el rechazo. Si el valor se guarda
 * en una variable o se pasa como argumento, alguien podria estar haciendose
 * cargo mas abajo: no se juzga.
 */
function promesaTirada(call) {
  const p = call.parent;
  if (!p) return false;
  if (ts.isExpressionStatement(p)) return true;
  if (ts.isVoidExpression(p)) return true;
  if (ts.isReturnStatement(p)) return true;
  if (ts.isArrowFunction(p) && p.body === call) return true;
  return false;
}

// --- Analisis de un fichero -------------------------------------------------

/**
 * Devuelve { hallazgos, handlers } de un fichero. `handlers` es cuantos ha
 * llegado a mirar: es el ancla. Vive separado del recorrido para que los tests
 * puedan darle codigo a mano.
 */
export function revisarFuente(rel, texto) {
  const sf = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const asyncs = asyncsDelFichero(sf);
  const encontrados = [];
  let handlers = 0;

  const linea = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const andar = (n) => {
    if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && /^on[A-Z]/.test(n.name.text)) {
      const valor =
        n.initializer && ts.isJsxExpression(n.initializer) ? n.initializer.expression : null;
      if (valor && (ts.isArrowFunction(valor) || ts.isFunctionExpression(valor))) {
        handlers++;
        encontrados.push(...revisarHandler(n.name.text, valor, asyncs, rel, linea));
      }
    }
    ts.forEachChild(n, andar);
  };
  ts.forEachChild(sf, andar);

  // Una misma funcion local (`aprobar()`) la llaman varios botones, y entonces
  // su `await` sin comprobar saldria repetido. Es UN sitio que arreglar, no
  // cinco: se cuenta por linea.
  const vistos = new Set();
  const unicos = encontrados.filter((h) => {
    const k = `${h.tipo}:${h.linea}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  return { hallazgos: unicos, handlers };
}

function revisarHandler(prop, fn, asyncs, rel, linea) {
  const salida = [];

  // Forma 3: supabase sin mirar el error. Se busca en el propio handler y en
  // las funciones locales que llama -- que es donde suele estar el trabajo de
  // verdad (`onPress={() => aprobar()}`). Un nivel basta: mas hondo empieza a
  // señalar codigo que el boton solo toca de refilon.
  const cuerpos = [fn];
  recorrerCuerpo(fn, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    const destino = asyncs.get(n.expression.text);
    if (destino && !cuerpos.includes(destino)) cuerpos.push(destino);
  });
  for (const cuerpo of cuerpos) {
    for (const sitio of supabaseSinComprobar(cuerpo)) {
      salida.push({
        tipo: 'supabase-sin-comprobar',
        rel,
        linea: linea(sitio),
        detalle:
          `${prop} lanza una consulta a supabase y no mira el \`error\` que devuelve. ` +
          'supabase-js no lanza: resuelve con { data, error }. Si RLS lo deniega o la fila ' +
          'no existe, esto sigue como si nada y la persona cree que se ha guardado. ' +
          'Desestructura `const { error } = await ...` y avisa con mensajeDeError().',
      });
    }
  }

  // Forma 2: el handler es async y deja al aire algo que SI puede rechazar.
  if (esAsync(fn)) {
    let visto = false;
    recorrerCuerpo(fn, (n) => {
      if (visto) return;
      const rechaza =
        (ts.isThrowStatement(n) && !protegido(n, fn)) ||
        (ts.isAwaitExpression(n) && !esCadenaSupabase(n.expression) && !protegido(n, fn));
      if (!rechaza) return;
      visto = true;
      salida.push({
        tipo: 'handler-async-sin-catch',
        rel,
        linea: linea(n),
        detalle:
          `${prop} es async y espera algo que puede lanzar, sin try/catch. React no hace ` +
          'nada con la promesa que devuelve un handler: si eso falla, la persona no ve ni ' +
          'un aviso y el error no llega ni a los logs.',
      });
    });
    return salida;
  }

  // Forma 1: fuego y olvido sobre una funcion que puede rechazar.
  recorrerCuerpo(fn, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    const destino = asyncs.get(n.expression.text);
    if (!destino || !puedeRechazar(destino, asyncs)) return;
    if (!promesaTirada(n)) return;
    salida.push({
      tipo: 'fuego-y-olvido',
      rel,
      linea: linea(n),
      detalle:
        `${prop} llama a ${n.expression.text}() sin esperarla ni capturarla, y ` +
        `${n.expression.text} no tiene try/catch propio: si falla, el rechazo se pierde ` +
        'y la pantalla se queda igual. O se le pone try/catch dentro, o se encadena .catch().',
    });
  });
  return salida;
}

// --- Recorrido --------------------------------------------------------------

/** Como en `claves.mjs`: se le pregunta a git en vez de andar el arbol. */
function ficheros() {
  let salida;
  try {
    salida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    throw new AnclaPerdida(
      'No se ha podido preguntar a git que ficheros hay, asi que este vigilante no ' +
        `puede mirar nada -- y pasar en verde sin mirar es peor que fallar. (${e?.message || e})`,
      { fichero: '.git', ancla: 'git ls-files' },
    );
  }
  return salida
    .split('\0')
    .filter((rel) => rel.endsWith('.tsx') && CARPETAS.some((c) => rel.startsWith(c)));
}

async function ejecutar() {
  const base = JSON.parse(leer(BASE));
  const porFichero = {};
  const detalles = [];
  let handlers = 0;

  for (const rel of ficheros()) {
    let texto;
    try {
      const abs = path.join(RAIZ, rel);
      if (statSync(abs).size > 4_000_000) continue;
      texto = readFileSync(abs, 'utf8');
    } catch {
      continue; // borrado a medias: no es cosa de este vigilante
    }

    const r = revisarFuente(rel, texto);
    handlers += r.handlers;
    if (!r.hallazgos.length) continue;

    detalles.push(...r.hallazgos);
    const cuenta = (porFichero[rel] = porFichero[rel] || {});
    for (const h of r.hallazgos) cuenta[h.tipo] = (cuenta[h.tipo] || 0) + 1;
  }

  // ANCLA. Si un dia esto mira cero handlers -- alguien movio las pantallas,
  // cambio la extension, reescribio los componentes -- el vigilante se ha
  // quedado ciego y tiene que enterarse alguien.
  if (handlers === 0) {
    throw new AnclaPerdida(
      'No se ha encontrado NI UN handler de JSX (onClick/onPress/...) en app/ ni en ' +
        'components/. O se ha movido el codigo, o este vigilante ha dejado de entender ' +
        'como se escriben los handlers aqui. En cualquiera de los dos casos lleva un ' +
        'rato sin comprobar nada.',
      { fichero: 'app/', ancla: 'handlers de JSX' },
    );
  }

  return comparar(base, porFichero, detalles);
}

/** El trinquete: solo se grita cuando SUBE, y se avisa de bajar cuando baja. */
export function comparar(base, hoy, detalles = []) {
  const hallazgos = [];
  const ficherosTodos = new Set([...Object.keys(base), ...Object.keys(hoy)]);

  for (const rel of [...ficherosTodos].sort()) {
    for (const tipo of Object.keys(TIPOS)) {
      const antes = Number(base[rel]?.[tipo] ?? 0);
      const ahora = Number(hoy[rel]?.[tipo] ?? 0);
      if (antes === ahora) continue;

      const lineas = detalles
        .filter((d) => d.rel === rel && d.tipo === tipo)
        .map((d) => `${d.rel}:${d.linea} — ${d.detalle}`);

      if (ahora > antes) {
        hallazgos.push(
          hallazgo({
            clave: `errores-tragados/${tipo}:${rel}`,
            nivel: 'aviso',
            ambito: 'errores-tragados',
            titulo: `${rel}: suben los ${TIPOS[tipo]} (${antes} -> ${ahora})`,
            detalle:
              `${lineas.join('\n') || 'sin detalle'}\n\n` +
              'Si es inevitable, sube el numero en ' +
              `${BASE} y explica por que en el commit.`,
            fichero: rel,
            linea: detalles.find((d) => d.rel === rel && d.tipo === tipo)?.linea ?? null,
          }),
        );
      } else {
        hallazgos.push(
          hallazgo({
            clave: `errores-tragados/mejora-${tipo}:${rel}`,
            nivel: 'aviso',
            ambito: 'errores-tragados',
            titulo: `${rel}: bajan los ${TIPOS[tipo]} (${antes} -> ${ahora}). Baja la linea base`,
            detalle:
              `Se ha limpiado deuda. Poner ${ahora === 0 ? 'a 0 (o quitar la entrada)' : ahora} ` +
              `en ${BASE} para que no vuelva a subir.`,
            fichero: BASE,
          }),
        );
      }
    }
  }

  return hallazgos;
}

/** Para congelar la linea base: node scripts/vigilantes/errores-tragados.mjs --aprobar */
export async function medir() {
  const porFichero = {};
  let handlers = 0;
  const detalles = [];
  for (const rel of ficheros()) {
    let texto;
    try {
      texto = readFileSync(path.join(RAIZ, rel), 'utf8');
    } catch {
      continue;
    }
    const r = revisarFuente(rel, texto);
    handlers += r.handlers;
    if (!r.hallazgos.length) continue;
    detalles.push(...r.hallazgos);
    const cuenta = (porFichero[rel] = porFichero[rel] || {});
    for (const h of r.hallazgos) cuenta[h.tipo] = (cuenta[h.tipo] || 0) + 1;
  }
  return { porFichero, handlers, detalles };
}

export default {
  nombre: 'errores-tragados',
  ambito: 'errores-tragados',
  descripcion:
    'Ningun boton nuevo se traga el error: fuego-y-olvido, handlers async sin ' +
    'try/catch y consultas a supabase cuyo error no mira nadie',
  ejecutar,
};

// Congelar la linea base es un acto consciente y su diff se ve en el repo:
//   node scripts/vigilantes/errores-tragados.mjs --aprobar
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { porFichero, handlers, detalles } = await medir();
  if (process.argv.includes('--aprobar')) {
    writeFileSync(
      path.join(RAIZ, BASE),
      `${JSON.stringify(ordenar(porFichero), null, 2)}\n`,
      'utf8',
    );
    console.log(
      `[errores-tragados] linea base congelada: ${detalles.length} en ` +
        `${Object.keys(porFichero).length} ficheros (${handlers} handlers mirados) -> ${BASE}`,
    );
  } else {
    for (const d of detalles) console.log(`${d.tipo.padEnd(24)} ${d.rel}:${d.linea}`);
    console.log(
      `\n[errores-tragados] ${detalles.length} sitios en ` +
        `${Object.keys(porFichero).length} ficheros, ${handlers} handlers mirados.`,
    );
  }
}

/** Claves ordenadas: si no, el diff de la linea base es ilegible. */
function ordenar(o) {
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, Object.fromEntries(Object.keys(o[k]).sort().map((t) => [t, o[k][t]]))]),
  );
}
