// EJEMPLO de referencia -- NO aplicado a supabase/functions/chispa-tts/index.ts.
// Muestra como quedaria el proxy si se sustituye ElevenLabs por un Kokoro-FastAPI
// autoalojado (Apache-2.0, soporta espanol, API compatible con OpenAI).
//
// Cambio de fondo: hoy chispa-tts solo hace fetch a un servicio de terceros
// (ElevenLabs). Kokoro/Piper/OpenVoice no son paquetes que corran DENTRO de un
// edge function Deno -- son procesos Python/ONNX. Para usarlos en produccion
// hace falta levantar Kokoro-FastAPI en algun sitio con proceso persistente
// (VPS pequeno, Fly.io, Railway... no Vercel ni Supabase edge functions) y
// apuntar aqui a esa URL. Es la unica pieza de infra nueva que introduce esta
// opcion; el resto del proxy se queda igual.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// URL del Kokoro-FastAPI autoalojado (nueva pieza de infra, no existe hoy).
const KOKORO_URL = Deno.env.get('KOKORO_TTS_URL') ?? ''; // p.ej. https://tts.mechaa.es
const KOKORO_VOICE = Deno.env.get('KOKORO_VOICE') || 'ef_dora'; // voz femenina espanol
const MAX_CHARS = 700;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  if (!KOKORO_URL) return json({ error: 'tts_no_configurado' }, 501);

  const body = await req.json().catch(() => ({}));
  const texto = String((body as { texto?: unknown })?.texto ?? '').trim();
  if (!texto) return json({ error: 'Falta texto' }, 400);
  const textoRecortado = texto.slice(0, MAX_CHARS);

  try {
    // Kokoro-FastAPI expone una API compatible con OpenAI TTS.
    const r = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: textoRecortado,
        voice: KOKORO_VOICE,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      return json({ error: 'Fallo al generar audio', detalle: detalle.slice(0, 300) }, 502);
    }
    const audio = await r.arrayBuffer();
    return new Response(audio, { status: 200, headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
