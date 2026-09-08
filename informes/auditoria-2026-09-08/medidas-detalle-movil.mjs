// Mide la geometria REAL del detalle de cita en movil: hoja, cuerpo scrollable y pie.
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
  page.on('pageerror', (e) => consola.push(`[pageerror] ${String(e).slice(0, 200)}`));
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
  await page.waitForTimeout(5000);
  await frame.evaluate(() => {
    const conScroll = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) conScroll.push(el);
    });
    conScroll.sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (conScroll[0]) conScroll[0].scrollTop = conScroll[0].scrollHeight * 0.62;
  });
  await page.waitForTimeout(700);
  const tarjeta = frame.locator('[data-mecha-estado]', { has: frame.locator('[title^="Reposo de"]') }).first();
  const caja = await tarjeta.boundingBox();
  await page.touchscreen.tap(caja.x + Math.min(caja.width / 2, 80), caja.y + Math.max(14, caja.height * 0.15));
  await page.waitForTimeout(2500);

  const medidas = await frame.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const zoomHtml = document.documentElement.style.zoom || '(sin zoom)';
    const cssZoom = getComputedStyle(document.documentElement).getPropertyValue('--mecha-zoom') || '(sin var)';
    // La hoja: el contenedor fixed con clase m-modal-enter
    const hoja = document.querySelector('.m-modal-enter');
    // El cuerpo scrollable del detalle
    const cuerpos = [...document.querySelectorAll('div')].filter(
      (d) => d.style.overflowY === 'auto' && d.scrollHeight > d.clientHeight + 30,
    );
    const cuerpo = cuerpos.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    // El pie: el div que contiene el boton "Guardar cambios"
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Guardar cambios'));
    const pie = btn?.closest('div');
    const rHoja = hoja?.getBoundingClientRect();
    const rCuerpo = cuerpo?.getBoundingClientRect();
    const rPie = pie?.getBoundingClientRect();
    return {
      viewport: { vw, vh },
      zoomHtml, cssZoom,
      hoja: rHoja && { top: rHoja.top, bottom: rHoja.bottom, h: rHoja.height, cssH: hoja.style.height },
      cuerpo: rCuerpo && {
        top: rCuerpo.top, bottom: rCuerpo.bottom, h: rCuerpo.height,
        scrollH: cuerpo.scrollHeight, clientH: cuerpo.clientHeight,
        masAltoQueHoja: cuerpo.scrollHeight > cuerpo.clientHeight,
      },
      pie: rPie && { top: rPie.top, bottom: rPie.bottom, h: rPie.height, fueraDePantalla: rPie.bottom > vh },
    };
  });
  consola.push(JSON.stringify(medidas, null, 1));
  await ctx.close();
} finally {
  await nav.close();
  fs.writeFileSync(path.join(DIR, 'medidas-detalle-movil.json'), consola.join('\n'));
  console.log(consola.join('\n').slice(0, 1500));
}
