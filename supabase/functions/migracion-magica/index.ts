import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

// Claude Sonnet 4.6 via OpenRouter: soporta vision (imagenes) y texto largo; mismo
// modelo que agenda-asistente/onboarding (probado en produccion).
const MODEL = 'anthropic/claude-sonnet-4.6';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    const body = await req.json().catch(() => ({}));
    const { intencion, mimeType, content, negocioId } = body;

    if (!intencion || !mimeType || !content || !negocioId) {
      return json({ error: 'Faltan parametros requeridos' }, 400);
    }

    let systemPrompt = 'Eres un experto asistente de migracion de datos para un software de gestion de salones de belleza y peluquerias. Tu trabajo es extraer datos estructurados de los archivos (CSV, listas de precios, albaranes) que el usuario proporciona. Debes devolver SOLO un JSON valido.';
    
    if (intencion === 'agenda_booksy_fresha') {
      systemPrompt += `
      Extrae los clientes, servicios y citas de los datos proporcionados.
      Devuelve un JSON con esta estructura exacta:
      {
        "clientes": [{ "nombre": "string", "telefono": "string o vacio", "email": "string o vacio" }],
        "servicios": [{ "nombre": "string", "precio": "number", "duracion_min": "number" }],
        "citas": [{ "cliente_nombre": "string", "cliente_telefono": "string o vacio", "servicio_nombre": "string", "fecha": "YYYY-MM-DD", "hora_inicio": "HH:MM", "hora_fin": "HH:MM o null" }]
      }
      Es super critico que no inventes nada. Si un precio no esta, pon 0. Si una duracion no esta, asume 30 o 60.
      `;
    } else if (intencion === 'catalogo') {
      systemPrompt += `
      Extrae los servicios del catalogo o lista de precios proporcionado.
      Devuelve un JSON con esta estructura exacta:
      {
        "servicios": [{ "nombre": "string", "precio": "number", "duracion_min": "number", "categoria": "string o vacio" }]
      }
      Si no hay categoria explícita, intenta inferirla (ej. 'Corte', 'Color', 'Estética') o dejala vacia.
      `;
    } else if (intencion === 'factura_proveedor') {
      systemPrompt += `
      Extrae los productos o lineas de este albaran o factura de proveedor.
      Devuelve un JSON con esta estructura exacta:
      {
        "lineas": [{ "nombre": "string", "sku": "string o vacio", "cantidad": "number", "precio_coste": "number" }]
      }
      Ignora impuestos, centrate en el precio unitario sin IVA si es posible, o el que este claro.
      `;
    } else {
      return json({ error: 'Intencion no soportada' }, 400);
    }

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (mimeType.startsWith('image/')) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Extrae la informacion de esta imagen segun las instrucciones.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${content}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: `Extrae la informacion de este texto/CSV segun las instrucciones:\n\n${content}`,
      });
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const outputContent = response.choices[0]?.message?.content;
    if (!outputContent) {
      throw new Error('LLM no devolvio contenido');
    }

    const parsed = JSON.parse(outputContent);
    return json({ ok: true, data: parsed });

  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
