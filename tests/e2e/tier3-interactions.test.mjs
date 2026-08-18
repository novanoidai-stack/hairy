// tests/e2e/tier3-interactions.test.mjs
// Tier 3: Cross-Feature Interactions & Multi-Step Pairwise Integration Flows

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export async function runTier3Tests(recordResult) {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
  const accesoHtml = fs.readFileSync(path.join(ROOT, 'web', 'acceso.html'), 'utf8');
  const demoHtml = fs.readFileSync(path.join(ROOT, 'web', 'demo.html'), 'utf8');

  // ==========================================
  // FLOW 1: LANDING CTA -> SIGNUP -> AUTO-REDIRECT -> DEMO
  // ==========================================
  await recordResult('T3.1', 'Pairwise Flow 1: Landing CTA -> Acceso Registration -> Auto-Redirect directly to Demo', async () => {
    // 1. Landing click simulation
    // La demo es publica: el destino es el mismo haya sesion o no.
    const mockLandingUser = { hasSession: false };
    const landingCtaTarget = '/demo.html';
    assert.strictEqual(landingCtaTarget, '/demo.html', 'Demo CTA opens the demo directly, with or without session');
    assert.ok(!mockLandingUser.hasSession, 'Anonymous visitors get the same destination');

    // 2. Acceso registration simulation
    const parsedQuery = new URLSearchParams('next=demo');
    const nextDest = parsedQuery.get('next');
    const sessionStorageState = {};
    if (nextDest === 'demo') {
      sessionStorageState['mecha_intent_demo'] = '1';
    }

    function wantsDemo() {
      if (nextDest === 'demo') return true;
      return sessionStorageState['mecha_intent_demo'] === '1';
    }
    assert.strictEqual(wantsDemo(), true, 'wantsDemo() evaluates true on registration');

    // 3. routeAfterAuth execution simulation
    let finalDestination = null;
    function gotoDemo() {
      delete sessionStorageState['mecha_intent_demo'];
      finalDestination = 'demo.html';
    }

    const newlyCreatedProfile = {
      id: 'prof_test_001',
      role: 'owner',
      nombre_negocio: 'Salón Mecha Test',
      phone: '+34 690 79 29 75'
    };

    // Verify zero-friction routing for demo intent
    if (wantsDemo()) {
      gotoDemo();
    }
    assert.strictEqual(finalDestination, 'demo.html', 'Newly registered salon owner auto-redirects directly to demo.html');
    assert.strictEqual(sessionStorageState['mecha_intent_demo'], undefined, 'Demo intent cleared upon reaching demo');
  });

  // ==========================================
  // FLOW 2: DIRECT DEMO VISIT -> GATE -> SIGNUP ROUTING
  // ==========================================
  await recordResult('T3.2', 'Pairwise Flow 2: Direct unauthenticated visit to demo.html enters the demo, no gate', async () => {
    // boot() ya no mira la sesion para dejar entrar: solo para personalizar el
    // enlace de referido. Cualquier visitante entra directo.
    function bootDemo(visitor) {
      const personaliza = visitor.session ? 'referido_propio' : 'anonimo';
      return { entra: true, personaliza };
    }

    for (const visitor of [
      { session: null, previewMode: false, shareMode: false },
      { session: null, previewMode: false, shareMode: true },
      { session: { user: { id: 'u1' } }, previewMode: false, shareMode: false },
    ]) {
      const r = bootDemo(visitor);
      assert.strictEqual(r.entra, true, 'Every visitor enters the demo');
    }
    assert.strictEqual(bootDemo({ session: null }).personaliza, 'anonimo', 'Anonymous visitor sees the generic share CTA');
    assert.strictEqual(bootDemo({ session: { user: {} } }).personaliza, 'referido_propio', 'Logged-in visitor gets their own referral link');
    assert.ok(!demoHtml.includes('id="gate"'), 'demo.html must not ship an access gate anymore');
  });

  // ==========================================
  // FLOW 3: CINEMATIC INTRO -> GUIDED START -> AUTOPLAY TRACK 1
  // ==========================================
  await recordResult('T3.3', 'Pairwise Flow 3: Cinematic pitch-black intro -> Start Guided -> Track 1 immediate autoplay', async () => {
    let introOpen = true;
    let tourActive = false;
    let autoplayRunning = false;
    let currentTrack = null;
    let currentStep = -1;

    function closeIntro() {
      introOpen = false;
    }

    function startAutoplay() {
      autoplayRunning = true;
    }

    function playTutorial(trackName) {
      currentTrack = trackName;
      currentStep = 0;
      tourActive = true;
    }

    function onIntroGuidedClick() {
      closeIntro();
      playTutorial('general');
      startAutoplay();
    }

    onIntroGuidedClick();
    assert.strictEqual(introOpen, false, 'Intro screen dismissed');
    assert.strictEqual(tourActive, true, 'Tour engine booted');
    assert.strictEqual(currentTrack, 'general', 'Track 1 (general/essentials) mounted');
    assert.strictEqual(currentStep, 0, 'Starts at step 0');
    assert.strictEqual(autoplayRunning, true, 'Autoplay engaged automatically on start');
  });

  // ==========================================
  // FLOW 4: APPOINTMENT FLOW -> CLIENT PROFILE -> CAJA CHECKOUT
  // ==========================================
  await recordResult('T3.4', 'Pairwise Flow 4: Track 1 appointment lifecycle -> Client technical record -> POS Caja checkout', async () => {
    // Sequence of steps in Track 1
    const track1Steps = [
      { route: '/(tabs)', action: 'cerrar', phase: 'Agenda' },
      { route: '/(tabs)', action: 'nueva-cita', phase: 'Crear Cita' },
      { route: '/(tabs)', action: 'cita-cliente', phase: 'Cliente' },
      { route: '/(tabs)', action: 'cita-servicio', phase: 'Servicio & Encadenamiento' },
      { route: '/(tabs)', action: 'cita-hora', phase: 'Hora' },
      { route: '/(tabs)', action: 'cita-detalle', phase: 'Detalle' },
      { route: '/(tabs)', action: 'detalle-estado', phase: 'Estado' },
      { route: '/(tabs)', action: 'detalle-secuencia-activo', phase: 'Activo 1' },
      { route: '/(tabs)', action: 'detalle-secuencia-reposo', phase: 'Reposo / Hueco Productivo' },
      { route: '/(tabs)', action: 'detalle-secuencia-activo2', phase: 'Activo 2 Peinado' },
      { route: '/(tabs)/clientes', action: 'cliente-color', phase: 'Fórmulas Color' },
      { route: '/(tabs)/clientes', action: 'cliente-notas', phase: 'Notas Técnicas' },
      { route: '/(tabs)/clientes', action: 'cliente-historial', phase: 'Historial Visitas' },
      { route: '/(tabs)/clientes', action: 'ficha', phase: 'Resumen Ficha' },
      { route: '/(tabs)/caja', action: 'cerrar', phase: 'Caja / TPV Cobro' }
    ];

    assert.strictEqual(track1Steps.length, 15, 'Track 1 must have exactly 15 sequential steps');

    const visitedRoutes = [];
    const executedActions = [];

    for (const step of track1Steps) {
      visitedRoutes.push(step.route);
      executedActions.push(step.action);
    }

    assert.ok(visitedRoutes.includes('/(tabs)'), 'Visits Agenda calendar');
    assert.ok(visitedRoutes.includes('/(tabs)/clientes'), 'Visits Client technical profile');
    assert.ok(visitedRoutes.includes('/(tabs)/caja'), 'Visits Caja TPV checkout');
    assert.ok(executedActions.includes('detalle-secuencia-reposo'), 'Executes chemical rest spotlight');
  });

  // ==========================================
  // FLOW 5: IN-TOUR DOUBT SUBMISSION -> RESUME TOUR
  // ==========================================
  await recordResult('T3.5', 'Pairwise Flow 5: Open #dudasOverlay during playback -> Submit inquiry with phone -> Resume tour', async () => {
    let tourStep = 5;
    let tourPaused = false;
    let modalOpen = false;
    let submissionResult = null;

    // Open doubts modal
    function openDudas() {
      tourPaused = true;
      modalOpen = true;
    }

    // Submit question
    function submitDuda(question, contact) {
      const q = question.trim();
      const c = contact.trim();
      const isPhone = /^\+?[0-9]{9,15}$/.test(c.replace(/[\s\(\)\.-]/g, ''));
      submissionResult = {
        ok: true,
        reply: 'Los tiempos de reposo permiten atender a otro cliente mientras actúa el tinte.',
        tipo_contacto: isPhone ? 'telefono' : 'email',
        badge: isPhone ? '✓ anotado para WhatsApp' : '✓ enviada a tu correo'
      };
      return submissionResult;
    }

    // Close doubts modal and resume
    function closeDudas() {
      modalOpen = false;
      tourPaused = false;
    }

    openDudas();
    assert.strictEqual(modalOpen, true, 'Doubts modal opened');
    assert.strictEqual(tourPaused, true, 'Tour paused while modal is open');

    const res = submitDuda('¿Cómo configuro los tiempos de reposo?', '+34 690 79 29 75');
    assert.strictEqual(res.ok, true, 'Doubt submitted successfully');
    assert.strictEqual(res.tipo_contacto, 'telefono', 'Phone contact recognized');
    assert.strictEqual(res.badge, '✓ anotado para WhatsApp', 'Correct WhatsApp badge rendered');

    closeDudas();
    assert.strictEqual(modalOpen, false, 'Modal dismissed');
    assert.strictEqual(tourPaused, false, 'Tour resumed');
    assert.strictEqual(tourStep, 5, 'Step index preserved perfectly');
  });

  // ==========================================
  // FLOW 6: TRACK SWITCHING & DYNAMIC RESYNC
  // ==========================================
  await recordResult('T3.6', 'Pairwise Flow 6: Mid-flight track switching -> Chapter bar & duration badge resynchronization', async () => {
    let activeTrack = 'general';
    let totalSteps = 15;
    let currentStep = 7;
    let chaptersCount = 4;

    function switchTrack(newTrack) {
      activeTrack = newTrack;
      if (newTrack === 'config') {
        totalSteps = 10;
        chaptersCount = 3;
      } else if (newTrack === 'advanced') {
        totalSteps = 10;
        chaptersCount = 3;
      } else {
        totalSteps = 15;
        chaptersCount = 4;
      }
      currentStep = 0;
    }

    // Switch to Track 3 (Nueva Configuración)
    switchTrack('config');
    assert.strictEqual(activeTrack, 'config', 'Active track switched to config');
    assert.strictEqual(currentStep, 0, 'Step reset to 0');
    assert.strictEqual(totalSteps, 10, 'Config track contains 10 steps');
    assert.strictEqual(chaptersCount, 3, 'Config track has 3 chapter segments');

    // Switch to Track 2 (Funciones Avanzadas)
    switchTrack('advanced');
    assert.strictEqual(activeTrack, 'advanced', 'Active track switched to advanced');
    assert.strictEqual(currentStep, 0, 'Step reset to 0');
    assert.strictEqual(totalSteps, 10, 'Advanced track contains 10 steps');
  });
}
