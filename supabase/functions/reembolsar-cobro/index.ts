import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Reembolso de un cobro online (Stripe) desde Mecha. Auth de staff (verify_jwt).
// Autoriza con la RPC iniciar_reembolso_cobro (comprueba negocio del que llama + que el
// cobro es online y tiene payment_intent), hace el refund en Stripe, y persiste via
// registrar_reembolso (service_role). El webhook (charge.refunded) tambien concilia, asi
// que es idempotente. Reembolso total por defecto; importe_cents opcional para parcial.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'no_autorizado' }, 401);

    const { cobro_id, importe_cents } = await req.json().catch(() => ({}));
    if (!cobro_id) return json({ error: 'cobro_id requerido' }, 400);

    // Autorizacion + datos del pago con la sesion del staff (auth.uid()).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: info, error: eAuth } = await userClient.rpc('iniciar_reembolso_cobro', {
      p_cobro_id: cobro_id, p_importe_cents: importe_cents ?? null,
    });
    if (eAuth) return json({ error: eAuth.message ?? 'no_reembolsable' }, 400);
    if (!info?.ok) return json({ error: 'no_reembolsable' }, 400);

    // Refund en Stripe.
    const refund = await stripe.refunds.create({
      payment_intent: info.payment_intent as string,
      amount: info.importe_cents as number,
    });

    // Persistir (idempotente). El webhook charge.refunded tambien lo hara.
    await service.rpc('registrar_reembolso', {
      p_payment_intent: info.payment_intent,
      p_importe_cents: info.importe_cents,
      p_refund_id: refund.id,
    });

    return json({ ok: true, refund_id: refund.id, importe_cents: info.importe_cents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
