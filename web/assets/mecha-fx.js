/* ============================================================
   MECHA FX KIT — comportamiento JS de mecha-fx.css
   (spotlight, tilt, scroll progress, dock activo, blur-in)
   Se auto-inicializa; no depende de nada más.
   ============================================================ */
(function () {
  "use strict";
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  /* ---- Spotlight cards: el halo sigue al ratón ---- */
  var spots = document.querySelectorAll(".fx-spot");
  if (spots.length && !coarse) {
    spots.forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty(
          "--mx", ((e.clientX - r.left) / r.width) * 100 + "%"
        );
        el.style.setProperty(
          "--my", ((e.clientY - r.top) / r.height) * 100 + "%"
        );
      });
    });
  }

  /* ---- Tilt 3D sutil en tarjetas .fx-tilt ---- */
  if (!reduced && !coarse) {
    document.querySelectorAll(".fx-tilt").forEach(function (el) {
      var MAX = 6; // grados
      el.addEventListener("pointerenter", function () {
        el.classList.add("is-tilting");
      });
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          "perspective(900px) rotateX(" +
          (-py * MAX).toFixed(2) +
          "deg) rotateY(" +
          (px * MAX).toFixed(2) +
          "deg)";
      });
      el.addEventListener("pointerleave", function () {
        el.classList.remove("is-tilting");
        el.style.transform = "";
      });
    });
  }

  /* ---- Barra de progreso de scroll ---- */
  var prog = document.querySelector(".fx-progress");
  if (prog) {
    var tick = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    };
    window.addEventListener("scroll", tick, { passive: true });
    tick();
  }

  /* ---- Dock: marcar la sección visible ---- */
  var dock = document.querySelector(".fx-dock");
  if (dock) {
    var links = Array.prototype.slice.call(
      dock.querySelectorAll('a[href^="#"]')
    );
    var secs = links
      .map(function (a) {
        return document.querySelector(a.getAttribute("href"));
      })
      .filter(Boolean);
    if (secs.length) {
      var onScroll = function () {
        var y = window.scrollY + window.innerHeight * 0.35;
        var idx = -1;
        secs.forEach(function (s, i) {
          if (s.offsetTop <= y) idx = i;
        });
        links.forEach(function (a, i) {
          a.classList.toggle("on", i === idx);
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  }

  /* ---- Blur-in: revelar bloques al entrar en viewport ---- */
  var blurred = document.querySelectorAll("[data-fx-blur]");
  if (blurred.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    blurred.forEach(function (el) { io.observe(el); });
  } else {
    blurred.forEach(function (el) { el.classList.add("in"); });
  }
})();
