// Edge Function: chispa-vision-instagram
//
// Compara el "antes" y el "despues" de un trabajo y redacta el texto para
// publicarlo. Las dos fotos se mandan como bytes (no como signed URL del bucket
// privado) y se pide ademas alt text, porque una publicacion sin el deja fuera
// a quien usa lector de pantalla.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ErrorIA, llamarIAJson, parteImagen, parteTexto } from '../shared/openrouterClient.ts';
import { comprobarCupo } from '../shared/cupo.ts';
import { auditar, auditarFallo } from '../shared/chispa-auditoria.ts';
import { comoDataUrl, ErrorImagen } from '../shared/imagenes.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

const MAX_CAPTIONS_HORA = 40;

interface RespuestaCaption {
  caption?: unknown;
  hashtags?: unknown;
  alt_text?: unknown;
  cambio_detectado?: unknown;
}

function construirPrompt(tono: string, nombreSalon: string): string {
  return `Eres el community manager de ${nombreSalon || 'un salon de peluqueria y barberia'}.
Recibes dos fotos del mismo cliente: la primera es el ANTES y la segunda el DESPUES.

## Como razonar
1. Compara las dos fotos y localiza el cambio real: longitud, forma, degradado,
   textura, color (nivel y matiz), acabado de barba, peinado.
2. Decide cual es el titular: lo mas llamativo del cambio, no una lista de todo.
3. Escribe como habla este salon. Su tono es: "${tono}".

## Reglas duras
- Habla del TRABAJO, nunca del fisico de la persona ni de si esta mas guapa.
  "Hemos pasado de un castano con raiz marcada a un rubio ceniza uniforme" si;
  cualquier juicio sobre su aspecto no.
- No inventes nombres, precios, marcas de producto ni tecnicas que no se vean.
- Nada de promesas absolutas ("garantizado", "resultado permanente").
- Espanol de Espana, natural, sin sonar a anuncio generado por maquina.
- El caption: entre 2 y 4 frases. Emojis con moderacion (0 a 3), solo si el tono lo pide.
- Hashtags: entre 5 y 10, en minusculas, relevantes al trabajo y al sector.
- alt_text: descripcion objetiva del resultado para lectores de pantalla, sin emojis
  ni hashtags, una frase.

## Salida (JSON estricto, sin texto alrededor)
{
  "caption": "texto listo para publicar",
  "hashtags": ["#hashtag", "..."],
  "alt_text": "descripcion accesible del resultado",
  "cambio_detectado": "resumen tecnico del antes y despues, para el profesional"
}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const arranque = Date.now();
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'No autenticado', codigo: 'no_autenticado' }, 401);

  const { data: perfil } = await userClient
    .from('profiles').select('negocio_id, nombre_negocio').eq('id', user.id).single();
  const negocioId = perfil?.negocio_id as string | undefined;
  if (!negocioId) return json({ error: 'No se pudo determinar tu salon', codigo: 'sin_negocio' }, 403);

  const body = await req.json().catch(() => ({}));
  const { urlAntes, urlDespues, tonoSalon } = body as {
    urlAntes?: string; urlDespues?: string; tonoSalon?: string;
  };

  if (!urlAntes || !urlDespues) {
    return json({ error: 'Faltan parametros requeridos: urlAntes, urlDespues', codigo: 'parametros' }, 400);
  }

  const cupo = await comprobarCupo(userClient, 'vision_instagram', MAX_CAPTIONS_HORA);
  if (!cupo.permitido) {
    return json({ error: 'Has alcanzado el limite de textos por hora.', codigo: 'limite_horario' }, 429);
  }

  try {
    const [antes, despues] = await Promise.all([comoDataUrl(urlAntes), comoDataUrl(urlDespues)]);
    const tono = tonoSalon?.trim() || 'profesional, moderno y cercano';

    const resultado = await llamarIAJson<RespuestaCaption>(OPENROUTER_API_KEY, {
      funcion: 'chispa-vision-instagram',
      mensajes: [{
        role: 'user',
        content: [
          parteTexto(construirPrompt(tono, String(perfil?.nombre_negocio ?? ''))),
          parteTexto('Foto 1 — ANTES:'),
          parteImagen(antes),
          parteTexto('Foto 2 — DESPUES:'),
          parteImagen(despues),
        ],
      }],
      modalidades: ['imagen'],
      maxTokens: 900,
      temperatura: 0.7,
    });

    const caption = String(resultado.datos.caption ?? '').trim();
    if (!caption) throw new Error('El modelo no devolvio ningun texto utilizable');

    const hashtags = (Array.isArray(resultado.datos.hashtags) ? resultado.datos.hashtags : [])
      .map((h) => String(h).trim())
      .filter(Boolean)
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .slice(0, 10);

    auditar(userClient, resultado, {
      negocioId, usuarioId: user.id, funcionIA: 'vision_instagram', superficie: 'Instagram',
    });

    return json({
      caption,
      hashtags,
      alt_text: String(resultado.datos.alt_text ?? '').trim(),
      cambio_detectado: String(resultado.datos.cambio_detectado ?? '').trim(),
      // Texto ya montado, listo para copiar y pegar.
      texto_completo: hashtags.length > 0 ? `${caption}\n\n${hashtags.join(' ')}` : caption,
      meta: {
        modelo: resultado.modelo,
        latencia_ms: resultado.latenciaMs,
        degradado: resultado.intentosFallidos.length > 0,
      },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error('[chispa-vision-instagram] fallo:', mensaje);
    auditarFallo(userClient, {
      negocioId, usuarioId: user.id, funcionIA: 'vision_instagram',
      superficie: 'Instagram', error: mensaje, latenciaMs: Date.now() - arranque,
    });

    if (error instanceof ErrorImagen) return json({ error: mensaje, codigo: error.codigo }, 400);
    const codigo = error instanceof ErrorIA ? error.codigo : 'error_ia';
    return json({ error: mensaje, codigo }, 502);
  }
});
