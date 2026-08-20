// Edge Function: chispa-vision-instagram
// LLM Vision para generar un caption de Instagram basado en fotos "Antes" y "Después".
// Cadena multimodal: Gemini 3.7 Flash -> Qwen 2.5 VL 72B -> Gemini 2.0 Flash

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

const MODELOS_VISION = [
  'google/gemini-3.7-flash:batch',
  'google/gemini-3.7-flash',
  'qwen/qwen2.5-vl-72b-instruct',
  'qwen/qwen-2.5-vl-72b-instruct',
  'google/gemini-2.5-flash',
];

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://www.novanoidai.com',
    'X-Title': 'Hairy Chispa Instagram',
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

  const body = await req.json().catch(() => ({}));
  const { urlAntes, urlDespues, tonoSalon } = body as { urlAntes?: string; urlDespues?: string; tonoSalon?: string };

  if (!urlAntes || !urlDespues) {
    return json({ error: 'Faltan parámetros requeridos: urlAntes, urlDespues' }, 400);
  }

  try {
    const prompt = `
      Eres un experto en marketing para salones de peluquería y barberías.
      Se te proporcionan dos fotos: un "Antes" y un "Después" de una clienta o cliente.
      El tono de comunicación del salón es: "${tonoSalon || 'profesional, moderno y cercano'}".
      Analiza el cambio (color, corte, textura, peinado, acabado de barba) y redacta un caption atractivo para Instagram destacando el trabajo.
      Incluye emojis apropiados y hashtags relevantes del sector.
      NO inventes nombres propios ni precios si no se te dan.
      Devuelve SOLO el texto del caption, sin comillas ni explicaciones extra.
    `.trim();

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: urlAntes } },
          { type: 'image_url', image_url: { url: urlDespues } },
        ],
      },
    ];

    let lastError: Error | null = null;
    let caption = '';

    for (const model of MODELOS_VISION) {
      try {
        const response = await openai.chat.completions.create({
          model,
          messages: messages as any,
          max_tokens: 500,
        });

        caption = response.choices[0]?.message?.content?.trim() || '';
        if (caption) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[chispa-vision-instagram] Fallo en modelo '${model}':`, err?.message || err);
      }
    }

    if (!caption) {
      throw lastError ?? new Error('No se pudo generar el caption con los modelos disponibles.');
    }

    return json({ caption });
  } catch (error: any) {
    console.error('Error en chispa-vision-instagram:', error);
    return json({ error: 'Error al generar el caption', detalle: error.message }, 500);
  }
});
