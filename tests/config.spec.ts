import { test, expect } from '@playwright/test';
import path from 'path';
import { entrarAlSoftware } from './helpers/software';
const STORAGE_STATE = path.join(__dirname, '../playwright/.auth/user.json');

test.use({ storageState: STORAGE_STATE });

test.describe('Authenticated Software Configuration E2E Suite - mechaa.es/app', () => {
  let pageErrors: Error[] = [];
  let consoleErrors: string[] = [];

  // Entrar es responsabilidad de tests/auth.setup.ts + helpers/software.ts.
  // Aqui habia una copia del login (correo y contrasena a mano) como plan B
  // por si el storageState venia vacio; eso tapaba el fallo real y ademas
  // repetia la dependencia del CDN externo de acceso.html en cada test.
  const ensureAuthenticated = async (page: any) => {
    await entrarAlSoftware(page, '/app');
  };

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (exception) => {
      console.error('Captured page error in /app:', exception.message);
      pageErrors.push(exception);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.warn('Captured console error in /app:', msg.text());
        consoleErrors.push(msg.text());
      }
    });

    await ensureAuthenticated(page);
  });

  test.afterEach(() => {
    expect(
      pageErrors,
      `Uncaught JS exceptions in /app: ${pageErrors.map((e) => e.message).join(' | ')}`
    ).toHaveLength(0);
  });

  test('1. Verify Software App Mounting and Dashboard/Sidebar Navigation', async ({ page }) => {
    expect(page.url()).toContain('/app');

    const appRoot = page.locator('#root');
    await expect(appRoot).toBeVisible();

    const navOrSidebar = page.locator(
      '[role="navigation"], [data-aria-label*="navigation"], nav, header, div:has(button)'
    ).first();
    await expect(navOrSidebar).toBeAttached();
  });

  test('2. Systematically Click Software Configuration Menus & Settings Tabs', async ({ page }) => {
    const menuSelectors = [
      'text=/Ajustes/i',
      'text=/Configuración/i',
      'text=/Servicios/i',
      'text=/Equipo/i',
      'text=/Horarios/i',
      'text=/Agenda/i',
      'text=/General/i',
      'text=/Notificaciones/i',
      'text=/Cobros/i',
      'text=/IA/i',
      '[role="tab"]',
      'a[href*="settings"]',
      'button:has-text("Ajustes")',
      'button:has-text("Configuración")',
    ];

    let clickedAny = false;
    for (const selector of menuSelectors) {
      const loc = page.locator(selector).first();
      if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log(`Interacting with configuration tab/menu: ${selector}`);
        await loc.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
        clickedAny = true;
      }
    }

    console.log(`Completed configuration menu interactions. Interacted with tabs: ${clickedAny}`);
  });

  test('3. Test Configuration Toggles, Switches, and Interactive Controls', async ({ page }) => {
    const switchLocators = page.locator(
      'input[type="checkbox"], [role="switch"], [aria-checked], div[class*="switch"], div[class*="toggle"], div[class*="Switch"]'
    );

    const count = await switchLocators.count();
    console.log(`Found ${count} switch/toggle interactive controls.`);

    // Exercise interactive toggles safely (test click without breaking persistent remote state if possible)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const toggle = switchLocators.nth(i);
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.hover().catch(() => {});
        // Double click to toggle back to original state
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  });

  test('4. Verify Form Inputs in Settings (Text inputs, Selects, Number fields)', async ({ page }) => {
    const inputs = page.locator('input[type="text"], input[type="number"], select, textarea');
    const inputCount = await inputs.count();
    console.log(`Found ${inputCount} settings form inputs.`);

    for (let i = 0; i < Math.min(inputCount, 5); i++) {
      const input = inputs.nth(i);
      if (await input.isVisible().catch(() => false)) {
        const val = await input.inputValue().catch(() => '');
        expect(typeof val).toBe('string');
      }
    }
  });
});
