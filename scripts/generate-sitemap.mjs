// Genera dinamicamente web/sitemap.xml con URLs canonicas HTTPS.
// Enumera: paginas estaticas + fichas de salon + paginas de ciudad + landings
// de long-tail. Fuente de datos: fetchSalones (anon key + RLS) compartida con
// el resto de generadores, y la lista de landings de seo/pages.mjs.
//
// Autocontenido: se puede ejecutar solo (lo usa el test challenger y postbuild).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL, fetchSalones, agruparPorCiudad } from './seo/data.mjs';
import { LANDING_PAGES } from './seo/pages.mjs';

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSitemap(salones) {
  const today = new Date().toISOString().split('T')[0];

  const routes = [
    { loc: `${BASE_URL}/`, changefreq: 'weekly', priority: '1.0', lastmod: today },
    { loc: `${BASE_URL}/salones`, changefreq: 'daily', priority: '0.9', lastmod: today },
    { loc: `${BASE_URL}/especificaciones.html`, changefreq: 'monthly', priority: '0.8', lastmod: today },
    { loc: `${BASE_URL}/calculadora-comisiones`, changefreq: 'monthly', priority: '0.8', lastmod: today },
    { loc: `${BASE_URL}/calculadora-ahorro-comisiones`, changefreq: 'monthly', priority: '0.8', lastmod: today }
  ];

  // Landings de long-tail (nicho, modulo, comparativa).
  for (const p of LANDING_PAGES) {
    routes.push({ loc: `${BASE_URL}/${p.slug}`, changefreq: 'monthly', priority: '0.8', lastmod: today });
  }

  // Paginas de ciudad.
  for (const c of agruparPorCiudad(salones)) {
    routes.push({ loc: `${BASE_URL}/peluquerias-en-${c.citySlug}`, changefreq: 'weekly', priority: '0.7', lastmod: today });
  }

  // Fichas de salon prerenderizadas.
  for (const s of salones) {
    routes.push({ loc: `${BASE_URL}/salon/${s.slug}`, changefreq: 'weekly', priority: '0.8', lastmod: today });
  }

  const urlsXml = routes.map(r => `  <url>
    <loc>${xmlEscape(r.loc)}</loc>
    <lastmod>${r.lastmod}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>
`;
}

async function main() {
  const salones = await fetchSalones();
  const xml = buildSitemap(salones);

  const outputPath = join(root, 'web', 'sitemap.xml');
  writeFileSync(outputPath, xml, 'utf8');
  console.log(`[generate-sitemap] sitemap.xml generado en ${outputPath} (${salones.length} salones).`);
}

main().catch(err => {
  console.error('[generate-sitemap] Error fatal:', err);
  process.exit(1);
});
