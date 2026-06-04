// Edge Function: send-reset
// Envia el correo de recuperacion de contrasena con la marca Mecha (via Resend)
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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Origenes desde los que aceptamos el redirectTo del cliente. Evita open-redirect:
// si el valor no casa, se usa el de produccion. Anade aqui el dominio propio
// cuando se compre (debe estar tambien en las Redirect URLs de Supabase).
const ALLOWED_ORIGINS = [
  'https://hairy-two.vercel.app',
  'http://localhost:8081',
  'http://localhost:3000',
];
const DEFAULT_REDIRECT = 'https://hairy-two.vercel.app/restablecer.html';

// Plantilla del correo: dark navy + gradiente calido de Mecha. Layout en tablas
// e inline-styles por compatibilidad con clientes de correo.
function resetEmailHtml(actionLink: string): string {
  const safeLink = actionLink.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>Restablece tu contrasena de Mecha</title>
</head>
<body style="margin:0;padding:0;background:#070a14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#070a14;">Crea una nueva contrasena para tu cuenta de Mecha. El enlace caduca en 1 hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070a14;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;">
        <tr>
          <td style="padding:0 4px 18px;">
            <span style="font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#f6f8ff;">Mecha</span>
            <span style="font-family:Arial,sans-serif;font-size:12px;color:#5e6a86;padding-left:8px;">Software para peluquerias</span>
          </td>
        </tr>
        <tr>
          <td style="background:#101729;border:1px solid rgba(148,163,184,.16);border-radius:18px;padding:34px 30px;">
            <div style="height:4px;width:54px;border-radius:4px;background:#ff8a3d;background-image:linear-gradient(120deg,#ff8a3d,#ff9d2e 55%,#ffce4a);margin-bottom:22px;"></div>
            <h1 style="margin:0 0 12px;font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:24px;line-height:1.2;letter-spacing:-.02em;color:#f6f8ff;">Restablece tu contrasena</h1>
            <p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#9aa6c2;">Hemos recibido una solicitud para restablecer la contrasena de tu cuenta de Mecha. Pulsa el boton para crear una nueva. El enlace caduca en 1 hora.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td align="center" bgcolor="#f4501e" style="border-radius:12px;background:#f4501e;background-image:linear-gradient(120deg,#ff8a3d,#ff9d2e 55%,#ffce4a);">
                  <a href="${safeLink}" style="display:inline-block;padding:14px 26px;font-family:'Bricolage Grotesque',Arial,sans-serif;font-size:15px;font-weight:700;color:#160a02;text-decoration:none;border-radius:12px;">Crear nueva contrasena</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#5e6a86;">Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
            <p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.5;word-break:break-all;"><a href="${safeLink}" style="color:#ff8a3d;text-decoration:underline;">${safeLink}</a></p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#5e6a86;">Si no fuiste tu, ignora este correo: tu contrasena no cambiara.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 6px 0;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#5e6a86;">
            Mecha &middot; Gestion inteligente para tu salon. Este correo se envio porque alguien solicito restablecer la contrasena de esta direccion.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: { email?: string; redirectTo?: string } = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: 'bad_json' }, 400);
  }

  const email = (payload.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);

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

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Comprobar existencia + obtener el enlace. generateLink('recovery') falla
  //    si el usuario no existe (no crea cuentas), asi que sirve de check.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    return json({ exists: false, sent: false });
  }

  // 2) Enviar el correo branded via Resend.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    // El usuario existe pero aun no hay credenciales de Resend: el cliente puede
    // hacer fallback al correo nativo de Supabase para no dejar al user sin email.
    return json({ exists: true, sent: false, error: 'resend_not_configured' });
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
      subject: 'Restablece tu contrasena de Mecha',
      html: resetEmailHtml(actionLink),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('resend_error', resp.status, detail);
    return json({ exists: true, sent: false, error: 'send_failed' }, 502);
  }

  return json({ exists: true, sent: true });
});
