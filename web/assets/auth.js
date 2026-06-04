/* Mecha - capa de datos del sitio publico.
   Requiere cargar antes el UMD de supabase-js:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
   Usa la anon key (publica). El destino de la app ("el software") se puede sobreescribir
   con window.MECHA_APP_URL antes de cargar este script. */
(function () {
  var SUPABASE_URL = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';
  var APP_URL = window.MECHA_APP_URL || '/app';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Mecha] supabase-js no esta cargado. Anade el script UMD antes de auth.js');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // negocio_id derivado igual que en la app (login.tsx): nombre_negocio + sufijo
  function slugNegocio(nombreNegocio) {
    var base = (nombreNegocio || 'salon').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    var rnd = Math.random().toString(36).slice(2, 7);
    return (base || 'salon') + '_' + rnd;
  }

  // Inserta una solicitud (lead). Devuelve { error }.
  async function insertSolicitud(payload) {
    try {
      var row = Object.assign({ estado: 'nueva' }, payload);
      var res = await client.from('solicitudes').insert(row);
      return { error: res.error || null };
    } catch (e) {
      return { error: e };
    }
  }

  // Traduce el codigo de error de la Edge Function a un mensaje claro en espanol.
  function signupErrorMessage(code) {
    switch (code) {
      case 'email_exists': return 'Ese correo ya tiene una cuenta. Inicia sesion.';
      case 'invalid_email': return 'El correo no parece valido. Revisalo.';
      case 'weak_password': return 'La contrasena necesita al menos 8 caracteres.';
      case 'missing_fields': return 'Completa el nombre del salon y tu nombre.';
      case 'network': return 'No se pudo conectar. Revisa tu conexion e intentalo de nuevo.';
      default: return 'No se pudo crear la cuenta. Intentalo de nuevo en un momento.';
    }
  }

  // Crea cuenta gratis (plan free) ya CONFIRMADA via Edge Function signup-free.
  // No envia correo de confirmacion (evita el rate limit del mailer) y deja la
  // sesion lista en el navegador para entrar directo a la demo / al software.
  // Devuelve { error, needsConfirmation, needsManualLogin?, session? }.
  async function signUpFree(d) {
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/signup-free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          email: d.email, password: d.password,
          nombre: d.nombre || '', salon: d.salon || '', telefono: d.telefono || ''
        })
      });
      var body = {};
      try { body = await res.json(); } catch (e) {}
      if (!res.ok || !body.ok) {
        var code = (body && body.error) || 'error';
        return { error: { code: code, message: signupErrorMessage(code) } };
      }
      // Cuenta creada y confirmada: iniciar sesion para tener sesion en el navegador.
      var si = await client.auth.signInWithPassword({ email: d.email, password: d.password });
      if (si.error) {
        // La cuenta existe pero el auto-login fallo: que inicie sesion a mano.
        return { error: null, needsConfirmation: false, needsManualLogin: true };
      }
      return { error: null, needsConfirmation: false, session: si.data && si.data.session };
    } catch (e) {
      return { error: { code: 'network', message: signupErrorMessage('network') } };
    }
  }

  async function signIn(d) {
    var res = await client.auth.signInWithPassword({ email: d.email, password: d.password });
    return { error: res.error || null, session: res.data && res.data.session };
  }

  // Comprueba si un proveedor externo (p. ej. 'google') esta activado en el
  // proyecto, leyendo /auth/v1/settings. Asi evitamos redirigir a una pagina
  // de error cuando el proveedor todavia no esta configurado.
  async function providerEnabled(name) {
    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_ANON_KEY } });
      if (!res.ok) return false;
      var j = await res.json();
      return !!(j && j.external && j.external[name]);
    } catch (e) { return false; }
  }

  // SSO con Google. Redirige el navegador a Google y vuelve a redirectTo.
  // El proveedor Google debe estar activado en Supabase Auth y la URL de retorno
  // incluida en la allowlist de redirecciones del proyecto. Si aun no esta
  // activado, devuelve { error, disabled:true } sin redirigir.
  async function signInWithGoogle(opts) {
    opts = opts || {};
    var enabled = await providerEnabled('google');
    if (!enabled) {
      return { error: { message: 'provider_disabled' }, disabled: true };
    }
    var redirectTo = opts.redirectTo || (window.location.origin + window.location.pathname);
    var res = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo }
    });
    return { error: res.error || null, data: res.data };
  }

  // Suscribe a cambios de sesion (login/logout). Devuelve la subscripcion.
  function onAuth(cb) {
    try {
      var sub = client.auth.onAuthStateChange(function (event, session) { cb(event, session); });
      return sub;
    } catch (e) { return null; }
  }

  async function getSession() {
    var res = await client.auth.getSession();
    return res.data ? res.data.session : null;
  }

  async function signOut() { return client.auth.signOut(); }

  // Envia el correo para restablecer la contrasena. redirectTo es la pagina a la
  // que vuelve el usuario desde el enlace del correo (debe estar en la allowlist
  // de URLs de redireccion del proyecto Supabase). Devuelve { error }.
  async function resetPassword(email, redirectTo) {
    try {
      var opts = redirectTo ? { redirectTo: redirectTo } : undefined;
      var res = await client.auth.resetPasswordForEmail(email, opts);
      return { error: res.error || null };
    } catch (e) {
      return { error: e };
    }
  }

  // Envia el correo de recuperacion branded de Mecha (Edge Function send-reset).
  // Ademas -decision de producto- indica si el correo NO tiene cuenta.
  // Devuelve { ok, status, exists, sent, error }. Si la funcion no esta lista
  // (p.ej. sin RESEND_API_KEY) el cliente puede hacer fallback a resetPassword.
  async function sendReset(email, redirectTo) {
    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/send-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email, redirectTo: redirectTo }),
      });
      var body = {};
      try { body = await res.json(); } catch (e) {}
      return {
        ok: res.ok,
        status: res.status,
        exists: body.exists,
        sent: body.sent,
        error: body.error || null,
      };
    } catch (e) {
      return { ok: false, status: 0, exists: undefined, sent: false, error: e };
    }
  }

  // Tras volver del enlace de recuperacion (sesion temporal ya activa), fija la
  // nueva contrasena. Devuelve { error }.
  async function updatePassword(newPassword) {
    try {
      var res = await client.auth.updateUser({ password: newPassword });
      return { error: res.error || null };
    } catch (e) {
      return { error: e };
    }
  }

  async function isStaff() {
    try {
      var res = await client.rpc('is_staff');
      return res.data === true;
    } catch (e) { return false; }
  }

  // Consume una visita de demo (cuenta free: 3 maximo). Devuelve el estado:
  // { allowed, remaining, limit, used, plan, reason } o { allowed:false, reason:'error' }.
  async function useDemoVisit() {
    try {
      var res = await client.rpc('use_demo_visit');
      if (res.error || !res.data) return { allowed: false, remaining: 0, reason: 'error' };
      return res.data;
    } catch (e) { return { allowed: false, remaining: 0, reason: 'error' }; }
  }

  // Consulta cuantas visitas de demo quedan, sin consumir ninguna.
  async function demoVisitsStatus() {
    try {
      var res = await client.rpc('demo_visits_status');
      if (res.error || !res.data) return { allowed: false, remaining: 0, reason: 'error' };
      return res.data;
    } catch (e) { return { allowed: false, remaining: 0, reason: 'error' }; }
  }

  function goToApp() { window.location.href = APP_URL; }

  window.MechaAPI = {
    client: client,
    APP_URL: APP_URL,
    insertSolicitud: insertSolicitud,
    signUpFree: signUpFree,
    signIn: signIn,
    signInWithGoogle: signInWithGoogle,
    providerEnabled: providerEnabled,
    onAuth: onAuth,
    getSession: getSession,
    signOut: signOut,
    resetPassword: resetPassword,
    sendReset: sendReset,
    updatePassword: updatePassword,
    isStaff: isStaff,
    useDemoVisit: useDemoVisit,
    demoVisitsStatus: demoVisitsStatus,
    goToApp: goToApp
  };
})();
