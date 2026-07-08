// Hook para llamar a Chispa (edge agenda-asistente) desde cualquier superficie
// y obtener sugerencias borrador que el usuario puede editar y confirmar.
// Usa el mismo edge que el panel conversacional pero con un prompt especifico.
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';

export type ResultadoChispa = { ok: true; bloques: Bloque[] } | { ok: false; error: string };

// Invoca el edge agenda-asistente y normaliza la respuesta a bloques tipados.
// Funcion pura (no-hook) para que otros hooks (p.ej. useAyudaIA, Sesion 4 del
// plan V2) reutilicen la MISMA logica de llamada sin duplicarla.
export async function invocarChispa(prompt: string, contexto?: Record<string, unknown>): Promise<ResultadoChispa> {
  try {
    const { data, error } = await supabase.functions.invoke('agenda-asistente', {
      body: {
        mensajes: [{ role: 'user', content: prompt }],
        contexto, // opcional: datos adicionales de la superficie
      },
    });
    if (error || !data) {
      return { ok: false, error: error?.message || 'Error al conectar con Chispa' };
    }
    return { ok: true, bloques: normalizarRespuesta(data) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

interface SugerenciaChispa {
  loading: boolean;
  error: string | null;
  generar: (prompt: string, contexto?: Record<string, unknown>) => Promise<string | null>;
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

  const generar = useCallback(async (prompt: string, contexto?: Record<string, unknown>): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await invocarChispa(prompt, contexto);
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
