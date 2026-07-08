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

  const piOf = (v: unknown): string | null =>
    typeof v === 'string' ? v : ((v as { id?: string })?.id ?? null);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const pagoId = (session.metadata?.pago_id as string) ?? (session.client_reference_id ?? '');
    const pi = piOf(session.payment_intent);
    if (pagoId) {
      if (session.metadata?.fianza_modo === 'hold') {
        // Fianza en modo hold: el cliente autorizo pero NO se cobra. Marcar el pago 'retenido',
        // guardar el payment_intent y confirmar la cita (la retencion cubre el riesgo).
        await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi });
      } else {
        // Guardar el payment_intent en metadata (necesario para reembolsar despues).
        const { data: pago } = await supabase.from('pagos').select('cita_id, tipo, metadata').eq('id', pagoId).single();
        const mergedMeta = { ...((pago?.metadata as Record<string, unknown>) ?? {}), ...(pi ? { payment_intent: pi } : {}) };
        await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'tarjeta', metadata: mergedMeta }).eq('id', pagoId);
        if (pago?.tipo === 'total') {
          // Pago del total (cobro en local / enlace): conciliar en el libro de cobros.
          const metodo = (pago.metadata?.metodo as string) ?? 'online';
          await supabase.rpc('registrar_cobro_online', { p_pago_id: pagoId, p_metodo: metodo });
        } else if (pago?.cita_id) {
          // Senal anti no-show: confirmar la cita.
          await supabase.from('citas').update({ deposito_pagado: true, estado: 'confirmada' }).eq('id', pago.cita_id);
        }
      }
    }
  } else if (event.type === 'payment_intent.amount_capturable_updated') {
    // El hold quedo autorizado y capturable. Refuerza el estado 'retenido' (idempotente).
    const pi = event.data.object as Stripe.PaymentIntent;
    const pagoId = pi.metadata?.pago_id as string | undefined;
    if (pagoId) await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi.id });
  } else if (event.type === 'payment_intent.canceled') {
    // Hold liberado (por nosotros, desde el panel de Stripe, o caducado ~7d): marcar 'liberado'.
    const pi = event.data.object as Stripe.PaymentIntent;
    const pagoId = pi.metadata?.pago_id as string | undefined;
    if (pagoId) {
      await supabase.rpc('registrar_liberacion_hold', { p_pago_id: pagoId });
    } else {
      const { data: pago } = await supabase.from('pagos')
        .select('id').eq('metadata->>payment_intent', pi.id).eq('estado', 'retenido').maybeSingle();
      if (pago?.id) await supabase.rpc('registrar_liberacion_hold', { p_pago_id: pago.id });
    }
  } else if (event.type === 'charge.refunded') {
    // Reembolso (desde Mecha o desde el panel de Stripe): conciliar en pagos/cobros/cita.
    const charge = event.data.object as Stripe.Charge;
    const pi = piOf(charge.payment_intent);
    const refundId = charge.refunds?.data?.[0]?.id ?? charge.id;
    if (pi) {
      await supabase.rpc('registrar_reembolso', {
        p_payment_intent: pi, p_importe_cents: charge.amount_refunded, p_refund_id: refundId,
      });
    }
  } else if (event.type === 'checkout.session.expired') {
    // El cliente no pago a tiempo: dejar el pago pendiente como cancelado (no habia cobro).
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id) {
      await supabase.from('pagos').update({ estado: 'cancelado' })
        .eq('pasarela_ref', session.id).eq('estado', 'pendiente');
    }
  } else {
    // Evento no manejado: ya quedo registrado en stripe_webhook_eventos; responder 200.
    console.log('evento no manejado:', event.type);
  }
  return new Response('ok', { status: 200 });
});
