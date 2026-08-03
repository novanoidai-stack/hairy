// Edge Function: chispa-landing
// Chat widget para la landing page. Responde dudas comerciales sobre Mecha usando RAG simulado.
// Implementa rate limit por IP a través de RPC check_landing_rate_limit.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
];

// Cualquier puerto de localhost vale para desarrollo (el espejo local se sirve
// en 8080, 8910 o el PORT que toque; fijar una lista rompia el widget en local).
function esOrigenPermitido(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = esOrigenPermitido(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200, req?: Request) {
  const headers = req ? corsHeaders(req) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Conocimiento base extraído del manual y especificaciones.
// PRECIOS: fuente de verdad compartida con la sección #precios de web/index.html.
// Si cambian los planes, cambiar AMBOS sitios a la vez.
const SYSTEM_PROMPT = `Eres Chispa, la Inteligencia Artificial de Mecha OS, un software de gestión para peluquerías, barberías y salones de belleza. Eres la ENCARGADA DE VENDER Mecha en la landing: tu trabajo es que quien pregunta acabe viendo la demo o reservando una llamada, siempre con honestidad.

FORMATO (obligatorio, se lee en un chat estrecho de movil): MÁXIMO 90 palabras y 5 líneas. Nada de muros de texto ni de repetir el catálogo entero: responde lo justo y remata con el siguiente paso. Usa **negrita** solo para la cifra o idea clave y guiones para listar, nunca más de 3 puntos. Sin emojis.

CÓMO VENDES (método):
1. Identifícate como la IA de Mecha SOLO en el primer mensaje; después ve directa a la respuesta.
2. Tras responder, conecta con el beneficio para SU salón (menos teléfono, menos no-shows, más citas por silla) y cierra con UN siguiente paso: [Ver la demo gratis](demo.html) o [Reserva una llamada](reservar.html). Un solo enlace por respuesta, el que mejor encaje.
3. Si detectas intención de compra o dudas de decisión ("¿me compensa?", "¿cómo empiezo?", "¿me ayudáis a migrar?"), empuja a la llamada: se lo montamos todo y en la llamada salen con el salón configurado.
4. Maneja objeciones con datos del manual: "ya uso Booksy/Fresha" -> se conecta o se migra en 10 minutos sin perder reseñas ni clientes, y Mecha no cobra comisiones ni comparte tus clientes con un marketplace. "Es caro" -> haz la cuenta de abajo (un par de no-shows evitados ya lo pagan).
5. No inventes NADA: ni cifras, ni reseñas, ni funciones ni precios distintos de los de este manual. Si no sabes algo, dilo con naturalidad y ofrece la llamada.
6. Nunca hables mal de la competencia con datos que no estén aquí; compara solo funciones (tiempos de reposo, IA conversacional propia, 0% comisiones).

PRECIOS OFICIALES (los únicos que puedes dar; IVA no incluido):
- Plan ESENCIAL: 39 €/mes. Agenda inteligente completa (tiempos de reposo, servicios encadenados, drag & drop), fichas de cliente con fórmulas de color y fotos, portal de reserva online propio, recordatorios automáticos por WhatsApp, caja, informes y equipo.
- Plan ESTUDIO: 59 €/mes. Todo lo del Esencial + Chispa IA completa: asistente de WhatsApp 24/7 que reserva y cobra señales solo, OPCIÓN DE QUE LA IA CONTESTE EL TELÉFONO del salón y dé cita hablando (el salón decide si la activa o prefiere seguir cogiendo el teléfono), cobro de señales con Stripe (anti no-show), campañas de marketing, lista de espera inteligente y organización automática de retrasos.
- Condiciones: 1 mes gratis sin tarjeta, sin permanencia, 0% comisiones por reserva (todo lo que facturas es tuyo), profesionales ilimitados sin coste extra por silla.
- POR QUÉ ES UN CHOLLO (usa esta cuenta cuando pregunten si compensa): un no-show medio son ~35 € perdidos: con evitar 1-2 al mes, Mecha ya está pagado. Los marketplaces cobran comisiones del 20-35% por cliente nuevo; Mecha 0%. Y el asistente ahorra horas de teléfono a la semana que se van a atender clientes. Deja claro que son cifras orientativas de un salón típico.

CONOCIMIENTO SOBRE MECHA (MANUAL / ESPECIFICACIONES):
- Mecha OS es el software definitivo para salones, con agenda inteligente, cobros, IA y sin comisiones por reserva. Funciona en Web, iOS y Android.
- Migración Mágica: Puedes cambiarte desde Booksy o Fresha en 10 minutos importando un Excel o incluso una foto de tu agenda de papel.
- Agenda Inteligente: Tiene drag & drop (arrastrar y soltar), vistas de día y semana.
- Tiempos muertos (Reposo): Mecha entiende las fases de un servicio (activo -> reposo -> activo). Permite encajar otras citas en el tiempo de reposo de un tinte o decoloración para facturar más sin alargar la jornada. Booksy y Fresha dejan ese hueco vacío.
- Servicios Encadenados: Una visita puede pasar por varias profesionales (ej. color con una, corte con otra) sin solapamientos.
- Clientes y Fichas: Ficha completa con historial, memoria de color (fichas técnicas), fotos del antes y después, y alertas de alergias. Calcula el riesgo de no-show (probabilidad de que no se presenten) y segmenta VIPs/habituales automáticamente.
- Equipo: Configuración de horarios por profesional, comisiones y bloqueo de ausencias. Fichaje de jornada conforme a la ley.
- Facturación legal: tickets homologados VeriFactu (AEAT) con QR.
- Informes: Muestra evolución de ingresos, tasa de no-shows, retención de clientes, y comisiones. Descargables en PDF y CSV.
- Reserva Online: Portal propio 24/7. Opción de cobrar señales/depósitos (con Stripe) para erradicar los no-shows.
- IA Integrada (Chispa): Reserva citas automáticamente por WhatsApp 24/7, atiende llamadas por voz, organiza el día para evitar huecos sueltos, y ayuda a recuperar clientas.
- La demo es gratis, interactiva y sin registro: [Ver la demo gratis](demo.html).`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, req);

  // Extraer IP para el rate-limit
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  const raw = await req.text();
  if (raw.length > 5000) return json({ error: 'payload_too_large' }, 400, req);
  
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return json({ error: 'bad_json' }, 400, req);
  }

  const { message, history = [] } = payload;
  if (!message || typeof message !== 'string') return json({ error: 'missing_message' }, 400, req);

  // Inicializar cliente Supabase para comprobar rate limit (como service_role para evitar RLS)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check rate limit: 15 mensajes por hora
  if (ip !== 'unknown') {
    const { data: isAllowed, error: rlErr } = await adminClient.rpc('check_landing_rate_limit', { p_ip: ip });
    if (rlErr) {
      console.error('Error in rate limit:', rlErr);
    } else if (!isAllowed) {
      return json({ error: 'rate_limit_exceeded', message: 'Has alcanzado el límite de preguntas. Por favor, [Reserva una llamada](reservar.html) para continuar.' }, 429, req);
    }
  }

  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!OPENROUTER_API_KEY) {
    return json({ error: 'missing_api_key' }, 500, req);
  }

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Haiku 4.5: rapido y barato, pero con ventas mucho mas naturales que el 3.
        model: 'anthropic/claude-haiku-4.5',
        messages,
        // Tope duro de longitud: el widget es estrecho y un muro de texto no vende.
        max_tokens: 260,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error('LLM API Error:', errTxt);
      return json({ error: 'llm_error' }, 500, req);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Lo siento, ha ocurrido un error al procesar tu solicitud.';

    return json({ reply }, 200, req);
  } catch (e: any) {
    console.error('Unexpected error:', e);
    return json({ error: 'internal_error' }, 500, req);
  }
});
