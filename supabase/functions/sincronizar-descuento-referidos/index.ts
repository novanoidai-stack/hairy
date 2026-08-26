// Refleja en Stripe el descuento de referidos que el motor ya calcula en la BD.
//
// POR QUE EXISTE: `recompute_referral_discount` deja `profiles.descuento_pct` al
// dia desde el 23 de agosto, pero nadie lo cobraba: un salon con un 30 % ganado
// pagaba la cuota entera. Esto es la mitad que faltaba.
//
// POR QUE UN CRON (mecha_descuento_referidos, 3:40): tu descuento cambia cuando
// OTRO salon de tu red empieza o deja de pagar, no cuando tu haces nada. No hay
// gesto de usuario al que engancharse. Es idempotente: si la suscripcion ya
// tiene el porcentaje correcto no se manda nada a Stripe, asi que se puede
// repetir sin generar eventos ni prorrateos de mas.
//
// CUENTA: la de PLATAFORMA (STRIPE_SECRET_KEY). Esto es lo que Mecha cobra al
// salon, nunca lo que el salon cobra a sus clientas.
//
// LOS MESES GRATIS NO SE TOCAN AQUI: se canjean a mano con
// `staff_canjear_meses_referido`. Solo se ganan por encima del tope del 30 %.

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });

// Estados con una suscripcion viva a la que tiene sentido tocarle el descuento.
const VIVAS = ['activa', 'pago_pendiente'];

// Un cupon por porcentaje, reutilizado por todos los salones que tengan ese
// mismo descuento. El id es determinista (`mecha_ref_20`), asi que crear el
// cupon es idempotente sin necesidad de buscar por metadatos: se intenta leer y
// solo se crea si no estaba. Los cupones de Stripe son inmutables en su
// `percent_off`, por eso hay uno por valor en vez de uno que se edite.
async function cuponDe(pct: number): Promise<string> {
  const id = `mecha_ref_${pct}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    await stripe.coupons.create({
      id,
      percent_off: pct,
      duration: 'forever',
      name: `Referidos -${pct}%`,
      metadata: { mecha_ref: '1' },
    });
  }
  return id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // La plataforma valida la firma (verify_jwt on); aqui se exige ademas que el
  // rol del token sea service_role, que es lo que manda el cron.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let esServiceRole = false;
  try {
    const p = bearer.split('.');
    if (p.length === 3) {
      esServiceRole = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
    }
  } catch { /* token ilegible: se queda en false */ }
  if (!esServiceRole) return json({ error: 'unauthorized' }, 401);

  const { data: filas, error } = await admin
    .from('profiles')
    .select('id, stripe_subscription_id, descuento_pct, suscripcion_estado')
    .not('stripe_subscription_id', 'is', null)
    .in('suscripcion_estado', VIVAS);

  if (error) {
    console.error('no se pudieron leer los perfiles:', error.message);
    return json({ error: 'db_error' }, 500);
  }

  let revisados = 0, cambiados = 0, fallos = 0;
  const detalle: Array<Record<string, unknown>> = [];

  for (const f of filas ?? []) {
    revisados++;
    const objetivo = Math.round(Number(f.descuento_pct ?? 0));
    try {
      const sub = await stripe.subscriptions.retrieve(f.stripe_subscription_id as string);
      // Una suscripcion que ya no corre no se toca: el webhook la pondra en su
      // sitio y tocarla aqui solo generaria ruido.
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;

      const actual = Math.round(Number(sub.discount?.coupon?.percent_off ?? 0));
      if (actual === objetivo) continue;

      if (objetivo > 0) {
        await stripe.subscriptions.update(sub.id, { coupon: await cuponDe(objetivo) });
      } else {
        await stripe.subscriptions.deleteDiscount(sub.id);
      }

      // El interruptor de la BD: solo se marca DESPUES de que Stripe lo acepte,
      // para que no diga que hay descuento aplicado cuando no lo hay.
      await admin.rpc('marcar_descuento_referido_aplicado', {
        p_profile: f.id,
        p_aplicado: objetivo > 0,
      });

      cambiados++;
      detalle.push({ profile_id: f.id, de: actual, a: objetivo });
    } catch (e) {
      fallos++;
      console.error('descuento de referidos fallo para', f.id, ':', (e as Error)?.message ?? e);
    }
  }

  return json({ ok: true, revisados, cambiados, fallos, detalle });
});
