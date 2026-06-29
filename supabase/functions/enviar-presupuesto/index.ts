// Edge Function: enviar-presupuesto
// Envía al cliente el presupuesto por correo (Resend) con el PDF adjunto y un
// enlace a la página pública de aceptación. El profesional lo dispara con un click
// desde Mecha (no se sale de la app). El WhatsApp lo conecta Alexandro aparte
// (cola `presupuestos_pendientes_envio`).
//
// Cuerpo (POST JSON): { presupuesto_id }
// Respuestas: 200 { sent:true } | 200 { sent:false, error } | 4xx { error }
//
// Secretos (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY   key de Resend (re_...).
//   RESEND_FROM      remitente, p.ej. "Mecha <no-reply@tudominio.com>".
//   PUBLIC_APP_URL   base pública para el enlace, p.ej. https://hairy-two.vercel.app
// Inyectados por Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  const headers = req ? corsHeaders(req) : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const eur = (cents: number) => `${((cents || 0) / 100).toFixed(2)} €`;

function emailHtml(opts: {
  salon: string;
  nombre: string;
  numero: number | null;
  totalCents: number;
  lineas: Array<{ nombre: string; precio_cents: number; cantidad: number }>;
  link: string;
  color: string;
}): string {
  const filas = opts.lineas
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;font-family:Arial,sans-serif;font-size:13px;color:#1c1814;border-bottom:1px solid #efe7dd;">${l.nombre} ${l.cantidad > 1 ? `<span style="color:#8a7d70;">x${l.cantidad}</span>` : ''}</td>
        <td style="padding:8px 0;font-family:Arial,sans-serif;font-size:13px;color:#1c1814;text-align:right;border-bottom:1px solid #efe7dd;white-space:nowrap;">${eur((l.precio_cents || 0) * Math.max(1, l.cantidad || 1))}</td>
      </tr>`
    )
    .join('');
  const link = opts.link.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tu presupuesto de ${opts.salon}</title></head>
<body style="margin:0;padding:0;background:#f6f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;">
      <tr><td style="height:6px;background:${opts.color};border-radius:6px 6px 0 0;"></td></tr>
      <tr><td style="background:#fffdfb;border:1px solid rgba(40,30,24,0.10);border-top:none;border-radius:0 0 16px 16px;padding:30px 28px;">
        <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8a7d70;">Presupuesto P-${opts.numero ?? '—'}</p>
        <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:22px;color:#1c1814;">${opts.salon}</h1>
        <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#5c5249;">Hola ${opts.nombre || ''}, te enviamos el presupuesto que has pedido. Tienes el detalle completo en el PDF adjunto.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${filas}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
          <tr><td style="padding:10px 0;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#1c1814;">Total</td>
          <td style="padding:10px 0;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:${opts.color};text-align:right;">${eur(opts.totalCents)}</td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 6px;">
          <tr><td align="center" style="border-radius:11px;background:${opts.color};">
            <a href="${link}" style="display:inline-block;padding:13px 30px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#fff;text-decoration:none;border-radius:11px;">Ver y aceptar el presupuesto</a>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#8a7d70;text-align:center;">Presupuesto orientativo · No es una factura.</p>
      </td></tr>
      <tr><td style="padding:16px 6px 0;font-family:Arial,sans-serif;font-size:11px;color:#a99e90;text-align:center;">Enviado con Mecha</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405, req);

  let payload: { presupuesto_id?: string } = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ sent: false, error: 'bad_json' }, 400, req);
  }
  const presupuestoId = (payload.presupuesto_id || '').trim();
  if (!presupuestoId) return json({ sent: false, error: 'falta_presupuesto_id' }, 400, req);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Identificar al usuario que llama (staff) y su negocio.
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ sent: false, error: 'no_autorizado' }, 401, req);

  const { data: profile } = await admin.from('profiles').select('negocio_id').eq('id', user.id).maybeSingle();
  if (!profile?.negocio_id) return json({ sent: false, error: 'sin_perfil' }, 403, req);

  // Cargar el presupuesto y verificar que es de su negocio.
  const { data: pre } = await admin
    .from('presupuestos')
    .select('id, negocio_id, numero, estado, contacto_nombre, contacto_email, total_cents, token, pdf_path')
    .eq('id', presupuestoId)
    .maybeSingle();
  if (!pre) return json({ sent: false, error: 'no_encontrado' }, 404, req);
  if (pre.negocio_id !== profile.negocio_id) return json({ sent: false, error: 'no_autorizado' }, 403, req);

  const to = (pre.contacto_email || '').trim().toLowerCase();
  if (!to || !EMAIL_RE.test(to)) return json({ sent: false, error: 'sin_email' }, 400, req);
  if (!pre.pdf_path) return json({ sent: false, error: 'sin_pdf' }, 400, req);

  // Datos del salón (marca) + líneas para el cuerpo.
  const { data: portal } = await admin
    .from('negocio_portal')
    .select('nombre_publico, color_acento')
    .eq('negocio_id', pre.negocio_id)
    .maybeSingle();
  const { data: lineas } = await admin
    .from('presupuesto_lineas')
    .select('nombre, precio_cents, cantidad')
    .eq('presupuesto_id', pre.id)
    .order('orden');

  // Descargar el PDF del bucket privado.
  const { data: pdfBlob, error: dlErr } = await admin.storage.from('presupuestos').download(pre.pdf_path);
  if (dlErr || !pdfBlob) return json({ sent: false, error: 'pdf_no_disponible' }, 502, req);
  const pdfB64 = toBase64(new Uint8Array(await pdfBlob.arrayBuffer()));

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json({ sent: false, error: 'resend_not_configured' }, 200, req);
  const from = Deno.env.get('RESEND_FROM') || 'Mecha <onboarding@resend.dev>';
  const base = (Deno.env.get('PUBLIC_APP_URL') || 'https://hairy-two.vercel.app').replace(/\/$/, '');
  const salon = portal?.nombre_publico || 'tu salón';
  const color = (portal?.color_acento && /^#?[0-9a-f]{6}$/i.test(portal.color_acento)) ? portal.color_acento : '#f4501e';
  const link = `${base}/app/presupuesto/${pre.token}`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Tu presupuesto de ${salon} (P-${pre.numero ?? ''})`.trim(),
      html: emailHtml({
        salon,
        nombre: (pre.contacto_nombre || '').split(' ')[0] || '',
        numero: pre.numero,
        totalCents: pre.total_cents,
        lineas: lineas || [],
        link,
        color: color.startsWith('#') ? color : `#${color}`,
      }),
      attachments: [{ filename: `presupuesto-P-${pre.numero ?? ''}.pdf`, content: pdfB64 }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('resend_error', resp.status, detail);
    return json({ sent: false, error: 'send_failed' }, 502, req);
  }

  // Marcar enviado por correo (y pasar a 'enviado' si era borrador).
  await admin
    .from('presupuestos')
    .update({
      enviado_email_at: new Date().toISOString(),
      estado: pre.estado === 'borrador' ? 'enviado' : pre.estado,
    })
    .eq('id', pre.id);

  return json({ sent: true }, 200, req);
});
