// Edge Function: chispa-vision-corte
// LLM Vision para analizar una foto de un peinado y mapearlo a servicios del catálogo.

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
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
});
const MODEL = 'openai/gpt-4o'; // Soporta Vision

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
  const { imageUrl, catalogo } = body as { imageUrl?: string, catalogo?: any[] };

  if (!imageUrl || !catalogo || catalogo.length === 0) {
    return json({ error: 'Faltan parámetros requeridos: imageUrl, catalogo' }, 400);
  }

  try {
    const catalogoTexto = catalogo.map(s => `- ID: ${s.id} | Nombre: ${s.nombre} | Duración: ${s.duracion} min | Precio: ${s.precio}`).join('\n');

    const prompt = `
      Eres un estilista experto. Se te proporciona la foto de un peinado/corte que una clienta desea.
      También se te proporciona el catálogo de servicios de este salón.
      
      CATÁLOGO:
      ${catalogoTexto}
      
      TAREA:
      Analiza la foto e identifica qué servicios EXACTOS del catálogo son necesarios para lograr ese resultado (corte, tinte, mechas, peinado, etc.).
      REGLA: NO inventes servicios que no estén en la lista. Si el look requiere algo que no está, usa el más cercano o ignóralo, pero los IDs devueltos DEBEN estar en el catálogo.
      
      Devuelve la respuesta ESTRICTAMENTE en formato JSON, sin markdown, con esta estructura:
      {
        "servicio_ids": ["id1", "id2"],
        "duracion_total": 120, // suma de duraciones en minutos
        "razonamiento": "Explicación breve de por qué se eligieron estos servicios basada en la foto."
      }
    `.trim();

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      result = { error: 'LLM did not return valid JSON' };
    }

    return json(result);
  } catch (error: any) {
    console.error('Error en chispa-vision-corte:', error);
    return json({ error: 'Error al analizar la foto', detalle: error.message }, 500);
  }
});
