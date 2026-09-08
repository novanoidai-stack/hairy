// Tap REAL sobre la tarjeta de la cita con reposo (movil) y captura de lo que se abre.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const consola = [];
const nav = await chromium.launch({ hasTouch: true });
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 250)}`));
  page.on('console', (m) => { if (m.type() === 'error') consola.push(`[consola] ${m.text().slice(0, 200)}`); });
  await page.goto('http://127.0.0.1:8080/demo.html?share=1&intro=0', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
    const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }
  }
  const vpl = page.getByText('Ver por libre').first();
  if (await vpl.count()) { await vpl.click({ timeout: 4000 }).catch(() => {}); }
  const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
  await frame.waitForSelector('text=Nueva cita', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);

  // Scroll vertical hasta el final de la jornada y un pelin de scroll horizontal
  // para centrar la columna de la cita con reposo (la 2 de 3).
  await frame.evaluate(() => {
    const conScroll = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) conScroll.push(el);
    });
    conScroll.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (conScroll[0]) conScroll[0].scrollTop = conScroll[0].scrollHeight * 0.62;
  });
  await page.waitForTimeout(700);

  const hueco = frame.locator('[title^="Reposo de"]').first();
  const tarjeta = frame.locator('[data-mecha-estado]', { has: hueco }).first();
  const nTarjetas = await frame.locator('[data-mecha-estado]').count();
  consola.push(`tarjetas con data-mecha-estado: ${nTarjetas}`);
  const caja = await tarjeta.boundingBox();
  consola.push(`tarjeta: ${JSON.stringify(caja)}`);
  if (caja) {
    // Tap tactil en el centro del TRAMO ACTIVO (tercio superior de la tarjeta,
    // nunca sobre la franja de reposo interactiva).
    const x = caja.x + Math.min(caja.width / 2, 80);
    const y = caja.y + Math.max(14, caja.height * 0.15);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(DIR, 'visual-movil-tap-tarjeta.png'), fullPage: false });
    // ¿Se abrio algun modal/sheet? Buscar textos tipicos del detalle.
    const modal = await frame.locator('text=/Guardar|Estado|Cliente|Ficha|Detalle/i').first().isVisible().catch(() => false);
    consola.push(`algo parecido a detalle visible: ${modal}`);
    await page.screenshot({ path: path.join(DIR, 'visual-movil-tap-tarjeta-full.png'), fullPage: true });
  }
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'visual-movil-tap.txt'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 1500));
}
