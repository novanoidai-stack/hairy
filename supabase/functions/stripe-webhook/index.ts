import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// S5 (mono-cuenta): cada salon apunta su webhook Stripe a .../stripe-webhook?negocio=<negocio_id>.
// La firma se verifica con el signing secret de ESE salon (Vault); sin ?negocio se usa el de
// plataforma. El resto (dedup + conciliacion) es identico. La verificacion de firma no usa la API
// key, solo el signing secret, asi que la instancia stripe puede seguir con la clave de plataforma.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const PLATFORM_WHSEC = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  // Signing secret del salon segun ?negocio, o el de plataforma.
  const negocio = new URL(req.url).searchParams.get('negocio');
  let whSecret = PLATFORM_WHSEC;
  if (negocio) {
    try {
      const { data } = await supabase.rpc('pasarela_stripe_webhook_secret', { p_negocio_id: negocio });
      if (typeof data === 'string' && data.length > 5) whSecret = data;
    } catch { /* fallback plataforma */ }
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? '', whSecret);
  } catch (e) {
    return new Response('Bad signature: ' + String((e as Error)?.message ?? e), { status: 400 });
  }

  const eventTimestamp = event.created;
  const now = Math.floor(Date.now() / 1000);
  if (now - eventTimestamp > 300) {
    return new Response('Stale event - replay detected', { status: 400 });
  }

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
        await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi });
      } else {
        const { data: pago } = await supabase.from('pagos').select('cita_id, tipo, metadata').eq('id', pagoId).single();
        const mergedMeta = { ...((pago?.metadata as Record<string, unknown>) ?? {}), ...(pi ? { payment_intent: pi } : {}) };
        await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'tarjeta', metadata: mergedMeta }).eq('id', pagoId);
        if (pago?.tipo === 'total') {
          const metodo = (pago.metadata?.metodo as string) ?? 'online';
          await supabase.rpc('registrar_cobro_online', { p_pago_id: pagoId, p_metodo: metodo });
        } else if (pago?.cita_id) {
          await supabase.from('citas').update({ deposito_pagado: true, estado: 'confirmada' }).eq('id', pago.cita_id);
        }
      }
    }
  } else if (event.type === 'payment_intent.amount_capturable_updated') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const pagoId = pi.metadata?.pago_id as string | undefined;
    if (pagoId) await supabase.rpc('registrar_hold_colocado', { p_pago_id: pagoId, p_payment_intent: pi.id });
  } else if (event.type === 'payment_intent.succeeded') {
    // S7.2 (Tap to Pay): el cobro por Terminal no pasa por checkout.session; se concilia aqui.
    // Solo actuamos sobre PaymentIntents de Terminal (canal='terminal') para no colisionar con los
    // de Checkout (ya conciliados en checkout.session.completed). Registrado como DATAFONO.
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.canal === 'terminal') {
      const pagoId = pi.metadata?.pago_id as string | undefined;
      if (pagoId) {
        const { data: pago } = await supabase.from('pagos').select('estado, metadata').eq('id', pagoId).maybeSingle();
        if (pago && pago.estado !== 'pagado') {
          const merged = { ...((pago.metadata as Record<string, unknown>) ?? {}), payment_intent: pi.id };
          await supabase.from('pagos').update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: 'datafono', metadata: merged }).eq('id', pagoId);
          await supabase.rpc('registrar_cobro_online', { p_pago_id: pagoId, p_metodo: 'datafono' });
        }
      }
    }
  } else if (event.type === 'payment_intent.canceled') {
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
    const charge = event.data.object as Stripe.Charge;
    const pi = piOf(charge.payment_intent);
    const refundId = charge.refunds?.data?.[0]?.id ?? charge.id;
    if (pi) {
      await supabase.rpc('registrar_reembolso', {
        p_payment_intent: pi, p_importe_cents: charge.amount_refunded, p_refund_id: refundId,
      });
    }
  } else if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.id) {
      await supabase.from('pagos').update({ estado: 'cancelado' })
        .eq('pasarela_ref', session.id).eq('estado', 'pendiente');
    }
  } else {
    console.log('evento no manejado:', event.type);
  }
  return new Response('ok', { status: 200 });
});
