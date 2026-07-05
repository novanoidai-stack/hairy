// Edge Function: chispa-tts
// Convierte texto de Chispa a audio hablado (Sesion 5 del plan IA — voz de
// salida). Proxy fino a ElevenLabs Text-to-Speech: la key vive SOLO en
// Supabase secrets (ELEVENLABS_API_KEY), nunca en el repo ni en el cliente.
// Si el secret no esta configurado responde 501 "tts_no_configurado": el panel
// (lib/hooks/useChispaVoz.web.ts) lo interpreta y degrada solo al
// speechSynthesis del navegador, sin romper la conversacion.

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
// Voz femenina natural en espanol, premade (disponible en el plan free de
// ElevenLabs). Configurable por secret sin tocar codigo si se quiere otra voz.
const VOICE_ID = Deno.env.get('ELEVENLABS_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL';
const MODEL_ID = 'eleven_multilingual_v2';
// Control de coste: una respuesta de Chispa nunca deberia necesitar mas de
// esto para transmitir la idea; se recorta en vez de rechazar.
const MAX_CHARS = 700;

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

  if (!ELEVENLABS_API_KEY) return json({ error: 'tts_no_configurado' }, 501);

  const body = await req.json().catch(() => ({}));
  const texto = String((body as { texto?: unknown })?.texto ?? '').trim();
  if (!texto) return json({ error: 'Falta texto' }, 400);
  const textoRecortado = texto.slice(0, MAX_CHARS);

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textoRecortado,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
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
