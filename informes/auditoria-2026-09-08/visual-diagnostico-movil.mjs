// Diagnostico DOM de la rejilla movil: estan las tarjetas en el DOM? con que geometria?
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE = 'http://127.0.0.1:8080';
const consola = [];

const nav = await chromium.launch();
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 250)}`));
  await page.goto(`${BASE}/demo.html?share=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  for (const txt of ['Rechazar todas', 'Rechazar', 'Aceptar todas', 'Aceptar']) {
    const b = page.getByRole('button', { name: new RegExp(txt, 'i') }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); }
  }
  const vpl = page.getByText('Ver por libre').first();
  if (await vpl.count()) { await vpl.click({ timeout: 4000 }).catch(() => {}); }
  const frame = page.frames().find((f) => f.url().includes('/app')) ?? page.mainFrame();
  await frame.waitForSelector('text=Nueva cita', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000); // margen real a que carguen citas y realtime

  const diag = await frame.evaluate(() => {
    const fuera = [];
    // La rejilla: contenedor con position relative y hijos absolute (las tarjetas viven asi)
    const candidatos = [...document.querySelectorAll('div')].filter((d) => {
      const s = getComputedStyle(d);
      return s.position === 'relative' && d.querySelectorAll(':scope > *').length > 0;
    });
    for (const cont of candidatos) {
      const abs = [...cont.children].filter((c) => getComputedStyle(c).position === 'absolute');
      if (abs.length < 3) continue;
      const geo = abs.slice(0, 6).map((c) => {
        const r = c.getBoundingClientRect();
        return {
          titulo: (c.getAttribute('title') || c.textContent || '').slice(0, 40),
          top: c.style.top, left: c.style.left, width: r.width, height: r.height,
          visibilidad: getComputedStyle(c).display,
        };
      });
      fuera.push({ contenedor: cont.className?.toString().slice(0, 40), hijosAbsolutos: abs.length, geo });
    }
    const reposos = document.querySelectorAll('[title^="Reposo de"]').length;
    return { contenedores: fuera.slice(0, 3), reposos, cuerpo: document.body.innerText.slice(0, 400) };
  });
  consola.push(JSON.stringify(diag, null, 1).slice(0, 2500));
  await page.screenshot({ path: path.join(DIR, 'visual-movil-diagnostico.png') });
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'visual-movil-diagnostico.txt'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 2600));
}
