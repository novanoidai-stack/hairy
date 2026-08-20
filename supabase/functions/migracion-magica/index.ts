// Edge Function: migracion-magica
// Extractor universal de datos para salones de belleza y peluquerías.
// Procesa cualquier documento (PDF escaneado, Excel, CSV, Word, fotos de cartas o pizarras)
// y extrae clientes, servicios, citas y productos en un solo paso estructurado.

import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';

// Cadena unificada de modelos: Gemini 3.7 Flash -> Qwen 2.5 VL 72B -> Gemini 2.5 Flash -> DeepSeek
const MODELOS_MIGRACION = [
  'google/gemini-3.7-flash:batch',
  'google/gemini-3.7-flash',
  'qwen/qwen2.5-vl-72b-instruct',
  'qwen/qwen-2.5-vl-72b-instruct',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat',
];

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://www.novanoidai.com',
    'X-Title': 'Hairy Migracion Magica',
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────

/** Intenta extraer JSON válido incluso si viene envuelto en ```json ... ``` o con texto extra */
function extractJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* continuar */ }

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continuar */ }
  }

  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)
    ? firstBrace : firstBracket;
  if (start >= 0) {
    const closer = raw[start] === '{' ? '}' : ']';
    const lastClose = raw.lastIndexOf(closer);
    if (lastClose > start) {
      try { return JSON.parse(raw.substring(start, lastClose + 1)); } catch { /* continuar */ }
    }
  }

  throw new Error('No se pudo extraer JSON válido de la respuesta del LLM');
}

/** Llamada al LLM con fallback automático en cascada y reintentos */
async function callLLMWithFallback(messages: unknown[]): Promise<{ content: string; modelUsed: string }> {
  let lastError: Error | null = null;

  for (const model of MODELOS_MIGRACION) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const response = await openai.chat.completions.create({
          model,
          messages: messages as any,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 8192,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error(`LLM (${model}) no devolvió contenido`);
        return { content, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? err?.response?.status;
        const errorMsg = String(err?.message || '').toLowerCase();
        const isNotFound = status === 404 || errorMsg.includes('no endpoints found') || errorMsg.includes('model_not_found');

        console.warn(`[migracion-magica] Error con modelo '${model}' (intento ${attempt + 1}):`, err?.message || err);

        if (isNotFound) break; // saltar inmediatamente al siguiente modelo
        if ((status === 429 || (status && status >= 500)) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error(`Todos los modelos fallaron en migracion-magica: ${MODELOS_MIGRACION.join(', ')}`);
}

// ─── Prompt Universal de Extracción ─────────────────────────────────────

const UNIVERSAL_SYSTEM_PROMPT = `Eres un ULTRA ASISTENTE inteligente de migración de datos para salones de belleza, barberías y peluquerías.
Tu MÁXIMA PRIORIDAD es ser COMPLETAMENTE IMPERMEABLE A ERRORES DE FORMATO, RUIDO O CORRUPCIÓN EN EL DOCUMENTO.
Analiza la entrada (texto, tablas, imágenes, albaranes, exports de Booksy/Treatwell/Fresha/Excel/PDF) y extrae TODOS los datos que existan.

## Formato de salida OBLIGATORIO (JSON estricto):
{
  "nombre_negocio": "string o vacio si no aparece",
  "direccion": "string o vacio si no aparece",
  "profesionales": [
    {
      "nombre": "Nombre del profesional / empleado / barbero / estilista",
      "email": "string o vacio",
      "telefono": "string o vacio",
      "puesto": "string o vacio (ej. Barbero, Colorista, Estilista)"
    }
  ],
  "clientes": [
    {
      "nombre": "Nombre completo del cliente",
      "telefono": "string o vacio",
      "email": "string o vacio",
      "notas": "string o vacio"
    }
  ],
  "servicios": [
    {
      "nombre": "Nombre del servicio",
      "precio": 30.00,
      "duracion_min": 45,
      "categoria": "Nombre de la categoria/seccion (ej. Corte, Color, Barba, Estética)"
    }
  ],
  "citas": [
    {
      "cliente_nombre": "Nombre cliente",
      "cliente_telefono": "string o vacio",
      "servicio_nombre": "Nombre servicio",
      "profesional_nombre": "Nombre profesional o vacio si no se indica",
      "fecha": "YYYY-MM-DD",
      "hora_inicio": "HH:MM",
      "hora_fin": "HH:MM o null"
    }
  ],
  "lineas": [
    {
      "nombre": "Nombre producto o linea de albaran",
      "sku": "string o vacio",
      "cantidad": 1,
      "precio_coste": 0.00
    }
  ]
}

## Reglas de Interpretación:
1. **Tolerancia a Formatos Sucios**: Limpia automáticamente caracteres basura ('>', '*', '•', '~', comillas).
2. **Precios**: Convierte comas decimales ("30,00" -> 30.00), limpia el símbolo '€' / '$'. Si dice "desde 20€", usa 20.00. Si no hay precio, usa 0.00.
3. **Duraciones**: Convierte cualquier formato a MINUTOS ENTEROS ("1h 15m" -> 75, "30 min" -> 30). Si no se indica duración para un servicio, asume 30.
4. **Categorías**: Infiere la categoría si no viene explícita (ej. "Corte caballero" -> "Barbería/Corte", "Tinte raíz" -> "Color").
5. **No devuelvas arrays vacíos si hay datos**: Si el documento contiene clientes, servicios, citas o productos, extráelos todos. Si alguna sección no tiene datos en el documento, deja su array vacío [].`;

// ─── Handler principal ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    const body = await req.json().catch(() => ({}));
    const { intencion, mimeType, content, negocioId } = body;

    if (!mimeType || !content || !negocioId) {
      return json({ error: 'Faltan parametros requeridos: mimeType, content, negocioId' }, 400);
    }

    const messages: unknown[] = [
      { role: 'system', content: UNIVERSAL_SYSTEM_PROMPT },
    ];

    if (mimeType.startsWith('image/')) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Esta es una imagen / captura de datos de un salón de peluquería o barbería (lista de precios, pizarra, agenda, lista de clientes o albarán). Extrae toda la información estructurada según las instrucciones en formato JSON.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${content}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: `A continuación está el texto / volcado extraído de un documento del salón (Excel, CSV, PDF, DOCX o texto plano). Interpreta cualquier formato y extrae todos los clientes, servicios, citas y productos:\n\n---\n${content}\n---`,
      });
    }

    const { content: rawOutput, modelUsed } = await callLLMWithFallback(messages);
    const parsed = extractJson(rawOutput) as Record<string, unknown>;

    // Normalizar claves asegurando que siempre existan arrays
    const resultadoNormalizado = {
      nombre_negocio: parsed.nombre_negocio || '',
      direccion: parsed.direccion || '',
      profesionales: Array.isArray(parsed.profesionales) ? parsed.profesionales : [],
      clientes: Array.isArray(parsed.clientes) ? parsed.clientes : [],
      servicios: Array.isArray(parsed.servicios) ? parsed.servicios : [],
      citas: Array.isArray(parsed.citas) ? parsed.citas : [],
      lineas: Array.isArray(parsed.lineas) ? parsed.lineas : [],
      _modelUsed: modelUsed,
    };

    return json({ ok: true, data: resultadoNormalizado });
  } catch (e) {
    console.error('Error en migracion-magica:', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
