// Edge Function: notificar-solicitud
//
// Avisa por correo de un contacto comercial nuevo (llamada agendada, mensaje o
// "quiero el software"). Manda DOS correos por SMTP de Hostinger, el mismo que
// ya usan enviar-presupuesto y crear-acceso-empleado:
//   1) a Mecha, con los datos de contacto y lo que ha pedido, para responder.
//   2) al interesado, confirmandole que lo hemos recibido (y cuando le
//      llamamos, si eligio llamada).
//
// Antes esto no existia: la reserva de llamada solo escribia en `solicitudes` y
// dependia de un endpoint de otro proyecto (novanoidai.com) para el correo del
// cliente; a nosotros no nos llegaba NADA por correo.
//
// Cuerpo (POST JSON): { tipo, nombre, email, telefono, salon, mensaje,
//                       fecha_iso, hora, herramienta, num_profesionales }
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' },
  });
}

// Freno de mano. Esta funcion manda un correo a la direccion que le pases: sin
// limite, cualquiera puede usarla para llenarle el buzon a otra persona con
// nuestro remite (y de paso quemar la reputacion del dominio). Se limita por
// las dos puntas: quien llama (IP) y a quien se escribe (email).
// El limite vive en la BD (public.check_rate_limit) y solo lo consulta la
// service_role, nunca el navegador.
async function dentroDelLimite(cubo: string, clave: string, max: number, minutos: number): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !clave) return true; // sin con que comprobar, no bloqueamos
  try {
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await db.rpc('check_rate_limit', {
      p_cubo: cubo, p_clave: clave, p_max: max, p_minutos: minutos,
    });
    if (error) {
      console.error('rate_limit_error', error.message);
      return true; // un fallo nuestro no puede dejar sin contacto a un cliente real
    }
    return data !== false;
  } catch (e) {
    console.error('rate_limit_error', String(e));
    return true;
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recorta = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

const TITULO: Record<string, string> = {
  reserva_llamada: 'Llamada agendada',
  mensaje: 'Mensaje desde la web',
  quiero_software: 'Quiere el software',
};

function correoParaNosotros(d: Record<string, string>): string {
  const filas = [
    ['Nombre', d.nombre],
    ['Salón', d.salon],
    ['Teléfono', d.telefono],
    ['Email', d.email],
    ['Profesionales', d.num_profesionales],
    ['Usa ahora', d.herramienta],
    // Que tarjeta de precios pulso. Sin esto todas las solicitudes llegan iguales
    // y quien concede el acceso no sabe a que plan venia el salon.
    ['Plan que quiere', d.plan],
    ['Cuándo', d.fecha_iso ? `${d.fecha_iso}${d.hora ? ` a las ${d.hora}` : ''}` : ''],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;font:13px Arial;color:#8a7d70;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font:bold 13px Arial;color:#1c1814">${esc(v)}</td></tr>`,
    )
    .join('');
  const nota = d.mensaje
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f6f1ea;border-radius:8px;font:13px Arial;color:#5c5249;white-space:pre-wrap">${esc(d.mensaje)}</div>`
    : '';
  return `<div style="background:#f6f1ea;padding:22px 14px"><div style="max-width:520px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden"><div style="height:6px;background:#f4501e"></div><div style="padding:22px 24px"><p style="margin:0 0 2px;font:12px Arial;letter-spacing:1px;text-transform:uppercase;color:#8a7d70">Nuevo contacto</p><h1 style="margin:0 0 16px;font:bold 21px Arial;color:#1c1814">${esc(TITULO[d.tipo] || 'Contacto')}</h1><table cellpadding="0" cellspacing="0">${filas}</table>${nota}<p style="margin:18px 0 0;font:12px Arial;color:#a99e90">Responde a este correo o escribe directamente a ${esc(d.email || 'el interesado')}.</p></div></div></div>`;
}

function correoParaElCliente(d: Record<string, string>): string {
  const cuando =
    d.tipo === 'reserva_llamada' && d.fecha_iso
      ? `<p style="margin:0 0 16px;font:15px Arial;color:#1c1814">Te llamamos el <b>${esc(d.fecha_iso)}</b>${d.hora ? ` a las <b>${esc(d.hora)}</b>` : ''}.</p>`
      : '<p style="margin:0 0 16px;font:15px Arial;color:#1c1814">Te respondemos hoy mismo, en horario de mañana o tarde.</p>';
  const queHacemos =
    d.tipo === 'reserva_llamada'
      ? `<ul style="margin:0 0 18px;padding-left:18px;font:14px Arial;line-height:1.7;color:#5c5249"><li>Vemos tu salón y cómo trabajas hoy.</li><li>Te enseñamos Mecha con tus propios servicios y horarios.</li><li>Si te encaja, te lo dejamos montado y listo para dar citas.</li></ul><p style="margin:0 0 18px;font:13px Arial;color:#8a7d70">Son unos 10 minutos y no hay compromiso: si no te convence, no pasa nada.</p>`
      : '';
  return `<div style="background:#f6f1ea;padding:24px 14px"><div style="max-width:520px;margin:0 auto"><div style="text-align:center;padding:6px 0 18px;font:bold 24px Arial;color:#1c1814">Mecha</div><div style="background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden"><div style="height:6px;background:#f4501e"></div><div style="padding:26px"><h1 style="margin:0 0 12px;font:bold 22px Arial;color:#1c1814">Gracias${d.nombre ? `, ${esc(d.nombre.split(' ')[0])}` : ''}</h1>${cuando}${queHacemos}<p style="margin:0;font:13px Arial;color:#8a7d70">¿Necesitas cambiar algo? Responde a este correo y lo vemos.</p></div></div><div style="text-align:center;padding:16px 6px 0;font:12px Arial;color:#a99e90">Mecha · el sistema operativo de tu salón</div></div></div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ enviado: false, error: 'method_not_allowed' }, 405, req);

  const bruto = await req.text();
  if (bruto.length > 8000) return json({ enviado: false, error: 'payload_too_large' }, 400, req);
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(bruto);
  } catch (_e) {
    return json({ enviado: false, error: 'bad_json' }, 400, req);
  }

  const d: Record<string, string> = {
    tipo: recorta(p.tipo, 30) || 'mensaje',
    nombre: recorta(p.nombre, 80),
    email: recorta(p.email, 120),
    telefono: recorta(p.telefono, 25),
    salon: recorta(p.salon, 80),
    mensaje: recorta(p.mensaje, 2000),
    fecha_iso: recorta(p.fecha_iso, 40),
    hora: recorta(p.hora, 10),
    herramienta: recorta(p.herramienta, 40),
    num_profesionales: recorta(p.num_profesionales, 20),
    plan: recorta(p.plan, 20),
  };
  if (!d.email && !d.telefono) return json({ enviado: false, error: 'faltan_datos' }, 400, req);

  // 6 contactos por hora desde la misma IP y 3 por hora al mismo buzon. Un
  // interesado de verdad no manda mas; un abusador se queda aqui.
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();
  const okIp = await dentroDelLimite('solicitud_ip', ip, 6, 60);
  const okEmail = d.email ? await dentroDelLimite('solicitud_email', d.email.toLowerCase(), 3, 60) : true;
  if (!okIp || !okEmail) {
    return json({ enviado: false, error: 'demasiados_intentos' }, 429, req);
  }

  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || 465);
  const user = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER') || '';
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS') || '';
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || user;
  const nuestro = Deno.env.get('MECHA_CONTACTO_EMAIL') || 'contacto@mechaa.es';
  if (!user || !pass) return json({ enviado: false, error: 'smtp_not_configured' }, 500, req);

  const cliente = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });

  // El aviso a Mecha es el que NO puede fallar: si el correo al interesado
  // peta (dominio raro, buzon lleno), el lead tiene que llegarnos igual.
  let avisoInterno = false;
  let confirmacion = false;
  try {
    await cliente.send({
      from: `Mecha <${from}>`,
      to: nuestro,
      replyTo: d.email || undefined,
      subject: `[Mecha] ${TITULO[d.tipo] || 'Contacto'}: ${d.salon || d.nombre || d.email}`,
      html: correoParaNosotros(d),
    });
    avisoInterno = true;
  } catch (e) {
    console.error('aviso_interno_fallo', String(e));
  }

  if (d.email) {
    try {
      await cliente.send({
        from: `Mecha <${from}>`,
        to: d.email,
        subject: d.tipo === 'reserva_llamada' ? 'Tu llamada con Mecha está agendada' : 'Hemos recibido tu mensaje',
        html: correoParaElCliente(d),
      });
      confirmacion = true;
    } catch (e) {
      console.error('confirmacion_fallo', String(e));
    }
  }

  try {
    await cliente.close();
  } catch (_e) { /* cerrar no debe cambiar el resultado */ }

  return json({ enviado: avisoInterno, confirmacion }, avisoInterno ? 200 : 500, req);
});
