// Vigilante de Planta: Meta-Contrato
//
// Audita que todos los módulos vigilantes en scripts/vigilantes/ cumplan el contrato
// estricto del sistema:
// 1. Exportan por defecto { nombre, ambito, descripcion, ejecutar }
// 2. Ningún vigilante usa `process.exit()` directamente (salvo el runner index.mjs)
// 3. Todo vigilante operativo tiene su correspondiente archivo *.test.mjs
// 4. Utiliza la clase `AnclaPerdida` para fallos de regex en vez de silenciar
// 5. Los nombres son únicos y los ámbitos están dentro del catálogo permitido

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo, AnclaPerdida, NO_SON_VIGILANTES, codigoEjecutable } from './nucleo.mjs';

const DIR = 'scripts/vigilantes';

// La lista de exclusion vive en nucleo.mjs (unica) desde el 4 sep 2026. Aqui
// habia una copia a la que le faltaban cuatro nombres, y esa copia mataba al
// runner entero: el porque, con la forense, esta en nucleo.mjs.
//
// EL AMBITO NO TIENE CATALOGO CERRADO, Y ESTE VIGILANTE DECIA QUE SI.
// Habia aqui un AMBITOS_VALIDOS con nueve valores que ningun otro sitio del
// sistema respalda: `nucleo.mjs` (el contrato) valida `nivel` pero NO `ambito`,
// `enviar.mjs` solo exige que no este vacio, y `panel-ambitos.mjs` trata el
// catalogo como ABIERTO a proposito -- su trabajo entero es descubrir los
// ambitos que emiten los productores y comprobar que el panel los conoce. Con
// esa lista cerrada, 13 de los 32 vigilantes eran "bloqueante" por usar ambitos
// perfectamente legitimos (`cuentas`, `precios`, `vigilancia`, `coherencia`...),
// todos ellos ya reconocidos por el panel. No eran 13 fallos: era una
// comprobacion escrita contra una regla que no existe.
//
// Asi que aqui se comprueba el contrato REAL --que el ambito sea una cadena no
// vacia-- y quien manda en el catalogo sigue siendo panel-ambitos.mjs. Anadir la
// cuarta copia de esa lista habria sido repetir la enfermedad que acabamos de
// curar dos lineas mas arriba.

// Vigilantes que hoy no tienen su *.test.mjs. Es deuda HEREDADA y nace congelada
// en aviso: la doctrina del repo (decision 10) es que el trinquete solo gire
// hacia abajo, porque una CI en rojo un mes acaba con alguien quitando el
// vigilante. Un fichero NUEVO sin test si es bloqueante.
//
// Para bajar el contador: escribe el test y quita el nombre de aqui. Nunca al
// reves.
const RUTA_BASE_SIN_TEST = 'scripts/vigilantes/meta-contrato-baseline.json';


/**
 * Lee la linea base de vigilantes sin test. No cae a una lista vacia si falta el
 * fichero: una linea base ausente convertiria toda la deuda heredada en
 * bloqueante de golpe, y una que no parsea dejaria pasar deuda nueva. Las dos
 * cosas se dicen en voz alta.
 * @returns {Set<string>}
 */
function leerBaseSinTest() {
  const abs = path.join(RAIZ, RUTA_BASE_SIN_TEST);
  if (!existsSync(abs)) {
    throw new AnclaPerdida(
      `Falta ${RUTA_BASE_SIN_TEST}, la linea base de vigilantes sin test. Esta versionada, ` +
        'asi que no existe el caso legitimo de "aqui no aplica": o alguien la ha borrado o ' +
        'el fichero ha cambiado de sitio. Sin ella este vigilante no sabe distinguir la deuda ' +
        'heredada de la nueva.',
      { fichero: RUTA_BASE_SIN_TEST, ancla: 'fichero' },
    );
  }
  let datos;
  try {
    datos = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new AnclaPerdida(
      `${RUTA_BASE_SIN_TEST} no es JSON valido: ${e?.message || e}.`,
      { fichero: RUTA_BASE_SIN_TEST, ancla: 'json' },
    );
  }
  if (!Array.isArray(datos?.vigilantes_sin_test)) {
    throw new AnclaPerdida(
      `${RUTA_BASE_SIN_TEST} no trae un array en "vigilantes_sin_test". Es el campo exacto ` +
        'que este vigilante mide.',
      { fichero: RUTA_BASE_SIN_TEST, ancla: 'vigilantes_sin_test' },
    );
  }
  return new Set(datos.vigilantes_sin_test);
}

/**
 * Revisa el código y exportaciones de los vigilantes.
 * @param {string[]} listaFicheros
 * @param {Set<string>} baseSinTest linea base inyectable (para los tests)
 * @returns {Promise<import('./nucleo.mjs').Hallazgo[]>}
 */
export async function auditarContratosVigilantes(listaFicheros = null, baseSinTest = null) {
  const dirAbs = path.join(RAIZ, DIR);
  const ficheros = listaFicheros || readdirSync(dirAbs);
  const sinTestConocidos = baseSinTest ?? leerBaseSinTest();
  const modulosMjs = ficheros.filter(
    (f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !NO_SON_VIGILANTES.has(f),
  );

  const hallazgos = [];
  const nombresVistos = new Map();

  for (const f of modulosMjs) {
    const rel = path.posix.join(DIR, f);
    const abs = path.join(RAIZ, rel);
    let codigo;
    try {
      codigo = readFileSync(abs, 'utf8');
    } catch (e) {
      // Entre el readdir y el read pueden pasar milisegundos, y en esos
      // milisegundos otro test del directorio puede haber borrado su fixture.
      // Un fichero que YA NO EXISTE no tiene contrato que auditar, asi que
      // seguir es correcto -- pero solo por eso: cualquier otro error de lectura
      // (permisos, disco) es un vigilante que no ha podido mirar y se dice.
      if (e?.code === 'ENOENT') continue;
      throw new AnclaPerdida(
        `No se ha podido leer ${rel}: ${e?.message || e}. Sin leerlo no se puede auditar su ` +
          'contrato, y saltarselo en silencio seria la clase de verde falso que este ' +
          'vigilante existe para impedir.',
        { fichero: rel, ancla: 'lectura' },
      );
    }

    // 1. Prohibido process.exit() en módulos individuales (evita cuelgues libuv en Windows).
    //    Sobre el codigo EJECUTABLE: una mencion en un comentario o dentro del
    //    texto de un hallazgo no mata a nadie.
    const usaExit = /\bprocess\s*\.\s*exit\s*\(/.test(codigoEjecutable(codigo));
    if (usaExit) {
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/process-exit-${f}`,
          nivel: 'bloqueante',
          ambito: 'meta',
          titulo: `${rel} usa process.exit() directamente`,
          detalle:
            'Los módulos vigilantes deben devolver hallazgos o lanzar AnclaPerdida. ' +
            'Matar el proceso con process.exit() dentro de un módulo aborta la suite y causa ' +
            'crashes de libuv en sockets de red en Windows. El runner index.mjs es el único que gestiona la salida.',
          fichero: rel,
        }),
      );
    }

    // 2. Debe existir archivo de test unitario
    const nombreBase = f.replace(/\.mjs$/, '');
    const testDirecto = `${nombreBase}.test.mjs`;
    const tieneTest = existsSync(path.join(dirAbs, testDirecto));

    if (!tieneTest) {
      const heredado = sinTestConocidos.has(f);
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/sin-test-${f}`,
          nivel: heredado ? 'aviso' : 'bloqueante',
          ambito: 'meta',
          titulo: `El vigilante ${rel} no tiene archivo de test ${testDirecto}`,
          detalle: heredado
            ? 'Regla de Meta-Vigilancia: cada vigilante debe llevar su suite de tests. Este ' +
              `consta en ${RUTA_BASE_SIN_TEST} como deuda heredada, asi que avisa en vez de ` +
              'bloquear. Para bajar el contador: escribe el test y quita el nombre de la lista.'
            : 'Regla de Meta-Vigilancia: cada vigilante debe estar acompañado de su suite ' +
              'de tests unitarios (*.test.mjs) para verificar su contrato y que no esté ciego. ' +
              'Este es NUEVO: no estaba en la linea base, asi que bloquea.',
          fichero: rel,
        }),
      );
    }

    // 3. Inspección del contrato exportado.
    //
    // Importar es EJECUTAR el modulo. Un fichero con process.exit() en el cuerpo
    // se lleva por delante el proceso entero al importarlo -- runner, suite de
    // tests y todo lo demas, saliendo con SU codigo, no con el nuestro. Ya paso:
    // ver la forense en nucleo.mjs. Aqui ya tenemos su hallazgo bloqueante por
    // texto, asi que no hace falta importarlo para saber que esta mal.
    if (usaExit) continue;

    try {
      const mod = (await import(`file://${abs.replace(/\\/g, '/')}`)).default;
      if (!mod || typeof mod !== 'object') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/export-invalido-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no tiene export default con objeto válido`,
            detalle: 'Un vigilante debe exportar por defecto un objeto con { nombre, ambito, descripcion, ejecutar }',
            fichero: rel,
          }),
        );
        continue;
      }

      if (!mod.nombre || typeof mod.nombre !== 'string') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/sin-nombre-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no define 'nombre' (string no vacío)`,
            detalle: 'El campo nombre identifica unívocamente al vigilante en CLI y panel.',
            fichero: rel,
          }),
        );
      } else {
        if (nombresVistos.has(mod.nombre)) {
          hallazgos.push(
            hallazgo({
              clave: `meta-contrato/nombre-duplicado-${mod.nombre}`,
              nivel: 'bloqueante',
              ambito: 'meta',
              titulo: `Nombre de vigilante duplicado "${mod.nombre}" en ${f} y ${nombresVistos.get(mod.nombre)}`,
              detalle: 'Cada vigilante debe tener un nombre único para evitar colisiones en reportes y CLI (--solo).',
              fichero: rel,
            }),
          );
        } else {
          nombresVistos.set(mod.nombre, f);
        }
      }

      // El contrato real: `ambito` no puede faltar ni venir vacio, porque
      // enviar.mjs se niega a publicar un informe con hallazgos sin el y el
      // panel los agrupa por ese campo. QUE valores existen no se decide aqui:
      // el catalogo es abierto y quien vigila que el panel los conozca todos es
      // panel-ambitos.mjs. Ver el comentario de la cabecera.
      if (typeof mod.ambito !== 'string' || !mod.ambito.trim()) {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/ambito-invalido-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no declara 'ambito' (cadena no vacía), tiene ${JSON.stringify(mod.ambito)}`,
            detalle:
              'Todo hallazgo viaja con el ambito de su vigilante. Sin el, enviar.mjs lo ' +
              'considera fuera de contrato y NO publica el informe: el hallazgo se pierde ' +
              'entre el runner y la pestana Salud. Si el ambito es nuevo, ademas hay que ' +
              'darlo de alta en el desplegable de web/admin.html -- eso lo vigila panel-ambitos.',
            fichero: rel,
          }),
        );
      }

      if (typeof mod.ejecutar !== 'function') {
        hallazgos.push(
          hallazgo({
            clave: `meta-contrato/sin-ejecutar-${f}`,
            nivel: 'bloqueante',
            ambito: 'meta',
            titulo: `${rel} no tiene función ejecutar()`,
            detalle: 'La función ejecutar() debe devolver una Promise con el array de hallazgos.',
            fichero: rel,
          }),
        );
      }
    } catch (err) {
      hallazgos.push(
        hallazgo({
          clave: `meta-contrato/error-import-${f}`,
          nivel: 'bloqueante',
          ambito: 'meta',
          titulo: `Error al importar dinámicamente ${rel}`,
          detalle: String(err?.message || err),
          fichero: rel,
        }),
      );
    }
  }

  return hallazgos;
}

async function ejecutar() {
  return auditarContratosVigilantes();
}

export default {
  nombre: 'meta-contrato',
  ambito: 'meta',
  descripcion:
    'Vigilante de Planta: audita que todos los vigilantes cumplan el contrato estándar, no usen process.exit y tengan tests',
  ejecutar,
};
