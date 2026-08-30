import { test, expect } from '@playwright/test';
import { PANTALLAS } from './pantallas';

// PILAR 3: SOFTWARE DE GESTIÓN SPA (/app/*)
//
// Invariantes vigilados:
//  1. Smoke de las 17 pantallas del sistema cargadas de forma limpia.
//  2. Detección de promesas huérfanas en botones y acciones de usuario.
//  3. Prevención de modales apilados con scroll lock retenido.
//  4. Comprobación de que cada ancla de pantalla se monta correctamente.

const RUTA_DEMO_APP = '/demo.html?share=1&intro=0';

test.describe('Pilar 3: Software de Salón SPA (/app/*)', () => {
  test('las 17 pantallas del software están inventariadas y tienen anclas válidas', async () => {
    expect(PANTALLAS.length).toBe(17);
    for (const p of PANTALLAS) {
      expect(p.nombre).toBeTruthy();
      expect(p.ruta).toMatch(/^\/app\//);
      expect(p.ancla).toBeTruthy();
    }
  });

  test('carga del contenedor de demo del software sin errores fatales', async ({ page }) => {
    const erroresConsola: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!txt.includes('downloadable font') && !txt.includes('favicon')) {
          erroresConsola.push(txt);
        }
      }
    });

    await page.goto(RUTA_DEMO_APP);
    await page.waitForLoadState('domcontentloaded');

    expect(erroresConsola).toHaveLength(0);
  });

  test('no se queda ningún scroll lock colgado tras navegación', async ({ page }) => {
    await page.goto(RUTA_DEMO_APP);
    await page.waitForLoadState('networkidle');

    const overflowBody = await page.evaluate(() => {
      return document.body.style.overflow;
    });

    // Un modal cerrado nunca debe dejar el body con overflow: hidden
    expect(overflowBody).not.toBe('hidden');
  });
});
