import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { token, success_url, cancel_url } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'token requerido' }, 400);

    // El enlace publico ya no lleva cita_id crudo: se resuelve un token opaco.
    const { data: citaId, error: eTok } = await supabase.rpc('resolver_enlace_pago', { p_token: token });
    if (eTok) throw eTok;
    if (!citaId) return json({ error: 'enlace_invalido' }, 404);

    const { data: pagoRaw, error: e1 } = await supabase.rpc('requerir_senal_cita', { p_cita_id: citaId });
    if (e1) throw e1;
    const pago = Array.isArray(pagoRaw) ? pagoRaw[0] : pagoRaw;
    if (!pago || !pago.importe_cents || pago.importe_cents <= 0) {
      return json({ error: 'Esta cita no requiere senal' }, 400);
    }
    if (pago.estado === 'pagado' || pago.estado === 'retenido') return json({ ya_pagado: true });

    // Modo de fianza del negocio: 'cobro' (default) cobra la senal por adelantado; 'hold' la
    // RETIENE (autorizacion con captura manual) para capturarla solo si hay no-show. El importe
    // ya viene modulado por perfil de riesgo desde requerir_senal_cita.
    const { data: cfg } = await supabase
      .from('negocio_config').select('config').eq('negocio_id', pago.negocio_id).maybeSingle();
    const esHold = ((cfg?.config as Record<string, unknown> | null)?.depositoModoFianza ?? 'cobro') === 'hold';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: (pago.moneda ?? 'eur').toLowerCase(),
          product_data: { name: esHold ? 'Fianza de tu cita (retencion)' : 'Senal de tu cita' },
          unit_amount: pago.importe_cents,
        },
        quantity: 1,
      }],
      // En modo hold: autorizar sin cobrar (capture_method manual). El pago_id/cita_id viajan
      // tambien en el PaymentIntent para poder conciliar en amount_capturable_updated/canceled.
      ...(esHold
        ? { payment_intent_data: { capture_method: 'manual', metadata: { pago_id: pago.id, cita_id: citaId, fianza_modo: 'hold' } } }
        : {}),
      success_url: success_url ?? 'https://www.mechaa.es/app/pago/ok',
      cancel_url: cancel_url ?? 'https://www.mechaa.es/app/pago/cancelado',
      client_reference_id: pago.id,
      metadata: { pago_id: pago.id, cita_id: citaId, ...(esHold ? { fianza_modo: 'hold' } : {}) },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents, modo: esHold ? 'hold' : 'cobro' });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
