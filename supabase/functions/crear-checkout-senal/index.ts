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
    const { cita_id, success_url, cancel_url } = await req.json().catch(() => ({}));
    if (!cita_id) return json({ error: 'cita_id requerido' }, 400);

    const { data: pagoRaw, error: e1 } = await supabase.rpc('requerir_senal_cita', { p_cita_id: cita_id });
    if (e1) throw e1;
    const pago = Array.isArray(pagoRaw) ? pagoRaw[0] : pagoRaw;
    if (!pago || !pago.importe_cents || pago.importe_cents <= 0) {
      return json({ error: 'Esta cita no requiere senal' }, 400);
    }
    if (pago.estado === 'pagado') return json({ ya_pagado: true });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: (pago.moneda ?? 'eur').toLowerCase(),
          product_data: { name: 'Senal de tu cita' },
          unit_amount: pago.importe_cents,
        },
        quantity: 1,
      }],
      success_url: success_url ?? 'https://mecha.app/app/pago/ok',
      cancel_url: cancel_url ?? 'https://mecha.app/app/pago/cancelado',
      client_reference_id: pago.id,
      metadata: { pago_id: pago.id, cita_id },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
