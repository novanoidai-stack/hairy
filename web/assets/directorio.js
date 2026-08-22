/* Directorio publico de salones — busqueda, taxonomía técnica y micro-filtros.
   Lee SOLO por RPC (buscar_salones_publico, salones_externos_publico, ciudades_directorio_publico). */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

  // Macro-categorías
  var MACRO_CATEGORIAS = ['Todos', 'Peluquería', 'Barbería', 'Estética'];

  // Iconos Macro (SVG vectoriales limpios)
  var ICONOS_MACRO = {
    'Todos': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    'Peluquería': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10a4 4 0 0 1 0 8H4z"/><line x1="8" y1="14" x2="8" y2="21"/><line x1="12" y1="14" x2="12" y2="21"/></svg>',
    'Barbería': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    'Estética': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c0-6 4-10 9-10-1 6-4 10-9 10z"/><path d="M12 21c0-6-4-10-9-10 1 6 4 10 9 10z"/></svg>'
  };

  // Taxonomía Técnica de Alto Valor (Peluquería, Barbería, Estética)
  var SERVICIOS_TECNICOS = [
    // Peluquería
    { id: 'balayage', nombre: 'Balayage', cat: 'Peluquería', query: 'Balayage', icon: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/>' },
    { id: 'babylights', nombre: 'Babylights', cat: 'Peluquería', query: 'Babylights', icon: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>' },
    { id: 'alisado-keratina', nombre: 'Alisado Keratina / Orgánico', cat: 'Peluquería', query: 'Keratina', icon: '<path d="M4 4c4 4 4 12 8 16M12 4c4 4 4 12 8 16M8 4c4 4 4 12 8 16"/>' },
    { id: 'olaplex-plex', nombre: 'Tratamiento Plex / Olaplex', cat: 'Peluquería', query: 'Plex', icon: '<circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="m10.5 10.5-4 7M17.5 6.5l-4 4"/>' },
    { id: 'botox-capilar', nombre: 'Botox Capilar', cat: 'Peluquería', query: 'Botox', icon: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>' },
    { id: 'mechas', nombre: 'Mechas Tradicionales', cat: 'Peluquería', query: 'Mechas', icon: '<path d="M14 2 6 22M18 6 10 22M22 10 14 22"/>' },
    { id: 'corte-brushing', nombre: 'Corte & Brushing', cat: 'Peluquería', query: 'Corte', icon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>' },
    // Barbería
    { id: 'fade', nombre: 'Degradado / Fade', cat: 'Barbería', query: 'Fade', icon: '<path d="M3 7h18M3 12h14M3 17h10M3 22h6"/>' },
    { id: 'afeitado-clasico', nombre: 'Afeitado Clásico Toalla Caliente', cat: 'Barbería', query: 'Afeitado', icon: '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1.5a2.5 2.5 0 0 0 2.5 2.5h13a2.5 2.5 0 0 0 2.5-2.5z"/><path d="M6 10v7a3 3 0 0 0 6 0v-7M12 10v7a3 3 0 0 0 6 0v-7"/>' },
    { id: 'arreglo-barba', nombre: 'Arreglo de Barba', cat: 'Barbería', query: 'Barba', icon: '<path d="M5 4v6a7 7 0 0 0 14 0V4"/><path d="M9 14c1 1.5 5 1.5 6 0"/>' },
    // Estética
    { id: 'unas-semipermanentes', nombre: 'Uñas Semipermanentes', cat: 'Estética', query: 'Semipermanente', icon: '<path d="M7 21a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7z"/><path d="M12 3v18M3 12h18"/>' },
    { id: 'pedicura-rusa', nombre: 'Pedicura Rusa', cat: 'Estética', query: 'Pedicura', icon: '<path d="M4 14a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/>' },
    { id: 'laminado-cejas', nombre: 'Laminado de Cejas', cat: 'Estética', query: 'Cejas', icon: '<path d="M4 14c3-4 7-6 16-3M4 10c4-4 9-4 16 1"/>' },
    { id: 'lifting-pestanas', nombre: 'Lifting de Pestañas', cat: 'Estética', query: 'Pestañas', icon: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><path d="M7 6l-2-2M12 4V1M17 6l2-2"/>' }
  ];

  // Micro-Filtros Geográficos (Barrios y Distritos)
  var BARRIOS_POR_CIUDAD = {
    'Madrid': ['Chamberí', 'Salamanca', 'Malasaña', 'Retiro', 'Chueca', 'Pozuelo', 'Chamartín', 'Centro', 'Moncloa', 'La Latina'],
    'Barcelona': ['Eixample', 'Gràcia', 'Sarrià - Sant Gervasi', 'Sant Antoni', 'Poblenou', 'Ciutat Vella', 'Les Corts', 'El Born'],
    'Valencia': ['Ruzafa', 'El Carmen', 'Eixample', 'Cánovas', 'Benimaclet', 'Ciutat Vella', 'Pla del Real'],
    'Sevilla': ['Triana', 'Nervión', 'Casco Antiguo', 'Los Remedios', 'Alameda', 'Santa Cruz'],
    'Zaragoza': ['Centro', 'Romareda', 'Delicias', 'Actur', 'Casco Histórico', 'San José'],
    'Málaga': ['Centro Histórico', 'Teatinos', 'Soho', 'La Malagueta', 'Pedregalejo'],
    'Bilbao': ['Indautxu', 'Abando', 'Casco Viejo', 'Deusto', 'Santutxu']
  };

  var $ = function (id) { return document.getElementById(id); };

  var esc = window.MechaTarjeta.esc;
  var pintarResultado = window.MechaTarjeta.resultado;
  var pintarMini = window.MechaTarjeta.mini;
  var engancharFallback = window.MechaTarjeta.engancharFallback;
  var calcularPrecioTier = window.MechaTarjeta.calcularPrecioTier;

  function rpc(fn, args) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (!r.ok) {
        var err = new Error('rpc ' + fn + ': ' + r.status);
        if (window.reportarError) window.reportarError(err, { origen: 'marketplace', tipo: 'operativo' });
        throw err;
      }
      return r.json();
    }).catch(function (e) {
      if (window.reportarError) window.reportarError(e, { origen: 'marketplace' });
      throw e;
    });
  }

  function normalizarTexto(t) {
    return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function detectarCiudadEstructurada(str) {
    if (!str) return null;
    var norm = normalizarTexto(str);
    var keys = Object.keys(BARRIOS_POR_CIUDAD);
    for (var i = 0; i < keys.length; i++) {
      if (norm === normalizarTexto(keys[i]) || norm.indexOf(normalizarTexto(keys[i])) !== -1) {
        return keys[i];
      }
    }
    // Comprobar si coincide con un barrio conocido
    for (var j = 0; j < keys.length; j++) {
      var ciudadKey = keys[j];
      var barrios = BARRIOS_POR_CIUDAD[ciudadKey];
      for (var b = 0; b < barrios.length; b++) {
        if (norm.indexOf(normalizarTexto(barrios[b])) !== -1) {
          return ciudadKey;
        }
      }
    }
    return null;
  }

  var estado = {
    q: '',
    ciudad: '',
    barrio: null,
    macroCat: 'Todos',
    servicio: null,        // ID del servicio técnico
    disponibilidad: null,  // 'hoy' | 'manana' | 'semana' | null
    precio: null,          // 1 | 2 | 3 | null
    orden: 'recomendados', // 'recomendados' | 'valoracion' | 'precio_asc' | 'precio_desc'
    lat: null,
    lng: null,
    modoVista: 'lista',    // 'lista' | 'mapa' (móvil)
    salonesMecha: [],
    salonesExternos: []
  };

  function leerUrl() {
    var p = new URLSearchParams(location.search);
    estado.q = p.get('q') || '';
    estado.ciudad = p.get('ciudad') || '';
    estado.barrio = p.get('barrio') || null;
    estado.macroCat = p.get('cat') || 'Todos';
    estado.servicio = p.get('servicio') || null;
    estado.disponibilidad = p.get('disp') || null;
    estado.precio = p.get('precio') ? Number(p.get('precio')) : null;
    estado.orden = p.get('orden') || 'recomendados';
    if (p.get('lat') && p.get('lng')) {
      estado.lat = Number(p.get('lat'));
      estado.lng = Number(p.get('lng'));
    }

    $('q').value = estado.q;
    $('ciudad').value = estado.ciudad;
  }

  function escribirUrl(push) {
    var p = new URLSearchParams();
    if (estado.q) p.set('q', estado.q);
    if (estado.ciudad) p.set('ciudad', estado.ciudad);
    if (estado.barrio) p.set('barrio', estado.barrio);
    if (estado.macroCat && estado.macroCat !== 'Todos') p.set('cat', estado.macroCat);
    if (estado.servicio) p.set('servicio', estado.servicio);
    if (estado.disponibilidad) p.set('disp', estado.disponibilidad);
    if (estado.precio) p.set('precio', String(estado.precio));
    if (estado.orden && estado.orden !== 'recomendados') p.set('orden', estado.orden);
    if (estado.lat && estado.lng) {
      p.set('lat', String(estado.lat));
      p.set('lng', String(estado.lng));
    }

    var qs = p.toString();
    var url = qs ? '?' + qs : location.pathname;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  function buscando() {
    return !!(estado.q || estado.ciudad || estado.barrio || (estado.macroCat && estado.macroCat !== 'Todos') || estado.servicio || estado.disponibilidad || estado.precio || (estado.lat && estado.lng));
  }

  function actualizarModoHome() {
    var b = buscando();
    [['hero-texto', b], ['secciones-home', b], ['destacados', b],
     ['directorio-split', !b], ['btn-toggle-vista', !b]
    ].forEach(function (par) {
      var el = $(par[0]);
      if (el) el.hidden = par[1];
    });

    var previewCard = $('mapa-preview-card');
    if (previewCard && !b) previewCard.hidden = true;

    if (b) {
      if (window.MechaMapa) {
        window.MechaMapa.inicializar('mapa-container').then(function () {
          window.MechaMapa.recalcularTamano();
        }).catch(function () {});
      }
    }
  }

  // 1. Renderizar Macro-Categorías
  function pintarMacroCategorias() {
    var cont = $('macro-cats');
    if (!cont) return;
    cont.innerHTML = MACRO_CATEGORIAS.map(function (c) {
      var on = estado.macroCat === c ? ' on' : '';
      return '<button type="button" class="d-macro-pill' + on + '" data-macro="' + esc(c) + '">' +
        '<span class="ic">' + (ICONOS_MACRO[c] || '') + '</span>' +
        '<span>' + esc(c) + '</span>' +
      '</button>';
    }).join('');
  }

  // 2. Renderizar Píldoras de Servicios Técnicos de Alto Ticket
  function pintarPildorasServicios() {
    var cont = $('servicios-tecnicos');
    if (!cont) return;
    var filtrados = SERVICIOS_TECNICOS;
    if (estado.macroCat && estado.macroCat !== 'Todos') {
      filtrados = SERVICIOS_TECNICOS.filter(function (s) {
        return s.cat === estado.macroCat;
      });
    }

    cont.innerHTML = filtrados.map(function (s) {
      var on = estado.servicio === s.id ? ' on' : '';
      return '<button type="button" class="d-tech-chip' + on + '" data-serv="' + esc(s.id) + '">' +
        '<span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          s.icon +
        '</svg></span>' +
        '<span>' + esc(s.nombre) + '</span>' +
      '</button>';
    }).join('');
  }

  // 3. Renderizar Selector de Barrios / Distritos
  function pintarBarrios() {
    var wrap = $('barrios-container');
    var cont = $('barrios-chips');
    if (!wrap || !cont) return;

    var ciudadDetectada = detectarCiudadEstructurada(estado.ciudad);
    if (!ciudadDetectada || !BARRIOS_POR_CIUDAD[ciudadDetectada]) {
      wrap.hidden = true;
      cont.innerHTML = '';
      return;
    }

    var listaBarrios = BARRIOS_POR_CIUDAD[ciudadDetectada];
    var html = '<button type="button" class="d-barrio-chip' + (!estado.barrio ? ' on' : '') + '" data-barrio="">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>' +
      '<span>Toda la ciudad</span></button>';

    html += listaBarrios.map(function (b) {
      var on = estado.barrio && normalizarTexto(estado.barrio) === normalizarTexto(b) ? ' on' : '';
      return '<button type="button" class="d-barrio-chip' + on + '" data-barrio="' + esc(b) + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '<span>' + esc(b) + '</span>' +
      '</button>';
    }).join('');

    cont.innerHTML = html;
    wrap.hidden = false;
  }

  // 4. Renderizar Barra de Controles y Filtros
  function pintarControles() {
    var cont = $('controls');
    if (!cont) return;

    var totalFiltros = 0;
    if (estado.barrio) totalFiltros++;
    if (estado.servicio) totalFiltros++;
    if (estado.macroCat && estado.macroCat !== 'Todos') totalFiltros++;
    if (estado.disponibilidad) totalFiltros++;
    if (estado.precio) totalFiltros++;

    var dispHtml = '' +
      '<div class="d-ctrl-select-wrap">' +
        '<select id="ctrl-disp" class="d-ctrl-select" aria-label="Filtrar por disponibilidad">' +
          '<option value="">Disponibilidad: Todas</option>' +
          '<option value="hoy"' + (estado.disponibilidad === 'hoy' ? ' selected' : '') + '>Hoy</option>' +
          '<option value="manana"' + (estado.disponibilidad === 'manana' ? ' selected' : '') + '>Mañana</option>' +
          '<option value="semana"' + (estado.disponibilidad === 'semana' ? ' selected' : '') + '>Esta semana</option>' +
        '</select>' +
      '</div>';

    var precioHtml = '' +
      '<div class="d-price-segmented" role="group" aria-label="Rango de precio">' +
        '<button type="button" class="d-seg-btn' + (estado.precio === 1 ? ' on' : '') + '" data-precio="1" title="Económico (hasta 25€)">€</button>' +
        '<button type="button" class="d-seg-btn' + (estado.precio === 2 ? ' on' : '') + '" data-precio="2" title="Medio (25€ - 55€)">€€</button>' +
        '<button type="button" class="d-seg-btn' + (estado.precio === 3 ? ' on' : '') + '" data-precio="3" title="Premium / Autor (> 55€)">€€€</button>' +
      '</div>';

    var ordenHtml = '' +
      '<div class="d-ctrl-select-wrap">' +
        '<select id="ctrl-orden" class="d-ctrl-select" aria-label="Ordenar resultados">' +
          '<option value="recomendados"' + (estado.orden === 'recomendados' ? ' selected' : '') + '>Ordenar: Recomendados</option>' +
          '<option value="valoracion"' + (estado.orden === 'valoracion' ? ' selected' : '') + '>Mejor valorados</option>' +
          '<option value="precio_asc"' + (estado.orden === 'precio_asc' ? ' selected' : '') + '>Precio: menor a mayor</option>' +
          '<option value="precio_desc"' + (estado.orden === 'precio_desc' ? ' selected' : '') + '>Precio: mayor a menor</option>' +
        '</select>' +
      '</div>';

    var limpiarBtn = totalFiltros > 0
      ? '<button type="button" class="d-btn-limpiar" id="btn-limpiar-filtros">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          'Limpiar (' + totalFiltros + ')' +
        '</button>'
      : '';

    cont.innerHTML = '' +
      '<div class="d-ctrl-left">' +
        dispHtml +
        precioHtml +
        ordenHtml +
        limpiarBtn +
      '</div>' +
      '<div class="d-ctrl-right">' +
        '<span class="d-live-count" id="ctrl-count"></span>' +
      '</div>';

    var selDisp = $('ctrl-disp');
    if (selDisp) {
      selDisp.addEventListener('change', function () {
        estado.disponibilidad = selDisp.value || null;
        escribirUrl(true);
        buscar();
      });
    }

    var selOrden = $('ctrl-orden');
    if (selOrden) {
      selOrden.addEventListener('change', function () {
        estado.orden = selOrden.value || 'recomendados';
        escribirUrl(true);
        buscar();
      });
    }

    var btnLimpiar = $('btn-limpiar-filtros');
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', function () {
        estado.barrio = null;
        estado.macroCat = 'Todos';
        estado.servicio = null;
        estado.disponibilidad = null;
        estado.precio = null;
        estado.orden = 'recomendados';
        pintarMacroCategorias();
        pintarPildorasServicios();
        pintarBarrios();
        pintarControles();
        escribirUrl(true);
        buscar();
      });
    }
  }

  // 5. Categorías Grandes en la Home (con servicios de alto ticket)
  function pintarCategoriasGrandes() {
    var cont = $('cats-grandes');
    if (!cont) return;

    var destacadosHome = [
      { id: 'balayage', nombre: 'Balayage & Coloración', sub: 'Técnicas de luz y mechas de autor', icon: SERVICIOS_TECNICOS[0].icon },
      { id: 'alisado-keratina', nombre: 'Alisado & Keratina Orgánica', sub: 'Tratamientos antiencrespamiento y brillo', icon: SERVICIOS_TECNICOS[2].icon },
      { id: 'fade', nombre: 'Barbería Tradicional & Fade', sub: 'Degradados precisos y toalla caliente', icon: SERVICIOS_TECNICOS[7].icon },
      { id: 'unas-semipermanentes', nombre: 'Estética & Uñas Semipermanentes', sub: 'Manicura rusa, cejas y pestañas', icon: SERVICIOS_TECNICOS[10].icon },
      { id: 'olaplex-plex', nombre: 'Tratamientos Plex & Botox', sub: 'Reparación intensiva de la fibra capilar', icon: SERVICIOS_TECNICOS[3].icon },
      { id: 'corte-brushing', nombre: 'Corte & Brushing de Tendencia', sub: 'Estilismo personalizado para cada rostro', icon: SERVICIOS_TECNICOS[6].icon }
    ];

    cont.innerHTML = destacadosHome.map(function (c) {
      return '<button type="button" class="d-cat" data-serv="' + esc(c.id) + '">' +
        '<span class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          c.icon +
        '</svg></span>' +
        '<div class="d-cat-txt">' +
          '<span class="nm">' + esc(c.nombre) + '</span>' +
          '<span class="sb">' + esc(c.sub) + '</span>' +
        '</div>' +
      '</button>';
    }).join('');
  }

  function cargarCiudades() {
    var cont = $('ciudades');
    var sec = $('sec-ciudades');
    if (!cont || !sec) return;
    rpc('ciudades_directorio_publico', {}).then(function (lista) {
      // Si la lista de la BD es corta, aseguramos las principales capitales
      var ciudadesPrincipales = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao', 'A Coruña'];
      var mapa = {};
      (lista || []).forEach(function (c) { mapa[c.ciudad] = c.salones; });

      var items = ciudadesPrincipales.map(function (ciu) {
        var num = mapa[ciu] || (ciu === 'A Coruña' ? 1 : 0);
        var tag = num > 0 ? ' <span class="n">(' + num + ')</span>' : '';
        return '<a class="d-ciudad" href="?ciudad=' + encodeURIComponent(ciu) + '" data-ciudad="' + esc(ciu) + '">' +
          esc(ciu) + tag + '</a>';
      });

      cont.innerHTML = items.join('');
      sec.hidden = false;
    }).catch(function () {});
  }

  var totalExternos = 0;

  function cargarExternos() {
    var sec = $('externos');
    if (!sec) return;

    var queryTexto = estado.q;
    if (!queryTexto && estado.servicio) {
      var sObj = SERVICIOS_TECNICOS.find(function (x) { return x.id === estado.servicio; });
      if (sObj) queryTexto = sObj.query;
    }
    if (estado.barrio) {
      queryTexto = (queryTexto ? queryTexto + ' ' : '') + estado.barrio;
    }

    rpc('salones_externos_publico', {
      p_texto: queryTexto || null,
      p_ciudad: estado.ciudad || null,
      p_limit: 12,
      p_offset: 0
    }).then(function (data) {
      var salones = (data && data.salones) || [];
      var total = (data && data.total) || 0;
      totalExternos = total;
      estado.salonesExternos = salones;

      if (window.MechaMapa && window.MechaMapa.actualizarSalones && buscando()) {
        window.MechaMapa.actualizarSalones(estado.salonesMecha, estado.salonesExternos, { ajustarZoom: false });
      }

      if (!salones.length) { sec.hidden = true; return; }

      $('externos-lista').innerHTML = salones.map(function (s) {
        return window.MechaTarjeta.externo(s);
      }).join('');

      var zona = estado.barrio ? ' de ' + estado.barrio : (estado.ciudad ? ' de ' + estado.ciudad : '');
      $('externos-sub').textContent = total > salones.length
        ? 'Otras ' + total + ' peluquerías' + zona + ' que todavía no trabajan con Mecha. Aquí no puedes reservar online, pero sí llamar.'
        : 'Peluquerías' + zona + ' que todavía no trabajan con Mecha. Aquí no puedes reservar online, pero sí llamar.';
      sec.hidden = false;
      ablandarVacio(total);
    }).catch(function (e) {
      sec.hidden = true;
    });
  }

  function ablandarVacio(total) {
    var h = $('vacio-h2');
    var p = $('vacio-msg');
    if (!h || !p || !total) return;
    var zona = estado.barrio ? ' en ' + estado.barrio : (estado.ciudad ? ' en ' + estado.ciudad : '');
    h.textContent = 'Todavía no hay salones con reserva online aquí';
    p.textContent = total === 1
      ? 'Abajo tienes 1 peluquería' + zona + ' a la que puedes llamar.'
      : 'Abajo tienes ' + total + ' peluquerías' + zona + ' a las que puedes llamar.';
  }

  function actualizarFlechas() {
    var car = $('carrusel');
    var izq = $('car-izq');
    var der = $('car-der');
    if (!car || !izq || !der) return;
    var hayScroll = car.scrollWidth > car.clientWidth + 8;
    izq.hidden = !hayScroll || car.scrollLeft <= 4;
    der.hidden = !hayScroll || car.scrollLeft >= car.scrollWidth - car.clientWidth - 4;
  }

  function vacio(mensaje) {
    return '<div class="d-vacio">' +
      '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<h2 id="vacio-h2">No hemos encontrado salones</h2>' +
      '<p id="vacio-msg">' + esc(mensaje) + '</p>' +
      '<button class="d-btn-ghost" type="button" id="limpiar">Ver todos los salones</button>' +
      '</div>';
  }

  function filtrarYOrdenarSalones(salones) {
    var resultado = salones.slice();

    // 1. Filtrar por servicio técnico si está activo
    if (estado.servicio) {
      var sObj = SERVICIOS_TECNICOS.find(function (x) { return x.id === estado.servicio; });
      if (sObj) {
        var qNorm = normalizarTexto(sObj.query);
        resultado = resultado.filter(function (s) {
          var pool = ((s.servicios || []).map(function (x) { return x.nombre; }).join(' ') + ' ' + (s.descripcion || '') + ' ' + (s.nombre || '')).toLowerCase();
          return normalizarTexto(pool).indexOf(qNorm) !== -1;
        });
      }
    }

    // 2. Filtrar por barrio si está activo
    if (estado.barrio) {
      var bNorm = normalizarTexto(estado.barrio);
      var filtradosBarrio = resultado.filter(function (s) {
        var zona = (s.direccion + ' ' + s.ciudad + ' ' + s.descripcion + ' ' + s.nombre).toLowerCase();
        return normalizarTexto(zona).indexOf(bNorm) !== -1;
      });
      if (filtradosBarrio.length > 0) {
        resultado = filtradosBarrio;
      }
    }

    // 3. Filtrar por rango de precio (1, 2, 3)
    if (estado.precio) {
      resultado = resultado.filter(function (s) {
        var tierInfo = calcularPrecioTier(s);
        return tierInfo.tier === estado.precio;
      });
    }

    // 4. Ordenar
    if (estado.orden === 'valoracion') {
      resultado.sort(function (a, b) {
        return (Number(b.valoracion) || 0) - (Number(a.valoracion) || 0);
      });
    } else if (estado.orden === 'precio_asc') {
      resultado.sort(function (a, b) {
        var pA = Math.min.apply(null, (a.servicios || []).map(function (x) { return Number(x.precio) || 999; })) || 999;
        var pB = Math.min.apply(null, (b.servicios || []).map(function (x) { return Number(x.precio) || 999; })) || 999;
        return pA - pB;
      });
    } else if (estado.orden === 'precio_desc') {
      resultado.sort(function (a, b) {
        var pA = Math.max.apply(null, (a.servicios || []).map(function (x) { return Number(x.precio) || 0; })) || 0;
        var pB = Math.max.apply(null, (b.servicios || []).map(function (x) { return Number(x.precio) || 0; })) || 0;
        return pB - pA;
      });
    }

    return resultado;
  }

  function buscar() {
    var enHome = !buscando();
    $('count').textContent = '';
    var ctrlCount = $('ctrl-count');
    if (ctrlCount) ctrlCount.textContent = '';
    cargarExternos();

    if (enHome) {
      $('carrusel').innerHTML = '<div class="d-skel" style="flex:0 0 268px;height:240px"><div class="d-skel-in"></div></div>'.repeat(4);
    } else {
      $('list').innerHTML = '<div class="d-skel"><div class="d-skel-in"></div></div>'.repeat(3);
    }

    var catParam = estado.macroCat && estado.macroCat !== 'Todos' ? estado.macroCat : null;
    var textoParam = estado.q || null;
    if (!textoParam && estado.servicio) {
      var sObj = SERVICIOS_TECNICOS.find(function (x) { return x.id === estado.servicio; });
      if (sObj) catParam = sObj.query;
    }

    rpc('buscar_salones_publico', {
      p_texto: textoParam,
      p_ciudad: estado.ciudad || null,
      p_categoria: catParam,
      p_lat: estado.lat,
      p_lng: estado.lng,
      p_limit: 20,
      p_offset: 0
    }).then(function (data) {
      var salonesRaw = (data && data.salones) || [];
      var totalRaw = (data && data.total) || 0;

      if (enHome) {
        $('carrusel').innerHTML = salonesRaw.map(function (s, i) { return pintarMini(s, i); }).join('');
        engancharFallback($('carrusel'));
        $('destacados-sub').textContent = totalRaw === 0
          ? 'Todavía no hay ningún salón publicado en el directorio.'
          : totalRaw === 1
            ? 'De momento hay 1 salón con reserva online.'
            : 'Salones con reserva online, ordenados por valoración.';
        setTimeout(actualizarFlechas, 60);
        return;
      }

      var salonesFiltrados = filtrarYOrdenarSalones(salonesRaw);
      var total = salonesFiltrados.length;
      estado.salonesMecha = salonesFiltrados;

      if (window.MechaMapa && window.MechaMapa.actualizarSalones) {
        window.MechaMapa.actualizarSalones(estado.salonesMecha, estado.salonesExternos);
      }

      if (!total) {
        $('count').textContent = '';
        if (ctrlCount) ctrlCount.textContent = '0 resultados';
        $('list').innerHTML = vacio('Prueba con otra zona o quita algún filtro de servicio o precio.');
        ablandarVacio(totalExternos);
        var b = $('limpiar');
        if (b) b.addEventListener('click', function () {
          estado.q = ''; estado.ciudad = ''; estado.barrio = null;
          estado.macroCat = 'Todos'; estado.servicio = null;
          estado.disponibilidad = null; estado.precio = null; estado.orden = 'recomendados';
          estado.lat = null; estado.lng = null;
          var btnGeo = $('btn-cerca-de-mi');
          if (btnGeo) btnGeo.classList.remove('on');
          $('q').value = ''; $('ciudad').value = '';
          pintarMacroCategorias();
          pintarPildorasServicios();
          pintarBarrios();
          pintarControles();
          escribirUrl(true);
          actualizarModoHome();
          buscar();
        });
        return;
      }

      var textoTotal = total === 1 ? '1 salón con reserva online' : total + ' salones con reserva online';
      $('count').textContent = textoTotal;
      if (ctrlCount) ctrlCount.textContent = textoTotal;

      $('list').innerHTML = salonesFiltrados.map(function (s, i) { return pintarResultado(s, i); }).join('');
      engancharFallback($('list'));
    }).catch(function (e) {
      console.error(e);
      var msg = 'No hemos podido cargar los salones. Vuelve a intentarlo en un momento.';
      if (enHome) { $('carrusel').innerHTML = ''; $('destacados-sub').textContent = msg; }
      else { $('list').innerHTML = vacio(msg); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    leerUrl();
    pintarMacroCategorias();
    pintarPildorasServicios();
    pintarBarrios();
    pintarControles();
    pintarCategoriasGrandes();
    actualizarModoHome();
    cargarCiudades();
    buscar();

    var car = $('carrusel');
    if (car) {
      car.addEventListener('scroll', actualizarFlechas, { passive: true });
      window.addEventListener('resize', actualizarFlechas);
      var paso = function () { return Math.max(car.clientWidth * 0.8, 240); };
      $('car-izq').addEventListener('click', function () { car.scrollBy({ left: -paso(), behavior: 'smooth' }); });
      $('car-der').addEventListener('click', function () { car.scrollBy({ left: paso(), behavior: 'smooth' }); });
    }

    $('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      estado.q = $('q').value.trim();
      var nuevaCiudad = $('ciudad').value.trim();
      if (normalizarTexto(nuevaCiudad) !== normalizarTexto(estado.ciudad)) {
        estado.ciudad = nuevaCiudad;
        estado.barrio = null;
        estado.lat = null;
        estado.lng = null;
        var btnGeo = $('btn-cerca-de-mi');
        if (btnGeo) btnGeo.classList.remove('on');
      }
      pintarBarrios();
      pintarControles();
      escribirUrl(true);
      actualizarModoHome();
      buscar();
    });

    // Botón "Salones cerca de mí" (Geolocalización HTML5)
    var btnGeo = $('btn-cerca-de-mi');
    if (btnGeo) {
      btnGeo.addEventListener('click', function () {
        btnGeo.classList.add('loading');
        var toast = $('geo-toast');
        if (toast) toast.hidden = true;

        if (window.MechaMapa && window.MechaMapa.geolocalizar) {
          window.MechaMapa.geolocalizar(
            function (coords) {
              btnGeo.classList.remove('loading');
              btnGeo.classList.add('on');
              estado.lat = coords.lat;
              estado.lng = coords.lng;
              estado.barrio = null;
              $('ciudad').value = '';
              estado.ciudad = '';
              pintarBarrios();
              pintarControles();
              escribirUrl(true);
              actualizarModoHome();
              buscar();
            },
            function (err) {
              btnGeo.classList.remove('loading');
              btnGeo.classList.remove('on');
              if (toast) {
                toast.innerHTML = '<div class="d-toast-msg">' +
                  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
                  '<span>' + esc(err) + '</span>' +
                  '<button type="button" class="d-toast-close" id="btn-cerrar-toast">&times;</button>' +
                '</div>';
                toast.hidden = false;
                var btnCerrarToast = $('btn-cerrar-toast');
                if (btnCerrarToast) {
                  btnCerrarToast.addEventListener('click', function () { toast.hidden = true; });
                }
                setTimeout(function () { if ($('ciudad')) $('ciudad').focus(); }, 150);
              }
            }
          );
        }
      });
    }

    // Botón flotante para alternar vista en móvil
    var btnToggle = $('btn-toggle-vista');
    if (btnToggle) {
      btnToggle.addEventListener('click', function () {
        var split = $('directorio-split');
        if (!split) return;

        if (estado.modoVista === 'lista') {
          estado.modoVista = 'mapa';
          split.classList.add('d-show-map');
          var icMap = btnToggle.querySelector('.ic-map');
          var icList = btnToggle.querySelector('.ic-list');
          if (icMap) icMap.style.display = 'none';
          if (icList) icList.style.display = 'inline-flex';
          var txt = btnToggle.querySelector('.d-toggle-txt');
          if (txt) txt.textContent = 'Ver Lista';
          if (window.MechaMapa) {
            window.MechaMapa.inicializar('mapa-container').then(function () {
              window.MechaMapa.recalcularTamano();
            });
          }
        } else {
          estado.modoVista = 'lista';
          split.classList.remove('d-show-map');
          var icMap2 = btnToggle.querySelector('.ic-map');
          var icList2 = btnToggle.querySelector('.ic-list');
          if (icMap2) icMap2.style.display = 'inline-flex';
          if (icList2) icList2.style.display = 'none';
          var txt2 = btnToggle.querySelector('.d-toggle-txt');
          if (txt2) txt2.textContent = 'Ver Mapa';
          var preview = $('mapa-preview-card');
          if (preview) preview.hidden = true;
        }
      });
    }

    // Callback de "Buscar en esta zona" desde el mapa
    if (window.MechaMapa && window.MechaMapa.alBuscarEnEstaZona) {
      window.MechaMapa.alBuscarEnEstaZona(function (zona) {
        estado.lat = zona.lat;
        estado.lng = zona.lng;
        buscar();
      });
    }

    // Sincronización Hover lista -> mapa
    var listEl = $('list');
    if (listEl) {
      listEl.addEventListener('mouseover', function (e) {
        var card = e.target.closest ? e.target.closest('.d-res') : null;
        if (card && window.MechaMapa) {
          var slug = card.getAttribute('data-slug');
          if (slug) window.MechaMapa.resaltarSalon(slug);
        }
      });
      listEl.addEventListener('mouseout', function (e) {
        var card = e.target.closest ? e.target.closest('.d-res') : null;
        if (card && window.MechaMapa) {
          var slug = card.getAttribute('data-slug');
          if (slug) window.MechaMapa.desresaltarSalon(slug);
        }
      });
    }

    // Cambios dinámicos al teclear en el campo "Dónde"
    $('ciudad').addEventListener('input', function () {
      var val = $('ciudad').value.trim();
      var ciudadDetectada = detectarCiudadEstructurada(val);
      if (ciudadDetectada && ciudadDetectada !== estado.ciudad) {
        estado.ciudad = val;
        pintarBarrios();
      }
    });

    window.addEventListener('popstate', function () {
      leerUrl();
      pintarMacroCategorias();
      pintarPildorasServicios();
      pintarBarrios();
      pintarControles();
      actualizarModoHome();
      buscar();
    });

    // Manejador centralizado de clics para micro-filtros
    document.addEventListener('click', function (ev) {
      var macroBtn = ev.target.closest ? ev.target.closest('[data-macro]') : null;
      if (macroBtn) {
        var cat = macroBtn.getAttribute('data-macro');
        estado.macroCat = cat;
        estado.servicio = null;
        pintarMacroCategorias();
        pintarPildorasServicios();
        pintarControles();
        escribirUrl(true);
        actualizarModoHome();
        buscar();
        return;
      }

      var servBtn = ev.target.closest ? ev.target.closest('[data-serv]') : null;
      if (servBtn) {
        var servId = servBtn.getAttribute('data-serv');
        estado.servicio = estado.servicio === servId ? null : servId;
        if (estado.servicio) {
          var sObj = SERVICIOS_TECNICOS.find(function (x) { return x.id === estado.servicio; });
          if (sObj) estado.macroCat = sObj.cat;
        }
        pintarMacroCategorias();
        pintarPildorasServicios();
        pintarControles();
        escribirUrl(true);
        actualizarModoHome();
        buscar();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      var barrioBtn = ev.target.closest ? ev.target.closest('[data-barrio]') : null;
      if (barrioBtn) {
        var barrioVal = barrioBtn.getAttribute('data-barrio');
        estado.barrio = barrioVal || null;
        pintarBarrios();
        pintarControles();
        escribirUrl(true);
        actualizarModoHome();
        buscar();
        return;
      }

      var precioBtn = ev.target.closest ? ev.target.closest('[data-precio]') : null;
      if (precioBtn) {
        var pVal = Number(precioBtn.getAttribute('data-precio'));
        estado.precio = estado.precio === pVal ? null : pVal;
        pintarControles();
        escribirUrl(true);
        buscar();
        return;
      }

      var ciudadLink = ev.target.closest ? ev.target.closest('[data-ciudad]') : null;
      if (ciudadLink) {
        ev.preventDefault();
        var cVal = ciudadLink.getAttribute('data-ciudad');
        estado.ciudad = cVal;
        estado.barrio = null;
        estado.lat = null;
        estado.lng = null;
        var btnGeo2 = $('btn-cerca-de-mi');
        if (btnGeo2) btnGeo2.classList.remove('on');
        $('ciudad').value = cVal;
        pintarBarrios();
        pintarControles();
        escribirUrl(true);
        actualizarModoHome();
        buscar();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    });
  });
})();

// FX kit: spotlight que sigue al raton en las tarjetas (.d-res).
(function(){
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('pointermove', function(e){
    var el = e.target.closest ? e.target.closest('.d-res') : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
    el.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
  }, { passive: true });
})();
