/* Ficha de salon del directorio. Lee por RPC salon_directorio_publico.
   El boton de reservar lleva al portal del salon (/app/r/<slug>), que es donde
   vive de verdad la disponibilidad y la reserva. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

  // OJO: negocio_horarios.dia_semana usa 0 = LUNES (no domingo, como getDay()).
  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var MODO_FOTOS_DEMO = new URLSearchParams(location.search).get('fotos') === 'demo';
  var euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }

  function inicial(n) { n = (n || '').trim(); return n ? n.charAt(0).toUpperCase() : 'M'; }

  function galeria(d) {
    var fotos = (d.fotos || []).slice(0, 5);

    // Modo demostracion (?fotos=demo): rellena con las fotos locales de
    // web/assets/salones para poder juzgar el diseno. Nunca por defecto.
    if (!fotos.length && MODO_FOTOS_DEMO) {
      fotos = [1, 2, 3, 4, 5].map(function (n) {
        return { url: '/assets/salones/salon-' + n + '.jpg', alt: d.nombre || 'Foto del salón', demo: n };
      });
    }

    if (!fotos.length) {
      // Sin fotos: el fallback ocupa TODO el ancho de la columna (clase "sola"),
      // si no el grid le reserva solo la primera de las tres columnas.
      return '<div class="f-galeria sola"><div class="fallback">' + esc(inicial(d.nombre)) + '</div></div>';
    }

    // El fallback se engancha en JS (ver engancharFallbackFotos): un onerror
    // inline lo bloquearia la CSP, que no permite manejadores en el HTML.
    var celdas = fotos.map(function (f) {
      return '<div><img src="' + esc(f.url) + '" alt="' + esc(f.alt || d.nombre || 'Foto del salón') + '"' +
        (f.demo ? ' data-demo="' + f.demo + '"' : ' loading="lazy"') + ' /></div>';
    });
    return '<div class="f-galeria' + (celdas.length === 1 ? ' sola' : '') + '">' + celdas.join('') + '</div>';
  }

  function servicios(d) {
    var lista = d.servicios || [];
    if (!lista.length) return '<p style="color:var(--d-text-ter);font-size:14px;margin:0">Este salón todavía no ha publicado sus servicios.</p>';
    var grupos = {};
    lista.forEach(function (s) {
      var k = s.categoria || 'Otros servicios';
      (grupos[k] = grupos[k] || []).push(s);
    });
    return Object.keys(grupos).map(function (k) {
      return '<div class="f-cat">' + esc(k) + '</div>' + grupos[k].map(function (s) {
        return '<div class="f-serv"><span>' + esc(s.nombre) + '</span>' +
          '<span class="p">' + esc(s.duracion) + ' min · <strong>' + esc(euros.format(Number(s.precio) || 0)) + '</strong></span></div>';
      }).join('');
    }).join('');
  }

  function resenas(d) {
    var lista = d.resenas || [];
    if (!lista.length) return '<p style="color:var(--d-text-ter);font-size:14px;margin:0">Todavía no hay reseñas.</p>';
    return lista.map(function (r) {
      var estrellas = '';
      for (var i = 0; i < 5; i++) {
        estrellas += '<svg width="12" height="12" viewBox="0 0 24 24" fill="' + (i < r.puntuacion ? '#f4501e' : 'rgba(40,30,24,0.14)') + '"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>';
      }
      var fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      return '<div class="f-res"><div class="top"><span class="aut">' + esc(r.autor || 'Anónimo') + '</span>' +
        '<span style="color:var(--d-text-ter)">' + esc(fecha) + '</span></div>' +
        '<div style="margin-bottom:6px">' + estrellas + '</div>' +
        (r.comentario ? '<p class="txt">' + esc(r.comentario) + '</p>' : '') + '</div>';
    }).join('');
  }

  function horario(d) {
    var lista = d.horario || [];
    if (!lista.length) return '<p style="color:var(--d-text-ter);font-size:14px;margin:0">Horario no indicado.</p>';
    var hoy = (new Date().getDay() + 6) % 7; // getDay(): 0=domingo -> aqui 0=lunes
    return lista.map(function (h) {
      var abierto = h.abierto && h.apertura && h.cierre;
      return '<div class="f-hor' + (h.dia === hoy ? ' hoy' : '') + '">' +
        '<span>' + esc(DIAS[h.dia] || '') + '</span>' +
        (abierto
          ? '<span>' + esc(hhmm(h.apertura)) + ' - ' + esc(hhmm(h.cierre)) + '</span>'
          : '<span class="cerrado">Cerrado</span>') +
        '</div>';
    }).join('');
  }

  function pintar(d) {
    var zona = [d.direccion, d.ciudad, d.provincia].filter(Boolean).join(', ');
    var val = d.valoracion != null
      ? '<span class="f-star"><svg width="15" height="15" viewBox="0 0 24 24" fill="#f4501e"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
        esc(String(d.valoracion).replace('.', ',')) + '</span><span>' + esc(d.resenas_total) +
        (Number(d.resenas_total) === 1 ? ' reseña' : ' reseñas') + '</span>'
      : '<span style="color:var(--d-text-ter)">Sin valoraciones todavía</span>';

    document.title = (d.nombre || 'Salón') + ' — Mecha';

    document.getElementById('main').innerHTML =
      '<div class="f-cols">' +
        '<div class="f-main">' +
          galeria(d) +
          '<h1 class="f-h1">' + esc(d.nombre || 'Salón') + '</h1>' +
          '<div class="f-meta">' + val + '</div>' +
          '<div style="font-size:14px;color:var(--d-text-sec);margin-top:6px">' + esc(zona || 'Dirección no indicada') + '</div>' +
          (d.descripcion ? '<p style="font-size:15px;color:var(--d-text-sec);line-height:1.6;max-width:680px;margin:14px 0 0">' + esc(d.descripcion) + '</p>' : '') +
          '<div style="height:24px"></div>' +
          '<div class="f-card"><h2>Servicios y precios</h2>' + servicios(d) + '</div>' +
          (d.profesionales && d.profesionales.length
            ? '<div class="f-card"><h2>Equipo</h2>' + d.profesionales.map(function (p) {
                return '<span class="f-prof">' + esc(p.nombre) + '</span>';
              }).join('') + '</div>'
            : '') +
          '<div class="f-card"><h2>Reseñas</h2>' + resenas(d) + '</div>' +
        '</div>' +
        '<aside class="f-side">' +
          '<div class="f-card"><h2>Horario</h2>' + horario(d) + '</div>' +
          '<div class="f-card">' +
            '<a class="f-reservar" href="/app/r/' + encodeURIComponent(d.slug) + '">Reservar cita' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</a>' +
            '<p class="f-nota">Eliges servicio, profesional y hora en la página del salón.</p>' +
            (d.telefono ? '<div style="margin-top:14px;font-size:14px"><span style="color:var(--d-text-ter)">Teléfono</span><br><a href="tel:' + esc(d.telefono) + '" style="color:var(--d-fuego-hi);font-weight:600;text-decoration:none">' + esc(d.telefono) + '</a></div>' : '') +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<a class="f-volver" href="/salones.html">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        'Volver a la búsqueda</a>';

    engancharFallbackFotos();
  }

  // Si las fotos locales de demostracion no existen, cae a una remota para que
  // el diseno se pueda juzgar igual. Solo aplica en modo demo.
  function engancharFallbackFotos() {
    [].forEach.call(document.querySelectorAll('img[data-demo]'), function (img) {
      img.addEventListener('error', function once() {
        img.removeEventListener('error', once);
        img.src = 'https://picsum.photos/seed/mecha-ficha-' + img.getAttribute('data-demo') + '/900/700';
      });
      if (img.complete && img.naturalWidth === 0) img.dispatchEvent(new Event('error'));
    });
  }

  function noEncontrado(msg) {
    document.getElementById('main').innerHTML =
      '<div class="d-vacio">' +
        '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<h2>No hemos encontrado este salón</h2>' +
        '<p>' + esc(msg) + '</p>' +
        '<a class="d-btn-ghost" href="/salones.html" style="text-decoration:none">Ver todos los salones</a>' +
      '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Acepta las dos formas: /salon/<slug> (rewrite de Vercel) y salon.html?s=<slug>.
    var slug = new URLSearchParams(location.search).get('s');
    if (!slug) {
      var m = location.pathname.match(/\/salon\/([^/?#]+)/);
      if (m) slug = decodeURIComponent(m[1]);
    }
    if (!slug) { noEncontrado('No se ha indicado ningún salón.'); return; }

    fetch(SUPABASE_URL + '/rest/v1/rpc/salon_directorio_publico', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ p_slug: slug })
    }).then(function (r) {
      if (!r.ok) throw new Error('rpc ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d) { noEncontrado('Puede que ya no esté publicado.'); return; }
      pintar(d);
    }).catch(function (e) {
      console.error(e);
      noEncontrado('No hemos podido cargar la ficha. Vuelve a intentarlo en un momento.');
    });
  });
})();
