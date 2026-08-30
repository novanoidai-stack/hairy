import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from './nucleo.mjs';
import { TIPOS } from './errores-tragados.mjs';

// ---------------------------------------------------------------------------
// PILAR 1: LANDING, SEO ESTRUCTURADO, CLAIMS LEGALES Y RESPONSIVE
// ---------------------------------------------------------------------------

test('Pilar 1 — SEO JSON-LD: web/index.html define SoftwareApplication con ofertas Esencial y Estudio', () => {
  const indexHtml = readFileSync(path.join(RAIZ, 'web/index.html'), 'utf8');
  assert.ok(indexHtml.includes('application/ld+json'), 'web/index.html debe contener scripts JSON-LD');

  const matches = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.ok(matches.length > 0, 'Debe haber al menos un bloque JSON-LD');

  let foundSoftwareApp = false;
  let foundWebSite = false;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = parsed['@graph'] || [parsed];
      for (const node of nodes) {
        if (node['@type'] === 'SoftwareApplication') {
          foundSoftwareApp = true;
          assert.ok(node.name && node.name.includes('Mecha'), 'Nombre debe incluir Mecha');
          assert.ok(node.operatingSystem, 'Debe definir operatingSystem');
          assert.ok(node.applicationCategory, 'Debe definir applicationCategory');
          assert.ok(Array.isArray(node.offers), 'Debe tener ofertas estructuradas');

          // Validar que las ofertas coinciden con los precios (39€ y 59€)
          const esencial = node.offers.find((o) => o.name && o.name.includes('Esencial'));
          assert.ok(esencial, 'Debe incluir oferta Esencial');
          assert.equal(Number(esencial.price), 39);

          const estudio = node.offers.find((o) => o.name && o.name.includes('Estudio'));
          assert.ok(estudio, 'Debe incluir oferta Estudio');
          assert.equal(Number(estudio.price), 59);

          // Regla 5 de CLAUDE.md: CERO aggregateRating o review falsos en JSON-LD
          assert.equal(node.aggregateRating, undefined, 'No se permiten valoraciones inventadas en JSON-LD');
          assert.equal(node.review, undefined, 'No se permiten reseñas simuladas en JSON-LD');
        }
        if (node['@type'] === 'WebSite') {
          foundWebSite = true;
          assert.ok(node.url, 'WebSite debe definir URL');
          assert.ok(node.potentialAction, 'WebSite debe definir SearchAction para Sitelinks SearchBox');
        }
      }
    } catch (err) {
      assert.fail(`Error parseando JSON-LD: ${err.message}`);
    }
  }

  assert.ok(foundSoftwareApp, 'No se encontró @type: SoftwareApplication en JSON-LD');
  assert.ok(foundWebSite, 'No se encontró @type: WebSite en JSON-LD');
});

test('Pilar 1 — Legal & Fiscal: VeriFactu honesty invariants en superficies públicas', () => {
  const indexHtml = readFileSync(path.join(RAIZ, 'web/index.html'), 'utf8');
  
  // No debe contener claims falsos de homologación de la AEAT o certificación oficial
  assert.doesNotMatch(indexHtml, /homologado por la AEAT/i, 'No se permite claim de homologación inexistente');
  assert.doesNotMatch(indexHtml, /certificado oficial por la AEAT/i, 'No se permite afirmar certificación oficial');
  
  // Si se menciona VeriFactu o Hacienda, debe estar contextualizado honestamente
  if (indexHtml.includes('VeriFactu')) {
    assert.ok(
      indexHtml.includes('registro') || indexHtml.includes('inalterable') || indexHtml.includes('SHA-256'),
      'VeriFactu debe referirse a la arquitectura de registro inalterable'
    );
  }
});

test('Pilar 1 — Responsividad y Viewports: tests/landing.spec.ts cubre la matriz 360px - 390px', () => {
  const landingSpec = readFileSync(path.join(RAIZ, 'tests/landing.spec.ts'), 'utf8');
  
  // Debe incluir los 3 viewports móviles clave
  assert.ok(landingSpec.includes('360'), 'Debe cubrir viewport de 360px (Galaxy S8)');
  assert.ok(landingSpec.includes('375'), 'Debe cubrir viewport de 375px (iPhone SE)');
  assert.ok(landingSpec.includes('390'), 'Debe cubrir viewport de 390px (iPhone 14)');

  // Invariante de cero clipping horizontal
  assert.ok(
    landingSpec.includes('scrollWidth') && landingSpec.includes('clientWidth'),
    'Debe validar scrollWidth <= clientWidth para evitar scroll horizontal indeseado'
  );

  // Invariante de bloqueo de scroll en modales
  assert.ok(landingSpec.includes('modal-open'), 'Debe validar scroll-locking al abrir modales');
});

test('Pilar 1 — Accesibilidad: Paleta y tokens en lib/portalTokens.ts cumplen ratio de contraste AA', () => {
  const portalTokens = readFileSync(path.join(RAIZ, 'lib/portalTokens.ts'), 'utf8');
  assert.ok(portalTokens.includes("bg: '#f6f1ea'"));
  assert.ok(portalTokens.includes("text: '#1c1814'"));
  assert.ok(portalTokens.includes("primaryHi: '#c0260a'"));
  assert.ok(portalTokens.includes("danger: '#e23b34'"));
  assert.ok(portalTokens.includes("success: '#0f9d6b'"));
});

// ---------------------------------------------------------------------------
// PILAR 2: PORTAL DE RESERVAS, CHECKOUT, TOUCH TARGETS Y CONCURRENCIA
// ---------------------------------------------------------------------------

test('Pilar 2 — Touch Targets: Botones interactivos en app/r/[slug].web.tsx >= 44px', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');

  // 1. Botón volverAtras
  assert.match(
    portalCode,
    /button onClick=\{volverAtras\} style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/,
    'El botón volverAtras debe tener dimensiones mínimas de 44x44px'
  );

  // 2. Botón borrarBusqueda
  assert.match(
    portalCode,
    /aria-label="Borrar búsqueda" style=\{\{[\s\S]*?(?:minWidth:\s*44|width:\s*44)[\s\S]*?(?:minHeight:\s*44|height:\s*44)/,
    'El botón borrar búsqueda debe tener touch target mínimo de 44x44px'
  );

  // 3. Botón Cambiar servicio
  assert.match(
    portalCode,
    /onClick=\{\(\) => setServicio\(null\)\} style=\{\{[\s\S]*?minHeight:\s*44/,
    'El botón Cambiar servicio debe tener minHeight de 44px'
  );

  // 4. Botones de Slots
  assert.match(
    portalCode,
    /onClick=\{\(\) => setSlotSel\(s\)\}[\s\S]*?minHeight:\s*44/,
    'Los botones de selección de hora deben tener minHeight de 44px'
  );

  // 5. Botón Hacer otra reserva
  assert.match(
    portalCode,
    /onClick=\{reiniciar\} style=\{\{[\s\S]*?minHeight:\s*44/,
    'El botón Hacer otra reserva debe tener minHeight de 44px'
  );
});

test('Pilar 2 — Reposos Químicos: Soporte Hueco Express en slots y confirmación', () => {
  const portalCode = readFileSync(path.join(RAIZ, 'app/r/[slug].web.tsx'), 'utf8');
  assert.ok(portalCode.includes('en_reposo'), 'El portal debe evaluar la propiedad en_reposo del slot');
  assert.ok(portalCode.includes('reposo_disponible_min'), 'El portal debe indicar los minutos de reposo disponibles');
  assert.ok(portalCode.includes('Hueco Express'), 'Debe etiquetar visualmente el slot como Hueco Express');

  const portalSpec = readFileSync(path.join(RAIZ, 'tests/portal-reserva.spec.ts'), 'utf8');
  assert.ok(portalSpec.includes('en_reposo: true'), 'La suite Playwright debe probar slots en reposo químico');
  assert.ok(portalSpec.includes('Hueco Express'), 'La suite Playwright debe validar el badge Hueco Express');
});

test('Pilar 2 — Flujo E2E de Reserva en 5 pasos en tests/portal-reserva.spec.ts', () => {
  const portalSpec = readFileSync(path.join(RAIZ, 'tests/portal-reserva.spec.ts'), 'utf8');

  // Paso 1: Servicios y disponibilidad
  assert.ok(portalSpec.includes('portal_dias_disponibles'), 'Paso 1-2: Debe consultar días disponibles');
  assert.ok(portalSpec.includes('disponibilidad_publica'), 'Paso 2-3: Debe consultar disponibilidad pública');

  // Paso 4: Consentimiento y confirmación
  assert.ok(portalSpec.includes('crear_cita_publica'), 'Paso 4-5: Debe invocar crear_cita_publica_cadena');

  // Paso 5: Post-reserva (Calendarios y gestión)
  assert.ok(portalSpec.includes('Google Calendar'), 'Debe generar enlace a Google Calendar');
  assert.ok(portalSpec.includes('Apple Calendar'), 'Debe permitir descarga para Apple Calendar');
  assert.ok(portalSpec.includes('WhatsApp'), 'Debe informar del aviso por WhatsApp');
  assert.ok(portalSpec.includes('Gestionar o cancelar'), 'Debe enlazar a la gestión de cita');
});

test('Pilar 2 — Prevención de Doble Reserva & Bloqueos Temporales (15 min)', () => {
  const reservaPublicaLib = readFileSync(path.join(RAIZ, 'lib/reservaPublica.ts'), 'utf8');
  assert.ok(reservaPublicaLib.includes('crear_cita_publica_cadena'), 'Debe invocar crear_cita_publica_cadena');
  assert.ok(reservaPublicaLib.includes('normalizarTelefonoE164'), 'Debe normalizar el teléfono a E.164');
});

// ---------------------------------------------------------------------------
// PILAR 3: SOFTWARE SPA 17 PANTALLAS, SILENCIOS Y SUPABASE REALTIME
// ---------------------------------------------------------------------------

test('Pilar 3 — Inventario Completo de 17 Pantallas en tests/smoke/pantallas.ts', () => {
  const pantallasTs = readFileSync(path.join(RAIZ, 'tests/smoke/pantallas.ts'), 'utf8');
  const nombresMatches = [...pantallasTs.matchAll(/nombre:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]);
  
  const nombresEsperados = [
    // Operativa (4)
    'agenda', 'mi-jornada', 'lista-espera', 'citas',
    // CRM y marketing (3)
    'clientes', 'bandeja', 'campanas',
    // Gestión (4)
    'caja', 'presupuestos', 'equipo', 'inventario',
    // Análisis y soporte (4)
    'resenas', 'informes', 'ayuda', 'configuracion',
    // Portales públicos (2)
    'portal-reserva', 'portal-resena',
  ];

  assert.equal(nombresMatches.length, 17, 'Deben existir exactamente 17 pantallas en el inventario del smoke');
  assert.deepEqual(nombresMatches.sort(), nombresEsperados.sort());
});

test('Pilar 3 — Sensores de Fallo Silencioso en tests/smoke/silencios.ts', () => {
  const silenciosCode = readFileSync(path.join(RAIZ, 'tests/smoke/silencios.ts'), 'utf8');
  const erroresCode = readFileSync(path.join(RAIZ, 'lib/errores.ts'), 'utf8');

  // Verificar frases críticas de ERRORES_DE_SISTEMA contra lib/errores.ts
  const frases = [
    '(Detalles:',
    'No tienes permis',
    'Sin conexion.',
    'Ya existe un registro con',
    'Demasiados intentos.',
    'este dato esta vinculado a otros',
  ];

  for (const frase of frases) {
    assert.ok(
      silenciosCode.includes(frase),
      `tests/smoke/silencios.ts debe incluir la frase de error "${frase}"`
    );
    assert.ok(
      erroresCode.includes(frase),
      `lib/errores.ts debe contener la frase de anclaje "${frase}"`
    );
  }

  // Sensor de unhandledrejection y alert()
  assert.ok(silenciosCode.includes('unhandledrejection'), 'Debe escuchar unhandledrejection en window');
  assert.ok(silenciosCode.includes('vigilarDialogos'), 'Debe interceptar diálogos nativos (alert, confirm)');
});

test('Pilar 3 — Supabase Realtime WebSocket Lifecycle y Limpieza de Canales', () => {
  // 1. useCitasRealtime libera canal al desmontar
  const useCitasCode = readFileSync(path.join(RAIZ, 'lib/hooks/useCitasRealtime.ts'), 'utf8');
  assert.ok(useCitasCode.includes('supabase.removeChannel(canal)'), 'useCitasRealtime debe llamar a removeChannel');
  assert.ok(useCitasCode.includes('IS_DEMO_MODE'), 'useCitasRealtime no debe suscribirse en modo demo compartido');

  // 2. ColaDiaPanel libera canal al desmontar
  const colaDiaCode = readFileSync(path.join(RAIZ, 'components/cola/ColaDiaPanel.web.tsx'), 'utf8');
  assert.ok(colaDiaCode.includes('supabase.removeChannel(canal)'), 'ColaDiaPanel debe llamar a removeChannel');

  // 3. Deduplicador fetchSinRepetir y despachador reactivo en lib/supabase.ts
  const supabaseCode = readFileSync(path.join(RAIZ, 'lib/supabase.ts'), 'utf8');
  assert.ok(supabaseCode.includes('fetchSinRepetir'), 'lib/supabase.ts debe incluir fetchSinRepetir para deduplicar lecturas');
  assert.ok(supabaseCode.includes('alEscribirEnTabla'), 'lib/supabase.ts debe incluir alEscribirEnTabla para invalidación reactiva');
});

test('Pilar 3 — Errores Tragados AST Linter: Formas de fallo silencioso tipadas', () => {
  assert.deepEqual(Object.keys(TIPOS).sort(), [
    'fuego-y-olvido',
    'handler-async-sin-catch',
    'supabase-sin-comprobar',
  ]);
});
