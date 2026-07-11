// Edge Function: chispa-tts
// Convierte texto de Chispa a audio hablado (Sesion 5 del plan IA — voz de
// salida). Cadena de proveedores: Kokoro-FastAPI autoalojado en el VPS
// (Apache-2.0, gratis) como primario -> ElevenLabs como respaldo si el VPS
// falla o no responde -> 501 "tts_no_configurado" si ninguno esta disponible,
// que el panel (lib/hooks/useChispaVoz.web.ts) interpreta degradando solo al
// speechSynthesis del navegador, sin romper la conversacion.
//
// KOKORO_TTS_URL, KOKORO_TTS_SECRET y (opcional) KOKORO_VOICE viven en
// Supabase secrets -- el secreto NUNCA debe tener default en el codigo.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

const KOKORO_TTS_URL = Deno.env.get('KOKORO_TTS_URL') ?? '';
const KOKORO_TTS_SECRET = Deno.env.get('KOKORO_TTS_SECRET') ?? '';
const KOKORO_VOICE = Deno.env.get('KOKORO_VOICE') || 'ef_dora';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
// Voz femenina natural en espanol, premade (disponible en el plan free de
// ElevenLabs). Configurable por secret sin tocar codigo si se quiere otra voz.
const VOICE_ID = Deno.env.get('ELEVENLABS_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL';
const MODEL_ID = 'eleven_multilingual_v2';
// Control de coste: una respuesta de Chispa nunca deberia necesitar mas de
// esto para transmitir la idea; se recorta en vez de rechazar.
const MAX_CHARS = 700;
// Texto del pre-calentamiento: una frase REAL (no "." — demasiado trivial para
// forzar la carga del modelo/voz). Sintetizarla en segundo plano hace que el
// cold start (~15-20s la 1a vez tras un reinicio) lo pague el warm, no el usuario.
const WARM_TEXT = 'Preparando la voz de Chispa para el salon.';

async function generarConKokoro(texto: string, voiceId?: string): Promise<ArrayBuffer | null> {
  if (!KOKORO_TTS_URL || !KOKORO_TTS_SECRET) return null;
  try {
    const r = await fetch(`${KOKORO_TTS_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mecha-Secret': KOKORO_TTS_SECRET },
      body: JSON.stringify({
        model: 'kokoro',
        input: texto,
        voice: voiceId || KOKORO_VOICE,
        response_format: 'mp3',
        speed: 1.0,
      }),
      // Timeout generoso a proposito: Kokoro-FastAPI en el VPS responde en ~1-2s
      // EN CALIENTE, pero el PRIMER request del dia (cold start) carga el modelo y
      // tarda ~15-20s. La llamada TTS es async (no bloquea la UI: la voz suena
      // cuando llega), asi que preferimos esperar al cold start y usar Kokoro de
      // verdad antes que degradar al respaldo. En caliente esto no afecta.
      signal: AbortSignal.timeout(25000),
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

  // KEEP-WARM sin sesion de usuario: un cron (n8n / pg_cron) puede mantener el
  // modelo de Kokoro caliente 24/7 pasando el MISMO secreto del VPS en la cabecera
  // X-Warm-Secret (no hace falta un secreto nuevo). Dispara una sintesis minima
  // que fuerza la carga del modelo; nunca es un proxy TTS abierto (no acepta texto).
  const warmSecret = req.headers.get('X-Warm-Secret') ?? '';
  if (warmSecret && KOKORO_TTS_SECRET && warmSecret === KOKORO_TTS_SECRET) {
    const ok = await generarConKokoro(WARM_TEXT, '').catch(() => null);
    return json({ warmed: !!ok }, 200);
  }

  // Auth: solo cuentas de Mecha autenticadas pueden gastar cuota de ElevenLabs
  // (evita que el endpoint se use como proxy TTS gratis desde fuera).
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: 'No autenticado' }, 401);

  const body = await req.json().catch(() => ({}));
  const voiceId = String((body as { voice_id?: unknown })?.voice_id ?? '').trim();

  // Lista de voces disponibles en el VPS de Kokoro (solo lectura, usuario
  // autenticado). Sirve para poblar/validar el selector de voz de forma dinamica
  // en vez de una lista hardcodeada que puede quedar desfasada.
  if ((body as { voices?: unknown })?.voices === true) {
    if (!KOKORO_TTS_URL) return json({ voices: null, motivo: 'kokoro_no_configurado' }, 200);
    try {
      const r = await fetch(`${KOKORO_TTS_URL}/v1/audio/voices`, {
        headers: { 'X-Mecha-Secret': KOKORO_TTS_SECRET },
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json().catch(() => null);
      return json({ voices: j, status: r.status }, 200);
    } catch (e) {
      return json({ voices: null, error: String((e as Error)?.message ?? e) }, 200);
    }
  }

  // PRE-CALENTAMIENTO desde el cliente (usuario autenticado): cuando se abre
  // Chispa con la voz activa, se dispara esto para cargar el modelo de Kokoro EN
  // SEGUNDO PLANO mientras el usuario lee/escribe, de modo que la primera voz real
  // de la sesion no pague el cold start (~15-20s). No sintetiza ni devuelve audio util.
  if ((body as { warm?: unknown })?.warm === true) {
    const ok = await generarConKokoro(WARM_TEXT, voiceId).catch(() => null);
    return json({ warmed: !!ok }, 200);
  }

  const texto = String((body as { texto?: unknown })?.texto ?? '').trim();
  if (!texto) return json({ error: 'Falta texto' }, 400);
  const textoRecortado = texto.slice(0, MAX_CHARS);

  const audio =
    (await generarConKokoro(textoRecortado, voiceId)) ?? (await generarConElevenLabs(textoRecortado));

  if (!audio) return json({ error: 'tts_no_configurado' }, 501);

  return new Response(audio, { status: 200, headers: { ...cors, 'Content-Type': 'audio/mpeg' } });
});
