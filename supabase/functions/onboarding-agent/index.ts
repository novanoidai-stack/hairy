// Edge Function: onboarding-agent
// Interprete puntual del asistente de onboarding con IA. NO orquesta el flujo
// completo (eso lo hace el cliente, tema a tema) y NO escribe en la base de
// datos: solo redacta la pregunta de un tema o interpreta la respuesta libre
// del propietario y la traduce a argumentos estructurados via function-calling
// forzado. El cliente (sesion ya autenticada) ejecuta la escritura real.
// Mismo patron de auth/CORS/cliente-OpenRouter que supabase/functions/agenda-asistente.

import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
});
// Mismo slug ya probado en supabase/functions/agenda-asistente (confirmado
// disponible en la cuenta de OpenRouter del proyecto). Constante centralizada
// para poder afinar coste/latencia mas adelante sin tocar el resto del fichero.
const MODEL = 'anthropic/claude-sonnet-4.6';

type TemaId = 'datos_negocio' | 'servicios' | 'equipo' | 'horario_salon' | 'reserva_online' | 'notificaciones';

// Una tool de escritura por tema: define exactamente los argumentos que el
// propietario necesita rellenar. tool_choice se fuerza a la del tema actual,
// asi la respuesta del modelo SIEMPRE tiene esta forma (nada de texto libre
// que parsear).
const TEMA_TOOLS: Record<TemaId, { name: string; description: string; parameters: Record<string, unknown> }> = {
  datos_negocio: {
    name: 'completar_datos_negocio',
    description: 'Extrae nombre, direccion y telefono del negocio de la respuesta libre del propietario.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        direccion: { type: 'string' },
        telefono: { type: 'string' },
      },
      required: ['nombre', 'direccion', 'telefono'],
    },
  },
  servicios: {
    name: 'crear_servicios',
    description: 'Extrae una lista de uno o varios servicios de peluqueria (nombre, precio en euros y duracion en minutos) de la respuesta libre.',
    parameters: {
      type: 'object',
      properties: {
        servicios: {
          type: 'array',
          description: 'Lista de servicios a crear. Debe contener al menos un elemento.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              precio: { type: 'number' },
              duracion_min: { type: 'number' },
            },
            required: ['nombre', 'precio', 'duracion_min'],
          },
        },
      },
      required: ['servicios'],
    },
  },
  equipo: {
    name: 'crear_profesionales',
    description: 'Extrae una lista de uno o varios profesionales de la respuesta libre (nombre, categoria opcional, y si quiere invitarles por email).',
    parameters: {
      type: 'object',
      properties: {
        profesionales: {
          type: 'array',
          description: 'Lista de profesionales a crear. Debe contener al menos un elemento.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              categoria: { type: 'string', enum: ['auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'] },
              quiere_invitar: { type: 'boolean', description: 'true si el propietario dio o pidio dar de alta un email de acceso para esta persona' },
              email: { type: 'string', description: 'Email si quiere_invitar es true; cadena vacia si no.' },
            },
            required: ['nombre', 'categoria', 'quiere_invitar', 'email'],
          },
        },
      },
      required: ['profesionales'],
    },
  },
  horario_salon: {
    name: 'fijar_horario_salon',
    description: 'Traduce el horario semanal descrito en lenguaje natural a los 7 dias (0=lunes...6=domingo).',
    parameters: {
      type: 'object',
      properties: {
        dias: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              dia_semana: { type: 'number' },
              abierto: { type: 'boolean' },
              apertura: { type: 'string', description: 'HH:MM, solo si abierto=true' },
              cierre: { type: 'string', description: 'HH:MM, solo si abierto=true' },
            },
            required: ['dia_semana', 'abierto'],
          },
        },
      },
      required: ['dias'],
    },
  },
  reserva_online: {
    name: 'activar_reserva_online',
    description: 'Interpreta si el propietario quiere activar ya la reserva online publica.',
    parameters: {
      type: 'object',
      properties: { activar: { type: 'boolean' } },
      required: ['activar'],
    },
  },
  notificaciones: {
    name: 'activar_notificaciones',
    description: 'Interpreta si el propietario quiere activar los recordatorios automaticos por WhatsApp.',
    parameters: {
      type: 'object',
      properties: { activar: { type: 'boolean' } },
      required: ['activar'],
    },
  },
};

const ENUNCIAR_TOOL = {
  name: 'enunciar_pregunta',
  description: 'Redacta la pregunta que se muestra en pantalla para el tema actual.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Pregunta o afirmacion breve, tono editorial (no burbuja de chat), maximo 12 palabras.' },
      subtitulo: { type: 'string', description: 'Opcional: una linea de contexto o dato de utilidad (ver reglas de precio abajo).' },
      placeholder_ejemplo: { type: 'string', description: 'Ejemplo de como responder, formato: "p. ej. ...".' },
    },
    required: ['titulo'],
  },
};

const REGLAS_PRECIO = 'Si el tema es "servicios" y hay codigo postal, puedes anadir en "subtitulo" una estimacion de precio de mercado ORIENTATIVA para ese tipo de servicio en esa zona, SIEMPRE con la coletilla "(estimacion de la IA, no un dato verificado)" al final. Nunca la des como cifra oficial. Si no tienes codigo postal, omite el subtitulo de precio.';
const REGLAS_TONO = 'Espanol, sin emojis, tono cercano pero profesional, frases cortas. No inventes datos de mercado fuera de la regla de precio de arriba.';

function buildSystemPrompt(modo: string, tema: TemaId, estado: Record<string, boolean>, perfil: { codigoPostal?: string; nombreNegocio?: string }): string {
  const pendientes = Object.entries(estado).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'ninguno';
  const base = [
    'Eres el asistente de puesta en marcha del software de gestion de peluquerias Mecha.',
    REGLAS_TONO,
    `Codigo postal del negocio: ${perfil.codigoPostal || 'no especificado'}. Nombre del negocio: ${perfil.nombreNegocio || 'no especificado (si es "no especificado" o no lo sabes, usa "tu salon" o "tu negocio" al formular preguntas; NUNCA inventes nombres de salones ni utilices la palabra "Unknown" o "desconocido")'}.`,
    `Temas ya completados antes de esta sesion: ${Object.entries(estado).filter(([, v]) => v).map(([k]) => k).join(', ') || 'ninguno'}. Pendientes: ${pendientes}.`,
    `Tema actual: ${tema}.`,
  ];
  if (modo === 'enriquecer_pregunta') {
    base.push(REGLAS_PRECIO, 'Llama SIEMPRE a la tool enunciar_pregunta con la pregunta de este tema.');
  } else {
    base.push('El propietario ha respondido en lenguaje natural. Llama SIEMPRE a la tool del tema actual con los datos que puedas extraer. Si falta un dato imprescindible, pon tu mejor estimacion razonable a partir del texto (nunca inventes un email; si no dio email, quiere_invitar=false y email="").');
  }
  return base.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'not_authenticated' }, 401);

    const { data: profile } = await svc.from('profiles').select('negocio_id, role').eq('id', user.id).maybeSingle();
    if (!profile?.negocio_id || !['owner', 'admin'].includes(profile.role ?? '')) {
      return json({ error: 'not_authorized' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const modo = body?.modo === 'interpretar_respuesta' ? 'interpretar_respuesta' : 'enriquecer_pregunta';
    const tema = body?.tema as TemaId;
    if (!TEMA_TOOLS[tema]) return json({ error: 'invalid_tema' }, 400);
    const estado = (body?.estado ?? {}) as Record<string, boolean>;
    const perfil = (body?.perfil ?? {}) as { codigoPostal?: string; nombreNegocio?: string };
    const texto = typeof body?.texto === 'string' ? body.texto : '';

    const tool = modo === 'enriquecer_pregunta' ? ENUNCIAR_TOOL : TEMA_TOOLS[tema];
    const messages: { role: 'system' | 'user'; content: string }[] = [
      { role: 'system', content: buildSystemPrompt(modo, tema, estado, perfil) },
    ];
    if (modo === 'interpretar_respuesta') messages.push({ role: 'user', content: texto });
    else messages.push({ role: 'user', content: 'Redacta la pregunta de este tema.' });

    const resp = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages,
      tools: [{ type: 'function', function: tool }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    });

    const call = resp.choices[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: 'no_tool_call' }, 502);
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args queda {} */ }

    if (modo === 'enriquecer_pregunta') {
      return json({ pregunta: { titulo: String(args.titulo ?? ''), subtitulo: args.subtitulo ? String(args.subtitulo) : undefined, placeholder_ejemplo: args.placeholder_ejemplo ? String(args.placeholder_ejemplo) : undefined } });
    }
    return json({ accion: { tipo: tool.name, args } });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
