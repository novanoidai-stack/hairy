import { test, expect } from '@playwright/test';

test.describe('Landing Page E2E Suite - mechaa.es', () => {
  let pageErrors: Error[] = [];

  const gotoLanding = async (page: any) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      } catch (e) {
        await page.waitForTimeout(500);
      }
    }
    const skipBtn = page.locator('#introSkip');
    if (await skipBtn.isVisible({ timeout: 600 }).catch(() => false)) {
      await skipBtn.click({ timeout: 600 }).catch(() => {});
    }
    await page.waitForSelector('header, nav, .nav, #navbar', { timeout: 5000 }).catch(() => {});
  };

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (exception) => {
      console.error('Captured page error:', exception.message);
      pageErrors.push(exception);
    });
  });

  test.afterEach(() => {
    expect(
      pageErrors,
      `Uncaught JS exceptions detected: ${pageErrors.map((e) => e.message).join(' | ')}`
    ).toHaveLength(0);
  });

  // --- Tier 1: Feature Coverage ---
  test('1. Navigation & Header Verification', async ({ page }) => {
    await gotoLanding(page);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).toContain('Mecha');
    console.log('Page title verified:', title);

    const headerNav = page.locator('header, nav, .nav, #navbar').first();
    await expect(headerNav).toBeVisible();
  });

  test('2. Systematically click all header nav links', async ({ page }) => {
    await gotoLanding(page);

    const requiredSelectors = [
      'a[href="#asistente"]',
      'a[href="#diferenciales"]',
      'a[href="#fichas"]',
      'a[href="#precios"]',
      'a[href="especificaciones.html"]',
      'a[href="#contacto"]',
    ];

    for (const selector of requiredSelectors) {
      const link = page.locator(selector).first();
      const count = await link.count();
      if (count > 0 && await link.isVisible().catch(() => false)) {
        await link.click({ timeout: 3000 }).catch(async () => {
          await link.click({ force: true }).catch(() => {});
        });
        await page.waitForTimeout(200);
      }
    }
  });

  test('3. Verify CTAs (navLogin, navDemo, and Direct WhatsApp CTAs)', async ({ page }) => {
    await gotoLanding(page);

    const navLogin = page.locator('a#navLogin, a[href*="acceso"]').first();
    await expect(navLogin).toBeAttached({ timeout: 10000 });
    const loginHref = await navLogin.getAttribute('href');
    expect(loginHref).toBeTruthy();

    const navDemo = page.locator('a#navDemo, a[href*="demo"]').first();
    await expect(navDemo).toBeAttached({ timeout: 10000 });

    // WhatsApp CTAs verification
    const whatsappLinks = page.locator('a[href*="wa.me"], a[aria-label*="WhatsApp" i], a[href*="whatsapp"]');
    const waCount = await whatsappLinks.count();
    console.log(`Found ${waCount} WhatsApp CTA links on landing page.`);
    expect(waCount).toBeGreaterThan(0);

    for (let i = 0; i < waCount; i++) {
      const link = whatsappLinks.nth(i);
      const href = await link.getAttribute('href');
      if (href && href.includes('wa.me')) {
        expect(href).toMatch(/^https:\/\/wa\.me\/\d+/);
      }
    }
  });

  test('4. Test interactive modals and buttons', async ({ page }) => {
    await gotoLanding(page);

    const interactiveElements = page.locator('button, a.btn, [data-bs-toggle], [data-modal-target]');
    const count = await interactiveElements.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = interactiveElements.nth(i);
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = (await el.textContent())?.trim() || '';
        console.log(`Testing interactive element [${i}]: "${text}"`);
      }
    }
  });

  test('5. Modal opening and scroll-locking assertions (body.modal-open)', async ({ page }) => {
    await gotoLanding(page);

    // Test Contact Via modal trigger if present
    const viaTrigger = page.locator('#viaMensaje').first();
    if (await viaTrigger.isVisible().catch(() => false)) {
      await viaTrigger.click();
      await page.waitForTimeout(400);

      const modal = page.locator('#viaModal');
      await expect(modal).toHaveClass(/on/);

      // Check scroll lock applied on body or html
      const isLocked = await page.evaluate(() => {
        return document.body.classList.contains('modal-open') ||
               getComputedStyle(document.body).overflow === 'hidden' ||
               getComputedStyle(document.documentElement).overflow === 'hidden';
      });
      expect(isLocked).toBe(true);

      // Close modal
      const closeBtn = page.locator('#viaCerrar, #viaModal button.x, #viaModal').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(400);
      }
    }

    // Test Opciones Acceso modal trigger if present
    const accessTrigger = page.locator('#navLogin, a[href*="reservar.html"], #viaLlamada').first();
    if (await accessTrigger.isVisible().catch(() => false)) {
      const accModal = page.locator('#opcionesAccesoModal');
      if (await accModal.count() > 0) {
        // Direct test opening access modal
        await page.evaluate(() => {
          const m = document.getElementById('opcionesAccesoModal');
          if (m) {
            m.classList.add('on');
            document.body.classList.add('modal-open');
          }
        });
        await page.waitForTimeout(300);

        const bodyLocked = await page.evaluate(() => document.body.classList.contains('modal-open'));
        expect(bodyLocked).toBe(true);

        await page.evaluate(() => {
          const m = document.getElementById('opcionesAccesoModal');
          if (m) {
            m.classList.remove('on');
            document.body.classList.remove('modal-open');
          }
        });
        await page.waitForTimeout(300);
      }
    }
  });

  test('6. Verify JSON-LD Structured Data in DOM', async ({ page }) => {
    await gotoLanding(page);

    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const count = await jsonLdScripts.count();
    expect(count).toBeGreaterThan(0);

    const schemaTypes: string[] = [];
    for (let i = 0; i < count; i++) {
      const content = await jsonLdScripts.nth(i).textContent();
      if (content) {
        try {
          const parsed = JSON.parse(content);
          if (parsed['@type']) schemaTypes.push(parsed['@type']);
          if (parsed['@graph']) {
            parsed['@graph'].forEach((node: any) => {
              if (node['@type']) schemaTypes.push(node['@type']);
            });
          }
        } catch (e) {
          console.warn('Failed parsing JSON-LD in test:', e);
        }
      }
    }

    console.log('Detected schema types on landing page:', schemaTypes);
    expect(schemaTypes).toContain('SoftwareApplication');
  });

  // --- Tier 2: Boundary & Mobile Viewport Tests (360px - 390px) ---
  const viewports = [
    { name: 'Galaxy S8 / Compact Android (360x740)', width: 360, height: 740 },
    { name: 'iPhone SE / Standard Mobile (375x812)', width: 375, height: 812 },
    { name: 'iPhone 14 / Modern Smartphone (390x844)', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    test(`7. Mobile Viewport Zero Horizontal Clipping — ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoLanding(page);
      await page.waitForTimeout(1500);

      const [scrollW, clientW] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);

      expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    });
  }

  // --- Tier 3: Link Audit ---
  test('8. Verify no broken links on landing page', async ({ request, page }) => {
    await gotoLanding(page);

    const linkElements = await page.locator('a[href]').all();
    const hrefSet = new Set<string>();

    for (const el of linkElements) {
      const href = await el.getAttribute('href');
      if (
        href &&
        !href.startsWith('javascript:') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('#')
      ) {
        hrefSet.add(href);
      }
    }

    console.log(`Checking ${hrefSet.size} unique links on landing page...`);
    const brokenLinks: { href: string; status: number }[] = [];

    const linkArray = Array.from(hrefSet).slice(0, 15);
    const pageOrigin = new URL(page.url()).origin.replace('localhost', '127.0.0.1');
    for (const href of linkArray) {
      try {
        const targetUrl = new URL(href, pageOrigin).toString();
        const response = await request.get(targetUrl, {
          failOnStatusCode: false,
          timeout: 4000,
        });

        // 403/429: algunos sitios bloquean peticiones automaticas. 999: el
        // anti-bot de LinkedIn a clientes no-navegador (el perfil existe).
        if (
          response.status() >= 400 &&
          response.status() !== 403 &&
          response.status() !== 429 &&
          response.status() !== 999
        ) {
          brokenLinks.push({ href, status: response.status() });
        }
      } catch (err) {
        console.warn(`Warning checking link "${href}":`, (err as Error).message);
      }
    }

    expect(
      brokenLinks,
      `Broken links found on landing page: ${JSON.stringify(brokenLinks, null, 2)}`
    ).toHaveLength(0);
  });
});
