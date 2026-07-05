// Edge Function: chispa-stt
// Fallback de transcripcion server-side para navegadores sin Web Speech API
// (Safari/iPad principalmente — falla de coherencia #6 del plan IA). Recibe el
// audio grabado en el navegador (MediaRecorder) y lo transcribe.
//
// Eleccion de proveedor (documentada, no improvisada): ElevenLabs Speech-to-Text
// (Scribe) en vez de Whisper via OpenRouter. Motivo: reutiliza el MISMO secret
// que chispa-tts (ELEVENLABS_API_KEY) -> un unico proveedor/API key que rotar y
// vigilar, buen soporte de espanol, y OpenRouter no expone de forma fiable un
// endpoint de transcripcion de audio equivalente a Whisper para todos sus
// modelos. Si mas adelante el coste de Scribe no compensa, este es el unico
// archivo a tocar (el contrato con el cliente -> { texto } no cambia).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const MODEL_ID = 'scribe_v1';
const MAX_BYTES = 8 * 1024 * 1024; // ~8MB: de sobra para un audio de voz corto

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  if (!ELEVENLABS_API_KEY) return json({ error: 'stt_no_configurado' }, 501);

  const contentType = req.headers.get('Content-Type') || 'audio/webm';
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: 'Audio vacio' }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'Audio demasiado largo' }, 413);

  try {
    const form = new FormData();
    form.append('model_id', MODEL_ID);
    form.append('language_code', 'spa');
    form.append('file', new Blob([bytes], { type: contentType }), 'audio');

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: form,
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      return json({ error: 'Fallo al transcribir', detalle: detalle.slice(0, 300) }, 502);
    }
    const data = await r.json().catch(() => ({}));
    const texto = typeof (data as { text?: unknown })?.text === 'string' ? (data as { text: string }).text : '';
    return json({ texto });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
