// Edge Function: chispa-tts
// Convierte texto de Chispa a audio hablado (Sesion 5 del plan IA — voz de
// salida). Cadena de proveedores: Kokoro-FastAPI autoalojado en el VPS
// (Apache-2.0, gratis) como primario -> ElevenLabs como respaldo si el VPS
// falla o no responde -> 501 "tts_no_configurado" si ninguno esta disponible,
// que el panel (lib/hooks/useChispaVoz.web.ts) interpreta degradando solo al
// speechSynthesis del navegador, sin romper la conversacion.
//
// KOKORO_TTS_URL / KOKORO_TTS_SECRET deberian vivir en Supabase secrets; aqui
// llevan de momento un default de codigo (mismo patron que VOICE_ID) porque
// no habia forma de fijarlos como secret desde esta sesion -- pendiente
// moverlos a `supabase secrets set` cuando se pueda.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const KOKORO_TTS_URL = Deno.env.get('KOKORO_TTS_URL') || 'http://76.13.45.164:8880';
const KOKORO_TTS_SECRET = Deno.env.get('KOKORO_TTS_SECRET') || 'd16f8a4751202a35bc26d50183dee4f45204685e2ee4eecd';
const KOKORO_VOICE = Deno.env.get('KOKORO_VOICE') || 'ef_dora';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
// Voz femenina natural en espanol, premade (disponible en el plan free de
// ElevenLabs). Configurable por secret sin tocar codigo si se quiere otra voz.
const VOICE_ID = Deno.env.get('ELEVENLABS_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL';
const MODEL_ID = 'eleven_multilingual_v2';
// Control de coste: una respuesta de Chispa nunca deberia necesitar mas de
// esto para transmitir la idea; se recorta en vez de rechazar.
const MAX_CHARS = 700;

async function generarConKokoro(texto: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(`${KOKORO_TTS_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mecha-Secret': KOKORO_TTS_SECRET },
      body: JSON.stringify({
        model: 'kokoro',
        input: texto,
        voice: KOKORO_VOICE,
        response_format: 'mp3',
        speed: 1.0,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

async function generarConElevenLabs(texto: string): Promise<ArrayBuffer | null> {
  if (!ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: texto,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth: solo cuentas de Mecha autenticadas pueden gastar cuota de ElevenLabs
  // (evita que el endpoint se use como proxy TTS gratis desde fuera).
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  const body = await req.json().catch(() => ({}));
  const texto = String((body as { texto?: unknown })?.texto ?? '').trim();
  if (!texto) return json({ error: 'Falta texto' }, 400);
  const textoRecortado = texto.slice(0, MAX_CHARS);

  const audio =
    (await generarConKokoro(textoRecortado)) ?? (await generarConElevenLabs(textoRecortado));

  if (!audio) return json({ error: 'tts_no_configurado' }, 501);

  return new Response(audio, { status: 200, headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
});
