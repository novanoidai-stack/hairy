// Avisar a Mecha cuando la app peta en casa de un salon.
//
// Antes, si a alguien se le quedaba la pantalla en blanco, lo unico que pasaba
// era un console.error en SU navegador: nadie aqui se enteraba nunca. La
// pantalla de error incluso decia "nuestro equipo ya esta al tanto", y no era
// verdad. Esto lo hace verdad.
//
// Reglas de la casa:
//   - Nunca puede romper nada: si el envio falla, se traga el fallo y sigue.
//   - No repite: el mismo error en la misma pantalla se manda una vez por
//     sesion (un bucle de render puede lanzarlo cientos de veces).
//   - No manda datos de clientas: solo el mensaje del error, la ruta y un trozo
//     de pila, y el servidor ademas los recorta.
//   - En la demo no manda nada: alli los errores son de escaparate, no de un
//     salon de verdad.
//   - Y desde un navegador AUTOMATIZADO tampoco: ver esNavegadorAutomatizado().

import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { rescatarSiChunkCaducado } from './chunkCaducado';

const yaEnviados = new Set<string>();

/**
 * Un navegador conducido por un robot no es un salon.
 *
 * El canario corre el mismo smoke contra www.mechaa.es cada hora, y uno de sus
 * tests provoca A PROPOSITO una promesa rota para comprobar que el sensor de
 * fallos silenciosos oye. Sin esto, ese error de mentira entraba en
 * errores_cliente como si a alguien se le hubiera roto la pantalla: 11 apuntes
 * en un solo dia. Y esa tabla existe justo para lo contrario -- "se rompio en
 * casa de un cliente real, hay alguien esperando" (decision 10 de CLAUDE.md).
 * Un fallo de verdad enterrado bajo el ruido del propio vigilante es el peor
 * final posible para las dos herramientas.
 *
 * Se mira `navigator.webdriver` (lo pone el propio navegador cuando lo maneja
 * WebDriver/CDP, que es lo que hace Playwright) y ademas una bandera explicita
 * para cualquier otro automatismo. Si Playwright dejara de marcarlo, esto se
 * quedaria ciego en silencio; por eso el smoke lo COMPRUEBA en voz alta
 * (tests/smoke/silencios.spec.ts) y falla si deja de ser cierto.
 */
export function esNavegadorAutomatizado(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
    return typeof window !== 'undefined' &&
      (window as { __MECHA_SIN_TELEMETRIA__?: boolean }).__MECHA_SIN_TELEMETRIA__ === true;
  } catch {
    return false;
  }
}

export type OrigenError = 'app' | 'portal' | 'landing' | 'marketplace' | 'edge_function';
export type TipoError = 'excepcion' | 'operativo' | 'ia' | 'creditos' | 'red';

function rutaActual(): string {
  if (typeof window === 'undefined') return '';
  try {
    return `${window.location.pathname}${window.location.search}`.slice(0, 200);
  } catch {
    return '';
  }
}

// Ojo con el orden y con el prefijo. La app web va montada en /app, asi que la
// ruta REAL del portal publico es `/app/r/<slug>`, no `/r/<slug>`: mientras
// esto miro solo `/r/`, los 76 errores del portal que hay guardados se
// clasificaron como 'app' salvo los que traian el origen puesto a mano. Y
// clasificar mal el origen no es cosmetico: el panel de staff filtra por el, y
// un error del portal escondido entre los de la app es un error que nadie mira.
// El prefijo /app se quita ANTES de comparar, y por eso el caso `/app` a secas
// se resuelve al final.
function deducirOrigen(ruta: string): OrigenError {
  const sinPrefijo = ruta.startsWith('/app/') ? ruta.slice(4) : ruta;
  if (sinPrefijo.startsWith('/salones') || sinPrefijo.startsWith('/directorio')) return 'marketplace';
  if (
    sinPrefijo.startsWith('/r/') ||
    sinPrefijo.startsWith('/resena/') ||
    sinPrefijo.startsWith('/cita/')
  ) {
    return 'portal';
  }
  if (ruta.startsWith('/app')) return 'app';
  if (ruta === '/' || ruta.endsWith('.html')) return 'landing';
  return 'app';
}

function deducirTipo(mensaje: string, pila?: string): TipoError {
  const txt = `${mensaje} ${pila || ''}`.toLowerCase();
  if (/key limit|403|quota|credits?|insufficient_quota|balance|payment required|billing|402/i.test(txt)) {
    return 'creditos';
  }
  if (/openrouter|chispa|model_not_found|edge function|tokens|completions/i.test(txt)) {
    return 'ia';
  }
  if (/failed to fetch|networkerror|fetch failed|err_network|timeout|connection/i.test(txt)) {
    return 'red';
  }
  return 'excepcion';
}

export function reportarError(
  error: unknown,
  o: { origen?: OrigenError; pila?: string; tipo?: TipoError } = {},
): void {
  try {
    if (IS_DEMO_MODE) return;
    if (esNavegadorAutomatizado()) return;
    const err = error as { message?: string; stack?: string } | null;
    const mensaje = String(err?.message ?? error ?? '').trim();
    if (!mensaje) return;

    const ruta = rutaActual();
    const clave = `${mensaje}|${ruta}`;
    if (yaEnviados.has(clave)) return;
    yaEnviados.add(clave);

    const pila = (o.pila ?? err?.stack ?? '').slice(0, 2000);
    const origen = o.origen ?? deducirOrigen(ruta);
    const tipo = o.tipo ?? deducirTipo(mensaje, pila);

    void supabase
      .rpc('registrar_error_cliente', {
        p_mensaje: mensaje,
        p_ruta: ruta,
        p_pila: pila,
        p_origen: origen,
        p_navegador: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
        p_tipo: tipo,
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // Un fallo del que avisa de fallos no puede tumbar la pantalla.
  }
}

export async function notificarErrorSoporte(error: unknown, pila?: string) {
  if (IS_DEMO_MODE) return;
  // Esta manda un CORREO a contacto@mechaa.es: con mas motivo que la anterior.
  if (esNavegadorAutomatizado()) return;
  const err = error as { message?: string; stack?: string } | null;
  const mensaje = String(err?.message ?? error ?? '').trim();
  if (!mensaje) return;

  const ruta = rutaActual();
  const navegador = typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';
  const cuerpoError = `Ruta: ${ruta}\nNavegador: ${navegador}\n\nDetalles:\n${pila ?? err?.stack ?? 'Sin pila'}`.slice(0, 3000);

  try {
    await supabase.functions.invoke('notificar-soporte', {
      body: {
        asunto: `🔴 Error Crítico en App/Portal: ${mensaje.slice(0, 50)}`,
        mensaje: cuerpoError,
        negocio: 'Auto-Reporte ErrorBoundary',
        autor_nombre: 'Sistema Mecha',
        autor_email: 'contacto@mechaa.es'
      }
    });
  } catch (e) {
    console.error('No se pudo enviar el correo de error:', e);
  }
}

// Errores que no pasan por ningun try/catch ni por el boundary de React: una
// promesa que nadie captura, un error suelto de un script. Son justo los que se
// perdian enteros.
let instalado = false;
export function instalarCazadorDeErrores(): () => void {
  if (instalado || typeof window === 'undefined') return () => {};
  instalado = true;

  const onError = (e: ErrorEvent) => {
    // Trozo de codigo de un build viejo (tras un despliegue): se recarga en vez
    // de reportar. Ver lib/chunkCaducado.ts.
    if (rescatarSiChunkCaducado(e.error ?? e.message)) return;
    reportarError(e.error ?? e.message, { pila: e.error?.stack });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    if (rescatarSiChunkCaducado(r)) return;
    reportarError(typeof r === 'string' ? r : r?.message ?? 'promesa rechazada sin motivo', {
      pila: typeof r === 'object' ? r?.stack : undefined,
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    instalado = false;
  };
}
