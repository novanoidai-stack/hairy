import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Captura un hold (fianza retenida) — tipicamente por no-show. Auth de staff (verify_jwt).
// Autoriza con iniciar_captura_hold (valida el negocio del que llama + que es una senal
// 'retenido' con payment_intent), captura en Stripe y concilia via registrar_captura_hold
// (service_role, idempotente; el pago pasa a 'pagado'). Acepta pago_id o cita_id. Importe
// opcional para captura parcial (por defecto captura el importe retenido completo).

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

    const { pago_id, cita_id, importe_cents } = await req.json().catch(() => ({}));
    if (!pago_id && !cita_id) return json({ error: 'pago_id o cita_id requerido' }, 400);

    // Autorizacion + datos del hold con la sesion del staff (auth.uid()).
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: info, error: eAuth } = await userClient.rpc('iniciar_captura_hold', {
      p_pago_id: pago_id ?? null, p_cita_id: cita_id ?? null, p_importe_cents: importe_cents ?? null,
    });
    if (eAuth) return json({ error: eAuth.message ?? 'no_capturable' }, 400);
    if (!info?.ok) return json({ error: 'no_capturable' }, 400);

    // Capturar el hold en Stripe (importe_cents <= autorizado).
    await stripe.paymentIntents.capture(info.payment_intent as string, {
      amount_to_capture: info.importe_cents as number,
    });

    // Persistir (idempotente).
    await service.rpc('registrar_captura_hold', {
      p_pago_id: info.pago_id, p_importe_cents: info.importe_cents,
    });

    return json({ ok: true, pago_id: info.pago_id, importe_cents: info.importe_cents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
