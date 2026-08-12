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

  // Enlace directo de WhatsApp al salon: mismo telefono publico que el tel:,
  // normalizado a solo digitos (wa.me no acepta '+' ni espacios) con mensaje
  // de contexto precargado para que la clienta no empiece de cero.
  function whatsapp(d) {
    var digitos = String(d.telefono || '').replace(/\D/g, '');
    if (!digitos) return '';
    // wa.me exige el numero completo con codigo de pais (sin '+'). El telefono
    // se guarda como movil nacional (9 digitos, sin 34): sin esto wa.me lee los
    // 2 primeros digitos como codigo de pais equivocado (p.ej. 98 = Iran).
    if (digitos.length === 9) digitos = '34' + digitos;
    else if (digitos.slice(0, 3) === '034') digitos = digitos.slice(1);
    var texto = 'Hola, te escribo desde Mecha sobre ' + (d.nombre || 'vuestro salón') + '.';
    return '<a class="f-whatsapp" href="https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener noreferrer">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.55 3.7-8.24 8.26-8.24zm-4.38 4.72c-.17 0-.44.06-.67.32-.23.25-.87.85-.87 2.08s.9 2.42 1.02 2.58c.13.17 1.75 2.79 4.31 3.8 2.13.85 2.57.68 3.03.64.47-.04 1.5-.61 1.72-1.2.21-.59.21-1.09.15-1.2-.06-.1-.23-.17-.48-.29-.25-.13-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.38-.44.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.44-.06-.13-.57-1.4-.79-1.91-.2-.5-.42-.43-.57-.43z"/></svg>' +
      'Escribir por WhatsApp' +
    '</a>';
  }

  function pintar(d) {
    var zona = [d.direccion, d.ciudad, d.provincia].filter(Boolean).join(', ');
    var val = d.valoracion != null
      ? '<span class="f-star"><svg width="15" height="15" viewBox="0 0 24 24" fill="#f4501e"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
        esc(String(d.valoracion).replace('.', ',')) + '</span><span>' + esc(d.resenas_total) +
        (Number(d.resenas_total) === 1 ? ' reseña' : ' reseñas') + '</span>'
      : '<span style="color:var(--d-text-ter)">Sin valoraciones todavía</span>';

    document.title = (d.nombre || 'Salón') + ' — Mecha';
    window.MechaDirectorioContexto = d.nombre || null;

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
            (d.telefono ? whatsapp(d) : '') +
            (d.telefono ? '<div style="margin-top:14px;font-size:14px"><span style="color:var(--d-text-ter)">Teléfono</span><br><a href="tel:' + esc(d.telefono) + '" style="color:var(--d-fuego-hi);font-weight:600;text-decoration:none">' + esc(d.telefono) + '</a></div>' : '') +
          '</div>' +
        '</aside>' +
      '</div>' +
      '<a class="f-volver" href="/salones.html">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        'Volver a la búsqueda</a>';

    engancharFallbackFotos();
    actualizarJsonLd(d);
    actualizarMetaHead(d);
  }

  function actualizarJsonLd(d) {
    if (!d) return;
    var el = document.getElementById('salon-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'salon-jsonld';
      document.head.appendChild(el);
    }
    var slug = d.slug || '';
    var ratingVal = d.valoracion != null ? Number(d.valoracion) : (d.puntuacion_media != null ? Number(d.puntuacion_media) : null);
    var reviewCnt = d.resenas_total != null ? Number(d.resenas_total) : (d.num_resenas != null ? Number(d.num_resenas) : null);

    var schema = {
      '@context': 'https://schema.org',
      '@type': ['LocalBusiness', 'HairSalon'],
      '@id': 'https://www.mechaa.es/salon/' + slug + '#salon',
      'name': d.nombre || 'Salón',
      'description': d.descripcion || ('Reserva cita online en ' + (d.nombre || 'este salón')),
      'url': 'https://www.mechaa.es/salon/' + slug,
      'telephone': d.telefono || '',
      'address': {
        '@type': 'PostalAddress',
        'streetAddress': d.direccion || '',
        'addressLocality': d.ciudad || '',
        'addressRegion': d.provincia || '',
        'addressCountry': 'ES'
      }
    };

    if (d.latitud && d.longitud) {
      schema.geo = {
        '@type': 'GeoCoordinates',
        'latitude': Number(d.latitud),
        'longitude': Number(d.longitud)
      };
    }

    if (ratingVal && reviewCnt && reviewCnt > 0) {
      schema.aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': ratingVal,
        'reviewCount': reviewCnt
      };
    }

    el.textContent = JSON.stringify(schema, null, 2);
  }

  // Red de seguridad SEO: cuando la ficha se sirve por el rewrite (salon.html
  // estatico, sin prerender), fija canonical/meta/OG por slug en runtime y, si
  // el salon no existe, marca noindex para no generar un soft-404 indexable.
  function setMeta(attr, key, val) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', val);
  }
  function actualizarMetaHead(d) {
    if (!d || !d.slug) return;
    var url = 'https://www.mechaa.es/salon/' + d.slug;
    var link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
    if (d.descripcion) setMeta('name', 'description', d.descripcion);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', 'business.business');
    setMeta('property', 'og:title', document.title);
    if (d.descripcion) setMeta('property', 'og:description', d.descripcion);
  }
  function marcarNoIndex() {
    var el = document.head.querySelector('meta[name="robots"]');
    if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.appendChild(el); }
    el.content = 'noindex, follow';
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
    marcarNoIndex();
    document.getElementById('main').innerHTML =
      '<div class="d-vacio">' +
        '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<h2>No hemos encontrado este salón</h2>' +
        '<p>' + esc(msg) + '</p>' +
        '<a class="d-btn-ghost" href="/salones.html" style="text-decoration:none">Ver todos los salones</a>' +
      '</div>';
  }

  // -------------------------------------------------------------------------
  // Vista previa embebida en Ajustes (?preview=1)
  // -------------------------------------------------------------------------
  // No puede leer por RPC: salon_directorio_publico exige directorio_visible, y
  // el salon que esta configurandose normalmente todavia no esta listado —
  // ademas de que lo que quiere ver son sus cambios SIN GUARDAR. Asi que los
  // datos los manda el panel de Ajustes por postMessage, con la misma forma que
  // devuelve la RPC.

  // Deriva la tarjeta del listado a partir de la ficha: mismo criterio que la
  // RPC de busqueda (los 4 servicios mas baratos, la primera foto por orden).
  function aTarjeta(d) {
    return {
      slug: d.slug,
      nombre: d.nombre,
      direccion: d.direccion,
      ciudad: d.ciudad,
      foto: (d.fotos && d.fotos[0]) ? d.fotos[0].url : null,
      valoracion: d.valoracion,
      resenas: d.resenas_total,
      servicios: (d.servicios || []).slice().sort(function (a, b) {
        return (Number(a.precio) || 0) - (Number(b.precio) || 0);
      }).slice(0, 4)
    };
  }

  function arrancarPreview() {
    document.body.classList.add('preview');
    document.getElementById('main').innerHTML = '';

    var vista = 'ficha';
    var datos = null;

    function repintar() {
      if (!datos) return;
      if (vista === 'tarjeta') {
        var main = document.getElementById('main');
        main.innerHTML = '<div class="d-list">' + window.MechaTarjeta.resultado(aTarjeta(datos), 0) + '</div>';
        window.MechaTarjeta.engancharFallback(main);
      } else {
        pintar(datos);
      }
    }

    window.addEventListener('message', function (ev) {
      // Solo del contenedor que embebe esta pagina, y del mismo origen.
      if (ev.source !== window.parent || ev.origin !== location.origin) return;
      var m = ev.data;
      if (!m || m.tipo !== 'mecha-preview') return;
      if (m.vista) vista = m.vista;
      if (m.datos) datos = m.datos;
      repintar();
    });

    // El panel no puede medir el contenido de un iframe de forma fiable, asi que
    // se lo decimos nosotros cada vez que cambia de alto (tambien al cargar las
    // fotos, que es cuando mas crece).
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        window.parent.postMessage({ tipo: 'mecha-preview-alto', alto: document.body.scrollHeight }, location.origin);
      });
      ro.observe(document.body);
    }

    // El panel no sabe cuando ha cargado el iframe: se lo decimos nosotros.
    window.parent.postMessage({ tipo: 'mecha-preview-listo' }, location.origin);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (new URLSearchParams(location.search).get('preview') === '1') { arrancarPreview(); return; }

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
