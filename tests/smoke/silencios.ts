// Familia 2a del plan de fase 2: los sensores de FALLO SILENCIOSO del smoke.
//
// El smoke ya pulsa cada boton y comprueba que la pantalla no se queda en
// blanco. Eso caza el fallo ruidoso. El que de verdad duele en un salon no hace
// ruido: se pulsa "Guardar", algo falla, y la pantalla se queda igual. Aqui se
// le ponen tres oidos a ese silencio.
//
//   1. promesas rotas   `unhandledrejection` en TODOS los documentos. Playwright
//                       no las caza: `page.on('pageerror')` solo ve excepciones
//                       sincronas. Y la app vive dentro de un iframe, asi que
//                       hay que escuchar en cada documento, no en la pagina.
//   2. dialogos         Hay 124 `alert(...)`/`confirm(...)` en app/ y
//                       components/. Playwright los descarta solo, asi que un
//                       `alert('No se pudo eliminar…')` tras un clic es HOY
//                       literalmente invisible en la CI.
//   3. errores en pantalla
//                       Texto de error que aparece tras un clic y no estaba
//                       antes.
//
// POR QUE NO SE BUSCAN TOASTS
// El plan proponia detectarlos por `.toast`, `[role="alert"]` o "la clase de
// error del design system". Medido en el repo: CERO `role="alert"` y CERO
// `testID` en app/ y components/. El unico toast del producto es un div con
// estilos en linea, y ademas es VERDE (confirmaciones). Un detector montado
// sobre esos selectores nacia ciego, que es justo lo que prohibe la regla 1.
//
// El ancla que si existe es `lib/errores.ts`: por `mensajeDeError()` pasan las
// 127 llamadas que producen todo mensaje de error que ve un usuario. De ahi sale
// el catalogo de abajo, y por eso `comprobarAnclas()` FALLA si alguna de esas
// frases desaparece de ese fichero: significaria que este detector lleva un rato
// buscando algo que ya no se escribe.

import { readFileSync } from 'node:fs';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Dialog, Page } from '@playwright/test';

const ERRORES_TS = path.join(process.cwd(), 'lib/errores.ts');

/**
 * Frases que solo salen cuando algo ha ido MAL de verdad, no cuando un
 * formulario esta vacio.
 *
 * Se dejan fuera a proposito las de validacion ("Falta rellenar…", "El valor de
 * … no es valido"): manosear una pantalla a ciegas dispara validaciones
 * legitimas todo el rato, y meterlas aqui convertiria esto en ruido de fondo.
 * Lo que queda es fallo de sistema: permiso denegado, red caida, choque de
 * datos, o un error que llego crudo a la cara del usuario.
 */
export const ERRORES_DE_SISTEMA: { aguja: string; que: string }[] = [
  {
    // El fallback de resolverMensaje() cuando no reconoce el error. Que esto
    // salga en pantalla ya es un defecto por si solo: el propio codigo lo llama
    // "PARCHE TEMPORAL".
    aguja: '(Detalles:',
    que: 'un error crudo ha llegado a la pantalla sin traducir',
  },
  { aguja: 'No tienes permis', que: 'permiso denegado (RLS o rol)' },
  { aguja: 'Sin conexion.', que: 'la app se ha quedado sin red' },
  { aguja: 'Ya existe un registro con', que: 'choque de datos (clave duplicada)' },
  { aguja: 'Demasiados intentos.', que: 'limite de intentos alcanzado' },
  { aguja: 'este dato esta vinculado a otros', que: 'borrado bloqueado por dependencias' },
];

/**
 * El catalogo tiene que seguir viviendo en lib/errores.ts. Si una frase ya no
 * esta, este detector se ha quedado ciego para ese caso -- y un vigilante ciego
 * pasa en verde sin haber mirado, que es peor que no tenerlo.
 */
export function comprobarAnclas(): void {
  const fuente = readFileSync(ERRORES_TS, 'utf8');
  const perdidas = ERRORES_DE_SISTEMA.filter((e) => !fuente.includes(e.aguja)).map((e) => e.aguja);
  if (perdidas.length) {
    throw new Error(
      `El catalogo de errores de tests/smoke/silencios.ts ya no casa con lib/errores.ts. ` +
        `Frases que han desaparecido de alli: ${perdidas.join(' | ')}. ` +
        'O se han reescrito los mensajes (y hay que actualizar el catalogo) o se han ' +
        'borrado. Mientras tanto, el detector de fallos silenciosos esta ciego para ellas.',
    );
  }
}

export type Incidente = {
  tipo: 'promesa-rota' | 'dialogo' | 'error-en-pantalla';
  boton: string;
  detalle: string;
};

export type Silencios = {
  pantalla: string;
  incidentes: Incidente[];
};

// --- 1. Promesas rotas ------------------------------------------------------

/**
 * Engancha el oido en TODOS los documentos que cree esta pagina, antes de
 * navegar (como observarLongTasks). La app instala su propio manejador
 * (lib/reportarError.ts) pero no llama a preventDefault, asi que los dos oyen.
 */
export async function observarPromesasRotas(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __promesasRotas?: string[] };
    w.__promesasRotas = [];
    window.addEventListener('unhandledrejection', (e) => {
      const r = (e as PromiseRejectionEvent).reason as { message?: string } | string | undefined;
      const texto = typeof r === 'string' ? r : (r?.message ?? 'promesa rechazada sin motivo');
      // Un bucle de render puede lanzar la misma cientos de veces: la lista se
      // queda corta a proposito para no llenar la memoria del navegador.
      if (w.__promesasRotas!.length < 50) w.__promesasRotas!.push(String(texto).slice(0, 300));
    });
  });
}

/** Lee la lista de cada documento (la pagina y el iframe de la app). */
export async function leerPromesasRotas(page: Page): Promise<string[]> {
  const salida: string[] = [];
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate(
        () => (window as unknown as { __promesasRotas?: string[] }).__promesasRotas ?? [],
      );
      if (Array.isArray(r)) salida.push(...r);
    } catch {
      // El documento estaba navegando: no es un fallo del producto.
    }
  }
  return salida;
}

// --- 2. Dialogos nativos ----------------------------------------------------

export type Dialogos = { vistos: () => { tipo: string; mensaje: string }[] };

/**
 * Recoge alert/confirm/prompt y los DESCARTA.
 *
 * Descartar (y no aceptar) es deliberado: la demo es compartida y aceptar un
 * `confirm` de borrado ensuciaria el tenant y obligaria a resembrarlo. Es
 * ademas lo que Playwright ya hace por su cuenta cuando nadie escucha, asi que
 * poner este oido no cambia el comportamiento del smoke: solo deja de tirar la
 * informacion a la basura.
 */
export function vigilarDialogos(page: Page): Dialogos {
  const vistos: { tipo: string; mensaje: string }[] = [];
  page.on('dialog', (d: Dialog) => {
    vistos.push({ tipo: d.type(), mensaje: d.message().slice(0, 300) });
    void d.dismiss().catch(() => {});
  });
  return { vistos: () => vistos };
}

// --- 3. Errores en pantalla -------------------------------------------------

/** Que frases del catalogo aparecen en este texto. */
export function erroresEnTexto(texto: string): { aguja: string; que: string }[] {
  return ERRORES_DE_SISTEMA.filter((e) => texto.includes(e.aguja));
}

// --- Salida -----------------------------------------------------------------

/**
 * Una linea por pantalla en el JSONL de la corrida, igual que las mediciones de
 * rendimiento. Lo traduce a hallazgos `scripts/vigilantes/silencios.mjs`.
 *
 * Se escribe SIEMPRE, aunque no haya incidentes: si solo escribieran las
 * pantallas con problemas, no habria forma de distinguir "esta limpia" de "no
 * se ha medido", y el panel se veria verde por ausencia de datos.
 */
export function apuntarSilencios(s: Silencios): void {
  const destino = process.env.SILENCIOS_OUT || 'silencios.jsonl';
  appendFileSync(destino, `${JSON.stringify(s)}\n`, 'utf8');
}
