// Sensores de silencio para el smoke de pantallas (familia 2a del plan de fase 2).
//
// QUE SE LES ESCAPA HOY A LOS OIDOS DEL SMOKE
//
// `pantallas.spec.ts` escucha `console`, `pageerror`, `requestfailed` y
// `response`. Con eso caza una pantalla que revienta al cargar, pero se le
// escapan las dos formas en que un boton falla SIN romper nada:
//
//   1. Una promesa rechazada que nadie captura. `pageerror` NO la ve: ese evento
//      es para excepciones sincronas. El navegador tiene su propio evento para
//      esto -- `unhandledrejection` -- y hay que engancharlo a mano.
//
//   2. Un error que la app SI maneja y le enseña a la persona: un aviso rojo,
//      un toast, un alert. Para el smoke de hoy eso es un exito ("la pantalla no
//      se quedo en blanco"), y para la peluquera es un boton que no funciona.
//
// COMO SE DETECTA EL AVISO DE ERROR SIN INVENTARSE SELECTORES
//
// La tentacion es buscar `.toast` o `[role="alert"]`. En este design system no
// existe ninguno de los dos: los errores salen por `setMensaje({type:'error'})`,
// por un evento `mecha-toast` y por `alert()`, cada pantalla con su marca. Un
// selector inventado no encontraria nada nunca y el sensor naceria ciego -- que
// es peor que no tenerlo.
//
// Lo que si es unico y estable es el VOCABULARIO: `lib/errores.ts` es la fuente
// unica de los mensajes de error que ve un usuario, y esas frases no aparecen en
// la UI por ningun otro motivo. Asi que se busca el texto, no la caja que lo
// contiene. Y como el ancla es un fichero de verdad,
// `scripts/vigilantes/silencios.mjs` comprueba en cada CI que esas frases siguen
// estando en `lib/errores.ts`: si alguien reescribe los mensajes, nos enteramos
// de que este sensor se ha quedado sordo en vez de verlo dar verde para siempre.

import { appendFileSync } from 'node:fs';
import process from 'node:process';
import type { Page, FrameLocator } from '@playwright/test';

/**
 * Frases de `lib/errores.ts` que solo salen cuando algo ha fallado de verdad.
 *
 * Se eligen por ser inconfundibles: ninguna aparece en la UI en un flujo normal.
 * Quedan fuera a proposito los mensajes cortos y ambiguos ("No es valido"), que
 * darian falsos positivos con cualquier ayuda de un formulario.
 */
export const VOCABULARIO_DE_ERROR = [
  'No tienes permisos',
  'Sin conexion',
  'No se pudo',
  'Falta rellenar',
  'Ya existe un registro',
  'Demasiados intentos',
  'Hay un valor con formato incorrecto',
] as const;

export type Silencios = {
  pantalla: string;
  /** Promesas rechazadas que nadie capturo. */
  rechazos: string[];
  /** Avisos de error que aparecieron AL PULSAR, con el boton que los saco. */
  errores_ui: { boton: string; texto: string }[];
  /** alert()/confirm() con texto de error. */
  dialogos: string[];
};

/**
 * Engancha `unhandledrejection` en TODOS los documentos que cree esta pagina.
 *
 * Va con `addInitScript` y ANTES de navegar, igual que el observador de long
 * tasks: la app vive en un iframe y se le reasigna el src por cada pantalla, asi
 * que un listener puesto despues se lo pierde.
 */
export function observarRechazos(page: Page): void {
  void page.addInitScript(() => {
    const w = window as unknown as { __rechazos?: string[] };
    w.__rechazos = [];
    window.addEventListener('unhandledrejection', (e) => {
      const r = (e as PromiseRejectionEvent).reason;
      const texto = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
      // El mismo rechazo repetido en bucle no aporta nada y llena el informe.
      if (!w.__rechazos!.includes(texto)) w.__rechazos!.push(texto.slice(0, 300));
    });
  });
}

/** Recoge los alert()/confirm() que la app abra. Playwright los descarta solo. */
export function observarDialogos(page: Page): { textos: string[] } {
  const textos: string[] = [];
  page.on('dialog', (d) => {
    textos.push(d.message().slice(0, 300));
    void d.dismiss().catch(() => {
      // error-ignorado: el dialogo ya lo cerro el auto-dismiss de Playwright.
      // Aqui solo importa haber apuntado el texto.
    });
  });
  return { textos };
}

/** Lee los rechazos acumulados en el documento de la pantalla (iframe o pagina). */
export async function leerRechazos(page: Page, esPublica: boolean): Promise<string[]> {
  const codigo = '(() => (window.__rechazos || []))()';
  try {
    if (esPublica) return await page.evaluate(codigo);
    const f = page.frames().find((fr) => fr.url().includes('/app'));
    return f ? await f.evaluate(codigo) : [];
  } catch {
    // error-ignorado: si el documento se esta renavegando justo ahora, no hay
    // rechazos que leer. Perder una medida no puede tumbar el smoke.
    return [];
  }
}

/**
 * Frases de error visibles en la pantalla ahora mismo.
 *
 * Devuelve las frases del vocabulario que aparecen en el texto del cuerpo. Se
 * compara contra la foto anterior para saber si un clic las ha SACADO -- una que
 * ya estaba antes no es culpa del boton que acabamos de pulsar.
 */
export async function erroresVisibles(donde: Page | FrameLocator): Promise<string[]> {
  let cuerpo = '';
  try {
    cuerpo = (await donde.locator('body').innerText({ timeout: 2000 })) || '';
  } catch {
    // error-ignorado: la pantalla esta repintando. La siguiente pasada la vera.
    return [];
  }
  return VOCABULARIO_DE_ERROR.filter((f) => cuerpo.includes(f));
}

/** Una linea por pantalla en el JSONL de la corrida. */
export function apuntarSilencios(s: Silencios): void {
  const destino = process.env.SILENCIOS_OUT || 'silencios.jsonl';
  appendFileSync(destino, `${JSON.stringify(s)}\n`, 'utf8');
}
