// Edge Function: traductor-marcas
// Recibe una fórmula de coloración capilar y propone la equivalencia en otra marca comercial.
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
    'X-Title': 'Hairy Traductor Marcas',
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
    const formulaOriginal = body.formula;
    const marcaDestino = body.marca_destino;

    if (!formulaOriginal || !marcaDestino) {
      return json({ error: 'formula y marca_destino son requeridos' }, 400);
    }

    const systemPrompt = `
      Eres un experto colorista y químico capilar. Te darán una fórmula de color y la marca comercial a la que debes traducirla (ej. Wella, L'Oréal, Schwarzkopf, Redken, Salerm).
      Debes devolver un JSON estructurado con la nueva fórmula equivalente y sus proporciones técnicas.
      
      ESTRICTAMENTE REQUERIDO:
      Debes devolver un JSON con la siguiente estructura y NADA MÁS:
      {
        "formula_nueva": "la formula en la marca de destino",
        "producto": "nombre de la nueva marca o linea",
        "tono": "tono recomendado",
        "gramos": "proporciones sugeridas",
        "oxidante": "oxidante sugerido",
        "disclaimer": "orientativo, verifica con tu carta de color"
      }
      El campo 'disclaimer' es OBLIGATORIO y debe decir exactamente: "orientativo, verifica con tu carta de color".
    `;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Formula original: ${JSON.stringify(formulaOriginal)}\nTraducir a: ${marcaDestino}` },
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
        if (parsed && parsed.formula_nueva) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[traductor-marcas] Fallo en modelo '${model}':`, err?.message || err);
      }
    }

    if (!parsed) {
      throw lastError ?? new Error('No se pudo traducir la fórmula con los modelos disponibles.');
    }

    // Asegurar que el disclaimer esté presente y sea el correcto
    parsed.disclaimer = "orientativo, verifica con tu carta de color";

    return json(parsed);
  } catch (e) {
    console.error('Error en traductor-marcas:', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
