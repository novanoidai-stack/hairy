import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  setup.setTimeout(60000);

  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  console.log('Navigating to /acceso.html...');
  await page.goto('/acceso.html', { waitUntil: 'commit', timeout: 20000 }).catch(() => {
    return page.goto('/acceso.html', { timeout: 20000 });
  });

  // Bypass splash/loader pane if displayed
  await page.evaluate(() => {
    if ((window as any).MechaInitForms) {
      (window as any).MechaInitForms();
    }
  }).catch(() => {});

  const tabLogin = page.locator('#tabLogin');
  if (await tabLogin.isVisible().catch(() => false)) {
    await tabLogin.click({ force: true }).catch(() => {});
  }

  const emailInput = page.locator('input#loginEmail');
  const pwInput = page.locator('input#loginPw');
  const loginBtn = page.locator('button#loginBtn');

  await emailInput.waitFor({ state: 'attached', timeout: 20000 });
  if (!(await emailInput.isVisible())) {
    await page.evaluate(() => {
      const pane = document.getElementById('paneLogin');
      if (pane) pane.classList.add('on');
      const loader = document.getElementById('paneLoading');
      if (loader) loader.classList.remove('on');
    });
  }

  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill('carlitosocanamartinez@gmail.com');
  await pwInput.fill('minicharlie2007');

  console.log('Submitting login credentials...');
  await loginBtn.click();

  // Wait for loading screen to complete and chooser button #chApp to appear
  const chAppBtn = page.locator('button#chApp, button:has-text("Entrar al software")').first();
  try {
    await chAppBtn.waitFor({ state: 'visible', timeout: 25000 });
    console.log('Chooser button #chApp detected, clicking to enter software...');
    await chAppBtn.click();
  } catch (e) {
    console.log('Chooser button did not appear within 25s or already navigated:', (e as Error).message);
  }

  try {
    await page.waitForURL(/\/app/, { timeout: 20000 });
    console.log('Successfully navigated to /app');
  } catch (e) {
    console.log('Final URL after auth phase:', page.url());
  }

  await page.waitForTimeout(3000);

  // Save storage state to playwright/.auth/user.json
  await page.context().storageState({ path: authFile });
  console.log('Saved storageState to user.json');
});
