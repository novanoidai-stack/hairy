// Edge Function: avisar-fin-prueba (P0-006)
// Avisa al owner de que su mes gratis se acaba (dia ~7/21/28/30). Lo dispara el
// cron diario mecha_avisos_prueba con la service_role key como Bearer (la puerta).
// A quien/que etapa lo decide la RPC avisos_prueba_pendientes (idempotente); aqui
// solo se envia por SMTP (Hostinger) y se marca. Si el envio falla, no se marca.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { claveServicio } from '../shared/claveServicio.ts';

const SERVICE_ROLE = claveServicio();
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_ROLE);
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? 'smtp.hostinger.com';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USER;
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://www.mechaa.es').replace(/\/$/, '');

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

type Pendiente = {
  profile_id: string; email: string; nombre_negocio: string | null;
  etapa: number; etapas_marcar: number[]; dias_restantes: number;
};

const dias = (n: number) => (n <= 0 ? 'hoy' : n === 1 ? 'manana' : `en ${n} dias`);

function contenido(etapa: number, restantes: number, nombre: string | null) {
  const salon = (nombre && nombre.trim()) || 'tu salon';
  if (etapa === 1) return {
    subject: 'Que tal tu primera semana con Mecha?',
    titulo: 'Tu prueba gratuita sigue en marcha',
    cuerpo: `Llevas una semana probando Mecha en ${salon}. Tu mes gratis sigue activo, te quedan ${restantes} dias. Si te atascas con algo (agenda, fichas, cobros), responde a este correo y te echamos una mano.`,
  };
  if (etapa === 2) return {
    subject: `Te quedan ${restantes} dias de prueba en Mecha`,
    titulo: 'Tu prueba entra en la recta final',
    cuerpo: `Quedan ${restantes} dias de tu mes gratis en ${salon}. Si Mecha te esta sirviendo, activa tu suscripcion cuando quieras desde Configuracion y sigue sin cambios.`,
  };
  if (etapa === 3) return {
    subject: `Tu prueba de Mecha termina ${dias(restantes)}`,
    titulo: 'Tu prueba esta a punto de terminar',
    cuerpo: `Tu mes gratis en ${salon} termina ${dias(restantes)}. Para seguir usando Mecha sin interrupcion, activa tu suscripcion desde Configuracion.`,
  };
  return {
    subject: 'Tu prueba de Mecha termina hoy',
    titulo: 'Ultimo dia de tu prueba',
    cuerpo: `Hoy termina tu mes gratis en ${salon}. Activa tu suscripcion desde Configuracion para no perder acceso a tu agenda, tus fichas y tus cobros.`,
  };
}

function html(titulo: string, cuerpo: string, cta: string): string {
  return `<div style='max-width:520px;margin:0 auto;padding:28px 22px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1814;'>`
    + `<div style='font-size:20px;font-weight:800;color:#f4501e;'>Mecha</div>`
    + `<div style='background:#fffdfb;border:1px solid rgba(40,30,24,0.10);border-radius:14px;padding:24px;margin-top:16px;'>`
    + `<h1 style='font-size:18px;margin:0 0 10px;'>${titulo}</h1>`
    + `<p style='font-size:14px;line-height:1.6;color:#5c5249;margin:0 0 20px;'>${cuerpo}</p>`
    + `<a href='${cta}' style='display:inline-block;background:#f4501e;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:10px;'>Ir a Configuracion</a>`
    + `</div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // La plataforma ya valida la firma (verify_jwt on); aqui solo exigimos que el
  // rol del token sea service_role (el cron manda una service_role key). Asi no
  // dependemos de que coincida una representacion exacta de la clave.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let esServiceRole = false;
  try {
    const p = bearer.split('.');
    if (p.length === 3) esServiceRole = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch { esServiceRole = false; }
  if (!esServiceRole) return json({ error: 'unauthorized' }, 401);

  const { data, error } = await admin.rpc('avisos_prueba_pendientes');
  if (error) return json({ error: error.message }, 500);
  const lista = (data ?? []) as Pendiente[];
  if (lista.length === 0) return json({ ok: true, enviados: 0 });
  if (!SMTP_USER || !SMTP_PASS) return json({ error: 'smtp_no_configurado' }, 500);

  const cta = `${APP_URL}/app/configuracion`;
  const client = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } },
  });
  let enviados = 0;
  for (const r of lista) {
    const c = contenido(r.etapa, r.dias_restantes, r.nombre_negocio);
    try {
      await client.send({
        from: `Mecha <${SMTP_FROM}>`, to: r.email, subject: c.subject,
        content: `${c.titulo}. ${c.cuerpo} Entra en: ${cta}`, html: html(c.titulo, c.cuerpo, cta),
      });
      const filas = r.etapas_marcar.map((e) => ({ profile_id: r.profile_id, etapa: e }));
      await admin.from('avisos_prueba').upsert(filas, { onConflict: 'profile_id,etapa', ignoreDuplicates: true });
      enviados++;
    } catch (e) {
      console.error('aviso fin de prueba fallo', r.profile_id, (e as Error)?.message ?? e);
    }
  }
  try { await client.close(); } catch { /* ignore */ }
  return json({ ok: true, enviados });
});
