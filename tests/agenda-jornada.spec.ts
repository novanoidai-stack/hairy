import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware as abrirSoftware } from './helpers/software';

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

// La sesion de tests/auth.setup.ts vive en el localStorage del mismo origen,
// asi que /app la encuentra sin pasar por acceso.html. Se espera a que la
// rejilla del dia este pintada (condicion), no a un numero de segundos: antes
// eran 4 s + 9 s a ojo y el resultado dependia de si ese dia habia dado tiempo.
async function entrarALaAgenda(page: any) {
  await abrirSoftware(page, '/app');
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible({ timeout: 30000 });
}

// Este spec SI necesita estar dentro del software. El resto de specs son
// publicos y deben correr anonimos, asi que la sesion se declara aqui y no en
// la configuracion global.
test.use({ storageState: STORAGE_STATE });

test.describe('Agenda — jornada real', () => {
  test('la rejilla marca la jornada propia de cada profesional', async ({ page }) => {
    await entrarALaAgenda(page);

    // "Fuera de jornada" = entra mas tarde o termina antes que el salon.
    // "No trabaja este dia" = tiene horario configurado pero ninguno hoy.
    // Se espera a la marca en vez de leer el HTML de golpe: la rejilla pinta
    // los horarios propios cuando llega su consulta, no al montar.
    await expect(
      page.getByText(/Fuera de jornada|No trabaja este dia/).first(),
      'la rejilla no marca ninguna jornada propia',
    ).toBeAttached({ timeout: 30000 });
  });

  test('Enseñamelo resalta un problema cada vez, no todos a la vez', async ({ page }) => {
    await entrarALaAgenda(page);

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
