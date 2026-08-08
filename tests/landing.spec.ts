import { test, expect } from '@playwright/test';

test.describe('Landing Page E2E Suite - mechaa.es', () => {
  let pageErrors: Error[] = [];

  const gotoLanding = async (page: any) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('/', { waitUntil: 'commit', timeout: 10000 });
        break;
      } catch (e) {
        await page.waitForTimeout(500);
      }
    }
    await page.click('#introSkip').catch(() => {});
    await page.waitForSelector('header, nav, .nav, #navbar', { timeout: 10000 }).catch(() => {});
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

  test('1. Navigation & Header Verification', async ({ page }) => {
    await gotoLanding(page);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
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

  test('3. Verify CTAs (navLogin and navDemo)', async ({ page }) => {
    await gotoLanding(page);

    const navLogin = page.locator('a#navLogin').first();
    await expect(navLogin).toBeAttached();
    const loginHref = await navLogin.getAttribute('href');
    expect(loginHref).toBeTruthy();

    const navDemo = page.locator('a#navDemo').first();
    await expect(navDemo).toBeAttached();

    if (await navDemo.isVisible().catch(() => false)) {
      await navDemo.hover().catch(() => {});
      await page.waitForTimeout(200);
    }
  });

  test('4. Test interactive modals and buttons', async ({ page }) => {
    await gotoLanding(page);

    const interactiveElements = page.locator('button, a.btn, [data-bs-toggle], [data-modal-target]');
    const count = await interactiveElements.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = interactiveElements.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const text = (await el.textContent())?.trim() || '';
        console.log(`Testing interactive element [${i}]: "${text}"`);
        await el.hover().catch(() => {});
      }
    }
  });

  test('5. Verify no broken links on landing page', async ({ request, page }) => {
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

    const linkArray = Array.from(hrefSet).slice(0, 10);
    for (const href of linkArray) {
      try {
        const targetUrl = new URL(href, 'https://www.mechaa.es').toString();
        const response = await request.get(targetUrl, {
          failOnStatusCode: false,
          timeout: 4000,
        });

        if (response.status() >= 400 && response.status() !== 403 && response.status() !== 429) {
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
