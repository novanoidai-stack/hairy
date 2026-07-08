import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Edge de cobro del TOTAL de una cita (pago despues del servicio / QR de mostrador / enlace).
// Recibe un token opaco de cita_pago_enlaces de tipo 'total', resuelve la cita, toma el pago
// 'total' pendiente (o lo crea) y abre un Stripe Checkout con los metodos habilitados en el
// dashboard (tarjeta + Bizum + Apple/Google Pay). El webhook concilia en el libro de cobros.
// No toca el flujo de senal (crear-checkout-senal).
//
// Propina (S4): si el cliente elige propina, se envia propina_cents; el importe se RECALCULA en
// servidor via requerir_pago_total_cita (base del servicio - senal - descuento + propina), y se
// muestra como una linea "Propina" separada en el Checkout. registrar_cobro_online la concilia
// en cobros.propina_cents. Sin propina_cents se respeta el pago pendiente tal cual.

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
    const { token, success_url, cancel_url, propina_cents } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'token requerido' }, 400);

    // Resolver token -> cita + tipo. Solo aceptamos enlaces de tipo 'total' aqui.
    const { data: resolved, error: eTok } = await supabase.rpc('resolver_enlace_pago_full', { p_token: token });
    if (eTok) throw eTok;
    const row = Array.isArray(resolved) ? resolved[0] : resolved;
    if (!row || !row.cita_id) return json({ error: 'enlace_invalido' }, 404);
    if (row.tipo !== 'total') return json({ error: 'tipo_no_soportado' }, 400);
    const citaId = row.cita_id as string;

    // Propina del cliente (opcional). Si viene, recalculamos el pago con la propina (server-side,
    // la base la recomputa la RPC; nunca confiamos en un total del cliente). Cap defensivo 0..1000 EUR.
    const tip = Number.isFinite(propina_cents)
      ? Math.max(0, Math.min(Math.floor(propina_cents as number), 100000))
      : undefined;

    let pago: { id: string; importe_cents: number; moneda?: string; estado?: string; metadata?: Record<string, unknown> } | null = null;
    if (tip !== undefined) {
      const { data: creado, error: eReq } = await supabase.rpc('requerir_pago_total_cita', {
        p_cita_id: citaId, p_propina_cents: tip,
      });
      if (eReq) throw eReq;
      pago = Array.isArray(creado) ? creado[0] : creado;
    } else {
      const { data: existente } = await supabase
        .from('pagos')
        .select('id, importe_cents, moneda, estado, metadata')
        .eq('cita_id', citaId).eq('tipo', 'total').eq('estado', 'pendiente')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      pago = existente;
      if (!pago) {
        const { data: creado, error: eReq } = await supabase.rpc('requerir_pago_total_cita', { p_cita_id: citaId });
        if (eReq) throw eReq;
        pago = Array.isArray(creado) ? creado[0] : creado;
      }
    }
    if (!pago || !pago.importe_cents || pago.importe_cents <= 0) {
      return json({ error: 'nada_que_cobrar' }, 400);
    }
    if (pago.estado === 'pagado') return json({ ya_pagado: true });

    const currency = (pago.moneda ?? 'eur').toLowerCase();
    const propCents = Math.max(0, Number((pago.metadata as Record<string, unknown> | undefined)?.propina_cents ?? 0) || 0);
    const baseCents = Math.max(0, pago.importe_cents - propCents);

    // Lineas: pago del servicio + (si hay) propina como linea separada, para que el cliente
    // vea el desglose. La suma == pago.importe_cents.
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    if (baseCents > 0) {
      line_items.push({
        price_data: { currency, product_data: { name: 'Pago de tu cita' }, unit_amount: baseCents },
        quantity: 1,
      });
    }
    if (propCents > 0) {
      line_items.push({
        price_data: { currency, product_data: { name: 'Propina' }, unit_amount: propCents },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: success_url ?? 'https://www.mechaa.es/app/pago/ok',
      cancel_url: cancel_url ?? 'https://www.mechaa.es/app',
      client_reference_id: pago.id,
      metadata: { pago_id: pago.id, cita_id: citaId, tipo: 'total' },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents, propina_cents: propCents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
