// S5 (Connect Standard): resuelve el cliente Stripe de un negocio. Prioridad:
//  1. Connect  -> el salon conecto su cuenta por OAuth: cargamos EN su cuenta con la clave de
//     PLATAFORMA + {stripeAccount: acct_...} (nunca guardamos su secret key). pasarela_stripe_account.
//  2. BYO-key (legacy, en retirada) -> su secret key en Vault (pasarela_stripe_secret).
//  3. Plataforma -> fallback.
// Nota: los edges de Supabase se despliegan por separado, asi que este helper se INLINEA en cada
// edge (este fichero es la referencia canonica; mantener las copias en sync).
import Stripe from 'npm:stripe@16';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const PLATFORM_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const API_VERSION = '2024-06-20';

export async function stripeParaNegocio(supabase: SupabaseClient, negocioId: string | null): Promise<Stripe> {
  if (negocioId) {
    try {
      // 1) Connect: cargar en la cuenta conectada del salon.
      const { data: acct } = await supabase.rpc('pasarela_stripe_account', { p_negocio_id: negocioId });
      if (typeof acct === 'string' && acct.startsWith('acct_')) {
        return new Stripe(PLATFORM_KEY, { apiVersion: API_VERSION, stripeAccount: acct });
      }
      // 2) BYO-key (legacy): la clave secreta del salon en Vault.
      const { data: sk } = await supabase.rpc('pasarela_stripe_secret', { p_negocio_id: negocioId });
      if (typeof sk === 'string' && sk.length > 10) return new Stripe(sk, { apiVersion: API_VERSION });
    } catch { /* fallback a plataforma */ }
  }
  return new Stripe(PLATFORM_KEY, { apiVersion: API_VERSION });
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
