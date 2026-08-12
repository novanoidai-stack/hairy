// Render de las paginas SEO de long-tail (nicho, modulo, comparativa) a partir
// del spec pages.mjs. Genera web/<slug>/index.html con H1, lead, bloques,
// tabla comparativa (si aplica), FAQ visible y JSON-LD (SoftwareApplication o
// WebPage+Article, FAQPage, BreadcrumbList).

import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL } from './data.mjs';
import { LANDING_PAGES } from './pages.mjs';
import { pageHtml, breadcrumbJsonLd, esc } from './render.mjs';

const OUT_ROOT = join(root, 'web');

const STYLE = `<style>
  .seo-h1{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:clamp(27px,4.2vw,40px);font-weight:800;letter-spacing:-0.03em;margin:0 0 8px;line-height:1.08}
  .seo-h1 .em{background:var(--d-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .seo-lead{font-size:18px;line-height:1.65;color:var(--d-text-sec);max-width:820px;margin:0 0 30px}
  .seo-crumb{font-size:13px;color:var(--d-text-ter);margin:0 0 18px}
  .seo-crumb a{color:var(--d-text-sec)}
  .seo-h2{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:24px;font-weight:700;margin:38px 0 16px;letter-spacing:-0.02em}
  .seo-feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
  .seo-item{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:20px}
  .seo-item h3{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:17px;font-weight:700;margin:0 0 8px}
  .seo-item p{margin:0;font-size:14.5px;line-height:1.6;color:var(--d-text-sec)}
  .seo-cmp{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);overflow:hidden}
  .seo-cmp th,.seo-cmp td{padding:13px 16px;text-align:left;border-bottom:1px solid var(--d-border);vertical-align:top}
  .seo-cmp thead th{background:var(--d-card-hi);font-family:'Bricolage Grotesque','Inter',sans-serif}
  .seo-cmp tbody tr:last-child td{border-bottom:0}
  .seo-cmp .yes{color:#1a7f37;font-weight:700}
  .seo-cmp .no{color:var(--d-text-ter)}
  .seo-cmp .col-mecha{background:rgba(244,80,30,0.04)}
  .seo-faq{display:flex;flex-direction:column;gap:10px}
  .seo-faq details{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-md);padding:4px 18px}
  .seo-faq summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none;font-size:15.5px}
  .seo-faq summary::-webkit-details-marker{display:none}
  .seo-faq summary::after{content:'+';float:right;color:var(--d-fuego-hi)}
  .seo-faq details[open] summary::after{content:'\\2212'}
  .seo-faq p{margin:0 0 14px;font-size:14.5px;line-height:1.6;color:var(--d-text-sec)}
  .seo-cta{margin-top:38px;background:var(--d-grad);border-radius:var(--d-r-lg);padding:28px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .seo-cta h2{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:22px;margin:0}
  .seo-cta p{margin:6px 0 0;font-size:14.5px;opacity:.95}
  .seo-cta a{display:inline-flex;align-items:center;gap:8px;padding:14px 22px;border-radius:var(--d-r-md);background:#fff;color:#b8360a;font-weight:700;text-decoration:none}
  @media(max-width:680px){.seo-cta{flex-direction:column;align-items:flex-start}.seo-cmp{font-size:13px}.seo-cmp th,.seo-cmp td{padding:10px}}
</style>`;

function faqVisible(faqs) {
  return `<div class="seo-faq" id="faq">
${faqs.map(f => `    <details>
      <summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p>
    </details>`).join('\n')}
  </div>`;
}

function comparisonTable(rows, competidor) {
  return `<table class="seo-cmp">
    <thead><tr><th>Aspecto</th><th class="col-mecha">Mecha</th><th>${esc(competidor)}</th></tr></thead>
    <tbody>
${rows.map(r => `      <tr><td>${esc(r.aspecto)}</td><td class="col-mecha">${esc(r.mecha)}</td><td>${esc(r.otro)}</td></tr>`).join('\n')}
    </tbody>
  </table>`;
}

function softwareAppJsonLd(page, path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${BASE_URL}${path}#software`,
    name: 'Mecha OS',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android, Windows, macOS',
    url: `${BASE_URL}${path}`,
    inLanguage: 'es',
    description: page.description,
    offers: {
      '@type': 'Offer',
      price: '39.00',
      priceCurrency: 'EUR',
      url: `${BASE_URL}/#precios`
    }
  };
}

function faqPageJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
}

function landingBody(page, path) {
  const parts = [];
  parts.push(`<nav class="seo-crumb" aria-label="Migas de pan"><a href="/">Inicio</a> &rsaquo; <a href="/especificaciones.html">Mecha</a> &rsaquo; ${esc(page.h1.split(':')[0].split(' — ')[0])}</nav>`);
  // H1: soporta marca de acento .em si la h1 contiene "sin comisiones"
  const h1Html = page.h1.replace(/sin comisiones/gi, '<span class="em">sin comisiones</span>')
    .replace(/con IA/gi, '<span class="em">con IA</span>');
  parts.push(`<h1 class="seo-h1">${escHtml(h1Html)}</h1>`);
  parts.push(`<p class="seo-lead">${esc(page.lead)}</p>`);

  if (page.bullets && page.bullets.length) {
    parts.push(`<h2 class="seo-h2">${page.tipo === 'comparativa' ? 'Por que Mecha es la alternativa que buscas' : 'Que incluye'}</h2>`);
    parts.push(`<div class="seo-feat">
${page.bullets.map(b => `      <div class="seo-item"><h3>${esc(b.titulo)}</h3><p>${esc(b.texto)}</p></div>`).join('\n')}
    </div>`);
  }

  if (page.comparativa && page.comparativa.length) {
    parts.push(`<h2 class="seo-h2">Mecha vs ${esc(page.competidor)}, cara a cara</h2>`);
    parts.push(comparisonTable(page.comparativa, page.competidor));
  }

  if (page.faqs && page.faqs.length) {
    parts.push(`<h2 class="seo-h2">Preguntas frecuentes</h2>`);
    parts.push(faqVisible(page.faqs));
  }

  parts.push(`<section class="seo-cta">
    <div><h2>Pruébalo 1 mes gratis</h2><p>Sin tarjeta, sin permanencia, sin comisiones por reserva. Migra desde ${page.tipo === 'comparativa' ? esc(page.competidor) : 'tu programa actual'} en 10 minutos.</p></div>
    <a href="/#contacto">Empezar ahora</a>
  </section>`);

  return `${STYLE}\n${parts.join('\n')}`;
}

// esc pero permitiendo las marcas <span class="em"> que ya inyectamos con escape previo.
function escHtml(html) {
  // Solo se permite <span class="em">...</span>; el resto del texto ya viene del spec (controlado).
  // Para seguridad, escapamos todo y luego rehabilitamos la marca concreta.
  return esc(html).replace(/&lt;span class=&quot;em&quot;&gt;/g, '<span class="em">').replace(/&lt;\/span&gt;/g, '</span>');
}

function landingPageHtml(page) {
  const path = `/${page.slug}`;
  const jsonLd = [];

  if (page.tipo === 'comparativa') {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${BASE_URL}${path}#webpage`,
      url: `${BASE_URL}${path}`,
      name: page.title,
      description: page.description,
      inLanguage: 'es',
      isPartOf: { '@type': 'WebSite', '@id': `${BASE_URL}/#website`, name: 'Mecha OS', url: `${BASE_URL}/` },
      about: softwareAppJsonLd(page, path)
    });
  } else {
    jsonLd.push(softwareAppJsonLd(page, path));
  }

  if (page.faqs && page.faqs.length) jsonLd.push(faqPageJsonLd(page.faqs));

  jsonLd.push(breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Mecha', path: '/especificaciones.html' },
    { name: page.title.split(' | ')[0], path }
  ]));

  return pageHtml({
    title: page.title,
    description: page.description,
    path,
    jsonLd,
    bodyHtml: landingBody(page, path)
  });
}

/**
 * Genera todas las landings. Devuelve [{ slug, path }].
 * Limpia los directorios de landings previos (los slugs conocidos del spec).
 */
export function generateLandingPages() {
  // Limpieza de landings previas por slug conocido.
  for (const page of LANDING_PAGES) {
    const dir = join(OUT_ROOT, page.slug);
    if (existsSync(dir)) {
      try { rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    }
  }

  const escritos = [];
  for (const page of LANDING_PAGES) {
    const dir = join(OUT_ROOT, page.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), landingPageHtml(page), 'utf8');
    escritos.push({ slug: page.slug, path: `/${page.slug}` });
  }
  console.log(`[generate-landing-pages] ${escritos.length} landings generadas.`);
  return escritos;
}
