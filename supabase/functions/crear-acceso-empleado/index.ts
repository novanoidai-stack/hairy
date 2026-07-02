// Edge Function: crear-acceso-empleado
// Da de alta una cuenta de acceso para un miembro del salon (recepcion,
// profesional o direccion) dentro del negocio del que la solicita.
// Solo owner/admin (Propietario/Direccion) pueden llamarla. No crea Propietarios
// (RN-EQ-041). Usa la Admin API con la service_role (nunca en el cliente).
// Envía un correo branded personalizado mediante SMTP de Hostinger.
//
// Cuerpo (POST JSON): { email, nombre, rol }  rol in {admin, recepcion, employee}
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
  'http://localhost:8080',
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

function invitationEmailHtml(o: { nombre: string; link: string; salon: string; color: string }): string {
  return `<div style='background:#f6f1ea;padding:28px 14px'><div style='max-width:480px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden'><div style='height:6px;background:${o.color}'></div><div style='padding:28px'><p style='margin:0 0 10px;font:bold 20px Arial;color:#1c1814'>Mecha</p><h1 style='margin:0 0 12px;font:bold 21px Arial;color:#1c1814'>Únete al equipo de ${o.salon}</h1><p style='margin:0 0 22px;font:14px Arial;line-height:1.6;color:#5c5249'>Hola ${o.nombre}, te han invitado a unirte como profesional al equipo de <strong>${o.salon}</strong> en Mecha OS. Pulsa el botón inferior para establecer tu contraseña y activar tu cuenta.</p><a href='${o.link}' style='display:inline-block;padding:13px 28px;background:${o.color};color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:11px'>Aceptar invitación y configurar cuenta</a><p style='margin:22px 0 6px;font:12px Arial;color:#8a7d70'>Si el botón no funciona, copia y pega este enlace en tu navegador:</p><p style='margin:0 0 18px;font:12px Arial;word-break:break-all'><a href='${o.link}' style='color:#c0260a'>${o.link}</a></p></div></div></div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_PERMITIDOS = ['admin', 'recepcion', 'employee'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  let payload: Record<string, string> = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: 'bad_json' }, 400, req);
  }

  const email = (payload.email || '').trim().toLowerCase();
  const nombre = (payload.nombre || '').trim();
  const rol = (payload.rol || '').trim();

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400, req);
  if (!nombre) return json({ error: 'missing_nombre' }, 400, req);
  if (!ROLES_PERMITIDOS.includes(rol)) return json({ error: 'invalid_role' }, 400, req);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Identificar y autorizar al solicitante (debe ser owner/admin del negocio).
  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerAuth } = await caller.auth.getUser();
  const callerUser = callerAuth?.user;
  if (!callerUser) return json({ error: 'not_authenticated' }, 401, req);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, negocio_id')
    .eq('id', callerUser.id)
    .maybeSingle();

  if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
    return json({ error: 'not_authorized' }, 403, req);
  }
  if (!callerProfile.negocio_id) return json({ error: 'no_negocio' }, 400, req);

  // Obtener el nombre del salón y su color de acento
  const { data: portal } = await admin
    .from('negocio_portal')
    .select('nombre_publico, color_acento')
    .eq('negocio_id', callerProfile.negocio_id)
    .maybeSingle();

  const salon = portal?.nombre_publico || 'tu salón';
  const rawColor = portal?.color_acento || '';
  const color = /^#?[0-9a-f]{6}$/i.test(rawColor) ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '#f4501e';

  // 2) Generar enlace de confirmación seguro de invitación
  const redirectTo = 'https://www.mechaa.es/acceso.html';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: { nombre } }
  });

  if (linkErr || !linkData?.properties?.action_link) {
    const m = (linkErr?.message || '').toLowerCase();
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return json({ error: 'email_exists' }, 409, req);
    }
    return json({ error: 'create_failed', detail: linkErr?.message || 'link_generation_failed' }, 400, req);
  }

  const actionLink = linkData.properties.action_link;
  const user = linkData.user;
  if (!user) return json({ error: 'create_failed' }, 500, req);

  // Configuración SMTP de Hostinger
  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) {
    // Si no está configurado, eliminamos el usuario para permitir reintentos
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return json({ error: 'smtp_not_configured' }, 500, req);
  }

  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || `Mecha <${usr}>`;

  // 3) Enviar correo de invitación vía SMTP
  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({
      from,
      to: email,
      subject: `Únete al equipo de ${salon}`,
      html: invitationEmailHtml({ nombre, link: actionLink, salon, color }),
    });
    await client.close();
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return json({ error: 'send_failed', detail: String(e) }, 502, req);
  }

  // 4) Crear perfil asociado al negocio
  const { error: pErr } = await admin.from('profiles').upsert({
    id: user.id,
    email,
    nombre,
    negocio_id: callerProfile.negocio_id,
    role: rol,
    plan: 'full',
  }, { onConflict: 'id' });

  if (pErr) {
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return json({ error: 'profile_failed', detail: pErr.message }, 500, req);
  }

  return json({ ok: true, user_id: user.id, email, invited: true }, 200, req);
});

