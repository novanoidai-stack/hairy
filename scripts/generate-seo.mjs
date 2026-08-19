// Orquestador SEO/AIO: genera fichas de salon prerender, paginas de ciudad y
// landings de long-tail con un unico fetch a Supabase. El sitemap lo genera
// aparte generate-sitemap.mjs (autocontenido y testeable por separado).
//
// Uso: node scripts/generate-seo.mjs   (tambien wired en build:web)

import { fetchSalones } from './seo/data.mjs';
import { prerenderSalons } from './seo/prerender-salons.mjs';
import { generateCityPages } from './seo/generate-city-pages.mjs';
import { generateLandingPages } from './seo/generate-landing-pages.mjs';
import { generateSeoPages } from './seo/generate-seo-pages.mjs';

async function main() {
  const t0 = Date.now();
  console.log('——— SEO/AIO build start ———');

  const salones = await fetchSalones();

  const salonSlugs = prerenderSalons(salones);
  const cities = generateCityPages(salones);
  const landings = generateLandingPages();
  const serviceCityPages = generateSeoPages(salones);

  console.log(`——— SEO/AIO build ok (${Date.now() - t0}ms): ${salonSlugs.length} fichas, ${cities.length} ciudades, ${landings.length} landings, ${serviceCityPages.length} landings locales 2D ———`);
}

main().catch(err => {
  console.error('[generate-seo] Error fatal:', err);
  process.exit(1);
});
