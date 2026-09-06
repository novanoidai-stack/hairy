#!/usr/bin/env node
// PASAR SERVICIOS DEL CATALOGO A ADD-ONS DE SALON. Reversible.
//
// PARA QUE SIRVE
// El catalogo del salon de Jose se importo con TODO como servicio. Lo que el
// llama extras -- "Espuma" 5,50 EUR, "Mascarilla" 10 EUR, "Secado espres" 15 EUR --
// son servicios con duracion, y por eso le ocupan agenda y le colisionan citas.
// Un add-on (`service_addons`) es solo dinero: no ocupa tiempo. Este script
// mueve las lineas que el salon decida.
//
// QUE HACE CON CADA UNA
//   1. Crea un add-on de SALON (servicio_id NULL) con el mismo nombre y precio.
//   2. APAGA el servicio (`activo = false`). No lo borra: hay citas y cobros
//      historicos que apuntan a ese id, y borrarlo se llevaria por delante
//      historia que no es nuestra. Apagado deja de ofrecerse y ya esta.
//   3. Anota lo hecho en un fichero de lote, que es lo que permite deshacerlo.
//
// QUIEN DECIDE LA LISTA
// El salon, no nosotros. No sabemos si "Mascarilla" se vende suelta. Sin lista
// no hay nada que ejecutar, y por eso el script la exige.
//
// USO
//   node scripts/migrar-servicios-a-addons.mjs --negocio <id> --lista extras.txt
//       Ensayo: no escribe nada. Es el modo por defecto A PROPOSITO.
//
//   node scripts/migrar-servicios-a-addons.mjs --negocio <id> --lista extras.txt --aplicar
//       Ejecuta y deja el lote en informes/lotes/addons-<negocio>-<fecha>.json
//
//   node scripts/migrar-servicios-a-addons.mjs --revertir <lote.json>
//       Deshace: borra los add-ons creados y reenciende los servicios.
//
// El fichero de lista es texto plano: un nombre de servicio por linea. Las
// lineas vacias y las que empiezan por # se ignoran. El nombre tiene que ser el
// exacto del catalogo (se compara sin acentos ni mayusculas, eso si).
//
// LO QUE EL REVERSO NO PUEDE DESHACER, Y POR QUE SE PARA EN VEZ DE FORZARLO
// Si entre la ida y la vuelta alguien ya vendio ese add-on, borrarlo se llevaria
// por delante el enlace de la cita (`cita_addons` va con ON DELETE CASCADE) y
// dejaria la linea del cobro apuntando a una fila que no existe. Los cobros son
// inmutables: eso no se arregla luego. El reverso lo detecta, deja ese add-on en
// pie y lo dice; el servicio se reenciende igual.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

// --- credenciales ------------------------------------------------------------
// La secret key se salta TODAS las RLS: es la llave maestra del proyecto. Nunca
// se escribe en el codigo -- vive en .env, gitignored (ver .env.example).
try {
  process.loadEnvFile?.();
} catch {
  // Sin .env en el directorio: vale si las variables ya vienen del entorno.
}

const URL_SUPABASE =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vtrggiogjrhqtwbhbgia.supabase.co';
// La heredada SUPABASE_SERVICE_ROLE_KEY esta DESACTIVADA desde el 29 ago 2026 y
// devuelve 401; se sigue leyendo solo por si alguien tiene un .env antiguo.
const CLAVE = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CLAVE) {
  console.error('Falta SUPABASE_SECRET_KEY. Ponla en .env (ver .env.example).');
  process.exit(1);
}
const db = createClient(URL_SUPABASE, CLAVE, { auth: { persistSession: false } });

// --- argumentos --------------------------------------------------------------
const args = process.argv.slice(2);
const bandera = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_LOTES = path.join(RAIZ, 'informes', 'lotes');

function normalizar(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function leerLista(ruta) {
  const crudo = fs.readFileSync(ruta, 'utf8');
  return crudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// --- ida ---------------------------------------------------------------------

async function migrar({ negocioId, nombres, aplicar }) {
  const { data: servicios, error } = await db
    .from('servicios')
    .select('id, nombre, precio, activo, duracion_activa_min')
    .eq('negocio_id', negocioId);
  if (error) throw error;

  const porNombre = new Map();
  for (const s of servicios) {
    const k = normalizar(s.nombre);
    // Un catalogo puede tener el mismo rotulo dos veces; se guardan todos para
    // poder avisar en vez de elegir uno al azar.
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(s);
  }

  const { data: addonsPrevios, error: e2 } = await db
    .from('service_addons')
    .select('id, nombre, servicio_id')
    .eq('negocio_id', negocioId)
    .is('servicio_id', null);
  if (e2) throw e2;
  const globalesExistentes = new Set(addonsPrevios.map((a) => normalizar(a.nombre)));

  const plan = [];
  const problemas = [];

  for (const nombre of nombres) {
    const k = normalizar(nombre);
    const candidatos = porNombre.get(k) ?? [];
    if (candidatos.length === 0) {
      problemas.push(`"${nombre}": no hay ningun servicio con ese nombre en ${negocioId}`);
      continue;
    }
    if (candidatos.length > 1) {
      problemas.push(
        `"${nombre}": hay ${candidatos.length} servicios con ese nombre. Desambigualo en el catalogo antes de migrar.`,
      );
      continue;
    }
    if (globalesExistentes.has(k)) {
      problemas.push(
        `"${nombre}": ya existe un add-on de salon con ese nombre (service_addons_salon_nombre_uk lo impediria).`,
      );
      continue;
    }
    plan.push(candidatos[0]);
  }

  // Cuantas citas FUTURAS usan cada servicio. No impide nada -- apagar un
  // servicio no toca las citas ya creadas -- pero es lo primero que pregunta
  // quien va a pulsar el boton.
  const ahora = new Date().toISOString();
  for (const s of plan) {
    const { count, error: e3 } = await db
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('negocio_id', negocioId)
      .eq('servicio_id', s.id)
      .neq('estado', 'cancelada')
      .gte('inicio', ahora);
    if (e3) throw e3;
    s._citasFuturas = count ?? 0;
  }

  console.log(`\nSalon: ${negocioId}`);
  console.log(`Servicios en la lista: ${nombres.length}  ->  migrables: ${plan.length}`);
  if (problemas.length) {
    console.log('\nNO se migran:');
    for (const p of problemas) console.log('  - ' + p);
  }
  if (plan.length) {
    console.log('\nSe convertiran en add-on de salon y se apagara el servicio:');
    for (const s of plan) {
      const aviso = s._citasFuturas > 0 ? `  [${s._citasFuturas} citas futuras lo usan]` : '';
      console.log(`  - ${s.nombre}  ${s.precio} EUR  (${s.duracion_activa_min} min)${aviso}`);
    }
  }

  if (!aplicar) {
    console.log('\nENSAYO: no se ha escrito nada. Anade --aplicar para ejecutarlo.');
    return;
  }
  if (plan.length === 0) {
    console.log('\nNada que aplicar.');
    return;
  }

  const lote = {
    negocio_id: negocioId,
    fecha: new Date().toISOString(),
    entradas: [],
  };

  for (const s of plan) {
    const { data: addon, error: e4 } = await db
      .from('service_addons')
      .insert({
        negocio_id: negocioId,
        servicio_id: null,
        nombre: s.nombre,
        precio: s.precio,
      })
      .select('id')
      .single();
    if (e4) {
      console.error(`  x ${s.nombre}: no se pudo crear el add-on -- ${e4.message}`);
      continue;
    }

    const { error: e5 } = await db
      .from('servicios')
      .update({ activo: false })
      .eq('id', s.id)
      .eq('negocio_id', negocioId);
    if (e5) {
      // El add-on ya esta creado: se retira para no dejar el catalogo a medias.
      await db.from('service_addons').delete().eq('id', addon.id);
      console.error(`  x ${s.nombre}: no se pudo apagar el servicio -- ${e5.message}`);
      continue;
    }

    lote.entradas.push({
      servicio_id: s.id,
      servicio_nombre: s.nombre,
      servicio_activo_antes: s.activo,
      addon_id: addon.id,
      precio: s.precio,
    });
    console.log(`  ok ${s.nombre} -> add-on de salon (${addon.id})`);
  }

  fs.mkdirSync(DIR_LOTES, { recursive: true });
  const sello = lote.fecha.replace(/[:.]/g, '-');
  const ruta = path.join(DIR_LOTES, `addons-${negocioId}-${sello}.json`);
  fs.writeFileSync(ruta, JSON.stringify(lote, null, 2));
  console.log(`\n${lote.entradas.length} migrados. Lote: ${path.relative(RAIZ, ruta)}`);
  console.log(`Deshacer:  node scripts/migrar-servicios-a-addons.mjs --revertir "${path.relative(RAIZ, ruta)}"`);
}

// --- vuelta ------------------------------------------------------------------

async function revertir(rutaLote) {
  const lote = JSON.parse(fs.readFileSync(rutaLote, 'utf8'));
  console.log(`\nRevirtiendo ${lote.entradas.length} entradas de ${lote.negocio_id} (${lote.fecha})`);

  let deshechas = 0;
  let retenidas = 0;

  for (const e of lote.entradas) {
    // El add-on solo se borra si nadie lo ha usado todavia. Ver la cabecera:
    // cita_addons va con ON DELETE CASCADE y cobro_lineas guarda el ref_id.
    const { count: enCitas, error: e1 } = await db
      .from('cita_addons')
      .select('id', { count: 'exact', head: true })
      .eq('addon_id', e.addon_id);
    if (e1) throw e1;
    const { count: enCobros, error: e2 } = await db
      .from('cobro_lineas')
      .select('id', { count: 'exact', head: true })
      .eq('ref_id', e.addon_id);
    if (e2) throw e2;

    if ((enCitas ?? 0) > 0 || (enCobros ?? 0) > 0) {
      console.log(
        `  ! ${e.servicio_nombre}: el add-on ya se ha usado (${enCitas} citas, ${enCobros} lineas de cobro). ` +
          'Se deja en pie: borrarlo perderia esa historia. El servicio si se reenciende.',
      );
      retenidas += 1;
    } else {
      const { error: e3 } = await db.from('service_addons').delete().eq('id', e.addon_id);
      if (e3) {
        console.error(`  x ${e.servicio_nombre}: no se pudo borrar el add-on -- ${e3.message}`);
        continue;
      }
    }

    const { error: e4 } = await db
      .from('servicios')
      .update({ activo: e.servicio_activo_antes })
      .eq('id', e.servicio_id)
      .eq('negocio_id', lote.negocio_id);
    if (e4) {
      console.error(`  x ${e.servicio_nombre}: no se pudo reencender el servicio -- ${e4.message}`);
      continue;
    }
    deshechas += 1;
    console.log(`  ok ${e.servicio_nombre} restaurado`);
  }

  console.log(`\n${deshechas} restaurados. ${retenidas} add-ons se han quedado en pie por tener uso.`);
}

// --- entrada -----------------------------------------------------------------

async function main() {
  const rutaLote = valor('--revertir');
  if (rutaLote) {
    await revertir(path.resolve(RAIZ, rutaLote));
    return;
  }

  const negocioId = valor('--negocio');
  const rutaLista = valor('--lista');
  if (!negocioId || !rutaLista) {
    console.error(
      'Uso:\n' +
        '  --negocio <id> --lista <fichero.txt> [--aplicar]\n' +
        '  --revertir <lote.json>\n\n' +
        'La lista la decide el salon: un nombre de servicio por linea.',
    );
    process.exit(1);
  }

  const nombres = leerLista(path.resolve(RAIZ, rutaLista));
  if (nombres.length === 0) {
    console.error('La lista esta vacia. Sin lista no hay nada que migrar.');
    process.exit(1);
  }

  await migrar({ negocioId, nombres, aplicar: bandera('--aplicar') });
}

main().catch((e) => {
  console.error('\nFallo:', e.message ?? e);
  process.exit(1);
});
