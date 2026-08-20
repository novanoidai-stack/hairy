// Edge Function: chispa-dudas-demo
// Apartado "¿Dudas?" de la demo (web/demo.html, web/demo_v2.html) y widget web.
// Responde dudas sobre Mecha con una IA (Chispa) con conocimiento REAL del
// producto (kb.ts, grounding estricto) y ademas envia la respuesta al correo del
// usuario via SMTP de Hostinger (con soporte para teléfono / WhatsApp como lead).
// Rate limit por IP con RPC check_landing_rate_limit.
//
// Cuerpo (POST JSON): {
//   duda: string,
//   contacto?: string,
//   email?: string,
//   telefono?: string,
//   modo?: 'duda'|'landing',
//   history?: Array<{ role: string; content: string }>
// }
// - modo 'duda' (defecto): asistente técnico de la demo (responde y envía email si hay contacto).
// - modo 'landing': CHISPA VENDEDORA de la landing (widget premium de index.html):
//   responde dudas comerciales orientadas a VENDER (demo, llamada, objeciones).
//
// Respuesta: { reply, emailed, tipo_contacto?: 'email'|'telefono'|'ambos'|'none', email_error?: string|null }

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { KB } from './kb.ts';

const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];

export function esOrigenPermitido(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': esOrigenPermitido(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? cors(req) : {}), 'Content-Type': 'application/json' },
  });
}

export const SYSTEM_PROMPT = `Eres Chispa, la IA de Mecha (software de gestión para peluquerías y barberías). Estás resolviendo dudas DENTRO de la demo del producto: quien pregunta acaba de ver (o está viendo) el software por dentro, así que responde con detalle técnico real y honesto.

REGLAS:
1. Responde SOLO con lo que está en la BASE DE CONOCIMIENTO de abajo. Si algo no está, dilo con naturalidad ("eso no lo tengo confirmado") y ofrece el WhatsApp humano (+34 690 79 29 75). Prohibido inventar funciones, precios o integraciones.
2. PROHIBIDO decir que Mecha se sincroniza/integra con Booksy o Fresha: solo existe migración puntual de datos. Prohibido prometer que las reseñas de marketplaces se conservan.
3. Máximo ~180 palabras. Usa **negrita** para lo clave y guiones si listas. Sin emojis y SIN encabezados markdown (#). Tu respuesta se enviará también por correo, así que debe entenderse sola, fuera de contexto.
4. Puedes explicar cualquier módulo: agenda, tiempos de reposo, fichas de cliente, fórmulas de color, presupuestos, bonos, caja y cobros, comisiones, fichajes, facturación VeriFactu, informes, reserva online, Chispa (recepcionista IA), planes y precios, arquitectura técnica y cómo acceder.

BASE DE CONOCIMIENTO (única fuente de verdad):
${KB}`;

export const SYSTEM_PROMPT_LANDING = `Eres Chispa, la Inteligencia Artificial de Mecha OS, un software de gestión para peluquerías, barberías y salones de belleza. Eres la ENCARGADA DE VENDER Mecha en la web: tu trabajo es que quien pregunta acabe viendo la demo o reservando una llamada, siempre con honestidad. Tu interlocutor puede ser un dueño de salón o un curioso evaluando el producto.

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

export interface Payload {
  duda?: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  modo?: 'duda' | 'landing';
  history?: Array<{ role: string; content: string }>;
}

export interface ParsedContact {
  email: string | null;
  telefono: string | null;
  tipo: 'email' | 'telefono' | 'ambos' | 'none' | 'invalid';
  valido: boolean;
  error?: string;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^\+?[0-9]{9,15}$/;

export function parseContacto(rawContact?: string, rawEmail?: string, rawPhone?: string): ParsedContact {
  const c = (rawContact || '').trim();
  const e = (rawEmail || '').trim().toLowerCase();
  const t = (rawPhone || '').trim();

  let parsedEmail: string | null = e || null;
  let parsedPhone: string | null = t || null;

  if (c) {
    if (c.includes('@')) {
      if (!parsedEmail) parsedEmail = c.toLowerCase();
    } else {
      if (!parsedPhone) parsedPhone = c;
    }
  }

  let emailValid = false;
  let phoneValid = false;

  if (parsedEmail) {
    if (EMAIL_REGEX.test(parsedEmail)) {
      emailValid = true;
    } else {
      return {
        email: null,
        telefono: null,
        tipo: 'invalid',
        valido: false,
        error: 'El correo electrónico introducido no tiene un formato válido.',
      };
    }
  }

  if (parsedPhone) {
    const cleanPhone = parsedPhone.replace(/[\s\(\)\.-]/g, '');
    if (PHONE_REGEX.test(cleanPhone)) {
      phoneValid = true;
      parsedPhone = cleanPhone;
    } else {
      return {
        email: null,
        telefono: null,
        tipo: 'invalid',
        valido: false,
        error: 'El teléfono debe contener entre 9 y 15 dígitos (con o sin prefijo +).',
      };
    }
  }

  if (!emailValid && !phoneValid) {
    if (!c && !e && !t) {
      return { email: null, telefono: null, tipo: 'none', valido: true };
    }
    return {
      email: null,
      telefono: null,
      tipo: 'invalid',
      valido: false,
      error: 'El contacto proporcionado no es válido. Debe ser un email válido o un número de teléfono/WhatsApp de 9 a 15 dígitos.',
    };
  }

  let tipo: 'email' | 'telefono' | 'ambos' = 'none' as any;
  if (emailValid && phoneValid) tipo = 'ambos';
  else if (emailValid) tipo = 'email';
  else if (phoneValid) tipo = 'telefono';

  return {
    email: emailValid ? parsedEmail : null,
    telefono: phoneValid ? parsedPhone : null,
    tipo,
    valido: true,
  };
}

export function formatMarkdownHtml(text: string): string {
  if (!text) return '';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let t = esc(text);

  // Markdown headers (# Header -> bold title)
  t = t.replace(/^#{1,6}\s+([^\n]+)/gm, '<b style="color:#ff8a3d;font-size:15px;display:block;margin:10px 0 4px">$1</b>');

  // Markdown bold **text** -> <b style="color:#ffffff">text</b>
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b style="color:#ffffff">$1</b>');

  // Markdown links [text](url) -> <a href="..." target="_blank" rel="noopener">text</a>
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
    '<a href="$2" style="color:#f4501e;text-decoration:underline" target="_blank" rel="noopener">$1</a>'
  );

  // Markdown bullet points (- item or * item)
  t = t.replace(
    /(?:^|\n)[-*]\s+([^\n]+)/g,
    '<div style="margin:4px 0 4px 12px;line-height:1.5"><span style="color:#f4501e;font-weight:bold;margin-right:6px">&bull;</span>$1</div>'
  );

  // Multiple newlines -> clean spacing
  t = t.replace(/\n\n+/g, '<div style="height:10px"></div>');

  // Single newlines -> <br/>
  t = t.replace(/\n/g, '<br/>');

  return t;
}

export function emailHtml(duda: string, reply: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0f1a;padding:28px 14px;font-family:Arial,sans-serif;color:#e8ecf3">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
        <tr>
          <td align="center" style="padding-bottom:18px">
            <span style="font:bold 26px Arial,sans-serif;color:#ffffff;letter-spacing:-0.5px">Mecha<span style="color:#f4501e">.</span></span>
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d;margin-top:6px;font-weight:600">Respuesta de Chispa · IA de Mecha</div>
          </td>
        </tr>
        <tr>
          <td>
            <div style="background:#101626;border:1px solid rgba(244,80,30,0.32);border-radius:14px;padding:24px">
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8e9dbf;margin-bottom:8px;font-weight:bold">Tu duda sobre Mecha</div>
              <div style="color:#e8ecf3;font-size:14px;line-height:1.5;margin-bottom:16px">${formatMarkdownHtml(duda)}</div>
              <div style="height:1px;background:rgba(255,255,255,0.1);margin:0 0 16px 0"></div>
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#ff8a3d;margin-bottom:8px;font-weight:bold">Respuesta de Chispa</div>
              <div style="color:#f6f8ff;font-size:14px;line-height:1.6">${formatMarkdownHtml(reply)}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:16px">
            <p style="font-size:12px;color:#8e9dbf;margin:0;line-height:1.6">
              ¿Quieres probarlo en tu propio salón? Habla con nuestro equipo por WhatsApp al <a href="https://wa.me/34690792975" style="color:#ff8a3d;text-decoration:none;font-weight:bold">+34 690 79 29 75</a>.<br/>
              Generada automáticamente por la IA de <a href="https://www.mechaa.es" style="color:#f4501e;font-weight:bold;text-decoration:none">Mecha</a>.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

// Aviso al equipo. Se manda SIEMPRE que alguien pregunta desde la demo (no solo
// cuando deja telefono): la duda es el lead. Muestra el canal de vuelta segun lo
// que haya dejado —WhatsApp clicable, correo con mailto, o ninguno— y la
// respuesta que ya le dio Chispa, para no repetirla ni contradecirla.
export function emailLeadHtml(
  duda: string,
  reply: string,
  contacto: { email: string | null; telefono: string | null },
): string {
  const cleanDigits = (contacto.telefono || '').replace(/[^0-9]/g, '');
  const lineas: string[] = [];
  if (contacto.telefono) {
    lineas.push(
      `<div style="font-size:12px;font-weight:bold;color:#25d366;margin-bottom:6px">WhatsApp / teléfono:</div>
       <div style="font-size:16px;font-weight:bold;color:#ffffff;margin-bottom:14px">
         <a href="https://wa.me/${cleanDigits}" style="color:#25d366;text-decoration:none" target="_blank" rel="noopener">${contacto.telefono}</a>
       </div>`,
    );
  }
  if (contacto.email) {
    lineas.push(
      `<div style="font-size:12px;font-weight:bold;color:#ff8a3d;margin-bottom:6px">Correo:</div>
       <div style="font-size:16px;font-weight:bold;color:#ffffff;margin-bottom:14px">
         <a href="mailto:${contacto.email}" style="color:#ff8a3d;text-decoration:none">${contacto.email}</a>
       </div>`,
    );
  }
  if (lineas.length === 0) {
    lineas.push(
      `<div style="font-size:13px;color:#8e9dbf;margin-bottom:14px">Sin datos de contacto: preguntó de forma anónima.</div>`,
    );
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0f1a;padding:28px 14px;font-family:Arial,sans-serif;color:#e8ecf3">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto">
        <tr>
          <td align="center" style="padding-bottom:18px">
            <span style="font:bold 24px Arial,sans-serif;color:#ffffff">Mecha<span style="color:#f4501e">.</span></span>
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d;margin-top:4px;font-weight:bold">Nueva duda desde la demo</div>
          </td>
        </tr>
        <tr>
          <td>
            <div style="background:#101626;border:1px solid rgba(244,80,30,0.32);border-radius:14px;padding:22px">
              ${lineas.join('')}
              <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8e9dbf;margin-bottom:6px">Duda planteada:</div>
              <div style="color:#e8ecf3;font-size:14px;line-height:1.5;margin-bottom:16px">${formatMarkdownHtml(duda)}</div>
              <div style="height:1px;background:rgba(255,255,255,0.1);margin:0 0 16px 0"></div>
              <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#ff8a3d;margin-bottom:6px">Respuesta dada por Chispa:</div>
              <div style="color:#f6f8ff;font-size:13.5px;line-height:1.6">${formatMarkdownHtml(reply)}</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  const rawIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const ip = rawIp.split(',')[0].trim();

  const raw = await req.text();
  if (raw.length > 5000) return json({ error: 'payload_too_large' }, 400, req);

  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400, req);
  }

  const duda = (body.duda || '').trim();
  if (!duda || duda.length < 3) {
    return json({ error: 'missing_duda', message: 'Escribe tu duda para que Chispa pueda responderla.' }, 400, req);
  }

  // Validación dual de contacto (email o teléfono)
  const parsed = parseContacto(body.contacto, body.email, body.telefono);
  if (!parsed.valido) {
    return json({ error: 'bad_contact', message: parsed.error || 'Contacto no válido' }, 400, req);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Rate limit: comparte límite con el widget de la landing (15/hora por IP).
  if (ip !== 'unknown') {
    const { data: ok, error: rlErr } = await admin.rpc('check_landing_rate_limit', { p_ip: ip });
    if (!rlErr && ok === false) {
      return json({
        error: 'rate_limit_exceeded',
        message: 'Has alcanzado el límite de preguntas. Escríbenos por WhatsApp (+34 690 79 29 75) y te respondemos.',
      }, 429, req);
    }
  }

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) return json({ error: 'missing_api_key' }, 500, req);

  // 1) Respuesta de la IA con grounding en la KB.
  // - Modo 'landing' = Chispa vendedora (prompt comercial, con historial).
  // - Modo 'duda' = Asistente técnico de la demo (email + respuesta detallada).
  const landing = body.modo === 'landing';
  const system = landing ? SYSTEM_PROMPT_LANDING : SYSTEM_PROMPT;
  const history = landing && Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
    : [];

  let reply = '';
  const MODELOS_DUDAS = [
    Deno.env.get('CHISPA_MODEL') || 'google/gemini-3.7-flash:batch',
    'google/gemini-3.7-flash',
    'deepseek/deepseek-chat',
    'google/gemini-2.5-flash',
  ];

  try {
    for (const model of MODELOS_DUDAS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://www.novanoidai.com',
            'X-Title': 'Hairy Chispa Dudas',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              ...history,
              { role: 'user', content: duda },
            ],
            max_tokens: landing ? 300 : 600,
            temperature: landing ? 0.5 : 0.3,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          reply = data.choices?.[0]?.message?.content || '';
          if (reply) break;
        } else {
          console.warn(`[chispa-dudas] Error con ${model}:`, await res.text());
        }
      } catch (e) {
        console.warn(`[chispa-dudas] Fallo con ${model}:`, e);
      }
    }

    if (!reply) {
      return json({ error: 'llm_error' }, 500, req);
    }
  } catch (e) {
    console.error('Unexpected LLM error:', e);
    return json({ error: 'internal_error' }, 500, req);
  }

  if (!reply) return json({ error: 'llm_empty' }, 500, req);

  // 1.5) Persistir la duda ANTES de intentar el SMTP. El correo es best-effort:
  // si falla (o faltan credenciales), la duda ya esta a salvo en `dudas_demo`
  // y el lead no se pierde. Inserta la service_role (RLS sin politicas).
  let persistido = false;
  let dudaId: string | null = null;
  if (!landing) {
    try {
      const { data: insertada, error: persistErr } = await admin.from('dudas_demo').insert({
        modo: 'duda',
        duda: duda.slice(0, 4000),
        respuesta: reply.slice(0, 8000),
        email: parsed.email || null,
        telefono: parsed.telefono || null,
        tipo_contacto: parsed.tipo,
        ip: ip === 'unknown' ? null : ip,
      }).select('id').single();
      if (persistErr || !insertada) {
        console.error('Persistencia dudas_demo fallo:', persistErr?.message);
      } else {
        persistido = true;
        dudaId = insertada.id;
      }
    } catch (persistCatch) {
      console.error('Persistencia dudas_demo excepcion:', String(persistCatch));
    }
  }

  // 2) Envío por correo (SMTP Hostinger / denomailer):
  // Soporte completo de fallback para SMTP_* y EMAIL_*
  const host = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
  const port = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
  const user = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER') || '';
  const pass = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS') || '';
  const rawFrom = Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || user || 'contacto@mechaa.es';
  const fromHeader = rawFrom.includes('<') ? rawFrom : `Mecha <${rawFrom}>`;
  const supportEmail = Deno.env.get('MECHA_CONTACTO_EMAIL') || 'contacto@mechaa.es';

  let emailed = false;
  let emailError: string | null = null;

  // Solo se envían correos en modo 'duda' (la landing no dispara SMTP para evitar abusos).
  if (!landing) {
    // 2.a) Si el usuario proporcionó un correo válido, enviarle la respuesta
    if (parsed.email) {
      if (!user || !pass) {
        console.warn('SMTP credentials not configured (missing SMTP_USER/EMAIL_USER or SMTP_PASS/EMAIL_PASS)');
        emailError = 'smtp_not_configured';
      } else {
        try {
          const smtp = new SMTPClient({
            connection: {
              hostname: host,
              port,
              tls: port === 465,
              auth: {
                username: user,
                password: pass,
              },
            },
          });

          await smtp.send({
            from: fromHeader,
            replyTo: supportEmail,
            to: parsed.email,
            subject: 'Mecha · Respuesta de Chispa a tu duda',
            html: emailHtml(duda, reply),
          });

          await smtp.close();
          emailed = true;
        } catch (smtpErr) {
          console.error('SMTP send error:', smtpErr);
          emailError = 'send_failed';
        }
      }
    }

    // 2.b) Aviso al equipo: SIEMPRE que alguien pregunta desde la demo, deje el
    // contacto que deje (o ninguno). Antes solo salia si habia telefono, asi que
    // las dudas con correo —o sin contacto— no llegaban a nadie: la duda ES el
    // lead y no puede depender del canal que elija el visitante.
    if (user && pass) {
      const quien = parsed.telefono
        ? parsed.telefono
        : (parsed.email || 'sin contacto');
      // Asunto con un trozo de la duda: se tria la bandeja de un vistazo.
      const resumen = duda.replace(/\s+/g, ' ').slice(0, 60) + (duda.length > 60 ? '…' : '');
      try {
        const leadSmtp = new SMTPClient({
          connection: {
            hostname: host,
            port,
            tls: port === 465,
            auth: {
              username: user,
              password: pass,
            },
          },
        });

        await leadSmtp.send({
          from: fromHeader,
          // Responder al correo del interesado si lo dejo; si no, al buzon del equipo.
          replyTo: parsed.email || supportEmail,
          to: supportEmail,
          subject: `[Demo] Duda de ${quien}: ${resumen}`,
          html: emailLeadHtml(duda, reply, { email: parsed.email, telefono: parsed.telefono }),
        });

        await leadSmtp.close();
      } catch (leadErr) {
        console.error('Lead notification SMTP error:', leadErr);
      }
    } else {
      console.warn('Aviso al equipo NO enviado: faltan credenciales SMTP.');
    }
  }

  // Reflejar en la fila guardada cómo acabó el envío (best-effort).
  if (dudaId) {
    try {
      await admin.from('dudas_demo').update({ emailed, email_error: emailError }).eq('id', dudaId);
    } catch { /* no cambiar el resultado por esto */ }
  }

  return json({
    reply,
    emailed,
    persistido,
    tipo_contacto: parsed.tipo,
    email_error: emailError,
  }, 200, req);
}

if (import.meta.main) {
  Deno.serve(handler);
}
