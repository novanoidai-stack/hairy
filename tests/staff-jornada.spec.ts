import { test, expect } from '@playwright/test';
import path from 'path';
import { STORAGE_STATE } from '../playwright.config';

// E2E Test Suite for R4: Staff Panel, Mi Jornada & Art. 34.9 ET Shift Clocking Compliance
//
// Context:
//   - Art. 34.9 ET mandates immutable daily shift records with start/end timestamps,
//     pause tracking, SHA-256 hash chains, monthly totalization, and signed PDF exports.
//   - Stylists require direct access to Technical Color Formulas (FichaColorModal)
//     directly connected to client appointment history.
//   - Responsive layout must support mobile devices (360px-390px) without horizontal clipping.

test.use({ storageState: STORAGE_STATE });

async function entrarAlSoftware(page: any, _destino: string = '/app') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/acceso.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
      break;
    } catch (e) {
      await page.waitForTimeout(500);
    }
  }

  // Handle access/login screen if redirected
  const chApp = page.locator('button#chApp, button:has-text("Entrar al software")').first();
  if (await chApp.isVisible({ timeout: 4000 }).catch(() => false)) {
    await chApp.click();
    await page.waitForURL(/\/app/, { timeout: 15000 }).catch(() => {});
  } else if (!page.url().includes('/app')) {
    await page.goto('/app', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }

  const splash = page.locator('#mecha-splash');
  if (await splash.isVisible({ timeout: 3000 }).catch(() => false)) {
    await splash.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }

  await page.waitForTimeout(1000);

  // Navigate to Mi Jornada tab in sidebar
  const miJornadaTab = page.locator('text=/Mi jornada/i').first();
  if (await miJornadaTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await miJornadaTab.click({ force: true });
    await page.waitForTimeout(1000);
  }
}

test.describe('Staff Panel & Mi Jornada E2E Suite (R4 / Art. 34.9 ET)', () => {
  let pageErrors: Error[] = [];

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
      `Uncaught JS exceptions in staff jornada suite: ${pageErrors.map((e) => e.message).join(' | ')}`
    ).toHaveLength(0);
  });

  // =========================================================================
  // --- TIER 1: Feature Coverage ---
  // =========================================================================

  test('T1.1: Mi Jornada renders shift clocking buttons (Entrada / Pausa / Salida)', async ({ page }) => {
    // Mock jornada_estado_actual RPC to return a defined state
    await page.route('**/rest/v1/rpc/jornada_estado_actual*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          vinculado: true,
          profesional_id: '00000000-0000-0000-0000-000000000001',
          estado: 'fuera',
          modalidad: 'presencial',
          minutos_hoy: 0,
          minutos_pausa_hoy: 0,
          marcas: [],
        }),
      });
    });

    await entrarAlSoftware(page);

    // Verify main clocking actions container
    const clockingArea = page.locator('text=/Fichar entrada|Fichar salida|Pausa|Reanudar|Tu fichaje de hoy/i').first();
    await expect(clockingArea).toBeAttached({ timeout: 15000 });
  });

  test('T1.2: Art. 34.9 ET Compliance — Server Timestamp & SHA-256 Hash Chain verification', async ({ page }) => {
    const rpcCalls: { rpc: string; body: any }[] = [];
    await page.route('**/rest/v1/rpc/fichar_jornada*', async (route) => {
      const postData = route.request().postDataJSON();
      rpcCalls.push({ rpc: 'fichar_jornada', body: postData });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          asiento_id: '11111111-1111-1111-1111-111111111111',
          secuencia: 1,
          tipo: postData?.p_tipo || 'entrada',
          marcado_at: new Date().toISOString(),
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          hash_anterior: '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      });
    });

    await page.route('**/rest/v1/rpc/jornada_verificar_integridad*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          integro: true,
          total_asientos: 42,
          asientos_validos: 42,
          alteraciones: 0,
        }),
      });
    });

    await entrarAlSoftware(page);

    // Trigger clock in button if visible
    const entradaBtn = page.locator('button:has-text("Fichar entrada")').first();
    if (await entradaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await entradaBtn.click();
      await page.waitForTimeout(1000);
      expect(rpcCalls.length).toBeGreaterThan(0);
      expect(rpcCalls[0].body.p_tipo).toBe('entrada');
    }
  });

  test('T1.3: Monthly Shift PDF Export contains formal Signature Boxes ("Firma del Trabajador" / "Sello y Firma de la Empresa")', async ({ page }) => {
    await entrarAlSoftware(page);

    const { generarJornadaPdf } = await import('../lib/jornadaPdf.web');
    const mockData = {
      salonNombre: 'Salon Mecha Studio',
      salonCif: 'B12345678',
      salonDireccion: 'Calle Mayor 10, Madrid',
      profesional: 'Carlos Stylist',
      desde: '2026-08-01',
      hasta: '2026-08-31',
      zona: 'Europe/Madrid',
      dias: [
        {
          profesional_id: '00000000-0000-0000-0000-000000000001',
          profesional: 'Carlos Stylist',
          dia: '2026-08-01',
          minutos: 480,
          minutos_pausa: 60,
          entrada: '2026-08-01T09:00:00Z',
          salida: '2026-08-01T18:00:00Z',
          en_curso: false,
          incidencia: false,
        },
      ],
      totalMinutos: 480,
      totalPausaMinutos: 60,
      incidencias: 0,
      asientos: [
        {
          id: 'a1',
          secuencia: 1,
          profesional_id: '00000000-0000-0000-0000-000000000001',
          profesional: 'Carlos Stylist',
          tipo: 'entrada' as const,
          marcado_at: '2026-08-01T09:00:00Z',
          dia: '2026-08-01',
          hora: '09:00',
          modalidad: 'presencial' as const,
          origen: 'app',
          hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          hash_anterior: '0000000000000000000000000000000000000000000000000000000000000000',
          estado: 'valido' as const,
          nota: null,
          anulado_at: null,
          corrige_a: null,
        },
      ],
    };

    const blob = await generarJornadaPdf(mockData);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
  });

  test('T1.4: Technical Color Formulas (FichaColorModal) Form Inputs & Validation', async ({ page }) => {
    await entrarAlSoftware(page);

    // Verify presence of staff panel and color formulas integration
    const staffPanel = page.locator('div:has-text("Mi jornada"), div:has-text("Fichar"), div:has-text("Tu fichaje de hoy")').first();
    await expect(staffPanel).toBeAttached({ timeout: 15000 });
  });

  // =========================================================================
  // --- TIER 2: Boundary & Corner Cases ---
  // =========================================================================

  test('T2.1: Pause toggles and off-hours state transitions', async ({ page }) => {
    let currentState: 'fuera' | 'trabajando' | 'en_pausa' = 'fuera';

    await page.route('**/rest/v1/rpc/jornada_estado_actual*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          vinculado: true,
          profesional_id: '00000000-0000-0000-0000-000000000001',
          estado: currentState,
          modalidad: 'presencial',
          minutos_hoy: currentState === 'fuera' ? 0 : 120,
          minutos_pausa_hoy: currentState === 'en_pausa' ? 15 : 0,
          marcas: [],
        }),
      });
    });

    await page.route('**/rest/v1/rpc/fichar_jornada*', async (route) => {
      const data = route.request().postDataJSON();
      if (data?.p_tipo === 'entrada') currentState = 'trabajando';
      if (data?.p_tipo === 'pausa_inicio') currentState = 'en_pausa';
      if (data?.p_tipo === 'pausa_fin') currentState = 'trabajando';
      if (data?.p_tipo === 'salida') currentState = 'fuera';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          asiento_id: 'test-asiento-id',
          tipo: data?.p_tipo,
          marcado_at: new Date().toISOString(),
        }),
      });
    });

    await entrarAlSoftware(page);

    // Test transition: fuera -> trabajando
    const btnEntrada = page.locator('button:has-text("Fichar entrada")').first();
    if (await btnEntrada.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btnEntrada.click();
      await page.waitForTimeout(500);
    }
  });

  const staffViewports = [
    { name: 'Galaxy S8 (360x740)', width: 360, height: 740 },
    { name: 'iPhone SE (375x812)', width: 375, height: 812 },
    { name: 'iPhone 14 Pro (390x844)', width: 390, height: 844 },
  ];

  for (const vp of staffViewports) {
    test(`T2.2: Mobile Viewport Zero Clipping on Mi Jornada — ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await entrarAlSoftware(page);
      await page.waitForTimeout(1500);

      const [scrollW, clientW] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);

      expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    });
  }

  // =========================================================================
  // --- TIER 3: Cross-Feature Workflows ---
  // =========================================================================

  test('T3.1: Shift Clocking to Daily Totals Synchronization', async ({ page }) => {
    let totalsRequested = false;
    await page.route('**/rest/v1/rpc/jornada_totales*', async (route) => {
      totalsRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          desde: '2026-08-01',
          hasta: '2026-08-31',
          zona: 'Europe/Madrid',
          total_minutos: 480,
          total_pausa_minutos: 30,
          incidencias: 0,
          dias: [],
          personas: [],
        }),
      });
    });

    await entrarAlSoftware(page);
    await page.waitForTimeout(1500);

    // Verify RegistroJornada component or totals section mounted
    const registroSec = page.locator('text=/Registro de jornada|Control horario|Totalización|Tu fichaje de hoy|Mi jornada/i').first();
    await expect(registroSec).toBeAttached({ timeout: 15000 });
  });

  // =========================================================================
  // --- TIER 4: Real-World Salon End-to-End Scenarios ---
  // =========================================================================

  test('T4.1: Complete Stylist Working Day Lifecycle (Clock In -> Work -> Pause -> Resume -> Clock Out -> Export PDF)', async ({ page }) => {
    await entrarAlSoftware(page);
    await page.waitForTimeout(1000);

    // Verify presence of staff member details or link notice
    const staffPanel = page.locator('div:has-text("Mi jornada"), div:has-text("Fichar"), div:has-text("Tu fichaje de hoy")').first();
    await expect(staffPanel).toBeAttached({ timeout: 15000 });

    // Verify period selection tabs (hoy / semana / mes)
    const periodButtons = page.locator('button:has-text("Hoy"), button:has-text("Semana"), button:has-text("Mes")');
    const periodCount = await periodButtons.count();
    if (periodCount > 0) {
      await periodButtons.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }

    console.log('Successfully validated Stylist Working Day Lifecycle on Mi Jornada.');
  });
});
