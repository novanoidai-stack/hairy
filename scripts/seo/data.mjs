// Capa de datos compartida por todos los generadores SEO/AIO.
// Fuente unica de verdad: un unico fetch a Supabase (anon key publica + RLS)
// reutilizado por sitemap, prerender de fichas, paginas de ciudad y landings.
//
// Diseno: NUNCA usa tokens personales ni service_role. Solo la anon key,
// que es la que estara disponible en el build de Vercel. Si Supabase cae,
// cae al fallback para que el build nunca se rompa.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const BASE_URL = 'https://www.mechaa.es';

const DEFAULT_SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

// Fallback minimo: garantiza que siempre haya al menos una ficha renderizable
// y una ciudad, incluso si Supabase no responde durante el build.
const FALLBACK_SALONES = [
  {
    slug: 'florent-suarez-peluqueros',
    nombre: 'Florent Suarez Peluqueros',
    descripcion: 'Peluqueria y barberia en A Coruna con reserva online. Reserva cita a la hora que te venga bien, sin llamar.',
    direccion: 'Avenida de Finisterre 31 Bajo, 15004',
    ciudad: 'A Coruna',
    provincia: 'A Coruna',
    telefono: null,
    latitud: null,
    longitud: null,
    valoracion: 0,
    resenas: 0,
    foto: null,
    servicios: []
  }
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
 * Devuelve array de objetos normalizados con todos los campos que necesitan
 * sitemap, fichas prerender y paginas de ciudad. Nunca lanza: cae al fallback.
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

    // Normaliza campos: el RPC devuelve 'resenas' (count) en lista; en ficha
    // es 'resenas_total'. Aqui trabajamos con el de lista.
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

/** Agrupa salones por ciudad (slug de ciudad + nombre legible). */
export function agruparPorCiudad(salones) {
  const map = new Map();
  for (const s of salones) {
    if (!s.ciudad) continue;
    const citySlug = slugify(s.ciudad);
    if (!citySlug) continue;
    if (!map.has(citySlug)) {
      map.set(citySlug, { citySlug, ciudad: s.ciudad, provincia: s.provincia || '', salones: [] });
    }
    map.get(citySlug).salones.push(s);
  }
  // Ordena por numero de salones descendente, luego alfabetico.
  return [...map.values()].sort((a, b) =>
    b.salones.length - a.salones.length || a.ciudad.localeCompare(b.ciudad, 'es')
  );
}
