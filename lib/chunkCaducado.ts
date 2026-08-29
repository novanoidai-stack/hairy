import { Platform } from 'react-native';

// Rescate de "chunk caducado".
//
// Desde que las pantallas viajan en trozos aparte (asyncRoutes), la app pide el
// trozo de cada pantalla la primera vez que se entra en ella. Los nombres de
// esos ficheros llevan hash, asi que TRAS UN DESPLIEGUE los del build anterior
// dejan de existir: quien tuviera la app abierta y cambiara de pantalla se
// llevaba un 404 y una pantalla rota, cuando lo unico que hacia falta era
// recargar para coger el build nuevo.
//
// Aqui se detecta ese caso concreto (no cualquier error) y se recarga una vez.

// Lo que dicen los navegadores cuando un import() no llega o no evalua.
//
// La lista NO se escribe de memoria: cada frase tiene que haberse visto de
// verdad. Las tres primeras salieron del manual; `loading module` salio de
// errores_cliente: una misma persona se comio la pantalla rota TRES veces --en
// configuracion, equipo y mi-jornada, tras dos despliegues distintos-- que es
// justo el caso que este rescate existe para evitar, porque no reconocia como
// suyo el mensaje que estaba viendo:
//   "Loading module https://www.mechaa.es/app/_expo/static/js/web/
//    mi-jornada-4ca253ca.js failed.\n(error: https://...)"
// Si aparece una cuarta redaccion, aqui es donde se anota, con su fecha.
const SENALES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  // Firefox 154 en Windows, visto en produccion el 25 y el 28 ago 2026.
  'loading module',
  'loading chunk',
  'loading css chunk',
  'unable to preload css',
];

const CLAVE_RESCATE = 'mecha-rescate-chunk';
// Margen para no entrar en bucle de recargas si el fallo no era el despliegue
// (por ejemplo, el usuario esta sin conexion): una recarga por minuto como mucho.
const ESPERA_ENTRE_RESCATES_MS = 60_000;

export function esChunkCaducado(error: unknown): boolean {
  const texto = String(
    (typeof error === 'string' ? error : (error as { message?: string })?.message) ?? '',
  ).toLowerCase();
  if (!texto) return false;
  return SENALES.some((s) => texto.includes(s));
}

// Devuelve true si ha lanzado la recarga (el que llama ya no tiene que pintar
// la pantalla de error).
export function rescatarSiChunkCaducado(error: unknown): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!esChunkCaducado(error)) return false;

  try {
    const ultimo = Number(window.sessionStorage.getItem(CLAVE_RESCATE) || 0);
    if (Date.now() - ultimo < ESPERA_ENTRE_RESCATES_MS) return false;
    window.sessionStorage.setItem(CLAVE_RESCATE, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado) no hay como contar recargas: mejor no
    // recargar que arriesgarse a un bucle.
    return false;
  }

  window.location.reload();
  return true;
}
