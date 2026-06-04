/* Mecha - consentimiento de cookies (RGPD / LSSI / guia AEPD).
   Principios que cumple:
   - Consentimiento PREVIO: ninguna cookie no necesaria (p. ej. Google Analytics)
     se carga hasta que el usuario acepta. Por defecto, denegado.
   - Rechazar es tan facil como aceptar (dos botones equivalentes) + configurar.
   - Granular: necesarias (siempre) y analiticas (opt-in, sin marcar por defecto).
   - Revocable: se puede reabrir el panel y cambiar la decision cuando se quiera.
   - Se vuelve a preguntar pasados ~12 meses.

   Uso: incluir este script en todas las paginas publicas.
   Para activar Google Analytics, define el ID antes de cargar el script:
     <script>window.MECHA_GA_ID = 'G-XXXXXXXXXX';</script>
   Si no hay ID, el bloque de analiticas simplemente no carga nada (sin romper). */
(function () {
  var STORAGE_KEY = 'mecha_cookie_consent';
  var VERSION = 1;
  var REASK_DAYS = 365; // volver a preguntar pasado ~1 ano
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
    // IP anonimizada por defecto en GA4. Sin cookies de publicidad.
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function applyConsent(c) {
    if (c && c.analytics) loadGA();
  }

  /* ---------- estilos del banner (inyectados, usan los tokens de mecha.css) ---------- */
  function injectStyles() {
    if (document.getElementById('mecha-cookies-style')) return;
    var css = ''
      + '.mck-bar{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:flex;gap:16px;align-items:center;'
      + 'flex-wrap:wrap;justify-content:center;padding:16px clamp(14px,3vw,28px);'
      + 'background:rgba(11,16,32,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);'
      + 'border-top:1px solid var(--border-hi,#26314d);box-shadow:0 -16px 40px -20px rgba(0,0,0,.6)}'
      + '.mck-bar .mck-txt{flex:1 1 360px;min-width:260px;font-size:13.5px;line-height:1.55;color:var(--text-sec,#aab4c8)}'
      + '.mck-bar .mck-txt b{color:var(--text,#f1f5f9);font-weight:700}'
      + '.mck-bar .mck-txt a{color:var(--accent-hi,#ff9a5a);text-decoration:underline;text-underline-offset:2px}'
      + '.mck-acts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}'
      + '.mck-btn{font-size:13.5px;font-weight:700;padding:11px 18px;border-radius:11px;cursor:pointer;border:1px solid transparent;transition:all .18s;white-space:nowrap}'
      + '.mck-btn-ghost{background:transparent;border-color:var(--border-hi,#26314d);color:var(--text,#f1f5f9)}'
      + '.mck-btn-ghost:hover{border-color:var(--accent,#f4501e);background:rgba(255,255,255,.04)}'
      + '.mck-btn-primary{background:var(--grad,linear-gradient(120deg,#f4501e,#ffb03c));color:#0b0a12;box-shadow:0 10px 26px -12px var(--accent-glow,rgba(244,80,30,.7))}'
      + '.mck-btn-primary:hover{filter:brightness(1.05)}'
      + '.mck-link{font-size:13px;font-weight:600;color:var(--text-sec,#aab4c8);background:none;cursor:pointer;text-decoration:underline;text-underline-offset:2px}'
      + '.mck-link:hover{color:var(--text,#f1f5f9)}'
      + '.mck-overlay{position:fixed;inset:0;z-index:9001;display:none;place-items:center;padding:22px;'
      + 'background:rgba(7,10,20,.7);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}'
      + '.mck-overlay.show{display:grid}'
      + '.mck-modal{width:100%;max-width:440px;background:var(--card-hi,#141f33);border:1px solid var(--border-hi,#26314d);'
      + 'border-radius:var(--r-lg,18px);box-shadow:var(--shadow-pop,0 30px 80px -30px #000);padding:24px 24px 20px;position:relative;overflow:hidden}'
      + '.mck-modal::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--grad,linear-gradient(120deg,#f4501e,#ffb03c))}'
      + '.mck-modal h3{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:4px 0 6px;color:var(--text,#f1f5f9)}'
      + '.mck-modal p{font-size:13px;color:var(--text-sec,#aab4c8);line-height:1.55;margin-bottom:16px}'
      + '.mck-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 0;border-top:1px solid var(--border,#1c2438)}'
      + '.mck-row .mck-info{flex:1}'
      + '.mck-row .mck-info .t{font-size:14px;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:3px}'
      + '.mck-row .mck-info .d{font-size:12.5px;color:var(--text-sec,#aab4c8);line-height:1.5}'
      + '.mck-sw{position:relative;width:42px;height:24px;border-radius:999px;background:var(--border-hi,#26314d);flex-shrink:0;cursor:pointer;transition:background .18s;margin-top:2px}'
      + '.mck-sw::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .18s}'
      + '.mck-sw.on{background:var(--accent,#f4501e)}'
      + '.mck-sw.on::after{left:20px}'
      + '.mck-sw.locked{opacity:.6;cursor:not-allowed}'
      + '.mck-modal-acts{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}'
      + '.mck-modal-acts .mck-btn{flex:1;text-align:center;justify-content:center}'
      + '.mck-fab{position:fixed;left:16px;bottom:16px;z-index:8000;width:38px;height:38px;border-radius:50%;'
      + 'display:none;place-items:center;cursor:pointer;background:var(--card-hi,#141f33);border:1px solid var(--border-hi,#26314d);color:var(--text-sec,#aab4c8)}'
      + '.mck-fab.show{display:grid}'
      + '.mck-fab:hover{color:var(--text,#f1f5f9);border-color:var(--accent,#f4501e)}'
      + '.mck-fab svg{width:18px;height:18px}'
      + '@media(max-width:640px){.mck-bar{flex-direction:column;align-items:stretch;gap:12px}'
      + '.mck-acts{justify-content:stretch}.mck-acts .mck-btn{flex:1;text-align:center}}';
    var style = document.createElement('style');
    style.id = 'mecha-cookies-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- banner ---------- */
  var barEl = null, overlayEl = null, fabEl = null, analyticsOn = false;

  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'mck-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Aviso de cookies');
    bar.innerHTML =
      '<div class="mck-txt"><b>Cuidamos tu privacidad.</b> Usamos cookies necesarias para que la web funcione y, solo si lo aceptas, cookies de medicion (Google Analytics) para mejorarla. '
      + 'Puedes aceptarlas, rechazarlas o configurarlas. Mas info en <a href="cookies.html">Politica de cookies</a>.</div>'
      + '<div class="mck-acts">'
      + '<button type="button" class="mck-btn mck-btn-ghost" id="mckReject">Rechazar</button>'
      + '<button type="button" class="mck-link" id="mckConfig">Configurar</button>'
      + '<button type="button" class="mck-btn mck-btn-primary" id="mckAccept">Aceptar</button>'
      + '</div>';
    document.body.appendChild(bar);
    bar.querySelector('#mckAccept').addEventListener('click', function () { decide(true); });
    bar.querySelector('#mckReject').addEventListener('click', function () { decide(false); });
    bar.querySelector('#mckConfig').addEventListener('click', openModal);
    return bar;
  }

  function buildModal() {
    var ov = document.createElement('div');
    ov.className = 'mck-overlay';
    ov.innerHTML =
      '<div class="mck-modal" role="dialog" aria-modal="true" aria-label="Configurar cookies">'
      + '<h3>Configura tus cookies</h3>'
      + '<p>Decide que cookies permites. Las necesarias no se pueden desactivar porque sin ellas la web no funciona.</p>'
      + '<div class="mck-row"><div class="mck-info"><div class="t">Necesarias</div>'
      + '<div class="d">Imprescindibles para iniciar sesion, mantener la sesion y la seguridad. Siempre activas.</div></div>'
      + '<div class="mck-sw on locked" aria-disabled="true"></div></div>'
      + '<div class="mck-row"><div class="mck-info"><div class="t">Analiticas (Google Analytics)</div>'
      + '<div class="d">Nos ayudan a entender de forma agregada como se usa la web para mejorarla. Solo se activan si las permites.</div></div>'
      + '<div class="mck-sw" id="mckSwAnalytics" role="switch" aria-checked="false" tabindex="0"></div></div>'
      + '<div class="mck-modal-acts">'
      + '<button type="button" class="mck-btn mck-btn-ghost" id="mckSave">Guardar preferencias</button>'
      + '<button type="button" class="mck-btn mck-btn-primary" id="mckAcceptAll">Aceptar todas</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    var sw = ov.querySelector('#mckSwAnalytics');
    function toggle() {
      analyticsOn = !analyticsOn;
      sw.classList.toggle('on', analyticsOn);
      sw.setAttribute('aria-checked', analyticsOn ? 'true' : 'false');
    }
    sw.addEventListener('click', toggle);
    sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    ov.querySelector('#mckSave').addEventListener('click', function () { decide(analyticsOn); });
    ov.querySelector('#mckAcceptAll').addEventListener('click', function () { decide(true); });
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    return ov;
  }

  function buildFab() {
    var f = document.createElement('button');
    f.type = 'button';
    f.className = 'mck-fab';
    f.setAttribute('aria-label', 'Preferencias de cookies');
    f.title = 'Preferencias de cookies';
    f.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/></svg>';
    f.addEventListener('click', openModal);
    document.body.appendChild(f);
    return f;
  }

  function showBar() { if (!barEl) barEl = buildBar(); barEl.style.display = 'flex'; if (fabEl) fabEl.classList.remove('show'); }
  function hideBar() { if (barEl) barEl.style.display = 'none'; if (fabEl) fabEl.classList.add('show'); }
  function openModal() { if (!overlayEl) overlayEl = buildModal(); overlayEl.classList.add('show'); }
  function closeModal() { if (overlayEl) overlayEl.classList.remove('show'); }

  function decide(analytics) {
    var c = saveConsent(analytics);
    closeModal();
    hideBar();
    applyConsent(c);
  }

  function init() {
    injectStyles();
    if (!fabEl) fabEl = buildFab();
    var c = readConsent();
    if (c) {
      applyConsent(c);
      hideBar();
    } else {
      showBar();
    }
  }

  // API publica para reabrir el panel (p. ej. enlace "Configurar cookies" en cookies.html)
  window.MechaCookies = {
    open: openModal,
    reset: function () { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} showBar(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
