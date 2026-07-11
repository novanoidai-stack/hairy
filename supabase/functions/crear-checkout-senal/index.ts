import Stripe from 'npm:stripe@16';
import forge from 'npm:node-forge@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
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

// --- Redsys (S6): firma 3DES (node-forge, relleno de CEROS) + HMAC-SHA256 (Web Crypto). ---
const REDSYS_URLS = { test: 'https://sis-t.redsys.es:25443/sis/realizarPago', prod: 'https://sis.redsys.es/sis/realizarPago' };
const NUL = String.fromCharCode(0);
function redsysDeriveKey(order: string, keyB64: string): Uint8Array {
  const keyBin = forge.util.decode64(keyB64);
  const iv = forge.util.createBuffer(NUL.repeat(8));
  const cipher = forge.cipher.createCipher('3DES-CBC', keyBin);
  cipher.start({ iv });
  const data = order + NUL.repeat((8 - (order.length % 8)) % 8);
  cipher.update(forge.util.createBuffer(data, 'raw'));
  cipher.finish(() => true);
  return Uint8Array.from(cipher.output.getBytes(), (c: string) => c.charCodeAt(0));
}
async function redsysSign(params: Record<string, string>, keyB64: string) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(params))));
  const key = redsysDeriveKey(params.DS_MERCHANT_ORDER, keyB64);
  const ck = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(b64));
  return { Ds_SignatureVersion: 'HMAC_SHA256_V1', Ds_MerchantParameters: b64, Ds_Signature: btoa(String.fromCharCode(...new Uint8Array(mac))) };
}
async function redsysCheckout(pagoId: string, importeCents: number, negocioId: string, urlOk: string, urlKo: string, desc: string) {
  const { data: pas } = await supabase.from('negocio_pasarela')
    .select('redsys_fuc, redsys_terminal, redsys_test, proveedor').eq('negocio_id', negocioId).maybeSingle();
  const p = pas as { proveedor?: string; redsys_fuc?: string; redsys_terminal?: string; redsys_test?: boolean } | null;
  if (!p || p.proveedor !== 'redsys' || !p.redsys_fuc) return null;
  const { data: keyData } = await supabase.rpc('pasarela_redsys_secret', { p_negocio_id: negocioId });
  if (typeof keyData !== 'string' || keyData.length < 10) return null;
  const order = String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 900 + 100));
  await supabase.from('pagos').update({ pasarela: 'redsys', pasarela_ref: order }).eq('id', pagoId);
  const params: Record<string, string> = {
    DS_MERCHANT_MERCHANTCODE: p.redsys_fuc,
    DS_MERCHANT_TERMINAL: p.redsys_terminal || '1',
    DS_MERCHANT_TRANSACTIONTYPE: '0',
    DS_MERCHANT_ORDER: order,
    DS_MERCHANT_AMOUNT: String(importeCents),
    DS_MERCHANT_CURRENCY: '978',
    DS_MERCHANT_MERCHANTURL: `${SUPA_URL}/functions/v1/redsys-notificacion?negocio=${negocioId}`,
    DS_MERCHANT_URLOK: urlOk,
    DS_MERCHANT_URLKO: urlKo,
    DS_MERCHANT_PRODUCTDESCRIPTION: desc.slice(0, 125),
  };
  const body = await redsysSign(params, keyData);
  return { redsys: { url: p.redsys_test === false ? REDSYS_URLS.prod : REDSYS_URLS.test, params: body } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { token, success_url, cancel_url } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'token requerido' }, 400);

    const { data: citaId, error: eTok } = await supabase.rpc('resolver_enlace_pago', { p_token: token });
    if (eTok) throw eTok;
    if (!citaId) return json({ error: 'enlace_invalido' }, 404);

    const { data: pagoRaw, error: e1 } = await supabase.rpc('requerir_senal_cita', { p_cita_id: citaId });
    if (e1) throw e1;
    const pago = Array.isArray(pagoRaw) ? pagoRaw[0] : pagoRaw;
    if (!pago || !pago.importe_cents || pago.importe_cents <= 0) {
      return json({ error: 'Esta cita no requiere senal' }, 400);
    }
    if (pago.estado === 'pagado' || pago.estado === 'retenido') return json({ ya_pagado: true });

    const okUrl = success_url ?? 'https://www.mechaa.es/app/pago/ok';
    const koUrl = cancel_url ?? 'https://www.mechaa.es/app/pago/cancelado';

    // Redsys: si el salon usa esa pasarela, la senal se COBRA (Redsys no hace holds).
    const redsys = await redsysCheckout(pago.id, pago.importe_cents, pago.negocio_id, okUrl, koUrl, 'Senal de tu cita');
    if (redsys) return json(redsys);

    // Stripe
    const stripe = await stripeParaNegocio(pago.negocio_id);
    const { data: cfg } = await supabase
      .from('negocio_config').select('config').eq('negocio_id', pago.negocio_id).maybeSingle();
    const esHold = ((cfg?.config as Record<string, unknown> | null)?.depositoModoFianza ?? 'cobro') === 'hold';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: (pago.moneda ?? 'eur').toLowerCase(),
          product_data: { name: esHold ? 'Fianza de tu cita (retencion)' : 'Senal de tu cita' },
          unit_amount: pago.importe_cents,
        },
        quantity: 1,
      }],
      ...(esHold
        ? { payment_intent_data: { capture_method: 'manual', metadata: { pago_id: pago.id, cita_id: citaId, fianza_modo: 'hold' } } }
        : {}),
      success_url: okUrl,
      cancel_url: koUrl,
      client_reference_id: pago.id,
      metadata: { pago_id: pago.id, cita_id: citaId, negocio_id: pago.negocio_id, ...(esHold ? { fianza_modo: 'hold' } : {}) },
    });

    await supabase.from('pagos').update({ pasarela: 'stripe', pasarela_ref: session.id }).eq('id', pago.id);

    return json({ checkout_url: session.url, pago_id: pago.id, importe_cents: pago.importe_cents, modo: esHold ? 'hold' : 'cobro' });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
