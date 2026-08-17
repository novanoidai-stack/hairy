// Mide en PRODUCCION (www.mechaa.es): tiempo de login + arranque del software
// y duplicados de lecturas a Supabase tras el login.
// Uso: node scripts/seo/medir-login-prod.mjs
import { chromium } from 'playwright';

const BASE = 'https://www.mechaa.es';
const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;

const browser = await chromium.launch();
try {
  const c = await browser.newContext();
  const page = await c.newPage();

  const lecturas = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/rest/v1/') && (r.method() === 'GET' || r.method() === 'HEAD')) lecturas.push(u);
  });

  const t0 = Date.now();
  await page.goto(`${BASE}/acceso.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.MechaAPI, null, { timeout: 30000 });
  const tLista = Date.now() - t0;

  const tab = page.locator('#tabLogin');
  if (await tab.isVisible().catch(() => false)) await tab.click({ force: true }).catch(() => {});
  await page.locator('input#loginEmail').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input#loginEmail').fill('carlitosocanamartinez@gmail.com');
  await page.locator('input#loginPw').fill('minicharlie2007');
  const t1 = Date.now();
  await page.locator('button#loginBtn').click();
  // Tras el login aparece el selector "¿Qué quieres hacer?": entrar al software.
  const entrar = page.getByText('Entrar al software', { exact: false });
  await entrar.waitFor({ state: 'visible', timeout: 45000 });
  const tLogin = Date.now() - t1;
  const t2 = Date.now();
  await entrar.click();
  await page.waitForURL('**/app**', { timeout: 45000 });
  console.log(`selector -> /app cargando:          ${fmt(Date.now() - t2)}`);

  // Deja que el software termine de arrancar (consultas de arranque).
  await page.waitForTimeout(12000);

  const conteo = {};
  for (const u of lecturas) conteo[u] = (conteo[u] || 0) + 1;
  const dupes = Object.entries(conteo).filter(([, n]) => n > 1);
  console.log('--- Login + arranque en produccion ---');
  console.log(`acceso.html listo para teclear: ${fmt(tLista)}`);
  console.log(`pulsar Entrar -> /app montada:    ${fmt(tLogin)}`);
  console.log(`lecturas Supabase (GET/HEAD) tras login: total=${lecturas.length} unicas=${Object.keys(conteo).length} repetidas=${dupes.length}`);
  for (const [u, n] of dupes.slice(0, 10)) console.log(`  x${n} ${u.replace('https://vtrggiogjrhqtwbhbgia.supabase.co/rest/v1/', '').slice(0, 90)}`);
  await c.close();
} finally {
  await browser.close();
}
