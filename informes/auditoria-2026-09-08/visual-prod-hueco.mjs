// LIMPIO: un solo gesto. Carga, scrollea el hueco a viewport, tap SOLO el hueco, captura.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE = process.env.BASE_URL || 'https://www.mechaa.es';
const consola = [];
const nav = await chromium.launch({ hasTouch: true });
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 250)}`));
  await page.goto(`${BASE}/demo.html?share=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
    const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }
  }
  const vpl = page.getByText('Ver por libre').first();
  if (await vpl.count()) { await vpl.click({ timeout: 4000 }).catch(() => {}); }
  const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
  await frame.waitForSelector('text=Nueva cita', { timeout: 25000 }).catch(() => {});
  for (let i = 0; i < 20 && (await frame.locator('[data-mecha-estado]').count()) === 0; i++) await page.waitForTimeout(1500);

  const hueco = frame.locator('[title^="Reposo de"]').first();
  let cajaH = null;
  for (let i = 0; i < 14; i++) {
    cajaH = await hueco.boundingBox().catch(() => null);
    if (cajaH && cajaH.y > 120 && cajaH.y + cajaH.height < 760) break;
    await frame.evaluate(() => {
      const c = [];
      document.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) c.push(el); });
      c.sort((a, b) => b.scrollHeight - a.scrollHeight);
      const o = c[0];
      if (o) {
        if (o.scrollWidth > o.clientWidth + 30) o.scrollLeft = 999;
        o.scrollTop = o.scrollTop + o.clientHeight * 0.35;
      }
    });
    await page.waitForTimeout(600);
  }
  consola.push(`hueco: ${JSON.stringify(cajaH)}`);
  await page.screenshot({ path: path.join(DIR, 'visual-prod-hueco-listo.png') });

  if (cajaH) {
    const x = Math.min(cajaH.x + cajaH.width / 2, 380);
    const y = Math.min(cajaH.y + cajaH.height / 2, 790);
    consola.push(`tap hueco en ${Math.round(x)},${Math.round(y)} (dentro del hueco: x ${Math.round(cajaH.x)}-${Math.round(cajaH.x + cajaH.width)}, y ${Math.round(cajaH.y)}-${Math.round(cajaH.y + cajaH.height)})`);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(DIR, 'visual-prod-hueco-resultado.png') });
    const texto = await frame.locator('body').innerText().catch(() => '');
    consola.push(`texto visible tras tap: ${texto.slice(0, 350).replace(/\n/g, ' | ')}`);
  }
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'visual-prod-hueco-limpio.txt'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 1400));
}
