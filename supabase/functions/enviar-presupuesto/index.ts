// Edge Function: enviar-presupuesto
// Envia al cliente el presupuesto por correo via SMTP de Hostinger (desde el buzon
// del salon, p.ej. contacto@mechaa.es) con el PDF adjunto y enlace a la pagina
// publica de aceptacion. El profesional lo dispara con un click desde Mecha.
// WhatsApp lo conecta Alexandro aparte (cola presupuestos_pendientes_envio).
//
// Cuerpo (POST JSON): { presupuesto_id }
// Secretos (Supabase -> Edge Functions -> Secrets):
//   SMTP_HOST (def smtp.hostinger.com) SMTP_PORT (def 465) SMTP_USER SMTP_PASS
//   SMTP_FROM (def = SMTP_USER) PUBLIC_APP_URL (def https://hairy-two.vercel.app)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ORIGINS = ['https://hairy-two.vercel.app','https://www.novanoidai.com','http://localhost:8080','http://localhost:8081','http://localhost:3000','http://localhost:19006'];
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
function toB64(bytes: Uint8Array): string {
  let bin = ''; const c = 0x8000;
  for (let i = 0; i < bytes.length; i += c) bin += String.fromCharCode(...bytes.subarray(i, i + c));
  return btoa(bin);
}
const eur = (c: number) => `${((c || 0) / 100).toFixed(2)} EUR`;

function emailHtml(o: { salon: string; nombre: string; numero: number | null; totalCents: number; lineas: Array<{ nombre: string; precio_cents: number; cantidad: number }>; link: string; color: string }): string {
  const filas = o.lineas.map((l) => `<tr><td style='padding:7px 0;font:13px Arial;color:#1c1814;border-bottom:1px solid #efe7dd'>${l.nombre}${l.cantidad > 1 ? ' x' + l.cantidad : ''}</td><td style='padding:7px 0;font:13px Arial;color:#1c1814;text-align:right;border-bottom:1px solid #efe7dd'>${eur((l.precio_cents || 0) * Math.max(1, l.cantidad || 1))}</td></tr>`).join('');
  return `<div style='background:#f6f1ea;padding:28px 14px'><div style='max-width:520px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden'><div style='height:6px;background:${o.color}'></div><div style='padding:26px'><p style='margin:0 0 4px;font:12px Arial;letter-spacing:1px;text-transform:uppercase;color:#8a7d70'>Presupuesto P-${o.numero ?? ''}</p><h1 style='margin:0 0 14px;font:bold 22px Arial;color:#1c1814'>${o.salon}</h1><p style='margin:0 0 18px;font:14px Arial;line-height:1.6;color:#5c5249'>Hola ${o.nombre || ''}, te enviamos el presupuesto que has pedido. Tienes el detalle completo en el PDF adjunto.</p><table width='100%' cellpadding='0' cellspacing='0'>${filas}</table><table width='100%' style='margin:6px 0 20px'><tr><td style='font:bold 15px Arial;color:#1c1814'>Total</td><td style='font:bold 18px Arial;color:${o.color};text-align:right'>${eur(o.totalCents)}</td></tr></table><a href='${o.link}' style='display:inline-block;padding:12px 28px;background:${o.color};color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:10px'>Ver y aceptar el presupuesto</a><p style='margin:16px 0 0;font:11px Arial;color:#8a7d70'>Presupuesto orientativo - No es una factura - Enviado con Mecha</p></div></div></div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405, req);

  let body: { presupuesto_id?: string } = {};
  try { body = await req.json(); } catch (_e) { return json({ sent: false, error: 'bad_json' }, 400, req); }
  const id = (body.presupuesto_id || '').trim();
  if (!id) return json({ sent: false, error: 'falta_presupuesto_id' }, 400, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: ud } = await admin.auth.getUser(jwt);
  const user = ud?.user;
  if (!user) return json({ sent: false, error: 'no_autorizado' }, 401, req);
  const { data: prof } = await admin.from('profiles').select('negocio_id').eq('id', user.id).maybeSingle();
  if (!prof?.negocio_id) return json({ sent: false, error: 'sin_perfil' }, 403, req);

  const { data: pre } = await admin.from('presupuestos').select('id, negocio_id, numero, estado, contacto_nombre, contacto_email, total_cents, token, pdf_path').eq('id', id).maybeSingle();
  if (!pre) return json({ sent: false, error: 'no_encontrado' }, 404, req);
  if (pre.negocio_id !== prof.negocio_id) return json({ sent: false, error: 'no_autorizado' }, 403, req);

  const to = (pre.contacto_email || '').trim().toLowerCase();
  if (!to || !to.includes('@')) return json({ sent: false, error: 'sin_email' }, 400, req);
  if (!pre.pdf_path) return json({ sent: false, error: 'sin_pdf' }, 400, req);

  const { data: portal } = await admin.from('negocio_portal').select('nombre_publico, color_acento').eq('negocio_id', pre.negocio_id).maybeSingle();
  const { data: lineas } = await admin.from('presupuesto_lineas').select('nombre, precio_cents, cantidad').eq('presupuesto_id', pre.id).order('orden');

  const { data: pdfBlob, error: dlErr } = await admin.storage.from('presupuestos').download(pre.pdf_path);
  if (dlErr || !pdfBlob) return json({ sent: false, error: 'pdf_no_disponible' }, 502, req);
  const pdfB64 = toB64(new Uint8Array(await pdfBlob.arrayBuffer()));

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) return json({ sent: false, error: 'smtp_not_configured' }, 200, req);
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || `Mecha <${usr}>`;

  let base = Deno.env.get('PUBLIC_APP_URL') || 'https://hairy-two.vercel.app';
  if (base.endsWith('/')) base = base.slice(0, -1);
  const salon = portal?.nombre_publico || 'tu salon';
  const rawColor = portal?.color_acento || '';
  const color = /^#?[0-9a-f]{6}$/i.test(rawColor) ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '#f4501e';
  const link = `${base}/app/presupuesto/${pre.token}`;

  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({
      from,
      to,
      subject: `Tu presupuesto de ${salon} (P-${pre.numero ?? ''})`.trim(),
      html: emailHtml({ salon, nombre: (pre.contacto_nombre || '').split(' ')[0] || '', numero: pre.numero, totalCents: pre.total_cents, lineas: lineas || [], link, color }),
      attachments: [{ filename: `presupuesto-P-${pre.numero ?? ''}.pdf`, content: pdfB64, encoding: 'base64', contentType: 'application/pdf' }],
    });
    await client.close();
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    return json({ sent: false, error: 'send_failed' }, 502, req);
  }

  await admin.from('presupuestos').update({ enviado_email_at: new Date().toISOString(), estado: pre.estado === 'borrador' ? 'enviado' : pre.estado }).eq('id', pre.id);
  return json({ sent: true }, 200, req);
});
