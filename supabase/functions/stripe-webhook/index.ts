import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? '', webhookSecret);
  } catch (e) {
    return new Response('Bad signature: ' + String((e as Error)?.message ?? e), { status: 400 });
  }

  // Replay protection: rechazar eventos antiguos (más de 5 minutos)
  const eventTimestamp = event.created;
  const now = Math.floor(Date.now() / 1000);
  if (now - eventTimestamp > 300) {
    return new Response('Stale event - replay detected', { status: 400 });
  }

  // Idempotencia: exactly-once aunque Stripe reentregue el mismo evento (at-least-once).
  const { error: dupErr } = await supabase
    .from('stripe_webhook_eventos')
    .insert({ event_id: event.id, tipo: event.type });
  if (dupErr) return new Response('ok (dup)', { status: 200 });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const pagoId = (session.metadata?.pago_id as string) ?? (session.client_reference_id ?? '');
    if (pagoId) {
      await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'tarjeta' }).eq('id', pagoId);
      const { data: pago } = await supabase.from('pagos').select('cita_id').eq('id', pagoId).single();
      if (pago?.cita_id) {
        await supabase.from('citas').update({ deposito_pagado: true, estado: 'confirmada' }).eq('id', pago.cita_id);
      }
    }
  }
  return new Response('ok', { status: 200 });
});
