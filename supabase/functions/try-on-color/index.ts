// Edge Function: try-on-color
// Simula o interviene la llamada a la API de LightX para el Try-On de color de cabello.
// Requiere la secret LIGHTX_API_KEY. Si no está configurada, devuelve un 501.
// Entrada: imageUrl (URL firmada privada del bucket cliente-fotos), targetColor (color a aplicar).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const LIGHTX_API_KEY = Deno.env.get('LIGHTX_API_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  if (!LIGHTX_API_KEY) {
    return json({ error: 'Falta configurar LIGHTX_API_KEY en Supabase Secrets.' }, 501);
  }

  const body = await req.json().catch(() => ({}));
  const { imageUrl, targetColor } = body as { imageUrl?: string, targetColor?: string };

  if (!imageUrl || !targetColor) {
    return json({ error: 'Faltan parámetros requeridos: imageUrl, targetColor' }, 400);
  }

  try {
    const COLOR_MAP: Record<string, string> = {
      'rubio_platino': 'platinum blonde',
      'castano_claro': 'light brown',
      'caoba': 'mahogany',
      'cobre': 'copper',
      'negro': 'jet black',
      'rosa': 'pink'
    };
    
    const englishColor = COLOR_MAP[targetColor] || targetColor;

    const r = await fetch('https://api.lightxeditor.com/external/api/v1/hair-color', {
      method: 'POST',
      headers: { 'x-api-key': LIGHTX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        imageUrl: imageUrl, 
        color: englishColor,
        textPrompt: englishColor 
      })
    });

    const result = await r.json();

    if (!r.ok) {
      console.error('LightX API Error:', result);
      return json({ error: 'Error del proveedor de IA (LightX)', detail: result }, 502);
    }

    // Extraer URL de la imagen. La API puede devolver { data: { imageUrl: '...' } } o { imageUrl: '...' }
    const outputUrl = result.data?.imageUrl || result.imageUrl || result.outputUrl;

    if (!outputUrl) {
      console.error('No output URL found in response:', result);
      return json({ error: 'La IA no devolvió una imagen válida.' }, 500);
    }

    return json({ 
      resultUrl: outputUrl, 
      status: 'success'
    }, 200);

  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
