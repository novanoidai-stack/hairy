// knip encuentra ficheros, exports y tipos que ya no importa nadie. Hoy hay
// deuda heredada de sobra (66 exports muertos), asi que esto NO bloquea: fija
// una linea base y solo avisa cuando la deuda CRECE. Si se pusiera a bloquear el
// primer dia, la CI nace en rojo y alguien acaba quitando el vigilante.
//
// Cuando se limpia algo, el vigilante avisa de que BAJE la linea base: asi el
// trinquete solo gira en un sentido.
//
// Ojo: knip termina con codigo 1 cuando encuentra algo. Eso es normal, no un
// fallo de ejecucion; lo que importa es el JSON de stdout.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { RAIZ, leer, hallazgo } from './nucleo.mjs';

const ejecutarOrden = promisify(exec);

const CATEGORIAS = {
  files: 'ficheros que no importa nadie',
  exports: 'exports sin uso',
  types: 'tipos exportados sin uso',
  duplicates: 'exports duplicados',
  unlisted: 'dependencias usadas y no declaradas',
  dependencies: 'dependencias declaradas y sin usar',
  devDependencies: 'devDependencies sin usar',
  binaries: 'binarios sin declarar',
};

async function contar() {
  let salida;
  try {
    const r = await ejecutarOrden('npx knip --reporter json', {
      cwd: RAIZ,
      maxBuffer: 64 * 1024 * 1024,
    });
    salida = r.stdout;
  } catch (e) {
    // knip sale con 1 cuando hay hallazgos: el stdout sigue siendo JSON valido.
    if (!e || !e.stdout) throw e;
    salida = e.stdout;
  }

  const datos = JSON.parse(salida);
  const total = {};
  for (const c of Object.keys(CATEGORIAS)) total[c] = 0;
  for (const it of datos.issues || []) {
    for (const c of Object.keys(CATEGORIAS)) total[c] += (it[c] || []).length;
  }
  return total;
}

async function ejecutar() {
  const base = JSON.parse(leer('scripts/vigilantes/knip-baseline.json'));
  const hoy = await contar();
  const hallazgos = [];

  for (const [cat, etiqueta] of Object.entries(CATEGORIAS)) {
    const antes = Number(base[cat] ?? 0);
    const ahora = hoy[cat];

    if (ahora > antes) {
      hallazgos.push(
        hallazgo({
          clave: `codigo-muerto/${cat}`,
          nivel: 'aviso',
          ambito: 'codigo-muerto',
          titulo: `Suben los ${etiqueta}: ${antes} -> ${ahora}`,
          detalle:
            `Este cambio deja ${ahora - antes} mas. Verlos con: npx knip. Si son ` +
            'inevitables, sube el numero en scripts/vigilantes/knip-baseline.json y ' +
            'explica por que en el commit.',
          fichero: 'scripts/vigilantes/knip-baseline.json',
        }),
      );
    } else if (ahora < antes) {
      hallazgos.push(
        hallazgo({
          clave: `codigo-muerto/mejora-${cat}`,
          nivel: 'aviso',
          ambito: 'codigo-muerto',
          titulo: `Bajan los ${etiqueta}: ${antes} -> ${ahora}. Baja la linea base`,
          detalle:
            `Se ha limpiado deuda. Poner "${cat}": ${ahora} en ` +
            'scripts/vigilantes/knip-baseline.json para que no vuelva a subir.',
          fichero: 'scripts/vigilantes/knip-baseline.json',
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'codigo-muerto',
  ambito: 'codigo-muerto',
  descripcion: 'La deuda de codigo muerto no crece (linea base congelada)',
  lento: true,
  ejecutar,
  contar,
};
