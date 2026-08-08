import { test, expect } from '@playwright/test';
import path from 'path';
const STORAGE_STATE = path.join(__dirname, '../playwright/.auth/user.json');

test.use({ storageState: STORAGE_STATE });

test.describe('Authenticated Software Configuration E2E Suite - mechaa.es/app', () => {
  let pageErrors: Error[] = [];
  let consoleErrors: string[] = [];

  const ensureAuthenticated = async (page: any) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('/app', { waitUntil: 'commit', timeout: 15000 });
        break;
      } catch (e) {
        await page.waitForTimeout(1000);
      }
    }
    await page.waitForTimeout(1500);

    // If session expired or redirected to acceso.html, log in dynamically
    if (page.url().includes('acceso.html')) {
      console.log('Session expired, logging in via acceso.html...');
      const emailInput = page.locator('input#loginEmail');
      const pwInput = page.locator('input#loginPw');
      const loginBtn = page.locator('button#loginBtn');

      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill('carlitosocanamartinez@gmail.com');
        await pwInput.fill('minicharlie2007');
        await loginBtn.click();

        const chAppBtn = page.locator('button#chApp, button:has-text("Entrar al software")').first();
        try {
          await chAppBtn.waitFor({ state: 'visible', timeout: 10000 });
          await chAppBtn.click();
        } catch (e) {}

        await page.waitForURL(/\/app/, { timeout: 15000 }).catch(() => {});
      }
    }

    const splash = page.locator('#mecha-splash');
    if (await splash.isVisible({ timeout: 3000 }).catch(() => false)) {
      await splash.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }

    await page.waitForTimeout(1500);
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
    console.log(`Found ${count} toggle/switch elements in Software Configuration.`);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const toggle = switchLocators.nth(i);
      if (await toggle.isVisible().catch(() => false)) {
        console.log(`Toggling configuration switch #${i}`);
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  });

  test('4. Interact with Settings Dropdowns, Dialog Modals, and Save Buttons', async ({ page }) => {
    const dropdowns = page.locator('select, [role="combobox"], [aria-haspopup="listbox"]');
    const dropCount = await dropdowns.count();
    console.log(`Found ${dropCount} dropdown elements in /app.`);

    if (dropCount > 0) {
      const firstDrop = dropdowns.first();
      if (await firstDrop.isVisible().catch(() => false)) {
        await firstDrop.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    const modalTriggers = page.locator('button:has-text("Editar"), button:has-text("Añadir"), button:has-text("Nuevo"), [data-bs-toggle="modal"]');
    if (await modalTriggers.count() > 0) {
      const trigger = modalTriggers.first();
      if (await trigger.isVisible().catch(() => false)) {
        console.log('Opening configuration modal/dialog...');
        await trigger.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);

        const closeBtn = page.locator('button:has-text("Cancelar"), button:has-text("Cerrar"), [aria-label="Close"], button.close').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    }

    const saveButtons = page.locator('button:has-text("Guardar"), button:has-text("Save"), button:has-text("Aplicar"), button:has-text("Actualizar")');
    const saveCount = await saveButtons.count();
    console.log(`Found ${saveCount} save button elements.`);

    for (let i = 0; i < saveCount; i++) {
      const saveBtn = saveButtons.nth(i);
      if (await saveBtn.isVisible().catch(() => false) && await saveBtn.isEnabled().catch(() => false)) {
        console.log(`Testing save button #${i}`);
        await saveBtn.hover().catch(() => {});
      }
    }
  });
});
