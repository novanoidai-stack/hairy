// Edge Function: notificar-soporte
//
// El salon manda un mensaje de soporte "a traves de Mecha" (RPC
// crear_mensaje_soporte, ya guardado y visible en el panel de staff). Esta
// funcion es el aviso por correo para que el equipo no tenga que estar
// mirando el panel: mismo SMTP de Hostinger que notificar-solicitud /
// send-reset. Si el correo falla, el ticket ya esta guardado igualmente -
// esta funcion se llama en fire-and-forget desde el cliente.
//
// Cuerpo (POST JSON): { asunto, mensaje, negocio, autor_nombre, autor_email }
// Secretos: SMTP_HOST (def smtp.hostinger.com) SMTP_PORT (def 465)
//           SMTP_USER SMTP_PASS SMTP_FROM (def = SMTP_USER)
//           MECHA_CONTACTO_EMAIL (def contacto@mechaa.es)
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGENES = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];
function esOrigenPermitido(o: string): boolean {
  if (ORIGENES.includes(o)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': esOrigenPermitido(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), { status, headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' } });
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recorta = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

function correoAviso(d: Record<string, string>): string {
  const filas = [
    ['Salón', d.negocio],
    ['De', d.autor_nombre],
    ['Email', d.autor_email],
    ['Asunto', d.asunto],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;font:13px Arial;color:#8a7d70;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font:bold 13px Arial;color:#1c1814">${esc(v)}</td></tr>`)
    .join('');
  const cuerpo = `<div style="margin-top:14px;padding:12px 14px;background:#f6f1ea;border-radius:8px;font:13px Arial;color:#5c5249;white-space:pre-wrap">${esc(d.mensaje)}</div>`;
  return `<div style="background:#f6f1ea;padding:22px 14px"><div style="max-width:520px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden"><div style="height:6px;background:#f4501e"></div><div style="padding:22px 24px"><p style="margin:0 0 2px;font:12px Arial;letter-spacing:1px;text-transform:uppercase;color:#8a7d70">Mensaje de soporte</p><h1 style="margin:0 0 16px;font:bold 21px Arial;color:#1c1814">${esc(d.asunto || 'Mensaje de un salón')}</h1><table cellpadding="0" cellspacing="0">${filas}</table>${cuerpo}<p style="margin:18px 0 0;font:12px Arial;color:#a99e90">Ya está guardado en el panel de staff (pestaña Soporte). Responde a este correo o escribe directamente a ${esc(d.autor_email || 'el salón')}.</p></div></div></div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ enviado: false, error: 'method_not_allowed' }, 405, req);

  const bruto = await req.text();
  if (bruto.length > 6000) return json({ enviado: false, error: 'payload_too_large' }, 400, req);
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(bruto);
  } catch (_e) {
    return json({ enviado: false, error: 'bad_json' }, 400, req);
  }

  const d: Record<string, string> = {
    asunto: recorta(p.asunto, 200),
    mensaje: recorta(p.mensaje, 4000),
    negocio: recorta(p.negocio, 120),
    autor_nombre: recorta(p.autor_nombre, 120),
    autor_email: recorta(p.autor_email, 160),
  };
  if (!d.asunto || !d.mensaje) return json({ enviado: false, error: 'faltan_datos' }, 400, req);

  // El ticket ya vive en soporte_mensajes (lo crea el RPC llamado antes que
  // esto); solo se manda el aviso si la llamada trae la cabecera de un
  // usuario autenticado. Evita que cualquiera use este endpoint para spamear
  // el buzon de Mecha sin haber creado antes un ticket real.
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const auth = req.headers.get('authorization') || '';
  if (!url || !anon || !auth) return json({ enviado: false, error: 'no_autorizado' }, 401, req);
  const db = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await db.auth.getUser();
  if (userErr || !userData?.user) return json({ enviado: false, error: 'no_autorizado' }, 401, req);

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || 465);
  const user = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER') || '';
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS') || '';
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || user;
  const nuestro = Deno.env.get('MECHA_CONTACTO_EMAIL') || 'contacto@mechaa.es';
  if (!user || !pass) return json({ enviado: false, error: 'smtp_not_configured' }, 200, req);

  const cliente = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });

  let enviado = false;
  try {
    await cliente.send({
      from: `Mecha <${from}>`,
      to: nuestro,
      replyTo: d.autor_email || undefined,
      subject: `[Soporte] ${d.asunto}${d.negocio ? ` — ${d.negocio}` : ''}`,
      html: correoAviso(d),
    });
    enviado = true;
  } catch (e) {
    console.error('notificar_soporte_fallo', String(e));
  }
  try {
    await cliente.close();
  } catch (_e) { /* cerrar no debe cambiar el resultado */ }

  return json({ enviado }, 200, req);
});
