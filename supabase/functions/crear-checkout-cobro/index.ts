import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Edge de cobro del TOTAL de una cita (pago despues / QR / enlace). S5: usa la cuenta Stripe del
// negocio (clave en Vault) con fallback a plataforma. Propina (S4) como linea separada.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const PLATFORM_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

async function stripeParaNegocio(negocioId: string | null): Promise<Stripe> {
  let key = PLATFORM_KEY;
  if (negocioId) {
    try {
      const { data } = await supabase.rpc('pasarela_stripe_secret', { p_negocio_id: negocioId });
      if (typeof data === 'string' && data.length > 10) key = data;
    } catch { /* fallback plataforma */ }
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { token, success_url, cancel_url, propina_cents } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'token requerido' }, 400);

    const { data: resolved, error: eTok } = await supabase.rpc('resolver_enlace_pago_full', { p_token: token });
    if (eTok) throw eTok;
    const row = Array.isArray(resolved) ? resolved[0] : resolved;
    if (!row || !row.cita_id) return json({ error: 'enlace_invalido' }, 404);
    if (row.tipo !== 'total') return json({ error: 'tipo_no_soportado' }, 400);
    const citaId = row.cita_id as string;

    const tip = Number.isFinite(propina_cents)
      ? Math.max(0, Math.min(Math.floor(propina_cents as number), 100000))
      : undefined;

    let pago: { id: string; importe_cents: number; moneda?: string; estado?: string; negocio_id?: string; metadata?: Record<string, unknown> } | null = null;
    if (tip !== undefined) {
      const { data: creado, error: eReq } = await supabase.rpc('requerir_pago_total_cita', {
        p_cita_id: citaId, p_propina_cents: tip,
      });
      if (eReq) throw eReq;
      pago = Array.isArray(creado) ? creado[0] : creado;
    } else {
      const { data: existente } = await supabase
        .from('pagos')
        .select('id, importe_cents, moneda, estado, negocio_id, metadata')
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

    const stripe = await stripeParaNegocio(pago.negocio_id ?? null);

    const currency = (pago.moneda ?? 'eur').toLowerCase();
    const propCents = Math.max(0, Number((pago.metadata as Record<string, unknown> | undefined)?.propina_cents ?? 0) || 0);
    const baseCents = Math.max(0, pago.importe_cents - propCents);

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
      metadata: { pago_id: pago.id, cita_id: citaId, tipo: 'total', negocio_id: pago.negocio_id ?? '' },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents, propina_cents: propCents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
