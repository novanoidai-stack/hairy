// Shim de lib/supabase para Deno: los tests unitarios de lib/ que importan
// este modulo no ejercitan el cliente real (solo funciones puras), y montar
// el cliente en Deno requiere AsyncStorage de React Native, que no existe aqui.
// La app real (Metro/Expo) nunca pasa por aqui; esto vive solo en deno.json.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
export const IS_DEMO_MODE = false;
export const AUTH_STORAGE_KEY = 'sb-auth-token';
export const DEMO_VIEWER = { email: '', password: '' };
export const supabase = new Proxy(
  {},
  {
    get() {
      throw new Error(
        'Shim Deno de lib/supabase: el cliente real no esta disponible en tests unitarios. Si un test lo necesita, ese test es de integracion y no deberia correr aqui.',
      );
    },
  },
);
export async function signInDemoViewer() {
  throw new Error('No disponible en el shim de Deno');
}
