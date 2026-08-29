/* web/assets/reportarError.js
   Telemetría y captura universal de errores para la landing, marketplace y portal público.
   Captura cualquier excepción no controlada (window.onerror), promesa rechazada (unhandledrejection)
   o error operativo en llamadas API/RPC y lo envía directamente a Mecha Staff vía registrar_error_cliente. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

  var yaEnviados = {};

  // Un navegador conducido por un robot no es una visita.
  //
  // El canario corre el smoke contra www.mechaa.es cada hora, y uno de sus
  // tests provoca A PROPOSITO una promesa rota en esta misma pagina para
  // comprobar que el sensor de fallos silenciosos oye. El cazador de abajo la
  // recogia y la escribia en errores_cliente como si fuera de un visitante:
  // 11 apuntes de "fallo de prueba del vigilante" en un solo dia, en la tabla
  // que existe para lo contrario -- "se rompio en casa de alguien de verdad,
  // hay quien espera" (decision 10 de CLAUDE.md).
  //
  // navigator.webdriver lo pone el propio navegador cuando lo maneja
  // WebDriver/CDP; comprobado en las dos compilaciones de Chromium que usa
  // Playwright. La bandera explicita cubre cualquier otro automatismo.
  // Gemelo de esNavegadorAutomatizado() en lib/reportarError.ts.
  function esNavegadorAutomatizado() {
    try {
      if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
      return typeof window !== 'undefined' && window.__MECHA_SIN_TELEMETRIA__ === true;
    } catch (e) {
      return false;
    }
  }

  function rutaActual() {
    try {
      return (window.location.pathname + window.location.search).slice(0, 200);
    } catch (e) {
      return '';
    }
  }

  function deducirOrigen(ruta) {
    if (ruta.indexOf('/salones') === 0 || ruta.indexOf('/directorio') === 0 || ruta.indexOf('/a-coruna') === 0 || ruta.indexOf('/alicante') === 0 || ruta.indexOf('/almeria') === 0) {
      return 'marketplace';
    }
    if (ruta.indexOf('/r/') === 0 || ruta.indexOf('/cita/') === 0) {
      return 'portal';
    }
    if (ruta.indexOf('/app') === 0) {
      return 'app';
    }
    return 'landing';
  }

  function deducirTipo(mensaje, pila) {
    var txt = ((mensaje || '') + ' ' + (pila || '')).toLowerCase();
    if (/key limit|403|quota|credits?|insufficient_quota|balance|payment required|billing|402/i.test(txt)) {
      return 'creditos';
    }
    if (/openrouter|chispa|model_not_found|edge function|tokens|completions/i.test(txt)) {
      return 'ia';
    }
    if (/failed to fetch|networkerror|fetch failed|err_network|timeout|connection/i.test(txt)) {
      return 'red';
    }
    return 'excepcion';
  }

  function reportarError(error, opts) {
    try {
      if (esNavegadorAutomatizado()) return;
      opts = opts || {};
      var mensaje = '';
      var pila = opts.pila || '';

      if (typeof error === 'string') {
        mensaje = error.trim();
      } else if (error && typeof error === 'object') {
        mensaje = (error.message || error.msg || error.error_description || String(error)).trim();
        if (!pila && error.stack) pila = String(error.stack);
      }

      if (!mensaje) return;

      var ruta = opts.ruta || rutaActual();
      var clave = mensaje + '|' + ruta;
      if (yaEnviados[clave]) return;
      yaEnviados[clave] = true;

      var origen = opts.origen || deducirOrigen(ruta);
      var tipo = opts.tipo || deducirTipo(mensaje, pila);
      var navegador = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 200) : '';

      fetch(SUPABASE_URL + '/rest/v1/rpc/registrar_error_cliente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          p_mensaje: mensaje.slice(0, 500),
          p_ruta: ruta.slice(0, 200),
          p_pila: pila.slice(0, 2000),
          p_origen: origen,
          p_navegador: navegador,
          p_tipo: tipo
        })
      }).catch(function () {
        // Silencioso por diseño
      });
    } catch (e) {
      // Un fallo del recolector de errores no puede romper la web
    }
  }

  window.reportarError = reportarError;

  // Cazador global de excepciones no controladas
  window.addEventListener('error', function (e) {
    var err = e.error || e.message;
    reportarError(err, { pila: e.error && e.error.stack });
  });

  // Cazador global de promesas rechazadas sin captura
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = typeof r === 'string' ? r : (r && r.message ? r.message : 'Promesa rechazada sin motivo');
    var pila = r && typeof r === 'object' ? r.stack : undefined;
    reportarError(msg, { pila: pila });
  });
})();
