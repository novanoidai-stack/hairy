// Hook para llamar a Chispa (edge agenda-asistente) desde cualquier superficie
// y obtener sugerencias borrador que el usuario puede editar y confirmar.
// Usa el mismo edge que el panel conversacional pero con un prompt especifico.
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';
import { estructurarBloques } from '@/lib/chispaEstructura';

export type ResultadoChispa = { ok: true; bloques: Bloque[] } | { ok: false; error: string };

// Ruteo del rework KISS: la superficie declara si su peticion es de LECTURA
// (modelo barato) o de ACCION (Haiku) y en QUE superficie esta (acota que tools
// de escritura se ofrecen). Por defecto el edge asume 'auto'/'chat'.
export type OpcionesChispa = { tarea?: 'lectura' | 'accion' | 'auto'; superficie?: string };

// El "error.message" que da supabase-js para un non-2xx es SIEMPRE el mismo
// texto generico ("Edge Function returned a non-2xx status code"), aunque
// agenda-asistente ya manda un {error, codigo} en el cuerpo JSON explicando
// que paso de verdad (addon sin activar, excepcion concreta...). El body va
// en error.context (la Response cruda, todavia sin leer) - si no se lee ahi,
// se pierde y en la UI/log solo queda un "Sin codigo" inservible.
async function mensajeRealDeError(error: unknown): Promise<string> {
  const err = error as { message?: string; context?: unknown } | null | undefined;
  const ctx = err?.context as { json?: () => Promise<unknown> } | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Cuerpo no era JSON (relay error, HTML de un timeout de proxy...): se
      // sigue con el mensaje generico de abajo en vez de romper.
    }
  }
  return err?.message || 'Error al conectar con Chispa';
}

// Un fallo de red o un 5xx puntual (cold start, blip del proveedor de IA
// detras de OpenRouter) no deberia obligar a la persona a darse cuenta y
// pulsar "Reintentar" a mano: se reintenta una vez en silencio. Los 4xx
// (401/402/403/405 - sin sesion, addon no activo, metodo invalido...) NO se
// reintentan: van a fallar exactamente igual y solo gastan tiempo y tokens.
function esReintentable(error: unknown): boolean {
  const err = error as { name?: string; context?: { status?: number } } | null | undefined;
  if (!err) return false;
  if (err.name === 'FunctionsFetchError' || err.name === 'FunctionsRelayError') return true;
  const status = err.context?.status;
  return typeof status === 'number' && status >= 500;
}

type ResultadoInterno = { ok: true; bloques: Bloque[] } | { ok: false; rawError: unknown };

async function invocarChispaUnaVez(
  prompt: string,
  contexto?: Record<string, unknown>,
  opts?: OpcionesChispa,
): Promise<ResultadoInterno> {
  const { data, error } = await supabase.functions.invoke('agenda-asistente', {
    body: {
      mensajes: [{ role: 'user', content: prompt }],
      contexto, // opcional: datos adicionales de la superficie
      ...(opts?.tarea ? { tarea: opts.tarea } : {}),
      ...(opts?.superficie ? { superficie: opts.superficie } : {}),
    },
  });
  if (error || !data) return { ok: false, rawError: error };
  return { ok: true, bloques: estructurarBloques(normalizarRespuesta(data)) };
}

// Invoca el edge agenda-asistente y normaliza la respuesta a bloques tipados.
// Funcion pura (no-hook) para que otros hooks (p.ej. useAyudaIA, Sesion 4 del
// plan V2) reutilicen la MISMA logica de llamada sin duplicarla.
export async function invocarChispa(
  prompt: string,
  contexto?: Record<string, unknown>,
  opts?: OpcionesChispa,
): Promise<ResultadoChispa> {
  try {
    let res = await invocarChispaUnaVez(prompt, contexto, opts);
    if (!res.ok && esReintentable(res.rawError)) {
      res = await invocarChispaUnaVez(prompt, contexto, opts);
    }
    if (!res.ok) return { ok: false, error: await mensajeRealDeError(res.rawError) };
    return res;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface SugerenciaChispa {
  loading: boolean;
  error: string | null;
  generar: (prompt: string, contexto?: Record<string, unknown>, opts?: OpcionesChispa) => Promise<string | null>;
  reset: () => void;
  cargando: boolean;
  limpiar: () => void;
  bloques: Bloque[];
}

// Hook para generar sugerencias de Chispa (borradores editables)
export function useChispaSugerencia(): SugerenciaChispa {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloques, setBloques] = useState<Bloque[]>([]);

  const generar = useCallback(async (prompt: string, contexto?: Record<string, unknown>, opts?: OpcionesChispa): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await invocarChispa(prompt, contexto, opts);
      if (!res.ok) {
        setError(res.error);
        return null;
      }

      // Bug corregido (Sesion 4 V2): antes se calculaba `bloques` en una const
      // local que tapaba el estado del mismo nombre y nunca se llamaba a
      // setBloques, asi que el `bloques` devuelto por el hook se quedaba
      // siempre en [] (Equipo/Inventario/Presupuestos nunca mostraban nada).
      setBloques(res.bloques);

      // Extraer solo los bloques de texto (ignorar acciones, enlaces, etc.)
      const textos = res.bloques
        .filter((b): b is Extract<Bloque, { tipo: 'texto' }> => b.tipo === 'texto')
        .map((b) => b.texto)
        .join('\n\n');

      return textos || null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setBloques([]);
  }, []);

  return { loading, cargando: loading, error, generar, reset, limpiar: reset, bloques };
}
