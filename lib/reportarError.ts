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

import { supabase, IS_DEMO_MODE } from './supabase';

const yaEnviados = new Set<string>();

export type OrigenError = 'app' | 'portal' | 'landing';
export type TipoError = 'excepcion' | 'operativo' | 'ia';

function rutaActual(): string {
  if (typeof window === 'undefined') return '';
  try {
    return `${window.location.pathname}${window.location.search}`.slice(0, 200);
  } catch {
    return '';
  }
}

export function reportarError(
  error: unknown,
  o: { origen?: OrigenError; pila?: string; tipo?: TipoError } = {},
): void {
  try {
    if (IS_DEMO_MODE) return;
    const err = error as { message?: string; stack?: string } | null;
    const mensaje = String(err?.message ?? error ?? '').trim();
    if (!mensaje) return;

    const ruta = rutaActual();
    const clave = `${mensaje}|${ruta}`;
    if (yaEnviados.has(clave)) return;
    yaEnviados.add(clave);

    void supabase
      .rpc('registrar_error_cliente', {
        p_mensaje: mensaje,
        p_ruta: ruta,
        p_pila: (o.pila ?? err?.stack ?? '').slice(0, 2000),
        p_origen: o.origen ?? (ruta.startsWith('/r/') || ruta.startsWith('/cita/') ? 'portal' : 'app'),
        p_navegador: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
        p_tipo: o.tipo ?? 'excepcion',
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // Un fallo del que avisa de fallos no puede tumbar la pantalla.
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
    reportarError(e.error ?? e.message, { pila: e.error?.stack });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
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
