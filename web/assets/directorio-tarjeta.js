/* Tarjetas de salon del directorio: resultado (lista) y mini (carrusel).
   Vive aparte de directorio.js porque la vista previa de Ajustes
   (salon.html?preview=1) pinta la MISMA tarjeta. Una sola maqueta que mantener:
   si esto se duplica, la vista previa acaba mintiendo. */
(function () {
  'use strict';

  var euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  // Fotos de relleno SOLO para evaluar el diseno (?fotos=demo). Nunca por
  // defecto: ensenar la foto de otro local como si fuera la del salon es falso
  // de cara a la clienta. Las de verdad las sube cada salon (bucket salon-fotos).
  // Usa los ficheros locales de web/assets/salones si existen; si no, cae a una
  // foto remota (que en produccion bloquearia la CSP, y es lo deseable).
  var MODO_FOTOS_DEMO = new URLSearchParams(location.search).get('fotos') === 'demo';
  function fotoDemo(i) { return 'assets/salones/salon-' + ((i % 5) + 1) + '.jpg'; }
  function fotoDemoFallback(i) { return 'https://picsum.photos/seed/mecha-salon-' + i + '/800/600'; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function inicial(nombre) {
    var n = (nombre || '').trim();
    return n ? n.charAt(0).toUpperCase() : 'M';
  }

  // Sin foto propia, la inicial sobre el degradado de marca. Las de demostracion
  // NO llevan loading="lazy": si el navegador no intenta cargarlas, nunca
  // disparan el error que activa el fallback remoto.
  function fotoHtml(s, idx) {
    var src = s.foto || (MODO_FOTOS_DEMO ? fotoDemo(idx) : null);
    if (!src) return '<div class="fallback">' + esc(inicial(s.nombre)) + '</div>';
    return '<img src="' + esc(src) + '" alt="' + esc(s.nombre || 'Salón') + '"' +
      (s.foto ? ' loading="lazy"' : ' data-demo="' + idx + '"') + ' />';
  }

  function zonaDe(s) {
    return [s.direccion, s.ciudad].filter(Boolean).join(', ');
  }

  // Tarjeta de la lista de resultados: foto grande, servicios con precio y CTA.
  function resultado(s, idx) {
    var rating = '';
    if (s.valoracion != null) {
      rating =
        '<div class="d-rating">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="#f4501e"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
          '<span>' + esc(String(s.valoracion).replace('.', ',')) + '</span>' +
        '</div>' +
        '<div class="d-rating-n">' + esc(s.resenas) + (Number(s.resenas) === 1 ? ' reseña' : ' reseñas') + '</div>';
    }

    var servicios = (s.servicios || []).map(function (x) {
      return '<div class="d-serv"><span>' + esc(x.nombre) + '</span>' +
        '<span class="p">' + esc(x.duracion) + ' min · <strong>' + esc(euros.format(Number(x.precio) || 0)) + '</strong></span></div>';
    }).join('');

    var dist = s.distancia_km != null ? ' <span class="dist">· a ' + esc(String(s.distancia_km).replace('.', ',')) + ' km</span>' : '';

    // Los "proximos huecos" del diseno necesitan la cache de disponibilidad, que
    // aun no existe. Hasta entonces NO se inventa nada: se enlaza al portal del
    // salon, que si calcula huecos de verdad.
    return '' +
      '<a class="d-res" href="salon.html?s=' + encodeURIComponent(s.slug) + '">' +
        '<div class="d-foto">' + fotoHtml(s, idx) + rating + '</div>' +
        '<div class="d-info">' +
          '<h2 class="d-nombre">' + esc(s.nombre || 'Salón') + '</h2>' +
          '<div class="d-dir">' + esc(zonaDe(s) || 'Dirección no indicada') + dist + '</div>' +
          '<div class="d-servicios">' + (servicios || '<span class="d-serv" style="color:var(--d-text-ter)">Sin servicios publicados</span>') + '</div>' +
          '<div class="d-res-foot">' +
            '<div class="d-lb">Disponibilidad</div>' +
            '<span class="d-cta">Ver horas libres' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
  }

  // Tarjeta compacta del carrusel: foto, nota y nombre. Nada mas — los precios
  // y los servicios son para cuando el usuario ya esta buscando algo concreto.
  function mini(s, idx) {
    var rating = s.valoracion != null
      ? '<div class="d-mini-rating"><span class="n">' + esc(String(s.valoracion).replace('.', ',')) + '</span>' +
        '<span class="r">' + esc(s.resenas) + (Number(s.resenas) === 1 ? ' reseña' : ' reseñas') + '</span></div>'
      : '';

    return '<a class="d-mini" href="salon.html?s=' + encodeURIComponent(s.slug) + '">' +
        '<div class="d-mini-foto">' + fotoHtml(s, idx) + rating + '</div>' +
        '<h3>' + esc(s.nombre || 'Salón') + '</h3>' +
        '<div class="dir">' + esc(zonaDe(s) || 'Dirección no indicada') + '</div>' +
      '</a>';
  }

  // El fallback de las fotos de demostracion se engancha en JS: un onerror
  // inline lo bloquearia la CSP.
  function engancharFallback(cont) {
    if (!cont) return;
    [].forEach.call(cont.querySelectorAll('img[data-demo]'), function (img) {
      img.addEventListener('error', function once() {
        img.removeEventListener('error', once);
        img.src = fotoDemoFallback(Number(img.getAttribute('data-demo')) || 0);
      });
      if (img.complete && img.naturalWidth === 0) img.dispatchEvent(new Event('error'));
    });
  }

  window.MechaTarjeta = {
    esc: esc,
    inicial: inicial,
    resultado: resultado,
    mini: mini,
    engancharFallback: engancharFallback
  };
})();
