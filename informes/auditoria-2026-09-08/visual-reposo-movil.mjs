// Captura MOVIL de la cita con reposo, descartando tour y cookies antes.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE = 'http://127.0.0.1:8080';
const consola = [];

const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consola.push(`[consola] ${m.text().slice(0, 250)}`); });
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 250)}`));

  await page.goto(`${BASE}/demo.html?share=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // Descartar cookies y tour de la demo (viven a nivel de pagina, no del iframe).
  for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
    const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600); }
  }
  const verPorLibre = page.getByText('Ver por libre').first();
  if (await verPorLibre.count()) {
    await verPorLibre.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(DIR, 'visual-movil-limpio.png') });

  const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
  await frame.waitForSelector('text=Nueva cita', { timeout: 20000 }).catch(() => {});
  await frame.waitForTimeout(1500);

  // Scroll del contenedor de la rejilla hasta media tarde (la cita con reposo
  // es a las 18:00). Se busca el ancestro con scroll, como hace la propia app.
  await frame.evaluate(() => {
    const conScroll = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) conScroll.push(el);
    });
    conScroll.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (conScroll[0]) conScroll[0].scrollTop = conScroll[0].scrollHeight; // abajo del todo = ultima hora
  });
  await frame.waitForTimeout(800);
  await page.screenshot({ path: path.join(DIR, 'visual-movil-tarde.png') });

  const reposos = frame.locator('[title^="Reposo de"]');
  const n = await reposos.count();
  consola.push(`reposos visibles tras scroll: ${n}`);
  if (n > 0) {
    consola.push(`titulo: ${await reposos.first().getAttribute('title')}`);
    const caja = await reposos.first().boundingBox();
    consola.push(`boundingBox del hueco: ${JSON.stringify(caja)}`);
    // Primero-de-todo: bloque completo de la cita alrededor del hueco (clip generoso).
    if (caja) {
      await page.screenshot({
        path: path.join(DIR, 'visual-movil-bloque-antes.png'),
        clip: { x: Math.max(0, caja.x - 10), y: Math.max(0, caja.y - 110), width: Math.min(390, caja.width + 220), height: caja.height + 220 },
      });
    }
    // Click sobre el BLOQUE de la cita (no sobre el hueco interactivo): la
    // clienta del reposo.
    const cita = frame.getByText('Lucía Blanco').first();
    if (await cita.count()) {
      await cita.click({ timeout: 8000, force: true }).catch((e) => consola.push(`click cita: ${String(e).slice(0, 150)}`));
      await frame.waitForTimeout(2000);
      await page.screenshot({ path: path.join(DIR, 'visual-movil-clic.png') });
      if (caja) {
        await page.screenshot({
          path: path.join(DIR, 'visual-movil-bloque-despues.png'),
          clip: { x: Math.max(0, caja.x - 10), y: Math.max(0, caja.y - 110), width: Math.min(390, caja.width + 220), height: caja.height + 220 },
        });
      }
    } else {
      consola.push('no se encuentra el texto de la clienta');
    }
  }
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'visual-movil-consola.txt'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 2000));
}
