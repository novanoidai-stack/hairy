// Edge Function: notificar-bandeja
// Avisa por correo al titular del salon de que ha llegado un mensaje nuevo a la
// Bandeja (rechazo/cambio/mensaje de un presupuesto, o el formulario de
// "Contactar con el salon"). La dispara la propia pagina publica (anonima) justo
// despues de que la RPC inserte el mensaje. Idempotente: reclama el mensaje con
// un UPDATE condicional antes de enviar, asi un doble click o un reintento del
// navegador no manda dos avisos.
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

const TIPO_LABEL: Record<string, string> = { rechazo: 'ha rechazado el presupuesto', cambio: 'pide un cambio en el presupuesto', mensaje: 'te ha escrito un mensaje' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405, req);

  let body: { mensaje_id?: string } = {};
  try { body = await req.json(); } catch (_e) { return json({ sent: false, error: 'bad_json' }, 400, req); }
  const id = (body.mensaje_id || '').trim();
  if (!id) return json({ sent: false, error: 'falta_mensaje_id' }, 400, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

  // Reclama el mensaje de forma atomica: si ya estaba notificado, no se reenvia.
  const { data: claimed } = await admin.from('mensajes_conversacion')
    .update({ notificado_at: new Date().toISOString() })
    .eq('id', id).eq('autor', 'cliente').is('notificado_at', null)
    .select('id, conversacion_id, tipo, cuerpo').maybeSingle();
  if (!claimed) return json({ sent: true, skipped: true }, 200, req);

  const { data: conv } = await admin.from('conversaciones')
    .select('id, negocio_id, origen, presupuesto_id, contacto_nombre')
    .eq('id', claimed.conversacion_id).maybeSingle();
  if (!conv) return json({ sent: false, error: 'conversacion_no_encontrada' }, 404, req);

  const { data: owner } = await admin.from('profiles').select('email').eq('negocio_id', conv.negocio_id).eq('role', 'owner').order('created_at', { ascending: true }).limit(1).maybeSingle();
  const to = (owner?.email || '').trim().toLowerCase();
  if (!to) return json({ sent: false, error: 'sin_email_titular' }, 200, req);

  let numero: number | null = null;
  if (conv.presupuesto_id) {
    const { data: pre } = await admin.from('presupuestos').select('numero').eq('id', conv.presupuesto_id).maybeSingle();
    numero = pre?.numero ?? null;
  }

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) return json({ sent: false, error: 'smtp_not_configured' }, 200, req);

  let base = Deno.env.get('PUBLIC_APP_URL') || 'https://www.mechaa.es';
  if (base.endsWith('/')) base = base.slice(0, -1);
  const link = `${base}/app/bandeja`;
  const nombre = (conv.contacto_nombre || 'Un cliente').trim();
  const accion = TIPO_LABEL[claimed.tipo] || TIPO_LABEL.mensaje;
  const asunto = conv.origen === 'presupuesto'
    ? `${nombre} ${accion}${numero ? ` (P-${numero})` : ''}`
    : `${nombre} te ha escrito desde tu pagina de contacto`;
  const cuerpoCorto = (claimed.cuerpo || '').slice(0, 280);

  const html = `<div style='background:#f6f1ea;padding:24px 14px'><div style='max-width:480px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;padding:26px'>
    <p style='margin:0 0 4px;font:12px Arial;letter-spacing:1px;text-transform:uppercase;color:#8a7d70'>Bandeja de Mecha</p>
    <h1 style='margin:0 0 14px;font:bold 20px Arial;color:#1c1814'>${asunto}</h1>
    ${cuerpoCorto ? `<p style='margin:0 0 18px;font:14px Arial;line-height:1.6;color:#5c5249;white-space:pre-wrap'>${cuerpoCorto}</p>` : ''}
    <a href='${link}' style='display:inline-block;padding:12px 28px;background:#f4501e;color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:10px'>Ver y responder</a>
  </div></div>`;

  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({ from: `Mecha <${usr}>`, to, subject: asunto, html });
    await client.close();
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    return json({ sent: false, error: 'send_failed' }, 502, req);
  }

  return json({ sent: true }, 200, req);
});
