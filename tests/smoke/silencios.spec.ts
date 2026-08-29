import { test, expect } from '@playwright/test';
import {
  ERRORES_DE_SISTEMA,
  comprobarAnclas,
  erroresEnTexto,
  leerPromesasRotas,
  observarPromesasRotas,
  vigilarDialogos,
} from './silencios';

// Prueba de vida de los sensores de la familia 2a.
//
// En la primera corrida completa las 17 pantallas dieron CERO incidentes. Eso
// puede ser verdad (la demo funciona) o puede ser que los oidos no esten
// enchufados, y desde fuera se ven igual: los dos casos son un JSONL de ceros.
// De un vigilante que nadie ha visto cazar nada no sabemos si mira.
//
// Aqui se le da a cada sensor exactamente lo que tiene que detectar, sobre un
// documento de verdad servido por el mismo servidor que usa el smoke -- no un
// mock -- para que lo que se prueba sea el cableado completo.

test.describe('sensores de fallo silencioso', () => {
  test('el oido de promesas rotas oye una promesa rechazada', async ({ page }) => {
    await observarPromesasRotas(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      // Exactamente lo que hace un handler que se traga el error: una promesa
      // que nadie recoge. No hay excepcion sincrona, asi que `pageerror` -- el
      // unico oido que tenia el smoke -- no la oye.
      void Promise.reject(new Error('fallo de prueba del vigilante'));
    });
    await page.waitForTimeout(200);

    const rotas = await leerPromesasRotas(page);
    expect(rotas.join(' | '), 'el oido de unhandledrejection no ha recogido nada').toContain(
      'fallo de prueba del vigilante',
    );
  });

  test('el oido de dialogos oye un alert y lo descarta', async ({ page }) => {
    const dialogos = vigilarDialogos(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      alert('No se pudo eliminar al cliente.');
    });

    expect(dialogos.vistos()).toEqual([
      { tipo: 'alert', mensaje: 'No se pudo eliminar al cliente.' },
    ]);
  });

  test('un confirm no cuenta como fallo, pero se ve y se descarta', async ({ page }) => {
    const dialogos = vigilarDialogos(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Descartar (no aceptar) es lo que protege la demo compartida: un confirm
    // de borrado contestado que si ensuciaria el tenant.
    const respuesta = await page.evaluate(() => confirm('¿Seguro que quieres eliminar?'));

    expect(respuesta, 'el confirm no se ha descartado: la demo corre peligro').toBe(false);
    expect(dialogos.vistos().map((d) => d.tipo)).toEqual(['confirm']);
  });

  test('el catalogo reconoce los errores de sistema y no las validaciones', () => {
    // Un error de permiso si.
    expect(erroresEnTexto('Clientes\nNo tienes permisos para hacer esto.').map((e) => e.aguja)).toEqual(
      ['No tienes permis'],
    );

    // Un error crudo que llego a la cara del usuario, tambien.
    expect(
      erroresEnTexto('No se pudo guardar. (Detalles: 42501 - permission denied - )').length,
    ).toBe(1);

    // Una validacion de formulario NO: manosear a ciegas las dispara todo el
    // rato y meterlas convertiria esto en ruido de fondo.
    expect(erroresEnTexto('Falta rellenar el telefono.')).toEqual([]);
    expect(erroresEnTexto('Agenda del dia. Nueva cita.')).toEqual([]);
  });

  // El silenciador de telemetria de reportarError.js / lib/reportarError.ts se
  // apoya en esta bandera. Si Playwright dejara de marcarla, el silenciador se
  // quedaria ciego SIN DECIR NADA y este mismo fichero volveria a escribir
  // "fallo de prueba del vigilante" en errores_cliente cada hora, encima de los
  // errores de salones de verdad. Que se entere aqui y no en la tabla de
  // errores dentro de tres semanas: es la regla del ancla perdida.
  test('el navegador del smoke sigue anunciandose como automatizado', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(
      await page.evaluate(() => navigator.webdriver),
      'navigator.webdriver ya no es true: el silenciador de telemetria esta ciego y ' +
        'el canario ha vuelto a ensuciar errores_cliente. Ver esNavegadorAutomatizado().',
    ).toBe(true);

    // Y el silenciador tiene que estar cargado en la pagina, no solo ser cierto
    // en teoria: si reportarError.js dejara de incluirse, tampoco habria nadie
    // reportando y esto seria un verde por ausencia.
    expect(
      await page.evaluate(() => typeof (window as { reportarError?: unknown }).reportarError),
      'la landing ya no carga reportarError.js: nadie esta recogiendo los errores de los visitantes',
    ).toBe('function');
  });

  test('el catalogo sigue anclado a lib/errores.ts', () => {
    expect(ERRORES_DE_SISTEMA.length).toBeGreaterThan(3);
    comprobarAnclas();
  });
});
