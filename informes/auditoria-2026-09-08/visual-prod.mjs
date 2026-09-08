// Repro v2 contra PRODUCCION: scroll hasta que la cita con reposo este EN viewport,
// tap tarjeta y tap hueco, y version real del build leyendo los bundles JS.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE = process.env.BASE_URL || 'https://www.mechaa.es';
const ORIGEN = process.env.ORIGEN || 'prod';
const consola = [];
const nav = await chromium.launch({ hasTouch: true });
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 250)}`));
  await page.goto(`${BASE}/demo.html?share=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
    const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }
  }
  const vpl = page.getByText('Ver por libre').first();
  if (await vpl.count()) { await vpl.click({ timeout: 4000 }).catch(() => {}); }
  const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
  await frame.waitForSelector('text=Nueva cita', { timeout: 25000 }).catch(() => {});
  let n = 0;
  for (let i = 0; i < 20 && n === 0; i++) { await page.waitForTimeout(1500); n = await frame.locator('[data-mecha-estado]').count(); }
  consola.push(`tarjetas montadas: ${n}`);

  // VERSION REAL: buscar marcadores en los bundles JS cargados por el /app.
  const bundles = await frame.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.src));
  let marcaAntesFin = false, marcaHoja = false;
  for (const src of bundles) {
    try {
      const r = await frame.evaluate(async (u) => { const t = await (await fetch(u)).text(); return t; }, src);
      if (r.includes('Antes fin')) marcaAntesFin = true;        // 0844b89e6, 8 sep 16:57
      if (r.includes('16px 16px 0 0')) marcaHoja = true;          // fix hoja grupo/boda, 8 sep tarde
    } catch { /* bundle intocable */ }
  }
  consola.push(`bundles: ${bundles.length} | "Antes fin": ${marcaAntesFin} | hoja redondeada modal grupo: ${marcaHoja}`);

  // Scroll vertical (contenedor con mas scroll) hasta que el hueco este EN viewport.
  const hueco = frame.locator('[title^="Reposo de"]').first();
  let cajaH = null;
  for (let i = 0; i < 12; i++) {
    cajaH = await hueco.boundingBox().catch(() => null);
    if (cajaH && cajaH.y > 40 && cajaH.y + cajaH.height < 780) break;
    await frame.evaluate(() => {
      const c = [];
      document.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) c.push(el); });
      c.sort((a, b) => b.scrollHeight - a.scrollHeight);
      const o = c[0];
      if (o) {
        if (o.scrollWidth > o.clientWidth + 30) o.scrollLeft = 999; // centrar la columna de la cita
        o.scrollTop = Math.min(o.scrollTop + o.clientHeight * 0.4, o.scrollHeight);
      }
    });
    await page.waitForTimeout(500);
  }
  consola.push(`hueco tras scroll: ${JSON.stringify(cajaH)}`);
  await page.screenshot({ path: path.join(DIR, `visual-prod-antes-${ORIGEN}.png`) });

  if (cajaH && cajaH.y > 0 && cajaH.y < 780) {
    // Tap sobre la TARJETA (tramo activo = encima del hueco).
    const tarjeta = frame.locator('[data-mecha-estado]', { has: hueco }).first();
    const caja = await tarjeta.boundingBox();
    consola.push(`tarjeta: ${JSON.stringify(caja)}`);
    if (caja) {
      const x = Math.max(30, Math.min(caja.x + 40, 370));
      const y = Math.max(80, Math.min(caja.y + 16, 790));
      consola.push(`tap tarjeta en ${Math.round(x)},${Math.round(y)}`);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, `visual-prod-tap-cita-${ORIGEN}.png`) });
      const cerrar = frame.locator('button', { hasText: /^✕$|Cerrar|Descartar/ }).first();
      if (await cerrar.count()) { await cerrar.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200); }
      // Tap sobre el HUECO.
      await page.touchscreen.tap(Math.min(cajaH.x + cajaH.width / 2, 380), Math.min(cajaH.y + cajaH.height / 2, 800));
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(DIR, `visual-prod-tap-hueco-${ORIGEN}.png`) });
    }
  }
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, `visual-prod-consola-${ORIGEN}.txt`), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 1600));
}
