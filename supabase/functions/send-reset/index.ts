// Edge Function: send-reset
// Envia el correo de recuperacion de contrasena con la marca Mecha via SMTP de
// Hostinger (buzon del salon, p.ej. contacto@mechaa.es). Antes usaba Resend.
//
// Cuerpo (POST JSON): { email, redirectTo? }
// Respuestas:
//   200 { exists:false, sent:false }                 -> no hay cuenta con ese correo
//   200 { exists:true,  sent:true  }                 -> correo branded enviado
//   200 { exists:true,  sent:false, error:'smtp_not_configured' }
//   502 { exists:true,  sent:false, error:'send_failed' }
//   4xx { error: codigo }
//
// Secretos (Supabase -> Edge Functions -> Secrets):
//   SMTP_HOST (def smtp.hostinger.com) SMTP_PORT (def 465) SMTP_USER SMTP_PASS SMTP_FROM
// Inyectados por Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ORIGINS = ['https://www.mechaa.es','https://mechaa.es','https://hairy-two.vercel.app','https://www.novanoidai.com','http://localhost:8080','http://localhost:8081','http://localhost:3000','http://localhost:19006'];
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' } });
}

const DEFAULT_REDIRECT = 'https://www.mechaa.es/restablecer.html';

function resetEmailHtml(link: string): string {
  return `<div style='background:#f6f1ea;padding:28px 14px'><div style='max-width:480px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden'><div style='height:6px;background:#f4501e'></div><div style='padding:28px'><p style='margin:0 0 10px;font:bold 20px Arial;color:#1c1814'>Mecha</p><h1 style='margin:0 0 12px;font:bold 21px Arial;color:#1c1814'>Restablece tu contrasena</h1><p style='margin:0 0 22px;font:14px Arial;line-height:1.6;color:#5c5249'>Hemos recibido una solicitud para restablecer la contrasena de tu cuenta de Mecha. Pulsa el boton para crear una nueva. El enlace caduca en 1 hora.</p><a href='${link}' style='display:inline-block;padding:13px 28px;background:#f4501e;color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:11px'>Crear nueva contrasena</a><p style='margin:22px 0 6px;font:12px Arial;color:#8a7d70'>Si el boton no funciona, copia y pega este enlace en tu navegador:</p><p style='margin:0 0 18px;font:12px Arial;word-break:break-all'><a href='${link}' style='color:#c0260a'>${link}</a></p><p style='margin:0;font:12px Arial;color:#8a7d70'>Si no fuiste tu, ignora este correo: tu contrasena no cambiara.</p></div></div></div>`;
}

// Rate limiting: max 3 intentos por email/hora (tabla rate_limit_reset).
async function checkRateLimit(email: string, supabase: any): Promise<boolean> {
  const ONE_HOUR = 3600;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - ONE_HOUR;
  const { data, error } = await supabase.from('rate_limit_reset').select('attempts, window_start').eq('email', email).single();
  if (error || !data) {
    await supabase.from('rate_limit_reset').insert({ email, attempts: 1, window_start: now, updated_at: new Date().toISOString() });
    return true;
  }
  if (data.window_start < windowStart) {
    await supabase.from('rate_limit_reset').update({ attempts: 1, window_start: now, updated_at: new Date().toISOString() }).eq('email', email);
    return true;
  }
  if (data.attempts >= 3) return false;
  await supabase.from('rate_limit_reset').update({ attempts: data.attempts + 1, updated_at: new Date().toISOString() }).eq('email', email);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  let payload: { email?: string; redirectTo?: string } = {};
  try { payload = await req.json(); } catch (_e) { return json({ error: 'bad_json' }, 400, req); }

  const email = (payload.email || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) return json({ error: 'invalid_email' }, 400, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

  const allowed = await checkRateLimit(email, admin);
  if (!allowed) return json({ error: 'too_many_attempts', message: 'Demasiados intentos. Por favor, espera 1 hora antes de volver a intentar.' }, 429, req);

  // redirectTo validado contra allowlist (anti open-redirect).
  let redirectTo = DEFAULT_REDIRECT;
  if (payload.redirectTo) {
    try { const u = new URL(payload.redirectTo); if (ORIGINS.includes(u.origin)) redirectTo = u.origin + '/restablecer.html'; } catch (_e) { /* valor invalido */ }
  }

  // generateLink('recovery') falla si el usuario no existe -> sirve de check.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) return json({ exists: false, sent: false }, 200, req);

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) return json({ exists: true, sent: false, error: 'smtp_not_configured' }, 200, req);
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || `Mecha <${usr}>`;

  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({ from, to: email, subject: 'Restablece tu contrasena de Mecha', html: resetEmailHtml(actionLink) });
    await client.close();
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    return json({ exists: true, sent: false, error: 'send_failed' }, 502, req);
  }

  return json({ exists: true, sent: true }, 200, req);
});
