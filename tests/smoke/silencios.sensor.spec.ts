// Prueba de que los sensores de silencio SIGUEN OYENDO (familia 2a).
//
// Los sensores de `silencios.ts` solo se disparan cuando algo falla, asi que en
// una corrida sana nunca producen nada. Un sensor que nadie ha visto nunca
// dispararse es un sensor del que no sabemos si funciona -- y este ademas
// depende de tres mecanismos fragiles: un `addInitScript` que tiene que
// engancharse antes de navegar, un evento de navegador (`unhandledrejection`)
// que Playwright no expone por su cuenta, y un vocabulario de frases que puede
// quedarse viejo.
//
// Asi que aqui se le da a cada sensor exactamente lo que tiene que cazar, en una
// pagina de mentira, y se comprueba que lo caza. Si algun dia el
// `addInitScript` deja de aplicarse o el evento cambia de nombre, esto se pone
// rojo el mismo dia en vez de dejar el sensor mudo dando verde para siempre.
//
// No necesita ni Supabase ni la demo: es autocontenida a proposito, para que
// tambien corra donde no hay red.
//
// POR QUE LA PAGINA DE PRUEBA SE NAVEGA Y NO SE PONE CON setContent
//
// La primera version usaba `page.setContent(...)`, y el sensor de rechazos NO
// oia nada. La causa tardo en verse porque las propiedades sobrevivian: se podia
// leer `window.__rechazos` perfectamente, con su array vacio. Lo que pasa es que
// `setContent` hace `document.open()` por dentro, y `document.open()` BORRA los
// listeners de eventos -- las variables se quedan, el `addEventListener` no. El
// listener que pone `addInitScript` desaparecia justo antes de hacer falta.
//
// En el smoke de verdad esto no ocurre: cada pantalla entra por `page.goto()` o
// reasignando el src del iframe, que son navegaciones reales y vuelven a
// ejecutar los init scripts sobre el documento nuevo. Asi que el fallo era del
// montaje de la prueba, no del sensor -- pero solo se supo despues de mirar,
// que es exactamente para lo que sirve tener la prueba.

import { test, expect } from '@playwright/test';
import {
  VOCABULARIO_DE_ERROR,
  erroresVisibles,
  leerRechazos,
  observarDialogos,
  observarRechazos,
} from './silencios';

const RUTA_FALSA = 'http://localhost:9/prueba-de-sensores';

const PAGINA = `
  <button id="rechaza">rechaza</button>
  <button id="avisa">avisa</button>
  <button id="alerta">alerta</button>
  <div id="salida"></div>
  <script>
    document.getElementById('rechaza').onclick = () => {
      // Una promesa rechazada que nadie captura: lo que 'pageerror' NO ve.
      Promise.reject(new Error('fallo de prueba del sensor'));
    };
    document.getElementById('avisa').onclick = () => {
      document.getElementById('salida').textContent = 'No tienes permisos para hacer esto.';
    };
    document.getElementById('alerta').onclick = () => {
      alert('No se pudo completar la accion. Intentalo de nuevo.');
    };
  </script>
`;

/** Sirve la pagina de prueba en una URL de mentira: navegacion real, sin red. */
async function abrirPaginaDePrueba(page: import('@playwright/test').Page) {
  await page.route('**/prueba-de-sensores', (r) =>
    r.fulfill({ contentType: 'text/html', body: PAGINA }),
  );
  await page.goto(RUTA_FALSA);
}

test('el sensor oye una promesa rechazada que nadie captura', async ({ page }) => {
  observarRechazos(page);
  await abrirPaginaDePrueba(page);

  // Antes de tocar nada no hay ninguno: si saliera algo aqui, el sensor estaria
  // inventandose hallazgos, que es tan malo como no oir.
  expect(await leerRechazos(page, true)).toEqual([]);

  await page.click('#rechaza');
  await page.waitForTimeout(200);

  const rechazos = await leerRechazos(page, true);
  expect(rechazos, 'el sensor de unhandledrejection no ha oido nada').toHaveLength(1);
  expect(rechazos[0]).toContain('fallo de prueba del sensor');
});

test('el sensor ve un aviso de error que sale al pulsar, y no antes', async ({ page }) => {
  await abrirPaginaDePrueba(page);

  expect(await erroresVisibles(page), 've un error donde no lo hay').toEqual([]);

  await page.click('#avisa');
  await expect(page.locator('#salida')).toContainText('No tienes permisos');

  expect(await erroresVisibles(page)).toContain('No tienes permisos');
});

test('el sensor apunta los alert() que Playwright descarta solo', async ({ page }) => {
  const dialogos = observarDialogos(page);
  await abrirPaginaDePrueba(page);

  await page.click('#alerta');
  await page.waitForTimeout(200);

  expect(dialogos.textos, 'el alert() no ha dejado rastro').toHaveLength(1);
  expect(dialogos.textos[0]).toContain('No se pudo');
});

test('el vocabulario no esta vacio ni se ha quedado en una sola frase', () => {
  // Que las frases sigan existiendo en lib/errores.ts lo comprueba
  // scripts/vigilantes/silencios.mjs en cada CI (y es bloqueante). Aqui solo se
  // vigila lo mas tonto: que alguien no vacie la lista y deje el sensor ciego
  // sin que falle nada.
  expect(VOCABULARIO_DE_ERROR.length).toBeGreaterThanOrEqual(5);
});
