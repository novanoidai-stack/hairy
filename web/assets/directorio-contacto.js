/* Contacto con Mecha desde el directorio publico (salones.html, salon.html).
   Mismo patron que el modal "mensaje" de index.html: crear_solicitud_publica
   (tipo='mensaje', ya acepta ese tipo en produccion) + aviso inmediato por
   notificar-solicitud. Sin supabase-js: fetch directo, igual que el resto de
   JS del directorio (salon-directorio.js, directorio.js).
   Requiere un disparador en el DOM: <a id="dAyuda">. Si no existe, no hace nada. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function rpc(nombre, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body)
    });
  }

  function montar(disparador) {
    var ov = h(
      '<div class="d-modal-ov" id="dModalOv" role="dialog" aria-modal="true" aria-labelledby="dModalTitulo">' +
        '<div class="d-modal">' +
          '<h3 id="dModalTitulo">Contacta con Mecha</h3>' +
          '<p class="sub">¿Dudas sobre una reserva o sobre un salón del directorio? Escríbenos y te contestamos por correo hoy mismo.</p>' +
          '<form id="dModalForm" novalidate>' +
            '<label for="dmNombre">Tu nombre</label>' +
            '<input id="dmNombre" type="text" autocomplete="name" placeholder="Nombre y apellido" required />' +
            '<label for="dmEmail">Email</label>' +
            '<input id="dmEmail" type="email" autocomplete="email" placeholder="tucorreo@ejemplo.com" required />' +
            '<label for="dmTexto">Tu mensaje</label>' +
            '<textarea id="dmTexto" placeholder="Cuéntanos qué necesitas" required></textarea>' +
            '<div class="d-modal-acts">' +
              '<button type="submit" class="d-modal-send">Enviar</button>' +
              '<button type="button" class="d-modal-cancel" id="dModalCerrar">Cancelar</button>' +
            '</div>' +
            '<p class="d-modal-msg" id="dModalMsg" hidden></p>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(ov);

    var form = ov.querySelector('#dModalForm');
    var msg = ov.querySelector('#dModalMsg');
    var btn = ov.querySelector('.d-modal-send');

    function abrir() {
      msg.hidden = true; msg.className = 'd-modal-msg';
      ov.classList.add('on');
      setTimeout(function () { ov.querySelector('#dmNombre').focus(); }, 60);
    }
    function cerrar() { ov.classList.remove('on'); }

    disparador.addEventListener('click', function (e) { e.preventDefault(); abrir(); });
    ov.querySelector('#dModalCerrar').addEventListener('click', cerrar);
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = ov.querySelector('#dmNombre').value.trim();
      var email = ov.querySelector('#dmEmail').value.trim();
      var texto = ov.querySelector('#dmTexto').value.trim();
      if (!nombre || !texto || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.hidden = false; msg.className = 'd-modal-msg err';
        msg.textContent = 'Necesitamos tu nombre, un email válido y tu mensaje.';
        return;
      }
      btn.disabled = true;
      var meta = { origen: 'directorio' };
      if (window.MechaDirectorioContexto) meta.salon = window.MechaDirectorioContexto;

      var guardar = rpc('crear_solicitud_publica', {
        p_tipo: 'mensaje', p_nombre: nombre, p_salon: null, p_email: email,
        p_telefono: null, p_nota: texto, p_meta: meta
      }).then(function (r) { return r.ok; }).catch(function () { return false; });

      var avisar = fetch(SUPABASE_URL + '/functions/v1/notificar-solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ tipo: 'mensaje', nombre: nombre, email: email, telefono: null, salon: meta.salon || null, mensaje: texto })
      }).then(function (r) { return r.ok; }).catch(function () { return false; });

      Promise.all([guardar, avisar]).then(function (res) {
        btn.disabled = false;
        msg.hidden = false;
        if (!res[0] && !res[1]) {
          msg.className = 'd-modal-msg err';
          msg.textContent = 'No se ha podido enviar. Escríbenos a contacto@mechaa.es y lo vemos.';
          return;
        }
        msg.className = 'd-modal-msg ok';
        msg.textContent = 'Mensaje enviado. Te contestamos hoy mismo a ' + email + '.';
        form.reset();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var disparador = document.getElementById('dAyuda');
    if (disparador) montar(disparador);
  });
})();
