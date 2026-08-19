/* ============================================================
   MECHA — Módulo de Mapa Interactivo con Geolocalización y Leaflet
   Carga perezosa (lazy-loading), pines con precio corporativos,
   sincronización bidireccional lista ↔ mapa y geolocalización HTML5.
   ============================================================ */

(function () {
  'use strict';

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

  // Coordenadas de referencia para ciudades y barrios principales (fallback geográfico)
  var COORDENADAS_REFERENCIA = {
    // Capitales
    'madrid': { lat: 40.4168, lng: -3.7038, zoom: 13 },
    'barcelona': { lat: 41.3851, lng: 2.1734, zoom: 13 },
    'valencia': { lat: 39.4699, lng: -0.3763, zoom: 13 },
    'sevilla': { lat: 37.3891, lng: -5.9845, zoom: 13 },
    'zaragoza': { lat: 41.6488, lng: -0.8891, zoom: 13 },
    'malaga': { lat: 36.7213, lng: -4.4214, zoom: 13 },
    'málaga': { lat: 36.7213, lng: -4.4214, zoom: 13 },
    'bilbao': { lat: 43.2630, lng: -2.9350, zoom: 13 },
    'a coruna': { lat: 43.3623, lng: -8.4115, zoom: 14 },
    'a coruña': { lat: 43.3623, lng: -8.4115, zoom: 14 },
    'coruna': { lat: 43.3623, lng: -8.4115, zoom: 14 },
    'coruña': { lat: 43.3623, lng: -8.4115, zoom: 14 },
    'alicante': { lat: 38.3452, lng: -0.4810, zoom: 13 },
    'palma': { lat: 39.5696, lng: 2.6502, zoom: 13 },
    'vigo': { lat: 42.2406, lng: -8.7207, zoom: 13 },
    'gijon': { lat: 43.5322, lng: -5.6611, zoom: 13 },
    'gijón': { lat: 43.5322, lng: -5.6611, zoom: 13 },
    'valladolid': { lat: 41.6523, lng: -4.7245, zoom: 13 },

    // Barrios Madrid
    'chamberi': { lat: 40.4340, lng: -3.7030, zoom: 15 },
    'chamberí': { lat: 40.4340, lng: -3.7030, zoom: 15 },
    'salamanca': { lat: 40.4297, lng: -3.6797, zoom: 15 },
    'malasana': { lat: 40.4260, lng: -3.7040, zoom: 15 },
    'malasaña': { lat: 40.4260, lng: -3.7040, zoom: 15 },
    'retiro': { lat: 40.4150, lng: -3.6820, zoom: 15 },
    'chueca': { lat: 40.4225, lng: -3.6980, zoom: 15 },
    'pozuelo': { lat: 40.4430, lng: -3.8150, zoom: 14 },
    'chamartin': { lat: 40.4620, lng: -3.6760, zoom: 15 },
    'chamartín': { lat: 40.4620, lng: -3.6760, zoom: 15 },
    'centro': { lat: 40.4170, lng: -3.7040, zoom: 15 },
    'moncloa': { lat: 40.4350, lng: -3.7190, zoom: 15 },
    'la latina': { lat: 40.4110, lng: -3.7110, zoom: 15 },

    // Barrios Barcelona
    'eixample': { lat: 41.3888, lng: 2.1590, zoom: 15 },
    'gracia': { lat: 41.4030, lng: 2.1560, zoom: 15 },
    'gràcia': { lat: 41.4030, lng: 2.1560, zoom: 15 },
    'sarria': { lat: 41.4000, lng: 2.1220, zoom: 14 },
    'sarrià': { lat: 41.4000, lng: 2.1220, zoom: 14 },
    'sant antoni': { lat: 41.3780, lng: 2.1610, zoom: 15 },
    'poblenou': { lat: 41.4000, lng: 2.2030, zoom: 15 },
    'ciutat vella': { lat: 41.3830, lng: 2.1760, zoom: 15 },
    'les corts': { lat: 41.3860, lng: 2.1280, zoom: 15 },
    'el born': { lat: 41.3855, lng: 2.1820, zoom: 15 }
  };

  var promesaLeaflet = null;
  var mapInstance = null;
  var marcadoresCapa = null;
  var capaUsuario = null;
  var mapaMarkers = {}; // slug/id -> L.Marker
  var ultimoBounds = null;
  var ubicacionUsuario = null; // { lat, lng }
  var onBuscarZonaCallback = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizar(t) {
    return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  // Carga perezosa (Lazy Load) de Leaflet JS & CSS
  function cargarLeaflet() {
    if (promesaLeaflet) return promesaLeaflet;

    promesaLeaflet = new Promise(function (resolve, reject) {
      if (window.L && window.L.map) {
        resolve(window.L);
        return;
      }

      // Inyectar CSS
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);

      // Inyectar JS
      var script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = function () {
        if (window.L) {
          resolve(window.L);
        } else {
          reject(new Error('Leaflet no pudo inicializarse correctamente.'));
        }
      };
      script.onerror = function () {
        reject(new Error('Error al descargar Leaflet desde CDN.'));
      };
      document.head.appendChild(script);
    });

    return promesaLeaflet;
  }

  // Cálculo de distancia en km (Fórmula de Haversine)
  function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    var R = 6371; // Radio de la tierra en km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  // Formato amigable de distancia y tiempo a pie / coche
  function formatearDistanciaYTiempo(distKm) {
    if (distKm == null || isNaN(distKm)) return null;
    var km = Number(distKm);
    var textoDist = km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
    var tiempoMinPie = Math.round(km * 12); // ~5 km/h walking pace
    var tiempoTexto = '';
    if (tiempoMinPie <= 20) {
      tiempoTexto = tiempoMinPie <= 1 ? '1 min a pie' : tiempoMinPie + ' min a pie';
    } else {
      var tiempoCoche = Math.max(2, Math.round(km * 2.2));
      tiempoTexto = tiempoCoche + ' min en coche';
    }
    return {
      distancia: textoDist,
      tiempo: tiempoTexto,
      badge: 'a ' + textoDist + ' · ' + tiempoTexto
    };
  }

  // Resolver coordenadas de un salón (propias o fallback)
  function resolverCoordenadas(s, idx) {
    if (s.lat != null && s.lng != null && !isNaN(Number(s.lat)) && !isNaN(Number(s.lng))) {
      return { lat: Number(s.lat), lng: Number(s.lng), exacto: true };
    }

    var ciudadNorm = normalizar(s.ciudad);
    var dirNorm = normalizar(s.direccion);

    // Buscar en diccionario de referencias
    var keys = Object.keys(COORDENADAS_REFERENCIA);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (ciudadNorm === k || dirNorm.indexOf(k) !== -1) {
        var base = COORDENADAS_REFERENCIA[k];
        // Si hay varios salones en la misma ciudad sin coordenadas exactas, dispersar sutilmente
        var offsetLat = ((idx % 5) - 2) * 0.0045;
        var offsetLng = (((idx * 2) % 5) - 2) * 0.0055;
        return {
          lat: base.lat + offsetLat,
          lng: base.lng + offsetLng,
          exacto: false
        };
      }
    }

    // Default España centro
    return { lat: 40.4168 + (idx * 0.003), lng: -3.7038 + (idx * 0.003), exacto: false };
  }

  // Extraer precio mínimo de un salón Mecha
  function obtenerPrecioMinimo(s) {
    var precios = (s.servicios || []).map(function (x) {
      if (x.precio != null) return Number(x.precio) || 0;
      if (x.precio_centimos != null) return (Number(x.precio_centimos) || 0) / 100;
      return 0;
    }).filter(function (p) { return p > 0; });

    if (precios.length > 0) {
      var min = Math.min.apply(null, precios);
      return Math.round(min) + ' €';
    }

    if (s.valoracion) {
      return '★ ' + String(s.valoracion).replace('.', ',');
    }

    return 'Ver cita';
  }

  // Inicializar instancia de Leaflet
  function inicializar(containerId, opciones) {
    var cont = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!cont) return Promise.reject(new Error('Contenedor de mapa no encontrado'));

    return cargarLeaflet().then(function (L) {
      if (mapInstance) {
        mapInstance.invalidateSize();
        return mapInstance;
      }

      var centroInicial = (opciones && opciones.centro) || [40.4168, -3.7038];
      var zoomInicial = (opciones && opciones.zoom) || 12;

      mapInstance = L.map(cont, {
        center: centroInicial,
        zoom: zoomInicial,
        zoomControl: false,
        attributionControl: true
      });

      // Controles de zoom abajo a la derecha
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

      // Capa de teselas CartoDB Positron / Voyager
      L.tileLayer(CARTO_TILES, {
        attribution: CARTO_ATTR,
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(mapInstance);

      marcadoresCapa = L.featureGroup().addTo(mapInstance);

      // Eventos de movimiento para "Buscar en esta zona"
      mapInstance.on('movestart', function () {
        if (!ultimoBounds) ultimoBounds = mapInstance.getBounds();
      });

      mapInstance.on('moveend', function () {
        if (onBuscarZonaCallback && ultimoBounds) {
          var actual = mapInstance.getBounds();
          var distancia = mapInstance.getCenter().distanceTo(ultimoBounds.getCenter());
          if (distancia > 600) { // Si el mapa se ha desplazado más de 600m
            mostrarBotonBuscarZona(true);
          }
        }
      });

      return mapInstance;
    });
  }

  // Generar HTML del Popup para un salón Mecha
  function crearPopupHtmlMecha(s, coords) {
    var fotoSrc = s.foto || null;
    var fotoHtml = fotoSrc
      ? '<img class="mecha-pop-foto" src="' + esc(fotoSrc) + '" alt="' + esc(s.nombre) + '" loading="lazy" />'
      : '<div class="mecha-pop-foto fallback">' + esc((s.nombre || 'M').charAt(0).toUpperCase()) + '</div>';

    var ratingHtml = s.valoracion != null
      ? '<div class="mecha-pop-rating">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="#f4501e"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
          '<strong>' + esc(String(s.valoracion).replace('.', ',')) + '</strong>' +
          '<span>(' + esc(s.resenas || 0) + ')</span>' +
        '</div>'
      : '';

    var distKm = s.distancia_km != null ? s.distancia_km : (ubicacionUsuario ? calcularDistanciaKm(ubicacionUsuario.lat, ubicacionUsuario.lng, coords.lat, coords.lng) : null);
    var distInfo = formatearDistanciaYTiempo(distKm);
    var distHtml = distInfo ? '<div class="mecha-pop-dist">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '<span>' + esc(distInfo.badge) + '</span>' +
    '</div>' : '';

    var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(coords.lat + ',' + coords.lng);
    var reservarUrl = 'salon.html?s=' + encodeURIComponent(s.slug);

    return '' +
      '<div class="mecha-popup-card">' +
        '<div class="mecha-pop-media">' +
          fotoHtml +
          '<span class="mecha-pop-badge-verif">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Verificado' +
          '</span>' +
        '</div>' +
        '<div class="mecha-pop-body">' +
          '<div class="mecha-pop-top">' +
            '<h3 class="mecha-pop-title">' + esc(s.nombre || 'Salón Mecha') + '</h3>' +
            ratingHtml +
          '</div>' +
          '<p class="mecha-pop-dir">' + esc(s.direccion || s.ciudad || 'Dirección disponible') + '</p>' +
          distHtml +
          '<div class="mecha-pop-actions">' +
            '<a class="mecha-pop-btn mecha-pop-btn-map" href="' + esc(gmapsUrl) + '" target="_blank" rel="noopener noreferrer" title="Cómo llegar con Google Maps">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>' +
              '<span>Cómo llegar</span>' +
            '</a>' +
            '<a class="mecha-pop-btn mecha-pop-btn-cta" href="' + esc(reservarUrl) + '">' +
              '<span>Reservar</span>' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Generar HTML del Popup para un salón externo (OSM)
  function crearPopupHtmlExterno(s, coords) {
    var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(coords.lat + ',' + coords.lng);
    var telHtml = s.telefono
      ? '<a class="mecha-pop-btn mecha-pop-btn-cta" href="tel:' + esc(String(s.telefono).replace(/\s+/g, '')) + '">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
          '<span>Llamar</span>' +
        '</a>'
      : '';

    return '' +
      '<div class="mecha-popup-card mecha-pop-ext">' +
        '<div class="mecha-pop-body" style="padding-top:14px">' +
          '<div class="mecha-pop-top">' +
            '<h3 class="mecha-pop-title">' + esc(s.nombre || 'Peluquería') + '</h3>' +
            '<span class="mecha-pop-tag-osm">Sin cita online</span>' +
          '</div>' +
          '<p class="mecha-pop-dir">' + esc(s.direccion || s.ciudad || 'Zona disponible') + '</p>' +
          '<div class="mecha-pop-actions">' +
            '<a class="mecha-pop-btn mecha-pop-btn-map" href="' + esc(gmapsUrl) + '" target="_blank" rel="noopener noreferrer">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>' +
              '<span>Cómo llegar</span>' +
            '</a>' +
            telHtml +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Actualizar la colección de marcadores en el mapa
  function actualizarSalones(salonesMecha, salonesExternos, opciones) {
    if (!mapInstance || !window.L) return;

    var L = window.L;
    marcadoresCapa.clearLayers();
    mapaMarkers = {};

    var bounds = L.latLngBounds();
    var tienePuntos = false;

    // 1. Salones Mecha (Pines corporativos con precio "Desde X €")
    (salonesMecha || []).forEach(function (s, idx) {
      var coords = resolverCoordenadas(s, idx);
      var precioTxt = obtenerPrecioMinimo(s);
      var slug = s.slug || ('mecha-' + idx);

      var iconHtml = '' +
        '<div class="mecha-pin mecha-pin-flame" data-slug="' + esc(slug) + '">' +
          '<div class="mecha-pin-bubble">' +
            '<span class="mecha-pin-dot"></span>' +
            '<span class="mecha-pin-label">' + esc(precioTxt) + '</span>' +
          '</div>' +
          '<div class="mecha-pin-tip"></div>' +
        '</div>';

      var customIcon = L.divIcon({
        className: 'mecha-marker-div',
        html: iconHtml,
        iconSize: [84, 38],
        iconAnchor: [42, 38],
        popupAnchor: [0, -38]
      });

      var marker = L.marker([coords.lat, coords.lng], {
        icon: customIcon,
        riseOnHover: true,
        title: s.nombre || 'Salón Mecha'
      });

      var popupContent = crearPopupHtmlMecha(s, coords);
      marker.bindPopup(popupContent, {
        className: 'mecha-leaflet-popup',
        maxWidth: 320,
        minWidth: 280,
        closeButton: false,
        offset: L.point(0, -10)
      });

      marker.on('click', function () {
        resaltarTarjetaEnLista(slug);
        mostrarPreviewCardMovil(s, coords, true);
      });

      marker.addTo(marcadoresCapa);
      mapaMarkers[slug] = marker;
      bounds.extend([coords.lat, coords.lng]);
      tienePuntos = true;
    });

    // 2. Salones Externos OSM (Pines secundarios en tono antracita)
    (salonesExternos || []).slice(0, 15).forEach(function (s, idx) {
      var coords = resolverCoordenadas(s, idx + 100);
      var idExt = 'ext-' + idx;

      var iconHtml = '' +
        '<div class="mecha-pin mecha-pin-osm" data-id="' + esc(idExt) + '">' +
          '<div class="mecha-pin-bubble">' +
            '<svg class="mecha-pin-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>' +
            '<span class="mecha-pin-label">OSM</span>' +
          '</div>' +
          '<div class="mecha-pin-tip"></div>' +
        '</div>';

      var customIcon = L.divIcon({
        className: 'mecha-marker-div',
        html: iconHtml,
        iconSize: [60, 32],
        iconAnchor: [30, 32],
        popupAnchor: [0, -32]
      });

      var marker = L.marker([coords.lat, coords.lng], {
        icon: customIcon,
        riseOnHover: true,
        title: s.nombre || 'Peluquería'
      });

      var popupContent = crearPopupHtmlExterno(s, coords);
      marker.bindPopup(popupContent, {
        className: 'mecha-leaflet-popup',
        maxWidth: 290,
        minWidth: 260,
        closeButton: false,
        offset: L.point(0, -8)
      });

      marker.on('click', function () {
        mostrarPreviewCardMovil(s, coords, false);
      });

      marker.addTo(marcadoresCapa);
      mapaMarkers[idExt] = marker;
      bounds.extend([coords.lat, coords.lng]);
      tienePuntos = true;
    });

    // Ajustar encuadre (Fit Bounds) con padding
    if (tienePuntos && (!opciones || opciones.ajustarZoom !== false)) {
      var fitOptions = { padding: [40, 40], maxZoom: 15 };
      mapInstance.fitBounds(bounds, fitOptions);
      ultimoBounds = mapInstance.getBounds();
    }
  }

  // Resaltar marcador en el mapa desde la lista (Hover / Focus)
  function resaltarSalon(slug) {
    if (!mapInstance || !slug) return;
    var marker = mapaMarkers[slug];
    if (!marker) return;

    var el = marker.getElement();
    if (el) {
      el.classList.add('mecha-pin-highlight');
      marker.setZIndexOffset(1000);
    }
  }

  // Quitar resalte del marcador
  function desresaltarSalon(slug) {
    if (!mapInstance) return;
    if (slug) {
      var marker = mapaMarkers[slug];
      if (marker) {
        var el = marker.getElement();
        if (el) el.classList.remove('mecha-pin-highlight');
        marker.setZIndexOffset(0);
      }
    } else {
      document.querySelectorAll('.mecha-pin-highlight').forEach(function (el) {
        el.classList.remove('mecha-pin-highlight');
      });
    }
  }

  // Hacer scroll suave en el listado para sincronizar mapa -> lista
  function resaltarTarjetaEnLista(slug) {
    if (!slug) return;
    var tarjeta = document.querySelector('a.d-res[href*="' + encodeURIComponent(slug) + '"]');
    if (!tarjeta) return;

    tarjeta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    tarjeta.classList.add('d-res-destacada');
    setTimeout(function () {
      tarjeta.classList.remove('d-res-destacada');
    }, 2000);
  }

  // Bottom Sheet / Preview flotante en móvil al tocar un marcador
  function mostrarPreviewCardMovil(s, coords, esMecha) {
    var cont = document.getElementById('mapa-preview-card');
    if (!cont) return;

    if (window.innerWidth > 1024) {
      cont.hidden = true;
      return;
    }

    if (esMecha) {
      cont.innerHTML = '' +
        '<div class="d-map-sheet">' +
          '<button type="button" class="d-sheet-close" id="btn-cerrar-sheet" aria-label="Cerrar">&times;</button>' +
          crearPopupHtmlMecha(s, coords) +
        '</div>';
    } else {
      cont.innerHTML = '' +
        '<div class="d-map-sheet">' +
          '<button type="button" class="d-sheet-close" id="btn-cerrar-sheet" aria-label="Cerrar">&times;</button>' +
          crearPopupHtmlExterno(s, coords) +
        '</div>';
    }

    cont.hidden = false;

    var btnCerrar = document.getElementById('btn-cerrar-sheet');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', function () {
        cont.hidden = true;
      });
    }
  }

  // Control "Buscar en esta zona"
  function mostrarBotonBuscarZona(visible) {
    var btn = document.getElementById('mapa-buscar-zona');
    if (!btn) return;
    btn.hidden = !visible;
  }

  function alBuscarEnEstaZona(callback) {
    onBuscarZonaCallback = callback;
    var btn = document.getElementById('mapa-buscar-zona');
    if (btn) {
      btn.addEventListener('click', function () {
        mostrarBotonBuscarZona(false);
        if (mapInstance && onBuscarZonaCallback) {
          ultimoBounds = mapInstance.getBounds();
          var centro = mapInstance.getCenter();
          onBuscarZonaCallback({
            lat: centro.lat,
            lng: centro.lng,
            bounds: ultimoBounds
          });
        }
      });
    }
  }

  // Geolocalización HTML5 "Cerca de Mí"
  function geolocalizar(onSuccess, onError) {
    if (!navigator.geolocation) {
      if (onError) onError('Tu navegador no es compatible con la geolocalización.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        ubicacionUsuario = { lat: lat, lng: lng };

        cargarLeaflet().then(function (L) {
          if (mapInstance) {
            // Añadir o actualizar marcador de usuario
            if (capaUsuario) mapInstance.removeLayer(capaUsuario);

            var userIcon = L.divIcon({
              className: 'mecha-user-location-marker',
              html: '<div class="mecha-user-pulse"></div><div class="mecha-user-dot"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            capaUsuario = L.marker([lat, lng], {
              icon: userIcon,
              zIndexOffset: 2000,
              title: 'Tu ubicación'
            }).addTo(mapInstance);

            mapInstance.flyTo([lat, lng], 14, { duration: 1.2 });
          }
          if (onSuccess) onSuccess({ lat: lat, lng: lng });
        });
      },
      function (err) {
        var msg = 'No hemos podido acceder a tu ubicación.';
        if (err.code === 1) { // PERMISSION_DENIED
          msg = 'Permiso de ubicación denegado. Escribe tu ciudad o barrio en el buscador.';
        } else if (err.code === 2) { // POSITION_UNAVAILABLE
          msg = 'Tu ubicación actual no está disponible en este momento.';
        } else if (err.code === 3) { // TIMEOUT
          msg = 'Se ha agotado el tiempo de espera para obtener tu ubicación.';
        }
        if (onError) onError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  // Forzar redibujado de tamaño (al cambiar entre vista lista y mapa)
  function recalcularTamano() {
    if (mapInstance) {
      setTimeout(function () {
        mapInstance.invalidateSize();
      }, 100);
    }
  }

  // API pública del módulo
  window.MechaMapa = {
    cargarLeaflet: cargarLeaflet,
    inicializar: inicializar,
    actualizarSalones: actualizarSalones,
    resaltarSalon: resaltarSalon,
    desresaltarSalon: desresaltarSalon,
    geolocalizar: geolocalizar,
    recalcularTamano: recalcularTamano,
    alBuscarEnEstaZona: alBuscarEnEstaZona,
    calcularDistanciaKm: calcularDistanciaKm,
    formatearDistanciaYTiempo: formatearDistanciaYTiempo,
    resolverCoordenadas: resolverCoordenadas,
    obtenerUbicacionUsuario: function () { return ubicacionUsuario; }
  };
})();
