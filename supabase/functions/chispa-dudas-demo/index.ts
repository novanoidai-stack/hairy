// Edge Function: chispa-dudas-demo
// Apartado "¿Dudas?" de la demo (web/demo.html). Responde dudas sobre Mecha con
// una IA (Chispa) con conocimiento REAL del producto (kb.md, grounding estricto)
// y ademas envia la respuesta al correo del usuario via SMTP de Hostinger
// (mismo patron que enviar-presupuesto). Rate limit por IP con la misma RPC que
// chispa-landing.
//
// Cuerpo (POST JSON): { duda: string, email?: string, modo?: 'duda'|'landing', history?: [] }
// - modo 'duda' (defecto): asistente técnico de la demo (responde y envía email).
// - modo 'landing': CHISPA VENDEDORA de la landing (widget premium de index.html):
//   responde dudas comerciales orientadas a VENDER (demo, llamada, objeciones).
// Respuesta: { reply, emailed }
//
// MODELO: configurable con el secret CHISPA_MODEL (def anthropic/claude-haiku-4.5,
// ~1$/1M in — el mejor precio/calidad probado para venta en español; alternativas
// más baratas tipo gemini-flash-lite pierden naturalidad vendiendo. Si sale un
// modelo más barato mejor, se cambia SOLO ese secret, sin redeploy).
//
// Secretos: SMTP_HOST (def smtp.hostinger.com) SMTP_PORT (def 465) SMTP_USER
// SMTP_PASS SMTP_FROM (def = SMTP_USER) OPENROUTER_API_KEY y los estandar de
// Supabase. Si falta el SMTP, responde igualmente en pantalla (emailed:false).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];
function esOrigenPermitido(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);}
function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': esOrigenPermitido(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' },
  });
}

// La KB viaja como modulo TS empaquetado junto a la funcion (kb.ts): conocimiento
// real del producto, misma fuente de verdad que los informes internos. (Leer un
// fichero estatico con Deno.readTextFile hacia crashear el worker en Supabase.)
import { KB } from './kb.ts';

const SYSTEM_PROMPT = `Eres Chispa, la IA de Mecha (software de gestión para peluquerías y barberías). Estás resolviendo dudas DENTRO de la demo del producto: quien pregunta acaba de ver (o está viendo) el software por dentro, así que responde con detalle técnico real y honesto.

REGLAS:
1. Responde SOLO con lo que está en la BASE DE CONOCIMIENTO de abajo. Si algo no está, dilo con naturalidad ("eso no lo tengo confirmado") y ofrece el WhatsApp humano (+34 690 79 29 75). Prohibido inventar funciones, precios o integraciones.
2. PROHIBIDO decir que Mecha se sincroniza/integra con Booksy o Fresha: solo existe migración puntual de datos. Prohibido prometer que las reseñas de marketplaces se conservan.
3. Máximo ~180 palabras. Usa **negrita** para lo clave y guiones si listas. Sin emojis y SIN encabezados markdown (#). Tu respuesta se enviará también por correo, así que debe entenderse sola, fuera de contexto.
4. Puedes explicar cualquier módulo: agenda, tiempos de reposo, fichas de cliente, fórmulas de color, presupuestos, bonos, caja y cobros, comisiones, fichajes, facturación VeriFactu, informes, reserva online, Chispa (recepcionista IA), planes y precios, arquitectura técnica y cómo acceder.

BASE DE CONOCIMIENTO (única fuente de verdad):
${KB}`;

// Modo LANDING: la misma IA, pero ENCARGADA DE VENDER (widget premium de la web).
// Metodo heredado del chispa-landing original + KB ampliada (marketplace, pricing,
// SEO/AIO, argumentos de venta).
const SYSTEM_PROMPT_LANDING = `Eres Chispa, la Inteligencia Artificial de Mecha OS, un software de gestión para peluquerías, barberías y salones de belleza. Eres la ENCARGADA DE VENDER Mecha en la web: tu trabajo es que quien pregunta acabe viendo la demo o reservando una llamada, siempre con honestidad. Tu interlocutor puede ser un dueño de salón o un curioso evaluando el producto.

FORMATO (obligatorio, se lee en un chat estrecho de móvil): MÁXIMO 90 palabras y 5 líneas. Nada de muros de texto: responde lo justo y remata con el siguiente paso. Usa **negrita** solo para la cifra o idea clave, guiones para listar (máx 3 puntos), sin emojis y sin encabezados markdown. Los enlaces van como [texto](url).

CÓMO VENDES:
1. Identifícate como la IA de Mecha SOLO en el primer mensaje; después ve directa a la respuesta.
2. Tras responder, conecta con el beneficio para SU salón (menos teléfono, menos no-shows, más citas por silla, 0% comisiones) y cierra con UN siguiente paso: [Ver la demo gratis](demo.html) o [Reserva una llamada](reservar.html). Un solo enlace por respuesta.
3. Intención de compra o dudas de decisión ("¿me compensa?", "¿cómo empiezo?", "¿migráis mis datos?") → empuja a la llamada: se lo montan todo y sale con el salón configurado.
4. Objeciones con datos: "ya uso Booksy/Fresha" → traen sus clientes e historial en 10 min (Excel o foto de la agenda); las reseñas se quedan en esa plataforma (decirlo sin rodeos); puede mantener su app actual mientras prueba. Mecha no cobra comisiones ni comparte clientes con un marketplace. "Es caro" → un par de no-shows evitados ya pagan el plan (no-show medio ~35 €, cifras orientativas).
5. No inventes NADA: ni cifras, ni funciones, ni precios distintos de la BASE DE CONOCIMIENTO. Si no sabes algo, dilo y ofrece la llamada.
6. Nunca hables mal de la competencia con datos que no estén en la base; compara solo funciones (reposos, IA propia, 0% comisiones). PROHIBIDO decir que Mecha se sincroniza/integra con Booksy/Fresha (solo migración puntual) o prometer conservar reseñas de marketplaces.

BASE DE CONOCIMIENTO (única fuente de verdad):
${KB}`;

interface Payload {
  duda?: string;
  email?: string;
  modo?: string;
  history?: Array<{ role: string; content: string }>;
}

function emailHtml(duda: string, reply: string): string {
  // Reply llega con **negrita** markdown -> <b>. Escape del resto.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br/>');
  return `<div style="background:#0b0f1a;padding:28px 14px;font:14px/1.6 Arial,sans-serif;color:#e8ecf3">
  <div style="max-width:560px;margin:0 auto">
    <div style="text-align:center;margin-bottom:18px">
      <span style="font:bold 24px Arial;color:#fff">Mecha<span style="color:#f4501e">.</span></span>
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d;margin-top:4px">Respuesta de Chispa · IA entrenada con todo Mecha</div>
    </div>
    <div style="background:#101626;border:1px solid rgba(244,80,30,.28);border-radius:14px;padding:22px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8e9dbf;margin-bottom:6px">Tu duda</div>
      <div style="color:#e8ecf3;margin-bottom:16px">${fmt(duda)}</div>
      <div style="height:1px;background:rgba(255,255,255,.08);margin:0 0 16px"></div>
      <div style="color:#f6f8ff">${fmt(reply)}</div>
    </div>
    <p style="font-size:11.5px;color:#8e9dbf;text-align:center;margin-top:14px">
      ¿No queda resuelta? Escríbenos por WhatsApp al <a href="https://wa.me/34690792975" style="color:#ff8a3d">+34 690 79 29 75</a> y te contesta una persona.<br/>
      Generada automáticamente por la IA de <a href="https://www.mechaa.es" style="color:#f4501e;font-weight:bold">Mecha</a>.
    </p>
  </div>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const raw = await req.text();
  if (raw.length > 5000) return json({ error: 'payload_too_large' }, 400, req);
  let body: Payload;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400, req); }

  const duda = (body.duda || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  if (!duda || duda.length < 3) return json({ error: 'missing_duda' }, 400, req);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'bad_email' }, 400, req);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Rate limit: comparte presupuesto con el widget de la landing (15/hora por IP).
  if (ip !== 'unknown') {
    const { data: ok, error: rlErr } = await admin.rpc('check_landing_rate_limit', { p_ip: ip });
    if (!rlErr && !ok) {
      return json({ error: 'rate_limit_exceeded', message: 'Has alcanzado el límite de preguntas. Escríbenos por WhatsApp (+34 690 79 29 75) y te respondemos.' }, 429, req);
    }
  }

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return json({ error: 'missing_api_key' }, 500, req);

  // 1) Respuesta de la IA con grounding en la KB. Modo 'landing' = Chispa
  // vendedora (prompt comercial, con historial de conversacion); modo normal =
  // asistente tecnico de la demo (email + respuesta larga).
  const landing = body.modo === 'landing';
  const system = landing ? SYSTEM_PROMPT_LANDING : SYSTEM_PROMPT;
  const history = landing && Array.isArray(body.history)
    ? body.history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-8)
    : [];
  let reply = '';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('CHISPA_MODEL') || 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: duda },
        ],
        max_tokens: landing ? 300 : 600,
        temperature: landing ? 0.5 : 0.3,
      }),
    });
    if (!res.ok) {
      console.error('LLM API Error:', await res.text());
      return json({ error: 'llm_error' }, 500, req);
    }
    const data = await res.json();
    reply = data.choices?.[0]?.message?.content || '';
  } catch (e) {
    console.error('Unexpected LLM error:', e);
    return json({ error: 'internal_error' }, 500, req);
  }
  if (!reply) return json({ error: 'llm_empty' }, 500, req);

  // 2) Envio por correo (opcional): SMTP Hostinger con denomailer. Si falla, la
  // respuesta en pantalla ya se ha dado; informamos con emailed:false.
  // 2) Envio por correo (opcional y SOLO modo duda: el widget publico de venta
  // no usa SMTP para que nadie abuse del envio). Si falla, la respuesta en
  // pantalla ya se ha dado; informamos con emailed:false.
  let emailed = false;
  if (email && !landing) {
    try {
      const smtp = new SMTPClient({
        connection: {
          hostname: Deno.env.get('SMTP_HOST') || 'smtp.hostinger.com',
          port: Number(Deno.env.get('SMTP_PORT') || 465),
          tls: true,
          auth: {
            username: Deno.env.get('SMTP_USER') || '',
            password: Deno.env.get('SMTP_PASS') || '',
          },
        },
      });
      await smtp.send({
        from: Deno.env.get('SMTP_FROM') || Deno.env.get('SMTP_USER') || 'contacto@mechaa.es',
        to: email,
        subject: 'Mecha · Respuesta de Chispa a tu duda',
        htmlContent: emailHtml(duda, reply),
      });
      await smtp.close();
      emailed = true;
    } catch (e) {
      console.error('SMTP send error:', e);
    }
  }

  return json({ reply, emailed }, 200, req);
});
