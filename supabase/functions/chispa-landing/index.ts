// Edge Function: chispa-landing
// Chat widget para la landing page. Responde dudas comerciales sobre Mecha usando RAG simulado.
// Implementa rate limit por IP a través de RPC check_landing_rate_limit.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { llamarIA, type MensajeIA } from '../shared/openrouterClient.ts';
import { claveServicio } from '../shared/claveServicio.ts';

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
4. Maneja objeciones con datos del manual: "ya uso Booksy/Fresha" -> se trae sus clientes y su historial a Mecha en 10 minutos, desde un Excel exportado o una foto de la agenda; las reseñas se quedan en su plataforma actual y eso se dice sin rodeos; puede mantener su app actual mientras prueba. Mecha no cobra comisiones ni comparte tus clientes con un marketplace. "Es caro" -> haz la cuenta de abajo (un par de no-shows evitados ya lo pagan).
5. No inventes NADA: ni cifras, ni reseñas, ni funciones ni precios distintos de los de este manual. Si no sabes algo, dilo con naturalidad y ofrece la llamada.
6. Nunca hables mal de la competencia con datos que no estén aquí; compara solo funciones (tiempos de reposo, IA conversacional propia, 0% comisiones).
7. PROHIBIDO decir que Mecha se "sincroniza", se "conecta" o se "integra" con Booksy o Fresha: esa integración NO existe. Solo existe migración puntual (importar sus datos una vez). Prohibido también prometer que se conservan las reseñas: no son exportables.

PRECIOS OFICIALES (los únicos que puedes dar; IVA no incluido):
- DOS PLANES DE SOFTWARE, y NO traen lo mismo (esto es importante: no prometas a un
  Esencial nada de la lista de Estudio):
  · Esencial: 39 €/mes. Agenda inteligente completa con tiempos de reposo y servicios
    encadenados y drag & drop, fichas de cliente con fórmulas de color y fotos, portal
    de reserva online propio, recordatorios automáticos por WhatsApp, caja, informes,
    equipo y libro de tickets inalterable.
  · Estudio: 59 €/mes. Todo lo de Esencial MÁS presupuestos, inventario, reseñas,
    cobro de señales con Stripe (anti no-show), campañas de marketing y lista de
    espera inteligente.
- RECEPCIONISTAS: ADDON DE IA (OPCIONAL, aparte del software, se activa cuando quiera sobre cualquiera de los dos planes):
  · Solo WhatsApp: +19 €/mes. Chispa atiende WhatsApp 24/7, reserva citas y cobra la señal sola.
  · Solo voz: +29 €/mes. La IA contesta el teléfono del salón y da cita hablando.
  · Completo (WhatsApp + voz): +39 €/mes (en vez de 48 € sueltos).
- Condiciones: 1 mes gratis sin tarjeta, sin permanencia, 0% comisiones por reserva (todo lo que facturas es tuyo), profesionales ilimitados sin coste extra por silla en los dos planes. El addon de Recepcionistas se activa o se desactiva cuando el salón quiera, sin permanencia tampoco.
- POR QUÉ ES UN CHOLLO (usa esta cuenta cuando pregunten si compensa): un no-show medio son ~35 € perdidos: con evitar 1-2 al mes, ya se paga el plan o el addon de Recepcionistas, lo que estén valorando. Los marketplaces cobran comisiones del 20-35% por cliente nuevo; Mecha 0%. Y Recepcionistas ahorra horas de teléfono a la semana que se van a atender clientes. Deja claro que son cifras orientativas de un salón típico.

CONOCIMIENTO SOBRE MECHA (MANUAL / ESPECIFICACIONES):
- Mecha OS es el software definitivo para salones, con agenda inteligente, cobros, IA y sin comisiones por reserva. Funciona en Web, iOS y Android.
- Migración Mágica: Puedes cambiarte desde Booksy o Fresha en 10 minutos importando un Excel o incluso una foto de tu agenda de papel.
- Agenda Inteligente: Tiene drag & drop (arrastrar y soltar), vistas de día y semana.
- Tiempos muertos (Reposo): Mecha entiende las fases de un servicio (activo -> reposo -> activo). Permite encajar otras citas en el tiempo de reposo de un tinte o decoloración para facturar más sin alargar la jornada. Booksy y Fresha dejan ese hueco vacío.
- Servicios Encadenados: Una visita puede pasar por varias profesionales (ej. color con una, corte con otra) sin solapamientos.
- Clientes y Fichas: Ficha completa con historial, memoria de color (fichas técnicas), fotos del antes y después, y alertas de alergias. Calcula el riesgo de no-show (probabilidad de que no se presenten) y segmenta VIPs/habituales automáticamente.
- Equipo: Configuración de horarios por profesional, comisiones y bloqueo de ausencias. Fichaje de jornada conforme a la ley.
- Facturación legal: libro de tickets inalterable. Cada cobro se encadena con hash
  SHA-256 y numeración correlativa (RD 1007/2023) y los tickets no se borran, solo se
  rectifican. OJO: el envío del registro a la AEAT y el QR de cotejo NO están todavía.
  Si preguntan por VeriFactu, cuenta esto tal cual y no afirmes que ya está: aún no.
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
  const SERVICE_ROLE = claveServicio();
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

    // La cascada la decide el cliente compartido a partir del catalogo
    // verificado (shared/modelos.ts). Aqui no se escriben ids a mano: el
    // problema anterior fue justo ese, ids inventados que nadie comprobaba.
    let reply = '';
    try {
      const resultado = await llamarIA(OPENROUTER_API_KEY, {
        funcion: 'chispa-landing',
        mensajes: messages as MensajeIA[],
        maxTokens: 280,
        temperatura: 0.4,
        // Es un chat comercial de texto en la web publica: prima el coste.
        perfil: 'economico',
        timeoutMs: 25_000,
      });
      reply = resultado.texto.trim();
    } catch (e) {
      console.error('[chispa-landing] sin respuesta de IA:', e instanceof Error ? e.message : e);
    }

    if (!reply) {
      reply = 'Ahora mismo no puedo responderte. Escribenos a contacto@mechaa.es o [reserva una llamada](reservar.html) y te lo contamos en 10 minutos.';
    }

    return json({ reply }, 200, req);
  } catch (e: any) {
    console.error('Unexpected error:', e);
    return json({ error: 'internal_error' }, 500, req);
  }
});
