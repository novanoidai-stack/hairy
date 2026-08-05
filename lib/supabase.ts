import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Fallback a los mismos valores publicos que ya usa la web (web/assets/auth.js).
// La anon key es la publishable: esta pensada para vivir en el cliente. El
// fallback garantiza que la app arranque aunque Vercel no inyecte las env vars
// en el build de Expo (sin esto, createClient recibe undefined y la app peta
// dejando la pantalla en negro).
// Exportadas (no solo locales): lib/hooks/useChispaVoz.web.ts las necesita para
// llamar a los edge de voz con fetch directo (los endpoints devuelven audio
// binario, que supabase.functions.invoke no serializa bien).
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vtrggiogjrhqtwbhbgia.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';
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
});

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
