// Capa de datos compartida por todos los generadores SEO/AIO.
// Fuente unica de verdad: un unico fetch a Supabase (publishable key publica +
// RLS) reutilizado por sitemap, prerender de fichas, paginas de ciudad y landings.
//
// Esto corre EN EL BUILD (`npm run build:web` -> generate-seo + generate-sitemap),
// asi que la clave de aqui tiene que estar viva o el despliegue se queda sin
// sitemap ni fichas prerenderizadas. Por eso entro en la migracion de claves del
// 28 ago 2026 aunque no sea codigo de cliente.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const BASE_URL = 'https://www.mechaa.es';

const DEFAULT_SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
// Nombre historico: hoy contiene la publishable, no la anon heredada. Se
// conserva el nombre porque la env var que lo sobreescribe (mas abajo) es la
// misma que usa Vercel para el build de Expo.
const DEFAULT_ANON_KEY = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

// Fallback minimo: garantiza que siempre haya al menos una ficha renderizable
// y una ciudad, incluso si Supabase no responde durante el build.
const FALLBACK_SALONES = [
  {
    slug: 'florentsuarez',
    nombre: 'Florent Suarez Peluqueros',
    descripcion: 'Peluqueria y barberia en A Coruna con reserva online. Reserva cita a la hora que te venga bien, sin llamar.',
    direccion: 'Avenida de Finisterre 31 Bajo, 15004',
    ciudad: 'A Coruna',
    provincia: 'A Coruna',
    telefono: '+34 981 23 45 67',
    latitud: 43.3623,
    longitud: -8.4115,
    valoracion: 4.9,
    resenas: 28,
    foto: null,
    servicios: [
      { nombre: 'Corte de caballero', precio: 18, duracion: 30 },
      { nombre: 'Arreglo de barba', precio: 12, duracion: 20 },
      { nombre: 'Corte y peinado mujer', precio: 28, duracion: 45 },
      { nombre: 'Coloracion y mechas', precio: 55, duracion: 90 }
    ]
  }
];

// 52 Capitales de provincia y principales areas metropolitanas de Espana para cobertura GEO nacional completa
export const CIUDADES_ESPANA = [
  { ciudad: 'Madrid', provincia: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { ciudad: 'Barcelona', provincia: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { ciudad: 'Valencia', provincia: 'Valencia', lat: 39.4699, lng: -0.3763 },
  { ciudad: 'Sevilla', provincia: 'Sevilla', lat: 37.3891, lng: -5.9845 },
  { ciudad: 'Zaragoza', provincia: 'Zaragoza', lat: 41.6488, lng: -0.8891 },
  { ciudad: 'Malaga', provincia: 'Malaga', lat: 36.7213, lng: -4.4214 },
  { ciudad: 'Murcia', provincia: 'Murcia', lat: 37.9922, lng: -1.1307 },
  { ciudad: 'Palma de Mallorca', provincia: 'Islas Baleares', lat: 39.5696, lng: 2.6502 },
  { ciudad: 'Las Palmas de Gran Canaria', provincia: 'Las Palmas', lat: 28.1235, lng: -15.4363 },
  { ciudad: 'Bilbao', provincia: 'Bizkaia', lat: 43.2630, lng: -2.9350 },
  { ciudad: 'Alicante', provincia: 'Alicante', lat: 38.3452, lng: -0.4810 },
  { ciudad: 'Cordoba', provincia: 'Cordoba', lat: 37.8882, lng: -4.7794 },
  { ciudad: 'Valladolid', provincia: 'Valladolid', lat: 41.6523, lng: -4.7245 },
  { ciudad: 'Vigo', provincia: 'Pontevedra', lat: 42.2406, lng: -8.7207 },
  { ciudad: 'Gijon', provincia: 'Asturias', lat: 43.5322, lng: -5.6611 },
  { ciudad: 'A Coruna', provincia: 'A Coruna', lat: 43.3623, lng: -8.4115 },
  { ciudad: 'Vitoria-Gasteiz', provincia: 'Alava', lat: 42.8469, lng: -2.6716 },
  { ciudad: 'Granada', provincia: 'Granada', lat: 37.1773, lng: -3.5986 },
  { ciudad: 'Elche', provincia: 'Alicante', lat: 38.2669, lng: -0.6983 },
  { ciudad: 'Oviedo', provincia: 'Asturias', lat: 43.3619, lng: -5.8494 },
  { ciudad: 'Badalona', provincia: 'Barcelona', lat: 41.4500, lng: 2.2474 },
  { ciudad: 'Cartagena', provincia: 'Murcia', lat: 37.6257, lng: -0.9966 },
  { ciudad: 'Terrassa', provincia: 'Barcelona', lat: 41.5632, lng: 2.0089 },
  { ciudad: 'Jerez de la Frontera', provincia: 'Cadiz', lat: 36.6850, lng: -6.1261 },
  { ciudad: 'Sabadell', provincia: 'Barcelona', lat: 41.5433, lng: 2.1094 },
  { ciudad: 'Santa Cruz de Tenerife', provincia: 'Santa Cruz de Tenerife', lat: 28.4636, lng: -16.2518 },
  { ciudad: 'Pamplona', provincia: 'Navarra', lat: 42.8125, lng: -1.6458 },
  { ciudad: 'Almeria', provincia: 'Almeria', lat: 36.8381, lng: -2.4597 },
  { ciudad: 'Fuenlabrada', provincia: 'Madrid', lat: 40.2842, lng: -3.7942 },
  { ciudad: 'Leganes', provincia: 'Madrid', lat: 40.3282, lng: -3.7656 },
  { ciudad: 'San Sebastian', provincia: 'Gipuzkoa', lat: 43.3183, lng: -1.9812 },
  { ciudad: 'Getafe', provincia: 'Madrid', lat: 40.3083, lng: -3.7327 },
  { ciudad: 'Burgos', provincia: 'Burgos', lat: 42.3440, lng: -3.6969 },
  { ciudad: 'Santander', provincia: 'Cantabria', lat: 43.4623, lng: -3.8099 },
  { ciudad: 'Marbella', provincia: 'Malaga', lat: 36.5101, lng: -4.8824 },
  { ciudad: 'Salamanca', provincia: 'Salamanca', lat: 40.9701, lng: -5.6635 },
  { ciudad: 'Huelva', provincia: 'Huelva', lat: 37.2614, lng: -6.9447 },
  { ciudad: 'Logrono', provincia: 'La Rioja', lat: 42.4658, lng: -2.4499 },
  { ciudad: 'Badajoz', provincia: 'Badajoz', lat: 38.8794, lng: -6.9706 },
  { ciudad: 'Tarragona', provincia: 'Tarragona', lat: 41.1189, lng: 1.2445 },
  { ciudad: 'Leon', provincia: 'Leon', lat: 42.5987, lng: -5.5671 },
  { ciudad: 'Cadiz', provincia: 'Cadiz', lat: 36.5271, lng: -6.2886 },
  { ciudad: 'Jaen', provincia: 'Jaen', lat: 37.7796, lng: -3.7849 },
  { ciudad: 'Ourense', provincia: 'Ourense', lat: 42.3358, lng: -7.8639 },
  { ciudad: 'Girona', provincia: 'Girona', lat: 41.9794, lng: 2.8214 },
  { ciudad: 'Lugo', provincia: 'Lugo', lat: 43.0097, lng: -7.5568 },
  { ciudad: 'Caceres', provincia: 'Caceres', lat: 39.4753, lng: -6.3724 },
  { ciudad: 'Toledo', provincia: 'Toledo', lat: 39.8628, lng: -4.0273 },
  { ciudad: 'Pontevedra', provincia: 'Pontevedra', lat: 42.4336, lng: -8.6481 },
  { ciudad: 'Palencia', provincia: 'Palencia', lat: 42.0095, lng: -4.5288 },
  { ciudad: 'Ciudad Real', provincia: 'Ciudad Real', lat: 38.9848, lng: -3.9274 },
  { ciudad: 'Zamora', provincia: 'Zamora', lat: 41.5063, lng: -5.7446 }
];

/** Lee la configuracion de Supabase de process.env o de .env (en ese orden). */
export function loadSupabaseConfig() {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('EXPO_PUBLIC_SUPABASE_URL=')) {
          url = trimmed.slice('EXPO_PUBLIC_SUPABASE_URL='.length).trim() || url;
        } else if (trimmed.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY=')) {
          key = trimmed.slice('EXPO_PUBLIC_SUPABASE_ANON_KEY='.length).trim() || key;
        }
      }
    } catch (err) {
      console.warn('[seo/data] No se pudo leer .env:', err.message);
    }
  }

  return { url, key };
}

/**
 * Trae los salones publicos del directorio (con ciudad) via RPC.
 */
export async function fetchSalones() {
  const { url, key } = loadSupabaseConfig();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${url}/rest/v1/rpc/buscar_salones_publico`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ p_limit: 1000 }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[seo/data] buscar_salones_publico -> status ${response.status}. Usando fallback.`);
      return FALLBACK_SALONES;
    }

    const data = await response.json();
    let rawList = [];
    if (Array.isArray(data)) rawList = data;
    else if (data && Array.isArray(data.salones)) rawList = data.salones;

    const salones = rawList
      .filter(s => s && s.slug)
      .map(s => ({
        slug: String(s.slug),
        nombre: s.nombre || 'Salon',
        descripcion: s.descripcion || '',
        direccion: s.direccion || '',
        ciudad: s.ciudad || '',
        provincia: s.provincia || '',
        telefono: s.telefono || null,
        latitud: s.latitud != null ? Number(s.latitud) : null,
        longitud: s.longitud != null ? Number(s.longitud) : null,
        valoracion: s.valoracion != null ? Number(s.valoracion) : 0,
        resenas: s.resenas != null ? Number(s.resenas) : (s.resenas_total != null ? Number(s.resenas_total) : 0),
        foto: s.foto || null,
        servicios: Array.isArray(s.servicios) ? s.servicios : []
      }));

    if (salones.length === 0) {
      console.warn('[seo/data] buscar_salones_publico devolvio 0 salones. Usando fallback.');
      return FALLBACK_SALONES;
    }

    console.log(`[seo/data] ${salones.length} salones publicos obtenidos de Supabase.`);
    return salones;
  } catch (error) {
    console.warn('[seo/data] Error conectando a Supabase RPC:', error.message, '-> Usando fallback.');
    return FALLBACK_SALONES;
  }
}

/** Convierte un texto (nombre de ciudad, categoria...) en slug URL-safe. */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/ñ/gi, m => (m === 'Ñ' ? 'N' : 'n'))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 
 * Agrupa salones por ciudad y asegura cobertura de las principales capitales de España.
 */
export function agruparPorCiudad(salones) {
  const map = new Map();

  // 1. Primero agrega las ciudades que tienen salones activos en BD
  for (const s of salones) {
    if (!s.ciudad) continue;
    const citySlug = slugify(s.ciudad);
    if (!citySlug) continue;
    if (!map.has(citySlug)) {
      map.set(citySlug, { citySlug, ciudad: s.ciudad, provincia: s.provincia || '', salones: [] });
    }
    map.get(citySlug).salones.push(s);
  }

  // 2. Completa con las principales capitales de España para cobertura GEO nacional 150%
  for (const c of CIUDADES_ESPANA) {
    const citySlug = slugify(c.ciudad);
    if (!citySlug) continue;
    if (!map.has(citySlug)) {
      map.set(citySlug, {
        citySlug,
        ciudad: c.ciudad,
        provincia: c.provincia || '',
        lat: c.lat,
        lng: c.lng,
        salones: []
      });
    }
  }

  // Ordena: primero ciudades con salones (descendente), luego alfabeticamente
  return [...map.values()].sort((a, b) =>
    b.salones.length - a.salones.length || a.ciudad.localeCompare(b.ciudad, 'es')
  );
}
