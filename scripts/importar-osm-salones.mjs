/* Importa peluquerias de OpenStreetMap a public.salones_externos.
 *
 * Rellena el bloque de "salones que no son de Mecha" del directorio, para que no
 * se vea vacio mientras no haya clientes suficientes.
 *
 * Por que OSM y no Google: los datos de OSM son redistribuibles (ODbL, exige
 * atribucion visible, que va en el pie de salones.html). Las condiciones de
 * Google Maps Platform prohiben cachear su contenido y montar con el un
 * directorio propio.
 *
 * OSM no trae valoraciones ni precios. Es una limitacion util: el bloque de
 * ajenos no puede ensenar nota ni tarifa aunque alguien quiera.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/importar-osm-salones.mjs "A Coruña" "Alcoi"
 *   node scripts/importar-osm-salones.mjs --dry "Valencia"     (no escribe nada)
 *
 * Es idempotente: la clave (fuente, fuente_id) hace upsert, y no toca ni
 * `visible` ni `reclamado_por`, para no deshacer los apagados manuales ni
 * resucitar en el bloque de ajenos a un salon que ya se dio de alta en Mecha.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const todos = args.includes('--todos');
const ciudades = args.filter((a) => !a.startsWith('--'));

if (!ciudades.length) {
  console.error('Uso: node scripts/importar-osm-salones.mjs [--dry] [--todos] "Ciudad" ["Otra ciudad" ...]');
  process.exit(1);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && !serviceKey) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno (la de Hairy, proyecto vtrggiogjrhqtwbhbgia).');
  process.exit(1);
}

const supabase = dry ? null : createClient(SUPABASE_URL, serviceKey);

// admin_level 8 = municipio en Espana. Sin acotar por area saldrian peluquerias
// de medio continente.
//
// El municipio se busca por varios nombres a la vez porque en OSM el `name` de
// los municipios bilingues es el de la lengua propia: "Alcoi" existe como
// name:ca y "Alcoy" como name:es, y buscar solo por `name` devuelve cero en la
// mitad de Espana.
function consulta(ciudad) {
  const c = ciudad.replace(/"/g, '');
  const claves = ['name', 'name:es', 'name:ca', 'name:gl', 'name:eu', 'official_name'];
  const areas = claves
    .map((k) => `  area["boundary"="administrative"]["admin_level"="8"]["${k}"="${c}"];`)
    .join('\n');
  return `[out:json][timeout:90];
(
${areas}
)->.zona;
nwr["shop"="hairdresser"](area.zona);
out center tags;`;
}

// Portales con direccion del municipio. La mayoria de las peluquerias de OSM no
// llevan la direccion encima: la lleva el edificio en el que estan. Una sola
// consulta por ciudad y luego se cruza en local, en vez de miles de peticiones
// a un geocodificador (Nominatim limita a 1/s y desaconseja el uso masivo).
// Por caja de coordenadas, no por area administrativa: resolver el area y
// barrerla entera hace que Overpass devuelva 504 en las ciudades grandes
// (Barcelona fallaba siempre; Madrid, a la tercera). Una bbox es mucho mas
// barata para el servidor.
function consultaDirecciones(caja) {
  const { sur, oeste, norte, este } = caja;
  return `[out:json][timeout:120];
nwr["addr:street"](${sur},${oeste},${norte},${este});
out center tags;`;
}

// Si una caja sigue siendo demasiado grande, se parte en cuatro y se reintenta
// cada trozo. Asi se adapta sola a la densidad de cada ciudad en vez de fijar un
// tamano de rejilla a ojo.
async function direccionesEnCaja(caja, profundidad = 0) {
  try {
    return await overpass(caja, true);
  } catch (e) {
    if (profundidad >= 3) {
      console.log(`\n  aviso: sin portales en un trozo (${e.message.slice(0, 60)})`);
      return [];
    }
    const latMed = (caja.sur + caja.norte) / 2;
    const lngMed = (caja.oeste + caja.este) / 2;
    const trozos = [
      { sur: caja.sur, oeste: caja.oeste, norte: latMed, este: lngMed },
      { sur: caja.sur, oeste: lngMed, norte: latMed, este: caja.este },
      { sur: latMed, oeste: caja.oeste, norte: caja.norte, este: lngMed },
      { sur: latMed, oeste: lngMed, norte: caja.norte, este: caja.este },
    ];
    let todas = [];
    for (const t of trozos) {
      await new Promise((r) => setTimeout(r, 2000));
      todas = todas.concat(await direccionesEnCaja(t, profundidad + 1));
    }
    return todas;
  }
}

function cajaDe(filas, margen = 0.002) {
  const lats = filas.map((f) => f.lat).filter((v) => v != null);
  const lngs = filas.map((f) => f.lng).filter((v) => v != null);
  if (!lats.length) return null;
  return {
    sur: Math.min(...lats) - margen,
    oeste: Math.min(...lngs) - margen,
    norte: Math.max(...lats) + margen,
    este: Math.max(...lngs) + margen,
  };
}

function texto(v) {
  const t = (v == null ? '' : String(v)).trim();
  return t || null;
}

// Rejilla de ~110 m para no comparar cada peluqueria contra los cien mil
// portales de una ciudad grande: solo contra los de su celda y las 8 vecinas.
const CELDA = 0.001;
const clave = (lat, lng) => `${Math.round(lat / CELDA)}:${Math.round(lng / CELDA)}`;

function indexarDirecciones(elementos) {
  const rejilla = new Map();
  for (const el of elementos) {
    const c = el.type === 'node' ? el : el.center;
    const tags = el.tags || {};
    if (!c || !tags['addr:street']) continue;
    const k = clave(c.lat, c.lon);
    if (!rejilla.has(k)) rejilla.set(k, []);
    rejilla.get(k).push({ lat: c.lat, lng: c.lon, tags });
  }
  return rejilla;
}

function metros(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * 111320;
  const dLng = (bLng - aLng) * 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// El portal mas cercano dentro de 30 m. Mas lejos ya no es "el edificio donde
// esta el salon", es el de al lado, y una direccion equivocada es peor que
// ninguna.
function direccionCercana(rejilla, lat, lng) {
  if (lat == null || lng == null) return null;
  const ci = Math.round(lat / CELDA);
  const cj = Math.round(lng / CELDA);
  let mejor = null;
  let mejorD = 30;
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (const p of rejilla.get(`${i}:${j}`) || []) {
        const d = metros(lat, lng, p.lat, p.lng);
        if (d < mejorD) { mejorD = d; mejor = p; }
      }
    }
  }
  if (!mejor) return null;
  const calle = texto(mejor.tags['addr:street']);
  const numero = texto(mejor.tags['addr:housenumber']);
  return {
    direccion: numero ? `${calle} ${numero}` : calle,
    codigo_postal: texto(mejor.tags['addr:postcode']),
  };
}

function direccionDe(tags) {
  const calle = texto(tags['addr:street']);
  if (!calle) return texto(tags['addr:place']);
  const numero = texto(tags['addr:housenumber']);
  return numero ? `${calle} ${numero}` : calle;
}

function mapear(el, ciudadPedida) {
  const tags = el.tags || {};
  const nombre = texto(tags.name);
  // Sin nombre no hay tarjeta que ensenar: OSM tiene muchos POIs sin nombrar.
  if (!nombre) return null;

  const centro = el.type === 'node' ? el : el.center;
  return {
    fuente: 'osm',
    fuente_id: `${el.type}/${el.id}`,
    nombre,
    direccion: direccionDe(tags),
    // addr:city no siempre esta; si falta, vale la ciudad por la que hemos
    // buscado, que es exactamente el area administrativa consultada.
    ciudad: texto(tags['addr:city']) || ciudadPedida,
    provincia: texto(tags['addr:province']) || null,
    codigo_postal: texto(tags['addr:postcode']),
    lat: centro?.lat ?? null,
    lng: centro?.lon ?? null,
    telefono: texto(tags.phone) || texto(tags['contact:phone']),
    web: texto(tags.website) || texto(tags['contact:website']),
    updated_at: new Date().toISOString(),
  };
}

async function overpass(objetivo, deDirecciones = false) {
  // Overpass rechaza con 406 las peticiones sin User-Agent identificable.
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'mecha-directorio/1.0 (https://www.mechaa.es; contacto@mechaa.es)',
    },
    body: new URLSearchParams({ data: deDirecciones ? consultaDirecciones(objetivo) : consulta(objetivo) }),
  });
  if (!r.ok) {
    const cuerpo = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`Overpass ${r.status}: ${cuerpo}`);
  }
  const json = await r.json();
  return json.elements || [];
}

// Overpass reparte turnos por IP: encadenar ciudades agota el cupo y devuelve
// 429. Se reintenta con espera creciente en vez de abandonar la importacion.
async function overpassConReintento(ciudad, deDirecciones = false, intentos = 4) {
  for (let i = 1; ; i++) {
    try {
      return await overpass(ciudad, deDirecciones);
    } catch (e) {
      if (i >= intentos) throw e;
      const espera = 20000 * i;
      console.log(`\n  ${e.message}\n  reintento ${i}/${intentos - 1} en ${espera / 1000}s...`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

async function importar(ciudad) {
  process.stdout.write(`\n${ciudad}: consultando Overpass... `);
  const elementos = await overpassConReintento(ciudad);
  console.log(`${elementos.length} POIs`);

  const porId = new Map();
  for (const el of elementos) {
    const fila = mapear(el, ciudad);
    if (fila) porId.set(fila.fuente_id, fila);
  }
  const filas = [...porId.values()];

  const conDirPropia = filas.filter((f) => f.direccion).length;

  // A las que no traen direccion, la del portal mas cercano.
  const sinDireccion = filas.filter((f) => !f.direccion && f.lat != null);
  const caja = sinDireccion.length ? cajaDe(sinDireccion) : null;
  if (caja) {
    await new Promise((r) => setTimeout(r, 3000));
    process.stdout.write(`  ${sinDireccion.length} sin direccion: buscando portales... `);
    const portales = await direccionesEnCaja(caja);
    const rejilla = indexarDirecciones(portales);
    let resueltas = 0;
    for (const f of sinDireccion) {
      const d = direccionCercana(rejilla, f.lat, f.lng);
      if (d) {
        f.direccion = d.direccion;
        f.codigo_postal = f.codigo_postal || d.codigo_postal;
        resueltas++;
      }
    }
    console.log(`${portales.length} portales · ${resueltas} direcciones resueltas`);
  }

  const conTel = filas.filter((f) => f.telefono).length;
  const conDir = filas.filter((f) => f.direccion).length;
  console.log(`  ${filas.length} con nombre · ${conDir} con direccion (${conDirPropia} propias) · ${conTel} con telefono`);

  // En OSM la mayoria de las peluquerias son un punto con nombre y nada mas: ni
  // calle ni telefono. Una tarjeta asi no le sirve a nadie — no se puede llamar
  // ni saber donde esta. Por defecto solo entran las que tienen al menos una de
  // las dos cosas; --todos importa tambien las peladas.
  const utiles = todos ? filas : filas.filter((f) => f.telefono || f.direccion);
  if (!todos) console.log(`  ${utiles.length} utiles (con direccion o telefono); ${filas.length - utiles.length} descartadas`);

  if (dry) {
    for (const f of utiles.slice(0, 5)) {
      console.log(`    - ${f.nombre} | ${f.direccion || 'sin direccion'} | ${f.telefono || 'sin telefono'}`);
    }
    if (utiles.length > 5) console.log(`    ... y ${utiles.length - 5} mas`);
    return utiles.length;
  }

  // En tandas: un upsert de miles de filas de golpe se queda sin tiempo.
  let escritas = 0;
  for (let i = 0; i < utiles.length; i += 200) {
    const tanda = utiles.slice(i, i + 200);
    const { error } = await supabase
      .from('salones_externos')
      .upsert(tanda, { onConflict: 'fuente,fuente_id' });
    if (error) {
      console.error(`  Error al escribir la tanda ${i / 200 + 1}:`, error.message);
      process.exit(1);
    }
    escritas += tanda.length;
  }
  console.log(`  ${escritas} guardadas`);
  return escritas;
}

let total = 0;
const fallidas = [];
for (const ciudad of ciudades) {
  // Una ciudad que falle no puede llevarse por delante las que vienen detras.
  try {
    total += await importar(ciudad);
  } catch (e) {
    console.error(`\n${ciudad}: FALLA — ${e.message}`);
    fallidas.push(ciudad);
  }
  // Overpass es un servicio publico y gratuito: no conviene martillearlo.
  if (ciudad !== ciudades[ciudades.length - 1]) await new Promise((r) => setTimeout(r, 3000));
}
console.log(`\n${dry ? 'Se importarian' : 'Importadas'} ${total} peluquerias en ${ciudades.length - fallidas.length} de ${ciudades.length} ciudad(es).`);
if (fallidas.length) console.log(`Sin importar: ${fallidas.join(', ')}. Se pueden reintentar sueltas.`);
