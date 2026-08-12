// Prerender de fichas de salon: por cada salon publico del directorio genera
// web/salon/<slug>/index.html con <head> correcto (canonical por slug, title,
// meta description, OG/Twitter y JSON-LD LocalBusiness/HairSalon real).
//
// El <body> (esqueleto + scripts que hidratan) se conserva verbatim de
// salon.html: la hidratacion cliente aporta galeria/reserva fresca; el SEO
// (canonical, meta, JSON-LD) queda resuelto en HTML estatico, sin depender de
// JS ni de edge functions. Vercel sirve el estatico antes que el rewrite.

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL } from './data.mjs';

const SALON_TEMPLATE = join(root, 'web', 'salon.html');
const OUT_DIR = join(root, 'web', 'salon');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON-LD LocalBusiness/HairSalon para un salon (espejo de actualizarJsonLd). */
function salonJsonLd(s) {
  const slug = s.slug;
  const url = `${BASE_URL}/salon/${slug}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HairSalon'],
    '@id': `${url}#salon`,
    name: s.nombre || 'Salon',
    description: s.descripcion || `Reserva cita online en ${s.nombre || 'este salon'}.`,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.direccion || '',
      addressLocality: s.ciudad || '',
      addressRegion: s.provincia || '',
      addressCountry: 'ES'
    }
  };
  if (s.telefono) schema.telephone = s.telefono;
  if (s.foto) schema.image = s.foto;
  if (s.latitud && s.longitud) {
    schema.geo = { '@type': 'GeoCoordinates', latitude: s.latitud, longitude: s.longitud };
  }
  const ratingVal = Number(s.valoracion);
  const reviewCnt = Number(s.resenas);
  if (ratingVal > 0 && reviewCnt > 0) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: ratingVal, reviewCount: reviewCnt };
  }
  return schema;
}

function salonBreadcrumb(s) {
  const items = [
    { name: 'Inicio', path: '/' },
    { name: 'Directorio de Salones', path: '/salones' }
  ];
  if (s.ciudad) items.push({ name: s.ciudad, path: `/peluquerias-en-${slugifyCity(s.ciudad)}` });
  items.push({ name: s.nombre || 'Salon', path: `/salon/${s.slug}` });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: `${BASE_URL}${it.path}`
    }))
  };
}

// slugify local (evita import circular con data.mjs en algunos runtimes)
function slugifyCity(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, m => (m === 'Ñ' ? 'N' : 'n')).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Reconstruye el <head> con meta real; conserva el <style> inline y el <body>. */
function buildSalonPage(s, template, styleBlock, bodyPart) {
  const slug = s.slug;
  const canonical = `${BASE_URL}/salon/${slug}`;
  const ciudad = s.ciudad || '';
  const titulo = ciudad
    ? `${s.nombre} en ${ciudad} — Reserva cita online | Mecha`
    : `${s.nombre} — Reserva cita online | Mecha`;
  const descripcionRaw = s.descripcion
    ? s.descripcion.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim()
    : `${s.nombre} en ${ciudad || 'tu ciudad'}: servicios, precios y valoraciones. Reserva cita online sin llamar.`;
  // Trunca en limite de palabra (<=155) para no cortar a media palabra.
  const descripcion = descripcionRaw.length > 155
    ? descripcionRaw.slice(0, 152).replace(/\s+\S*$/, '').trim() + '…'
    : descripcionRaw;
  const ogImage = s.foto || `${BASE_URL}/og-image.png`;

  const ldBlocks = `<script type="application/ld+json" id="salon-jsonld">
${JSON.stringify(salonJsonLd(s), null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(salonBreadcrumb(s), null, 2)}
</script>`;

  const head = `<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="business.business" />
<meta property="og:site_name" content="Mecha" />
<meta property="og:locale" content="es_ES" />
<meta property="og:title" content="${esc(titulo)}" />
<meta property="og:description" content="${esc(descripcion)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(titulo)}" />
<meta name="twitter:description" content="${esc(descripcion)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<meta name="theme-color" content="#f6f1ea" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/directorio.css" />
${styleBlock}
${ldBlocks}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
${head}
</head>
${bodyPart}`;
}

/**
 * Genera todas las fichas. Devuelve la lista de slugs escritos.
 * @param {Array} salones resultado de fetchSalones()
 */
export function prerenderSalons(salones) {
  if (!existsSync(SALON_TEMPLATE)) {
    console.warn('[prerender-salons] No existe web/salon.html; saltando prerender.');
    return [];
  }
  const template = readFileSync(SALON_TEMPLATE, 'utf8');

  // Conserva el <style> inline (estilos .f-*) y todo desde <body ...> hacia abajo.
  const styleMatch = template.match(/<style>[\s\S]*?<\/style>/);
  const styleBlock = styleMatch ? styleMatch[0] : '';
  const bodyMatch = template.match(/<body[\s\S]*$/);
  const bodyPart = bodyMatch ? bodyMatch[0] : '<body class="directorio">\n</body>';

  // Limpia el dir de salida (solo generado) para que no queden slugs borrados.
  if (existsSync(OUT_DIR)) {
    try { rmSync(OUT_DIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const escritos = [];
  for (const s of salones) {
    const dir = join(OUT_DIR, s.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildSalonPage(s, template, styleBlock, bodyPart), 'utf8');
    escritos.push(s.slug);
  }
  console.log(`[prerender-salons] ${escritos.length} fichas prerender en web/salon/*/index.html`);
  return escritos;
}
