import { chromium } from 'playwright';

// Regenera las capturas de pantalla completa del manual de la Agenda desde la demo
// publica y calcula el highlight (en %) del elemento que senala cada seccion.
// Uso: node scratch/capture-agenda.mjs
const URL = 'https://www.mechaa.es/demo.html?share=1';
const W = 1600, H = 915, IFRAME_Y = 60;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(12000);

// Fuera el envoltorio de la demo (tour guiado, velo, barra de cookies): solo se
// ocultan para la captura, no se pulsa ningun boton de consentimiento.
const limpiar = () => page.evaluate(() => {
  ['#gt', '#gtVeil', '#gtDock', '#shareModalOverlay', '.mck-bar-wrap'].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => { el.style.display = 'none'; });
  });
});
await limpiar();
await page.waitForTimeout(1500);

const frame = page.frames().find((f) => f.url().includes('/app'));
const pct = (n, total) => `${Math.round((n / total) * 1000) / 10}%`;

async function highlightDe(fn) {
  const box = await frame.evaluate(fn);
  if (!box) return null;
  const pad = 6;
  return {
    top: pct(box.y + IFRAME_Y - pad, H),
    left: pct(box.x - pad, W),
    width: pct(box.w + pad * 2, W),
    height: pct(box.h + pad * 2, H),
  };
}

// 1) Vista de dia/semana/mes
const hVistas = await highlightDe(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => ['Dia', 'Semana', 'Mes'].includes(b.innerText.trim()));
  if (btns.length < 3) return null;
  const r = btns.map((b) => b.getBoundingClientRect());
  const x = Math.min(...r.map((v) => v.left)), y = Math.min(...r.map((v) => v.top));
  return { x, y, w: Math.max(...r.map((v) => v.right)) - x, h: Math.max(...r.map((v) => v.bottom)) - y };
});
console.log('vistas highlight:', JSON.stringify(hVistas));
await page.screenshot({ path: 'scratch/agenda-vistas.png' });

// 2) Campana de avisos: se abre el panel y se senala la campana
const hAvisos = await highlightDe(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('title') || '').toLowerCase().includes('aviso'));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
console.log('avisos highlight:', JSON.stringify(hAvisos));

const campana = frame.locator('button[title*="viso" i]').first();
if (await campana.count()) {
  await campana.click();
  await page.waitForTimeout(2500);
  await limpiar();
  await page.screenshot({ path: 'scratch/agenda-avisos.png' });
  console.log('panel de avisos capturado');
} else {
  console.log('no se encontro la campana de avisos');
}

await browser.close();
