// Hook para llamar a Chispa (edge agenda-asistente) desde cualquier superficie
// y obtener sugerencias borrador que el usuario puede editar y confirmar.
// Usa el mismo edge que el panel conversacional pero con un prompt especifico.
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarRespuesta, type Bloque } from '@/lib/chispaBloques';

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
      const { data, error: err } = await supabase.functions.invoke('agenda-asistente', {
        body: {
          mensajes: [{ role: 'user', content: prompt }],
          contexto, // opcional: datos adicionales de la superficie
        },
      });

      if (err || !data) {
        setError(err?.message || 'Error al conectar con Chispa');
        return null;
      }

      const bloques = normalizarRespuesta(data);
      // Extraer solo los bloques de texto (ignorar acciones, enlaces, etc.)
      const textos = bloques
        .filter((b): b is Extract<Bloque, { tipo: 'texto' }> => b.tipo === 'texto')
        .map((b) => b.texto)
        .join('\n\n');

      return textos || null;
    } catch (e) {
      setError(String(e));
      return null;
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
