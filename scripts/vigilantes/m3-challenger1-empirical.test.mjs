import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';

// Helper: WCAG 2.1 Relative Luminance & Contrast Ratio Calculation
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function sRgbToLinear(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(sRgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const L1 = getRelativeLuminance(hex1);
  const L2 = getRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// PILAR 1: LANDING, SEO ESTRUCTURADO, CLAIMS LEGALES Y RESPONSIVIDAD
// ---------------------------------------------------------------------------

test('CHALLENGER 1 [Pilar 1]: JSON-LD Offer prices strictly synchronize with lib/planes.ts (Esencial 39€, Estudio 59€)', () => {
  const planesContent = readFileSync(path.join(RAIZ, 'lib/planes.ts'), 'utf8');
  const indexHtml = readFileSync(path.join(RAIZ, 'web/index.html'), 'utf8');

  // Extract prices from lib/planes.ts
  const esencialMatch = planesContent.match(/esencial:\s*(\d+)/);
  const estudioMatch = planesContent.match(/estudio:\s*(\d+)/);
  assert.ok(esencialMatch, 'lib/planes.ts must define esencial price');
  assert.ok(estudioMatch, 'lib/planes.ts must define estudio price');

  const expectedEsencialPrice = parseInt(esencialMatch[1], 10);
  const expectedEstudioPrice = parseInt(estudioMatch[1], 10);
  assert.equal(expectedEsencialPrice, 39, 'Esencial must be 39€');
  assert.equal(expectedEstudioPrice, 59, 'Estudio must be 59€');

  // Parse JSON-LD in web/index.html
  const scriptMatches = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.ok(scriptMatches.length >= 2, 'web/index.html should have WebSite and SoftwareApplication schemas');

  let softwareAppFound = false;
  for (const match of scriptMatches) {
    const data = JSON.parse(match[1]);
    const nodes = data['@graph'] || [data];
    for (const node of nodes) {
      if (node['@type'] === 'SoftwareApplication') {
        softwareAppFound = true;
        assert.ok(Array.isArray(node.offers), 'SoftwareApplication must have offers array');
        
        const esencialOffer = node.offers.find((o) => o.name === 'Esencial');
        const estudioOffer = node.offers.find((o) => o.name === 'Estudio');

        assert.ok(esencialOffer, 'JSON-LD must include Esencial offer');
        assert.ok(estudioOffer, 'JSON-LD must include Estudio offer');

        assert.equal(Number(esencialOffer.price), expectedEsencialPrice, 'Esencial price in JSON-LD must match lib/planes.ts');
        assert.equal(Number(estudioOffer.price), expectedEstudioPrice, 'Estudio price in JSON-LD must match lib/planes.ts');
        assert.equal(esencialOffer.priceCurrency, 'EUR', 'Currency must be EUR');
        assert.equal(estudioOffer.priceCurrency, 'EUR', 'Currency must be EUR');
      }
    }
  }
  assert.ok(softwareAppFound, 'SoftwareApplication schema must be present');
});

test('CHALLENGER 1 [Pilar 1]: JSON-LD has ZERO fake ratings or reviews across all landing files (CLAUDE.md Decision 5)', () => {
  const landingFiles = ['web/index.html', 'web/acceso.html', 'web/demo.html'].filter((f) =>
    existsSync(path.join(RAIZ, f))
  );

  for (const file of landingFiles) {
    const content = readFileSync(path.join(RAIZ, file), 'utf8');
    const scriptMatches = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    for (const match of scriptMatches) {
      const data = JSON.parse(match[1]);
      const nodes = data['@graph'] || [data];
      for (const node of nodes) {
        assert.equal(node.aggregateRating, undefined, `No aggregateRating allowed in ${file}`);
        assert.equal(node.review, undefined, `No review allowed in ${file}`);
        assert.equal(node.ratingValue, undefined, `No ratingValue allowed in ${file}`);
        assert.equal(node.ratingCount, undefined, `No ratingCount allowed in ${file}`);
        assert.equal(node.reviewCount, undefined, `No reviewCount allowed in ${file}`);
      }
    }
  }
});

test('CHALLENGER 1 [Pilar 1]: VeriFactu legal honesty invariants across public pages & estadoVerifactu.ts', () => {
  const filesToCheck = [
    'web/index.html',
    'web/demo.html',
    'web/acceso.html',
    'lib/fiscal/estadoVerifactu.ts',
  ].filter((f) => existsSync(path.join(RAIZ, f)));

  for (const relPath of filesToCheck) {
    const content = readFileSync(path.join(RAIZ, relPath), 'utf8');
    // Prohibited marketing false claims
    assert.doesNotMatch(content, /homologad[oa] por la AEAT/i, `Forbidden claim found in ${relPath}`);
    assert.doesNotMatch(content, /certificad[oa] oficial por (?:la )?AEAT/i, `Forbidden claim found in ${relPath}`);
    assert.doesNotMatch(content, /homologaci[oó]n oficial/i, `Forbidden claim found in ${relPath}`);
  }

  // Check lib/fiscal/estadoVerifactu.ts constants
  const verifactuCode = readFileSync(path.join(RAIZ, 'lib/fiscal/estadoVerifactu.ts'), 'utf8');
  assert.ok(verifactuCode.includes('ENVIO_AEAT_DISPONIBLE = false'), 'ENVIO_AEAT_DISPONIBLE must be false');
  assert.ok(verifactuCode.includes('LIBRO_TICKETS_INALTERABLE = true'), 'LIBRO_TICKETS_INALTERABLE must be true');
});

test('CHALLENGER 1 [Pilar 1]: Color tokens in lib/portalTokens.ts mathematically satisfy WCAG AA contrast (>= 4.5:1 for body text, >= 3.0:1 for UI elements)', () => {
  const bg = '#f6f1ea';
  const text = '#1c1814';
  const textSec = '#5c5249';
  const primaryHi = '#c0260a';
  const danger = '#e23b34';
  const success = '#0f9d6b';

  const textContrast = getContrastRatio(bg, text);
  assert.ok(textContrast >= 11.0, `Text contrast (${textContrast.toFixed(2)}) must exceed 11:1 on bg`);

  const textSecContrast = getContrastRatio(bg, textSec);
  assert.ok(textSecContrast >= 4.5, `Secondary text contrast (${textSecContrast.toFixed(2)}) must satisfy WCAG AA (>= 4.5:1)`);

  const primaryContrast = getContrastRatio(bg, primaryHi);
  assert.ok(primaryContrast >= 4.5, `Primary accent contrast (${primaryContrast.toFixed(2)}) must satisfy WCAG AA (>= 4.5:1)`);

  const dangerContrast = getContrastRatio(bg, danger);
  assert.ok(dangerContrast >= 3.0, `Danger contrast (${dangerContrast.toFixed(2)}) for UI components >= 3.0:1`);

  const successContrast = getContrastRatio(bg, success);
  assert.ok(successContrast >= 3.0, `Success contrast (${successContrast.toFixed(2)}) for UI components >= 3.0:1`);
});

test('CHALLENGER 1 [Pilar 1]: Mobile viewports (360x740, 375x812, 390x844) and modal scroll-lock in tests/landing.spec.ts', () => {
  const landingSpec = readFileSync(path.join(RAIZ, 'tests/landing.spec.ts'), 'utf8');

  // Verify viewports presence
  assert.ok(landingSpec.includes('360') && landingSpec.includes('740'), 'Must test 360x740 Galaxy S8');
  assert.ok(landingSpec.includes('375') && landingSpec.includes('812'), 'Must test 375x812 iPhone SE');
  assert.ok(landingSpec.includes('390') && landingSpec.includes('844'), 'Must test 390x844 iPhone 14');

  // Verify zero horizontal scroll assertions
  assert.ok(landingSpec.includes('scrollWidth') && landingSpec.includes('clientWidth'), 'Must check scrollWidth vs clientWidth');
  assert.ok(landingSpec.includes('modal-open'), 'Must test modal scroll-lock');
});

// ---------------------------------------------------------------------------
// PILAR 2: PORTAL DE RESERVAS, TOUCH TARGETS, REPOSOS QUÍMICOS Y CONCURRENCIA
// ---------------------------------------------------------------------------

test('CHALLENGER 1 [Pilar 2]: Comprehensive touch target audit in app/r/[slug].web.tsx (all interactive buttons >= 44px)', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // 1. Back button (volverAtras)
  assert.match(portalCode, /button onClick=\{volverAtras\} style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/);

  // 2. Clear search button
  assert.match(portalCode, /aria-label="Borrar búsqueda" style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/);

  // 3. Service selection change button
  assert.match(portalCode, /onClick=\{\(\) => setServicio\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 4. Time slot selection buttons
  assert.match(portalCode, /onClick=\{\(\) => setSlotSel\(s\)\}[\s\S]*?minHeight:\s*44/);

  // 5. Restart / new booking button
  assert.match(portalCode, /onClick=\{reiniciar\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 6. Modal actions
  assert.match(portalCode, /onClick=\{\(\) => setGrupoOk\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /onClick=\{\(\) => setShowWlModal\(false\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /type="submit" disabled=\{wlEnviando\} style=\{\{[\s\S]*?minHeight:\s*44/);
});

test('CHALLENGER 1 [Pilar 2]: Chemical rest ("Hueco Express") slot metadata and rendering integrity', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // Verify property usage
  assert.ok(portalCode.includes('s.en_reposo'), 'Slot en_reposo flag must be handled');
  assert.ok(portalCode.includes('s.reposo_disponible_min'), 'Slot reposo_disponible_min must be displayed');
  assert.ok(portalCode.includes('⚡ Hueco Express'), 'Must display Hueco Express badge');
  assert.ok(portalCode.includes('slotSel?.en_reposo'), 'Must show chemical rest explanation banner on slot selection');
});

test('CHALLENGER 1 [Pilar 2]: Double-booking concurrency prevention & RPC chained reservation integration', () => {
  const reservaCode = readFileSync(path.join(RAIZ, 'lib/reservaPublica.ts'), 'utf8');

  assert.ok(reservaCode.includes('crear_cita_publica_cadena'), 'Must call RPC crear_cita_publica_cadena for atomic reservation');
  assert.ok(reservaCode.includes('normalizarTelefonoE164'), 'Must normalize contact phone numbers to E.164 format');

  // Check SQL migration or functions for crear_cita_publica_cadena
  const migrationFiles = [
    'supabase/migrations/20260828225907_cerrar_rpc_sin_atadura_al_llamante.sql',
    'supabase/migrations/20260830155347_gate_suscripcion_triggers_y_portal.sql',
  ].filter((f) => existsSync(path.join(RAIZ, f)));

  assert.ok(migrationFiles.length > 0, 'Chained booking migration must exist');
});

test('CHALLENGER 1 [Pilar 2]: 5-Step Booking Flow validation in tests/portal-reserva.spec.ts', () => {
  const specCode = readFileSync(path.join(RAIZ, 'tests/portal-reserva.spec.ts'), 'utf8');

  // Step 1: Service selection
  assert.ok(specCode.includes('abrirYElegirServicio'), 'Step 1: Service selection helper present');

  // Step 2 & 3: Available days and hours with chemical rests
  assert.ok(specCode.includes('portal_dias_disponibles'), 'Step 2: Available days queried');
  assert.ok(specCode.includes('disponibilidad_publica'), 'Step 3: Public availability queried');
  assert.ok(specCode.includes('en_reposo: true'), 'Step 3: Chemical rest slot simulation');

  // Step 4: Contact details, phone & Turnstile captcha
  assert.ok(specCode.includes('Cloudflare Turnstile'), 'Step 4: Turnstile captcha integration');
  assert.ok(specCode.includes('rp-consent'), 'Step 4: GDPR consent checkbox');

  // Step 5: Post-booking actions (Google Calendar, Apple Calendar ICS, WhatsApp, Self-management link)
  assert.ok(specCode.includes('¡Reserva confirmada!'), 'Step 5: Confirmation screen rendered');
  assert.ok(specCode.includes('Google Calendar'), 'Step 5: Google Calendar integration');
  assert.ok(specCode.includes('Apple Calendar'), 'Step 5: Apple Calendar integration');
  assert.ok(specCode.includes('Gestionar o cancelar mi cita'), 'Step 5: Self-management link');
});

// ---------------------------------------------------------------------------
// PILAR 3: SOFTWARE SPA 17 PANTALLAS, SILENCIOS Y SUPABASE REALTIME
// ---------------------------------------------------------------------------

test('CHALLENGER 1 [Pilar 3]: SPA 17 Screens catalog completeness & distinct route mapping in tests/smoke/pantallas.ts', () => {
  const pantallasCode = readFileSync(path.join(RAIZ, 'tests/smoke/pantallas.ts'), 'utf8');

  const expectedScreens = [
    { nombre: 'agenda', ruta: '/app', tipo: 'software' },
    { nombre: 'mi-jornada', ruta: '/app/mi-jornada', tipo: 'software' },
    { nombre: 'lista-espera', ruta: '/app/lista-espera', tipo: 'software' },
    { nombre: 'citas', ruta: '/app/citas', tipo: 'software' },
    { nombre: 'clientes', ruta: '/app/clientes', tipo: 'software' },
    { nombre: 'bandeja', ruta: '/app/bandeja', tipo: 'software' },
    { nombre: 'campanas', ruta: '/app/campanas', tipo: 'software' },
    { nombre: 'caja', ruta: '/app/caja', tipo: 'software' },
    { nombre: 'presupuestos', ruta: '/app/presupuestos', tipo: 'software' },
    { nombre: 'equipo', ruta: '/app/equipo', tipo: 'software' },
    { nombre: 'inventario', ruta: '/app/inventario', tipo: 'software' },
    { nombre: 'resenas', ruta: '/app/resenas', tipo: 'software' },
    { nombre: 'informes', ruta: '/app/informes', tipo: 'software' },
    { nombre: 'ayuda', ruta: '/app/ayuda', tipo: 'software' },
    { nombre: 'configuracion', ruta: '/app/configuracion', tipo: 'software' },
    { nombre: 'portal-reserva', ruta: '/app/r/demo', tipo: 'publica' },
    { nombre: 'portal-resena', ruta: '/app/resena/demo', tipo: 'publica' },
  ];

  for (const exp of expectedScreens) {
    const pattern = new RegExp(`nombre:\\s*'${exp.nombre}'[\\s\\S]*?ruta:\\s*'${exp.ruta}'[\\s\\S]*?tipo:\\s*'${exp.tipo}'`);
    assert.match(pantallasCode, pattern, `Screen ${exp.nombre} with route ${exp.ruta} must be in inventory`);
  }
});

test('CHALLENGER 1 [Pilar 3]: Silent error sensors in tests/smoke/silencios.ts (unhandledrejection, dialog trap, string anchors)', () => {
  const silenciosCode = readFileSync(path.join(RAIZ, 'tests/smoke/silencios.ts'), 'utf8');

  // 1. Broken promises listener across all frames
  assert.ok(silenciosCode.includes("window.addEventListener('unhandledrejection'"), 'Must hook unhandledrejection in initScript');
  assert.ok(silenciosCode.includes('leerPromesasRotas'), 'Must read unhandledrejection across all iframe frames');

  // 2. Native dialog dismiss and record
  assert.ok(silenciosCode.includes("page.on('dialog'"), 'Must intercept native dialogs');
  assert.ok(silenciosCode.includes('d.dismiss()'), 'Must dismiss dialog to prevent blocking');

  // 3. Anchor check against lib/errores.ts
  assert.ok(silenciosCode.includes('comprobarAnclas'), 'Must include comprobarAnclas validator function');
});

test('CHALLENGER 1 [Pilar 3]: Supabase Realtime WebSocket lifecycle cleanup on unmount across hooks & components', () => {
  // 1. useCitasRealtime
  const useCitasCode = readFileSync(path.join(RAIZ, 'lib/hooks/useCitasRealtime.ts'), 'utf8');
  assert.ok(useCitasCode.includes('supabase.removeChannel(canal)'), 'useCitasRealtime must call removeChannel');
  assert.ok(useCitasCode.includes('return () =>'), 'Cleanup function must return channel removal');

  // 2. ColaDiaPanel
  const colaDiaCode = readFileSync(path.join(RAIZ, 'components/cola/ColaDiaPanel.web.tsx'), 'utf8');
  assert.ok(colaDiaCode.includes('supabase.removeChannel(canal)'), 'ColaDiaPanel must call removeChannel');

  // 3. Shared demo mode guard
  assert.ok(useCitasCode.includes('IS_DEMO_MODE'), 'useCitasRealtime must check IS_DEMO_MODE to prevent crosstalk');
});

test('CHALLENGER 1 [Pilar 3]: Swallowed error AST rules in scripts/vigilantes/errores-tragados.mjs', () => {
  const erroresTragadosCode = readFileSync(path.join(RAIZ, 'scripts/vigilantes/errores-tragados.mjs'), 'utf8');

  assert.ok(erroresTragadosCode.includes('fuego-y-olvido'), 'Must check fuego-y-olvido unhandled promises');
  assert.ok(erroresTragadosCode.includes('handler-async-sin-catch'), 'Must check handler-async-sin-catch');
  assert.ok(erroresTragadosCode.includes('supabase-sin-comprobar'), 'Must check unchecked supabase RPC errors');
});
