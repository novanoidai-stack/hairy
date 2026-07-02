// Landing i18n — MVP.
// Cada texto traducible lleva data-i18n="clave" (o data-i18n-html para HTML).
// Idiomas iniciales: es (por defecto), en, fr, de, it, pt, ca. Añadir mas es
// añadir un objeto al mapa DICTS + una entrada al switcher.
(function () {
  'use strict';
  var STORAGE_KEY = 'mecha_lang';
  var LANGS = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'ca', label: 'Català' },
  ];

  // Diccionarios. Español es la fuente; el resto sobreescribe.
  var DICTS = {
    es: {
      nav_asistente: 'Asistente IA', nav_agenda: 'Agenda', nav_fichas: 'Fichas',
      nav_comparativa: 'Comparativa', nav_specs: 'Especificaciones',
      nav_login: 'Iniciar sesión', nav_demo: 'Ver demo gratis',
      nav_enter: 'Entrar al software',
      hero_eyebrow: 'Software de gestión para peluquerías y barberías',
      cta_primary: 'Probar la demo',
      cta_secondary: 'Especificaciones',
    },
    en: {
      nav_asistente: 'AI Assistant', nav_agenda: 'Schedule', nav_fichas: 'Client cards',
      nav_comparativa: 'Compare', nav_specs: 'Specs',
      nav_login: 'Sign in', nav_demo: 'Try free demo',
      nav_enter: 'Enter software',
      hero_eyebrow: 'Management software for salons & barbers',
      cta_primary: 'Try the demo',
      cta_secondary: 'Specifications',
    },
    fr: {
      nav_asistente: 'Assistant IA', nav_agenda: 'Agenda', nav_fichas: 'Fiches',
      nav_comparativa: 'Comparatif', nav_specs: 'Spécifications',
      nav_login: 'Se connecter', nav_demo: 'Voir la démo',
      nav_enter: 'Entrer dans l\'app',
      hero_eyebrow: 'Logiciel de gestion pour salons de coiffure',
      cta_primary: 'Essayer la démo',
      cta_secondary: 'Spécifications',
    },
    de: {
      nav_asistente: 'KI-Assistent', nav_agenda: 'Kalender', nav_fichas: 'Kundenkarten',
      nav_comparativa: 'Vergleich', nav_specs: 'Spezifikationen',
      nav_login: 'Anmelden', nav_demo: 'Kostenlose Demo',
      nav_enter: 'Zur Software',
      hero_eyebrow: 'Salon- und Barbermanagement-Software',
      cta_primary: 'Demo starten',
      cta_secondary: 'Spezifikationen',
    },
    it: {
      nav_asistente: 'Assistente IA', nav_agenda: 'Agenda', nav_fichas: 'Schede',
      nav_comparativa: 'Confronto', nav_specs: 'Specifiche',
      nav_login: 'Accedi', nav_demo: 'Prova la demo',
      nav_enter: 'Entra nel software',
      hero_eyebrow: 'Software di gestione per parrucchieri e barbieri',
      cta_primary: 'Prova la demo',
      cta_secondary: 'Specifiche',
    },
    pt: {
      nav_asistente: 'Assistente IA', nav_agenda: 'Agenda', nav_fichas: 'Fichas',
      nav_comparativa: 'Comparativo', nav_specs: 'Especificações',
      nav_login: 'Entrar', nav_demo: 'Ver demo grátis',
      nav_enter: 'Entrar no software',
      hero_eyebrow: 'Software de gestão para cabeleireiros e barbeiros',
      cta_primary: 'Experimentar a demo',
      cta_secondary: 'Especificações',
    },
    ca: {
      nav_asistente: 'Assistent IA', nav_agenda: 'Agenda', nav_fichas: 'Fitxes',
      nav_comparativa: 'Comparativa', nav_specs: 'Especificacions',
      nav_login: 'Entra', nav_demo: 'Prova la demo',
      nav_enter: 'Entra al programari',
      hero_eyebrow: 'Programari de gestió per a perruqueries i barberies',
      cta_primary: 'Prova la demo',
      cta_secondary: 'Especificacions',
    },
  };

  function detectLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DICTS[saved]) return saved;
    } catch (e) {}
    var nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
    return DICTS[nav] ? nav : 'es';
  }

  function applyLang(code) {
    var dict = DICTS[code] || DICTS.es;
    document.documentElement.lang = code;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (dict[key]) el.innerHTML = dict[key];
    });
    // Marcar el switcher activo
    document.querySelectorAll('.mecha-lang-opt').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-code') === code ? 'true' : 'false');
    });
    var toggle = document.getElementById('mechaLangCurrent');
    if (toggle) toggle.textContent = code.toUpperCase();
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
  }

  function buildSwitcher() {
    // Reutiliza estilos existentes de la nav; se pega dentro de .nav-cta antes del login.
    var container = document.querySelector('.nav-cta');
    if (!container) return;
    var wrap = document.createElement('div');
    wrap.className = 'mecha-lang';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Idioma / Language');
    wrap.innerHTML = ''
      + '<button class="mecha-lang-toggle" id="mechaLangToggle" type="button" aria-haspopup="true" aria-expanded="false" title="Idioma / Language">'
      +   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>'
      +   '<span id="mechaLangCurrent">ES</span>'
      + '</button>'
      + '<div class="mecha-lang-menu" id="mechaLangMenu" role="menu">'
      +   LANGS.map(function (l) {
              return '<button class="mecha-lang-opt" data-code="' + l.code + '" role="menuitemradio" aria-pressed="false">'
                +   '<b>' + l.code.toUpperCase() + '</b><span>' + l.label + '</span></button>';
            }).join('')
      + '</div>';
    container.insertBefore(wrap, container.firstChild);

    // Estilos inline (autocontenidos, no dependen del CSS de la landing)
    var css = document.createElement('style');
    css.textContent = ''
      + '.mecha-lang{position:relative;margin-right:8px}'
      + '.mecha-lang-toggle{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,0.06);color:inherit;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:700;cursor:pointer}'
      + '.mecha-lang-toggle:hover{background:rgba(255,255,255,0.1)}'
      + '.mecha-lang-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:160px;background:#12141a;border:1px solid rgba(255,255,255,0.14);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.55);padding:6px;display:none;z-index:1000}'
      + '.mecha-lang.open .mecha-lang-menu{display:block}'
      + '.mecha-lang-opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:8px;background:transparent;color:#f6f8ff;font-size:12.5px;cursor:pointer;text-align:left}'
      + '.mecha-lang-opt b{font-size:11px;color:#f4501e;letter-spacing:0.4px;width:22px}'
      + '.mecha-lang-opt:hover{background:rgba(244,80,30,0.12)}'
      + '.mecha-lang-opt[aria-pressed="true"]{background:rgba(244,80,30,0.18);color:#ff8a3d}';
    document.head.appendChild(css);

    // Toggle abrir/cerrar
    var toggle = document.getElementById('mechaLangToggle');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
      toggle.setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', function () { wrap.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
    wrap.querySelectorAll('.mecha-lang-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyLang(btn.getAttribute('data-code'));
        wrap.classList.remove('open');
      });
    });
  }

  function init() {
    buildSwitcher();
    applyLang(detectLang());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
