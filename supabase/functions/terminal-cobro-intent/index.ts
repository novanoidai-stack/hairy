import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// S7.2 — Datafono virtual (Tap to Pay). Crea el PaymentIntent card_present para cobrar el TOTAL de
// una cita por NFC. Auth staff (verify_jwt): iniciar_cobro_terminal() valida el negocio, crea/reusa
// el pago 'total' pendiente y lo marca pasarela='stripe_terminal'. La SDK del dispositivo confirma el
// PI (collect + process); al llegar a 'succeeded', el webhook lo registra como cobro por datafono.
// No hay checkout.session: la confirmacion es on-device.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const PLATFORM_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

async function stripeParaNegocio(negocioId: string | null): Promise<Stripe> {
  let key = PLATFORM_KEY;
  if (negocioId) {
    try {
      const { data } = await service.rpc('pasarela_stripe_secret', { p_negocio_id: negocioId });
      if (typeof data === 'string' && data.length > 10) key = data;
    } catch { /* fallback plataforma */ }
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'no_autorizado' }, 401);

    const { cita_id, propina_cents, descuento_cents } = await req.json().catch(() => ({}));
    if (!cita_id) return json({ error: 'cita_id requerido' }, 400);

    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: r, error } = await userClient.rpc('iniciar_cobro_terminal', {
      p_cita_id: cita_id,
      p_propina_cents: Number.isFinite(propina_cents) ? Math.max(0, Math.floor(propina_cents)) : 0,
      p_descuento_cents: Number.isFinite(descuento_cents) ? Math.max(0, Math.floor(descuento_cents)) : 0,
    });
    if (error) return json({ error: error.message ?? 'no_cobrable' }, 400);
    if (!r?.ok || !r?.pago_id) return json({ error: 'no_cobrable' }, 400);

    const stripe = await stripeParaNegocio((r.negocio_id as string) ?? null);
    const pi = await stripe.paymentIntents.create({
      amount: r.importe_cents as number,
      currency: String(r.moneda ?? 'EUR').toLowerCase(),
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: {
        pago_id: String(r.pago_id),
        cita_id: String(r.cita_id ?? ''),
        negocio_id: String(r.negocio_id ?? ''),
        tipo: 'total',
        canal: 'terminal',
      },
    });

    await service.from('pagos').update({ pasarela: 'stripe_terminal', pasarela_ref: pi.id }).eq('id', r.pago_id);

    return json({
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      pago_id: r.pago_id,
      importe_cents: r.importe_cents,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
