import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Libera un hold (fianza retenida). Auth staff (verify_jwt). S5: cuenta Stripe del negocio o plataforma.

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

    const { pago_id, cita_id } = await req.json().catch(() => ({}));
    if (!pago_id && !cita_id) return json({ error: 'pago_id o cita_id requerido' }, 400);

    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: info, error: eAuth } = await userClient.rpc('iniciar_liberacion_hold', {
      p_pago_id: pago_id ?? null, p_cita_id: cita_id ?? null,
    });
    if (eAuth) return json({ error: eAuth.message ?? 'no_liberable' }, 400);
    if (!info?.ok) return json({ error: 'no_liberable' }, 400);

    const { data: pg } = await service.from('pagos').select('negocio_id').eq('id', info.pago_id).maybeSingle();
    const stripe = await stripeParaNegocio((pg as { negocio_id?: string } | null)?.negocio_id ?? null);

    await stripe.paymentIntents.cancel(info.payment_intent as string);

    await service.rpc('registrar_liberacion_hold', { p_pago_id: info.pago_id });

    return json({ ok: true, pago_id: info.pago_id });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
