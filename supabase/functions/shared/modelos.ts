// supabase/functions/shared/modelos.ts
//
// FUENTE UNICA DE VERDAD de los modelos de IA de Mecha.
// Todo id, capacidad y precio de este fichero esta VERIFICADO contra
// https://openrouter.ai/api/v1/models (comprobado el 20 ago 2026).
//
// Regla de oro: NUNCA anadir un modelo "de memoria". Antes de tocar este fichero:
//   curl -s https://openrouter.ai/api/v1/models | node scripts/verificar-modelos.mjs
// Un id inventado no rompe nada de forma visible: la cascada se lo salta en
// silencio y acabas pagando el modelo caro creyendo que usas el barato.
//
// Sobre `:batch`: OpenRouter expone variantes `:batch` a mitad de precio, pero se
// consumen por la ruta asincrona POST /api/beta/batches (con sondeo, SLA de horas),
// NO por /v1/chat/completions. Por eso NO estan en ninguna cadena sincrona: se
// dejan en la tabla de precios para cuando exista un proceso offline que las use.

export type Modalidad = 'texto' | 'imagen' | 'archivo' | 'audio' | 'video';

export interface ModeloIA {
  /** id exacto de OpenRouter */
  id: string;
  /** proveedor real detras del modelo (para diversificar la cascada) */
  proveedor: 'google' | 'alibaba' | 'openai' | 'mistral' | 'anthropic';
  /** ventana de contexto en tokens */
  contexto: number;
  /** modalidades de ENTRADA que acepta */
  entrada: Modalidad[];
  /** soporta tool calling */
  tools: boolean;
  /** soporta response_format: json_object */
  json: boolean;
  /** acepta el parametro temperature (las variantes :batch no) */
  temperatura: boolean;
  /** USD por 1M tokens de entrada */
  precioIn: number;
  /** USD por 1M tokens de salida */
  precioOut: number;
  /** false = solo esta aqui para tarifar historico, no se usa en cascadas */
  activo: boolean;
}

export const CATALOGO: ModeloIA[] = [
  // ── Cascada viva ─────────────────────────────────────────────────────────
  {
    id: 'google/gemini-3.7-flash',
    proveedor: 'google',
    contexto: 1_048_576,
    entrada: ['texto', 'imagen', 'video', 'archivo', 'audio'],
    tools: true, json: true, temperatura: true,
    precioIn: 0.375, precioOut: 1.875,
    activo: true,
  },
  {
    id: 'qwen/qwen3.7-flash',
    proveedor: 'alibaba',
    contexto: 1_000_000,
    entrada: ['texto', 'imagen', 'video'],
    tools: true, json: true, temperatura: true,
    precioIn: 0.03, precioOut: 0.13,
    activo: true,
  },
  {
    id: 'openai/gpt-4.1-mini',
    proveedor: 'openai',
    contexto: 1_047_576,
    entrada: ['texto', 'imagen', 'archivo'],
    tools: true, json: true, temperatura: true,
    precioIn: 0.40, precioOut: 1.60,
    activo: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    proveedor: 'google',
    contexto: 1_048_576,
    entrada: ['texto', 'imagen', 'archivo', 'audio', 'video'],
    tools: true, json: true, temperatura: true,
    precioIn: 0.30, precioOut: 2.50,
    activo: true,
  },
  {
    id: 'mistralai/mistral-medium-3.1',
    proveedor: 'mistral',
    contexto: 131_072,
    entrada: ['texto', 'imagen', 'archivo'],
    tools: true, json: true, temperatura: true,
    precioIn: 0.40, precioOut: 2.00,
    activo: true,
  },

  // ── Solo tarifas (historico / rutas batch) ───────────────────────────────
  {
    id: 'google/gemini-3.7-flash:batch',
    proveedor: 'google',
    contexto: 1_048_576,
    entrada: ['texto', 'imagen', 'video', 'archivo', 'audio'],
    tools: true, json: true, temperatura: false,
    precioIn: 0.1875, precioOut: 0.9375,
    activo: false,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    proveedor: 'anthropic',
    contexto: 200_000,
    entrada: ['texto', 'imagen', 'archivo'],
    tools: true, json: true, temperatura: true,
    precioIn: 1.00, precioOut: 5.00,
    activo: false,
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    proveedor: 'anthropic',
    contexto: 1_000_000,
    entrada: ['texto', 'imagen', 'archivo'],
    tools: true, json: true, temperatura: true,
    precioIn: 3.00, precioOut: 15.00,
    activo: false,
  },
  {
    id: 'openai/gpt-4o',
    proveedor: 'openai',
    contexto: 128_000,
    entrada: ['texto', 'imagen', 'archivo'],
    tools: true, json: true, temperatura: true,
    precioIn: 2.50, precioOut: 10.00,
    activo: false,
  },
];

const PORaID = new Map(CATALOGO.map((m) => [m.id, m]));

export function modeloPorId(id: string): ModeloIA | undefined {
  return PORaID.get(id);
}

export interface RequisitosCadena {
  /** modalidades que la peticion va a enviar (ademas de texto) */
  modalidades?: Modalidad[];
  /** la peticion usa tool calling */
  tools?: boolean;
  /** la peticion pide JSON estricto */
  json?: boolean;
  /** tokens de entrada estimados: descarta modelos que no quepan */
  contextoMinimo?: number;
  /**
   * 'calidad'  -> el mejor primero (por defecto; chat en vivo, vision fina)
   * 'economico'-> el mas barato primero (lotes, tareas de fondo)
   */
  perfil?: 'calidad' | 'economico';
}

/**
 * Construye la cascada de modelos para una peticion concreta.
 *
 * Filtra por capacidad REAL: si la peticion lleva un PDF, los modelos sin
 * modalidad `archivo` ni se intentan (antes se intentaban y devolvian 400 tras
 * gastar una llamada y ~2 s de latencia).
 *
 * Orden en 'calidad': se respeta el orden del catalogo (que va de mas capaz a
 * menos) pero se penaliza repetir proveedor, para que el primer fallback nunca
 * sea del mismo sitio que acaba de fallar.
 */
export function construirCadena(req: RequisitosCadena = {}): string[] {
  const modalidades = req.modalidades ?? [];
  const candidatos = CATALOGO.filter((m) => {
    if (!m.activo) return false;
    if (req.tools && !m.tools) return false;
    if (req.json && !m.json) return false;
    if (req.contextoMinimo && m.contexto < req.contextoMinimo) return false;
    return modalidades.every((mod) => m.entrada.includes(mod));
  });

  if (req.perfil === 'economico') {
    return candidatos
      .slice()
      .sort((a, b) => a.precioIn + a.precioOut - (b.precioIn + b.precioOut))
      .map((m) => m.id);
  }

  // Calidad: primero el orden del catalogo, luego intercalando proveedores.
  const ordenados: ModeloIA[] = [];
  const pendientes = candidatos.slice();
  const vistos = new Set<string>();
  while (pendientes.length > 0) {
    let idx = pendientes.findIndex((m) => !vistos.has(m.proveedor));
    if (idx === -1) {
      idx = 0;
      vistos.clear();
    }
    const [elegido] = pendientes.splice(idx, 1);
    vistos.add(elegido.proveedor);
    ordenados.push(elegido);
  }
  return ordenados.map((m) => m.id);
}

/** Coste en USD de una ejecucion. Modelo desconocido -> estimacion prudente (alta). */
export function calcularCoste(modeloId: string, tokensIn: number, tokensOut: number): number {
  const m = PORaID.get(modeloId);
  const precioIn = m?.precioIn ?? 1.0;
  const precioOut = m?.precioOut ?? 5.0;
  return (tokensIn / 1_000_000) * precioIn + (tokensOut / 1_000_000) * precioOut;
}
