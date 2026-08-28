import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// Fallback a los mismos valores publicos que ya usa la web (web/assets/auth.js).
// La clave es la PUBLISHABLE (`sb_publishable_...`), publica por diseno igual
// que lo era la anon: mismos privilegios bajos, mismas RLS, pensada para vivir
// en el navegador. El fallback garantiza que la app arranque aunque Vercel no
// inyecte las env vars en el build de Expo (sin esto, createClient recibe
// undefined y la app peta dejando la pantalla en negro).
//
// OJO CON EL NOMBRE: la variable se sigue llamando ..._ANON_KEY a proposito,
// porque asi esta dada de alta en Vercel. Renombrarla obliga a cambiar el panel
// en el mismo minuto; el valor es lo que importa. Si Vercel todavia inyecta la
// anon heredada, ESA gana y el fallback no llega a usarse nunca: hay que
// cambiarla alli tambien. Contexto: decision 9 de CLAUDE.md e
// informes/MIGRACION-CLAVES-SUPABASE-2026-08-28.md.
//
// Exportadas (no solo locales): lib/hooks/useChispaVoz.web.ts las necesita para
// llamar a los edge de voz con fetch directo (los endpoints devuelven audio
// binario, que supabase.functions.invoke no serializa bien).
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vtrggiogjrhqtwbhbgia.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

// ---------------------------------------------------------------------------
// Modo DEMO (web): la demo de la landing (demo.html) embebe /app?demo=1 en un
// iframe. En ese modo la app usa una sesion AISLADA (storageKey propio) con la
// cuenta de demo compartida, de forma que:
//   - todo el mundo ve la MISMA demo (tenant demo_salon_001), da igual con que
//     cuenta personal este logueado el visitante fuera del iframe;
//   - la sesion personal del sitio (acceso.html -> /app) no se toca nunca.
// Solo cuenta como demo si la app corre EMBEBIDA en un iframe del mismo sitio:
// abrir /app?demo=1 directamente en una pestana NO activa el modo demo.
// El flag en sessionStorage mantiene el modo si el iframe navega/recarga a una
// ruta interna sin el parametro (sessionStorage se comparte parent<->iframe del
// mismo origen dentro de la pestana).
// ---------------------------------------------------------------------------
function detectDemoMode(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  let embedded = false;
  try { embedded = window.top !== window.self; } catch { embedded = true; }
  if (!embedded) return false;

  // 1. Verificación por origen común (leer URL de la ventana superior)
  try {
    if (window.top && window.top.location.href.includes('demo.html')) {
      return true;
    }
  } catch (e) {
    // Si da error de CORS es que está embebido en otro origen; hacemos fallback a los parámetros
  }

  // 2. Fallbacks clásicos (parámetros y session storage)
  const hasParam = /[?&]demo=1(?:&|$)/.test(window.location.search);
  let flagged = false;
  try {
    if (hasParam) window.sessionStorage.setItem('mecha-demo-mode', '1');
    flagged = window.sessionStorage.getItem('mecha-demo-mode') === '1';
  } catch { /* sessionStorage bloqueado: solo vale el parametro */ }
  return hasParam || flagged;
}

export const IS_DEMO_MODE = detectDemoMode();

// Clave donde auth-js deja la sesion. La usa el guard de app/_layout.tsx para
// distinguir "no hay sesion" (no hay nada guardado) de "no he podido leerla"
// (hay token guardado pero el refresco fallo). En web es la misma clave que
// escribe acceso.html, por eso el salto landing -> /app conserva el login.
export const AUTH_STORAGE_KEY = IS_DEMO_MODE
  ? 'mecha-demo-auth'
  : `sb-${supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`;

// --- Una sola peticion para cada lectura repetida --------------------------
//
// Al abrir el software, varias piezas independientes (el lanzador de Chispa,
// el estado de puesta en marcha, la agenda, los avisos, la barra del portal...)
// piden POR SU CUENTA lo mismo casi a la vez. Medido en un arranque real: 61
// peticiones a Supabase, de las cuales unas 25 eran repeticiones EXACTAS de
// otra que estaba viajando en ese mismo momento (negocio_config ocho veces,
// negocio_horarios seis, profesionales seis...).
//
// En vez de tocar los ~120 sitios que consultan, se resuelve una vez aqui: si
// llega una lectura identica a otra que sigue en vuelo, se cuelga de la misma
// respuesta en lugar de abrir otra. No hay caduquez que gestionar -- no se
// guarda nada: en cuanto la respuesta llega, la entrada desaparece. Lo que una
// pantalla lea despues sigue siendo una consulta nueva.
//
// Reglas de la casa:
//   - Solo lecturas (GET y HEAD; los contadores `head: true` de PostgREST son
//     HEAD). Las escrituras y las RPC van por POST y pueden tener efectos:
//     esas nunca se comparten.
//   - Si la peticion trae su propio AbortSignal no se comparte, para que
//     cancelar una no le corte la respuesta a otra.
//   - La clave incluye las cabeceras que cambian la respuesta (token, Range,
//     Prefer, Accept...): dos peticiones solo se juntan si son la MISMA.
//
// Ademas, unas pocas tablas de referencia (las de configuracion del salon, que
// cambian de Pascuas a Ramos pero se consultan sin parar) mantienen la
// respuesta unos segundos, porque sus repeticiones no llegan a la vez sino una
// detras de otra. Para que eso NO pueda enseñar datos viejos, cualquier
// escritura contra una tabla tira lo guardado de esa tabla: guardar y volver a
// leer siempre devuelve lo recien guardado.
const lecturasEnVuelo = new Map<string, { promesa: Promise<Response>; tabla: string; hasta: number }>();

const CABECERAS_QUE_CUENTAN = ['authorization', 'apikey', 'accept', 'accept-profile', 'range', 'prefer'];

// Tablas de configuracion del salon: se leen desde muchos sitios y cambian muy
// de vez en cuando. Nada de citas, clientes, caja ni nada que se mueva.
const TABLAS_DE_REFERENCIA = new Set([
  'negocio_config',
  'negocio_horarios',
  'negocio_portal',
  'profesionales',
  'servicios',
  'categorias_servicio',
  // Cambia tan a menudo como las horas del salon: lo piden la agenda y las
  // fichas de profesional una detras de otra al arrancar (medido x3 en prod).
  'horarios_profesional',
]);
const VIDA_REFERENCIA_MS = 3000;

function tablaDeUrl(url: string): string {
  return url.match(/\/rest\/v1\/([a-zA-Z0-9_]+)/)?.[1] ?? '';
}

function claveDeLectura(url: string, init?: RequestInit): string {
  const h = new Headers(init?.headers || {});
  return url + '\n' + CABECERAS_QUE_CUENTAN.map((k) => `${k}=${h.get(k) ?? ''}`).join('&');
}

// Aviso de "se ha escrito en esta tabla".
//
// La cache de datos (lib/datos/) se cuelga de aqui para invalidar sola lo que
// guarde de esa tabla. Sin esto habria que acordarse de invalidar en CADA sitio
// que escribe -- `negocio_config`, por ejemplo, tiene cuatro `upsert` repartidos
// por la app -- y el dia que alguien anada el quinto, la pantalla ensenaria
// datos viejos despues de guardar. Al vivir en el fetch, cubre TAMBIEN las
// escrituras de las pantallas que todavia no se han migrado.
type OyenteEscritura = (tabla: string) => void;
const oyentesEscritura = new Set<OyenteEscritura>();

export function alEscribirEnTabla(oyente: OyenteEscritura): () => void {
  oyentesEscritura.add(oyente);
  return () => { oyentesEscritura.delete(oyente); };
}

function fetchSinRepetir(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const metodo = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const tabla = tablaDeUrl(url);

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    // Escritura (o RPC): lo guardado de esa tabla ya no vale.
    if (tabla) {
      for (const [k, v] of lecturasEnVuelo) if (v.tabla === tabla) lecturasEnVuelo.delete(k);
      // Un oyente roto no puede tumbar la escritura que lo provoco.
      for (const oyente of oyentesEscritura) {
        try { oyente(tabla); } catch { /* la escritura manda */ }
      }
    }
    return fetch(input as RequestInfo, init);
  }
  if (init?.signal) return fetch(input as RequestInfo, init);

  const clave = claveDeLectura(url, init);
  const guardada = lecturasEnVuelo.get(clave);
  // Se devuelve siempre una copia: el cuerpo de una Response solo se puede
  // leer una vez, y aqui puede haber varios esperandola.
  if (guardada && Date.now() < guardada.hasta) return guardada.promesa.then((r) => r.clone());

  // Barrido de lo caducado, para que el mapa no crezca sin fin.
  const ahora = Date.now();
  for (const [k, v] of lecturasEnVuelo) if (ahora >= v.hasta) lecturasEnVuelo.delete(k);

  const peticion = fetch(input as RequestInfo, init);
  const entrada = { promesa: peticion, tabla, hasta: Number.POSITIVE_INFINITY };
  lecturasEnVuelo.set(clave, entrada);
  const soltar = (ok: boolean) => {
    if (lecturasEnVuelo.get(clave) !== entrada) return;
    // Mientras viajaba solo la comparten los que ya estaban esperando; a partir
    // de aqui, solo las tablas de referencia siguen valiendo un rato.
    if (ok && TABLAS_DE_REFERENCIA.has(tabla)) entrada.hasta = Date.now() + VIDA_REFERENCIA_MS;
    else lecturasEnVuelo.delete(clave);
  };
  peticion.then((r) => soltar(r.ok), () => soltar(false));
  return peticion.then((r) => r.clone());
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    // En modo demo la sesion vive en un cajon aparte para no pisar (ni leer)
    // la sesion personal del visitante.
    ...(IS_DEMO_MODE ? { storageKey: 'mecha-demo-auth' } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchSinRepetir },
});

// La misma instancia (misma sesion, mismo fetchSinRepetir), tipada con el
// schema real (types/database.types.ts, autogenerado con `supabase gen types`).
// Las pantallas existentes siguen usando `supabase` sin tipos para no romper
// los 199 puntos de uso de golpe; el codigo nuevo y la capa de datos usan
// este, y cuando una pantalla se migra, cambia su import por supabaseTipado.
export const supabaseTipado = supabase as SupabaseClient<Database>;

// Cuenta de demo compartida (las credenciales son publicas a proposito: ya
// viven en web/assets/auth.js; la cuenta es free, del tenant demo, y RLS
// limita lo que puede tocar). La usa _layout.tsx para auto-entrar en la demo.
export const DEMO_VIEWER = {
  email: 'demo.publico@mecha.app',
  password: 'MechaDemoView_2026',
};

// Entrar en la demo con reintentos. Si el primer intento se pierde (Supabase
// frio, red del visitante), antes se daba por perdida la partida: la demo se
// montaba SIN sesion y se quedaba enseñando ceros para siempre, porque las
// pantallas lanzan sus consultas una vez y no las repiten.
export async function signInDemoViewer() {
  const esperas = [0, 900, 2500];
  let ultimo: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null = null;
  for (const espera of esperas) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      ultimo = await supabase.auth.signInWithPassword(DEMO_VIEWER);
      if (!ultimo.error) return ultimo;
    } catch (e) {
      ultimo = null;
      if (espera === esperas[esperas.length - 1]) throw e;
    }
  }
  return ultimo ?? supabase.auth.signInWithPassword(DEMO_VIEWER);
}
