import { test, expect } from '@playwright/test';

// E2E del portal publico de reservas a 375px.
//
// Contexto: en agosto de 2026 el portal estaba roto de tres formas a la vez:
// no se podia elegir dia ni hora (los efectos de carga seguian atados al step
// machine de un asistente que ya no existia, asi que disponibilidad_publica no
// se llamaba nunca), 82 elementos se recortaban en movil, y el bloque de
// resenas era un mock con numeros inventados. Estos tests son la red para que
// no vuelva.
//
// baseURL sale de playwright.config.ts (produccion). Para probar contra el
// build local: npm run build:web && node scripts/serve-web.mjs, y lanzar con
// PLAYWRIGHT_BASE_URL=http://localhost:8080.

const SLUG = 'demo';
const RUTA = `/app/r/${SLUG}`;

async function abrirYElegirServicio(page: any, servicio: RegExp) {
  await page.goto(RUTA, { waitUntil: 'domcontentloaded' });
  const boton = page.locator('button').filter({ hasText: servicio }).first();
  await boton.waitFor({ timeout: 20000 });
  await boton.click();
}

test.describe('Portal de reservas', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('al elegir servicio se piden dias y horas al servidor', async ({ page }) => {
    const rpc: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/rest/v1/rpc/')) rpc.push(u.split('/rpc/')[1].split('?')[0]);
    });

    await abrirYElegirServicio(page, /Corte caballero/);

    await expect
      .poll(() => rpc.filter((c) => c === 'disponibilidad_publica').length, { timeout: 20000 })
      .toBeGreaterThan(0);
    expect(rpc).toContain('portal_dias_disponibles');
  });

  test('se pintan horas reservables', async ({ page }) => {
    await abrirYElegirServicio(page, /Corte caballero/);
    // El dia se autoselecciona al primero con disponibilidad real.
    const horas = page.locator('button').filter({ hasText: /^\d{1,2}:\d{2}/ });
    await expect(horas.first()).toBeVisible({ timeout: 20000 });
    expect(await horas.count()).toBeGreaterThan(0);
  });

  test('nada se recorta a 375px', async ({ page }) => {
    await abrirYElegirServicio(page, /Corte caballero/);
    await page.waitForTimeout(2500);

    const recortados = await page.evaluate(() => {
      const malos: string[] = [];
      document.querySelectorAll('*').forEach((e) => {
        const el = e as HTMLElement;
        if (el.scrollWidth <= el.clientWidth + 2) return;
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return; // carruseles legitimos
        malos.push(
          `${el.tagName} cw=${el.clientWidth} sw=${el.scrollWidth} :: ${(el.innerText || '')
            .slice(0, 40)
            .replace(/\n/g, '|')}`
        );
      });
      return malos;
    });

    expect(recortados, `Elementos recortados:\n${recortados.join('\n')}`).toHaveLength(0);
    const doc = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(doc[0]).toBeLessThanOrEqual(doc[1]);
  });

  test('sin mojibake y sin tipografia serif', async ({ page }) => {
    await page.goto(RUTA, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const texto = await page.locator('body').innerText();
    expect(texto).not.toMatch(/â€|Ã¡|Â¡|â‚¬|Ã©/);

    const conSerif = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('*')).filter((e) =>
          getComputedStyle(e).fontFamily.includes('Instrument Serif')
        ).length
    );
    expect(conSerif).toBe(0);
  });

  test('las resenas son las reales, no un mock', async ({ page }) => {
    await page.goto(RUTA, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain('Cliente feliz');
    expect(texto).not.toContain('Servicio x');
    // Numeros que el bloque inventaba cuando la peticion fallaba.
    expect(texto).not.toContain('182');
    expect(texto).not.toContain('4.9');
  });

  test('ningun campo mecha_ viaja al portal publico', async ({ page }) => {
    const cuerpos: string[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('/rpc/resenas_publicas')) {
        cuerpos.push(await res.text().catch(() => ''));
      }
    });
    await page.goto(RUTA, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    expect(cuerpos.length).toBeGreaterThan(0);
    expect(cuerpos.join('')).not.toContain('mecha_');
  });

  test('sin resenas no se inventa una nota ni un total', async ({ page }) => {
    await page.route('**/rest/v1/rpc/resenas_publicas', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );
    await page.goto(RUTA, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain('182');
    expect(texto).not.toContain('4.9');
    expect(texto).not.toContain('reseñas');
  });

  test('un hueco de reposo se marca y explica los minutos libres', async ({ page }) => {
    await page.route('**/rest/v1/rpc/disponibilidad_publica', async (route) => {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      manana.setHours(11, 0, 0, 0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            profesional_id: '00000000-0000-0000-0000-000000000001',
            profesional_nombre: 'Laura Martinez',
            slot: manana.toISOString(),
            en_reposo: true,
            reposo_disponible_min: 30,
          },
        ]),
      });
    });

    await abrirYElegirServicio(page, /Corte caballero/);
    await expect(page.getByTitle(/hueco entre servicios.*30 min libres/i).first()).toBeVisible({
      timeout: 20000,
    });
  });
});
