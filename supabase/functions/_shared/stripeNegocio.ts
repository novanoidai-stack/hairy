// S5 (mono-cuenta por salon): resuelve el cliente Stripe de un negocio. Usa la secret key del
// salon guardada CIFRADA en Vault (accesor pasarela_stripe_secret, service_role); si el negocio
// no la tiene configurada, hace fallback a la clave de plataforma. Igual para el webhook secret.
// Nota: los edges de Supabase se despliegan por separado, asi que este helper se INLINEA en cada
// edge (este fichero es la referencia canonica; mantener las copias en sync).
import Stripe from 'npm:stripe@16';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const PLATFORM_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

export async function stripeParaNegocio(supabase: SupabaseClient, negocioId: string | null): Promise<Stripe> {
  let key = PLATFORM_KEY;
  if (negocioId) {
    try {
      const { data } = await supabase.rpc('pasarela_stripe_secret', { p_negocio_id: negocioId });
      if (typeof data === 'string' && data.length > 10) key = data;
    } catch { /* fallback a plataforma */ }
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

export async function webhookSecretParaNegocio(supabase: SupabaseClient, negocioId: string | null): Promise<string> {
  const platform = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!negocioId) return platform;
  try {
    const { data } = await supabase.rpc('pasarela_stripe_webhook_secret', { p_negocio_id: negocioId });
    if (typeof data === 'string' && data.length > 5) return data;
  } catch { /* fallback */ }
  return platform;
}
