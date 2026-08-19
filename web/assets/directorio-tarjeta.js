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

  // Insignias de confianza vectoriales (sin emojis estructurales, solo SVGs nítidos)
  function calcularBadges(s) {
    var badges = [];
    var pool = ((s.servicios || []).map(function (x) { return x.nombre; }).join(' ') + ' ' + (s.descripcion || '') + ' ' + (s.nombre || '')).toLowerCase();

    // 1. Salón Verificado (con software Mecha y agenda en tiempo real)
    if (s.slug) {
      badges.push({
        id: 'verificado',
        clase: 'd-badge-verificado',
        texto: 'Salón Verificado',
        icono: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'
      });
    }

    // 2. Especialista en Rubio / Balayage
    if (/balayage|babylights|mechas|rubio|coloraci|decolor|matiz|iluminaci/i.test(pool)) {
      badges.push({
        id: 'balayage',
        clase: 'd-badge-balayage',
        texto: 'Especialista en Rubio / Balayage',
        icono: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg>'
      });
    }

    // 3. Master Barber
    if (/barber|barba|fade|degradado|afeitad|toalla caliente|perfilado/i.test(pool)) {
      badges.push({
        id: 'barber',
        clase: 'd-badge-barber',
        texto: 'Master Barber',
        icono: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
      });
    }

    // 4. Cosmética Orgánica / Vegan
    if (/org[aá]nic|vegan|bio|ecol[oó]gic|botox|plex|olaplex|keratina|sin sulfatos|sin formol/i.test(pool)) {
      badges.push({
        id: 'organic',
        clase: 'd-badge-organic',
        texto: 'Cosmética Orgánica / Vegan',
        icono: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>'
      });
    }

    return badges;
  }

  // Rango de precio: 1 (€ Económico), 2 (€€ Medio), 3 (€€€ Premium/Autor)
  function calcularPrecioTier(s) {
    var precios = (s.servicios || []).map(function (x) {
      if (x.precio != null) return Number(x.precio) || 0;
      if (x.precio_centimos != null) return (Number(x.precio_centimos) || 0) / 100;
      return 0;
    }).filter(function (p) { return p > 0; });
    if (!precios.length) return { tier: 2, simbolo: '€€', label: 'Precio medio' };
    var avg = precios.reduce(function (a, b) { return a + b; }, 0) / precios.length;
    var max = Math.max.apply(null, precios);
    if (avg <= 20 && max <= 35) {
      return { tier: 1, simbolo: '€', label: 'Económico' };
    } else if (avg >= 48 || max >= 85) {
      return { tier: 3, simbolo: '€€€', label: 'Premium / Autor' };
    }
    return { tier: 2, simbolo: '€€', label: 'Medio' };
  }

  // Tarjeta de la lista de resultados: foto grande, badges, servicios con precio y CTA.
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

    var badges = calcularBadges(s);
    var badgesHtml = '';
    if (badges.length) {
      badgesHtml = '<div class="d-badges-row">' + badges.map(function (b) {
        return '<span class="d-badge ' + esc(b.clase) + '">' + b.icono + '<span>' + esc(b.texto) + '</span></span>';
      }).join('') + '</div>';
    }

    var priceTier = calcularPrecioTier(s);
    var pricePill = '<span class="d-tier-pill" title="Rango de precio: ' + esc(priceTier.label) + '">' + esc(priceTier.simbolo) + '</span>';

    var servicios = (s.servicios || []).map(function (x) {
      return '<div class="d-serv"><span>' + esc(x.nombre) + '</span>' +
        '<span class="p">' + esc(x.duracion) + ' min · <strong>' + esc(euros.format(Number(x.precio) || 0)) + '</strong></span></div>';
    }).join('');

    var dist = s.distancia_km != null ? ' <span class="dist">· a ' + esc(String(s.distancia_km).replace('.', ',')) + ' km</span>' : '';

    return '' +
      '<a class="d-res" href="salon.html?s=' + encodeURIComponent(s.slug) + '">' +
        '<div class="d-foto">' +
          fotoHtml(s, idx) +
          rating +
          '<div class="d-foto-top-badges">' + pricePill + '</div>' +
        '</div>' +
        '<div class="d-info">' +
          '<div class="d-info-header">' +
            '<h2 class="d-nombre">' + esc(s.nombre || 'Salón') + '</h2>' +
          '</div>' +
          badgesHtml +
          '<div class="d-dir">' + esc(zonaDe(s) || 'Dirección no indicada') + dist + '</div>' +
          '<div class="d-servicios">' + (servicios || '<span class="d-serv" style="color:var(--d-text-ter)">Sin servicios publicados</span>') + '</div>' +
          '<div class="d-res-foot">' +
            '<div class="d-disp-status">' +
              '<span class="d-disp-dot"></span>' +
              '<span>Cita online en tiempo real</span>' +
            '</div>' +
            '<span class="d-cta">Ver horas libres' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
  }

  // Tarjeta compacta del carrusel: foto, nota, nombre y badge verificado.
  function mini(s, idx) {
    var rating = s.valoracion != null
      ? '<div class="d-mini-rating"><span class="n">' + esc(String(s.valoracion).replace('.', ',')) + '</span>' +
        '<span class="r">' + esc(s.resenas) + (Number(s.resenas) === 1 ? ' reseña' : ' reseñas') + '</span></div>'
      : '';

    var priceTier = calcularPrecioTier(s);

    return '<a class="d-mini" href="salon.html?s=' + encodeURIComponent(s.slug) + '">' +
        '<div class="d-mini-foto">' +
          fotoHtml(s, idx) +
          rating +
          '<span class="d-mini-tier">' + esc(priceTier.simbolo) + '</span>' +
        '</div>' +
        '<h3>' + esc(s.nombre || 'Salón') + '</h3>' +
        '<div class="dir">' + esc(zonaDe(s) || 'Dirección no indicada') + '</div>' +
      '</a>';
  }

  // Tarjeta de salon que NO usa Mecha (bloque de OpenStreetMap).
  function externo(s) {
    var zona = [s.direccion, s.ciudad].filter(Boolean).join(', ');

    var acciones = '';
    if (s.telefono) {
      acciones +=
        '<a class="d-ext-btn primaria" href="tel:' + esc(String(s.telefono).replace(/\s+/g, '')) + '">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
          'Llamar</a>';
    }
    if (s.lat != null && s.lng != null) {
      var punto = encodeURIComponent(s.lat + ',' + s.lng);
      acciones +=
        '<a class="d-ext-btn" href="https://www.google.com/maps/search/?api=1&query=' + punto + '" target="_blank" rel="noopener noreferrer">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          'Cómo llegar</a>';
    }

    return '<div class="d-ext">' +
        '<div class="d-ext-ini">' + esc(inicial(s.nombre)) + '</div>' +
        '<div class="d-ext-info">' +
          '<h3>' + esc(s.nombre || 'Salón') + '</h3>' +
          '<div class="dir">' + esc(zona || 'Dirección no indicada') + '</div>' +
          (acciones ? '<div class="d-ext-acciones">' + acciones + '</div>' : '') +
        '</div>' +
      '</div>';
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
    externo: externo,
    engancharFallback: engancharFallback,
    calcularBadges: calcularBadges,
    calcularPrecioTier: calcularPrecioTier
  };
})();
