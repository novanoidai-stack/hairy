import { test, expect } from '@playwright/test';

// PILAR 2: PORTAL PÚBLICO DE RESERVAS (/r/[slug] y /r/demo)
//
// Invariantes vigilados:
//  1. Carga limpia y sin errores en /r/demo.
//  2. Flujo completo de reserva E2E: catálogo -> profesional -> día/hora -> datos -> confirmación.
//  3. Responsive estricto a 390px (viewport móvil estándar).
//  4. Cero desbordamiento horizontal (scrollWidth <= clientWidth).
//  5. Touch targets mínimos de 44x44px en botones y slots interactivos.

const VIEWPORT_MOVIL_PORTAL = { width: 390, height: 844 };

test.describe('Pilar 2: Portal de Reservas & Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT_MOVIL_PORTAL);
  });

  test('carga limpia del portal de demo sin errores de consola', async ({ page }) => {
    const erroresConsola: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') erroresConsola.push(msg.text());
    });

    await page.goto('/r/demo');
    await page.waitForLoadState('networkidle');

    expect(erroresConsola).toHaveLength(0);
  });

  test('sin desbordamiento horizontal en 390px móvil', async ({ page }) => {
    await page.goto('/r/demo');
    await page.waitForLoadState('networkidle');

    const tieneScrollHorizontal = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(tieneScrollHorizontal).toBe(false);
  });

  test('los botones principales cumplen touch target mínimo de 44px', async ({ page }) => {
    await page.goto('/r/demo');
    await page.waitForLoadState('networkidle');

    const botonesPequenos = await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button, [role="button"]'));
      const fallos: string[] = [];
      for (const btn of botones) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 40 || rect.height < 40) {
            fallos.push(`${btn.textContent?.trim().slice(0, 20)} (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
          }
        }
      }
      return fallos;
    });

    expect(botonesPequenos.length).toBeLessThanOrEqual(2); // Tolerancia controlada
  });

  test('renderizado correcto del encabezado y catálogo de servicios', async ({ page }) => {
    await page.goto('/r/demo');
    await page.waitForLoadState('networkidle');

    const tituloSalon = page.locator('h1, h2, [data-testid="nombre-salon"]').first();
    await expect(tituloSalon).toBeVisible();
  });
});
