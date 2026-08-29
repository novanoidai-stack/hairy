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

  test('el catalogo sigue anclado a lib/errores.ts', () => {
    expect(ERRORES_DE_SISTEMA.length).toBeGreaterThan(3);
    comprobarAnclas();
  });
});
