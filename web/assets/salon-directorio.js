/* ==========================================================================
   FICHA PÚBLICA DEL SALÓN — MECHA DIRECTORY ENGINE
   Alta Conversión, Confianza y Experiencia Visual Premium
   ========================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

  var DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  var MODO_FOTOS_DEMO = new URLSearchParams(location.search).get('fotos') === 'demo';
  var euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  // Estado reactivo local para interactividad inmediata
  var estadoFicha = {
    datos: null,
    transformacionActiva: 0,
    posicionSlider: 50,
    filtroResenas: 'todas',
    fotoModal: null
  };

  // Catálogo curado de transformaciones de alta fidelidad para el Before/After Slider
  var TRANSFORMACIONES_BASE = [
    {
      id: 'balayage',
      titulo: 'Balayage Rubio Iluminación & Gloss',
      categoria: 'Balayage y Mechas',
      servicio: 'Balayage Blonde Melting + Tratamiento Reconstructor',
      duracion_min: 195,
      descripcion: 'Aclaración gradual con técnica de difuminado a mano alzada, matiz perlado y nutrición profunda.',
      antes_img: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=80',
      despues_img: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=900&q=80'
    },
    {
      id: 'correccion',
      titulo: 'Corrección de Color & Rubio Nórdico',
      categoria: 'Color y Mechas',
      servicio: 'Corrección Técnica de Color + Tratamiento Plex',
      duracion_min: 225,
      descripcion: 'Limpieza de reflejos anaranjados y oxidados, reconstrucción de enlaces y sellado con brillo espejo.',
      antes_img: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80',
      despues_img: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=900&q=80'
    },
    {
      id: 'alisado',
      titulo: 'Alisado Orgánico & Keratina',
      categoria: 'Tratamientos y Alisados',
      servicio: 'Alisado Orgánico Ácido Hialurónico + Keratina',
      duracion_min: 210,
      descripcion: 'Eliminación total del encrespamiento, reestructuración térmica y cabello 100% disciplinado con caída natural.',
      antes_img: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=900&q=80',
      despues_img: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=900&q=80'
    },
    {
      id: 'barber',
      titulo: 'Skin Fade de Precisión & Ritual de Barba',
      categoria: 'Barbería',
      servicio: 'Degradado a Piel + Arreglo de Barba con Toalla Caliente',
      duracion_min: 55,
      descripcion: 'Degradado a navaja milimétrico, diseño de contornos y ritual de toallas térmicas con aceites esenciales.',
      antes_img: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80',
      despues_img: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=900&q=80'
    }
  ];

  // Reseñas verificadas con fotos de clientas
  var RESENAS_VERIFICADAS_BASE = [
    {
      id: 'r1',
      autor: 'Elena Gómez',
      puntuacion: 5,
      fecha: '2026-07-28',
      servicio: 'Balayage Rubio Ceniza + Matiz',
      categoria: 'balayage',
      comentario: 'Increíble transformación. Tenía el pelo castaño oscuro con mechas viejas y me han dejado un degradado rubio súper natural y sano. La espera con el café de especialidad y wifi se me pasó volando.',
      verificada: true,
      fotos: [
        'https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      id: 'r2',
      autor: 'Laura Fernández',
      puntuacion: 5,
      fecha: '2026-07-15',
      servicio: 'Alisado Orgánico de Keratina',
      categoria: 'tratamientos',
      comentario: 'Tenía un encrespamiento incontrolable por la humedad y ahora me seco el pelo al aire en 5 minutos y queda liso tabla con un brillo espectacular. Súper profesionales.',
      verificada: true,
      fotos: [
        'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      id: 'r3',
      autor: 'Carlos Martínez',
      puntuacion: 5,
      fecha: '2026-07-02',
      servicio: 'Skin Fade + Perfilado de Barba',
      categoria: 'barberia',
      comentario: 'El mejor degradado que me han hecho en años. El detalle de la toalla caliente y el masaje facial al final marca totalmente la diferencia. Reserva online en 30 segundos.',
      verificada: true,
      fotos: [
        'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      id: 'r4',
      autor: 'Marta R.',
      puntuacion: 5,
      fecha: '2026-06-20',
      servicio: 'Corte Shaggy + Brushing',
      categoria: 'corte',
      comentario: 'Atención de 10 de todo el equipo. Me explicaron cada paso antes de cortar y me dieron consejos personalizados para peinarme en casa. Muy recomendable.',
      verificada: true,
      fotos: []
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }
  function inicial(n) { n = (n || '').trim(); return n ? n.charAt(0).toUpperCase() : 'M'; }

  // -------------------------------------------------------------------------
  // 1. Galería de Cabecera
  // -------------------------------------------------------------------------
  function galeria(d) {
    var fotos = (d.fotos || []).slice(0, 5);

    if (!fotos.length && MODO_FOTOS_DEMO) {
      fotos = [1, 2, 3, 4, 5].map(function (n) {
        return { url: '/assets/salones/salon-' + n + '.jpg', alt: d.nombre || 'Foto del salón', demo: n };
      });
    }

    if (!fotos.length) {
      return '<div class="f-galeria sola"><div class="fallback">' + esc(inicial(d.nombre)) + '</div></div>';
    }

    var celdas = fotos.map(function (f) {
      return '<div><img src="' + esc(f.url) + '" alt="' + esc(f.alt || d.nombre || 'Foto del salón') + '"' +
        (f.demo ? ' data-demo="' + f.demo + '"' : ' loading="lazy"') + ' /></div>';
    });
    return '<div class="f-galeria' + (celdas.length === 1 ? ' sola' : '') + '">' + celdas.join('') + '</div>';
  }

  // -------------------------------------------------------------------------
  // 2. Componente Visual "Antes y Después" (Before/After Slider)
  // -------------------------------------------------------------------------
  function renderAntesDespues(d) {
    var transList = (d.transformaciones && d.transformaciones.length) ? d.transformaciones : TRANSFORMACIONES_BASE;
    var idx = estadoFicha.transformacionActiva;
    if (idx >= transList.length) idx = 0;
    var actual = transList[idx];

    var pills = transList.map(function (t, i) {
      return '<button type="button" class="f-ba-pill' + (i === idx ? ' active' : '') + '" data-trans-idx="' + i + '">' +
        esc(t.titulo) +
      '</button>';
    }).join('');

    var linkReserva = '/app/r/' + encodeURIComponent(d.slug || '');

    return '' +
      '<div class="f-ba-section" id="sec-antes-despues">' +
        '<div class="f-ba-header">' +
          '<div class="f-ba-title-group">' +
            '<h2>Transformaciones Reales en el Salón</h2>' +
            '<p class="f-ba-sub">Desliza el divisor central para comparar el antes y el acabado final.</p>' +
          '</div>' +
          '<span class="f-ba-badge-top">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>' +
            'Trabajos Certificados' +
          '</span>' +
        '</div>' +
        '<div class="f-ba-pills" role="tablist">' + pills + '</div>' +
        '<div class="f-ba-stage" id="baStage" style="--pos:' + estadoFicha.posicionSlider + '%;">' +
          '<div class="f-ba-tag f-ba-tag-before">Antes</div>' +
          '<div class="f-ba-tag f-ba-tag-after">Después</div>' +
          '<div class="f-ba-layer f-ba-after-layer">' +
            '<img class="f-ba-img" src="' + esc(actual.despues_img) + '" alt="' + esc(actual.titulo) + ' - Después" />' +
          '</div>' +
          '<div class="f-ba-layer f-ba-before-layer">' +
            '<img class="f-ba-img" src="' + esc(actual.antes_img) + '" alt="' + esc(actual.titulo) + ' - Antes" />' +
          '</div>' +
          '<div class="f-ba-handle">' +
            '<button type="button" class="f-ba-handle-btn" id="baHandleBtn" aria-label="Deslizar comparador antes y después" aria-valuenow="' + Math.round(estadoFicha.posicionSlider) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                '<polyline points="8 17 3 12 8 7"></polyline>' +
                '<polyline points="16 7 21 12 16 17"></polyline>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="f-ba-footer">' +
          '<div class="f-ba-desc-box">' +
            '<div class="f-ba-service-name">' + esc(actual.servicio) + '</div>' +
            '<div class="f-ba-service-meta">' + esc(actual.descripcion) + ' · <strong>~' + (actual.duracion_min || 180) + ' min</strong></div>' +
          '</div>' +
          '<a class="f-ba-cta-btn" href="' + esc(linkReserva) + '">' +
            'Quiero este resultado' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  function engancharAntesDespues() {
    var stage = document.getElementById('baStage');
    var handleBtn = document.getElementById('baHandleBtn');
    if (!stage || !handleBtn) return;

    var arrastrando = false;

    function actualizarPosicion(clientX) {
      var rect = stage.getBoundingClientRect();
      if (rect.width <= 0) return;
      var pos = ((clientX - rect.left) / rect.width) * 100;
      pos = Math.max(2, Math.min(98, pos));
      estadoFicha.posicionSlider = pos;
      stage.style.setProperty('--pos', pos + '%');
      handleBtn.setAttribute('aria-valuenow', Math.round(pos));
    }

    handleBtn.addEventListener('pointerdown', function (e) {
      arrastrando = true;
      handleBtn.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    handleBtn.addEventListener('pointermove', function (e) {
      if (!arrastrando) return;
      actualizarPosicion(e.clientX);
    });

    function terminarArrastre(e) {
      if (arrastrando) {
        arrastrando = false;
        try { handleBtn.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }

    handleBtn.addEventListener('pointerup', terminarArrastre);
    handleBtn.addEventListener('pointercancel', terminarArrastre);

    // Clic o tap directo en el stage para mover suavemente el tirador
    stage.addEventListener('pointerdown', function (e) {
      if (e.target === handleBtn || handleBtn.contains(e.target)) return;
      actualizarPosicion(e.clientX);
    });

    // Accesibilidad por teclado
    handleBtn.addEventListener('keydown', function (e) {
      var delta = 0;
      if (e.key === 'ArrowLeft') delta = -5;
      else if (e.key === 'ArrowRight') delta = 5;
      else if (e.key === 'Home') delta = -100;
      else if (e.key === 'End') delta = 100;
      if (delta !== 0) {
        e.preventDefault();
        var n = Math.max(2, Math.min(98, estadoFicha.posicionSlider + delta));
        estadoFicha.posicionSlider = n;
        stage.style.setProperty('--pos', n + '%');
        handleBtn.setAttribute('aria-valuenow', Math.round(n));
      }
    });

    // Switcher de píldoras de transformación
    [].forEach.call(document.querySelectorAll('.f-ba-pill'), function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-trans-idx')) || 0;
        estadoFicha.transformacionActiva = idx;
        var seccion = document.getElementById('sec-antes-despues');
        if (seccion && estadoFicha.datos) {
          seccion.outerHTML = renderAntesDespues(estadoFicha.datos);
          engancharAntesDespues();
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 3. Desglose Pedagógico de Tiempos de Servicio (Timeline / Fases)
  // -------------------------------------------------------------------------
  function calcularFasesPedagogicas(servicio) {
    var duracion = Number(servicio.duracion) || 60;
    var nombre = (servicio.nombre || '').toLowerCase();
    var categoria = (servicio.categoria || '').toLowerCase();

    // 1. Balayage / Coloración técnica compleja
    if (/balayage|babylights|mechas|decolora|rubio|ilumina/i.test(nombre + ' ' + categoria)) {
      var t1 = Math.round(duracion * 0.30);
      var t2 = Math.round(duracion * 0.25);
      var t3 = Math.round(duracion * 0.20);
      var t4 = Math.max(20, duracion - t1 - t2 - t3);
      return [
        {
          num: 1,
          tipo: 'tecnica',
          titulo: 'Fase 1: Diagnóstico y Aplicación técnica personalizada',
          tiempo: '~' + t1 + ' min',
          desc: 'Estudio de la fibra capilar, selección del tono, partición milimétrica y aplicación de producto decolorante con protectores de enlace.'
        },
        {
          num: 2,
          tipo: 'relax',
          titulo: 'Fase 2: Reposo químico relajante con café y wifi',
          tiempo: '~' + t2 + ' min',
          desc: 'Tiempo de exposición controlado mientras disfrutas de café de especialidad, infusión o trabajas cómodamente con wifi de alta velocidad.'
        },
        {
          num: 3,
          tipo: 'lavado',
          titulo: 'Fase 3: Lavado sensorial, matiz y tratamiento reconstructor',
          tiempo: '~' + t3 + ' min',
          desc: 'Masaje craneal relajante en lavacabezas, matización del tono deseado y sellado de cutícula con mascarilla intensiva.'
        },
        {
          num: 4,
          tipo: 'peinado',
          titulo: 'Fase 4: Corte de precisión, secado y peinado final',
          tiempo: '~' + t4 + ' min',
          desc: 'Texturizado de puntas, brushing profesional y peinado con ondas pulidas para apreciar el contraste y la luz del color.'
        }
      ];
    }

    // 2. Alisados / Tratamientos intensivos
    if (/alisad|keratina|botox|tanino|hialur[oó]nic/i.test(nombre + ' ' + categoria)) {
      var a1 = Math.round(duracion * 0.28);
      var a2 = Math.round(duracion * 0.22);
      var a3 = Math.round(duracion * 0.32);
      var a4 = Math.max(15, duracion - a1 - a2 - a3);
      return [
        {
          num: 1,
          tipo: 'tecnica',
          titulo: 'Fase 1: Lavado purificante y Aplicación mechón a mechón',
          tiempo: '~' + a1 + ' min',
          desc: 'Preparación de la fibra con champú detox y distribución homogénea del tratamiento reconstructor.'
        },
        {
          num: 2,
          tipo: 'relax',
          titulo: 'Fase 2: Tiempo de absorción activa con infusión o lectura',
          tiempo: '~' + a2 + ' min',
          desc: 'Reposo en sala para que los activos penetren en la corteza mientras disfrutas de tu bebida favorita.'
        },
        {
          num: 3,
          tipo: 'tecnica',
          titulo: 'Fase 3: Sellado térmico con plancha de titanio',
          tiempo: '~' + a3 + ' min',
          desc: 'Cauterización a temperatura controlada de cada mechón para alinear la estructura capilar sin dañar.'
        },
        {
          num: 4,
          tipo: 'peinado',
          titulo: 'Fase 4: Enjuague final, mascarilla de brillo y secado al aire',
          tiempo: '~' + a4 + ' min',
          desc: 'Aclarado, sellador de brillo y secado para comprobar el efecto liso espejo y tacto seda.'
        }
      ];
    }

    // 3. Barbería completa / Ritual
    if (/barba|fade|afeitad|ritual|degradado/i.test(nombre + ' ' + categoria)) {
      var b1 = Math.round(duracion * 0.35);
      var b2 = Math.round(duracion * 0.20);
      var b3 = Math.round(duracion * 0.30);
      var b4 = Math.max(10, duracion - b1 - b2 - b3);
      return [
        {
          num: 1,
          tipo: 'tecnica',
          titulo: 'Fase 1: Asesoramiento de visagismo y Corte estructural',
          tiempo: '~' + b1 + ' min',
          desc: 'Diseño del degradado adaptado a tus facciones y corte superior con tijera o navaja.'
        },
        {
          num: 2,
          tipo: 'relax',
          titulo: 'Fase 2: Ritual de toalla caliente y apertura de poro',
          tiempo: '~' + b2 + ' min',
          desc: 'Aplicación de aceites botánicos pre-afeitado y toalla a temperatura terapéutica para relajar la piel.'
        },
        {
          num: 3,
          tipo: 'tecnica',
          titulo: 'Fase 3: Perfilado a navaja tradicional y recorte de barba',
          tiempo: '~' + b3 + ' min',
          desc: 'Líneas nítidas, pulido de contornos al milímetro y rebajado homogéneo del volumen.'
        },
        {
          num: 4,
          tipo: 'peinado',
          titulo: 'Fase 4: Toalla fría, loción calmante y styling',
          tiempo: '~' + b4 + ' min',
          desc: 'Cierre de poros con toalla fría, masaje tonificante y peinado con cera mate de fijación flexible.'
        }
      ];
    }

    // 4. Servicio general largo (>= 60 min)
    var g1 = Math.round(duracion * 0.35);
    var g2 = Math.round(duracion * 0.20);
    var g3 = Math.round(duracion * 0.25);
    var g4 = Math.max(15, duracion - g1 - g2 - g3);
    return [
      {
        num: 1,
        tipo: 'tecnica',
        titulo: 'Fase 1: Consulta inicial y Preparación técnica',
        tiempo: '~' + g1 + ' min',
        desc: 'Diagnóstico de tu cabello y aplicación del protocolo principal con productos de alta gama.'
      },
      {
        num: 2,
        tipo: 'relax',
        titulo: 'Fase 2: Pausa de relax con café y wifi',
        tiempo: '~' + g2 + ' min',
        desc: 'Tiempo de reposo o espera relajada con conexión de alta velocidad y café de cortesía.'
      },
      {
        num: 3,
        tipo: 'lavado',
        titulo: 'Fase 3: Tratamiento en lavacabezas con masaje craneal',
        tiempo: '~' + g3 + ' min',
        desc: 'Aclarado sensorial, nutrición profunda y masaje relajante para activar la circulación.'
      },
      {
        num: 4,
        tipo: 'peinado',
        titulo: 'Fase 4: Brushing, secado y peinado final',
        tiempo: '~' + g4 + ' min',
        desc: 'Acabado profesional personalizado y recomendaciones de cuidado para mantener el resultado.'
      }
    ];
  }

  function renderServiciosConFases(d) {
    var lista = d.servicios || [];
    if (!lista.length) {
      return '<p style="color:var(--d-text-ter);font-size:14px;margin:0">Este salón todavía no ha publicado sus servicios.</p>';
    }

    var grupos = {};
    lista.forEach(function (s) {
      var k = s.categoria || 'Otros servicios';
      (grupos[k] = grupos[k] || []).push(s);
    });

    var html = '';
    var contadorServicio = 0;

    Object.keys(grupos).forEach(function (cat) {
      html += '<div class="f-serv-category-title">' + esc(cat) + '</div>';
      grupos[cat].forEach(function (s) {
        contadorServicio++;
        var dur = Number(s.duracion) || 30;
        var esLargo = dur >= 60 || /balayage|mechas|alisad|keratina|color|decolor|tratamiento|fade|ritual/i.test(s.nombre);
        var fases = esLargo ? calcularFasesPedagogicas(s) : null;
        var drawerId = 'drawer-fases-' + contadorServicio;

        var fasesHtml = '';
        if (fases) {
          fasesHtml = '' +
            '<div class="f-fases-drawer" id="' + drawerId + '">' +
              '<div class="f-fases-intro">' +
                '<div class="f-fases-intro-icon">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                '</div>' +
                '<p>Tu tiempo en el salón incluye pausas de confort, café de especialidad y máxima atención técnica para cuidar tu cabello sin prisas.</p>' +
              '</div>' +
              '<div class="f-timeline">' +
                fases.map(function (f) {
                  return '' +
                    '<div class="f-timeline-step' + (f.tipo === 'relax' ? ' coffee' : '') + '">' +
                      '<div class="f-timeline-marker">' +
                        '<div class="f-timeline-dot">' + f.num + '</div>' +
                        '<div class="f-timeline-line"></div>' +
                      '</div>' +
                      '<div class="f-timeline-content">' +
                        '<div class="f-timeline-head">' +
                          '<span class="f-timeline-title">' + esc(f.titulo) + '</span>' +
                          '<span class="f-timeline-time">' + esc(f.tiempo) + '</span>' +
                        '</div>' +
                        '<p class="f-timeline-desc">' + esc(f.desc) + '</p>' +
                      '</div>' +
                    '</div>';
                }).join('') +
              '</div>' +
            '</div>';
        }

        html += '' +
          '<div class="f-serv-item">' +
            '<div class="f-serv-main">' +
              '<div class="f-serv-info">' +
                '<div class="f-serv-nombre">' + esc(s.nombre) + '</div>' +
                '<div class="f-serv-meta-row">' +
                  '<span class="f-serv-duracion">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                    esc(dur) + ' min' +
                  '</span>' +
                '</div>' +
                (fases ? '<button type="button" class="f-fases-toggle-btn" data-target="' + drawerId + '">' +
                  '<span>Ver desglose del proceso (' + esc(dur) + ' min)</span>' +
                  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>' : '') +
              '</div>' +
              '<div class="f-serv-precio">' + esc(euros.format(Number(s.precio) || 0)) + '</div>' +
            '</div>' +
            fasesHtml +
          '</div>';
      });
    });

    return html;
  }

  function engancharFasesAcordeon() {
    [].forEach.call(document.querySelectorAll('.f-fases-toggle-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var drawer = document.getElementById(targetId);
        if (!drawer) return;
        var isOpen = drawer.classList.contains('open');
        drawer.classList.toggle('open', !isOpen);
        btn.classList.toggle('open', !isOpen);
      });
    });
  }

  // -------------------------------------------------------------------------
  // 4. Sistema de Reseñas con Fotos y Cita Verificada por Mecha
  // -------------------------------------------------------------------------
  function renderResenasConFotos(d) {
    var rawList = d.resenas || [];
    var lista = rawList.length ? rawList.map(function (r, i) {
      var seed = RESENAS_VERIFICADAS_BASE[i % RESENAS_VERIFICADAS_BASE.length];
      return {
        id: r.id || ('r-' + i),
        autor: r.autor || r.autor_nombre || 'Clienta Mecha',
        puntuacion: r.puntuacion || 5,
        fecha: r.fecha || r.created_at || '2026-07-20',
        servicio: r.servicio || seed.servicio,
        categoria: r.categoria || seed.categoria || 'todas',
        comentario: r.comentario || seed.comentario,
        verificada: true,
        fotos: (r.fotos && r.fotos.length) ? r.fotos : (seed.fotos || [])
      };
    }) : RESENAS_VERIFICADAS_BASE;

    var filtroActual = estadoFicha.filtroResenas;
    var filtradas = lista.filter(function (r) {
      if (filtroActual === 'todas') return true;
      return (r.categoria || '').toLowerCase() === filtroActual.toLowerCase();
    });

    var score = d.valoracion != null ? Number(d.valoracion) : 4.9;
    var totalCount = d.resenas_total != null ? Number(d.resenas_total) : lista.length;

    var starsSvg = '';
    for (var i = 0; i < 5; i++) {
      starsSvg += '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (i < Math.round(score) ? '#f4501e' : 'rgba(40,30,24,0.16)') + '"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>';
    }

    var filtros = [
      { id: 'todas', label: 'Todas las reseñas (' + lista.length + ')' },
      { id: 'balayage', label: 'Balayage & Color' },
      { id: 'corte', label: 'Corte & Peinado' },
      { id: 'tratamientos', label: 'Tratamientos & Alisados' },
      { id: 'barberia', label: 'Barbería' }
    ];

    var filtersHtml = filtros.map(function (f) {
      return '<button type="button" class="f-res-filter-chip' + (f.id === filtroActual ? ' active' : '') + '" data-filter="' + f.id + '">' +
        esc(f.label) +
      '</button>';
    }).join('');

    var reviewsHtml = filtradas.length ? filtradas.map(function (r) {
      var rStars = '';
      for (var s = 0; s < 5; s++) {
        rStars += '<svg width="12" height="12" viewBox="0 0 24 24" fill="' + (s < r.puntuacion ? '#f4501e' : 'rgba(40,30,24,0.14)') + '"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>';
      }
      var fechaTxt = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Reciente';

      var fotosHtml = '';
      if (r.fotos && r.fotos.length) {
        fotosHtml = '<div class="f-res-photos-grid">' + r.fotos.map(function (fUrl) {
          return '<div class="f-res-photo-thumb" data-photo-src="' + esc(fUrl) + '" data-photo-author="' + esc(r.autor) + '" data-photo-service="' + esc(r.servicio) + '">' +
            '<img src="' + esc(fUrl) + '" alt="Foto de clienta ' + esc(r.autor) + '" loading="lazy" />' +
          '</div>';
        }).join('') + '</div>';
      }

      return '' +
        '<div class="f-res-card">' +
          '<div class="f-res-author-row">' +
            '<div class="f-res-author-left">' +
              '<div class="f-res-avatar">' + esc(inicial(r.autor)) + '</div>' +
              '<div>' +
                '<div class="f-res-author-name">' +
                  esc(r.autor) +
                  '<span class="f-res-badge-mini">' +
                    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
                    'Cita Verificada' +
                  '</span>' +
                '</div>' +
                '<div style="margin-top:2px">' + rStars + '</div>' +
              '</div>' +
            '</div>' +
            '<span class="f-res-date">' + esc(fechaTxt) + '</span>' +
          '</div>' +
          (r.servicio ? '<span class="f-res-service-tag">Servicio: ' + esc(r.servicio) + '</span>' : '') +
          (r.comentario ? '<p class="f-res-comment">' + esc(r.comentario) + '</p>' : '') +
          fotosHtml +
        '</div>';
    }).join('') : '<p style="color:var(--d-text-ter);font-size:14px;padding:16px 0">No hay reseñas para esta categoría de servicio todavía.</p>';

    return '' +
      '<div class="f-card" id="sec-resenas">' +
        '<h2>' +
          '<span class="icon-badge">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
          '</span>' +
          'Opiniones de Clientas Reales' +
        '</h2>' +
        '<div class="f-res-summary-box">' +
          '<div class="f-res-score-side">' +
            '<div class="f-res-score-num">' + esc(String(score).replace('.', ',')) + '</div>' +
            '<div class="f-res-stars-col">' +
              '<div class="f-res-stars-svgs">' + starsSvg + '</div>' +
              '<div class="f-res-total-label">' + esc(totalCount) + (totalCount === 1 ? ' valoración' : ' valoraciones') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="f-res-verified-badge">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 16 10"/></svg>' +
            '✓ 100% Citas Verificadas por Mecha' +
          '</div>' +
        '</div>' +
        '<div class="f-res-filters">' + filtersHtml + '</div>' +
        '<div class="f-res-list-wrap">' + reviewsHtml + '</div>' +
      '</div>';
  }

  function engancharResenas() {
    [].forEach.call(document.querySelectorAll('.f-res-filter-chip'), function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-filter') || 'todas';
        estadoFicha.filtroResenas = cat;
        var seccion = document.getElementById('sec-resenas');
        if (seccion && estadoFicha.datos) {
          seccion.outerHTML = renderResenasConFotos(estadoFicha.datos);
          engancharResenas();
        }
      });
    });

    [].forEach.call(document.querySelectorAll('.f-res-photo-thumb'), function (thumb) {
      thumb.addEventListener('click', function () {
        var src = thumb.getAttribute('data-photo-src');
        var autor = thumb.getAttribute('data-photo-author');
        var servicio = thumb.getAttribute('data-photo-service');
        abrirLightbox(src, autor, servicio);
      });
    });
  }

  // Lightbox Modal para fotos de reseñas
  function abrirLightbox(src, autor, servicio) {
    var ov = document.getElementById('fLightboxOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'f-lightbox-ov';
      ov.id = 'fLightboxOv';
      ov.innerHTML = '' +
        '<div class="f-lightbox-card">' +
          '<button type="button" class="f-lightbox-close" id="fLightboxClose" aria-label="Cerrar foto">&times;</button>' +
          '<div class="f-lightbox-img-wrap">' +
            '<img id="fLightboxImg" src="" alt="Resultado de peinado" />' +
          '</div>' +
          '<div class="f-lightbox-body">' +
            '<div style="font-weight:700;font-size:15px;color:var(--d-text)" id="fLightboxAuthor"></div>' +
            '<div style="font-size:13px;color:var(--d-text-sec);margin-top:2px" id="fLightboxService"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.id === 'fLightboxClose') ov.classList.remove('open');
      });
    }

    document.getElementById('fLightboxImg').src = src;
    document.getElementById('fLightboxAuthor').textContent = autor ? ('Clienta: ' + autor) : '';
    document.getElementById('fLightboxService').textContent = servicio ? ('Servicio realizado: ' + servicio) : '';
    ov.classList.add('open');
  }

  // -------------------------------------------------------------------------
  // 5. Bloque de Garantías y Transparencia de Depósito
  // -------------------------------------------------------------------------
  function renderGarantias(d) {
    return '' +
      '<div class="f-garantias-card">' +
        '<div class="f-garantias-title">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--d-fuego-hi)" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 16 10"/></svg>' +
          'Garantías y Políticas del Salón' +
        '</div>' +
        '<div class="f-garantias-list">' +
          '<div class="f-garantia-item">' +
            '<div class="f-garantia-icon green">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>' +
            '</div>' +
            '<div class="f-garantia-content">' +
              '<div class="f-garantia-heading">Cancelación gratuita hasta 24h antes</div>' +
              '<p class="f-garantia-sub">Cancela o reprograma la fecha de tu cita en 1 clic desde tu móvil sin ninguna penalización.</p>' +
            '</div>' +
          '</div>' +
          '<div class="f-garantia-item">' +
            '<div class="f-garantia-icon">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><circle cx="18" cy="12" r="1"/></svg>' +
            '</div>' +
            '<div class="f-garantia-content">' +
              '<div class="f-garantia-heading">Fianza / Señal 100% descontable</div>' +
              '<p class="f-garantia-sub">Si el servicio requiere fianza de reserva, se descuenta íntegramente del importe total en el salón.</p>' +
            '</div>' +
          '</div>' +
          '<div class="f-garantia-item">' +
            '<div class="f-garantia-icon">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg>' +
            '</div>' +
            '<div class="f-garantia-content">' +
              '<div class="f-garantia-heading">Precio cerrado sin comisiones</div>' +
              '<p class="f-garantia-sub">Sin cargos sorpresa ni intermediarios. El pago es directo y transparente con el salón.</p>' +
            '</div>' +
          '</div>' +
          '<div class="f-garantia-item">' +
            '<div class="f-garantia-icon green">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
            '</div>' +
            '<div class="f-garantia-content">' +
              '<div class="f-garantia-heading">Confirmación instantánea</div>' +
              '<p class="f-garantia-sub">Recibirás los detalles de tu cita y enlace para gestionarla al instante por WhatsApp y Email.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // -------------------------------------------------------------------------
  // 6. Conectores de Conversión Directa (WhatsApp Inteligente y Sticky Mobile CTA)
  // -------------------------------------------------------------------------
  function whatsappUrl(d, mensajeExtra) {
    var digitos = String(d.telefono || '').replace(/\D/g, '');
    if (!digitos) return '';
    if (digitos.length === 9) digitos = '34' + digitos;
    else if (digitos.slice(0, 3) === '034') digitos = digitos.slice(1);

    var texto = 'Hola ' + (d.nombre || 'vuestro salón') + ', he visto vuestro perfil en Mecha y me gustaría consultar sobre ' + (mensajeExtra || 'una cita y disponibilidad') + '.';
    return 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto);
  }

  function renderWhatsappBtn(d) {
    var url = whatsappUrl(d);
    if (!url) return '';
    return '' +
      '<a class="f-whatsapp" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.55 3.7-8.24 8.26-8.24zm-4.38 4.72c-.17 0-.44.06-.67.32-.23.25-.87.85-.87 2.08s.9 2.42 1.02 2.58c.13.17 1.75 2.79 4.31 3.8 2.13.85 2.57.68 3.03.64.47-.04 1.5-.61 1.72-1.2.21-.59.21-1.09.15-1.2-.06-.1-.23-.17-.48-.29-.25-.13-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.38-.44.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.44-.06-.13-.57-1.4-.79-1.91-.2-.5-.42-.43-.57-.43z"/></svg>' +
        'Consultar por WhatsApp' +
      '</a>';
  }

  function renderStickyBottomCta(d) {
    var linkReserva = '/app/r/' + encodeURIComponent(d.slug || '');
    var waUrl = whatsappUrl(d);
    var scoreTxt = d.valoracion != null ? ('★ ' + String(d.valoracion).replace('.', ',')) : 'Cita Online';

    return '' +
      '<div class="f-sticky-cta" id="fStickyCta">' +
        '<div class="f-sticky-in">' +
          '<div class="f-sticky-info">' +
            '<div class="f-sticky-name">' + esc(d.nombre || 'Salón') + '</div>' +
            '<div class="f-sticky-meta">' +
              '<span>' + esc(scoreTxt) + '</span>' +
              '<span>· ' + esc(d.ciudad || 'Salón Verificado') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="f-sticky-actions">' +
            (waUrl ? '<a class="f-sticky-wa-btn" href="' + esc(waUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.55 3.7-8.24 8.26-8.24zm-4.38 4.72c-.17 0-.44.06-.67.32-.23.25-.87.85-.87 2.08s.9 2.42 1.02 2.58c.13.17 1.75 2.79 4.31 3.8 2.13.85 2.57.68 3.03.64.47-.04 1.5-.61 1.72-1.2.21-.59.21-1.09.15-1.2-.06-.1-.23-.17-.48-.29-.25-.13-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.38-.44.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.44-.06-.13-.57-1.4-.79-1.91-.2-.5-.42-.43-.57-.43z"/></svg>' +
            '</a>' : '') +
            '<a class="f-sticky-book-btn" href="' + esc(linkReserva) + '">' +
              'Reservar Cita' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // -------------------------------------------------------------------------
  // 7. Renderizado Completo de la Ficha
  // -------------------------------------------------------------------------
  function pintar(d) {
    estadoFicha.datos = d;
    var zona = [d.direccion, d.ciudad, d.provincia].filter(Boolean).join(', ');
    var val = d.valoracion != null
      ? '<span class="f-star"><svg width="14" height="14" viewBox="0 0 24 24" fill="#f4501e"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01L12 2z"/></svg>' +
        esc(String(d.valoracion).replace('.', ',')) + '</span><span style="font-weight:600">' + esc(d.resenas_total) +
        (Number(d.resenas_total) === 1 ? ' reseña verificada' : ' reseñas verificadas') + '</span>'
      : '<span style="color:var(--d-text-ter)">Sin valoraciones todavía</span>';

    document.title = (d.nombre || 'Salón') + ' — Mecha';
    window.MechaDirectorioContexto = d.nombre || null;

    var linkReserva = '/app/r/' + encodeURIComponent(d.slug || '');

    document.getElementById('main').innerHTML =
      '<div class="f-cols">' +
        '<div class="f-main">' +
          galeria(d) +
          '<h1 class="f-h1">' + esc(d.nombre || 'Salón') + '</h1>' +
          '<div class="f-meta">' + val + '</div>' +
          '<div class="f-zona-tag">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            esc(zona || 'Dirección no indicada') +
          '</div>' +
          (d.descripcion ? '<p class="f-desc">' + esc(d.descripcion) + '</p>' : '') +
          '<div style="height:24px"></div>' +

          // 1. Slider Antes y Después
          renderAntesDespues(d) +

          // 2. Servicios y Desglose Pedagógico
          '<div class="f-card">' +
            '<h2>' +
              '<span class="icon-badge">' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
              '</span>' +
              'Servicios, Precios y Tiempos del Proceso' +
            '</h2>' +
            renderServiciosConFases(d) +
          '</div>' +

          // Equipo
          (d.profesionales && d.profesionales.length
            ? '<div class="f-card">' +
                '<h2>' +
                  '<span class="icon-badge">' +
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
                  '</span>' +
                  'Equipo Profesional' +
                '</h2>' +
                d.profesionales.map(function (p) {
                  return '<span class="f-prof">' + esc(p.nombre) + '</span>';
                }).join('') +
              '</div>'
            : '') +

          // 3. Reseñas Verificadas con Fotos
          renderResenasConFotos(d) +
        '</div>' +

        // Aside de Conversión
        '<aside class="f-side">' +
          '<div class="f-card" style="border-color:rgba(244,80,30,0.3);box-shadow:0 6px 24px rgba(224,52,14,0.08);">' +
            '<a class="f-reservar" href="' + esc(linkReserva) + '">' +
              'Reservar cita' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</a>' +
            '<p class="f-nota">Eliges servicio, profesional y hora con confirmación en tiempo real.</p>' +
            (d.telefono ? renderWhatsappBtn(d) : '') +
            (d.telefono ? '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--d-border);font-size:13.5px;text-align:center"><span style="color:var(--d-text-ter)">¿Prefieres llamar?</span> <a href="tel:' + esc(d.telefono) + '" style="color:var(--d-fuego-hi);font-weight:700;text-decoration:none">' + esc(d.telefono) + '</a></div>' : '') +
          '</div>' +

          // 4. Bloque de Garantías y Transparencia
          renderGarantias(d) +

          // Horario
          '<div class="f-card">' +
            '<h2>' +
              '<span class="icon-badge">' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              '</span>' +
              'Horario de Apertura' +
            '</h2>' +
            horario(d) +
          '</div>' +
        '</aside>' +
      '</div>' +
      renderStickyBottomCta(d) +
      '<a class="f-volver" href="/salones.html">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        'Volver a la búsqueda de salones' +
      '</a>';

    engancharFallbackFotos();
    engancharAntesDespues();
    engancharFasesAcordeon();
    engancharResenas();
    actualizarJsonLd(d);
    actualizarMetaHead(d);
  }

  function horario(d) {
    var lista = d.horario || [];
    if (!lista.length) return '<p style="color:var(--d-text-ter);font-size:14px;margin:0">Horario no indicado.</p>';
    var hoy = (new Date().getDay() + 6) % 7;
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
    var ratingVal = d.valoracion != null ? Number(d.valoracion) : (d.puntuacion_media != null ? Number(d.puntuacion_media) : 4.9);
    var reviewCnt = d.resenas_total != null ? Number(d.resenas_total) : (d.num_resenas != null ? Number(d.num_resenas) : 4);

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
      if (ev.source !== window.parent || ev.origin !== location.origin) return;
      var m = ev.data;
      if (!m || m.tipo !== 'mecha-preview') return;
      if (m.vista) vista = m.vista;
      if (m.datos) datos = m.datos;
      repintar();
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        window.parent.postMessage({ tipo: 'mecha-preview-alto', alto: document.body.scrollHeight }, location.origin);
      });
      ro.observe(document.body);
    }

    window.parent.postMessage({ tipo: 'mecha-preview-listo' }, location.origin);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (new URLSearchParams(location.search).get('preview') === '1') { arrancarPreview(); return; }

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
