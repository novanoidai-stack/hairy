import { test, expect } from '@playwright/test';

test.describe('Marketplace E2E Suite - mechaa.es/salones.html', () => {
  let pageErrors: Error[] = [];
  let consoleErrors: string[] = [];

  const gotoSalones = async (page: any) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('/salones.html', { waitUntil: 'commit', timeout: 10000 });
        break;
      } catch (e) {
        await page.waitForTimeout(500);
      }
    }
    await page.waitForSelector('form#form', { timeout: 10000 }).catch(() => {});
  };

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (exception) => {
      console.error('Captured page error:', exception.message);
      pageErrors.push(exception);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.warn('Captured console error:', msg.text());
        consoleErrors.push(msg.text());
      }
    });
  });

  test.afterEach(() => {
    expect(
      pageErrors,
      `Uncaught JS exceptions detected: ${pageErrors.map((e) => e.message).join(' | ')}`
    ).toHaveLength(0);
  });

  test('1. Initial Navigation & Marketplace Search Form Verification', async ({ page }) => {
    await gotoSalones(page);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).toContain('Mecha');

    const topHeader = page.locator('header.d-top');
    await expect(topHeader).toBeVisible();

    const searchForm = page.locator('form#form');
    await expect(searchForm).toBeVisible();
    await expect(page.locator('input#q')).toBeVisible();
    await expect(page.locator('input#ciudad')).toBeVisible();
    await expect(page.locator('form#form button[type="submit"]')).toBeVisible();
  });

  test('2. Search Form Functionality & Dynamic List Responses', async ({ page }) => {
    await gotoSalones(page);

    const qInput = page.locator('input#q');
    const ciudadInput = page.locator('input#ciudad');
    const submitBtn = page.locator('form#form button[type="submit"]');

    await expect(qInput).toBeVisible();
    await qInput.fill('Corte');
    await ciudadInput.fill('Madrid');

    await submitBtn.click();
    await page.waitForTimeout(1000);

    const listSec = page.locator('#list');
    await expect(listSec).toBeVisible();
  });

  test('3. Dynamic Lists (#destacados, #carrusel, #list) & Category Filters', async ({ page }) => {
    await gotoSalones(page);

    const destacados = page.locator('#destacados');
    const carrusel = page.locator('#carrusel');
    await expect(destacados).toBeAttached();
    await expect(carrusel).toBeAttached();

    const catButtons = page.locator('button[data-cat]');
    await catButtons.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    const count = await catButtons.count();
    expect(count).toBeGreaterThan(0);

    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = catButtons.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        const catName = await btn.getAttribute('data-cat');
        console.log(`Clicking category filter button: ${catName}`);
        await btn.click({ force: true });
        clicked = true;
        await page.waitForTimeout(1000);
        break;
      }
    }
    expect(clicked).toBe(true);

    const listSec = page.locator('#list');
    await expect(listSec).toBeVisible();
  });

  test('4. Salon Cards, Details Links & External Salon Items', async ({ page }) => {
    await gotoSalones(page);
    await page.waitForTimeout(1500);

    const carDer = page.locator('#car-der');
    if (await carDer.isVisible().catch(() => false)) {
      await carDer.click().catch(() => {});
    }

    const salonCards = page.locator('a.d-mini, a.d-res');
    const cardCount = await salonCards.count();
    console.log(`Verified ${cardCount} salon cards on marketplace.`);
    if (cardCount > 0) {
      const firstCard = salonCards.first();
      const href = await firstCard.getAttribute('href');
      expect(href).toMatch(/salon\.html/);
    }

    const externosSec = page.locator('#externos');
    await expect(externosSec).toBeAttached();

    const extItems = page.locator('#externos-lista .d-ext');
    const extCount = await extItems.count();
    console.log(`Verified ${extCount} external salon items.`);

    const cityLinks = page.locator('#ciudades a.d-ciudad');
    if (await cityLinks.count() > 0) {
      const cityLink = cityLinks.first();
      if (await cityLink.isVisible().catch(() => false)) {
        const cityHref = await cityLink.getAttribute('href');
        expect(cityHref).toContain('ciudad=');
      }
    }
  });
});
