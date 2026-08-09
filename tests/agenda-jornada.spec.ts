import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';

// Agenda: jornada real por profesional y "Enseñamelo" paso a paso.
//
// Contexto de los bugs que blindan estos tests:
//   - La rejilla pintaba a TODOS los profesionales con la ventana del salon
//     porque nunca cargaba horarios_profesional.
//   - El bloque que derivaba la pausa de comida leia `horarios`
//     (negocio_horarios), que no tiene ni profesional_id ni hora_fin: salia
//     siempre vacio y no pinto nada jamas.
//   - horarios_profesional NO tiene columna negocio_id; filtrar por ella
//     devuelve cero filas en silencio.
//   - "Enseñamelo" encendia TODOS los problemas del dia a la vez.
//
// Requiere sesion: la agenda no es publica, y ademas horarios_profesional y
// bloqueos_profesional tienen RLS de "own negocio" (por eso esto NO se puede
// verificar en la demo, que es anonima). La sesion la deja tests/auth.setup.ts.

// Con sesion viva, /acceso.html ofrece el selector "quien eres" y de ahi al
// software; ir directo a /app/ rebota al login.
async function entrarAlSoftware(page: any) {
  await page.goto('/acceso.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const ch = page.locator('button#chApp, button:has-text("Entrar al software")').first();
  if (await ch.isVisible().catch(() => false)) await ch.click();
  await page.waitForURL(/\/app/, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(9000);
  if (!/\/app/.test(page.url())) test.skip(true, 'no se pudo entrar al software (sesion caducada)');
}

// Este spec SI necesita estar dentro del software. El resto de specs son
// publicos y deben correr anonimos, asi que la sesion se declara aqui y no en
// la configuracion global.
test.use({ storageState: STORAGE_STATE });

test.describe('Agenda — jornada real', () => {
  test('la rejilla marca la jornada propia de cada profesional', async ({ page }) => {
    await entrarAlSoftware(page);

    const html = await page.evaluate(() => document.body.innerHTML);
    // "Fuera de jornada" = entra mas tarde o termina antes que el salon.
    // "No trabaja este dia" = tiene horario configurado pero ninguno hoy.
    const marca = /Fuera de jornada|No trabaja este dia/.test(html);
    expect(marca, 'la rejilla no marca ninguna jornada propia').toBe(true);
  });

  test('Enseñamelo resalta un problema cada vez, no todos a la vez', async ({ page }) => {
    await entrarAlSoftware(page);

    const toggle = page.getByRole('button', { name: /Enséñamelo|Ensenamelo/i }).first();
    if ((await toggle.count()) === 0) test.skip(true, 'no hay boton Enseñamelo en esta vista');
    await toggle.click();
    await page.waitForTimeout(1500);

    const zonas = await page.evaluate(() => document.querySelectorAll('[data-mecha-zona]').length);
    // 0 = el dia no tiene problemas (valido). Lo que NO puede pasar es que se
    // enciendan varios: eso era exactamente el bug.
    expect(zonas, 'se resalto mas de un problema a la vez').toBeLessThanOrEqual(1);
  });
});
