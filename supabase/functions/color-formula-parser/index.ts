// Edge Function: color-formula-parser
// Parsea texto (dictado o escrito) a una estructura JSON de fórmula
// con tolerancia a jerga de peluquería y regla dura de salud/alergias.
// Cadena de lógica: DeepSeek V3/V4 -> QwQ-32B -> Llama 3.3 70B

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
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

const MODELOS_LOGICA = [
  'deepseek/deepseek-chat',
  'qwen/qwq-32b',
  'meta-llama/llama-3.3-70b-instruct',
];

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://www.novanoidai.com',
    'X-Title': 'Hairy Color Formula Parser',
  },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  if (!OPENROUTER_API_KEY) return json({ error: 'openrouter_no_configurado' }, 501);

  try {
    const body = await req.json();
    const textoDictado = body.texto;
    if (!textoDictado || typeof textoDictado !== 'string') {
      return json({ error: 'Texto dictado requerido' }, 400);
    }

    const systemPrompt = `
      Eres un asistente experto en colorimetría y peluquería.
      El usuario te dictará una fórmula de color y debes extraer los datos estructurados.
      La jerga puede ser informal (ej: "siete uno", "veinte volúmenes", marcas).
      
      REGLA DURA DE SALUD: Si el texto dictado menciona alergias, condiciones de salud, picores, sensibilidades u otros temas médicos (ej: "le picó", "tiene alergia", "sensibilidad en el cuero cabelludo"), 
      DEBES RECHAZAR LA EXTRACCIÓN. Devuelve exactamente este JSON y NADA MÁS:
      {"health_warning": true}

      Si no hay temas de salud, extrae los siguientes campos (devuelve null si no se mencionan):
      - producto: marca o línea (ej. Wella Koleston, Igora)
      - tono: número o nombre del tono (ej. 7.1, rubio ceniza)
      - gramos: cantidad en gramos (número, ej. 40)
      - oxidante: volúmenes del oxidante (ej. 20 vol)
      - tiempos: tiempo de exposición (ej. 35 min)
      - notas: cualquier otra instrucción o apunte cosmético
      
      Devuelve ÚNICAMENTE un JSON válido.
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: textoDictado },
    ];

    let lastError: Error | null = null;
    let parsed: any = null;

    for (const model of MODELOS_LOGICA) {
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages: messages as any,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });

        const resultText = completion.choices[0]?.message?.content || '{}';
        parsed = JSON.parse(resultText);
        if (parsed && (parsed.health_warning !== undefined || parsed.tono !== undefined || parsed.producto !== undefined || parsed.gramos !== undefined)) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[color-formula-parser] Fallo en modelo '${model}':`, err?.message || err);
      }
    }

    if (!parsed) {
      throw lastError ?? new Error('No se pudo parsear la fórmula de color con los modelos disponibles.');
    }

    return json(parsed);
  } catch (e) {
    console.error('Error en color-formula-parser:', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
