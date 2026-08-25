// Modo "Texto grande": agranda TODA la interfaz de Mecha (letras, botones,
// desplegables, agenda, dashboard, informes) para leer mas comodo.
//
// Como toda la app pinta con estilos inline en px, no hay forma de escalar
// "solo las letras" sin reescribir miles de estilos. Lo que si escala todo de
// forma proporcional —sin deformar nada, re-fluyendo el layout igual que el
// zoom del navegador— es el zoom de CSS aplicado a <html>. Es lo que usa este
// modulo: un unico punto de verdad, aplicado antes de que se pinte la app.
//
// Persistencia:
//   - negocio_config.tamanoTexto ('normal' | 'grande') -> por cuenta, se
//     sincroniza entre dispositivos y navegadores.
//   - localStorage (cache) -> aplica al arrancar sin esperar a la red, y
//     sobrevive a recargas en este navegador.

export type TamanoTexto = 'normal' | 'grande';

// +15%: suficiente para notarlo en todo (13px -> ~15px) sin que las rejillas
// estrechas (agenda con muchas columnas) se vuelvan incomodas.
export const ZOOM_TEXTO_GRANDE = 1.15;

const CLAVE_LS = 'mecha:tamanoTexto';
// Cambio en esta misma pestana (el evento 'storage' solo cruza pestanas).
export const EVENTO_TAMANO_TEXTO = 'mecha:tamanoTexto-cambio';

export function esTamanoTexto(v: unknown): v is TamanoTexto {
  return v === 'normal' || v === 'grande';
}

export function aplicarTamanoTexto(v: TamanoTexto) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.zoom =
    v === 'grande' ? String(ZOOM_TEXTO_GRANDE) : '';
}

export function leerTamanoTexto(): TamanoTexto {
  try {
    const v = localStorage.getItem(CLAVE_LS);
    return esTamanoTexto(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

function cachear(v: TamanoTexto) {
  try {
    localStorage.setItem(CLAVE_LS, v);
  } catch {
    /* modo privado: sin almacen solo vive el zoom de esta sesion */
  }
}

// Aplica, cachea y avisa (misma pestana + resto de pestanas abiertas).
export function guardarYAplicarTamanoTexto(v: TamanoTexto) {
  cachear(v);
  aplicarTamanoTexto(v);
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TAMANO_TEXTO, { detail: v }));
  } catch {
    /* sin window (nativo): no hay nada que avisar */
  }
}

// Igual que guardarYAplicarTamanoTexto pero sin avisar: para reconciliar al
// arrancar con lo que dice la cuenta (aqui no hay "cambio" que propagar, las
// demas pestanas ya habran hecho su propia reconciliacion).
export function sincronizarTamanoTexto(v: TamanoTexto) {
  cachear(v);
  aplicarTamanoTexto(v);
}
