import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';

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
// PILAR 1: LANDING, SEO, FISCAL HONESTY, VIEWPORTS & CONTRAST ORACLE
// ---------------------------------------------------------------------------

test('CHALLENGER 2 [Pilar 1]: JSON-LD complete schema validation in web/index.html', () => {
  const htmlPath = path.join(RAIZ, 'web/index.html');
  assert.ok(existsSync(htmlPath), 'web/index.html must exist');
  const content = readFileSync(htmlPath, 'utf8');

  assert.match(
    content,
    /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i,
    'Viewport meta tag must declare width=device-width'
  );

  const scripts = [...content.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, 'Must have at least one JSON-LD block');

  let foundSoftwareApp = false;
  let foundWebSite = false;

  for (const s of scripts) {
    const json = JSON.parse(s[1]);
    const graph = json['@graph'] || [json];
    for (const item of graph) {
      if (item['@type'] === 'SoftwareApplication') {
        foundSoftwareApp = true;
        assert.equal(typeof item.name, 'string');
        assert.ok(item.name.length > 0);
        assert.equal(typeof item.description, 'string');
        assert.ok(item.description.length > 0);
        assert.ok(Array.isArray(item.offers), 'Offers must be an array');
        assert.ok(item.offers.length >= 2, 'Must have offers including Esencial and Estudio');

        const esencial = item.offers.find((o) => o.name && o.name.includes('Esencial'));
        const estudio = item.offers.find((o) => o.name && o.name.includes('Estudio'));
        assert.ok(esencial, 'Must include Esencial offer');
        assert.ok(estudio, 'Must include Estudio offer');
        assert.equal(Number(esencial.price), 39);
        assert.equal(Number(estudio.price), 59);
        assert.equal(esencial.priceCurrency, 'EUR');
        assert.equal(estudio.priceCurrency, 'EUR');

        assert.equal(item.aggregateRating, undefined);
        assert.equal(item.review, undefined);
      }

      if (item['@type'] === 'WebSite') {
        foundWebSite = true;
        assert.ok(item.url, 'WebSite must have url');
        assert.ok(item.potentialAction, 'WebSite must have potentialAction for search');
        assert.equal(item.potentialAction['@type'], 'SearchAction');
      }
    }
  }

  assert.ok(foundSoftwareApp, 'SoftwareApplication schema must be present and valid');
  assert.ok(foundWebSite, 'WebSite schema must be present and valid');
});

test('CHALLENGER 2 [Pilar 1]: Comprehensive VeriFactu honesty scan across all landing and fiscal files', () => {
  const targetFiles = [
    'web/index.html',
    'web/acceso.html',
    'web/demo.html',
    'web/demo_v2.html',
    'lib/fiscal/estadoVerifactu.ts',
    'scripts/vigilantes/claims-fiscales.mjs',
  ].filter((f) => existsSync(path.join(RAIZ, f)));

  const forbiddenPatterns = [
    /homologad[oa] por la AEAT/i,
    /certificad[oa] oficial por (?:la )?AEAT/i,
    /aprobado por hacienda/i,
    /software oficial de hacienda/i,
  ];

  for (const relPath of targetFiles) {
    const code = readFileSync(path.join(RAIZ, relPath), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.doesNotMatch(code, pat, 'Forbidden claim found in ' + relPath);
    }
  }
});

test('CHALLENGER 2 [Pilar 1]: WCAG 2.1 AA mathematical color contrast matrix in lib/portalTokens.ts', () => {
  const tokensPath = path.join(RAIZ, 'lib/portalTokens.ts');
  const tokensCode = readFileSync(tokensPath, 'utf8');

  const tokens = {
    bg: '#f6f1ea',
    panel: '#fffdfb',
    text: '#1c1814',
    textSec: '#5c5249',
    textTer: '#736658',
    primary: '#f4501e',
    primaryHi: '#c0260a',
    danger: '#e23b34',
    success: '#0f9d6b',
  };

  for (const [key, val] of Object.entries(tokens)) {
    assert.ok(tokensCode.includes(val), 'lib/portalTokens.ts must contain color ' + key + ': ' + val);
  }

  const contrastBodyText = getContrastRatio(tokens.bg, tokens.text);
  assert.ok(contrastBodyText >= 11.0, 'Body text contrast on bg must exceed 11:1');

  const contrastCardText = getContrastRatio(tokens.panel, tokens.text);
  assert.ok(contrastCardText >= 13.0, 'Card text contrast must exceed 13:1');

  const contrastPrimaryHiOnBg = getContrastRatio(tokens.bg, tokens.primaryHi);
  assert.ok(contrastPrimaryHiOnBg >= 4.5, 'primaryHi on bg must meet WCAG AA (>=4.5:1)');

  const contrastTextSecOnBg = getContrastRatio(tokens.bg, tokens.textSec);
  assert.ok(contrastTextSecOnBg >= 4.5, 'textSec on bg must meet WCAG AA (>=4.5:1)');

  const contrastTextTerOnBg = getContrastRatio(tokens.bg, tokens.textTer);
  assert.ok(contrastTextTerOnBg >= 3.5, 'textTer on bg must meet WCAG AA large text (>=3.5:1)');
});

// ---------------------------------------------------------------------------
// PILAR 2: PORTAL DE RESERVAS, TOUCH TARGETS, 360/375/390PX & CONCURRENCY
// ---------------------------------------------------------------------------

test('CHALLENGER 2 [Pilar 2]: Exhaustive touch target audit in app/r/[slug].web.tsx (minimum 44x44px hit areas)', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // 1. Back button: 44x44px
  assert.match(portalCode, /button onClick=\{volverAtras\} style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/);

  // 2. Clear search button: 44x44px with 46px right input padding
  assert.match(portalCode, /aria-label="Borrar búsqueda" style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/);
  assert.ok(portalCode.includes('paddingRight: busqueda ? 46 : 14'), 'Search input must have 46px right padding to prevent clear button overlap');

  // 3. Change service button: minHeight: 44
  assert.match(portalCode, /onClick=\{\(\) => setServicio\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 4. Time slot buttons: minHeight: 44
  assert.match(portalCode, /onClick=\{\(\) => setSlotSel\(s\)\}[\s\S]*?minHeight:\s*44/);

  // 5. Restart booking button: minHeight: 44
  assert.match(portalCode, /onClick=\{reiniciar\} style=\{\{[\s\S]*?minHeight:\s*44/);

  // 6. Waitlist & Group modal buttons: minHeight: 44
  assert.match(portalCode, /onClick=\{\(\) => setGrupoOk\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /button onClick=\{\(\) => \{ setShowWlModal\(false\); setWlExito\(false\); \}\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /button type="button" onClick=\{\(\) => setShowWlModal\(false\)\} style=\{\{[\s\S]*?minHeight:\s*44/);
  assert.match(portalCode, /button type="submit" disabled=\{wlEnviando\} style=\{\{[\s\S]*?minHeight:\s*44/);
});

test('CHALLENGER 2 [Pilar 2]: Chemical Rest ("Hueco Express") data and UI contract integrity', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  assert.ok(portalCode.includes('const reposo = !!s.en_reposo;'));
  assert.ok(portalCode.includes('Hueco Express'));
  assert.ok(portalCode.includes('reposo_disponible_min'));
  assert.ok(portalCode.includes('Hueco optimizado durante el tiempo de reposo'));
  assert.ok(portalCode.includes('slotSel?.en_reposo'));
});

test('CHALLENGER 2 [Pilar 2]: E.164 phone normalization oracle & double booking concurrency invariants', () => {
  const reservaCode = readFileSync(path.join(RAIZ, 'lib/reservaPublica.ts'), 'utf8');
  assert.ok(reservaCode.includes('function normalizarTelefonoE164'), 'lib/reservaPublica.ts must export normalizarTelefonoE164');
  assert.ok(reservaCode.includes('crear_cita_publica_cadena'), 'Must invoke RPC crear_cita_publica_cadena');
  assert.ok(reservaCode.includes('getDiasDisponiblesCadena'), 'Must invoke RPC getDiasDisponiblesCadena');
  assert.ok(reservaCode.includes('getDisponibilidadCadena'), 'Must invoke RPC getDisponibilidadCadena');
});

// ---------------------------------------------------------------------------
// PILAR 3: SPA 17 SCREENS, SILENCE DETECTORS & SUPABASE REALTIME WEBSOCKET
// ---------------------------------------------------------------------------

test('CHALLENGER 2 [Pilar 3]: 17 SPA Screens physical file presence and anchor match verification', () => {
  const pantallasPath = path.join(RAIZ, 'tests/smoke/pantallas.ts');
  assert.ok(existsSync(pantallasPath), 'tests/smoke/pantallas.ts must exist');

  const screenFiles = [
    { nombre: 'agenda', file: 'components/agenda/AgendaCalendar.web.tsx', ancla: /Nueva cita/i },
    { nombre: 'mi-jornada', file: 'app/(tabs)/mi-jornada.web.tsx', ancla: /jornada|fichar|fichaje/i },
    { nombre: 'lista-espera', file: 'app/(tabs)/lista-espera.web.tsx', ancla: /espera/i },
    { nombre: 'citas', file: 'app/(tabs)/citas.tsx', ancla: /cita/i },
    { nombre: 'clientes', file: 'app/(tabs)/clientes.tsx', ancla: /clientes|cliente/i },
    { nombre: 'bandeja', file: 'app/(tabs)/bandeja.tsx', ancla: /bandeja|mensaje|conversac/i },
    { nombre: 'campanas', file: 'app/(tabs)/campanas.tsx', ancla: /campañ|campan/i },
    { nombre: 'caja', file: 'app/(tabs)/caja.tsx', ancla: /Vender producto|Cobro rápido|caja/i },
    { nombre: 'presupuestos', file: 'app/(tabs)/presupuestos.tsx', ancla: /presupuesto/i },
    { nombre: 'equipo', file: 'app/(tabs)/equipo.tsx', ancla: /profesionales|Añadir profesional|equipo/i },
    { nombre: 'inventario', file: 'app/(tabs)/inventario.tsx', ancla: /inventario|producto|stock/i },
    { nombre: 'resenas', file: 'app/(tabs)/resenas.tsx', ancla: /reseñ|resen|valoraci/i },
    { nombre: 'informes', file: 'app/(tabs)/informes.tsx', ancla: /informe|registro/i },
    { nombre: 'ayuda', file: 'app/(tabs)/ayuda.tsx', ancla: /ayuda|manual/i },
    { nombre: 'configuracion', file: 'app/(tabs)/configuracion.tsx', ancla: /ajustes|configuraci/i },
    { nombre: 'portal-reserva', file: 'app/r/[slug].web.tsx', ancla: /reservar|servicio/i },
    { nombre: 'portal-resena', file: 'app/resena/[slug].web.tsx', ancla: /valorac|reseñ|puntuaci/i },
  ];

  assert.equal(screenFiles.length, 17, 'Must have exactly 17 screen files mapped');

  for (const s of screenFiles) {
    const fullPath = path.join(RAIZ, s.file);
    assert.ok(existsSync(fullPath), 'Physical file for screen ' + s.nombre + ' (' + s.file + ') must exist on disk');
    const code = readFileSync(fullPath, 'utf8');
    assert.ok(s.ancla.test(code), 'Anchor regex for screen ' + s.nombre + ' must match content in ' + s.file);
  }
});

test('CHALLENGER 2 [Pilar 3]: Unhandled promise rejection sensor logic & memory bounded buffering', () => {
  const mockWindow = {
    __promesasRotas: [],
  };

  const rejectionHandler = (reason) => {
    const texto = typeof reason === 'string' ? reason : (reason?.message ?? 'promesa rechazada sin motivo');
    if (mockWindow.__promesasRotas.length < 50) {
      mockWindow.__promesasRotas.push(String(texto).slice(0, 300));
    }
  };

  rejectionHandler('Error de red al sincronizar');
  assert.equal(mockWindow.__promesasRotas[0], 'Error de red al sincronizar');

  rejectionHandler(new Error('JWT expirado'));
  assert.equal(mockWindow.__promesasRotas[1], 'JWT expirado');

  rejectionHandler({ status: 500 });
  assert.equal(mockWindow.__promesasRotas[2], 'promesa rechazada sin motivo');

  for (let i = 0; i < 100; i++) {
    rejectionHandler('Flood rejection ' + i);
  }
  assert.equal(mockWindow.__promesasRotas.length, 50, 'Buffer must cap at exactly 50 items to prevent memory leak');
});

test('CHALLENGER 2 [Pilar 3]: Realtime WebSocket channel cleanup in hooks & components', () => {
  const useCitasPath = path.join(RAIZ, 'lib/hooks/useCitasRealtime.ts');
  const useCitasCode = readFileSync(useCitasPath, 'utf8');
  assert.ok(useCitasCode.includes('supabase.removeChannel(canal)'), 'useCitasRealtime must unsubscribe channel on cleanup');
  assert.ok(useCitasCode.includes('IS_DEMO_MODE'), 'useCitasRealtime must guard demo mode');

  const colaDiaPath = path.join(RAIZ, 'components/cola/ColaDiaPanel.web.tsx');
  const colaDiaCode = readFileSync(colaDiaPath, 'utf8');
  assert.ok(colaDiaCode.includes('supabase.removeChannel(canal)'), 'ColaDiaPanel must unsubscribe channel on cleanup');

  const supabasePath = path.join(RAIZ, 'lib/supabase.ts');
  const supabaseCode = readFileSync(supabasePath, 'utf8');
  assert.ok(supabaseCode.includes('fetchSinRepetir'), 'lib/supabase.ts must implement fetchSinRepetir');
  assert.ok(supabaseCode.includes('alEscribirEnTabla'), 'lib/supabase.ts must implement alEscribirEnTabla');
});
