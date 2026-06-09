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
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'tweaks:visibility') host.classList.toggle('open', !!d.visible);
    });
    var closeBtn = $('#twClose', host);
    if (closeBtn) closeBtn.addEventListener('click', function () {
      host.classList.remove('open');
      try { window.parent.postMessage({ type: 'tweaks:closed' }, '*'); } catch (e) {}
    });
  }

  /* ---------- MOBILE MENU ---------- */
  function mobileMenu() {
    var navIn = $('.nav-in');
    if (!navIn) return;

    var toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Menú');
    toggle.innerHTML = '<span></span>';
    navIn.appendChild(toggle);

    var overlay = document.createElement('div');
    overlay.className = 'mobile-menu-overlay';

    var linksContainer = document.createElement('div');
    linksContainer.className = 'mobile-menu-links';

    var links = $$('.nav-links a');
    if (links.length) {
      links.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l.getAttribute('href');
        a.textContent = l.textContent;
        linksContainer.appendChild(a);
      });
    }

    var ctaContainer = document.createElement('div');
    ctaContainer.className = 'mobile-menu-cta';

    var loginLink = document.createElement('a');
    loginLink.href = 'acceso.html';
    loginLink.className = 'login';
    loginLink.textContent = 'Iniciar sesión';
    loginLink.style.fontSize = '16px';
    loginLink.style.color = 'var(--text-sec)';
    loginLink.style.padding = '8px 12px';

    var demoLink = document.createElement('a');
    demoLink.href = 'demo.html';
    demoLink.className = 'btn btn-primary btn-lg btn-block';
    demoLink.textContent = 'Ver demo gratis';

    ctaContainer.appendChild(loginLink);
    ctaContainer.appendChild(demoLink);

    overlay.appendChild(linksContainer);
    overlay.appendChild(ctaContainer);
    body.appendChild(overlay);

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      body.classList.toggle('nav-menu-open');
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        body.classList.remove('nav-menu-open');
      }
    });

    $$('a', overlay).forEach(function (a) {
      a.addEventListener('click', function () {
        body.classList.remove('nav-menu-open');
      });
    });
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
