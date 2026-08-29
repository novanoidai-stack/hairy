// LAS DOS TABLAS DE HORARIO CUENTAN LOS DIAS AL REVES.
//
//   negocio_horarios.dia_semana      ->  0 = LUNES   ... 6 = domingo
//   horarios_profesional.dia_semana  ->  0 = DOMINGO ... 6 = sabado
//
// La segunda es la de Postgres (`extract(dow from ...)`, igual que
// `Date.getDay()`), y TODOS sus lectores comparan justo contra eso. La primera
// es la de Ajustes, donde la semana empieza en lunes porque asi la lee una
// persona; la agenda la convierte con `(getDay()+6)%7`.
//
// Nada en el esquema impide confundirlas: las dos son un smallint de 0 a 6.
// Cuando se confunden no hay error, ni tipo, ni test que salte -- solo un salon
// con el horario corrido un dia. Ya paso dos veces:
//
//   - La demo salia con el LUNES (su dia mas cargado) marcado "Salon cerrado" y
//     la rejilla rayada con citas encima, y el DOMINGO abierto de 9:00 a 14:30.
//   - scripts/seed-demo-salon.sql copiaba `nh.dia_semana` a horarios_profesional
//     sin convertir, asi que la disponibilidad de cada profesional en /r/demo
//     -- el escaparate -- iba corrida un dia entera.
//
// La regla que vigila esto: quien escriba dia_semana declara su convenio, y
// quien copie de una tabla a la otra convierte. La conversion correcta es
// (dia + 1) % 7 de negocio_horarios a horarios_profesional, y (dia + 6) % 7 al
// reves.

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

// Solo se miran los sitios donde se ESCRIBE de verdad. archive/ es historia
// aplicada; docs/ y ships/ son prosa.
const DONDE = ['scripts', 'supabase/migrations'];

const TABLA_LUNES = 'negocio_horarios';
const TABLA_DOMINGO = 'horarios_profesional';

// Un comentario que diga en que convenio se escribe. Vale cualquier forma de
// decirlo mientras nombre el dia que corresponde al cero.
const DECLARA_CONVENIO = /0\s*=\s*(lunes|domingo)|dow|extract\s*\(\s*dow/i;

// --- deteccion ---------------------------------------------------------------

// Copia sin convertir: se inserta en una tabla leyendo el dia_semana de la otra
// y entre medias no aparece ningun % 7.
export function copiaSinConvertir(sql) {
  const fuera = [];
  // insert into horarios_profesional (... dia_semana ...) select ... nh.dia_semana
  const re = new RegExp(
    `insert\\s+into\\s+(?:public\\.)?(${TABLA_DOMINGO}|${TABLA_LUNES})\\b([\\s\\S]*?)(?=;)`,
    'gi',
  );
  for (const m of sql.matchAll(re)) {
    const destino = m[1].toLowerCase();
    const cuerpo = m[2];
    const origen = destino === TABLA_DOMINGO ? TABLA_LUNES : TABLA_DOMINGO;

    // Solo interesa si el SELECT lee de la OTRA tabla.
    if (!new RegExp(`\\b${origen}\\b`, 'i').test(cuerpo)) continue;
    if (!/dia_semana/i.test(cuerpo)) continue;
    // Convertir es hacer aritmetica modulo 7 en alguna parte.
    if (/%\s*7/.test(cuerpo)) continue;

    fuera.push({
      destino,
      origen,
      linea: sql.slice(0, m.index).split('\n').length,
    });
  }
  return fuera;
}

function ficherosSql(dir, acc = []) {
  let entradas;
  try {
    entradas = readdirSync(path.join(RAIZ, dir));
  } catch {
    return acc;
  }
  for (const e of entradas) {
    const rel = path.posix.join(dir, e);
    if (statSync(path.join(RAIZ, rel)).isDirectory()) ficherosSql(rel, acc);
    else if (e.endsWith('.sql')) acc.push(rel);
  }
  return acc;
}

async function ejecutar() {
  const ficheros = DONDE.flatMap((d) => ficherosSql(d));
  if (ficheros.length === 0) {
    throw new AnclaPerdida(
      `No hay ningun .sql en ${DONDE.join(' ni ')}. El vigilante esta ciego.`,
      { fichero: DONDE[0], ancla: '*.sql' },
    );
  }

  const hallazgos = [];
  // El sitio donde nace la confusion es un fichero que toca LAS DOS tablas: ahi
  // es donde hay que convertir y donde se olvida. Si no queda ninguno, este
  // vigilante no esta mirando nada y mas vale enterarse.
  let tocanLasDos = 0;

  for (const rel of ficheros) {
    const sql = leer(rel);
    if (new RegExp(`\\b${TABLA_LUNES}\\b`, 'i').test(sql) &&
        new RegExp(`\\b${TABLA_DOMINGO}\\b`, 'i').test(sql)) {
      tocanLasDos += 1;
    }

    // 1. Copiar de una tabla a la otra sin convertir el dia.
    for (const c of copiaSinConvertir(sql)) {
      const haciaDomingo = c.destino === TABLA_DOMINGO;
      hallazgos.push(
        hallazgo({
          clave: `horarios/copia-sin-convertir-${path.posix.basename(rel)}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `${rel} copia dia_semana de ${c.origen} a ${c.destino} sin convertir`,
          detalle:
            `${TABLA_LUNES}.dia_semana usa 0 = LUNES y ${TABLA_DOMINGO}.dia_semana usa ` +
            '0 = DOMINGO (el extract(dow) de Postgres, contra el que comparan todos sus ' +
            'lectores). Copiar el numero tal cual corre el horario un dia entero.\n\n' +
            'No salta ningun error: las dos columnas son un smallint de 0 a 6. Lo unico que ' +
            'pasa es que el salon abre el dia que no es.\n\nConversion correcta:\n\n' +
            (haciaDomingo
              ? '  ((dia_semana + 1) % 7)::smallint   -- de negocio_horarios a horarios_profesional'
              : '  ((dia_semana + 6) % 7)::smallint   -- de horarios_profesional a negocio_horarios'),
          fichero: rel,
          linea: c.linea,
        }),
      );
    }

    // 2. Escribir dia_semana en negocio_horarios sin decir en que convenio.
    //    Es la tabla rara (0 = lunes) y la que se sembro mal dos veces.
    const escribe = new RegExp(
      `insert\\s+into\\s+(?:public\\.)?${TABLA_LUNES}\\b[\\s\\S]{0,400}?dia_semana`,
      'i',
    );
    const m = escribe.exec(sql);
    if (!m) continue;
    if (DECLARA_CONVENIO.test(sql)) continue;

    hallazgos.push(
      hallazgo({
        clave: `horarios/convenio-sin-declarar-${path.posix.basename(rel)}`,
        nivel: 'aviso',
        ambito: 'seguridad',
        titulo: `${rel} escribe ${TABLA_LUNES}.dia_semana y no dice en que convenio`,
        detalle:
          `${TABLA_LUNES} cuenta 0 = LUNES, al reves que ${TABLA_DOMINGO} (0 = domingo) y al ` +
          'reves que Date.getDay(). Quien lo escriba a ciegas acierta la mitad de las veces.\n\n' +
          'Basta un comentario encima del insert que lo diga ("0 = lunes"), para que el ' +
          'siguiente que lo lea no tenga que deducirlo. Como saber cual es el bueno sin ' +
          'fiarse de nadie: un salon real que cierra lunes y domingo y abre el sabado por la ' +
          'mañana solo tiene sentido leido 0 = LUNES.',
        fichero: rel,
        linea: sql.slice(0, m.index).split('\n').length,
      }),
    );
  }

  if (tocanLasDos === 0) {
    throw new AnclaPerdida(
      `Ningun .sql de ${DONDE.join(' ni ')} usa ${TABLA_LUNES} y ${TABLA_DOMINGO} a la vez. ` +
        'Habia al menos scripts/seed-demo-salon.sql, que deriva el horario de cada profesional ' +
        'del horario del salon. O se han movido los scripts de siembra, o este vigilante se ha ' +
        'quedado sin nada que mirar y hay que replantearlo.',
      { fichero: DONDE[0], ancla: `${TABLA_LUNES} + ${TABLA_DOMINGO}` },
    );
  }

  return hallazgos;
}

export default {
  nombre: 'horarios-convenio',
  ambito: 'seguridad',
  descripcion: 'Nadie confunde el 0 = lunes de negocio_horarios con el 0 = domingo del otro',
  ejecutar,
};
