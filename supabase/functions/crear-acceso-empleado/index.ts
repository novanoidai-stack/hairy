// Edge Function: crear-acceso-empleado
// Da de alta una cuenta de acceso para un miembro del salon (recepcion,
// profesional o direccion) dentro del negocio del que la solicita.
// Solo owner/admin (Propietario/Direccion) pueden llamarla. No crea Propietarios
// (RN-EQ-041). Usa la Admin API con la service_role (nunca en el cliente).
//
// Cuerpo (POST JSON): { email, nombre, rol }  rol in {admin, recepcion, employee}
// Respuesta 200: { ok:true, user_id, email, password }  (password temporal a
//   comunicar al empleado; entra y la cambia). 4xx/5xx: { error: codigo }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_PERMITIDOS = ['admin', 'recepcion', 'employee'];

// Contraseña temporal legible y con complejidad suficiente.
function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  let p = '';
  for (const n of arr) p += chars[n % chars.length];
  return `Mecha-${p}9`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: Record<string, string> = {};
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: 'bad_json' }, 400);
  }

  const email = (payload.email || '').trim().toLowerCase();
  const nombre = (payload.nombre || '').trim();
  const rol = (payload.rol || '').trim();

  if (!email || !EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!nombre) return json({ error: 'missing_nombre' }, 400);
  if (!ROLES_PERMITIDOS.includes(rol)) return json({ error: 'invalid_role' }, 400);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Identificar y autorizar al solicitante (debe ser owner/admin del negocio).
  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerAuth } = await caller.auth.getUser();
  const callerUser = callerAuth?.user;
  if (!callerUser) return json({ error: 'not_authenticated' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role, negocio_id')
    .eq('id', callerUser.id)
    .maybeSingle();

  if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
    return json({ error: 'not_authorized' }, 403);
  }
  if (!callerProfile.negocio_id) return json({ error: 'no_negocio' }, 400);

  // 2) Crear el usuario ya confirmado (sin email de confirmacion).
  const password = generarPassword();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (cErr) {
    const m = (cErr.message || '').toLowerCase();
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
      return json({ error: 'email_exists' }, 409);
    }
    return json({ error: 'create_failed', detail: cErr.message }, 400);
  }
  const user = created.user;
  if (!user) return json({ error: 'create_failed' }, 500);

  // 3) Fijar el profile en el negocio del solicitante con el rol indicado.
  //    El trigger handle_new_user ya creo una fila (owner/demo); la corregimos.
  const { error: pErr } = await admin.from('profiles').upsert({
    id: user.id,
    email,
    nombre,
    negocio_id: callerProfile.negocio_id,
    role: rol,
    plan: 'full',
  }, { onConflict: 'id' });

  if (pErr) {
    // Revertir el usuario para no dejar huerfanos sin profile correcto.
    await admin.auth.admin.deleteUser(user.id).catch(() => {});
    return json({ error: 'profile_failed', detail: pErr.message }, 500);
  }

  return json({ ok: true, user_id: user.id, email, password });
});
