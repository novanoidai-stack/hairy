// Analisis ESTATICO de cadenas de triggers en las migraciones SQL.
//
// POR QUE EXISTE (30 ago 2026)
// Un AFTER INSERT en citas disparaba un trigger que hacia UPDATE en citas,
// que disparaba otro trigger que reescribia los datos del primero. Resultado:
// el backfill de 2.011 citas destruyo todos los reposos y las fases.
//
// Lo que vigila:
// 1. Triggers que modifican SU PROPIA tabla con INSERT/UPDATE/DELETE (aviso:
//    hay casos legitimos con WHEN que corta el bucle, pero es deuda que ver)
// 2. Pares INSERT<->UPDATE en la misma tabla que se reescriben mutuamente
//    (bloqueante: es exactamente la forma del desastre del backfill)
//
// TRAMPA DE PARSEO que hay que conocer: las migraciones son HISTORIA, no
// estado. La version naive (concatenar todos los .sql y extraer triggers)
// cuenta triggers que un DROP posterior borro y mezcla definiciones viejas con
// nuevas. Aqui se leen en orden y gana la ULTIMA definicion; los DROP TRIGGER
// sacan el trigger del inventario. Lo que queda al final es lo que hay (o
// habria) en la base.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, hallazgo } from './nucleo.mjs';

const DIR_MIGRACIONES = 'supabase/migrations';

const RE_TRIGGER =
  /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)\s+[\s\S]*?\bon\s+(?:public\.)?(\w+)\s+[\s\S]*?execute\s+(?:function|procedure)\s+(?:public\.)?(\w+)/gi;
const RE_DROP_TRIGGER =
  /drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+(?:public\.)?(\w+)/gi;
// El cuerpo va hasta el cierre de $$ ... la funcion siguiente abre con su
// propio create function, asi que el limite no-greedy basta para PL/pgSQL
// tipico sin $$ anidados.
const RE_FUNCION_TRIGGER =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([^)]*\)\s*returns\s+trigger\s[\s\S]*?as\s*\$\$\s*([\s\S]*?)\s*\$\$/gi;

/**
 * Analisis global sobre el inventario final de triggers y funciones.
 * Exportada para testing.
 */
export function analizarInventario(inventario, origen = 'supabase/migrations') {
  const hallazgos = [];

  for (const trig of inventario.triggers.values()) {
    const body = inventario.funciones.get(trig.funcion);
    if (!body) continue;

    // ---- 1. Auto-referencial: modifica su propia tabla ----
    const reModifSelf = new RegExp(
      `(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${trig.tabla}\\b`,
      'i',
    );
    if (reModifSelf.test(body)) {
      hallazgos.push(
        hallazgo({
          clave: `trigger-cadenas/auto-ref-${trig.nombre}`,
          nivel: 'aviso',
          ambito: 'base-de-datos',
          titulo: `Trigger "${trig.nombre}" modifica su propia tabla "${trig.tabla}"`,
          detalle:
            `${trig.fichero}: el trigger ${trig.nombre} en ${trig.tabla} (funcion ` +
            `${trig.funcion}) hace INSERT/UPDATE/DELETE sobre ${trig.tabla}. Un trigger ` +
            'que se dispara a si mismo solo es seguro si hay un WHEN o una guarda que ' +
            'corte la recursion; durante backfills y operaciones masivas esa guarda es lo ' +
            'primero que se olvida. Revisar que la recursion este cortada de verdad.',
          fichero: trig.fichero,
        }),
      );
    }
  }

  // ---- 2. Cascada mutua: un AFTER INSERT y un AFTER UPDATE en la misma tabla
  // cuyas funciones los dos reescriben esa tabla ----
  const porTabla = new Map();
  for (const trig of inventario.triggers.values()) {
    if (!porTabla.has(trig.tabla)) porTabla.set(trig.tabla, []);
    porTabla.get(trig.tabla).push(trig);
  }

  const reModifica = (tabla, body) =>
    new RegExp(`(?:update|insert\\s+into)\\s+(?:public\\.)?${tabla}\\b`, 'i').test(body);

  for (const [tabla, trigs] of porTabla) {
    const inserts = trigs.filter((t) => t.trasInsert && reModifica(tabla, inventario.funciones.get(t.funcion) || ''));
    const updates = trigs.filter((t) => t.trasUpdate && reModifica(tabla, inventario.funciones.get(t.funcion) || ''));

    for (const ins of inserts) {
      for (const upd of updates) {
        if (ins.nombre === upd.nombre) continue;
        // Si uno de los dos corta la recursion de verdad, no es cascada
        // abierta. "Cortar de verdad" es comparar con el estado previo
        // (IS DISTINCT FROM) o salir condicionado a lo que ya hay (IF EXISTS);
        // un `return null` final lo llevan todas las funciones trigger y no
        // corta nada.
        const bodyIns = inventario.funciones.get(ins.funcion) || '';
        const bodyUpd = inventario.funciones.get(upd.funcion) || '';
        const cortaIns = /distinct from|if exists/i.test(bodyIns);
        const cortaUpd = /distinct from|if exists/i.test(bodyUpd);
        hallazgos.push(
          hallazgo({
            clave: `trigger-cadenas/cascada-mutua-${tabla}-${ins.nombre}-${upd.nombre}`,
            nivel: cortaIns && cortaUpd ? 'aviso' : 'bloqueante',
            ambito: 'base-de-datos',
            titulo: `Cascada mutua en "${tabla}": ${ins.nombre} ↔ ${upd.nombre}`,
            detalle:
              `${ins.fichero} / ${upd.fichero}: ${ins.nombre} (AFTER INSERT) y ` +
              `${upd.nombre} (AFTER UPDATE) en ${tabla} reescriben ambos ${tabla}. El ` +
              'INSERT dispara al primero, su UPDATE dispara al segundo, y vuelta a empezar. ' +
              'Durante backfills y operaciones masivas esto destruye datos (exactamente lo ' +
              'que paso con cita_fases el 30 ago 2026). Si los cuerpos cortan la recursion ' +
              'de verdad (guarda con IS DISTINCT FROM o salida temprana) es un aviso; si no, ' +
              'es bloqueante.',
            fichero: ins.fichero,
          }),
        );
      }
    }
  }

  return hallazgos;
}

/**
 * Reconstruye el inventario FINAL de triggers y funciones trigger leyendo las
 * migraciones en orden: gana la ultima definicion y los DROP TRIGGER sacan
 * del inventario. Exportada para testing.
 */
export function inventarioDesde(sqlPorFichero) {
  const funciones = new Map(); // nombre -> cuerpo (ultima definicion)
  const triggers = new Map(); // nombre -> { tabla, funcion, trasInsert, trasUpdate, fichero }

  for (const [fichero, sql] of sqlPorFichero) {
    for (const m of sql.matchAll(RE_DROP_TRIGGER)) {
      triggers.delete(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(RE_FUNCION_TRIGGER)) {
      funciones.set(m[1].toLowerCase(), m[2]);
    }
    for (const m of sql.matchAll(RE_TRIGGER)) {
      triggers.set(m[1].toLowerCase(), {
        nombre: m[1].toLowerCase(),
        tabla: m[2].toLowerCase(),
        funcion: m[3].toLowerCase(),
        trasInsert: /after\s+insert/i.test(m[0]),
        trasUpdate: /after\s+update/i.test(m[0]),
        fichero: `${DIR_MIGRACIONES}/${fichero}`,
      });
    }
  }

  return { triggers, funciones };
}

async function ejecutar() {
  const dir = path.join(RAIZ, DIR_MIGRACIONES);
  const ficheros = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  if (ficheros.length === 0) {
    return [
      hallazgo({
        clave: 'trigger-cadenas/sin-migraciones',
        nivel: 'aviso',
        ambito: 'base-de-datos',
        titulo: 'No hay migraciones SQL para analizar',
        detalle: `${DIR_MIGRACIONES} esta vacio.`,
      }),
    ];
  }

  const sqlPorFichero = ficheros.map((f) => [f, readFileSync(path.join(dir, f), 'utf8')]);

  return analizarInventario(inventarioDesde(sqlPorFichero));
}

export default {
  nombre: 'trigger-cadenas',
  ambito: 'base-de-datos',
  descripcion:
    'Triggers auto-referenciales y cascadas mutuas INSERT-UPDATE en migraciones SQL',
  ejecutar,
};
