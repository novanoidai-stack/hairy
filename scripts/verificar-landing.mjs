// Verificacion headless de la landing (espejo local). No es parte del build.
//
//   node scripts/verificar-landing.mjs [urlBase]
//
// Comprueba que la seccion de precios existe, que el widget de Chispa responde
// de verdad (llamada real a la edge chispa-landing) y que no hay errores de
// consola. Deja capturas verif-*.png en la raiz para revisarlas a ojo.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8910';

// El Chromium de Playwright vive en %LOCALAPPDATA%\ms-playwright\chromium-<v>\chrome-win64.
function buscarChromium() {
  const raiz = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(raiz)) return undefined;
  const candidatos = [];
  for (const dir of fs.readdirSync(raiz)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(raiz, dir, sub, 'chrome.exe');
      if (fs.existsSync(exe)) candidatos.push(exe);
    }
  }
  return candidatos.pop();
}

const browser = await chromium.launch({ executablePath: buscarChromium(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errores = [];
page.on('pageerror', (e) => errores.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errores.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });

const navPrecios = await page.locator('.nav-links a[href="#precios"]').count();
const planes = await page.locator('#precios .price-card').count();
const cuenta = await page.locator('#precios .pm-item').count();
console.log(`nav Precios: ${navPrecios} | tarjetas de plan: ${planes} | items de la cuenta: ${cuenta}`);

const precios = await page.locator('#precios .pc-price').allInnerTexts();
console.log('precios visibles:', precios.map((p) => p.replace(/\s+/g, ' ').trim()).join(' / '));

await page.locator('#precios').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await page.locator('#precios').screenshot({ path: 'verif-pricing.png' });

// Widget de venta: abrir, pulsar la sugerencia de precio y esperar respuesta REAL.
await page.click('#chispa-bubble');
await page.waitForTimeout(400);
await page.click('#chispa-chips button');
await page.waitForFunction(
  () => document.querySelectorAll('#chispa-messages .chispa-msg.bot').length >= 2
    && !document.getElementById('chispa-typing'),
  { timeout: 45000 },
);
const respuesta = await page.evaluate(() => {
  const msgs = document.querySelectorAll('#chispa-messages .chispa-msg.bot');
  return msgs[msgs.length - 1].innerText;
});
console.log('--- respuesta del asistente ---');
console.log(respuesta);
const enlaces = await page.locator('#chispa-messages .chispa-msg.bot a').allInnerTexts();
console.log('enlaces ofrecidos:', enlaces.join(' | ') || '(ninguno)');
await page.locator('#chispa-window').screenshot({ path: 'verif-widget.png' });

console.log('errores de consola:', errores.length ? errores.slice(0, 6) : 'ninguno');
await browser.close();
