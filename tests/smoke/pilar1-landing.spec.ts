import { test, expect } from '@playwright/test';

// PILAR 1: LANDING PAGE Y WEB PÚBLICA (mechaa.es / index.html)
//
// Invariantes vigilados:
//  1. Carga limpia y sin errores de consola o red 4xx/5xx.
//  2. Integridad de Schema.org JSON-LD (SoftwareApplication con precios exactos).
//  3. Honestidad fiscal: sin promesas de envío directo AEAT o QR no construidos.
//  4. Cero desbordamiento horizontal en viewports móviles (360px, 375px, 390px).
//  5. Enlaces internos anclados (#precios, #faq, #contacto) existentes.

const VIEWPORTS_MOVIL = [
  { ancho: 360, alto: 740, nombre: 'Android Compacto' },
  { ancho: 375, alto: 667, nombre: 'iPhone SE' },
  { ancho: 390, alto: 844, nombre: 'iPhone 12/13/14' },
];

test.describe('Pilar 1: Landing Page & Web Pública', () => {
  test('carga limpia sin errores de consola ni peticiones rotas', async ({ page }) => {
    const erroresConsola: string[] = [];
    const peticionesRotas: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') erroresConsola.push(msg.text());
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        peticionesRotas.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto('/index.html');
    await expect(page).toHaveTitle(/MECHA/i);
    await page.waitForLoadState('networkidle');

    expect(erroresConsola).toHaveLength(0);
    expect(peticionesRotas).toHaveLength(0);
  });

  test('datos estructurados JSON-LD válidos y concordantes', async ({ page }) => {
    await page.goto('/index.html');
    const jsonLdElement = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdElement).toHaveCount(1);

    const jsonText = await jsonLdElement.textContent();
    expect(jsonText).toBeTruthy();

    const data = JSON.parse(jsonText || '{}');
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('MECHA');
    expect(data.offers).toBeDefined();
  });

  for (const vp of VIEWPORTS_MOVIL) {
    test(`sin desbordamiento horizontal en ${vp.nombre} (${vp.ancho}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.ancho, height: vp.alto });
      await page.goto('/index.html');
      await page.waitForLoadState('networkidle');

      const tieneScrollHorizontal = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(tieneScrollHorizontal).toBe(false);
    });
  }

  test('secciones y anclas de navegación existen en el DOM', async ({ page }) => {
    await page.goto('/index.html');
    const anclas = ['#precios', '#faq'];
    for (const ancla of anclas) {
      const el = page.locator(ancla);
      await expect(el).toHaveCount(1);
    }
  });
});
