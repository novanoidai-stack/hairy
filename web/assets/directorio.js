/* Directorio publico de salones — busqueda y pintado.
   Lee SOLO por RPC (buscar_salones_publico): las tablas no estan abiertas a
   anon, asi que no hay forma de consultar mas de lo que la funcion expone. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

  // Categorias reales del catalogo (categorias_servicio / servicios.categoria).
  // No inventar etiquetas que no existan en los datos: filtrarian a cero.
  var CATEGORIAS = ['Corte', 'Color', 'Peinado', 'Barba', 'Tratamiento'];

  // Iconos de trazo por categoria (sin emojis, regla del proyecto).
  var ICONOS = {
    Corte: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    Color: '<path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z"/>',
    Peinado: '<path d="M4 6h10a4 4 0 0 1 0 8H4z"/><line x1="8" y1="14" x2="8" y2="21"/><line x1="12" y1="14" x2="12" y2="21"/>',
    Barba: '<path d="M5 4v6a7 7 0 0 0 14 0V4"/><path d="M9 14c1 1.5 5 1.5 6 0"/>',
    Tratamiento: '<path d="M12 21c0-6 4-10 9-10-1 6-4 10-9 10z"/><path d="M12 21c0-6-4-10-9-10 1 6 4 10 9 10z"/>'
  };

  var $ = function (id) { return document.getElementById(id); };

  // Maqueta de las tarjetas: directorio-tarjeta.js (compartida con la vista
  // previa de Ajustes). Tiene que cargarse ANTES que este fichero.
  var esc = window.MechaTarjeta.esc;
  var pintarResultado = window.MechaTarjeta.resultado;
  var pintarMini = window.MechaTarjeta.mini;
  var engancharFallback = window.MechaTarjeta.engancharFallback;

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
      if (!r.ok) throw new Error('rpc ' + fn + ': ' + r.status);
      return r.json();
    });
  }

  var estado = { q: '', ciudad: '', categoria: null };

  function leerUrl() {
    var p = new URLSearchParams(location.search);
    estado.q = p.get('q') || '';
    estado.ciudad = p.get('ciudad') || '';
    estado.categoria = p.get('cat') || null;
    $('q').value = estado.q;
    $('ciudad').value = estado.ciudad;
  }

  // push = true en los cambios que hace el usuario, para que el boton atras
  // deshaga la busqueda en vez de sacarle del directorio.
  function escribirUrl(push) {
    var p = new URLSearchParams();
    if (estado.q) p.set('q', estado.q);
    if (estado.ciudad) p.set('ciudad', estado.ciudad);
    if (estado.categoria) p.set('cat', estado.categoria);
    var qs = p.toString();
    var url = qs ? '?' + qs : location.pathname;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  function pintarChips() {
    $('chips').innerHTML = CATEGORIAS.map(function (c) {
      return '<button type="button" class="d-chip' + (estado.categoria === c ? ' on' : '') +
        '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  }

  // Las secciones de la home (categorias, como funciona, ciudades, CTA) solo
  // tienen sentido cuando no hay busqueda: al filtrar, manda la lista.
  function buscando() {
    return !!(estado.q || estado.ciudad || estado.categoria);
  }

  // Home: carrusel compacto y secciones de contenido. Busqueda: lista vertical
  // completa con filtros. Son dos lecturas distintas de los mismos datos.
  function actualizarModoHome() {
    var b = buscando();
    // hidden = true cuando ese bloque NO toca en el modo actual.
    [['hero-texto', b], ['secciones-home', b], ['destacados', b],
     ['controls', !b], ['chips', !b], ['count', !b], ['list', !b]
    ].forEach(function (par) {
      var el = $(par[0]);
      if (el) el.hidden = par[1];
    });
  }

  function pintarCategoriasGrandes() {
    var cont = $('cats-grandes');
    if (!cont) return;
    cont.innerHTML = CATEGORIAS.map(function (c) {
      return '<button type="button" class="d-cat" data-cat="' + esc(c) + '">' +
        '<span class="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        (ICONOS[c] || '') + '</svg></span>' + esc(c) + '</button>';
    }).join('');
  }

  function cargarCiudades() {
    var cont = $('ciudades');
    var sec = $('sec-ciudades');
    if (!cont || !sec) return;
    rpc('ciudades_directorio_publico', {}).then(function (lista) {
      if (!lista || !lista.length) return; // sin ciudades rellenadas, la seccion no se muestra
      cont.innerHTML = lista.map(function (c) {
        return '<a class="d-ciudad" href="?ciudad=' + encodeURIComponent(c.ciudad) + '">' +
          esc(c.ciudad) + ' <span class="n">(' + esc(c.salones) + ')</span></a>';
      }).join('');
      sec.hidden = false;
    }).catch(function () { /* la seccion se queda oculta */ });
  }

  // Bloque de salones que no usan Mecha. Se pide APARTE de buscar_salones_publico
  // y se pinta siempre debajo: son dos listas distintas, y una sola consulta
  // acabaria antes o despues en un ranking mezclado.
  // Las dos consultas van en paralelo y cualquiera puede llegar primero, asi que
  // el total de ajenos se guarda: lo necesita el estado vacio, que se pinta
  // cuando responde la otra.
  var totalExternos = 0;

  function cargarExternos() {
    var sec = $('externos');
    if (!sec) return;
    rpc('salones_externos_publico', {
      p_texto: estado.q || null,
      p_ciudad: estado.ciudad || null,
      p_limit: 12,
      p_offset: 0
    }).then(function (data) {
      var salones = (data && data.salones) || [];
      var total = (data && data.total) || 0;
      totalExternos = total;
      if (!salones.length) { sec.hidden = true; return; }

      $('externos-lista').innerHTML = salones.map(function (s) {
        return window.MechaTarjeta.externo(s);
      }).join('');
      // "De la zona" solo cuando hay zona: sin filtro de ciudad, las 12 que se
      // ensenan pueden ser de cualquier punto del pais.
      var zona = estado.ciudad ? ' de la zona' : '';
      $('externos-sub').textContent = total > salones.length
        ? 'Otras ' + total + ' peluquerías' + zona + ' que todavía no trabajan con Mecha. Aquí no puedes reservar online, pero sí llamar.'
        : 'Peluquerías' + zona + ' que todavía no trabajan con Mecha. Aquí no puedes reservar online, pero sí llamar.';
      sec.hidden = false;
      ablandarVacio(total);
    }).catch(function () { sec.hidden = true; });
  }

  // Si arriba no hay ningun salon de Mecha pero abajo hay ajenos, el cartelon de
  // "no hemos encontrado salones" seguido de 990 tarjetas se lee fatal. Cuando
  // llegan los ajenos se reescribe para que diga lo que de verdad pasa: aqui
  // todavia no hay nadie con reserva online.
  function ablandarVacio(total) {
    var h = $('vacio-h2');
    var p = $('vacio-msg');
    if (!h || !p || !total) return;
    var zona = estado.ciudad ? ' de la zona' : '';
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

  function buscar() {
    var enHome = !buscando();
    $('count').textContent = '';
    cargarExternos();
    if (enHome) {
      $('carrusel').innerHTML = '<div class="d-skel" style="flex:0 0 268px;height:240px"><div class="d-skel-in"></div></div>'.repeat(4);
    } else {
      $('list').innerHTML = '<div class="d-skel"><div class="d-skel-in"></div></div>'.repeat(3);
    }

    rpc('buscar_salones_publico', {
      p_texto: estado.q || null,
      p_ciudad: estado.ciudad || null,
      p_categoria: estado.categoria || null,
      p_limit: 20,
      p_offset: 0
    }).then(function (data) {
      var salones = (data && data.salones) || [];
      var total = (data && data.total) || 0;

      if (enHome) {
        $('carrusel').innerHTML = salones.map(function (s, i) { return pintarMini(s, i); }).join('');
        engancharFallback($('carrusel'));
        $('destacados-sub').textContent = total === 0
          ? 'Todavía no hay ningún salón publicado en el directorio.'
          : total === 1
            ? 'De momento hay 1 salón con reserva online.'
            : 'Salones con reserva online, ordenados por valoración.';
        setTimeout(actualizarFlechas, 60);
        return;
      }

      if (!salones.length) {
        $('count').textContent = '';
        $('list').innerHTML = vacio('Prueba con otra zona o quita algún filtro.');
        ablandarVacio(totalExternos);
        var b = $('limpiar');
        if (b) b.addEventListener('click', function () {
          estado = { q: '', ciudad: '', categoria: null };
          $('q').value = ''; $('ciudad').value = '';
          pintarChips(); escribirUrl(true); actualizarModoHome(); buscar();
        });
        return;
      }

      $('count').textContent = total === 1 ? '1 salón' : total + ' salones';
      $('list').innerHTML = salones.map(function (s, i) { return pintarResultado(s, i); }).join('');
      engancharFallback($('list'));
    }).catch(function (e) {
      console.error(e);
      var msg = 'No hemos podido cargar los salones. Vuelve a intentarlo en un momento.';
      if (enHome) { $('carrusel').innerHTML = ''; $('destacados-sub').textContent = msg; }
      else { $('list').innerHTML = vacio(msg); }
      // Reporte de error al staff
      try {
        fetch(SUPABASE_URL + '/rest/v1/rpc/registrar_error_cliente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
          body: JSON.stringify({
            p_mensaje: String(e && e.message || e || 'Fallo RPC directorio salones'),
            p_ruta: (location.pathname + location.search).slice(0, 200),
            p_pila: String(e && e.stack || '').slice(0, 2000),
            p_origen: 'marketplace',
            p_navegador: navigator.userAgent.slice(0, 200),
            p_tipo: 'excepcion'
          })
        }).catch(function () {});
      } catch (err) {}
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    leerUrl();
    pintarChips();
    pintarCategoriasGrandes();
    actualizarModoHome();
    cargarCiudades();
    buscar();

    var car = $('carrusel');
    if (car) {
      car.addEventListener('scroll', actualizarFlechas, { passive: true });
      window.addEventListener('resize', actualizarFlechas);
      // Minimo de una tarjeta: si clientWidth llega a 0 (contenedor aun sin medir),
      // el salto seria 0 y la flecha no haria nada.
      var paso = function () { return Math.max(car.clientWidth * 0.8, 240); };
      $('car-izq').addEventListener('click', function () { car.scrollBy({ left: -paso(), behavior: 'smooth' }); });
      $('car-der').addEventListener('click', function () { car.scrollBy({ left: paso(), behavior: 'smooth' }); });
    }

    $('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      estado.q = $('q').value.trim();
      estado.ciudad = $('ciudad').value.trim();
      escribirUrl(true);
      actualizarModoHome();
      buscar();
    });

    // El estado de la busqueda vive en la URL: atras/adelante tienen que repintarla.
    window.addEventListener('popstate', function () {
      leerUrl();
      pintarChips();
      actualizarModoHome();
      buscar();
    });

    // Un solo manejador para los chips de arriba y las tarjetas de categoria.
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-cat]') : null;
      if (!b) return;
      var cat = b.getAttribute('data-cat');
      estado.categoria = estado.categoria === cat ? null : cat;
      pintarChips();
      escribirUrl(true);
      actualizarModoHome();
      buscar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
})();
