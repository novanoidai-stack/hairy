// Barrido de QA de la app (espejo local, tenant de demo). No es parte del build.
//
//   node scripts/verificar-app.mjs [urlBase]
//
// Entra en la demo compartida (iframe de demo.html), recorre las pantallas
// principales y reporta errores de consola, peticiones fallidas y pantallas en
// blanco. Deja verif-app-<pantalla>.png de cada una.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8910';

function buscarChromium() {
  const raiz = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(raiz)) return undefined;
  let ultimo;
  for (const dir of fs.readdirSync(raiz)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(raiz, dir, sub, 'chrome.exe');
      if (fs.existsSync(exe)) ultimo = exe;
    }
  }
  return ultimo;
}

// Ruido conocido que no es un fallo de la app.
const RUIDO = [
  'favicon',
  'Download the React DevTools',
  'analytics',
  // Vercel Analytics solo existe servido desde Vercel: en el espejo local da 404.
  '/_vercel/insights',
  // El mensaje generico del navegador no dice QUE recurso fallo; las peticiones
  // fallidas ya se reportan aparte con su URL, que es lo util.
  'Failed to load resource',
];
const esRuido = (t) => RUIDO.some((r) => t.includes(r));

const PANTALLAS = [
  ['agenda', '/app/?demo=1'],
  ['citas', '/app/citas?demo=1'],
  ['clientes', '/app/clientes?demo=1'],
  ['caja', '/app/caja?demo=1'],
  ['informes', '/app/informes?demo=1'],
  ['equipo', '/app/equipo?demo=1'],
  ['inventario', '/app/inventario?demo=1'],
  ['presupuestos', '/app/presupuestos?demo=1'],
  ['bandeja', '/app/bandeja?demo=1'],
  ['lista-espera', '/app/lista-espera?demo=1'],
  ['campanas', '/app/campanas?demo=1'],
  ['resenas', '/app/resenas?demo=1'],
  ['mi-jornada', '/app/mi-jornada?demo=1'],
  ['configuracion', '/app/configuracion?demo=1'],
];

const browser = await chromium.launch({ executablePath: buscarChromium(), headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// La demo entra sola con la cuenta compartida, pero solo si va EMBEBIDA en un
// iframe del mismo origen: por eso arrancamos por demo.html y no por /app.
await page.goto(`${BASE}/demo.html?share=1`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForFunction(
  () => { try { return !!localStorage.getItem('mecha-demo-auth'); } catch { return false; } },
  { timeout: 45000 },
);
console.log('sesion de demo lista');

const problemas = [];
for (const [nombre, ruta] of PANTALLAS) {
  const errores = [];
  const onErr = (e) => { if (!esRuido(e.message)) errores.push(`pageerror: ${e.message}`); };
  const onCon = (m) => { if (m.type() === 'error' && !esRuido(m.text())) errores.push(`console: ${m.text()}`); };
  const onRes = (r) => {
    if (r.status() >= 400 && !esRuido(r.url())) errores.push(`http ${r.status()}: ${r.url().slice(0, 110)}`);
  };
  page.on('pageerror', onErr);
  page.on('console', onCon);
  page.on('response', onRes);

  // Navegar DENTRO del iframe: recargarlo es lo unico que hace que la pantalla
  // monte con la sesion de demo ya establecida.
  await page.evaluate((r) => {
    const f = document.querySelector('iframe');
    if (f) f.src = r;
  }, ruta);
  await page.waitForTimeout(5200);

  const frame = page.frames().find((f) => f.url().includes('/app'));
  let texto = '';
  try { texto = await frame.evaluate(() => document.body.innerText.slice(0, 4000)); } catch { texto = ''; }
  const vacia = texto.replace(/\s/g, '').length < 40;
  const estado = vacia ? 'EN BLANCO' : `${texto.replace(/\s+/g, ' ').slice(0, 70)}...`;
  console.log(`\n[${nombre}] ${estado}`);
  if (errores.length) {
    console.log('  problemas:');
    [...new Set(errores)].slice(0, 5).forEach((e) => console.log('   -', e));
  }
  if (vacia || errores.length) problemas.push({ nombre, vacia, errores: [...new Set(errores)].slice(0, 5) });

  try { await page.screenshot({ path: `verif-app-${nombre}.png` }); } catch {}
  page.off('pageerror', onErr);
  page.off('console', onCon);
  page.off('response', onRes);
}

console.log('\n===== RESUMEN =====');
if (!problemas.length) console.log('Todas las pantallas cargan sin errores.');
else problemas.forEach((p) => console.log(`${p.nombre}: ${p.vacia ? 'EN BLANCO ' : ''}${p.errores.length} problema(s)`));

await browser.close();
