/* Mecha - consentimiento de cookies (RGPD / LSSI / guía AEPD).
   Principios que cumple:
   - Consentimiento PREVIO: ninguna cookie no necesaria (Google Analytics) se carga hasta que el usuario acepta.
   - Rechazar es tan fácil como aceptar (dos botones equivalentes).
   - Granularidad real mediante switches personalizados.
   - Revocable mediante FAB (icono de escudo flotante interactivo) o API pública.
   - Almacenamiento local por 12 meses. */
(function () {
  var STORAGE_KEY = 'mecha_cookie_consent';
  var VERSION = 1;
  var REASK_DAYS = 365;
  var GA_ID = window.MECHA_GA_ID || null;

  function now() { return Date.now(); }

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || c.v !== VERSION || typeof c.ts !== 'number') return null;
      if ((now() - c.ts) > REASK_DAYS * 24 * 60 * 60 * 1000) return null;
      return c;
    } catch (e) { return null; }
  }

  function saveConsent(analytics) {
    var c = { v: VERSION, ts: now(), analytics: !!analytics };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  /* ---------- Google Analytics (solo si hay consentimiento) ---------- */
  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded || !GA_ID) return;
    gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function applyConsent(c) {
    if (c && c.analytics) loadGA();
  }

  /* ---------- Estilos del banner (inyectados) ---------- */
  function injectStyles() {
    if (document.getElementById('mecha-cookies-style')) return;
    var css = ''
      + '@keyframes mckSlideUpCenter { from { opacity: 0; transform: translate(-50%, 30px) scale(0.98); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }'
      + '@keyframes mckFadeIn { from { opacity: 0; } to { opacity: 1; } }'
      + '@keyframes mckScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }'
      + '@keyframes mckEmberGlow { 0%, 100% { box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 12px rgba(244, 80, 30, 0.2), inset 0 1px 0 rgba(255,255,255,0.03); } 50% { box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 26px rgba(244, 80, 30, 0.45), inset 0 1px 0 rgba(255,255,255,0.05); } }'
      + '.mck-bar-wrap { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 30px) scale(0.98); width: calc(100% - 48px); max-width: 900px; z-index: 9000; display: none; animation: mckSlideUpCenter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }'
      + '.mck-bar { background: linear-gradient(rgba(12, 17, 34, 0.96), rgba(12, 17, 34, 0.96)) padding-box, linear-gradient(135deg, #e0340e, #ff7a2e, #ffcf4a) border-box; -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); border: 1.5px solid transparent; border-radius: 32px 12px 28px 16px / 16px 28px 12px 32px; padding: 16px 28px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 24px; animation: mckEmberGlow 4s ease-in-out infinite; }'
      + '.mck-txt { font-size: 13.5px; line-height: 1.5; color: #9aa6c2; font-family: sans-serif; flex: 1; text-align: left; }'
      + '.mck-txt b { color: #fff; font-weight: 700; }'
      + '.mck-txt a { color: #ff8a3d; text-decoration: underline; text-underline-offset: 3px; font-weight: 600; transition: color 0.2s; }'
      + '.mck-txt a:hover { color: #ffce4a; }'
      + '.mck-acts { display: flex; flex-direction: row; align-items: center; gap: 14px; flex-shrink: 0; }'
      + '.mck-btn { font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s ease; text-align: center; font-family: sans-serif; white-space: nowrap; }'
      + '.mck-btn-reject { background: rgba(255, 255, 255, 0.04); border-color: rgba(148, 163, 184, 0.15); color: #f6f8ff; }'
      + '.mck-btn-reject:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(244, 80, 30, 0.4); transform: translateY(-1px); }'
      + '.mck-btn-accept { background: linear-gradient(120deg, #f4501e, #ff8a3d); color: #fff; box-shadow: 0 4px 15px rgba(244, 80, 30, 0.3); }'
      + '.mck-btn-accept:hover { transform: translateY(-1px); filter: brightness(1.08); box-shadow: 0 6px 20px rgba(244, 80, 30, 0.45); }'
      + '.mck-link { font-size: 13px; font-weight: 600; color: #8a9ab8; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; transition: color 0.2s; background: none; border: none; padding: 4px 0; font-family: sans-serif; white-space: nowrap; }'
      + '.mck-link:hover { color: #fff; }'
      + '.mck-overlay { position: fixed; inset: 0; z-index: 9500; background: rgba(7, 10, 20, 0.85); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: none; place-items: center; padding: 24px; animation: mckFadeIn 0.3s ease; }'
      + '.mck-overlay.show { display: grid; }'
      + '.mck-modal { width: 100%; max-width: 440px; background: linear-gradient(#101729, #101729) padding-box, linear-gradient(135deg, #e0340e, #ff7a2e, #ffcf4a) border-box; border: 1.5px solid transparent; border-radius: 40px 18px 36px 14px / 20px 36px 18px 40px; padding: 30px; position: relative; overflow: hidden; animation: mckScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards, mckEmberGlow 4s ease-in-out infinite; font-family: sans-serif; }'
      + '.mck-modal h3 { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 8px; letter-spacing: -0.02em; }'
      + '.mck-modal p { font-size: 13px; color: #9aa6c2; line-height: 1.6; margin-bottom: 24px; }'
      + '.mck-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid rgba(148, 163, 184, 0.08); }'
      + '.mck-row:first-of-type { border-top: none; padding-top: 0; }'
      + '.mck-info { flex: 1; }'
      + '.mck-info .t { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }'
      + '.mck-info .d { font-size: 12px; color: #8a9ab8; line-height: 1.5; }'
      + '.mck-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }'
      + '.mck-switch input { opacity: 0; width: 0; height: 0; }'
      + '.mck-slider { position: absolute; cursor: pointer; inset: 0; background-color: #1e293b; border-radius: 34px; transition: all 0.3s ease; border: 1px solid rgba(148, 163, 184, 0.1); }'
      + '.mck-slider::before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: #fff; border-radius: 50%; transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1); box-shadow: 0 2px 4px rgba(0,0,0,0.3); }'
      + 'input:checked + .mck-slider { background: linear-gradient(135deg, #f4501e, #ff8a3d); border-color: transparent; box-shadow: 0 0 8px rgba(244, 80, 30, 0.6); }'
      + 'input:checked + .mck-slider::before { transform: translateX(20px); }'
      + 'input:disabled + .mck-slider { opacity: 0.6; cursor: not-allowed; background-color: #0f172a; }'
      + '.mck-modal-acts { display: flex; gap: 12px; margin-top: 24px; }'
      + '.mck-modal-acts .mck-btn { flex: 1; }'
      + '.mck-fab { position: fixed; left: 24px; bottom: 24px; z-index: 8000; width: 46px; height: 46px; border-radius: 50%; display: none; place-items: center; cursor: pointer; background: rgba(16, 23, 41, 0.92); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid rgba(244, 80, 30, 0.25); color: #ff8a3d; box-shadow: 0 10px 24px rgba(0,0,0,0.3); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }'
      + '.mck-fab.show { display: grid; }'
      + '.mck-fab:hover { transform: scale(1.08) rotate(15deg); border-color: #ff8a3d; color: #fff; background: #f4501e; box-shadow: 0 12px 28px rgba(244, 80, 30, 0.4); }'
      + '.mck-fab svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }'
      + '@media(max-width:768px){'
      + '  .mck-bar-wrap { left: 12px; bottom: 12px; width: calc(100% - 24px); transform: translate(0, 20px); }'
      + '  .mck-bar { flex-direction: column; align-items: stretch; gap: 16px; padding: 20px; }'
      + '  .mck-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }'
      + '  #mckConfig { grid-column: span 2; text-align: center; margin-top: 4px; }'
      + '  .mck-modal { padding: 24px; }'
      + '  .mck-fab { left: 12px; bottom: 12px; width: 40px; height: 40px; }'
      + '}';
    var style = document.createElement('style');
    style.id = 'mecha-cookies-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- Banner & Modal Elements ---------- */
  var wrapEl = null, overlayEl = null, fabEl = null, analyticsOn = false;

  function buildBar() {
    var wrap = document.createElement('div');
    wrap.className = 'mck-bar-wrap';
    wrap.innerHTML =
      '<div class="mck-bar" role="dialog" aria-live="polite" aria-label="Aviso de cookies">'
      + '  <div class="mck-txt"><b>Cuidamos tu privacidad.</b> Usamos cookies necesarias para el funcionamiento técnico y analítica de Mecha. Más info en la <a href="cookies.html">Política de cookies</a>.</div>'
      + '  <div class="mck-acts">'
      + '    <button type="button" class="mck-link" id="mckConfig">Configurar cookies</button>'
      + '    <button type="button" class="mck-btn mck-btn-reject" id="mckReject">Rechazar</button>'
      + '    <button type="button" class="mck-btn mck-btn-accept" id="mckAccept">Aceptar todas</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#mckAccept').addEventListener('click', function () { decide(true); });
    wrap.querySelector('#mckReject').addEventListener('click', function () { decide(false); });
    wrap.querySelector('#mckConfig').addEventListener('click', openModal);
    return wrap;
  }

  function buildModal() {
    var ov = document.createElement('div');
    ov.className = 'mck-overlay';
    ov.innerHTML =
      '<div class="mck-modal" role="dialog" aria-modal="true" aria-label="Configurar cookies">'
      + '  <h3>Preferencias de cookies</h3>'
      + '  <p>Decide qué cookies permites instalar. Las necesarias no se pueden desactivar ya que son imprescindibles para la funcionalidad técnica básica de la web y la aplicación.</p>'
      + '  <div class="mck-row">'
      + '    <div class="mck-info">'
      + '      <div class="t">Necesarias y de seguridad</div>'
      + '      <div class="d">Persistencia de sesión segura (Supabase auth tokens) y registro de tu consentimiento de privacidad. Siempre activas.</div>'
      + '    </div>'
      + '    <label class="mck-switch" aria-label="Cookies necesarias">'
      + '      <input type="checkbox" checked disabled>'
      + '      <span class="mck-slider"></span>'
      + '    </label>'
      + '  </div>'
      + '  <div class="mck-row">'
      + '    <div class="mck-info">'
      + '      <div class="t">Analíticas (Google Analytics)</div>'
      + '      <div class="d">Recopilación de estadísticas de usabilidad de forma totalmente anónima (IP anonimizada). Ayuda a mejorar la velocidad y herramientas de Mecha.</div>'
      + '    </div>'
      + '    <label class="mck-switch" aria-label="Cookies analíticas">'
      + '      <input type="checkbox" id="mckSwAnalytics">'
      + '      <span class="mck-slider"></span>'
      + '    </label>'
      + '  </div>'
      + '  <div class="mck-modal-acts">'
      + '    <button type="button" class="mck-btn mck-btn-reject" id="mckSave">Guardar selección</button>'
      + '    <button type="button" class="mck-btn mck-btn-accept" id="mckAcceptAll">Aceptar todas</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(ov);
    
    var cb = ov.querySelector('#mckSwAnalytics');
    
    // Sincronizar estado visual inicial con el valor de la variable
    cb.checked = analyticsOn;

    ov.querySelector('#mckSave').addEventListener('click', function () { decide(cb.checked); });
    ov.querySelector('#mckAcceptAll').addEventListener('click', function () { decide(true); });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    return ov;
  }

  function buildFab() {
    var f = document.createElement('button');
    f.type = 'button';
    f.className = 'mck-fab';
    f.setAttribute('aria-label', 'Configuración de privacidad y cookies');
    f.title = 'Configuración de privacidad';
    f.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="1" fill="currentColor"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/></svg>';
    f.addEventListener('click', openModal);
    document.body.appendChild(f);
    return f;
  }

  function showBar() {
    if (!wrapEl) wrapEl = buildBar();
    wrapEl.style.display = 'block';
    if (fabEl) fabEl.classList.remove('show');
  }

  function hideBar() {
    if (wrapEl) wrapEl.style.display = 'none';
    if (fabEl) fabEl.classList.add('show');
  }

  function openModal() {
    if (!overlayEl) overlayEl = buildModal();
    // Asegurar que el checkbox refleje el estado actual
    overlayEl.querySelector('#mckSwAnalytics').checked = analyticsOn;
    overlayEl.classList.add('show');
  }

  function closeModal() {
    if (overlayEl) overlayEl.classList.remove('show');
  }

  function decide(analytics) {
    analyticsOn = !!analytics;
    var c = saveConsent(analyticsOn);
    closeModal();
    hideBar();
    applyConsent(c);
  }

  function init() {
    injectStyles();
    // Paginas de "app a pantalla completa" (p. ej. demo.html) pueden desactivar
    // el FAB flotante con window.MECHA_COOKIES_NO_FAB = true: en movil tapaba
    // la pestana "Agenda" de la tab bar del software embebido. La configuracion
    // de cookies sigue accesible desde la landing y cookies.html (MechaCookies.open).
    if (!fabEl && !window.MECHA_COOKIES_NO_FAB) fabEl = buildFab();
    var c = readConsent();
    if (c) {
      analyticsOn = c.analytics;
      applyConsent(c);
      hideBar();
    } else {
      showBar();
    }
  }

  // API pública de Mecha para las páginas de políticas legales
  window.MechaCookies = {
    open: openModal,
    reset: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      analyticsOn = false;
      showBar();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
