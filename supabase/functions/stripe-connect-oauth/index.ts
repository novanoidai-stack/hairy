import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { clavePublicable, claveServicio } from '../shared/claveServicio.ts';

// S5 (Connect Standard) — onboarding OAuth. Dos modos en una misma edge (verify_jwt=false porque
// Stripe redirige el callback sin JWT):
//  - ?action=start  (lo llama el front CON sesion): valida owner/admin, firma un `state` (CSRF +
//    negocio) y devuelve la URL de autorizacion de Stripe.
//  - callback ?code&state (redirige Stripe): valida el `state`, intercambia el code
//    (stripe.oauth.token) -> stripe_user_id (acct_...) y lo guarda (guardar_conexion_stripe).
// Nunca se guarda la secret key del salon.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const redirect = (loc: string) => new Response(null, { status: 302, headers: { Location: loc } });

const URL_SUPA = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = claveServicio();
const service = createClient(URL_SUPA, SERVICE_ROLE);
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const CLIENT_ID = Deno.env.get('STRIPE_CONNECT_CLIENT_ID') ?? '';
const APP_URL = 'https://www.mechaa.es';
const REDIRECT_URI = `${URL_SUPA}/functions/v1/stripe-connect-oauth`;

const enc = new TextEncoder();
const b64url = (s: string) => btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function firmar(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SERVICE_ROLE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(String.fromCharCode(...new Uint8Array(mac)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const oauthError = u.searchParams.get('error');

  // ── Callback de Stripe ──────────────────────────────────────────────
  if (code && state) {
    try {
      const [payload, sig] = state.split('.');
      if (!payload || !sig || (await firmar(payload)) !== sig) return redirect(`${APP_URL}/app/configuracion?stripe=error`);
      const data = JSON.parse(unb64url(payload)) as { negocio: string; exp: number };
      if (!data?.negocio || Date.now() > data.exp) return redirect(`${APP_URL}/app/configuracion?stripe=expirado`);

      const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
      const acct = token.stripe_user_id;
      if (!acct) return redirect(`${APP_URL}/app/configuracion?stripe=error`);
      await service.rpc('guardar_conexion_stripe', { p_negocio_id: data.negocio, p_account_id: acct });
      return redirect(`${APP_URL}/app/configuracion?stripe=conectado`);
    } catch {
      return redirect(`${APP_URL}/app/configuracion?stripe=error`);
    }
  }
  if (oauthError) return redirect(`${APP_URL}/app/configuracion?stripe=denegado`);

  // ── Start (lo llama el front con sesion; action por query o por body) ──
  let accion = u.searchParams.get('action') ?? '';
  if (!accion && req.method === 'POST') {
    try { const b = await req.json(); accion = String((b as { action?: string })?.action ?? ''); } catch { /* sin body */ }
  }
  if (accion === 'start') {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'no_autorizado' }, 401);
    if (!CLIENT_ID) return json({ error: 'connect_no_configurado' }, 500);

    const userClient = createClient(URL_SUPA, clavePublicable(), { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'no_autorizado' }, 401);
    const { data: prof } = await userClient.from('profiles').select('negocio_id, role').eq('id', uid).maybeSingle();
    const p = prof as { negocio_id?: string; role?: string } | null;
    if (!p?.negocio_id || !['owner', 'admin'].includes(p.role ?? '')) return json({ error: 'no_autorizado' }, 403);

    const payload = b64url(JSON.stringify({ negocio: p.negocio_id, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() }));
    const st = `${payload}.${await firmar(payload)}`;
    const authorizeUrl = 'https://connect.stripe.com/oauth/authorize?' + new URLSearchParams({
      response_type: 'code', client_id: CLIENT_ID, scope: 'read_write', redirect_uri: REDIRECT_URI, state: st,
    }).toString();
    return json({ url: authorizeUrl });
  }

  return json({ error: 'bad_request' }, 400);
});
