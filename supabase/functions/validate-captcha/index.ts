// Edge function: validate-captcha (Cloudflare Turnstile)
//
// Verifica el token de Turnstile CONTRA Cloudflare (server-side, con el secreto)
// y, si es valido, emite un token de UN SOLO USO en public.captcha_tokens que los
// RPCs publicos consumen (consumir_captcha_token). Asi la comprobacion deja de ser
// de navegador (saltable llamando al RPC directo) y exige prueba emitida por el
// servidor.
//
// POST { token: string, contexto?: 'cita'|'resena'|'solicitud' }
// -> 200 { ok: true, captcha_token: uuid } | { ok: false, error }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const ORIGENES = ['https://www.mechaa.es', 'https://mechaa.es', 'https://hairy-two.vercel.app', 'https://www.novanoidai.com'];
function esOrigenPermitido(o: string): boolean {
  if (ORIGENES.includes(o)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': esOrigenPermitido(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (b: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, req);
  if (!SECRET) return json({ ok: false, error: 'captcha_no_configurado' }, 500, req);

  let body: { token?: string; contexto?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400, req);
  }
  const token = (body.token || '').trim();
  if (!token) return json({ ok: false, error: 'token_missing' }, 400, req);
  const contexto = ['cita', 'resena', 'solicitud'].includes(body.contexto || '') ? body.contexto! : 'general';

  // Verificar con Cloudflare Turnstile.
  const form = new URLSearchParams();
  form.append('secret', SECRET);
  form.append('response', token);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) form.append('remoteip', ip);

  let data: { success?: boolean; 'error-codes'?: string[] };
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    data = await resp.json();
  } catch {
    return json({ ok: false, error: 'servicio_no_disponible' }, 502, req);
  }
  if (!data.success) {
    return json({ ok: false, error: 'captcha_invalido', codes: data['error-codes'] || [] }, 200, req);
  }

  // Emitir token de un solo uso (lo consume el RPC publico).
  const { data: row, error } = await admin
    .from('captcha_tokens')
    .insert({ contexto })
    .select('id')
    .single();
  if (error || !row) {
    console.error('captcha_tokens insert fallo:', error?.message);
    return json({ ok: false, error: 'token_no_emitido' }, 500, req);
  }
  return json({ ok: true, captcha_token: row.id }, 200, req);
});
