// Genera dinámicamente web/sitemap.xml y web/sitemap-marketplace.xml con URLs canónicas HTTPS.
// Enumera: páginas estáticas + fichas de salón + páginas de ciudad + landings
// de long-tail + matriz combinatoria /{ciudad}/{servicio-tecnico}.
//
// Autocontenido: se puede ejecutar solo (lo usa el test challenger y postbuild).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL, fetchSalones, agruparPorCiudad } from './seo/data.mjs';
import { LANDING_PAGES } from './seo/pages.mjs';
import { SERVICIOS_TECNICOS } from './seo/services-data.mjs';

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatUrlset(routes) {
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

function buildSitemaps(salones) {
  const today = new Date().toISOString().split('T')[0];

  // 1. Rutas Core e Institucionales
  const coreRoutes = [
    { loc: `${BASE_URL}/`, changefreq: 'weekly', priority: '1.0', lastmod: today },
    { loc: `${BASE_URL}/salones`, changefreq: 'daily', priority: '0.9', lastmod: today },
    { loc: `${BASE_URL}/especificaciones.html`, changefreq: 'monthly', priority: '0.8', lastmod: today },
    { loc: `${BASE_URL}/calculadora-comisiones`, changefreq: 'monthly', priority: '0.8', lastmod: today },
    { loc: `${BASE_URL}/calculadora-ahorro-comisiones`, changefreq: 'monthly', priority: '0.8', lastmod: today }
  ];

  // 2. Landings de long-tail (nicho, modulo, comparativa)
  const landingRoutes = LANDING_PAGES.map(p => ({
    loc: `${BASE_URL}/${p.slug}`,
    changefreq: 'monthly',
    priority: '0.8',
    lastmod: today
  }));

  // 3. Páginas de ciudad (/peluquerias-en-<ciudad>)
  const ciudadesGrupos = agruparPorCiudad(salones);
  const cityRoutes = ciudadesGrupos.map(c => ({
    loc: `${BASE_URL}/peluquerias-en-${c.citySlug}`,
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: today
  }));

  // 4. Matriz 2D /{ciudad}/{servicio-tecnico}
  const serviceCityRoutes = [];
  for (const c of ciudadesGrupos) {
    for (const s of SERVICIOS_TECNICOS) {
      serviceCityRoutes.push({
        loc: `${BASE_URL}/${c.citySlug}/${s.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: today
      });
      if (s.aliasSlugs && s.aliasSlugs.length > 0) {
        for (const alias of s.aliasSlugs) {
          serviceCityRoutes.push({
            loc: `${BASE_URL}/${c.citySlug}/${alias}`,
            changefreq: 'weekly',
            priority: '0.8',
            lastmod: today
          });
        }
      }
    }
  }

  // 5. Fichas individuales de salón (/salon/<slug>)
  const salonRoutes = salones.map(s => ({
    loc: `${BASE_URL}/salon/${s.slug}`,
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: today
  }));

  // Rutas totales para sitemap.xml
  const allRoutes = [
    ...coreRoutes,
    ...landingRoutes,
    ...cityRoutes,
    ...serviceCityRoutes,
    ...salonRoutes
  ];

  // Rutas exclusivas del marketplace para sitemap-marketplace.xml
  const marketplaceRoutes = [
    { loc: `${BASE_URL}/salones`, changefreq: 'daily', priority: '1.0', lastmod: today },
    ...cityRoutes,
    ...serviceCityRoutes,
    ...salonRoutes
  ];

  return {
    sitemapXml: formatUrlset(allRoutes),
    marketplaceXml: formatUrlset(marketplaceRoutes),
    totalCount: allRoutes.length,
    marketplaceCount: marketplaceRoutes.length
  };
}

async function main() {
  const salones = await fetchSalones();
  const { sitemapXml, marketplaceXml, totalCount, marketplaceCount } = buildSitemaps(salones);

  const mainPath = join(root, 'web', 'sitemap.xml');
  const marketPath = join(root, 'web', 'sitemap-marketplace.xml');

  writeFileSync(mainPath, sitemapXml, 'utf8');
  writeFileSync(marketPath, marketplaceXml, 'utf8');

  console.log(`[generate-sitemap] ✅ sitemap.xml (${totalCount} URLs) y sitemap-marketplace.xml (${marketplaceCount} URLs) generados correctamente.`);
}

main().catch(err => {
  console.error('[generate-sitemap] Error fatal:', err);
  process.exit(1);
});
