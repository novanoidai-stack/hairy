// Edge Function: chispa-landing
// Chat widget para la landing page. Responde dudas comerciales sobre Mecha usando RAG simulado.
// Implementa rate limit por IP a través de RPC check_landing_rate_limit.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://www.mechaa.es',
  'https://mechaa.es',
  'https://hairy-two.vercel.app',
  'https://www.novanoidai.com',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:19006',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
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

// Conocimiento base extraído del manual y especificaciones
const SYSTEM_PROMPT = `Eres Chispa, la Inteligencia Artificial de Mecha OS, un software de gestión para peluquerías y salones de belleza.
Tu objetivo es responder dudas de posibles clientes en la landing page del producto. 

REGLAS ESTRICTAS:
1. Identifícate siempre como la IA de Mecha ("Soy Chispa, la IA de Mecha...").
2. No inventes cifras, métricas, reseñas ni funciones que no existan en el manual de abajo. PRECIOS: no conoces cifras de precio exactas; si preguntan cuánto cuesta, explica que hay varios planes según el tamaño del salón y que se lo detallan sin compromiso en la llamada. NUNCA inventes una cifra de precio ni un plan concreto.
3. Eres un asistente comercial. Si el usuario hace preguntas complejas, fuera de tema, o muestra intención clara de comprar/probar el software, invítale a reservar una llamada proporcionando este enlace exacto en Markdown: [Reserva una llamada](reservar.html).
4. Sé concisa, amable y usa un tono profesional pero cercano. 
5. Si no sabes algo, admite que eres una IA y diles que un humano les explicará en la llamada.

CONOCIMIENTO SOBRE MECHA (MANUAL / ESPECIFICACIONES):
- Mecha OS es el software definitivo para salones, con agenda inteligente, cobros, IA y sin comisiones por reserva. Funciona en Web, iOS y Android.
- Migración Mágica: Puedes cambiarte desde Booksy o Fresha en 10 minutos importando un Excel o incluso una foto de tu agenda de papel.
- Agenda Inteligente: Tiene drag & drop (arrastrar y soltar), vistas de día y semana. 
- Tiempos muertos (Reposo): Mecha entiende las fases de un servicio (activo -> reposo -> activo). Permite encajar otras citas en el tiempo de reposo de un tinte o decoloración para facturar más sin alargar la jornada.
- Servicios Encadenados: Una visita puede pasar por varias profesionales (ej. color con una, corte con otra) sin solapamientos.
- Clientes y Fichas: Ficha completa con historial, memoria de color (fichas técnicas), fotos del antes y después, y alertas de alergias. Calcula el riesgo de no-show (probabilidad de que no se presenten) y segmenta VIPs/habituales automáticamente.
- Equipo: Configuración de horarios por profesional, comisiones y bloqueo de ausencias.
- Informes: Muestra evolución de ingresos, tasa de no-shows, retención de clientes, y comisiones. Descargables en PDF y CSV.
- Reserva Online: Portal propio 24/7. Opción de cobrar señales/depósitos (con Stripe) para erradicar los no-shows. 
- IA Integrada (Chispa): Reserva citas automáticamente por WhatsApp 24/7, atiende llamadas por voz, organiza el día para evitar huecos sueltos, y ayuda a recuperar clientas.`;

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
        model: 'anthropic/claude-3-haiku', // Fast and cheap for simple landing RAG
        messages,
        max_tokens: 300,
        temperature: 0.3,
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
