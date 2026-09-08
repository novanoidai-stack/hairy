// Abre el modal de Reserva de Grupo/Boda (boton 👰) en movil y escritorio.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const consola = [];
const nav = await chromium.launch();
try {
  for (const [nombre, opts] of [
    ['movil', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
    ['escritorio', { viewport: { width: 1440, height: 900 } }],
  ]) {
    const ctx = await nav.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => consola.push(`[${nombre}][pageerror] ${String(e).slice(0, 200)}`));
    await page.goto('http://127.0.0.1:8080/demo.html?share=1&intro=0', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
      const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
      if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }
    }
    const vpl = page.getByText('Ver por libre').first();
    if (await vpl.count()) { await vpl.click({ timeout: 4000 }).catch(() => {}); }
    const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
    await frame.waitForSelector('text=Nueva cita', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const btnBoda = frame.locator('[title*="Reserva de Grupo"], [aria-label*="Reserva de Grupo"]').first();
    const hay = await btnBoda.count();
    const visible = hay ? await btnBoda.isVisible().catch(() => false) : false;
    consola.push(`[${nombre}] boton grupo/boda: existe=${hay} visible=${visible}`);
    if (visible) {
      await btnBoda.click({ timeout: 6000 }).catch((e) => consola.push(`[${nombre}] click: ${String(e).slice(0, 120)}`));
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(DIR, `visual-grupo-${nombre}.png`) });
      const texto = await frame.locator('body').innerText().catch(() => '');
      consola.push(`[${nombre}] modal dice: ${texto.slice(0, 200).replace(/\n/g, ' | ')}`);
    }
    await ctx.close();
  }
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'visual-grupo-consola.txt'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 1200));
}
