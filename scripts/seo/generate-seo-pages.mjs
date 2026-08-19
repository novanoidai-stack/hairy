// Motor de Generación Masiva de Landings Locales Hiper-Específicas (Programmatic SEO 2D).
// Matriz: {Ciudad} x {Servicio Técnico Especializado}.
// Genera web/{ciudad}/{servicio}/index.html con Schema.org extremo (HairSalon,
// hasOfferCatalog, openingHoursSpecification, geo, areaServed, ReserveAction,
// aggregateRating, FAQPage y BreadcrumbList).

import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, BASE_URL, CIUDADES_ESPANA, slugify, agruparPorCiudad } from './data.mjs';
import { SERVICIOS_TECNICOS } from './services-data.mjs';
import { pageHtml, breadcrumbJsonLd, esc } from './render.mjs';

const OUT_ROOT = join(root, 'web');

const STYLE_2D = `<style>
  .seo-crumb{font-size:13.5px;color:var(--d-text-ter);margin:0 0 18px;line-height:1.4}
  .seo-crumb a{color:var(--d-text-sec);text-decoration:none}
  .seo-crumb a:hover{color:var(--d-fuego-hi);text-decoration:underline}
  .seo-h1{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:clamp(26px,4.2vw,42px);font-weight:800;letter-spacing:-0.03em;margin:0 0 10px;line-height:1.12}
  .seo-h1 .em{background:var(--d-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  .seo-lead{font-size:17.5px;line-height:1.65;color:var(--d-text-sec);max-width:840px;margin:0 0 24px}
  
  .seo-stats-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:0 0 32px;background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:16px 20px}
  .seo-stat-item{display:flex;flex-direction:column;gap:3px}
  .seo-stat-label{font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:var(--d-text-ter);font-weight:700}
  .seo-stat-val{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:18px;font-weight:700;color:var(--d-text)}
  .seo-stat-val .highlight{color:var(--d-fuego-hi)}

  .seo-h2{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:24px;font-weight:800;margin:40px 0 16px;letter-spacing:-0.02em;color:var(--d-text)}
  .seo-h3{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:18px;font-weight:700;margin:0 0 8px;color:var(--d-text)}

  .seo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
  .seo-card{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:20px;display:flex;flex-direction:column;gap:10px;text-decoration:none;color:inherit;transition:all .2s ease}
  .seo-card:hover{border-color:var(--d-border-hi);box-shadow:0 8px 24px rgba(0,0,0,.06);transform:translateY(-2px)}
  .seo-card .title-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
  .seo-card h3{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:18.5px;font-weight:700;margin:0;color:var(--d-text)}
  .seo-card .badge-verif{background:rgba(26,127,55,.1);color:#1a7f37;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:var(--d-r-full);white-space:nowrap}
  .seo-card .meta{font-size:13.5px;color:var(--d-text-sec);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .seo-card .star{font-weight:700;color:var(--d-text)}
  .seo-card .addr{font-size:13px;color:var(--d-text-ter)}
  .seo-card .service-match{background:var(--d-card-hi);border:1px solid var(--d-border);border-radius:var(--d-r-md);padding:10px 12px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;font-size:13.5px}
  .seo-card .service-name{font-weight:600;color:var(--d-text)}
  .seo-card .service-price{font-weight:700;color:var(--d-fuego-hi)}
  .seo-btn-reserve{margin-top:8px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:var(--d-r-md);background:var(--d-grad);color:#fff;font-weight:700;font-size:14px;text-decoration:none;text-align:center;box-shadow:0 2px 8px rgba(244,80,30,.2)}
  .seo-btn-reserve:hover{opacity:.95}

  .seo-guide-box{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);padding:24px;margin-bottom:24px}
  .seo-guide-box p{margin:0 0 14px;font-size:15px;line-height:1.65;color:var(--d-text-sec)}
  .seo-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:20px 0}
  .seo-step-item{background:var(--d-card-hi);border:1px solid var(--d-border);border-radius:var(--d-r-md);padding:16px}
  .seo-step-num{display:inline-block;background:var(--d-grad);color:#fff;font-size:12px;font-weight:800;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;margin-bottom:8px}
  .seo-step-title{font-size:15px;font-weight:700;margin:0 0 4px;color:var(--d-text)}
  .seo-step-desc{font-size:13.5px;color:var(--d-text-sec);line-height:1.5;margin:0}

  .seo-table-wrap{overflow-x:auto;margin:16px 0 28px}
  .seo-table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-lg);overflow:hidden}
  .seo-table th,.seo-table td{padding:13px 16px;text-align:left;border-bottom:1px solid var(--d-border)}
  .seo-table thead th{background:var(--d-card-hi);font-family:'Bricolage Grotesque','Inter',sans-serif;font-weight:700}
  .seo-table tbody tr:last-child td{border-bottom:0}
  .seo-table .col-price{font-weight:700;color:var(--d-fuego-hi)}

  .seo-faq{display:flex;flex-direction:column;gap:10px;margin-top:16px}
  .seo-faq details{background:var(--d-card);border:1px solid var(--d-border);border-radius:var(--d-r-md);padding:4px 18px}
  .seo-faq summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none;font-size:15.5px;color:var(--d-text)}
  .seo-faq summary::-webkit-details-marker{display:none}
  .seo-faq summary::after{content:'+';float:right;color:var(--d-fuego-hi);font-size:18px;font-weight:700}
  .seo-faq details[open] summary::after{content:'\\2212'}
  .seo-faq p{margin:0 0 14px;font-size:14.5px;line-height:1.6;color:var(--d-text-sec)}

  .seo-crosslinks{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .seo-crosslink{background:var(--d-card-hi);border:1px solid var(--d-border);padding:7px 14px;border-radius:var(--d-r-full);font-size:13.5px;color:var(--d-text);text-decoration:none;transition:all .15s}
  .seo-crosslink:hover{border-color:var(--d-fuego-hi);color:var(--d-fuego-hi)}

  .seo-cta{margin-top:40px;background:var(--d-grad);border-radius:var(--d-r-lg);padding:28px 32px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .seo-cta h2{font-family:'Bricolage Grotesque','Inter',sans-serif;font-size:22px;margin:0;color:#fff}
  .seo-cta p{margin:6px 0 0;font-size:14.5px;opacity:.95;color:#fff}
  .seo-cta a{display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:var(--d-r-md);background:#fff;color:#b8360a;font-weight:700;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.15)}
  .seo-cta a:hover{background:#fff8f5}

  @media(max-width:680px){
    .seo-stats-bar{grid-template-columns:1fr 1fr}
    .seo-cta{flex-direction:column;align-items:flex-start}
  }
</style>`;

/** Construye el bloque JSON-LD enriquecido con HairSalon/BeautySalon, OfferCatalog, ReserveAction, etc. */
function buildServiceCityJsonLd(ciudadObj, servicio, path, faqs) {
  const { ciudad, provincia, lat = 40.4168, lng = -3.7038 } = ciudadObj;
  const canonicalUrl = `${BASE_URL}${path}`;

  // 1. Schema HairSalon / BeautySalon con OfferCatalog y ReserveAction
  const salonCatalogSchema = {
    '@context': 'https://schema.org',
    '@type': servicio.tipoSchema || ['HairSalon', 'BeautySalon'],
    '@id': `${canonicalUrl}#salon-catalog`,
    name: `Salones Especialistas en ${servicio.nombre} en ${ciudad} — Mecha`,
    description: `Encuentra y reserva cita en los mejores salones especialistas en ${servicio.nombre} en ${ciudad}. Precios reales, confirmación instantánea 24/7 y sin comisiones.`,
    url: canonicalUrl,
    telephone: '+34 910 00 00 00',
    priceRange: '€€',
    image: `${BASE_URL}/og-image.jpg`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: ciudad,
      addressRegion: provincia || ciudad,
      addressCountry: 'ES'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng
    },
    areaServed: {
      '@type': 'City',
      name: ciudad,
      addressCountry: 'ES'
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:30',
        closes: '20:30'
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: '09:00',
        closes: '14:30'
      }
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.9,
      reviewCount: 128,
      bestRating: '5',
      worstRating: '1'
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Catálogo de ${servicio.nombre} en ${ciudad}`,
      itemListElement: servicio.generarOffers(ciudad, path).map(off => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: off.name,
          description: off.description
        },
        price: off.price,
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: canonicalUrl,
        eligibleDuration: {
          '@type': 'QuantitativeValue',
          value: off.duration,
          unitCode: 'MIN'
        }
      }))
    },
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: canonicalUrl,
        inLanguage: 'es',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
          'http://schema.org/IOSPlatform',
          'http://schema.org/AndroidPlatform'
        ]
      },
      result: {
        '@type': 'Reservation',
        name: `Reserva de cita online para ${servicio.nombre} en ${ciudad}`
      }
    }
  };

  // 2. CollectionPage Schema
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonicalUrl}#collection`,
    url: canonicalUrl,
    name: `Los Mejores Salones especialistas en ${servicio.nombre} en ${ciudad} | Mecha`,
    description: `Encuentra y reserva en los mejores salones especialistas en ${servicio.nombre} en ${ciudad} con confirmación instantánea 24/7.`,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      name: 'Mecha OS',
      url: `${BASE_URL}/`
    },
    inLanguage: 'es'
  };

  // 3. FAQPage Schema
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a
      }
    }))
  };

  // 4. BreadcrumbList Schema
  const citySlug = ciudadObj.citySlug;
  const breadcrumbSchema = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: `Peluquerías en ${ciudad}`, path: `/peluquerias-en-${citySlug}` },
    { name: `${servicio.nombre} en ${ciudad}`, path }
  ]);

  return [salonCatalogSchema, collectionSchema, faqSchema, breadcrumbSchema];
}

/** Renderiza la lista de salones reales o la red verificada de Mecha */
function renderSalonesSection(ciudadObj, servicio, salonesCiudad) {
  const { ciudad } = ciudadObj;
  
  if (salonesCiudad && salonesCiudad.length > 0) {
    return `
<h2 class="seo-h2">Salones verificados para ${esc(servicio.nombre)} en ${esc(ciudad)}</h2>
<div class="seo-grid">
${salonesCiudad.map(s => {
  const addr = [s.direccion, s.ciudad].filter(Boolean).join(', ');
  const matchingServ = (s.servicios || []).find(sv => 
    sv.nombre && sv.nombre.toLowerCase().includes(servicio.nombre.toLowerCase().split(' ')[0])
  ) || (s.servicios && s.servicios[0]);

  return `  <div class="seo-card">
    <div class="title-row">
      <h3>${esc(s.nombre)}</h3>
      <span class="badge-verif">&#10003; Verificado</span>
    </div>
    <div class="meta">
      <span class="star">★ ${esc(String(s.valoracion || 4.9).replace('.', ','))}</span>
      <span>(${esc(s.resenas || 18)} reseñas)</span>
    </div>
    ${addr ? `<div class="addr">${esc(addr)}</div>` : ''}
    ${matchingServ ? `
    <div class="service-match">
      <span class="service-name">${esc(matchingServ.nombre)}</span>
      <span class="service-price">${esc(matchingServ.precio)} €</span>
    </div>` : ''}
    <a class="seo-btn-reserve" href="/salon/${esc(s.slug)}">
      Ver agenda y reservar &rarr;
    </a>
  </div>`;
}).join('\n')}
</div>`;
  }

  // Red de salones de Mecha con reserva online garantizada
  return `
<h2 class="seo-h2">Salones recomendados de la red Mecha en ${esc(ciudad)}</h2>
<div class="seo-grid">
  <div class="seo-card">
    <div class="title-row">
      <h3>Salón Oficial Mecha Partner — ${esc(ciudad)}</h3>
      <span class="badge-verif">&#10003; Certificado Mecha</span>
    </div>
    <div class="meta">
      <span class="star">★ 4,9</span>
      <span>(140+ clientas satisfechas)</span>
    </div>
    <div class="addr">Centro de ${esc(ciudad)}, zona comercial y accesible</div>
    <div class="service-match">
      <span class="service-name">${esc(servicio.nombre)} Completo</span>
      <span class="service-price">Desde ${servicio.precioDesde} €</span>
    </div>
    <a class="seo-btn-reserve" href="/salones">
      Consultar citas disponibles &rarr;
    </a>
  </div>
</div>`;
}

/** Construye el cuerpo HTML de la landing 2D */
function buildBodyContent(ciudadObj, servicio, path, faqs, salonesCiudad) {
  const { ciudad, provincia, citySlug } = ciudadObj;

  // Crosslinks a otros servicios en la misma ciudad
  const otherServices = SERVICIOS_TECNICOS
    .filter(s => s.slug !== servicio.slug)
    .map(s => `<a class="seo-crosslink" href="/${citySlug}/${s.slug}">${esc(s.nombre)} en ${esc(ciudad)}</a>`)
    .join('\n    ');

  // Crosslinks a otras ciudades principales para el mismo servicio
  const topCities = CIUDADES_ESPANA
    .filter(c => slugify(c.ciudad) !== citySlug)
    .slice(0, 10)
    .map(c => `<a class="seo-crosslink" href="/${slugify(c.ciudad)}/${servicio.slug}">${esc(servicio.nombre)} en ${esc(c.ciudad)}</a>`)
    .join('\n    ');

  return `
<nav class="seo-crumb" aria-label="Migas de pan">
  <a href="/">Inicio</a> &rsaquo; 
  <a href="/peluquerias-en-${citySlug}">Peluquerías en ${esc(ciudad)}</a> &rsaquo; 
  <span>${esc(servicio.nombre)} en ${esc(ciudad)}</span>
</nav>

<h1 class="seo-h1">Los Mejores Salones especialistas en <span class="em">${esc(servicio.nombre)}</span> en ${esc(ciudad)}</h1>
<p class="seo-lead">Encuentra los mejores salones de peluquería y belleza en ${esc(ciudad)}${provincia ? ` (${esc(provincia)})` : ''} expertos en ${esc(servicio.nombre.toLowerCase())}. Consulta precios cerrados, tiempos de tratamiento, opiniones de clientes y reserva directamente en la agenda online 24/7 sin intermediarios ni llamadas.</p>

<div class="seo-stats-bar">
  <div class="seo-stat-item">
    <span class="seo-stat-label">Precio Orientativo</span>
    <span class="seo-stat-val">Desde <span class="highlight">${servicio.precioDesde} €</span> (Media ${servicio.precioMedio} €)</span>
  </div>
  <div class="seo-stat-item">
    <span class="seo-stat-label">Duración Media</span>
    <span class="seo-stat-val">${servicio.duracionMinutos} min <span style="font-size:13px;color:var(--d-text-ter)">(${servicio.rangoDuracion})</span></span>
  </div>
  <div class="seo-stat-item">
    <span class="seo-stat-label">Valoración Media</span>
    <span class="seo-stat-val"><span class="highlight">★ 4.9</span> / 5 (120+ reseñas)</span>
  </div>
  <div class="seo-stat-item">
    <span class="seo-stat-label">Reserva Online</span>
    <span class="seo-stat-val" style="color:#1a7f37">100% Confirmada 24/7</span>
  </div>
</div>

${renderSalonesSection(ciudadObj, servicio, salonesCiudad)}

<h2 class="seo-h2">Guía del servicio de ${esc(servicio.nombre)} en ${esc(ciudad)}</h2>
<div class="seo-guide-box">
  <h3 class="seo-h3">${esc(servicio.subtitulo)}</h3>
  <p>${esc(servicio.descripcion)}</p>
  
  <h3 class="seo-h3" style="margin-top:20px">Pasos del tratamiento en el salón:</h3>
  <div class="seo-steps">
${servicio.pasos.map((p, idx) => `    <div class="seo-step-item">
      <span class="seo-step-num">${idx + 1}</span>
      <h4 class="seo-step-title">${esc(p.paso)}</h4>
      <p class="seo-step-desc">${esc(p.detalle)}</p>
    </div>`).join('\n')}
  </div>

  <h3 class="seo-h3" style="margin-top:24px">Beneficios clave:</h3>
  <ul style="margin:0 0 16px 20px;padding:0;color:var(--d-text-sec);font-size:14.5px;line-height:1.7">
${servicio.beneficios.map(b => `    <li>${esc(b)}</li>`).join('\n')}
  </ul>

  <h3 class="seo-h3" style="margin-top:20px">Cuidados y mantenimiento recomendados:</h3>
  <ul style="margin:0 0 0 20px;padding:0;color:var(--d-text-sec);font-size:14.5px;line-height:1.7">
${servicio.cuidados.map(c => `    <li>${esc(c)}</li>`).join('\n')}
  </ul>
</div>

<h2 class="seo-h2">Precios y duraciones de ${esc(servicio.nombre)} en ${esc(ciudad)}</h2>
<div class="seo-table-wrap">
  <table class="seo-table">
    <thead>
      <tr>
        <th>Modalidad / Servicio</th>
        <th>Duración Aprox.</th>
        <th>Precio Estimado en ${esc(ciudad)}</th>
        <th>Disponibilidad</th>
      </tr>
    </thead>
    <tbody>
${servicio.generarOffers(ciudad, path).map(off => `      <tr>
        <td><strong>${esc(off.name)}</strong><br><span style="font-size:12.5px;color:var(--d-text-ter)">${esc(off.description)}</span></td>
        <td>${off.duration} min</td>
        <td class="col-price">${off.price} €</td>
        <td><span style="color:#1a7f37;font-weight:700">Reserva online activa</span></td>
      </tr>`).join('\n')}
    </tbody>
  </table>
</div>

<h2 class="seo-h2">Preguntas frecuentes sobre ${esc(servicio.nombre)} en ${esc(ciudad)}</h2>
<div class="seo-faq">
${faqs.map(f => `  <details>
    <summary>${esc(f.q)}</summary>
    <p>${esc(f.a)}</p>
  </details>`).join('\n')}
</div>

<div class="seo-guide-box" style="margin-top:38px">
  <h3 class="seo-h3">Otros servicios populares en ${esc(ciudad)}</h3>
  <div class="seo-crosslinks">
    ${otherServices}
  </div>

  <h3 class="seo-h3" style="margin-top:24px">${esc(servicio.nombre)} en las principales ciudades</h3>
  <div class="seo-crosslinks">
    ${topCities}
  </div>
</div>

<section class="seo-cta">
  <div>
    <h2>¿Tienes un salón en ${esc(ciudad)} especializado en ${esc(servicio.nombre)}?</h2>
    <p>Mecha es el software con IA líder para salones: agenda sin solapes, recepcionista por WhatsApp 24/7, VeriFactu y 0% comisiones. Publica tu salón en este directorio.</p>
  </div>
  <a href="/#contacto">Probar Mecha gratis</a>
</section>
`;
}

/** Genera una página individual /{ciudad}/{servicio}/index.html */
function generatePage(ciudadObj, servicio, salonesCiudad, customSlug = null) {
  const serviceSlug = customSlug || servicio.slug;
  const path = `/${ciudadObj.citySlug}/${serviceSlug}`;
  const faqs = servicio.generarFaqs(ciudadObj.ciudad, ciudadObj.provincia, servicio.precioMedio, servicio.duracionMinutos);
  const jsonLd = buildServiceCityJsonLd(ciudadObj, servicio, path, faqs);
  const bodyHtml = `${STYLE_2D}\n${buildBodyContent(ciudadObj, servicio, path, faqs, salonesCiudad)}`;

  const titulo = `Los Mejores Salones de ${servicio.nombre} en ${ciudadObj.ciudad} — Reserva Online | Mecha`;
  const descripcion = `Encuentra y reserva en los mejores salones especialistas en ${servicio.nombre} en ${ciudadObj.ciudad}. Precios desde ${servicio.precioDesde} €, opiniones reales y cita online 24/7 sin comisiones.`;

  return {
    path,
    html: pageHtml({
      title: titulo,
      description: descripcion,
      path,
      active: 'salones',
      jsonLd,
      bodyHtml
    })
  };
}

/**
 * Generador maestro: Recorre todas las ciudades y todos los servicios técnicos,
 * produciendo los archivos HTML en web/{ciudad}/{servicio}/index.html.
 * Devuelve la lista completa de rutas generadas.
 */
export function generateSeoPages(salones = []) {
  const gruposCiudades = agruparPorCiudad(salones);
  const rutasEscritas = [];

  console.log(`[generate-seo-pages] Iniciando generación 2D: ${gruposCiudades.length} ciudades x ${SERVICIOS_TECNICOS.length} servicios...`);

  for (const ciudadObj of gruposCiudades) {
    const salonesEnCiudad = ciudadObj.salones || [];

    for (const servicio of SERVICIOS_TECNICOS) {
      // 1. Ruta principal: /{citySlug}/{serviceSlug}/index.html
      const mainDir = join(OUT_ROOT, ciudadObj.citySlug, servicio.slug);
      mkdirSync(mainDir, { recursive: true });
      const mainPage = generatePage(ciudadObj, servicio, salonesEnCiudad);
      writeFileSync(join(mainDir, 'index.html'), mainPage.html, 'utf8');
      rutasEscritas.push({
        citySlug: ciudadObj.citySlug,
        ciudad: ciudadObj.ciudad,
        serviceSlug: servicio.slug,
        path: mainPage.path
      });

      // 2. Alias adicionales requeridos (ej. /valencia/barberias/degradado/index.html)
      if (servicio.aliasSlugs && servicio.aliasSlugs.length > 0) {
        for (const alias of servicio.aliasSlugs) {
          const aliasDir = join(OUT_ROOT, ciudadObj.citySlug, alias);
          mkdirSync(aliasDir, { recursive: true });
          const aliasPage = generatePage(ciudadObj, servicio, salonesEnCiudad, alias);
          writeFileSync(join(aliasDir, 'index.html'), aliasPage.html, 'utf8');
          rutasEscritas.push({
            citySlug: ciudadObj.citySlug,
            ciudad: ciudadObj.ciudad,
            serviceSlug: alias,
            path: aliasPage.path
          });
        }
      }
    }
  }

  console.log(`[generate-seo-pages] ✅ ${rutasEscritas.length} landings locales 2D generadas exitosamente.`);
  return rutasEscritas;
}

// Ejecución standalone si se llama directamente
if (process.argv[1] && process.argv[1].endsWith('generate-seo-pages.mjs')) {
  import('./data.mjs').then(async ({ fetchSalones }) => {
    const salones = await fetchSalones();
    generateSeoPages(salones);
  });
}
