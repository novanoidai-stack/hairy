// Edge Function: send-reset
// Envia el correo de recuperacion de contraseña con la marca Mecha (via Resend)
// y -decision de producto- avisa si el correo NO tiene cuenta.
//
// Por que una funcion propia en vez de resetPasswordForEmail():
//   1) El correo nativo de Supabase es generico ("Supabase"). Aqui mandamos un
//      email branded de Mecha (colores, gradiente, copy propio).
//   2) Queremos responder "no existe" si el correo no esta registrado. Eso
//      habilita enumeracion de emails (un atacante puede sondear que correos
//      tienen cuenta); se acepta a conciencia para este SaaS B2B.
//
// Cuerpo (POST JSON): { email, redirectTo? }
// Respuestas:
//   200 { exists:false, sent:false }                 -> no hay cuenta con ese correo
//   200 { exists:true,  sent:true  }                 -> correo branded enviado
//   200 { exists:true,  sent:false, error:'resend_not_configured' }
//   502 { exists:true,  sent:false, error:'send_failed' }
//   4xx { error: codigo }
//
// Secretos (Supabase -> Edge Functions -> Secrets). NUNCA en el repo:
//   RESEND_API_KEY  key de Resend (re_...).
//   RESEND_FROM     remitente, p.ej. "Mecha <no-reply@tudominio.com>".
//                   Por defecto "Mecha <onboarding@resend.dev>" (modo test de
//                   Resend: solo entrega al email de la cuenta de Resend). Para
//                   enviar a cualquiera hay que verificar un dominio en Resend.
// Inyectados por Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://localhost:19006',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200, req?: Request) {
  const headers = req ? corsHeaders(req) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Origenes desde los que aceptamos el redirectTo del cliente. Evita open-redirect:
// si el valor no casa, se usa el de produccion. Anade aqui el dominio propio
// cuando se compre (debe estar tambien en las Redirect URLs de Supabase).
// ALLOWED_ORIGINS is already declared above for CORS and redirect validation.
const DEFAULT_REDIRECT = 'https://hairy-two.vercel.app/restablecer.html';

// Plantilla del correo: dark navy + gradiente fuego de Mecha. Layout en tablas
// e inline-styles por compatibilidad con clientes de correo.
function resetEmailHtml(actionLink: string): string {
  const safeLink = actionLink.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>Restablece tu contraseña de Mecha</title>
</head>
<body style="margin:0;padding:0;background:#070a14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#070a14;">Crea una nueva contraseña para tu cuenta de Mecha. El enlace caduca en 1 hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070a14;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;">
        <!-- Logo con gradiente fuego -->
        <tr>
          <td style="padding:0 4px 18px;text-align:center;">
            <svg width="32" height="32" viewBox="0 0 40 40" style="display:block;margin:0 auto 12px;">
              <defs>
                <linearGradient id="mGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stop-color="#e0340e" />
                  <stop offset=".5" stop-color="#ff7a2e" />
                  <stop offset="1" stop-color="#ffcf4a" />
                </linearGradient>
              </defs>
              <path d="M22.5 3.5c-1 5.5 2.5 8 3 12.5.4 3.4-1.8 5.6-4.2 5.6-2 0-3.3-1.4-3.3-3.3 0-1.6 1-2.8 1-4.4-3.2 2-6.5 5.6-6.5 11.2a9.5 9.5 0 0 0 19 .3c0-6.4-4.6-10.4-7-16.2-.6-1.5-1.2-3.4-2-5.7Z" fill="url(#mGrad)" />
              <path d="M21.8 22.5c-.4 2.6-2.6 3.8-2.4 6.2.15 1.9 1.5 3.1 3.1 3.1 1.9 0 3.3-1.4 3.3-3.4 0-2.8-2-4.3-4-5.9Z" fill="#fff" opacity=".92" />
            </svg>
            <span style="font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#f6f8ff;">Mecha</span>
            <span style="font-family:Arial,sans-serif;font-size:12px;color:#5e6a86;padding-left:6px;">Software para peluquerías</span>
          </td>
        </tr>
        <!-- Tarjeta principal -->
        <tr>
          <td style="background:#0f172a;border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:32px 28px;box-shadow:0 24px 64px -20px rgba(244,80,30,.12);">
            <h1 style="margin:0 0 10px;font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:23px;line-height:1.25;letter-spacing:-.02em;color:#f6f8ff;">Restablece tu contraseña</h1>
            <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#9aa6c2;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Mecha. Pulsa el botón para crear una nueva. El enlace caduca en 1 hora.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" style="border-radius:11px;background:#f4501e;background-image:linear-gradient(135deg,#f4501e 0%,#ff7a2e 50%,#ffb347 100%);box-shadow:0 8px 24px -8px rgba(244,80,30,.5);">
                  <a href="${safeLink}" style="display:inline-block;padding:13px 28px;font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:15px;font-weight:700;color:#160a02;text-decoration:none;border-radius:11px;">Crear nueva contraseña</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5e6a86;">Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
            <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${safeLink}" style="color:#ff7a2e;text-decoration:underline;">${safeLink}</a></p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5e6a86;">Si no fuiste tú, ignora este correo: tu contraseña no cambiará.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 6px 0;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#475569;text-align:center;">
            Mecha &middot; Gestión inteligente para tu salón
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Rate limiting: max 3 intentos por email/hora para prevenir flood y enumeracion abusiva
async function checkRateLimit(email: string, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const ONE_HOUR = 3600;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - ONE_HOUR;

  const { data, error } = await supabase
    .from('rate_limit_reset')
    .select('attempts, window_start')
    .eq('email', email)
    .single();

  if (error || !data) {
    // Primer intento - crear registro
    await supabase.from('rate_limit_reset').insert({
      email,
      attempts: 1,
      window_start: now,
      updated_at: new Date().toISOString()
    });
    return true;
  }

  // Si la ventana ha pasado, resetear
  if (data.window_start < windowStart) {
    await supabase.from('rate_limit_reset')
      .update({ attempts: 1, window_start: now, updated_at: new Date().toISOString() })
      .eq('email', email);
    return true;
  }

  // Dentro de la ventana - verificar limite
  if (data.attempts >= 3) {
    return false; // Rate limit excedido
  }

  // Incrementar contador
  await supabase.from('rate_limit_reset')
    .update({ attempts: data.attempts + 1, updated_at: new Date().toISOString() })
    .eq('email', email);

  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  let payload: { email?: string; redirectTo?: string } = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: 'bad_json' }, 400, req);
  }

  const email = (payload.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400, req);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Rate limiting check
  const allowed = await checkRateLimit(email, admin);
  if (!allowed) {
    return json({
      error: 'too_many_attempts',
      message: 'Demasiados intentos. Por favor, espera 1 hora antes de volver a intentar.'
    }, 429, req);
  }

  // redirectTo validado contra allowlist (anti open-redirect).
  let redirectTo = DEFAULT_REDIRECT;
  if (payload.redirectTo) {
    try {
      const u = new URL(payload.redirectTo);
      if (ALLOWED_ORIGINS.includes(u.origin)) redirectTo = u.origin + '/restablecer.html';
    } catch (_e) {
      // valor invalido -> nos quedamos con el de produccion
    }
  }

  // 1) Comprobar existencia + obtener el enlace. generateLink('recovery') falla
  //    si el usuario no existe (no crea cuentas), asi que sirve de check.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    return json({ exists: false, sent: false }, 200, req);
  }

  // 2) Enviar el correo branded via Resend.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    // El usuario existe pero aun no hay credenciales de Resend: el cliente puede
    // hacer fallback al correo nativo de Supabase para no dejar al user sin email.
    return json({ exists: true, sent: false, error: 'resend_not_configured' }, 200, req);
  }
  const from = Deno.env.get('RESEND_FROM') || 'Mecha <onboarding@resend.dev>';

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Restablece tu contraseña de Mecha',
      html: resetEmailHtml(actionLink),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('resend_error', resp.status, detail);
    return json({ exists: true, sent: false, error: 'send_failed' }, 502, req);
  }

  return json({ exists: true, sent: true }, 200, req);
});
