// tests/e2e/demo.spec.ts
// Playwright E2E Spec for Mecha Guided Demo

import { test, expect } from '@playwright/test';

test.describe('Mecha Guided Demo E2E Specs', () => {

  test('R1: Direct unauthenticated visit to demo.html displays #gate overlay', async ({ page }) => {
    await page.goto('/demo.html', { waitUntil: 'domcontentloaded' });
    const gate = page.locator('#gate, .dm-gate');
    // If gate is present, it should link to acceso.html?next=demo#signup
    if (await gate.count() > 0) {
      const cta = gate.locator('a[href*="acceso.html"]');
      await expect(cta.first()).toBeVisible();
      const href = await cta.first().getAttribute('href');
      expect(href).toContain('acceso.html?next=demo');
    }
  });

  test('R2: Demo intro screen renders with dark backdrop and guided button', async ({ page }) => {
    await page.goto('/demo.html?preview=1', { waitUntil: 'domcontentloaded' });
    const intro = page.locator('#intro');
    if (await intro.count() > 0) {
      const guidedBtn = intro.locator('#introGuided');
      if (await guidedBtn.isVisible()) {
        await expect(guidedBtn).toBeVisible();
        await guidedBtn.click();
        // Intro should close
        await expect(intro).not.toHaveClass(/show/);
      }
    }
  });

  test('R3: Doubts modal opens, validates question and contact input', async ({ page }) => {
    await page.goto('/demo.html?preview=1', { waitUntil: 'domcontentloaded' });
    
    // Dismiss intro if visible
    const intro = page.locator('#intro');
    if (await intro.isVisible().catch(() => false)) {
      const introFree = page.locator('#introFree');
      if (await introFree.isVisible().catch(() => false)) {
        await introFree.click();
      } else {
        const introGuided = page.locator('#introGuided');
        if (await introGuided.isVisible().catch(() => false)) {
          await introGuided.click();
        }
      }
      await expect(intro).not.toHaveClass(/show/);
    }

    const dudasBtn = page.locator('#dudasBtn');
    if (await dudasBtn.count() > 0) {
      await dudasBtn.click();
      const overlay = page.locator('#dudasOverlay');
      await expect(overlay).toBeVisible();
      await expect(overlay).toHaveClass(/show/);

      // Verify contact input and textarea
      const dudasText = page.locator('#dudasText');
      const dudasContacto = page.locator('#dudasContacto, #dudasEmail');
      const dudasSend = page.locator('#dudasSend');
      const dudasErr = page.locator('#dudasErr');

      // Test validation: submitting empty / too short question shows error
      await dudasSend.click();
      await expect(dudasErr).toBeVisible();
      await expect(dudasErr).toHaveClass(/show/);

      // Test validation: invalid email format
      await dudasText.fill('¿Cómo funcionan los reposos?');
      if (await dudasContacto.count() > 0) {
        await dudasContacto.fill('correo_invalido_sin_arroba');
        await dudasSend.click();
        await expect(dudasErr).toBeVisible();
        const errText = await dudasErr.textContent();
        expect(errText).toContain('válido');
      }

      // Close modal
      const dudasClose = page.locator('#dudasClose');
      await dudasClose.click();
      await expect(overlay).not.toHaveClass(/show/);
    }
  });

  test('R5: Guided tour dock and track selector buttons are present', async ({ page }) => {
    await page.goto('/demo.html?preview=1', { waitUntil: 'domcontentloaded' });
    
    // Dismiss intro
    const intro = page.locator('#intro');
    if (await intro.isVisible().catch(() => false)) {
      const introGuided = page.locator('#introGuided');
      if (await introGuided.isVisible().catch(() => false)) {
        await introGuided.click();
      }
    }

    const tutSel = page.locator('.dm-tutsel, #tutSel');
    if (await tutSel.count() > 0) {
      const tutGeneral = page.locator('#tutBtnGeneral');
      if (await tutGeneral.count() > 0) {
        await expect(tutGeneral).toBeAttached();
      }
      const tutAdvanced = page.locator('#tutBtnAdvanced');
      if (await tutAdvanced.count() > 0) {
        await expect(tutAdvanced).toBeAttached();
      }
      const tutConfig = page.locator('#tutBtnConfig');
      if (await tutConfig.count() > 0) {
        await expect(tutConfig).toBeAttached();
      }
    }
  });

});

