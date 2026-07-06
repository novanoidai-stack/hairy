import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Edge de cobro del TOTAL de una cita (pago despues del servicio / QR de mostrador / enlace).
// Recibe un token opaco de cita_pago_enlaces de tipo 'total', resuelve la cita, toma el pago
// 'total' pendiente (o lo crea) y abre un Stripe Checkout con los metodos habilitados en el
// dashboard (tarjeta + Bizum + Apple/Google Pay). El webhook concilia en el libro de cobros.
// No toca el flujo de senal (crear-checkout-senal).

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

    // Resolver token -> cita + tipo. Solo aceptamos enlaces de tipo 'total' aqui.
    const { data: resolved, error: eTok } = await supabase.rpc('resolver_enlace_pago_full', { p_token: token });
    if (eTok) throw eTok;
    const row = Array.isArray(resolved) ? resolved[0] : resolved;
    if (!row || !row.cita_id) return json({ error: 'enlace_invalido' }, 404);
    if (row.tipo !== 'total') return json({ error: 'tipo_no_soportado' }, 400);
    const citaId = row.cita_id as string;

    // Tomar el pago 'total' pendiente; si no existe, crearlo con importe recalculado en servidor.
    let { data: pago } = await supabase
      .from('pagos')
      .select('id, importe_cents, moneda, estado, negocio_id')
      .eq('cita_id', citaId).eq('tipo', 'total').eq('estado', 'pendiente')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!pago) {
      const { data: creado, error: eReq } = await supabase.rpc('requerir_pago_total_cita', { p_cita_id: citaId });
      if (eReq) throw eReq;
      pago = Array.isArray(creado) ? creado[0] : creado;
    }
    if (!pago || !pago.importe_cents || pago.importe_cents <= 0) {
      return json({ error: 'nada_que_cobrar' }, 400);
    }
    if (pago.estado === 'pagado') return json({ ya_pagado: true });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Sin payment_method_types: Checkout usa automaticamente los metodos habilitados en el
      // dashboard (tarjeta + Bizum + Apple/Google Pay). OJO: automatic_payment_methods NO es
      // un parametro valido de Checkout Sessions (es de PaymentIntent) -> daba 500.
      line_items: [{
        price_data: {
          currency: (pago.moneda ?? 'eur').toLowerCase(),
          product_data: { name: 'Pago de tu cita' },
          unit_amount: pago.importe_cents,
        },
        quantity: 1,
      }],
      success_url: success_url ?? 'https://www.mechaa.es/app/pago/ok',
      cancel_url: cancel_url ?? 'https://www.mechaa.es/app',
      client_reference_id: pago.id,
      metadata: { pago_id: pago.id, cita_id: citaId, tipo: 'total' },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
