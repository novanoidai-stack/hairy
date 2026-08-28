// Edge Function: chispa-vision-corte
//
// La clienta ensena una foto del corte que quiere; el modelo la lee y devuelve
// que servicios EXACTOS del catalogo de ESTE salon hacen falta, con su duracion.
// El resultado alimenta la creacion de la cita, asi que solo puede devolver ids
// que existan de verdad: un id inventado crea una cita rota.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ErrorIA, llamarIAJson, parteImagen, parteTexto } from '../shared/openrouterClient.ts';
import { comprobarCupo } from '../shared/cupo.ts';
import { auditar, auditarFallo } from '../shared/chispa-auditoria.ts';
import { comoDataUrl, ErrorImagen } from '../shared/imagenes.ts';
import { clavePublicable } from '../shared/claveServicio.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

const MAX_ANALISIS_HORA = 60;

interface ServicioCatalogo {
  id: string;
  nombre: string;
  duracion: number;
  precio: number;
}

interface RespuestaVision {
  servicio_ids?: unknown;
  razonamiento?: unknown;
  diagnostico?: Record<string, unknown>;
  confianza?: unknown;
}

function construirPrompt(catalogo: ServicioCatalogo[]): string {
  const lista = catalogo
    .map((s) => `- ID: ${s.id} | ${s.nombre} | ${s.duracion} min | ${s.precio} EUR`)
    .join('\n');

  return `Eres un estilista y barbero senior. Analizas la foto de un peinado que un
cliente quiere conseguir y decides que servicios de ESTE salon hacen falta.

## Catalogo del salon (unica fuente de ids validos)
${lista}

## Como razonar
1. Describe tecnicamente lo que ves: longitud por zonas (superior, laterales, nuca),
   textura (liso, ondulado, rizado, afro), densidad, si hay degradado y de que tipo
   (taper, low/mid/high fade, skin fade), acabado de barba, y si hay color trabajado
   (mechas, balayage, raiz, decoloracion, tono fantasia).
2. Deduce el TRABAJO necesario para llegar ahi, no solo lo que se ve. Un rubio
   platino sobre base oscura implica decoloracion, no solo tinte.
3. Mapea ese trabajo a los servicios del catalogo. Uno o varios.
4. Si el look pide algo que el catalogo no tiene, coge el mas cercano y dilo en el
   razonamiento. Nunca inventes un servicio ni un id.

## Reglas duras
- Los "servicio_ids" DEBEN existir literalmente en el catalogo de arriba.
- Si la foto no muestra pelo o no se puede valorar (borrosa, muy oscura, de espaldas
  sin detalle), devuelve "servicio_ids": [] y explica por que. Es una respuesta
  correcta; adivinar no lo es.
- No comentes el fisico ni el atractivo de la persona: solo el trabajo tecnico.
- No deduzcas edad, origen ni ningun dato personal de la persona de la foto.

## Salida (JSON estricto, sin texto alrededor)
{
  "servicio_ids": ["id del catalogo", "..."],
  "duracion_total": 120,
  "razonamiento": "explicacion tecnica breve, en espanol, para el profesional",
  "diagnostico": {
    "longitud": "string",
    "textura": "string",
    "degradado": "string o 'ninguno'",
    "color": "string o 'sin trabajo de color'"
  },
  "confianza": "alta | media | baja"
}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const arranque = Date.now();
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, clavePublicable(), {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'No autenticado', codigo: 'no_autenticado' }, 401);

  const { data: perfil } = await userClient
    .from('profiles').select('negocio_id').eq('id', user.id).single();
  const negocioId = perfil?.negocio_id as string | undefined;
  if (!negocioId) return json({ error: 'No se pudo determinar tu salon', codigo: 'sin_negocio' }, 403);

  const body = await req.json().catch(() => ({}));
  const { imageUrl, catalogo } = body as { imageUrl?: string; catalogo?: ServicioCatalogo[] };

  if (!imageUrl || !Array.isArray(catalogo) || catalogo.length === 0) {
    return json({ error: 'Faltan parametros requeridos: imageUrl, catalogo', codigo: 'parametros' }, 400);
  }

  const cupo = await comprobarCupo(userClient, 'vision_corte', MAX_ANALISIS_HORA);
  if (!cupo.permitido) {
    return json({ error: 'Has alcanzado el limite de analisis por hora.', codigo: 'limite_horario' }, 429);
  }

  try {
    // Bytes, no signed URL: el proveedor no debe quedarse con una credencial
    // de acceso al bucket privado de fotos de clientas.
    const dataUrl = await comoDataUrl(imageUrl);

    const resultado = await llamarIAJson<RespuestaVision>(OPENROUTER_API_KEY, {
      funcion: 'chispa-vision-corte',
      mensajes: [{
        role: 'user',
        content: [parteTexto(construirPrompt(catalogo)), parteImagen(dataUrl)],
      }],
      modalidades: ['imagen'],
      maxTokens: 1200,
      temperatura: 0.2,
    });

    // El modelo puede alucinar ids: se filtran contra el catalogo real y se
    // recalcula la duracion con los datos del salon, no con su suma.
    const idsValidos = new Set(catalogo.map((s) => String(s.id)));
    const ids = (Array.isArray(resultado.datos.servicio_ids) ? resultado.datos.servicio_ids : [])
      .map((x) => String(x))
      .filter((id) => idsValidos.has(id));
    const descartados = (Array.isArray(resultado.datos.servicio_ids) ? resultado.datos.servicio_ids.length : 0) - ids.length;

    const duracionTotal = ids.reduce(
      (total, id) => total + (catalogo.find((s) => String(s.id) === id)?.duracion ?? 0),
      0,
    );
    const precioTotal = ids.reduce(
      (total, id) => total + (catalogo.find((s) => String(s.id) === id)?.precio ?? 0),
      0,
    );

    auditar(userClient, resultado, {
      negocioId,
      usuarioId: user.id,
      funcionIA: 'vision_corte',
      superficie: 'Vision corte',
      contexto: { servicios_propuestos: ids.length, ids_descartados: descartados },
    });

    return json({
      servicio_ids: ids,
      duracion_total: duracionTotal,
      precio_total: Math.round(precioTotal * 100) / 100,
      razonamiento: String(resultado.datos.razonamiento ?? ''),
      diagnostico: resultado.datos.diagnostico ?? {},
      confianza: ids.length === 0 ? 'baja' : String(resultado.datos.confianza ?? 'media'),
      meta: {
        modelo: resultado.modelo,
        latencia_ms: resultado.latenciaMs,
        degradado: resultado.intentosFallidos.length > 0,
      },
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error('[chispa-vision-corte] fallo:', mensaje);
    auditarFallo(userClient, {
      negocioId, usuarioId: user.id, funcionIA: 'vision_corte',
      superficie: 'Vision corte', error: mensaje, latenciaMs: Date.now() - arranque,
    });

    if (error instanceof ErrorImagen) return json({ error: mensaje, codigo: error.codigo }, 400);
    const codigo = error instanceof ErrorIA ? error.codigo : 'error_ia';
    return json({ error: mensaje, codigo }, 502);
  }
});
