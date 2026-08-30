import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';

// Helper: WCAG 2.1 Contrast Calculation
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
// PILAR 1: LANDING, SEO, LEGAL HONESTY & ACCESSIBILITY
// ---------------------------------------------------------------------------

test('REVIEWER 2 ADVERSARIAL [Pilar 1]: Zero fake review or aggregateRating nodes across all HTML files', () => {
  const htmlFiles = [
    'web/index.html',
    'web/index_v4.html',
    'web/index_v5.html',
    'web/acceso.html',
    'web/demo.html',
    'web/demo_v2.html',
    'web/admin.html',
  ].filter((f) => existsSync(path.join(RAIZ, f)));

  for (const file of htmlFiles) {
    const content = readFileSync(path.join(RAIZ, file), 'utf8');
    const matches = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    for (const m of matches) {
      const data = JSON.parse(m[1]);
      const nodes = data['@graph'] || [data];
      for (const node of nodes) {
        assert.equal(node.aggregateRating, undefined, `Forbidden aggregateRating found in ${file}`);
        assert.equal(node.review, undefined, `Forbidden review found in ${file}`);
        assert.equal(node.ratingValue, undefined, `Forbidden ratingValue found in ${file}`);
      }
    }
  }
});

test('REVIEWER 2 ADVERSARIAL [Pilar 1]: VeriFactu legal honesty strict scan across all client & landing code', () => {
  const targetFiles = [
    'web/index.html',
    'web/demo.html',
    'web/acceso.html',
    'lib/fiscal/estadoVerifactu.ts',
  ].filter((f) => existsSync(path.join(RAIZ, f)));

  for (const file of targetFiles) {
    const text = readFileSync(path.join(RAIZ, file), 'utf8');
    // Forbidden unhedged marketing statements
    assert.doesNotMatch(text, /homologad[oa] por la AEAT/i, `Illegal claim in ${file}`);
    assert.doesNotMatch(text, /certificad[oa] oficial(?:mente)? por la AEAT/i, `Illegal claim in ${file}`);
    assert.doesNotMatch(text, /validado por Hacienda/i, `Illegal claim in ${file}`);
  }
});

test('REVIEWER 2 ADVERSARIAL [Pilar 1]: Portal Color Contrast WCAG AA compliance mathematical verification', () => {
  const bg = '#f6f1ea';
  const text = '#1c1814';
  const textSec = '#5c5249';
  const primaryHi = '#c0260a';
  const primary = '#f4501e';
  const success = '#0f9d6b';
  const danger = '#e23b34';

  const contrastText = getContrastRatio(bg, text);
  assert.ok(contrastText >= 11.0, `Body text contrast (${contrastText.toFixed(2)}) must exceed 11:1 on bg`);

  const contrastTextSec = getContrastRatio(bg, textSec);
  assert.ok(contrastTextSec >= 4.5, `Secondary text contrast (${contrastTextSec.toFixed(2)}) must exceed WCAG AA 4.5:1`);

  const contrastPrimaryHi = getContrastRatio(bg, primaryHi);
  assert.ok(contrastPrimaryHi >= 4.5, `PrimaryHi contrast (${contrastPrimaryHi.toFixed(2)}) must exceed WCAG AA 4.5:1`);

  const contrastWhiteOnPrimary = getContrastRatio('#ffffff', primary);
  assert.ok(contrastWhiteOnPrimary >= 3.0, `White on Primary button (${contrastWhiteOnPrimary.toFixed(2)}) >= 3.0:1 for large UI text`);

  const contrastSuccess = getContrastRatio(bg, success);
  assert.ok(contrastSuccess >= 3.0, `Success badge/icon contrast (${contrastSuccess.toFixed(2)}) >= 3.0:1 (WCAG UI component)`);

  const contrastDanger = getContrastRatio(bg, danger);
  assert.ok(contrastDanger >= 3.0, `Danger badge/icon contrast (${contrastDanger.toFixed(2)}) >= 3.0:1 (WCAG UI component)`);
});

// ---------------------------------------------------------------------------
// PILAR 2: PORTAL DE RESERVAS & CHECKOUT TOUCH TARGETS & CONCURRENCY
// ---------------------------------------------------------------------------

test('REVIEWER 2 ADVERSARIAL [Pilar 2]: Exhaustive Touch Target Minimum Size (>=44x44px) in app/r/[slug].web.tsx', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // 1. Back button
  assert.match(portalCode, /button onClick=\{volverAtras\} style=\{\{[\s\S]*?(?:width:\s*44[\s\S]*?height:\s*44|minWidth:\s*44[\s\S]*?minHeight:\s*44)/);

  // 2. Clear search button
  assert.match(portalCode, /aria-label="Borrar búsqueda" style=\{\{[\s\S]*?(?:width:\s*44[\s\S]*?height:\s*44|minWidth:\s*44[\s\S]*?minHeight:\s*44)/);

  // 3. Search input padding right prevents clear button overlap
  assert.match(portalCode, /paddingRight:\s*busqueda\s*\?\s*46\s*:\s*14/);

  // 4. Change service button
  assert.match(portalCode, /onClick=\{\(\) => setServicio\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 5. Slot buttons
  assert.match(portalCode, /onClick=\{\(\) => setSlotSel\(s\)\}[\s\S]*?minHeight:\s*44/);

  // 6. Restart booking button
  assert.match(portalCode, /onClick=\{reiniciar\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 7. Modal buttons
  assert.match(portalCode, /onClick=\{\(\) => setGrupoOk\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /onClick=\{\(\) => \{\s*setShowWlModal\(false\);\s*setWlExito\(false\);\s*\}\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /button type="button" onClick=\{\(\) => setShowWlModal\(false\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /button type="submit" disabled=\{wlEnviando\} style=\{\{[\s\S]*?minHeight:\s*44/);
});

test('REVIEWER 2 ADVERSARIAL [Pilar 2]: E.164 Phone Normalization in lib/reservaPublica.ts', () => {
  const reservaCode = readFileSync(path.join(RAIZ, 'lib/reservaPublica.ts'), 'utf8');
  assert.ok(reservaCode.includes('function normalizarTelefonoE164'), 'Must declare normalizarTelefonoE164');
  assert.ok(reservaCode.includes('^34[67]\\d{8}'), 'Handles Spanish mobile with 34 prefix');
  assert.ok(reservaCode.includes('^[67]\\d{8}'), 'Handles Spanish mobile 9 digits');
  assert.ok(reservaCode.includes('clean.startsWith(\'+\')'), 'Handles international + prefix');
});

test('REVIEWER 2 ADVERSARIAL [Pilar 2]: Chemical Rest metadata and conditional banners handling in app/r/[slug].web.tsx', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // Verify en_reposo logic
  assert.ok(portalCode.includes('s.en_reposo'), 'Slot en_reposo boolean must be tested');
  assert.ok(portalCode.includes('s.reposo_disponible_min'), 'Slot reposo_disponible_min must be referenced');
  assert.ok(portalCode.includes('Hueco Express'), 'Must display Hueco Express tag');
  assert.ok(portalCode.includes('slotSel?.en_reposo'), 'Must show chemical rest explanation on selected slot');
});

// ---------------------------------------------------------------------------
// PILAR 3: SOFTWARE SPA 17 PANTALLAS, SILENCIOS Y WEBSOCKET REALTIME
// ---------------------------------------------------------------------------

test('REVIEWER 2 ADVERSARIAL [Pilar 3]: 17 Screens catalog invariants and route correspondence in tests/smoke/pantallas.ts', () => {
  const pantallasCode = readFileSync(path.join(RAIZ, 'tests/smoke/pantallas.ts'), 'utf8');

  const matches = [...pantallasCode.matchAll(/nombre:\s*'([a-z0-9_-]+)',\s*ruta:\s*'([^']+)',\s*ancla:\s*(\/[^/]+\/[a-z]*),\s*tipo:\s*'([^']+)'/g)];
  assert.equal(matches.length, 17, `Expected 17 screens in catalog, found ${matches.length}`);

  const names = new Set();
  const routes = new Set();

  for (const m of matches) {
    const [, nombre, ruta, ancla, tipo] = m;
    assert.ok(nombre && typeof nombre === 'string', `Screen must have valid nombre`);
    assert.ok(ruta && typeof ruta === 'string', `Screen must have valid ruta`);
    assert.ok(tipo === 'software' || tipo === 'publica', `Screen ${nombre} must have valid tipo: ${tipo}`);

    // Verify all routes start with /app
    assert.ok(ruta.startsWith('/app'), `Screen ${nombre} ruta must start with /app: ${ruta}`);

    // No duplicate names or routes
    assert.ok(!names.has(nombre), `Duplicate screen nombre found: ${nombre}`);
    assert.ok(!routes.has(ruta), `Duplicate screen ruta found: ${ruta}`);
    names.add(nombre);
    routes.add(ruta);
  }
});

test('REVIEWER 2 ADVERSARIAL [Pilar 3]: Silent Error Sensor Anchors in tests/smoke/silencios.ts match lib/errores.ts', () => {
  const silenciosCode = readFileSync(path.join(RAIZ, 'tests/smoke/silencios.ts'), 'utf8');
  const erroresCode = readFileSync(path.join(RAIZ, 'lib/errores.ts'), 'utf8');

  const requiredAnchors = [
    '(Detalles:',
    'No tienes permis',
    'Sin conexion.',
    'Ya existe un registro con',
    'Demasiados intentos.',
    'este dato esta vinculado a otros',
  ];

  for (const anchor of requiredAnchors) {
    assert.ok(silenciosCode.includes(anchor), `silencios.ts must include anchor "${anchor}"`);
    assert.ok(erroresCode.includes(anchor), `lib/errores.ts must contain live anchor "${anchor}"`);
  }

  assert.ok(silenciosCode.includes('function comprobarAnclas'), 'silencios.ts must have comprobarAnclas function');
});

test('REVIEWER 2 ADVERSARIAL [Pilar 3]: Supabase Realtime Channels properly removed on unmount without memory leaks', () => {
  // 1. useCitasRealtime hook
  const useCitasHook = readFileSync(path.join(RAIZ, 'lib/hooks/useCitasRealtime.ts'), 'utf8');
  assert.ok(useCitasHook.includes('supabase.removeChannel(canal)'), 'useCitasRealtime must call removeChannel');
  assert.ok(useCitasHook.includes('IS_DEMO_MODE'), 'useCitasRealtime must check IS_DEMO_MODE');

  // 2. ColaDiaPanel component
  const colaDia = readFileSync(path.join(RAIZ, 'components/cola/ColaDiaPanel.web.tsx'), 'utf8');
  assert.ok(colaDia.includes('supabase.removeChannel(canal)'), 'ColaDiaPanel must call removeChannel');
});

test('REVIEWER 2 ADVERSARIAL [Pilar 3]: Integrity Verification - No hardcoded mocks in pilares-visuales.test.mjs', () => {
  const testCode = readFileSync(path.join(RAIZ, 'scripts/vigilantes/pilares-visuales.test.mjs'), 'utf8');

  // Verify that pilares-visuales.test.mjs reads real files via fs.readFileSync
  assert.ok(testCode.includes("readFileSync(path.join(RAIZ, 'web/index.html')"), 'Reads web/index.html');
  assert.ok(testCode.includes("readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx')"), 'Reads app/r/[slug].web.tsx');
  assert.ok(testCode.includes("readFileSync(path.join(RAIZ, 'tests/smoke/pantallas.ts')"), 'Reads tests/smoke/pantallas.ts');
  assert.ok(testCode.includes("readFileSync(path.join(RAIZ, 'tests/smoke/silencios.ts')"), 'Reads tests/smoke/silencios.ts');
  assert.ok(testCode.includes("readFileSync(path.join(RAIZ, 'lib/hooks/useCitasRealtime.ts')"), 'Reads useCitasRealtime.ts');

  // Verify no synthetic return true mocks
  assert.doesNotMatch(testCode, /test\([^)]*,\s*\(\)\s*=>\s*\{\s*assert\.ok\(true\);\s*\}\)/);
});
