// P0-001 · Portal de cliente de Stripe para la suscripcion de Mecha.
//
// Cambiar de plan, cambiar la tarjeta, ver las facturas y darse de baja salen todos
// de aqui: son pantallas de Stripe, no nuestras. El portal EXIGE crear la sesion en
// servidor con la clave secreta, por eso hace falta esta funcion y no vale un enlace.
//
// CUENTA: la de PLATAFORMA (STRIPE_SECRET_KEY), igual que crear-checkout-suscripcion.
// La pasarela propia del salon no pinta nada aqui.

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://www.mechaa.es').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerAuth } = await caller.auth.getUser();
  const user = callerAuth?.user;
  if (!user) return json({ error: 'not_authenticated' }, 401);

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, role, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) return json({ error: 'profile_not_found' }, 404);
  // Solo el propietario: la suscripcion del salon vive en su fila y el equipo
  // hereda el plan de ahi (plan_del_negocio).
  if (perfil.role !== 'owner') return json({ error: 'not_authorized' }, 403);
  if (!perfil.stripe_customer_id) return json({ error: 'sin_suscripcion' }, 409);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: perfil.stripe_customer_id,
      locale: 'es',
      return_url: `${APP_URL}/app/configuracion`,
    });
    return json({ url: session.url });
  } catch (e) {
    // El fallo tipico es no haber activado el portal en el dashboard de Stripe.
    console.error('portal suscripcion fallo:', (e as Error)?.message ?? e);
    return json({ error: 'stripe_error' }, 502);
  }
});
