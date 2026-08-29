// Todo hallazgo aterriza en la pestana Salud del panel de staff (regla 7), y el
// panel agrupa y filtra por AMBITO. Ese ambito lo eligen los productores --los
// vigilantes de scripts/ y las funciones vigilancia_bd*() de la BD-- pero las
// etiquetas y el desplegable viven en web/admin.html, escritos a mano.
//
// O sea: un invariante repartido, que es justo la fabrica de regresiones que
// estas herramientas existen para cazar. Ya pico una vez: la familia 2 estreno
// el ambito "errores-tragados" y el panel no se entero, asi que sus hallazgos
// salian con la etiqueta en crudo y no se podian filtrar.
//
// No rompe nada visible -- por eso es aviso y no bloqueante: bajo "Todos los
// ambitos" el hallazgo se sigue viendo. Solo hace el panel un poco peor cada
// vez, y nadie se da cuenta. Eso es exactamente lo que hay que automatizar.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, capturar, hallazgo, AnclaPerdida } from './nucleo.mjs';

const PANEL = 'web/admin.html';
const DIR_VIGILANTES = 'scripts/vigilantes';
const DIR_MIGRACIONES = 'supabase/migrations';

// El panel las trae de fabrica y no las emite ningun productor: `otros` es el
// valor por defecto que pone registrar_vigilancia cuando un hallazgo llega sin
// ambito, y la opcion vacia es "Todos".
const EXENTAS_DEL_PANEL = new Set(['otros', '']);

// Ambitos que aparecen en el codigo como dato de prueba, no como emision real.
const FICHEROS_IGNORADOS = /\.test\.mjs$/;

// --- Quien emite ambitos -----------------------------------------------------

// Capa 1: los vigilantes estaticos y los traductores de medidas (rendimiento,
// silencios, smoke). Todos construyen sus hallazgos con `ambito: '...'`.
function ambitosDeLosVigilantes() {
  const dir = path.join(RAIZ, DIR_VIGILANTES);
  const encontrados = new Map(); // ambito -> fichero que lo emite

  for (const fichero of readdirSync(dir)) {
    if (!fichero.endsWith('.mjs') || FICHEROS_IGNORADOS.test(fichero)) continue;
    if (fichero === 'panel-ambitos.mjs' || fichero === 'nucleo.mjs') continue;

    const texto = leer(path.posix.join(DIR_VIGILANTES, fichero));
    for (const m of texto.matchAll(/ambito:\s*'([a-z][a-z-]*)'/g)) {
      if (!encontrados.has(m[1])) encontrados.set(m[1], `${DIR_VIGILANTES}/${fichero}`);
    }
  }
  return encontrados;
}

// Capa 2: las funciones vigilancia_bd*(). Devuelven filas
// (clave, nivel, ambito, titulo, detalle), asi que el ambito es SIEMPRE el
// literal que sigue al de nivel. Anclar al nivel y no a la posicion es lo que
// hace que esto siga funcionando cuando se anadan comprobaciones nuevas.
function ambitosDeLaBaseDeDatos() {
  const dir = path.join(RAIZ, DIR_MIGRACIONES);
  const encontrados = new Map();

  const sqls = readdirSync(dir).filter((f) => f.endsWith('.sql') && f.includes('vigilancia'));
  if (sqls.length === 0) {
    // Sin el SQL delante no podemos saber que ambitos emite la BD: ciego.
    throw new AnclaPerdida(
      `No hay ninguna migracion *vigilancia*.sql en ${DIR_MIGRACIONES}`,
      { fichero: DIR_MIGRACIONES, ancla: 'migracion vigilancia' },
    );
  }

  for (const fichero of sqls) {
    const texto = leer(path.posix.join(DIR_MIGRACIONES, fichero));
    for (const m of texto.matchAll(/'(?:bloqueante|aviso)',\s*\n\s*'([a-z][a-z-]*)'/g)) {
      if (!encontrados.has(m[1])) encontrados.set(m[1], `${DIR_MIGRACIONES}/${fichero}`);
    }
  }
  return encontrados;
}

// --- Que conoce el panel -----------------------------------------------------

export function ambitosDelPanel(textoPanel) {
  // 1. El diccionario de etiquetas: sin entrada, el hallazgo sale con el slug crudo.
  const { valor: cuerpoEtiquetas, linea: lineaEtiquetas } = capturar(
    textoPanel,
    /var AMBITO_SAL_LABEL = \{([\s\S]*?)\};/,
    { fichero: PANEL, ancla: 'AMBITO_SAL_LABEL' },
  );
  const etiquetas = new Set(
    [...cuerpoEtiquetas.matchAll(/'?([a-z][a-z-]*)'?\s*:/g)].map((m) => m[1]),
  );

  // 2. El desplegable: sin opcion, ese ambito no se puede filtrar.
  const { valor: cuerpoSelect, linea: lineaSelect } = capturar(
    textoPanel,
    /<select[^>]*id="fAmbitoSal"[^>]*>([\s\S]*?)<\/select>/,
    { fichero: PANEL, ancla: 'select#fAmbitoSal' },
  );
  const opciones = new Set(
    [...cuerpoSelect.matchAll(/<option value="([a-z-]*)"/g)].map((m) => m[1]),
  );

  return { etiquetas, opciones, lineaEtiquetas, lineaSelect };
}

async function ejecutar() {
  const textoPanel = leer(PANEL);
  const { etiquetas, opciones, lineaEtiquetas, lineaSelect } = ambitosDelPanel(textoPanel);

  const emitidos = new Map([...ambitosDeLosVigilantes(), ...ambitosDeLaBaseDeDatos()]);
  const hallazgos = [];

  for (const [ambito, fichero] of emitidos) {
    const faltaEtiqueta = !etiquetas.has(ambito);
    const faltaOpcion = !opciones.has(ambito);
    if (!faltaEtiqueta && !faltaOpcion) continue;

    const donde = [
      faltaEtiqueta ? `AMBITO_SAL_LABEL (linea ${lineaEtiquetas})` : null,
      faltaOpcion ? `el desplegable #fAmbitoSal (linea ${lineaSelect})` : null,
    ]
      .filter(Boolean)
      .join(' y ');

    hallazgos.push(
      hallazgo({
        clave: `panel/ambito-desconocido-${ambito}`,
        nivel: 'aviso',
        ambito: 'pantallas',
        titulo: `El panel de Salud no conoce el ambito "${ambito}"`,
        detalle:
          `${fichero} emite hallazgos con ambito "${ambito}" y ${PANEL} no lo declara en ` +
          `${donde}.\n\n` +
          (faltaEtiqueta ? '· Sin etiqueta, el hallazgo se pinta con el slug en crudo.\n' : '') +
          (faltaOpcion ? '· Sin opcion, ese ambito no se puede filtrar en el panel.\n' : '') +
          '\nAnadirlo son dos lineas en admin.html. Los hallazgos se ven igual bajo ' +
          '"Todos los ambitos", por eso esto es un aviso y no tumba la CI.',
        fichero: PANEL,
        linea: faltaEtiqueta ? lineaEtiquetas : lineaSelect,
      }),
    );
  }

  // Al reves: una opcion que ya no emite nadie es un filtro que siempre da vacio.
  for (const ambito of opciones) {
    if (EXENTAS_DEL_PANEL.has(ambito) || emitidos.has(ambito)) continue;
    hallazgos.push(
      hallazgo({
        clave: `panel/ambito-muerto-${ambito}`,
        nivel: 'aviso',
        ambito: 'pantallas',
        titulo: `El panel filtra por "${ambito}" y ya no lo emite nadie`,
        detalle:
          `Ningun vigilante de ${DIR_VIGILANTES} ni ninguna funcion vigilancia_bd*() produce ` +
          `hallazgos con ambito "${ambito}". Ese filtro siempre saldra vacio: o falta el ` +
          'productor, o sobra la opcion.',
        fichero: PANEL,
        linea: lineaSelect,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'panel-ambitos',
  ambito: 'pantallas',
  descripcion: 'El panel de Salud conoce todos los ambitos que emiten los vigilantes',
  ejecutar,
};
