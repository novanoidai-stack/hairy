// Plantilla y helpers de render para paginas SEO/AIO generadas (ciudad, nicho,
// modulo, comparativa). Reusa /assets/directorio.css para salir on-brand con el
// directorio sin duplicar CSS, y replica la cabecera/pie del marketplace.

import { BASE_URL } from './data.mjs';

/** Escape HTML para插 valores dinamicos en plantillas. */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LOGO_SVG = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
        <defs><linearGradient id="mGradSeo" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#e0340e" /><stop offset=".5" stop-color="#ff7a2e" /><stop offset="1" stop-color="#ffcf4a" />
        </linearGradient></defs>
        <path d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z" fill="url(#mGradSeo)" />
        <path d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z" fill="#fffdfb" opacity=".92" />
      </svg>`;

/** Cabecera compartida del directorio. `active` marca el enlace activo. */
export function headerHtml(active = '') {
  const link = (href, label, key, pro = false) =>
    `<a class="d-top-link${pro ? ' d-top-pro' : ''}${active === key ? ' is-active' : ''}" href="${href}">${esc(label)}</a>`;
  return `<header class="d-top">
  <div class="d-wrap d-top-in">
    <a class="d-logo" href="/" aria-label="Mecha, inicio">
      ${LOGO_SVG}
      <span class="nm">Mecha<span class="dot" style="color:#f4501e">.</span></span>
    </a>
    <span class="d-top-sp"></span>
    <a class="d-top-link" href="/salones">Buscar salones</a>
    <a class="d-top-link" href="/especificaciones.html">Que es Mecha</a>
    ${link('/#precios', 'Precios', 'precios')}
    <a class="d-top-link d-top-pro" href="/#contacto">Probar Mecha</a>
  </div>
</header>`;
}

/** Pie compartido del directorio. */
export function footerHtml() {
  return `<footer class="d-foot">
  <div class="d-wrap">
    <div class="d-foot-cols">
      <div>
        <div class="marca">
          ${LOGO_SVG.replace('mGradSeo', 'mGradFoot')}
          <span class="nm">Mecha<span class="dot" style="color:#f4501e">.</span></span>
        </div>
        <p class="desc">Software de gestion para peluquerias y barberias con IA. El directorio lo forman los salones que lo usan.</p>
      </div>
      <div>
        <h4>Directorio</h4>
        <a href="/salones">Buscar salones</a>
        <a href="/salones#sec-ciudades">Por ciudad</a>
      </div>
      <div>
        <h4>Mecha</h4>
        <a href="/">Que es Mecha</a>
        <a href="/especificaciones.html">Especificaciones</a>
        <a href="/calculadora-comisiones">Calculadora de comisiones</a>
        <a href="/#precios">Precios</a>
      </div>
      <div>
        <h4>Legal</h4>
        <a href="/privacidad.html">Privacidad</a>
        <a href="/terminos.html">Terminos</a>
        <a href="/cookies.html">Cookies</a>
      </div>
    </div>
    <div class="d-foot-bajo">
      <span>&copy; ${new Date().getFullYear()} Mecha</span>
      <span>Hecho para salones, no para intermediarios.</span>
    </div>
  </div>
</footer>`;
}

/** BreadcrumbList JSON-LD. items = [{ name, path }, ...]. */
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${BASE_URL}${it.path}`
    }))
  };
}

/**
 * Monta un documento HTML completo on-brand para una pagina generada.
 * @param {object} o
 * @param {string} o.title       <title>
 * @param {string} o.description meta description
 * @param {string} o.path        path canonico (empieza con /)
 * @param {string} [o.robots]    default 'index, follow'
 * @param {object[]} [o.jsonLd]  bloques JSON-LD ya construidos
 * @param {string} o.bodyHtml    HTML del <main>
 * @param {string} [o.ogImage]   imagen OG (por defecto /og-image.png)
 */
export function pageHtml(o) {
  const canonical = `${BASE_URL}${o.path}`;
  const robots = o.robots || 'index, follow, max-image-preview:large';
  const ogImage = o.ogImage || `${BASE_URL}/og-image.png`;
  const jsonLd = Array.isArray(o.jsonLd) ? o.jsonLd : [];
  const ldBlocks = jsonLd
    .map(b => `<script type="application/ld+json">\n${JSON.stringify(b, null, 2)}\n</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}" />
<meta name="robots" content="${robots}" />
<link rel="canonical" href="${canonical}" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Mecha" />
<meta property="og:locale" content="es_ES" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${ogImage}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(o.title)}" />
<meta name="twitter:description" content="${esc(o.description)}" />
<meta name="twitter:image" content="${ogImage}" />

<meta name="theme-color" content="#f6f1ea" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<!-- Fuentes sin bloquear el render: se pide en paralelo y se aplica al llegar. -->
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700;800&display=swap" />
<link rel="stylesheet" media="print" onload="this.media='all';this.onload=null" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700;800&display=swap" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700;800&display=swap" /></noscript>
<link rel="stylesheet" href="/assets/directorio.css" />
${ldBlocks}
</head>
<body class="directorio">
${headerHtml(o.active)}
<main class="d-wrap d-sec" style="padding-top:28px">
${o.bodyHtml}
</main>
${footerHtml()}
</body>
</html>
`;
}
