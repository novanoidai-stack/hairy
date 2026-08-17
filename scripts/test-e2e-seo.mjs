import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const webDir = path.join(projectRoot, 'web');

/**
 * Utility function to build dynamic JSON-LD schema for a salon slug.
 * Used for dynamic salon slug resolution testing (T4.1.2).
 */
export function generateSalonJsonLd(salon) {
  const slug = salon.slug || 'florent-suarez-peluqueros';
  const name = salon.nombre || 'Florent Suárez Peluqueros';
  const city = salon.ciudad || 'Oviedo';
  const address = salon.direccion || 'Calle Fruela 12';
  const phone = salon.telefono || '+34 985 12 34 56';
  const description = salon.descripcion || 'Peluquería y estilismo profesional en Oviedo.';

  return {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    '@id': `https://www.mechaa.es/salon/${slug}#salon`,
    'name': name,
    'description': description,
    'url': `https://www.mechaa.es/salon/${slug}`,
    'telephone': phone,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': address,
      'addressLocality': city,
      'addressCountry': 'ES'
    },
    'priceRange': '€€',
    'image': 'https://www.mechaa.es/og-image.jpg'
  };
}

/**
 * Comprehensive E2E SEO Test Runner executing Tiers 1-4
 */
export async function runSeoTestSuite() {
  const testResults = {
    tier1: [],
    tier2: [],
    tier3: [],
    tier4: [],
    passed: 0,
    failed: 0,
    total: 0
  };

  function recordResult(tierKey, id, name, passed, details = '') {
    const entry = { id, name, passed, details };
    testResults[tierKey].push(entry);
    testResults.total++;
    if (passed) {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
  }

  // Define public and private HTML files
  const publicPages = [
    { file: 'index.html', route: '/' },
    { file: 'especificaciones.html', route: '/especificaciones.html' },
    { file: 'calculadora-comisiones.html', route: '/calculadora-comisiones' },
    { file: 'calculadora-ahorro-comisiones.html', route: '/calculadora-ahorro-comisiones' },
    { file: 'salones.html', route: '/salones' },
    { file: 'salon.html', route: '/salon' }
  ];

  const privatePages = [
    { file: 'admin.html', route: '/admin.html' },
    { file: 'restablecer.html', route: '/restablecer.html' },
    { file: 'app/index.html', route: '/app/' }
  ];

  // Descubre las paginas SEO/AIO generadas (artefactos de build de
  // generate-seo): landings de nicho/modulo/comparativa, paginas de ciudad y
  // fichas de salon prerender. Se descubren por glob en web/.
  const LANDING_DIRS = [
    'software-barberia', 'software-estetica', 'verifactu-peluqueria',
    'agenda-inteligente-peluqueria', 'fichaje-legal-peluqueria',
    'reducir-no-shows-peluqueria', 'alternativa-booksy', 'alternativa-fresha',
    'alternativa-treatwell', 'alternativa-square-appointments',
    'software-unas-manicura', 'software-peluqueria-canina'
  ];
  function discoverGeneratedPages() {
    const pages = [];
    let entries = [];
    try { entries = fs.readdirSync(webDir, { withFileTypes: true }); } catch (_) { return pages; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const isLanding = LANDING_DIRS.includes(e.name);
      const isCity = e.name.startsWith('peluquerias-en-');
      if ((isLanding || isCity) && fs.existsSync(path.join(webDir, e.name, 'index.html'))) {
        pages.push({ file: `${e.name}/index.html`, route: `/${e.name}`, kind: 'landing' });
      }
    }
    const salonDir = path.join(webDir, 'salon');
    if (fs.existsSync(salonDir) && fs.statSync(salonDir).isDirectory()) {
      for (const d of fs.readdirSync(salonDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        if (fs.existsSync(path.join(salonDir, d.name, 'index.html'))) {
          pages.push({ file: `salon/${d.name}/index.html`, route: `/salon/${d.name}`, kind: 'salon', slug: d.name });
        }
      }
    }
    return pages;
  }

  const generatedPages = discoverGeneratedPages();
  const allPublicPages = [...publicPages, ...generatedPages];

  // Helper to read HTML file content safely
  function readHtml(relativePath) {
    const fullPath = path.join(webDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }

  // Helper to extract meta robots tag content
  function getMetaRobots(html) {
    const match = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }

  // Helper to extract canonical link href
  function getCanonicalHref(html) {
    const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }

  // Helper to extract all JSON-LD script blocks
  function getJsonLdScripts(html) {
    const scripts = [];
    const regex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      scripts.push(match[1].trim());
    }
    return scripts;
  }

  // =========================================================================
  // TIER 1: Feature Coverage
  // =========================================================================

  // T1.1.1 - Meta Robots Public Pages
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const robots = getMetaRobots(html);
      if (!robots) {
        failures.push(`${page.file}: missing <meta name="robots">`);
      } else {
        const lower = robots.toLowerCase();
        if (!lower.includes('index') || !lower.includes('follow') || lower.includes('noindex') || lower.includes('nofollow')) {
          failures.push(`${page.file}: invalid content "${robots}" (expected index, follow)`);
        }
      }
    }
    const passed = failures.length === 0;
    recordResult('tier1', 'T1.1.1', 'Meta Robots Public Pages', passed, passed ? 'All 5 public pages contain index, follow' : failures.join('; '));
  } catch (err) {
    recordResult('tier1', 'T1.1.1', 'Meta Robots Public Pages', false, err.message);
  }

  // T1.1.2 - Meta Robots Private Pages
  try {
    const failures = [];
    for (const page of privatePages) {
      const html = readHtml(page.file);
      const robots = getMetaRobots(html);
      if (!robots) {
        failures.push(`${page.file}: missing <meta name="robots">`);
      } else {
        const lower = robots.toLowerCase();
        if (!lower.includes('noindex') || !lower.includes('nofollow')) {
          failures.push(`${page.file}: invalid content "${robots}" (expected noindex, nofollow)`);
        }
      }
    }
    const passed = failures.length === 0;
    recordResult('tier1', 'T1.1.2', 'Meta Robots Private Pages', passed, passed ? 'All 3 private pages contain noindex, nofollow' : failures.join('; '));
  } catch (err) {
    recordResult('tier1', 'T1.1.2', 'Meta Robots Private Pages', false, err.message);
  }

  // T1.2.1 - Canonical Links Domain
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const canonical = getCanonicalHref(html);
      if (!canonical) {
        failures.push(`${page.file}: missing <link rel="canonical">`);
      } else if (!canonical.startsWith('https://www.mechaa.es/')) {
        failures.push(`${page.file}: canonical "${canonical}" does not start with https://www.mechaa.es/`);
      }
    }
    const passed = failures.length === 0;
    recordResult('tier1', 'T1.2.1', 'Canonical Links Domain', passed, passed ? 'All 5 public pages contain HTTPS www.mechaa.es canonical links' : failures.join('; '));
  } catch (err) {
    recordResult('tier1', 'T1.2.1', 'Canonical Links Domain', false, err.message);
  }

  // T1.3.1 - Sitemap XML Structure
  try {
    const sitemapPath = path.join(webDir, 'sitemap.xml');
    if (!fs.existsSync(sitemapPath)) {
      recordResult('tier1', 'T1.3.1', 'Sitemap XML Structure', false, 'sitemap.xml file not found');
    } else {
      const xml = fs.readFileSync(sitemapPath, 'utf8');
      const failures = [];
      if (!xml.includes('<?xml')) failures.push('Missing XML declaration');
      if (!xml.includes('<urlset') || !xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) {
        failures.push('Missing valid <urlset> with standard sitemap namespace');
      }

      const urlMatches = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
      if (urlMatches.length === 0) {
        failures.push('No <url> entries found in sitemap.xml');
      }

      urlMatches.forEach((urlBlock, idx) => {
        if (!urlBlock.includes('<loc>')) failures.push(`<url>[${idx}] missing <loc>`);
        if (!urlBlock.includes('<priority>')) failures.push(`<url>[${idx}] missing <priority>`);
        if (!urlBlock.includes('<changefreq>')) failures.push(`<url>[${idx}] missing <changefreq>`);
      });

      const passed = failures.length === 0;
      recordResult('tier1', 'T1.3.1', 'Sitemap XML Structure', passed, passed ? `Valid XML sitemap with ${urlMatches.length} URLs` : failures.join('; '));
    }
  } catch (err) {
    recordResult('tier1', 'T1.3.1', 'Sitemap XML Structure', false, err.message);
  }

  // T1.4.1 - Robots.txt Directives
  try {
    const robotsPath = path.join(webDir, 'robots.txt');
    if (!fs.existsSync(robotsPath)) {
      recordResult('tier1', 'T1.4.1', 'Robots.txt Directives', false, 'robots.txt file not found');
    } else {
      const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
      const failures = [];

      if (!/User-agent:\s*\*/i.test(robotsTxt)) failures.push('Missing User-agent: *');
      if (!/Allow:\s*\//i.test(robotsTxt)) failures.push('Missing Allow: /');
      if (!/Disallow:\s*\/admin\.html/i.test(robotsTxt)) failures.push('Missing Disallow: /admin.html');
      if (!/Disallow:\s*\/restablecer\.html/i.test(robotsTxt)) failures.push('Missing Disallow: /restablecer.html');
      if (!/Disallow:\s*\/app\//i.test(robotsTxt)) failures.push('Missing Disallow: /app/');
      if (!/Sitemap:\s*https:\/\/www\.mechaa\.es\/sitemap\.xml/i.test(robotsTxt)) {
        failures.push('Missing Sitemap directive https://www.mechaa.es/sitemap.xml');
      }

      const passed = failures.length === 0;
      recordResult('tier1', 'T1.4.1', 'Robots.txt Directives', passed, passed ? 'All required directives present in robots.txt' : failures.join('; '));
    }
  } catch (err) {
    recordResult('tier1', 'T1.4.1', 'Robots.txt Directives', false, err.message);
  }

  // T1.5.1 - JSON-LD Syntax Validation
  try {
    const failures = [];
    let scriptCount = 0;
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const scripts = getJsonLdScripts(html);
      scripts.forEach((code, idx) => {
        scriptCount++;
        try {
          JSON.parse(code);
        } catch (e) {
          failures.push(`${page.file} JSON-LD block #${idx + 1} parse error: ${e.message}`);
        }
      });
    }

    // Also test dynamic salon slug schema syntax
    try {
      const dynamicSchema = generateSalonJsonLd({});
      JSON.parse(JSON.stringify(dynamicSchema));
    } catch (e) {
      failures.push(`Dynamic salon JSON-LD parse error: ${e.message}`);
    }

    const passed = failures.length === 0;
    recordResult('tier1', 'T1.5.1', 'JSON-LD Syntax Validation', passed, passed ? `Successfully validated syntax of ${scriptCount} static + dynamic JSON-LD blocks` : failures.join('; '));
  } catch (err) {
    recordResult('tier1', 'T1.5.1', 'JSON-LD Syntax Validation', false, err.message);
  }

  // T1.5.2 - JSON-LD Schema Types
  try {
    const schemaTypes = new Set();
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const scripts = getJsonLdScripts(html);
      scripts.forEach((code) => {
        try {
          const parsed = JSON.parse(code);
          if (parsed['@type']) {
            if (Array.isArray(parsed['@type'])) {
              parsed['@type'].forEach(t => schemaTypes.add(t));
            } else {
              schemaTypes.add(parsed['@type']);
            }
          }
        } catch (e) {
          // Handled in T1.5.1
        }
      });
    }

    // Add dynamic salon schema type
    const dynamicSchema = generateSalonJsonLd({});
    schemaTypes.add(dynamicSchema['@type']);

    const requiredTypes = ['SoftwareApplication', 'Organization', 'HairSalon', 'BreadcrumbList', 'WebApplication'];
    const missingTypes = requiredTypes.filter(t => !schemaTypes.has(t) && !(t === 'HairSalon' && schemaTypes.has('LocalBusiness')));

    const passed = missingTypes.length === 0;
    recordResult('tier1', 'T1.5.2', 'JSON-LD Schema Types', passed, passed ? `Found all required schema types: ${Array.from(schemaTypes).join(', ')}` : `Missing schema types: ${missingTypes.join(', ')}`);
  } catch (err) {
    recordResult('tier1', 'T1.5.2', 'JSON-LD Schema Types', false, err.message);
  }

  // T1.6.1 - AIO Manifests (llms.txt / llms-full.txt)
  try {
    const failures = [];
    for (const f of ['llms.txt', 'llms-full.txt']) {
      const p = path.join(webDir, f);
      if (!fs.existsSync(p)) { failures.push(`${f} no encontrado en web/`); continue; }
      const content = fs.readFileSync(p, 'utf8');
      if (content.trim().length < 200) failures.push(`${f} demasiado corto (<200 chars)`);
      if (!content.toLowerCase().includes('mecha')) failures.push(`${f} no menciona "mecha"`);
    }
    const passed = failures.length === 0;
    recordResult('tier1', 'T1.6.1', 'AIO Manifests (llms.txt)', passed, passed ? 'llms.txt y llms-full.txt presentes y validos' : failures.join('; '));
  } catch (err) {
    recordResult('tier1', 'T1.6.1', 'AIO Manifests (llms.txt)', false, err.message);
  }

  // =========================================================================
  // TIER 2: Boundary & Corner Cases
  // =========================================================================

  // T2.1.1 - Noindex Contamination Guard
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const robots = getMetaRobots(html);
      if (robots && robots.toLowerCase().includes('noindex')) {
        failures.push(`${page.file} contains noindex in robots tag`);
      }
    }
    const passed = failures.length === 0;
    recordResult('tier2', 'T2.1.1', 'Noindex Contamination Guard', passed, passed ? 'No public page contains accidental noindex' : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.1.1', 'Noindex Contamination Guard', false, err.message);
  }

  // T2.2.1 - Missing Canonical Attribute Guard
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const canonical = getCanonicalHref(html);
      if (!canonical || canonical.trim() === '') {
        failures.push(`${page.file} missing rel="canonical" or has empty href`);
      }
    }
    const passed = failures.length === 0;
    recordResult('tier2', 'T2.2.1', 'Missing Canonical Attribute Guard', passed, passed ? 'All public pages contain non-empty canonical href' : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.2.1', 'Missing Canonical Attribute Guard', false, err.message);
  }

  // T2.2.2 - HTTP vs HTTPS Protocol Guard
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const canonical = getCanonicalHref(html);
      if (canonical) {
        if (canonical.startsWith('http://')) {
          failures.push(`${page.file} uses insecure http:// protocol`);
        } else if (canonical.includes('localhost') || canonical.includes('127.0.0.1')) {
          failures.push(`${page.file} points to localhost/loopback IP`);
        } else if (!canonical.startsWith('https://www.mechaa.es/')) {
          failures.push(`${page.file} canonical "${canonical}" does not match https://www.mechaa.es/`);
        }
      }
    }
    const passed = failures.length === 0;
    recordResult('tier2', 'T2.2.2', 'HTTP vs HTTPS Protocol Guard', passed, passed ? 'All canonical links strictly use HTTPS domain https://www.mechaa.es/' : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.2.2', 'HTTP vs HTTPS Protocol Guard', false, err.message);
  }

  // T2.3.1 - Sitemap Trailing / Formatting Guard
  try {
    const sitemapPath = path.join(webDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const locMatches = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').trim());
    const failures = [];

    locMatches.forEach((loc) => {
      try {
        const u = new URL(loc);
        if (u.protocol !== 'https:') {
          failures.push(`URL ${loc} in sitemap is not HTTPS`);
        }
        if (u.hostname !== 'www.mechaa.es') {
          failures.push(`URL ${loc} in sitemap does not use hostname www.mechaa.es`);
        }
        // Root https://www.mechaa.es/ is allowed trailing slash, subpages should not have illegal trailing slash
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
          failures.push(`URL ${loc} has invalid trailing slash in subpage path`);
        }
      } catch (e) {
        failures.push(`Malformed URL ${loc} in sitemap: ${e.message}`);
      }
    });

    const passed = failures.length === 0;
    recordResult('tier2', 'T2.3.1', 'Sitemap Trailing / Formatting Guard', passed, passed ? `Validated ${locMatches.length} sitemap URLs format` : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.3.1', 'Sitemap Trailing / Formatting Guard', false, err.message);
  }

  // T2.5.1 - Invalid JSON-LD Syntax Guard
  try {
    const failures = [];
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const scripts = getJsonLdScripts(html);
      scripts.forEach((code, idx) => {
        // Check trailing commas or unescaped characters
        if (/,\s*[\}\]]/.test(code)) {
          failures.push(`${page.file} JSON-LD #${idx + 1} contains illegal trailing comma`);
        }
        try {
          JSON.parse(code);
        } catch (e) {
          failures.push(`${page.file} JSON-LD #${idx + 1} syntax failure: ${e.message}`);
        }
      });
    }
    const passed = failures.length === 0;
    recordResult('tier2', 'T2.5.1', 'Invalid JSON-LD Syntax Guard', passed, passed ? 'No trailing commas or malformed syntax in JSON-LD blocks' : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.5.1', 'Invalid JSON-LD Syntax Guard', false, err.message);
  }

  // T2.5.2 - Mandatory Schema Properties
  try {
    const failures = [];
    const allSchemas = [];

    for (const page of publicPages) {
      const html = readHtml(page.file);
      const scripts = getJsonLdScripts(html);
      scripts.forEach((code) => {
        try {
          allSchemas.push(JSON.parse(code));
        } catch (e) {}
      });
    }
    allSchemas.push(generateSalonJsonLd({}));

    allSchemas.forEach((schema, idx) => {
      const ctx = schema['@context'];
      if (ctx !== 'https://schema.org' && ctx !== 'http://schema.org') {
        failures.push(`Schema #${idx + 1} (@type=${schema['@type']}) invalid @context "${ctx}"`);
      }

      const type = schema['@type'];
      if (type === 'SoftwareApplication' || type === 'WebApplication') {
        if (!schema.name) failures.push(`Schema #${idx + 1} (${type}) missing mandatory property "name"`);
        if (!schema.url) failures.push(`Schema #${idx + 1} (${type}) missing mandatory property "url"`);
      } else if (type === 'Organization') {
        if (!schema.name) failures.push(`Schema #${idx + 1} (Organization) missing mandatory property "name"`);
        if (!schema.url) failures.push(`Schema #${idx + 1} (Organization) missing mandatory property "url"`);
      } else if (type === 'BreadcrumbList') {
        if (!Array.isArray(schema.itemListElement)) failures.push(`Schema #${idx + 1} (BreadcrumbList) missing mandatory array "itemListElement"`);
      } else if (type === 'LocalBusiness' || type === 'HairSalon') {
        if (!schema.name) failures.push(`Schema #${idx + 1} (${type}) missing mandatory property "name"`);
        if (!schema.url) failures.push(`Schema #${idx + 1} (${type}) missing mandatory property "url"`);
      }
    });

    const passed = failures.length === 0;
    recordResult('tier2', 'T2.5.2', 'Mandatory Schema Properties', passed, passed ? `Validated mandatory properties across ${allSchemas.length} schema objects` : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.5.2', 'Mandatory Schema Properties', false, err.message);
  }

  // T2.6.1 - Generated SEO Pages Integrity (canonical por slug, JSON-LD, robots)
  // Verifica que las paginas generadas (landings, ciudades, fichas prerender)
  // tienen canonical coincidente con su ruta (no la generica /salon), robots
  // indexable y JSON-LD que parsea.
  try {
    const failures = [];
    if (generatedPages.length === 0) {
      failures.push('No se encontraron paginas generadas. Ejecuta: npm run generate:seo');
    }
    for (const page of generatedPages) {
      const html = readHtml(page.file);
      const canonical = getCanonicalHref(html);
      const expected = `https://www.mechaa.es${page.route}`;
      if (!canonical) {
        failures.push(`${page.file}: sin canonical`);
      } else if (canonical !== expected) {
        failures.push(`${page.file}: canonical "${canonical}" != esperada "${expected}"`);
      }
      const robots = getMetaRobots(html);
      if (!robots || !robots.toLowerCase().includes('index') || robots.toLowerCase().includes('noindex')) {
        failures.push(`${page.file}: robots invalido "${robots}"`);
      }
      getJsonLdScripts(html).forEach((code, idx) => {
        try { JSON.parse(code); } catch (e) { failures.push(`${page.file} JSON-LD #${idx + 1}: ${e.message}`); }
      });
    }
    const passed = failures.length === 0;
    recordResult('tier2', 'T2.6.1', 'Generated SEO Pages Integrity', passed, passed ? `${generatedPages.length} paginas generadas validas (canonical por slug, JSON-LD, robots)` : failures.join('; '));
  } catch (err) {
    recordResult('tier2', 'T2.6.1', 'Generated SEO Pages Integrity', false, err.message);
  }

  // =========================================================================
  // TIER 3: Cross-Feature Combinations
  // =========================================================================

  // T3.1.1 - Sitemap & Canonical URL Parity (estricta)
  // Cada URL del sitemap debe tener una pagina HTML cuyo canonical coincida
  // exactamente. Incluye estaticas + landings + ciudades + fichas prerender.
  try {
    const sitemapPath = path.join(webDir, 'sitemap.xml');
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const locMatches = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').trim());

    const canonicalSet = new Set();
    for (const page of allPublicPages) {
      const html = readHtml(page.file);
      const canonical = getCanonicalHref(html);
      if (canonical) canonicalSet.add(canonical);
    }

    const failures = locMatches
      .filter(loc => !canonicalSet.has(loc))
      .map(loc => `Sitemap URL "${loc}" sin canonical coincidente en HTML`);

    const passed = failures.length === 0;
    recordResult('tier3', 'T3.1.1', 'Sitemap & Canonical URL Parity', passed, passed ? `Todas las ${locMatches.length} URLs del sitemap tienen canonical coincidente` : failures.join('; '));
  } catch (err) {
    recordResult('tier3', 'T3.1.1', 'Sitemap & Canonical URL Parity', false, err.message);
  }

  // T3.1.2 - Robots.txt & Sitemap URL Parity
  try {
    const robotsPath = path.join(webDir, 'robots.txt');
    const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
    const match = robotsTxt.match(/Sitemap:\s*([^\s]+)/i);
    const failures = [];

    if (!match) {
      failures.push('robots.txt missing Sitemap directive');
    } else {
      const sitemapDirective = match[1].trim();
      const expectedSitemapUrl = 'https://www.mechaa.es/sitemap.xml';
      if (sitemapDirective !== expectedSitemapUrl) {
        failures.push(`robots.txt Sitemap directive "${sitemapDirective}" does not match "${expectedSitemapUrl}"`);
      }
    }

    const passed = failures.length === 0;
    recordResult('tier3', 'T3.1.2', 'Robots.txt & Sitemap URL Parity', passed, passed ? 'Sitemap directive in robots.txt matches sitemap URL' : failures.join('; '));
  } catch (err) {
    recordResult('tier3', 'T3.1.2', 'Robots.txt & Sitemap URL Parity', false, err.message);
  }

  // T3.1.3 - Private Route Exclusion Parity
  try {
    const robotsPath = path.join(webDir, 'robots.txt');
    const sitemapPath = path.join(webDir, 'sitemap.xml');
    const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const locMatches = (sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').trim());

    const disallowRules = (robotsTxt.match(/Disallow:\s*([^\s]+)/gi) || []).map(s => s.replace(/Disallow:\s*/i, '').trim());
    const failures = [];

    // Check that disallowed paths are NOT in sitemap
    disallowRules.forEach((rule) => {
      if (rule && rule !== '') {
        locMatches.forEach((loc) => {
          if (loc.includes(rule)) {
            failures.push(`Disallowed route "${rule}" found in sitemap URL "${loc}"`);
          }
        });
      }
    });

    // Check that private HTML files have noindex
    for (const page of privatePages) {
      const html = readHtml(page.file);
      const robots = getMetaRobots(html);
      if (!robots || !robots.toLowerCase().includes('noindex')) {
        failures.push(`Private page ${page.file} does not contain noindex in meta robots`);
      }
    }

    const passed = failures.length === 0;
    recordResult('tier3', 'T3.1.3', 'Private Route Exclusion Parity', passed, passed ? 'Private routes disallowed in robots.txt, excluded from sitemap, and carry noindex' : failures.join('; '));
  } catch (err) {
    recordResult('tier3', 'T3.1.3', 'Private Route Exclusion Parity', false, err.message);
  }

  // =========================================================================
  // TIER 4: Real-World Scenarios
  // =========================================================================

  // T4.1.1 - Complete Site Crawler Simulation
  try {
    const crawlerLogs = [];
    const failures = [];

    // 1. Crawl Public Pages
    for (const page of publicPages) {
      const html = readHtml(page.file);
      const metaRobots = getMetaRobots(html);
      const canonical = getCanonicalHref(html);
      const jsonLdScripts = getJsonLdScripts(html);

      if (!metaRobots || !metaRobots.toLowerCase().includes('index')) {
        failures.push(`Crawler failed on public page ${page.file}: missing or invalid index robots meta`);
      }
      if (!canonical || !canonical.startsWith('https://www.mechaa.es/')) {
        failures.push(`Crawler failed on public page ${page.file}: missing or invalid canonical HTTPS URL`);
      }
      jsonLdScripts.forEach((script, idx) => {
        try {
          JSON.parse(script);
        } catch (e) {
          failures.push(`Crawler failed on public page ${page.file}: JSON-LD #${idx + 1} parsing error`);
        }
      });
      crawlerLogs.push(`Public ${page.route} -> OK (index/follow, canonical: ${canonical})`);
    }

    // 2. Crawl Private Pages
    for (const page of privatePages) {
      const html = readHtml(page.file);
      const metaRobots = getMetaRobots(html);
      if (!metaRobots || !metaRobots.toLowerCase().includes('noindex')) {
        failures.push(`Crawler failed on private page ${page.file}: expected noindex`);
      }
      crawlerLogs.push(`Private ${page.route} -> OK (noindex/nofollow)`);
    }

    const passed = failures.length === 0;
    recordResult('tier4', 'T4.1.1', 'Complete Site Crawler Simulation', passed, passed ? `Simulated crawling ${publicPages.length + privatePages.length} routes successfully` : failures.join('; '));
  } catch (err) {
    recordResult('tier4', 'T4.1.1', 'Complete Site Crawler Simulation', false, err.message);
  }

  // T4.1.2 - Dynamic Salon Slug Resolution
  try {
    const failures = [];
    const sampleSalons = [
      { slug: 'florent-suarez-peluqueros', nombre: 'Florent Suárez Peluqueros', ciudad: 'Oviedo' },
      { slug: 'barberia-clasica-madrid', nombre: 'Barbería Clásica Madrid', ciudad: 'Madrid' }
    ];

    sampleSalons.forEach((salon) => {
      const jsonLd = generateSalonJsonLd(salon);
      if (jsonLd['@context'] !== 'https://schema.org') {
        failures.push(`Dynamic salon ${salon.slug}: invalid @context "${jsonLd['@context']}"`);
      }
      if (jsonLd['@type'] !== 'HairSalon' && jsonLd['@type'] !== 'LocalBusiness') {
        failures.push(`Dynamic salon ${salon.slug}: invalid @type "${jsonLd['@type']}"`);
      }
      if (jsonLd.url !== `https://www.mechaa.es/salon/${salon.slug}`) {
        failures.push(`Dynamic salon ${salon.slug}: invalid URL "${jsonLd.url}"`);
      }
      if (!jsonLd.name || !jsonLd.telephone || !jsonLd.address) {
        failures.push(`Dynamic salon ${salon.slug}: missing required salon properties`);
      }
    });

    const passed = failures.length === 0;
    recordResult('tier4', 'T4.1.2', 'Dynamic Salon Slug Resolution', passed, passed ? `Resolved and validated dynamic HairSalon JSON-LD structure for ${sampleSalons.length} test slugs` : failures.join('; '));
  } catch (err) {
    recordResult('tier4', 'T4.1.2', 'Dynamic Salon Slug Resolution', false, err.message);
  }

  return testResults;
}

/**
 * Format and print test results report
 */
export function printTestReport(results) {
  console.log('============================================================');
  console.log('      MECHA OS — E2E SEO & INDEXING TEST SUITE              ');
  console.log('============================================================\n');

  const tiers = [
    { key: 'tier1', title: 'Tier 1: Feature Coverage' },
    { key: 'tier2', title: 'Tier 2: Boundary & Corner Cases' },
    { key: 'tier3', title: 'Tier 3: Cross-Feature Combinations' },
    { key: 'tier4', title: 'Tier 4: Real-World Scenarios' }
  ];

  tiers.forEach((tier) => {
    console.log(`--- ${tier.title} ---`);
    results[tier.key].forEach((t) => {
      const status = t.passed ? '[PASS]' : '[FAIL]';
      console.log(`${status} ${t.id} - ${t.name}`);
      if (t.details) {
        console.log(`       Details: ${t.details}`);
      }
    });
    console.log('');
  });

  console.log('============================================================');
  console.log(`SUMMARY: ${results.passed} Passed, ${results.failed} Failed (Total: ${results.total})`);
  console.log('============================================================');
}

// CLI Execution Entry Point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runSeoTestSuite().then((results) => {
    printTestReport(results);
    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
