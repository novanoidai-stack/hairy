// Activar, cambiar o quitar el addon de IA ("Recepcionistas") de una suscripcion
// que ya existe.
//
// POR QUE NO LO HACE EL PORTAL DE STRIPE: el portal sabe cambiar de plan y de
// tarjeta, pero no gestiona bien una SEGUNDA linea opcional dentro de la misma
// suscripcion. Y la landing promete que el addon "se activa o desactiva cuando
// quieras": sin esta funcion esa promesa es falsa.
//
// CUENTA: la de PLATAFORMA (STRIPE_SECRET_KEY), como el resto de la suscripcion.
//
// NO ESCRIBE profiles.ia_nivel. Lo escribe el webhook cuando Stripe confirma el
// cambio (customer.subscription.updated). Una sola fuente de verdad: si esto
// fallara a medias, la BD no puede quedarse diciendo que hay IA contratada
// mientras Stripe no la cobra.

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { claveServicio } from '../shared/claveServicio.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const admin = createClient(SUPABASE_URL, claveServicio());

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });

const PRECIOS_IA: Record<string, string> = {
  whatsapp: Deno.env.get('STRIPE_PRICE_IA_WHATSAPP') ?? '',
  voz: Deno.env.get('STRIPE_PRICE_IA_VOZ') ?? '',
  completa: Deno.env.get('STRIPE_PRICE_IA_COMPLETA') ?? '',
};
const TAX_RATE_IVA = Deno.env.get('STRIPE_TAX_RATE_IVA') ?? '';

// Los tres price_ del addon, para reconocer cual de las lineas es la de IA.
const PRECIOS_IA_SET = new Set(Object.values(PRECIOS_IA).filter(Boolean));

// Estados con una suscripcion viva en Stripe a la que se le puede tocar una linea.
const CON_SUSCRIPCION = new Set(['activa', 'pago_pendiente', 'impagada', 'pausada']);

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
    .select('id, role, stripe_subscription_id, suscripcion_estado')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) return json({ error: 'profile_not_found' }, 404);
  // Solo el propietario, igual que contratar: la suscripcion vive en su fila.
  if (perfil.role !== 'owner') return json({ error: 'not_authorized' }, 403);
  if (!perfil.stripe_subscription_id || !CON_SUSCRIPCION.has(perfil.suscripcion_estado ?? '')) {
    // Todavia no paga (prueba sin tarjeta, caducada, cancelada): no hay suscripcion
    // que tocar. El addon se elige al contratar, en el checkout.
    return json({ error: 'sin_suscripcion', estado: perfil.suscripcion_estado }, 409);
  }

  let body: { ia_nivel?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const destino = String(body.ia_nivel ?? '').toLowerCase();
  if (destino !== 'ninguna' && !(destino in PRECIOS_IA)) {
    return json({ error: 'ia_nivel_no_valido', ia_nivel: destino }, 400);
  }
  const priceDestino = destino === 'ninguna' ? '' : PRECIOS_IA[destino];
  if (destino !== 'ninguna' && !priceDestino) {
    console.error('addon de IA sin precio configurado:', destino);
    return json({ error: 'addon_no_disponible', ia_nivel: destino }, 400);
  }

  try {
    const sub = await stripe.subscriptions.retrieve(perfil.stripe_subscription_id);
    const lineaIa = sub.items.data.find((it) => it.price?.id && PRECIOS_IA_SET.has(it.price.id));

    // Ya esta como se pide: no se manda nada a Stripe para no generar un
    // prorrateo de 0 € ni un evento que no cambia nada.
    if (destino === 'ninguna' && !lineaIa) return json({ ok: true, ia_nivel: 'ninguna', sin_cambios: true });
    if (lineaIa?.price?.id === priceDestino) return json({ ok: true, ia_nivel: destino, sin_cambios: true });

    let item: Stripe.SubscriptionUpdateParams.Item;
    if (destino === 'ninguna') {
      // Quitar el addon: se borra la linea, el software sigue igual.
      item = { id: lineaIa!.id, deleted: true };
    } else if (lineaIa) {
      // Cambiar de nivel: la misma linea pasa a otro precio.
      item = {
        id: lineaIa.id,
        price: priceDestino,
        quantity: 1,
        ...(TAX_RATE_IVA ? { tax_rates: [TAX_RATE_IVA] } : {}),
      };
    } else {
      // Activarlo por primera vez: linea nueva junto a la del software.
      item = {
        price: priceDestino,
        quantity: 1,
        ...(TAX_RATE_IVA ? { tax_rates: [TAX_RATE_IVA] } : {}),
      };
    }

    // El cambio a mitad de ciclo se ajusta en la siguiente factura en vez de
    // generar un cobro suelto hoy. Durante el mes de prueba Stripe no prorratea,
    // asi que activar la IA en la prueba tampoco adelanta ningun cargo.
    await stripe.subscriptions.update(perfil.stripe_subscription_id, {
      items: [item],
      proration_behavior: 'create_prorations',
      metadata: { ...(sub.metadata ?? {}), ia_nivel: destino },
    });

    // profiles.ia_nivel lo escribe el webhook al recibir customer.subscription.updated.
    return json({ ok: true, ia_nivel: destino });
  } catch (e) {
    console.error('cambiar addon de IA fallo:', (e as Error)?.message ?? e);
    return json({ error: 'stripe_error' }, 502);
  }
});
