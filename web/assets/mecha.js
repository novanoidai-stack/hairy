/* ============================================================
   MECHA — landing interactions
   intro · nav · reveal · counters · charts · phone chat (Stripe)
   · platform tabs · nueva-cita modal · comparison · tweaks
   ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement, body = document.body;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- INTRO ---------- */
  function runIntro() {
    var intro = $('#intro');
    if (!intro) return;
    var seen = false;
    try { seen = sessionStorage.getItem('mecha_intro') === '1'; } catch (e) {}
    var skipIntro = seen || reduceMotion || (window.__mechaTweaks && window.__mechaTweaks.intro === false);
    if (skipIntro) { intro.remove(); return; }
    body.classList.add('intro-lock');
    function close() {
      if (intro.classList.contains('done')) return;
      intro.classList.add('done');
      body.classList.remove('intro-lock');
      try { sessionStorage.setItem('mecha_intro', '1'); } catch (e) {}
      setTimeout(function () { if (intro.parentNode) intro.remove(); }, 850);
    }
    var skip = $('#introSkip', intro);
    if (skip) skip.addEventListener('click', close);
    intro.addEventListener('click', function (e) { if (e.target === intro) close(); });
    setTimeout(close, 3200);
  }

  /* ---------- NAV scroll ---------- */
  function navScroll() {
    var nav = $('#nav');
    if (!nav) return;
    var on = function () { nav.classList.toggle('scrolled', window.scrollY > 12); };
    on(); window.addEventListener('scroll', on, { passive: true });
  }

  /* ---------- REVEAL ---------- */
  function reveal() {
    var els = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight;
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top > vh * 0.92) el.classList.add('armed');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { if (el.classList.contains('armed')) io.observe(el); });
  }

  /* ---------- FICHA callouts (staggered) ---------- */
  function fichaNotes() {
    var notes = $$('.fnote');
    if (!notes.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      notes.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var i = parseInt(en.target.getAttribute('data-fn'), 10) || 1;
          setTimeout(function () { en.target.classList.add('in'); }, i * 130);
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.3 });
    notes.forEach(function (n) { io.observe(n); });
  }

  /* ---------- COUNTERS ---------- */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    var animate = function (el) {
      var end = parseFloat(el.getAttribute('data-count'));
      var dec = (end % 1 !== 0) ? 1 : 0;
      var pre = el.getAttribute('data-prefix') || '';
      var suf = el.getAttribute('data-suffix') || '';
      if (reduceMotion) { el.textContent = pre + end + suf; return; }
      var t0 = null, dur = 1500;
      var step = function (t) {
        if (!t0) t0 = t;
        var p = Math.min((t - t0) / dur, 1);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + (end * e).toFixed(dec) + suf;
        if (p < 1) requestAnimationFrame(step); else el.textContent = pre + end + suf;
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(animate); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { animate(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- BARS (no-show chart) ---------- */
  function bars() {
    var box = $('#bars');
    if (!box) return;
    var fill = function () {
      $$('.col', box).forEach(function (c) {
        var h = c.getAttribute('data-h');
        requestAnimationFrame(function () { c.style.height = h + '%'; });
      });
    };
    if (!('IntersectionObserver' in window)) { fill(); return; }
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { fill(); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(box);
  }

  /* ---------- CHARTS (area + gauge reveal) ---------- */
  function charts() {
    $$('.area-chart, .gauge').forEach(function (el) {
      if (!('IntersectionObserver' in window)) { el.classList.add('in'); return; }
      var io = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { el.classList.add('in'); io.disconnect(); }
      }, { threshold: 0.4 });
      io.observe(el);
    });
  }

  /* ---------- PHONE WHATSAPP CHAT (with Stripe pay flow) ---------- */
  function phoneChat() {
    var body = $('#waBody');
    if (!body) return;
    var seq = window.MECHA_CHAT || [];
    var timers = [];
    function clear() { timers.forEach(clearTimeout); timers = []; body.innerHTML = ''; }
    function bubble(node, delay) {
      timers.push(setTimeout(function () {
        body.appendChild(node);
        body.scrollTop = body.scrollHeight;
      }, delay));
    }
    function typing(delay, dur) {
      var t = document.createElement('div');
      t.className = 'typing'; t.innerHTML = '<span></span><span></span><span></span>';
      timers.push(setTimeout(function () {
        body.appendChild(t); body.scrollTop = body.scrollHeight;
        timers.push(setTimeout(function () { if (t.parentNode) t.remove(); }, dur));
      }, delay));
    }
    function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
    function play() {
      clear();
      var t = 500;
      seq.forEach(function (m) {
        if (m.type === 'them') { typing(t, 950); t += 1050; }
        bubble(el(m.html), t);
        t += (m.gap || 1000);
      });
    }
    if (!('IntersectionObserver' in window)) { play(); }
    else {
      var io = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { play(); io.disconnect(); }
      }, { threshold: 0.4 });
      io.observe(body);
    }
    var replay = $('#chatReplay');
    if (replay) replay.addEventListener('click', play);
  }

  /* ---------- PLATFORM TABS ---------- */
  function tabs() {
    var tabEls = $$('.aio-tab');
    if (!tabEls.length) return;
    tabEls.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var id = tab.getAttribute('data-panel');
        tabEls.forEach(function (t) { t.classList.toggle('on', t === tab); });
        $$('.aio-panel').forEach(function (p) { p.classList.toggle('on', p.id === id); });
      });
    });
  }

  /* ---------- NUEVA CITA MODAL ---------- */
  function nuevaCita() {
    var appWrap = $('#agendaApp');
    if (!appWrap) return;
    var openBtns = $$('[data-nc-open]');
    var modal = $('#ncModal');
    function setOpen(o) { appWrap.classList.toggle('has-modal', o); }
    openBtns.forEach(function (b) { b.addEventListener('click', function () { setOpen(true); }); });
    var close = $('#ncClose', appWrap);
    if (close) close.addEventListener('click', function () { setOpen(false); });
    // step switching
    var steps = $$('.nc-step', appWrap);
    var panes = $$('.nc-pane', appWrap);
    steps.forEach(function (s) {
      s.addEventListener('click', function () {
        var n = s.getAttribute('data-step');
        steps.forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-step') === n); });
        panes.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-step') === n); });
      });
    });
  }

  /* ---------- TWEAKS ---------- */
  function tweaks() {
    var host = $('#tweaks');
    if (!host) return;
    var TW = 'mecha_tweaks';
    var defaults = { accent: 'fuego', intro: true, glow: true };
    var state = {};
    try { state = Object.assign({}, defaults, JSON.parse(localStorage.getItem(TW) || '{}')); }
    catch (e) { state = Object.assign({}, defaults); }
    window.__mechaTweaks = state;

    var palettes = {
      fuego:  ['#f4501e', '#ff8a3d', '#c0260a', '#ff9d2e', '#ffce4a'],
      ascua:  ['#ef4444', '#fb7185', '#b91c1c', '#f59e0b', '#fbbf24'],
      indigo: ['#6d5efc', '#8b7bff', '#4f3ddb', '#a855f7', '#22d3ee'],
      ocean:  ['#22d3ee', '#67e8f9', '#0891b2', '#3b82f6', '#2dd4bf']
    };
    function applyAccent(k) {
      var p = palettes[k] || palettes.fuego;
      root.style.setProperty('--accent', p[0]);
      root.style.setProperty('--accent-hi', p[1]);
      root.style.setProperty('--accent-deep', p[2]);
      root.style.setProperty('--violet', p[3]);
      root.style.setProperty('--cyan', p[4]);
      root.style.setProperty('--accent-soft', hexA(p[0], .14));
      root.style.setProperty('--accent-glow', hexA(p[0], .5));
      root.style.setProperty('--grad', 'linear-gradient(120deg,' + p[1] + ',' + p[3] + ' 55%,' + p[4] + ')');
      root.style.setProperty('--grad-soft', 'linear-gradient(120deg,' + p[0] + ',' + p[3] + ')');
    }
    function hexA(h, a) {
      var n = parseInt(h.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function applyGlow(on) { body.classList.toggle('no-glow', !on); }
    function apply() { applyAccent(state.accent); applyGlow(state.glow); }
    function save() { try { localStorage.setItem(TW, JSON.stringify(state)); } catch (e) {} }
    apply();

    // wire controls
    $$('[data-tw-accent]', host).forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tw-accent') === state.accent);
      b.addEventListener('click', function () {
        state.accent = b.getAttribute('data-tw-accent');
        $$('[data-tw-accent]', host).forEach(function (x) { x.classList.toggle('on', x === b); });
        apply(); save();
      });
    });
    var glowToggle = $('#twGlow', host);
    if (glowToggle) {
      glowToggle.classList.toggle('on', state.glow);
      glowToggle.addEventListener('click', function () {
        state.glow = !state.glow; glowToggle.classList.toggle('on', state.glow); apply(); save();
      });
    }
    var introToggle = $('#twIntro', host);
    if (introToggle) {
      introToggle.classList.toggle('on', state.intro);
      introToggle.addEventListener('click', function () {
        state.intro = !state.intro; introToggle.classList.toggle('on', state.intro); save();
      });
    }
    var replayIntro = $('#twReplayIntro', host);
    if (replayIntro) replayIntro.addEventListener('click', function () {
      try { sessionStorage.removeItem('mecha_intro'); } catch (e) {}
      location.reload();
    });

    // host panel show/hide via Tweaks toolbar (postMessage protocol)
    // En producción standalone el panel está hidden; al recibir la señal del
    // parent (iframe de preview interno) se quita el atributo y se muestra.
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'tweaks:visibility') {
        if (d.visible) host.removeAttribute('hidden');
        else host.setAttribute('hidden', '');
        host.classList.toggle('open', !!d.visible);
      }
    });
    var closeBtn = $('#twClose', host);
    if (closeBtn) closeBtn.addEventListener('click', function () {
      host.classList.remove('open');
      host.setAttribute('hidden', '');
      host.setAttribute('aria-hidden', 'true');
      try { window.parent.postMessage({ type: 'tweaks:closed' }, '*'); } catch (e) {}
    });
  }

  /* ---------- MOBILE MENU (panel lateral deslizante) ----------
     Rediseno: en lugar del overlay full-screen con links centrados, un drawer
     que entra desde la derecha. La barra de nav se queda arriba (con su marca) y
     el boton hamburguesa se transforma en X = el cierre. Cierra tambien por
     scrim, por seleccionar un enlace o con Escape. El pie (login + demo) conserva
     las clases .mobile-menu-cta .login para que syncMobileMenu (index.html) siga
     ocultando "Iniciar sesion" cuando hay sesion. */
  function mobileMenu() {
    var navIn = $('.nav-in');
    if (!navIn) return;

    var toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Abrir menú');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'mnavPanel');
    toggle.innerHTML = '<span></span>';
    navIn.appendChild(toggle);

    var scrim = document.createElement('div');
    scrim.className = 'mnav-scrim';

    var panel = document.createElement('aside');
    panel.className = 'mnav-panel';
    panel.id = 'mnavPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Menú de navegación');
    panel.setAttribute('aria-hidden', 'true');

    // Enlaces: clonamos los del nav de escritorio. Si la pagina no tiene
    // .nav-links (p.ej. especificaciones.html), al menos ofrecemos "Inicio".
    var srcLinks = $$('.nav-links a').map(function (l) {
      return { href: l.getAttribute('href'), text: (l.textContent || '').trim() };
    });
    if (!srcLinks.length) srcLinks = [{ href: 'index.html', text: 'Inicio' }];

    var linksWrap = document.createElement('nav');
    linksWrap.className = 'mnav-links';
    linksWrap.setAttribute('aria-label', 'Secciones');
    var eyebrow = document.createElement('span');
    eyebrow.className = 'mnav-eyebrow';
    eyebrow.textContent = 'Navegación';
    linksWrap.appendChild(eyebrow);
    srcLinks.forEach(function (l) {
      var a = document.createElement('a');
      a.href = l.href;
      a.innerHTML = '<span>' + l.text + '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      linksWrap.appendChild(a);
    });

    // Cabecera de cuenta: oculta por defecto; index.html (syncMobileAccount) la
    // rellena con avatar + email y la muestra cuando hay sesion activa.
    var account = document.createElement('div');
    account.className = 'mnav-account';
    account.style.display = 'none';
    account.innerHTML = '<span class="mnav-av">·</span>' +
      '<span class="mnav-acc-meta"><span class="mnav-acc-lbl">Tu cuenta</span>' +
      '<span class="mnav-acc-eml"></span></span>';
    panel.appendChild(account);

    panel.appendChild(linksWrap);

    // Pie: respeta el CTA de cada pagina (login/"Volver a la web" + demo).
    var navCta = $('.nav-cta');
    var srcLogin = navCta ? navCta.querySelector('a.login') : null;
    var srcDemo = navCta ? (navCta.querySelector('#navDemo') || navCta.querySelector('a.btn')) : null;

    var foot = document.createElement('div');
    foot.className = 'mnav-foot mobile-menu-cta';

    var loginLink = document.createElement('a');
    loginLink.className = 'login';
    loginLink.href = srcLogin ? srcLogin.getAttribute('href') : 'acceso.html';
    loginLink.textContent = (srcLogin && srcLogin.textContent.trim()) || 'Iniciar sesión';

    // Boton "Entrar al software": oculto por defecto; index.html lo muestra
    // (.mobile-menu-enter) cuando la cuenta tiene acceso (plan != free).
    var enterLink = document.createElement('a');
    enterLink.className = 'btn btn-primary btn-lg btn-block mobile-menu-enter';
    enterLink.href = '#';
    enterLink.textContent = 'Entrar al software';
    enterLink.style.display = 'none';
    enterLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.MechaAPI && window.MechaAPI.goToApp) window.MechaAPI.goToApp();
    });

    var demoLink = document.createElement('a');
    demoLink.className = 'btn btn-primary btn-lg btn-block';
    demoLink.href = srcDemo ? srcDemo.getAttribute('href') : 'demo.html';
    demoLink.textContent = (srcDemo && srcDemo.textContent.trim()) || 'Ver demo gratis';

    // "Panel de staff": oculto por defecto; index.html (syncMobileStaff) lo muestra
    // solo al equipo Mecha, como espejo del item #acctStaff del dropdown de escritorio.
    var staffLink = document.createElement('a');
    staffLink.className = 'mobile-menu-staff';
    staffLink.href = 'admin.html';
    staffLink.style.display = 'none';
    staffLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></svg><span>Panel de staff</span>';

    foot.appendChild(loginLink);
    foot.appendChild(enterLink);
    foot.appendChild(demoLink);
    foot.appendChild(staffLink);
    panel.appendChild(foot);

    body.appendChild(scrim);
    body.appendChild(panel);

    var lastFocus = null;
    function isOpen() { return body.classList.contains('nav-menu-open'); }
    function open() {
      lastFocus = document.activeElement;
      body.classList.add('nav-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Cerrar menú');
      panel.setAttribute('aria-hidden', 'false');
      var first = panel.querySelector('a');
      if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 80);
    }
    function shut() {
      body.classList.remove('nav-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menú');
      panel.setAttribute('aria-hidden', 'true');
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }

    toggle.addEventListener('click', function (e) { e.stopPropagation(); isOpen() ? shut() : open(); });
    scrim.addEventListener('click', shut);
    $$('a', panel).forEach(function (a) { a.addEventListener('click', shut); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) shut(); });
    // Si se ensancha a escritorio con el menu abierto, cerrarlo para no dejarlo colgado.
    window.addEventListener('resize', function () { if (isOpen() && window.innerWidth > 900) shut(); });
  }

  /* ---------- INIT ---------- */
  function init() {
    tweaks();      // sets __mechaTweaks before intro reads it
    runIntro();
    navScroll();
    mobileMenu();
    reveal();
    fichaNotes();
    counters();
    bars();
    charts();
    phoneChat();
    tabs();
    nuevaCita();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
