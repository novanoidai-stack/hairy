// Páginas de ciudad (local SEO programático): /peluquerias-en-<ciudad>.
// Agrupa los salones del directorio por ciudad y genera una pagina indexable
// por ciudad ("Peluquerias en Madrid", etc.). CollectionPage + ItemList.

import { writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL, agruparPorCiudad } from './data.mjs';
import { pageHtml, breadcrumbJsonLd, esc } from './render.mjs';

const OUT_ROOT = join(root, 'web');

const CARD_STYLE = `<style>
  .seo-intro{font-size:17px;line-height:1.65;color:var(--d-text-sec);max-width:760px;margin:6px 0 26px}
  .seo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .seo-card{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:18px;display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit}
  .seo-card:hover{border-color:var(--d-border-hi);box-shadow:0 6px 20px rgba(0,0,0,.05)}
  .seo-card h3{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:18px;font-weight:700;margin:0;color:var(--d-text)}
  .seo-card .meta{font-size:13.5px;color:var(--d-text-sec);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .seo-card .star{font-weight:700;color:var(--d-text)}
  .seo-card .addr{font-size:13px;color:var(--d-text-ter)}
  .seo-card .go{margin-top:6px;font-size:14px;font-weight:700;color:var(--d-fuego-hi)}
  .seo-cta{margin-top:34px;background:var(--d-card-hi);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .seo-cta h2{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:21px;margin:0}
  .seo-cta p{margin:6px 0 0;color:var(--d-text-sec);font-size:14.5px}
  .seo-cta a{display:inline-flex;align-items:center;gap:8px;padding:13px 20px;border-radius:var(--d-r-md);background:var(--d-grad);color:#fff;font-weight:700;text-decoration:none}
  .seo-crumb{font-size:13px;color:var(--d-text-ter);margin:0 0 18px}
  .seo-crumb a{color:var(--d-text-sec)}
  @media(max-width:680px){.seo-cta{flex-direction:column;align-items:flex-start}}
</style>`;

function starRow(s) {
  if (Number(s.valoracion) > 0 && Number(s.resenas) > 0) {
    return `<span class="star">★ ${esc(String(s.valoracion).replace('.', ','))}</span><span>${esc(s.resenas)} ${Number(s.resenas) === 1 ? 'resena' : 'resenas'}</span>`;
  }
  return `<span style="color:var(--d-text-mut)">Nuevo en Mecha</span>`;
}

function salonCard(s) {
  const addr = [s.direccion, s.ciudad].filter(Boolean).join(', ');
  return `<a class="seo-card" href="/salon/${esc(s.slug)}">
    <h3>${esc(s.nombre)}</h3>
    <div class="meta">${starRow(s)}</div>
    ${addr ? `<div class="addr">${esc(addr)}</div>` : ''}
    <span class="go">Ver salon y reservar &rarr;</span>
  </a>`;
}

function cityPageHtml(grupo) {
  const { ciudad, provincia, salones, citySlug } = grupo;
  const path = `/peluquerias-en-${citySlug}`;
  const titulo = `Peluquerias y barberias en ${ciudad} — Reserva cita online | Mecha`;
  const descripcion = `Peluquerias y barberias en ${ciudad}${provincia ? ` (${provincia})` : ''} con reserva online: servicios, precios y valoraciones. Pide cita sin llamar por telefono.`;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Peluquerias en ${ciudad}`,
    numberOfItems: salones.length,
    itemListElement: salones.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/salon/${s.slug}`,
      name: s.nombre
    }))
  };

  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${BASE_URL}${path}#collection`,
    url: `${BASE_URL}${path}`,
    name: titulo,
    description: descripcion,
    isPartOf: { '@type': 'WebSite', '@id': `${BASE_URL}/#website`, name: 'Mecha OS', url: `${BASE_URL}/` },
    about: itemList,
    inLanguage: 'es'
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Directorio de Salones', path: '/salones' },
    { name: ciudad, path }
  ]);

  const n = salones.length;
  const body = `${CARD_STYLE}
<nav class="seo-crumb" aria-label="Migas de pan"><a href="/">Inicio</a> &rsaquo; <a href="/salones">Directorio</a> &rsaquo; ${esc(ciudad)}</nav>
<h1 style="font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-0.03em;margin:0 0 4px">Peluquerias y barberias en ${esc(ciudad)} <span class="em">con reserva online</span></h1>
<p class="seo-intro">${n} ${n === 1 ? 'salon trabaja con Mecha en' : 'salones trabajan con Mecha en'} ${esc(ciudad)}: mira sus servicios, precios y valoraciones y pide cita online a la hora que te venga bien. Reservas directamente en la agenda del salon, sin llamadas ni intermediarios.</p>
<div class="seo-grid">
${salones.map(salonCard).join('\n')}
</div>
<section class="seo-cta">
  <div>
    <h2>Tienes un salon en ${esc(ciudad)}?</h2>
    <p>Mecha es el software con el que estos salones llevan su agenda, su caja y sus clientas. Aparecer en este directorio va incluido.</p>
  </div>
  <a href="/#precios">Activar mi salon</a>
</section>`;

  return pageHtml({
    title: titulo,
    description: descripcion,
    path,
    active: 'ciudad',
    jsonLd: [collectionPage, itemList, breadcrumb],
    bodyHtml: body
  });
}

/**
 * Genera una pagina por ciudad. Devuelve [{ citySlug, ciudad, path, count }].
 * Limpia los directorios peluquerias-en-* previos para no dejar ciudades muertas.
 */
export function generateCityPages(salones) {
  const grupos = agruparPorCiudad(salones);
  if (grupos.length === 0) {
    console.warn('[generate-city-pages] Sin ciudades en los salones; saltando.');
    return [];
  }

  // Limpieza de paginas de ciudad previas (directorio peluquerias-en-*).
  try {
    for (const entry of readdirSync(OUT_ROOT)) {
      if (entry.startsWith('peluquerias-en-')) {
        const p = join(OUT_ROOT, entry);
        if (statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
      }
    }
  } catch (_) { /* best-effort */ }

  const escritos = [];
  for (const grupo of grupos) {
    const dir = join(OUT_ROOT, `peluquerias-en-${grupo.citySlug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), cityPageHtml(grupo), 'utf8');
    escritos.push({ citySlug: grupo.citySlug, ciudad: grupo.ciudad, path: `/peluquerias-en-${grupo.citySlug}`, count: grupo.salones.length });
  }
  console.log(`[generate-city-pages] ${escritos.length} paginas de ciudad generadas.`);
  return escritos;
}
