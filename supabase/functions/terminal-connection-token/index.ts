import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// S7.2 — Datafono virtual (Tap to Pay). Devuelve un ConnectionToken de Stripe Terminal para que la
// SDK del movil del estilista se conecte. Auth staff (verify_jwt): terminal_contexto() valida el
// perfil y da el negocio, y el token se emite con la cuenta Stripe de ESE salon (S5 mono-cuenta).

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

    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ctx } = await userClient.rpc('terminal_contexto');
    if (!ctx?.ok || !ctx?.negocio_id) return json({ error: ctx?.error ?? 'no_autorizado' }, 401);

    const stripe = await stripeParaNegocio(ctx.negocio_id as string);
    const token = await stripe.terminal.connectionTokens.create();
    return json({ secret: token.secret });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
