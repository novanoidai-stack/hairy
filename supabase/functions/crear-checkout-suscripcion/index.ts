// P0-001 · Alta de la suscripcion de Mecha (el salon empieza a pagar 39/59 €/mes).
//
// CUENTA: SIEMPRE la de PLATAFORMA (STRIPE_SECRET_KEY). Mecha es BYOP mono-cuenta y
// cada salon tiene su propia clave Stripe en Vault para cobrar a SUS clientas; esa
// clave no pinta nada aqui. NO usar stripeParaNegocio() en este archivo.
//
// TRIAL: el mes gratis es SIN TARJETA y no crea nada en Stripe. Vive en
// profiles.trial_ends_at. Esta funcion se llama cuando el salon convierte, ya sea
// durante la prueba o despues.

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

// Los price_... de prueba y los de produccion son distintos: cada entorno pone los suyos.
const PRECIOS: Record<string, string> = {
  esencial: Deno.env.get('STRIPE_PRICE_ESENCIAL') ?? '',
  estudio: Deno.env.get('STRIPE_PRICE_ESTUDIO') ?? '',
};
// Tasa de IVA 21% creada a mano en Stripe (decision: sin Stripe Tax, solo España).
const TAX_RATE_IVA = Deno.env.get('STRIPE_TAX_RATE_IVA') ?? '';
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://www.mechaa.es').replace(/\/$/, '');

// Estados en los que NO tiene sentido abrir otro checkout.
const YA_TIENE_ACCESO = new Set(['activa', 'pago_pendiente']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1) Quien llama: tiene que ser owner/admin de un negocio.
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
    .select('id, email, role, negocio_id, nombre_negocio, stripe_customer_id, suscripcion_estado')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) return json({ error: 'profile_not_found' }, 404);
  if (!['owner', 'admin'].includes(perfil.role)) return json({ error: 'not_authorized' }, 403);
  if (!perfil.negocio_id) return json({ error: 'no_negocio' }, 400);
  if (YA_TIENE_ACCESO.has(perfil.suscripcion_estado ?? '')) {
    // Cambiar de plan o de tarjeta se hace desde el portal de cliente, no aqui.
    return json({ error: 'ya_suscrito', estado: perfil.suscripcion_estado }, 409);
  }

  // 2) Plan pedido.
  let body: { plan?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const plan = String(body.plan ?? '').toLowerCase();
  const priceId = PRECIOS[plan];
  if (!priceId) {
    // Falta el secret o el plan no existe: mejor fallar claro que cobrar mal.
    console.error('plan sin precio configurado:', plan);
    return json({ error: 'plan_no_disponible', plan }, 400);
  }

  try {
    // 3) Customer de plataforma. Se reutiliza si ya existe para no duplicar clientes
    //    cuando alguien abandona el checkout y vuelve a intentarlo.
    let customerId = perfil.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: perfil.email ?? user.email ?? undefined,
        name: perfil.nombre_negocio ?? undefined,
        metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id },
      });
      customerId = customer.id;
      // Se guarda ya: si el salon abandona el checkout, el customer no se pierde.
      await admin.rpc('aplicar_suscripcion_stripe', {
        p_stripe_customer_id: customerId,
        p_profile_id: perfil.id,
      });
    }

    // 4) Checkout. El profile_id viaja tambien en subscription_data para que los
    //    eventos customer.subscription.* lo lleven encima y el webhook no dependa
    //    de haber guardado antes el customer.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      locale: 'es',
      line_items: [{
        price: priceId,
        quantity: 1,
        ...(TAX_RATE_IVA ? { tax_rates: [TAX_RATE_IVA] } : {}),
      }],
      subscription_data: {
        metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id, plan },
      },
      metadata: { profile_id: perfil.id, negocio_id: perfil.negocio_id, plan },
      client_reference_id: perfil.id,
      // La pantalla es (tabs)/configuracion, no "ajustes": mandar a una ruta que no
      // existe justo despues de pagar seria el peor 404 posible.
      success_url: `${APP_URL}/app/configuracion?suscripcion=ok`,
      cancel_url: `${APP_URL}/app/configuracion?suscripcion=cancelado`,
      // Datos fiscales del salon: hacen falta para la factura que emite Mecha.
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
    });

    if (!TAX_RATE_IVA) {
      console.error('STRIPE_TAX_RATE_IVA sin configurar: la suscripcion se cobrara SIN IVA');
    }

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('checkout suscripcion fallo:', (e as Error)?.message ?? e);
    return json({ error: 'stripe_error' }, 502);
  }
});
