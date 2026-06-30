// Edge Function: signup-free
// Crea una cuenta gratis ya confirmada (sin email de confirmacion) usando la
// Admin API con la service_role (solo en el servidor, nunca en el cliente).
// Esto evita el rate limit del mailer ("you can only request this after Ns")
// y permite entrar directamente a la demo sin pasar por el correo.
//
// Cuerpo esperado (POST JSON): { email, password, nombre, salon, telefono }
// Respuestas: 200 { ok:true, user_id } | 4xx { error: codigo }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
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


// Todas las cuentas gratis comparten el MISMO negocio_id: la demo real.
// Asi cada visitante entra con su propia cuenta (medimos conversion) pero ve
// los mismos datos (clientes, profesionales, citas) en modo solo lectura.
// La escritura (INSERT/UPDATE/DELETE) la bloquea RLS para los visitantes de
// este negocio compartido; la cuenta demo@hairy.app queda exenta y conserva
// permisos de edicion para curar los datos de la demo.
const DEMO_NEGOCIO_ID = 'demo_salon_001';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const password = payload.password || '';
  const nombre = (payload.nombre || '').trim();
  const salon = (payload.salon || '').trim();
  const telefono = (payload.telefono || '').trim();

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400, req);
  if (!password || password.length < 8) return json({ error: 'weak_password' }, 400, req);
  if (!nombre || !salon) return json({ error: 'missing_fields' }, 400, req);

  // 1) Validar dominio de correo mediante DNS MX para evitar cuentas ficticias
  const domain = email.split('@')[1];
  try {
    const mx = await Deno.resolveDns(domain, "MX");
    if (!mx || mx.length === 0) {
      return json({ error: 'invalid_email_domain' }, 400, req);
    }
  } catch (_err) {
    return json({ error: 'invalid_email_domain' }, 400, req);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) Validar que el teléfono no esté duplicado en más de 2 cuentas
  if (telefono) {
    const { data: phoneMatch, error: phoneErr } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', telefono);
    
    if (!phoneErr && phoneMatch && phoneMatch.length >= 2) {
      return json({ error: 'phone_limit_reached' }, 400, req);
    }
  }

  // 1) Crear usuario YA confirmado (no se envia correo).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, salon, telefono },
  });

  if (cErr) {
    const m = (cErr.message || '').toLowerCase();
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return json({ error: 'email_exists' }, 409, req);
    }
    return json({ error: 'create_failed', detail: cErr.message }, 400, req);
  }

  const user = created.user;
  if (!user) return json({ error: 'create_failed' }, 500, req);

  // 2) Perfil owner / plan free (service_role salta RLS). Best-effort.
  const negocioId = DEMO_NEGOCIO_ID;
  const { error: pErr } = await admin.from('profiles').insert({
    id: user.id,
    email,
    nombre,
    nombre_negocio: salon,
    negocio_id: negocioId,
    phone: telefono,
    role: 'owner',
    plan: 'free',
  });
  if (pErr) console.error('profile insert failed:', pErr.message);

  // 3) Lead de signup (no bloquea el alta).
  const { error: sErr } = await admin.from('solicitudes').insert({
    tipo: 'signup',
    nombre,
    salon,
    email,
    telefono,
    estado: 'nueva',
  });
  if (sErr) console.error('solicitud insert failed:', sErr.message);

  return json({ ok: true, user_id: user.id, negocio_id: negocioId }, 200, req);
});
