import forge from 'npm:node-forge@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Notificacion online de Redsys (BYOP S6). Cada salon apunta su DS_MERCHANT_MERCHANTURL a
// .../redsys-notificacion?negocio=<id>. Verificamos la firma con la clave del salon (Vault) y
// conciliamos igual que el webhook de Stripe. verify_jwt=false (Redsys no manda JWT).
//
// Robustez (endurecido 2026-07-12): Redsys reintenta la notificacion si NO recibe 200. Por eso:
//  - firma invalida / peticion malformada / sin clave configurada -> 4xx (error permanente, da igual reintentar).
//  - fallo transitorio de DB/Vault DESPUES de un pago aprobado -> 500 para que Redsys reintente.
//  - la conciliacion se hace ANTES de sellar el pago como 'pagado'; registrar_cobro_online es idempotente
//    (guarda por cita.cobrada + idempotency_key), asi que el reintento no duplica cobro ni pisa el estado de la cita.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Relleno de ceros (zeropadding) para 3DES, igual que crear-checkout-cobro (NUL).
const NUL = String.fromCharCode(0);

function deriveKey(order: string, secretKeyB64: string): Uint8Array {
  const keyBin = forge.util.decode64(secretKeyB64);
  const iv = forge.util.createBuffer(NUL.repeat(8));
  const cipher = forge.cipher.createCipher('3DES-CBC', keyBin);
  cipher.start({ iv });
  const pad = (8 - (order.length % 8)) % 8;
  const data = order + NUL.repeat(pad);
  cipher.update(forge.util.createBuffer(data, 'raw'));
  cipher.finish(() => true);
  return Uint8Array.from(cipher.output.getBytes(), (c: string) => c.charCodeAt(0));
}

async function hmacB64(b64Params: string, key: Uint8Array): Promise<string> {
  const ck = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(b64Params));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
const normSig = (s: string) => s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const toStd = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');

Deno.serve(async (req) => {
  const negocio = new URL(req.url).searchParams.get('negocio');
  const form = new URLSearchParams(await req.text().catch(() => ''));
  const b64Params = form.get('Ds_MerchantParameters') || '';
  const sigRecibida = form.get('Ds_Signature') || '';
  if (!b64Params || !sigRecibida || !negocio) return new Response('bad request', { status: 400 });

  // Verificacion de firma. La clave viene de Vault (RPC); un fallo del RPC puede ser transitorio -> 500.
  let paramsObj: Record<string, string>;
  let order: string;
  try {
    const { data: keyData, error: eKey } = await supabase.rpc('pasarela_redsys_secret', { p_negocio_id: negocio });
    if (eKey) return new Response('ERR clave ' + eKey.message, { status: 500 });
    const keyB64 = typeof keyData === 'string' ? keyData : '';
    if (!keyB64) return new Response('sin clave', { status: 400 });

    paramsObj = JSON.parse(atob(toStd(b64Params))) as Record<string, string>;
    order = paramsObj.Ds_Order;
    const key = deriveKey(order, keyB64);
    const calc = await hmacB64(b64Params, key);
    if (normSig(calc) !== normSig(sigRecibida)) return new Response('firma invalida', { status: 400 });
  } catch (e) {
    // Parseo/cripto de la peticion: error permanente (no reintentar).
    return new Response('bad params ' + String((e as Error)?.message ?? e), { status: 400 });
  }

  const resp = parseInt(paramsObj.Ds_Response ?? '9999', 10);
  const aprobado = resp >= 0 && resp <= 99;

  try {
    const { data: pago, error: ePago } = await supabase.from('pagos')
      .select('id, cita_id, tipo, estado, metadata').eq('pasarela_ref', order).maybeSingle();
    if (ePago) return new Response('ERR pago ' + ePago.message, { status: 500 });

    if (pago && aprobado && pago.estado !== 'pagado') {
      const esBizum = (paramsObj.Ds_PayMethod ?? '').toLowerCase() === 'z';
      // 1) Conciliar PRIMERO (idempotente). Si falla, 500: Redsys reintenta y el pago sigue 'pendiente'.
      if (pago.tipo === 'total') {
        const metodo = esBizum ? 'bizum' : ((pago.metadata as Record<string, unknown>)?.metodo as string ?? 'online');
        const { error: eCob } = await supabase.rpc('registrar_cobro_online', { p_pago_id: pago.id, p_metodo: metodo });
        if (eCob) return new Response('ERR conciliacion ' + eCob.message, { status: 500 });
      } else if (pago.cita_id) {
        const { error: eCita } = await supabase.from('citas')
          .update({ deposito_pagado: true, estado: 'confirmada' }).eq('id', pago.cita_id);
        if (eCita) return new Response('ERR cita ' + eCita.message, { status: 500 });
      }
      // 2) Sellar el pago como 'pagado' AL FINAL: marca el procesamiento como completo y evita
      //    que un duplicado tardio vuelva a tocar el estado de la cita.
      const { error: eUpd } = await supabase.from('pagos')
        .update({ estado: 'pagado', paid_at: new Date().toISOString(), metodo: esBizum ? 'bizum' : 'tarjeta' })
        .eq('id', pago.id);
      if (eUpd) return new Response('ERR sellado ' + eUpd.message, { status: 500 });
    }
    return new Response('OK', { status: 200 });
  } catch (e) {
    // Transitorio inesperado tras firma valida -> 500 para forzar reintento de Redsys.
    return new Response('ERR ' + String((e as Error)?.message ?? e), { status: 500 });
  }
});
