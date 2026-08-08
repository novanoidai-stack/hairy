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

// Claude Sonnet 4.6 via OpenRouter: soporta vision (imagenes) y texto largo; mismo
// modelo que agenda-asistente/onboarding (probado en produccion).
const MODEL = 'anthropic/claude-sonnet-4.6';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
});

// ─── Helpers ────────────────────────────────────────────────────────────

/** Intenta extraer JSON válido incluso si viene envuelto en ```json ... ``` */
function extractJson(raw: string): unknown {
  // 1. Intentar parse directo
  try { return JSON.parse(raw); } catch { /* continuar */ }

  // 2. Quitar ```json ... ``` markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continuar */ }
  }

  // 3. Buscar el primer { ... } o [ ... ] balanceado
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

/** Llamada al LLM con reintentos y backoff exponencial */
async function callLLMWithRetry(
  messages: unknown[],
  maxRetries = 2,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: messages as any,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 8192,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('LLM no devolvió contenido');
      return content;
    } catch (err) {
      lastError = err as Error;
      // Solo reintentar en errores de red/rate-limit (429, 500, 502, 503)
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if (status && status < 500 && status !== 429) throw err;
      if (attempt < maxRetries) {
        const waitMs = (attempt + 1) * 1500; // 1.5s, 3s
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError ?? new Error('LLM falló tras reintentos');
}

// ─── Prompt robusto para catálogo ───────────────────────────────────────

const CATALOGO_SYSTEM_PROMPT = `Eres un ULTRA ASISTENTE inteligente de migración de datos especializado en salones de belleza y peluquerías.

Tu MÁXIMA PRIORIDAD es ser completamente IMPERMEABLE A CUALQUIER TIPO DE ERROR DE FORMATO, RUIDO O CORRUPCIÓN EN EL TEXTO. Debes reconstruir y extraer el catálogo de servicios sin importar lo sucio, desordenado, fragmentado o corrupto que sea el documento.

## Formato de salida OBLIGATORIO (JSON estricto)
{
  "nombre_negocio": "string o vacío si no aparece",
  "direccion": "string o vacío si no aparece",
  "servicios": [
    {
      "nombre": "Nombre limpio del servicio",
      "precio": 30.00,
      "duracion_min": 75,
      "categoria": "Nombre de la sección/categoría"
    }
  ]
}

## Tolerancia Absoluta a Ruido y Formatos Sucios — CUMPLA SIN EXCEPCIÓN
1. **Símbolos y Caracteres de Formato**: Ignora y elimina automáticamente cualquier carácter inicial como '>', '-', '*', '•', '#', '|', '~', comillas o viñetas.
   - Ejemplo: "> Corte \n > 30,00 € \n > 30 min" debe extraerse como Nombre: "Corte", Precio: 30.00, Duración: 30.
2. **Celdas en Líneas Separadas**: Si un nombre de servicio aparece en una línea, el precio en la siguiente línea y la duración en la tercera, RECONSTRÚYELOS como un único servicio.
3. **Tablas Desestructuradas / OCR Ruidoso**: Si el texto contiene tabulaciones, espacios dobles, puntos suspensivos ("Corte .......... 30€"), tuberías ("Corte | 30€"), o comas ("Corte, 30€, 30m"), extrae la información sin dudar.
4. **Precios y Monedas**:
   - Convierte comas decimales ("30,00" → 30.00).
   - Limpia símbolos de euro (€), dólar ($), etc.
   - Si dice "desde 25€" o "a partir de 25€", usa 25.00.
   - Si no hay precio explícito, usa 0.00.
5. **Duraciones**:
   - Convierte cualquier expresión de tiempo a MINUTOS ENTEROS:
     - "1 h 15 min", "1h15m", "1h 15m", "75 min" → 75
     - "2 h 30 min", "2h30", "150m" → 150
     - "4 h", "4 horas" → 240
     - "30'", "30 min" → 30
   - Si no hay duración, usa 30 por defecto.
6. **Categorías**:
   - Identifica encabezados de sección ("Corte y acabado", "Secados", "Color", "Mechas", "Estética", etc.) y asigna esa categoría a todos los servicios siguientes.
   - Si no hay categorías explícitas, infiérelas por el tipo de servicio o usa "General".

## NUNCA Devuelvas un Array Vacío
Si hay cualquier intento de servicio o precio en el documento, extrae TODOS y cada uno de los servicios. Es IMPOSIBLE e INACEPTABLE devolver un array de servicios vacío si el documento contiene datos de tarifas.`;

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

    if (!intencion || !mimeType || !content || !negocioId) {
      return json({ error: 'Faltan parametros requeridos' }, 400);
    }

    let systemPrompt = 'Eres un experto asistente de migracion de datos para un software de gestion de salones de belleza y peluquerias. Tu trabajo es extraer datos estructurados de los archivos (CSV, listas de precios, albaranes) que el usuario proporciona. Debes devolver SOLO un JSON valido.';
    
    if (intencion === 'agenda_booksy_fresha') {
      systemPrompt += `
      Extrae los clientes, servicios y citas de los datos proporcionados.
      Devuelve un JSON con esta estructura exacta:
      {
        "clientes": [{ "nombre": "string", "telefono": "string o vacio", "email": "string o vacio" }],
        "servicios": [{ "nombre": "string", "precio": "number", "duracion_min": "number" }],
        "citas": [{ "cliente_nombre": "string", "cliente_telefono": "string o vacio", "servicio_nombre": "string", "fecha": "YYYY-MM-DD", "hora_inicio": "HH:MM", "hora_fin": "HH:MM o null" }]
      }
      Es super critico que no inventes nada. Si un precio no esta, pon 0. Si una duracion no esta, asume 30 o 60.
      `;
    } else if (intencion === 'catalogo') {
      systemPrompt = CATALOGO_SYSTEM_PROMPT;
    } else if (intencion === 'factura_proveedor') {
      systemPrompt += `
      Extrae los productos o lineas de este albaran o factura de proveedor.
      Devuelve un JSON con esta estructura exacta:
      {
        "lineas": [{ "nombre": "string", "sku": "string o vacio", "cantidad": "number", "precio_coste": "number" }]
      }
      Ignora impuestos, centrate en el precio unitario sin IVA si es posible, o el que este claro.
      `;
    } else {
      return json({ error: 'Intencion no soportada' }, 400);
    }

    const messages: unknown[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (mimeType.startsWith('image/')) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: intencion === 'catalogo'
              ? 'Esta es una foto de la lista de precios / carta de servicios de un salón de belleza o peluquería. Extrae TODOS los servicios, precios, duraciones y categorías que puedas ver. No omitas ninguno. Devuelve el JSON según las instrucciones.'
              : 'Extrae la informacion de esta imagen segun las instrucciones.',
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
        content: intencion === 'catalogo'
          ? `A continuación está el texto extraído de un documento de tarifas/servicios de un salón de belleza o peluquería. Extrae TODOS los servicios con su precio, duración y categoría. El texto puede venir de un DOCX, Excel, CSV, PDF o texto plano — interpreta el formato que sea. NO omitas ningún servicio.\n\n---\n${content}\n---`
          : `Extrae la informacion de este texto/CSV segun las instrucciones:\n\n${content}`,
      });
    }

    // Llamada con reintentos
    const rawOutput = await callLLMWithRetry(messages);

    // Extracción robusta de JSON (soporta fences, texto extra, etc.)
    const parsed = extractJson(rawOutput);

    // Validación mínima para catálogo: si devolvió servicios, ok; si no, error descriptivo
    if (intencion === 'catalogo') {
      const data = parsed as Record<string, unknown>;
      if (!data.servicios || !Array.isArray(data.servicios)) {
        return json({
          ok: false,
          error: 'El LLM no devolvió una lista de servicios válida. Respuesta recibida: ' +
                 JSON.stringify(parsed).substring(0, 200),
        }, 200); // 200 para que el cliente pueda caer al fallback local
      }
      if (data.servicios.length === 0) {
        return json({
          ok: false,
          error: 'El LLM no encontró ningún servicio en el documento.',
        }, 200);
      }
    }

    return json({ ok: true, data: parsed });

  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
