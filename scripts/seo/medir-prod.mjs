// Medicion de tiempos reales en produccion (www.mechaa.es).
// Uso: node scripts/seo/medir-prod.mjs
import { chromium } from 'playwright';

const BASE = 'https://www.mechaa.es';
const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;

async function medirPagina(context, url, { fria = false } = {}) {
  const page = await context.newPage();
  if (fria) await page.route('**/*', (r) => r.continue()); // cache del contexto ya limpio
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const load = Date.now() - t0;
  // espera extra a que se calme la red (app renderiza tras fetches)
  const t1 = Date.now();
  try { await page.waitForLoadState('networkidle', { timeout: 20000 }); } catch {}
  const idle = Date.now() - t1;
  await page.close();
  return { load, idle };
}

const browser = await chromium.launch();
try {
  // 1. Landing y marketplace (ida y vuelta)
  {
    const c = await browser.newContext();
    console.log('--- Navegacion publica (cache caliente, como un visitante que ya estuvo) ---');
    let p = await medirPagina(c, `${BASE}/`);
    console.log(`landing        load=${fmt(p.load)} red-en-calma=${fmt(p.idle)}`);
    p = await medirPagina(c, `${BASE}/marketplace.html`);
    console.log(`marketplace    load=${fmt(p.load)} red-en-calma=${fmt(p.idle)}`);
    p = await medirPagina(c, `${BASE}/`);
    console.log(`volver landing load=${fmt(p.load)} red-en-calma=${fmt(p.idle)}`);
    await c.close();
  }

  // 2. Software /app: primera visita (cache fria) y segunda (caliente)
  {
    const fria = await browser.newContext();
    let p = await medirPagina(fria, `${BASE}/app`);
    console.log('--- /app (software) ---');
    console.log(`1a visita fria load=${fmt(p.load)} red-en-calma=${fmt(p.idle)}`);
    p = await medirPagina(fria, `${BASE}/app`);
    console.log(`2a visita      load=${fmt(p.load)} red-en-calma=${fmt(p.idle)}`);
    await fria.close();
  }

  // 3. Demo embebida: peticiones a Supabase al arrancar (deduplicacion)
  {
    const c = await browser.newContext();
    const page = await c.newPage();
    const urls = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('/rest/v1/') && (r.method() === 'GET' || r.method() === 'HEAD')) urls.push(u);
    });
    await page.goto(`${BASE}/demo.html`, { waitUntil: 'load', timeout: 60000 });
    try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch {}
    await page.waitForTimeout(8000); // ventana de arranque del iframe
    const conteo = {};
    for (const u of urls) conteo[u] = (conteo[u] || 0) + 1;
    const dupes = Object.entries(conteo).filter(([, n]) => n > 1);
    console.log('--- Demo (iframe /app?demo=1): lecturas a Supabase en el arranque ---');
    console.log(`total=${urls.length} unicas=${Object.keys(conteo).length} repetidas=${dupes.length}`);
    for (const [u, n] of dupes.slice(0, 8)) console.log(`  x${n} ${u.replace(BASE, '').slice(0, 100)}`);
    await c.close();
  }
} finally {
  await browser.close();
}
