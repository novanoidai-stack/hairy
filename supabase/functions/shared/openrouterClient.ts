// supabase/functions/shared/openrouterClient.ts
//
// UNICA puerta de entrada a OpenRouter en todo Mecha. Ninguna edge function
// deberia volver a hacer `fetch` a openrouter.ai por su cuenta: cuando cada una
// tenia su propia cascada inline, tres de ellas apuntaban a modelos que ya no
// existian y nadie se enteraba (el fallback lo tapaba).
//
// Que aporta sobre un fetch pelado:
//  - Cascada por CAPACIDAD (ver modelos.ts): si mandas un PDF, solo se intentan
//    modelos que aceptan archivos; si usas tools, solo los que soportan tools.
//  - Solo envia los parametros que el modelo declara soportar (p. ej. las
//    variantes :batch no aceptan `temperature` y devuelven 400).
//  - Timeout duro por intento (sin el, una edge se queda colgada hasta el limite
//    de la plataforma y el usuario ve una rueda infinita).
//  - Reintentos con backoff + jitter solo en errores transitorios (429/5xx).
//    Un 404 "modelo retirado" salta al siguiente modelo sin reintentar.
//  - Tope de tamano de entrada: sin el, cualquier cuenta puede subir ficheros
//    enormes en bucle contra una ventana de 1M tokens. Eso es dinero real.
//  - Devuelve SIEMPRE que modelo respondio y cuanto costo, para auditar.

import { CATALOGO, calcularCoste, construirCadena, modeloPorId, type Modalidad } from './modelos.ts';

// Se reexporta para que las funciones declaren sus modalidades importando de un
// unico sitio (este) en vez de tener que conocer modelos.ts.
export type { Modalidad };

export type Rol = 'system' | 'user' | 'assistant' | 'tool';

export interface ParteContenido {
  type: 'text' | 'image_url' | 'file';
  text?: string;
  image_url?: { url: string; detail?: string };
  file?: { filename: string; file_data: string };
}

export interface MensajeIA {
  role: Rol;
  content?: string | ParteContenido[];
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

export interface OpcionesIA {
  /** nombre de la funcion, para logs y auditoria. Ej: 'migracion-magica' */
  funcion: string;
  mensajes: MensajeIA[];
  /** modalidades no textuales presentes en los mensajes */
  modalidades?: Modalidad[];
  tools?: unknown[];
  toolChoice?: unknown;
  /** fuerza JSON estricto */
  json?: boolean;
  maxTokens?: number;
  temperatura?: number;
  perfil?: 'calidad' | 'economico';
  /** cadena explicita; si se omite se calcula por capacidades */
  cadena?: string[];
  timeoutMs?: number;
  /** tope de caracteres de entrada. Por defecto TOPE_ENTRADA_CHARS */
  topeEntradaChars?: number;
}

export interface ResultadoIA {
  texto: string;
  toolCalls?: any[];
  /** modelo que REALMENTE respondio (no el que creias que ibas a usar) */
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  costeUsd: number;
  latenciaMs: number;
  /** modelos que fallaron antes de este, con el motivo */
  intentosFallidos: { modelo: string; motivo: string }[];
}

/** ~4 chars por token: 3M chars ~ 750k tokens. Muy por encima de un uso legitimo. */
export const TOPE_ENTRADA_CHARS = 3_000_000;
const TIMEOUT_POR_DEFECTO_MS = 90_000;
const MAX_REINTENTOS_TRANSITORIOS = 2;

export class ErrorIA extends Error {
  constructor(
    message: string,
    readonly codigo: 'entrada_demasiado_grande' | 'sin_modelos' | 'todos_fallaron' | 'sin_api_key',
    readonly detalle?: unknown,
  ) {
    super(message);
    this.name = 'ErrorIA';
  }
}

// ─── Constructores de partes multimodales ──────────────────────────────────

/** Imagen desde base64 crudo o desde una data URL ya montada. */
export function parteImagen(base64ODataUrl: string, mimeType = 'image/jpeg'): ParteContenido {
  const url = base64ODataUrl.startsWith('data:')
    ? base64ODataUrl
    : `data:${mimeType};base64,${base64ODataUrl}`;
  return { type: 'image_url', image_url: { url } };
}

/**
 * Documento (PDF y similares). OJO: un PDF NO va como image_url.
 * OpenRouter espera una parte `file` con el base64 en una data URL.
 * Mandarlo como texto plano (el bug anterior) inyectaba megas de base64 en el
 * prompt: salida basura y factura real.
 */
export function parteArchivo(nombre: string, base64ODataUrl: string, mimeType = 'application/pdf'): ParteContenido {
  const dataUrl = base64ODataUrl.startsWith('data:')
    ? base64ODataUrl
    : `data:${mimeType};base64,${base64ODataUrl}`;
  return { type: 'file', file: { filename: nombre, file_data: dataUrl } };
}

export function parteTexto(text: string): ParteContenido {
  return { type: 'text', text };
}

// ─── Utilidades ────────────────────────────────────────────────────────────

/** Extrae JSON aunque venga en ```json ... ```, con preambulo o con cola. */
export function extraerJson<T = unknown>(raw: string): T {
  const intentar = (s: string): T | undefined => {
    try { return JSON.parse(s) as T; } catch { return undefined; }
  };

  const directo = intentar(raw.trim());
  if (directo !== undefined) return directo;

  const valla = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (valla) {
    const dentro = intentar(valla[1].trim());
    if (dentro !== undefined) return dentro;
  }

  const llave = raw.indexOf('{');
  const corchete = raw.indexOf('[');
  const inicio = llave >= 0 && (corchete < 0 || llave < corchete) ? llave : corchete;
  if (inicio >= 0) {
    const cierre = raw[inicio] === '{' ? '}' : ']';
    const fin = raw.lastIndexOf(cierre);
    if (fin > inicio) {
      const recortado = intentar(raw.substring(inicio, fin + 1));
      if (recortado !== undefined) return recortado;
    }
  }

  throw new Error('El modelo no devolvio JSON valido');
}

function tamanoEntrada(mensajes: MensajeIA[]): number {
  let total = 0;
  for (const m of mensajes) {
    if (typeof m.content === 'string') { total += m.content.length; continue; }
    for (const parte of m.content ?? []) {
      total += parte.text?.length ?? 0;
      total += parte.image_url?.url.length ?? 0;
      total += parte.file?.file_data.length ?? 0;
    }
  }
  return total;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 404 / modelo retirado / modalidad no soportada: no tiene sentido reintentar. */
function esFalloDeModelo(status: number, cuerpo: string): boolean {
  if (status === 404) return true;
  const t = cuerpo.toLowerCase();
  return (
    t.includes('no endpoints found') ||
    t.includes('model_not_found') ||
    t.includes('is not a valid model') ||
    t.includes('does not support') ||
    t.includes('no allowed providers')
  );
}

function esTransitorio(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

// ─── Llamada principal ─────────────────────────────────────────────────────

export async function llamarIA(apiKey: string, opciones: OpcionesIA): Promise<ResultadoIA> {
  if (!apiKey) throw new ErrorIA('Falta OPENROUTER_API_KEY', 'sin_api_key');

  const tope = opciones.topeEntradaChars ?? TOPE_ENTRADA_CHARS;
  const tam = tamanoEntrada(opciones.mensajes);
  if (tam > tope) {
    throw new ErrorIA(
      `La entrada es demasiado grande (${Math.round(tam / 1024)} KB). Divide el documento en partes mas pequenas.`,
      'entrada_demasiado_grande',
      { chars: tam, tope },
    );
  }

  const cadena = opciones.cadena ?? construirCadena({
    modalidades: opciones.modalidades,
    tools: Boolean(opciones.tools?.length),
    json: opciones.json,
    perfil: opciones.perfil,
  });

  if (cadena.length === 0) {
    throw new ErrorIA(
      'Ningun modelo del catalogo cumple los requisitos de esta peticion',
      'sin_modelos',
      { modalidades: opciones.modalidades, tools: Boolean(opciones.tools?.length) },
    );
  }

  const arranque = Date.now();
  const intentosFallidos: { modelo: string; motivo: string }[] = [];

  for (const modeloId of cadena) {
    const meta = modeloPorId(modeloId);

    for (let intento = 0; intento <= MAX_REINTENTOS_TRANSITORIOS; intento++) {
      const control = new AbortController();
      const corte = setTimeout(() => control.abort(), opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS);

      try {
        const cuerpo: Record<string, unknown> = {
          model: modeloId,
          messages: opciones.mensajes,
          max_tokens: opciones.maxTokens ?? 2048,
        };
        // Solo mandamos lo que el modelo declara soportar.
        if (meta?.temperatura !== false) cuerpo.temperature = opciones.temperatura ?? 0.2;
        if (opciones.json && meta?.json !== false) cuerpo.response_format = { type: 'json_object' };
        if (opciones.tools?.length) {
          cuerpo.tools = opciones.tools;
          cuerpo.tool_choice = opciones.toolChoice ?? 'auto';
        }

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: control.signal,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://www.mechaa.es',
            'X-Title': `Mecha ${opciones.funcion}`,
          },
          body: JSON.stringify(cuerpo),
        });

        if (!res.ok) {
          const txt = (await res.text()).slice(0, 500);
          if (esFalloDeModelo(res.status, txt)) {
            intentosFallidos.push({ modelo: modeloId, motivo: `no disponible (${res.status})` });
            console.warn(`[IA:${opciones.funcion}] ${modeloId} no disponible (${res.status}), siguiente modelo`);
            break;
          }
          if (esTransitorio(res.status) && intento < MAX_REINTENTOS_TRANSITORIOS) {
            const espera = 700 * 2 ** intento + Math.random() * 300;
            console.warn(`[IA:${opciones.funcion}] ${modeloId} ${res.status}, reintento en ${Math.round(espera)}ms`);
            await esperar(espera);
            continue;
          }
          intentosFallidos.push({ modelo: modeloId, motivo: `HTTP ${res.status}` });
          console.warn(`[IA:${opciones.funcion}] ${modeloId} fallo con ${res.status}: ${txt}`);
          break;
        }

        const json = await res.json();
        const mensaje = json?.choices?.[0]?.message;
        if (!mensaje) {
          intentosFallidos.push({ modelo: modeloId, motivo: 'respuesta sin mensaje' });
          break;
        }

        const tokensIn = json?.usage?.prompt_tokens ?? 0;
        const tokensOut = json?.usage?.completion_tokens ?? 0;

        return {
          texto: typeof mensaje.content === 'string' ? mensaje.content : '',
          toolCalls: mensaje.tool_calls,
          modelo: modeloId,
          tokensIn,
          tokensOut,
          costeUsd: calcularCoste(modeloId, tokensIn, tokensOut),
          latenciaMs: Date.now() - arranque,
          intentosFallidos,
        };
      } catch (err) {
        const abortado = (err as Error)?.name === 'AbortError';
        const motivo = abortado ? 'timeout' : String((err as Error)?.message ?? err);
        if (abortado || intento >= MAX_REINTENTOS_TRANSITORIOS) {
          intentosFallidos.push({ modelo: modeloId, motivo });
          console.warn(`[IA:${opciones.funcion}] ${modeloId}: ${motivo}`);
          break;
        }
        await esperar(700 * 2 ** intento + Math.random() * 300);
      } finally {
        clearTimeout(corte);
      }
    }
  }

  throw new ErrorIA(
    'Todos los modelos de IA fallaron. Reintenta en unos segundos.',
    'todos_fallaron',
    { cadena, intentosFallidos },
  );
}

/** Igual que llamarIA pero devuelve el JSON ya parseado y valida el tipo. */
export async function llamarIAJson<T = unknown>(
  apiKey: string,
  opciones: Omit<OpcionesIA, 'json'>,
): Promise<ResultadoIA & { datos: T }> {
  const r = await llamarIA(apiKey, { ...opciones, json: true });
  return { ...r, datos: extraerJson<T>(r.texto) };
}

/** Para diagnostico: que modelos activos hay y para que sirven. */
export function resumenCatalogo() {
  return CATALOGO.filter((m) => m.activo).map((m) => ({
    id: m.id,
    proveedor: m.proveedor,
    entrada: m.entrada,
    precio: `${m.precioIn}/${m.precioOut} USD por 1M`,
  }));
}
