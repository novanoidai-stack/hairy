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

export type TamanoTexto = 'pequeno' | 'mediano' | 'grande' | 'gigante';

// El tamano por defecto (el que lleva usando la app todo el mundo hasta ahora).
export const TAMANO_TEXTO_DEFECTO: TamanoTexto = 'pequeno';

// Escalas por modo. pequeno = 100% (sin zoom): es el mas EFICIENTE —cabe mas
// informacion por pantalla (agenda con mas columnas, listas mas densas)— a
// cambio de letras mas pequenas. mediano, grande y gigante agrandan para leer
// mejor.
export const ZOOMS_TEXTO: Record<TamanoTexto, number> = {
  pequeno: 1,
  mediano: 1.08,
  grande: 1.15,
  gigante: 1.3,
};

const CLAVE_LS = 'mecha:tamanoTexto';
// Cambio en esta misma pestana (el evento 'storage' solo cruza pestanas).
export const EVENTO_TAMANO_TEXTO = 'mecha:tamanoTexto-cambio';

// Compatibilidad: los primeros dias del ajuste solo existian 'normal'/'grande'.
// 'normal' es lo que hoy se llama 'pequeno'.
export function esTamanoTexto(v: unknown): v is TamanoTexto {
  if (v === 'normal') return true;
  return (
    v === 'pequeno' ||
    v === 'mediano' ||
    v === 'grande' ||
    v === 'gigante'
  );
}

export function normalizarTamanoTexto(v: unknown): TamanoTexto {
  if (v === 'normal') return 'pequeno'; // legado de la primera version
  return esTamanoTexto(v) ? v : TAMANO_TEXTO_DEFECTO;
}

export function aplicarTamanoTexto(v: TamanoTexto) {
  if (typeof document === 'undefined') return;
  const zoom = ZOOMS_TEXTO[v] ?? 1;
  document.documentElement.style.zoom = zoom === 1 ? '' : String(zoom);
  // Las pantallas usan height:100vh para llenar el viewport. Con zoom, 100vh
  // sigue siendo el viewport SIN zoom, asi que un 100vh se vuelve 130% de la
  // pantalla en modo gigante y el fondo de la pantalla queda inalcanzable
  // (no se podia volver a Pequeno desde Gigante). Exponemos el zoom en una
  // variable CSS y las alturas se dividen: calc(100vh / var(--mecha-zoom, 1)).
  document.documentElement.style.setProperty('--mecha-zoom', String(zoom));
}

export function leerTamanoTexto(): TamanoTexto {
  try {
    const v = localStorage.getItem(CLAVE_LS);
    return normalizarTamanoTexto(v);
  } catch {
    return TAMANO_TEXTO_DEFECTO;
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
