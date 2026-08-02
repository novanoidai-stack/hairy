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
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];

// Cualquier puerto de localhost vale para desarrollo (el espejo local se sirve
// en 8080, 8910 o el PORT que toque; fijar una lista rompia el alta en local).
function esOrigenPermitido(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = esOrigenPermitido(origin) ? origin : ALLOWED_ORIGINS[0];
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

// Proteccion contra contrasenas filtradas, hecha por nuestra cuenta.
// Supabase Auth trae esta comprobacion (HaveIBeenPwned) SOLO en plan de pago, asi
// que la hacemos aqui: es el mismo servicio y es gratis.
//
// K-ANONIMATO: la contrasena NUNCA sale de este servidor. Se calcula su SHA-1 y
// se envian a la API solo los 5 PRIMEROS caracteres del hash; ellos devuelven
// todos los hashes que empiezan igual (cientos) y comparamos aqui. El servicio
// no puede saber cual era. La cabecera Add-Padding rellena la respuesta con
// resultados falsos para que ni el tamano de la respuesta filtre informacion.
async function contrasenaFiltrada(password: string): Promise<boolean> {
  try {
    const datos = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-1', datos);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const prefijo = hex.slice(0, 5);
    const sufijo = hex.slice(5);

    const ctl = new AbortController();
    const tiempo = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
      headers: { 'Add-Padding': 'true' },
      signal: ctl.signal,
    });
    clearTimeout(tiempo);
    if (!res.ok) return false; // el servicio falla -> no bloqueamos el alta

    const cuerpo = await res.text();
    for (const linea of cuerpo.split('\n')) {
      const [suf, veces] = linea.trim().split(':');
      // El padding viene con contador 0: esas entradas son de relleno.
      if (suf === sufijo && Number(veces) > 0) return true;
    }
    return false;
  } catch (_e) {
    // Sin red o timeout: preferimos dejar crear la cuenta a dejar fuera a un
    // cliente real por un fallo nuestro (fail-open deliberado).
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  // Tope de payload antes de parsear (anti-abuso)
  const raw = await req.text();
  if (raw.length > 10_000) return json({ error: 'bad_json' }, 400, req);
  let payload: Record<string, string> = {};
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    return json({ error: 'bad_json' }, 400, req);
  }

  const email = (payload.email || '').trim().toLowerCase();
  const password = payload.password || '';
  const nombre = (payload.nombre || '').trim();
  const salon = (payload.salon || '').trim();
  const telefono = (payload.telefono || '').trim();

  // Validacion whitelist: formato + longitudes maximas (el cliente no es autoridad)
  if (!email || !EMAIL_RE.test(email) || email.length > 120) return json({ error: 'invalid_email' }, 400, req);
  if (!password || password.length < 8 || password.length > 200) return json({ error: 'weak_password' }, 400, req);
  if (!nombre || !salon) return json({ error: 'missing_fields' }, 400, req);
  if (nombre.length > 80 || salon.length > 80 || telefono.length > 20) return json({ error: 'missing_fields' }, 400, req);

  // Contrasena aparecida en filtraciones publicas: se rechaza antes de crear
  // nada (sustituye a la opcion "Leaked password protection" de Supabase Pro).
  if (await contrasenaFiltrada(password)) {
    return json({ error: 'leaked_password' }, 400, req);
  }

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
    // No filtrar internals al cliente: el detalle queda en los logs del servidor
    console.error('createUser failed:', cErr.message);
    return json({ error: 'create_failed' }, 400, req);
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
