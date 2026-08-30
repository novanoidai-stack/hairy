// Edge Function: crear-acceso-empleado
// Gestiona las cuentas de acceso del equipo de un salon: invitar, reenviar la
// invitacion y retirar el acceso. Solo owner/admin (Propietario/Direccion)
// pueden llamarla; retirar accesos es solo del Propietario (RN-EQ-041).
// Nunca crea Propietarios. Usa la Admin API con la service_role (jamas en el
// cliente) y envia correos branded por SMTP de Hostinger.
//
// Cuerpo (POST JSON):
//   { accion?: 'invitar', email, nombre, rol, profesional_id?, crear_ficha? }
//   { accion: 'reenviar', target_id }
//   { accion: 'revocar',  target_id }
// Sin `accion` se asume 'invitar' (compatibilidad con las llamadas antiguas).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { clavePublicable, claveServicio } from '../shared/claveServicio.ts';

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

// La pagina de destino: donde la persona ELIGE SU CONTRASENA. Antes se enviaba a
// acceso.html, que trata el enlace como un login normal y nunca pedia contrasena:
// se entraba una vez y ya no se podia volver a entrar nunca mas.
// Sin query string a proposito: la allowlist de "Redirect URLs" de Supabase Auth
// ya tiene /restablecer.html (lo usa el "olvide mi contrasena") y una URL con
// parametros podria no casar. La pagina distingue la invitacion por el `type`
// que Supabase deja en el hash.
function destino(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const base = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.mechaa.es';
  return `${base}/restablecer.html`;
}

function emailInvitacion(o: { nombre: string; link: string; salon: string; color: string; reenvio: boolean }): string {
  const titulo = o.reenvio ? `Vuelve a entrar en ${o.salon}` : `Únete al equipo de ${o.salon}`;
  const cuerpo = o.reenvio
    ? `Hola ${o.nombre}, aquí tienes un enlace nuevo para entrar en <strong>${o.salon}</strong> con Mecha. Pulsa el botón y elige tu contraseña.`
    : `Hola ${o.nombre}, te han invitado a trabajar con <strong>${o.salon}</strong> en Mecha. Pulsa el botón, elige tu contraseña y ya podrás entrar con tu correo siempre que quieras.`;
  return `<div style='background:#f6f1ea;padding:28px 14px'><div style='max-width:480px;margin:0 auto;background:#fffdfb;border:1px solid rgba(40,30,24,.1);border-radius:14px;overflow:hidden'><div style='height:6px;background:${o.color}'></div><div style='padding:28px'><p style='margin:0 0 10px;font:bold 20px Arial;color:#1c1814'>Mecha</p><h1 style='margin:0 0 12px;font:bold 21px Arial;color:#1c1814'>${titulo}</h1><p style='margin:0 0 22px;font:14px Arial;line-height:1.6;color:#5c5249'>${cuerpo}</p><a href='${o.link}' style='display:inline-block;padding:13px 28px;background:${o.color};color:#fff;font:bold 15px Arial;text-decoration:none;border-radius:11px'>Elegir mi contraseña y entrar</a><p style='margin:22px 0 6px;font:12px Arial;color:#8a7d70'>Si el botón no funciona, copia y pega este enlace en tu navegador:</p><p style='margin:0 0 18px;font:12px Arial;word-break:break-all'><a href='${o.link}' style='color:#c0260a'>${o.link}</a></p><p style='margin:0;font:12px Arial;color:#8a7d70'>El enlace caduca en 24 horas. Si caduca, pide a tu salón que te lo reenvíe.</p></div></div></div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_PERMITIDOS = ['admin', 'recepcion', 'employee'];
const COLORES_FICHA = ['#f4501e', '#c0260a', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

async function enviarCorreo(o: { to: string; subject: string; html: string }): Promise<string | null> {
  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const usr = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER');
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS');
  if (!usr || !pass) return 'smtp_not_configured';
  const from = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || `Mecha <${usr}>`;
  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: usr, password: pass } } });
  try {
    await client.send({ from, to: o.to, subject: o.subject, html: o.html });
    await client.close();
    return null;
  } catch (e) {
    console.error('smtp_error', String(e));
    try { await client.close(); } catch (_e) { /* noop */ }
    return String(e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: 'bad_json' }, 400, req);
  }

  const accion = String(payload.accion || 'invitar');

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = claveServicio();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Identificar y autorizar al solicitante (owner/admin de su negocio) ----
  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(SUPABASE_URL, clavePublicable(), {
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
  const negocioId = callerProfile.negocio_id as string;

  // El salon demo es un escaparate compartido: no se tocan sus cuentas.
  if (negocioId === 'demo_salon_001') return json({ error: 'demo_no_permitido' }, 403, req);

  // ¿Puede este salon tener otra cuenta de acceso, y con que plan nacería?
  // La regla vive ENTERA en la base de datos (evaluar_alta_de_acceso) para que
  // la pantalla de Accesos pueda preguntar exactamente lo mismo antes de
  // ense~ar el boton, en vez de que cada lado tenga su propia version.
  // Se pide siempre, aunque solo la use 'invitar': el resto de acciones tambien
  // necesitan el plan del titular y asi es una sola ida y vuelta.
  const { data: altaRaw } = await admin.rpc('evaluar_alta_de_acceso', { p_negocio_id: negocioId });
  const alta = (altaRaw ?? {}) as {
    ok?: boolean;
    motivo?: string | null;
    detalle?: string | null;
    plan?: string;
    ia_nivel?: string;
  };

  // Datos del salon para el correo.
  const { data: portal } = await admin
    .from('negocio_portal')
    .select('nombre_publico, color_acento')
    .eq('negocio_id', negocioId)
    .maybeSingle();
  const salon = portal?.nombre_publico || 'tu salón';
  const rawColor = portal?.color_acento || '';
  const color = /^#?[0-9a-f]{6}$/i.test(rawColor) ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '#f4501e';

  // -------------------------------------------------------------------------
  // REENVIAR: enlace nuevo para quien no llego a activar (o perdio la contrasena)
  // -------------------------------------------------------------------------
  if (accion === 'reenviar') {
    const targetId = String(payload.target_id || '');
    if (!targetId) return json({ error: 'missing_target' }, 400, req);

    const { data: target } = await admin
      .from('profiles')
      .select('id, email, nombre, negocio_id')
      .eq('id', targetId)
      .maybeSingle();
    if (!target) return json({ error: 'target_not_found' }, 404, req);
    if (target.negocio_id !== negocioId) return json({ error: 'cross_tenant' }, 403, req);

    // 'recovery' funciona tanto si nunca activo la cuenta como si olvido la
    // contrasena, y aterriza en la pantalla donde se elige contrasena.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: target.email,
      options: { redirectTo: destino(req) },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: 'link_failed', detail: linkErr?.message || '' }, 400, req);
    }

    const err = await enviarCorreo({
      to: target.email,
      subject: `Tu acceso a ${salon}`,
      html: emailInvitacion({ nombre: target.nombre || '', link: linkData.properties.action_link, salon, color, reenvio: true }),
    });
    if (err === 'smtp_not_configured') return json({ error: 'smtp_not_configured' }, 500, req);
    if (err) return json({ error: 'send_failed', detail: err }, 502, req);

    return json({ ok: true, reenviado: true, email: target.email }, 200, req);
  }

  // -------------------------------------------------------------------------
  // REVOCAR: retirar el acceso al software (la ficha del profesional se queda)
  // -------------------------------------------------------------------------
  if (accion === 'revocar') {
    if (callerProfile.role !== 'owner') return json({ error: 'solo_propietario' }, 403, req);
    const targetId = String(payload.target_id || '');
    if (!targetId) return json({ error: 'missing_target' }, 400, req);
    if (targetId === callerUser.id) return json({ error: 'no_puedes_revocarte' }, 400, req);

    const { data: target } = await admin
      .from('profiles')
      .select('id, email, role, negocio_id')
      .eq('id', targetId)
      .maybeSingle();
    if (!target) return json({ error: 'target_not_found' }, 404, req);
    if (target.negocio_id !== negocioId) return json({ error: 'cross_tenant' }, 403, req);
    if (target.role === 'owner') return json({ error: 'no_se_revoca_propietario' }, 400, req);

    // La ficha del profesional NO se borra: su historial de citas sigue siendo
    // del salon. Solo se suelta el vinculo con la cuenta.
    await admin.from('profesionales').update({ profile_id: null }).eq('profile_id', targetId);
    const { error: delProfileErr } = await admin.from('profiles').delete().eq('id', targetId);
    if (delProfileErr) return json({ error: 'delete_failed', detail: delProfileErr.message }, 500, req);
    const { error: delUserErr } = await admin.auth.admin.deleteUser(targetId);
    if (delUserErr) {
      // El perfil ya no existe: sin perfil no hay acceso a ningun dato del salon.
      console.error('auth_delete_failed', delUserErr.message);
    }

    return json({ ok: true, revocado: true, email: target.email }, 200, req);
  }

  // -------------------------------------------------------------------------
  // INVITAR (por defecto)
  // -------------------------------------------------------------------------
  if (accion !== 'invitar') return json({ error: 'accion_no_valida' }, 400, req);

  // La puerta. Antes aqui no se miraba ni el modo de acceso del salon, ni el
  // plan, ni si la prueba habia caducado, ni cuantas cuentas habia ya.
  //
  // Ojo con lo que NO se bloquea: 'reenviar' y sobre todo 'revocar' siguen
  // funcionando pase lo que pase. Retirar una cuenta suelta es justo como un
  // salon en modo compartido resuelve el conflicto, y dejarlo bloqueado seria
  // encerrarlo en el problema.
  if (alta.ok !== true) {
    const motivo = alta.motivo || 'alta_no_permitida';
    // 402 = "esto va de dinero" (plan o suscripcion); 409 = "tu configuracion
    // actual lo impide" (modo de acceso, tope de cuentas).
    const status = motivo === 'plan_sin_equipo' || motivo === 'suscripcion_inactiva' ? 402 : 409;
    return json({ error: motivo, detalle: alta.detalle ?? null }, status, req);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const nombre = String(payload.nombre || '').trim();
  const rol = String(payload.rol || '').trim();
  const profesionalId = payload.profesional_id ? String(payload.profesional_id) : '';
  const crearFicha = payload.crear_ficha === true;

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400, req);
  if (!nombre) return json({ error: 'missing_nombre' }, 400, req);
  if (!ROLES_PERMITIDOS.includes(rol)) return json({ error: 'invalid_role' }, 400, req);

  // Si se pide vincular una ficha, tiene que ser de este salon y estar libre.
  if (profesionalId) {
    const { data: ficha } = await admin
      .from('profesionales')
      .select('id, negocio_id, profile_id')
      .eq('id', profesionalId)
      .maybeSingle();
    if (!ficha || ficha.negocio_id !== negocioId) return json({ error: 'ficha_no_encontrada' }, 404, req);
    if (ficha.profile_id) return json({ error: 'ficha_ya_vinculada' }, 409, req);
  }

  // El plan (y desde el 7 ago 2026, el addon de IA) los contrata el SALON: el
  // equipo hereda los del TITULAR.
  //
  // Antes esto era una consulta con `.eq('role','owner')` escrita aqui, y el 30
  // ago 2026 habia CINCO salones sin ninguna fila con ese rol: la consulta no
  // fallaba, devolvia vacio, y el invitado nacia con plan 'free' -- entraba al
  // software y no veia nada. Ahora lo resuelve titular_del_negocio() dentro de
  // evaluar_alta_de_acceso(), que nunca devuelve vacio si el salon tiene cuentas.
  const planHeredado = alta.plan || 'free';
  const iaNivelHeredado = alta.ia_nivel || 'ninguna';

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: destino(req), data: { nombre } },
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

  const errCorreo = await enviarCorreo({
    to: email,
    subject: `Únete al equipo de ${salon}`,
    html: emailInvitacion({ nombre, link: actionLink, salon, color, reenvio: false }),
  });
  if (errCorreo) {
    // Sin correo enviado no hay invitacion: se deshace para poder reintentar.
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    if (errCorreo === 'smtp_not_configured') return json({ error: 'smtp_not_configured' }, 500, req);
    return json({ error: 'send_failed', detail: errCorreo }, 502, req);
  }

  const { error: pErr } = await admin.from('profiles').upsert({
    id: user.id,
    email,
    nombre,
    negocio_id: negocioId,
    role: rol,
    plan: planHeredado,
    ia_nivel: iaNivelHeredado,
  }, { onConflict: 'id' });

  if (pErr) {
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return json({ error: 'profile_failed', detail: pErr.message }, 500, req);
  }

  // Vinculo con la ficha del profesional: se hace AQUI, no al guardar el
  // formulario. Antes, si el propietario cerraba el modal sin guardar, quedaba
  // una cuenta suelta sin ficha y una ficha sin cuenta.
  // Si la ficha no se puede crear/vincular, la invitacion NO se cae (el correo
  // ya salio), pero hay que decirlo: si no, queda una cuenta que entra al
  // software y no tiene columna en la agenda, y nadie se entera hasta que
  // alguien intenta darle una cita.
  let fichaVinculada = profesionalId || '';
  let avisoFicha: string | null = null;
  if (profesionalId) {
    const { error: linkFichaErr } = await admin
      .from('profesionales')
      .update({ profile_id: user.id, email })
      .eq('id', profesionalId)
      .eq('negocio_id', negocioId);
    if (linkFichaErr) {
      console.error('link_ficha_failed', linkFichaErr.message);
      avisoFicha = 'ficha_no_vinculada';
    }
  } else if (crearFicha && rol === 'employee') {
    // Un profesional sin ficha no tiene columna en la agenda: no se le pueden
    // dar citas. Se crea junto con el acceso.
    const { count } = await admin
      .from('profesionales')
      .select('id', { count: 'exact', head: true })
      .eq('negocio_id', negocioId);
    const { data: nuevaFicha, error: fichaErr } = await admin
      .from('profesionales')
      .insert({
        negocio_id: negocioId,
        nombre,
        email,
        profile_id: user.id,
        color: COLORES_FICHA[(count ?? 0) % COLORES_FICHA.length],
      })
      .select('id')
      .maybeSingle();
    if (fichaErr) {
      console.error('crear_ficha_failed', fichaErr.message);
      // El tope de 15 fichas activas lo pone la base de datos: se distingue
      // para poder explicarlo, en vez de soltar un "no se pudo" generico.
      avisoFicha = fichaErr.message.includes('limite_profesionales')
        ? 'ficha_limite'
        : 'ficha_no_creada';
    } else if (nuevaFicha) fichaVinculada = nuevaFicha.id;
  }

  return json({
    ok: true,
    user_id: user.id,
    email,
    invited: true,
    plan: planHeredado,
    ia_nivel: iaNivelHeredado,
    profesional_id: fichaVinculada || null,
    aviso: avisoFicha,
  }, 200, req);
});
