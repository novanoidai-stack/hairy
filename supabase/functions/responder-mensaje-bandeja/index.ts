// Edge Function: responder-mensaje-bandeja
// Envia por correo la respuesta que el salon ha escrito en la Bandeja a un
// mensaje del cliente (rechazo/cambio/mensaje de un presupuesto, o un mensaje de
// "Contactar con el salon"). El profesional escribe la respuesta en el software
// (se inserta primero el mensaje autor='salon' via RLS) y esta funcion solo se
// encarga de mandarla por correo al contacto. Si el mensaje viene de un
// presupuesto, enlaza a su pagina publica (donde el cliente ve el hilo completo).
//
// Cuerpo (POST JSON): { mensaje_id }
// Secretos: igual que enviar-presupuesto (SMTP_HOST/PORT/USER/PASS/FROM, PUBLIC_APP_URL)
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405, req);

  let body: { mensaje_id?: string } = {};
  try { body = await req.json(); } catch (_e) { return json({ sent: false, error: 'bad_json' }, 400, req); }
  const id = (body.mensaje_id || '').trim();
  if (!id) return json({ sent: false, error: 'falta_mensaje_id' }, 400, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: ud } = await admin.auth.getUser(jwt);
  const user = ud?.user;
  if (!user) return json({ sent: false, error: 'no_autorizado' }, 401, req);
  const { data: prof } = await admin.from('profiles').select('negocio_id').eq('id', user.id).maybeSingle();
  if (!prof?.negocio_id) return json({ sent: false, error: 'sin_perfil' }, 403, req);

  const { data: msg } = await admin.from('mensajes_conversacion').select('id, conversacion_id, autor, cuerpo, enviado_email_at').eq('id', id).maybeSingle();
  if (!msg) return json({ sent: false, error: 'no_encontrado' }, 404, req);
  if (msg.autor !== 'salon') return json({ sent: false, error: 'no_es_respuesta' }, 400, req);
  if (msg.enviado_email_at) return json({ sent: true, skipped: true }, 200, req);

  const { data: conv } = await admin.from('conversaciones')
    .select('id, negocio_id, origen, presupuesto_id, cliente_id, contacto_nombre, contacto_email')
    .eq('id', msg.conversacion_id).maybeSingle();
  if (!conv) return json({ sent: false, error: 'conversacion_no_encontrada' }, 404, req);
  if (conv.negocio_id !== prof.negocio_id) return json({ sent: false, error: 'no_autorizado' }, 403, req);

  let to = (conv.contacto_email || '').trim().toLowerCase();
  if (!to && conv.cliente_id) {
    const { data: cli } = await admin.from('clientes').select('email').eq('id', conv.cliente_id).maybeSingle();
    to = (cli?.email || '').trim().toLowerCase();
  }
  if (!to || !to.includes('@')) return json({ sent: false, error: 'sin_email' }, 400, req);

  const { data: portal } = await admin.from('negocio_portal').select('nombre_publico, color_acento, logo_url, web, slug').eq('negocio_id', conv.negocio_id).maybeSingle();
  const { data: owner } = await admin.from('profiles').select('email').eq('negocio_id', conv.negocio_id).eq('role', 'owner').order('created_at', { ascending: true }).limit(1).maybeSingle();

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) return json({ sent: false, error: 'smtp_not_configured' }, 200, req);

  let base = Deno.env.get('PUBLIC_APP_URL') || 'https://www.mechaa.es';
  if (base.endsWith('/')) base = base.slice(0, -1);
  const salon = portal?.nombre_publico || 'tu salon';
  const rawColor = portal?.color_acento || '';
  const color = /^#?[0-9a-f]{6}$/i.test(rawColor) ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '#f4501e';
  const logoUrl = (portal?.logo_url || '').trim();
  const salonEmail = (owner?.email || '').trim().toLowerCase();
  const nombre = (conv.contacto_nombre || '').split(' ')[0] || '';

  let presupuestoLink = '';
  if (conv.presupuesto_id) {
    const { data: pre } = await admin.from('presupuestos').select('token, numero').eq('id', conv.presupuesto_id).maybeSingle();
    if (pre?.token) presupuestoLink = `${base}/app/presupuesto/${pre.token}`;
  }

  const marca = logoUrl
    ? `<img src='${logoUrl}' alt='${salon}' style='max-height:56px;max-width:220px;display:inline-block'/>`
    : `<span style='font:bold 23px Arial;color:#1c1814'>${salon}</span>`;

  const html = `<div style='background:#f6f1ea;padding:24px 14px'><div style='max-width:520px;margin:0 auto'><div style='text-align:center;padding:6px 0 18px'>${marca}</div><div style='background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden'><div style='height:6px;background:${color}'></div><div style='padding:26px'>
    <p style='margin:0 0 18px;font:14px Arial;line-height:1.6;color:#1c1814'>Hola ${nombre}, ${salon} te ha respondido:</p>
    <p style='margin:0 0 20px;padding:14px 16px;background:#f6f1ea;border-radius:10px;font:14px Arial;line-height:1.6;color:#1c1814;white-space:pre-wrap'>${(msg.cuerpo || '').slice(0, 2000)}</p>
    ${presupuestoLink ? `<a href='${presupuestoLink}' style='display:inline-block;padding:12px 28px;background:${color};color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:10px'>Ver tu presupuesto</a>` : ''}
  </div></div><div style='text-align:center;padding:16px 6px 0;font:12px Arial;color:#8a7d70'><div style='font:bold 13px Arial;color:#5c5249'>${salon}</div></div></div></div>`;

  const fromName = salon.replace(/[<>"]/g, '').slice(0, 60);
  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({
      from: `${fromName} <${usr}>`,
      replyTo: salonEmail || usr,
      to,
      subject: `Respuesta de ${salon}`,
      html,
    });
    await client.close();
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    return json({ sent: false, error: 'send_failed' }, 502, req);
  }

  await admin.from('mensajes_conversacion').update({ enviado_email_at: new Date().toISOString() }).eq('id', id);
  return json({ sent: true }, 200, req);
});
