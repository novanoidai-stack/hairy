// Patron reutilizable "IA proactiva por pagina" (Sesion 4, PLAN-IA-CHISPA-V2-REDISENO.md).
// A diferencia de useChispaSugerencia (que solo devuelve un borrador de texto
// suelto), este hook expone un ESTADO EXPLICITO por el que toda superficie de
// IA por pagina debe pasar: idle -> cargando -> vacio | error | listo. Asi
// "PROHIBIDOS los fallos silenciosos" es real: nunca hay un cargando() que no
// resuelva en algo visible. Ver informes/PATRON-IA-POR-PAGINA.md.
import { useCallback, useRef, useState } from 'react';
import { invocarChispa } from '@/lib/hooks/useChispaSugerencia';
import { mensajeDeError } from '@/lib/errores';
import type { Bloque } from '@/lib/chispaBloques';

export type EstadoAyudaIA =
  | { tipo: 'idle' }
  | { tipo: 'cargando' }
  | { tipo: 'vacio' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; bloques: Bloque[] };

export interface AyudaIA {
  estado: EstadoAyudaIA;
  // Lanza (o relanza) el analisis con un prompt nuevo. Recuerda los argumentos
  // para que reintentar() pueda repetir exactamente la misma peticion.
  analizar: (prompt: string, contexto?: Record<string, unknown>) => Promise<void>;
  // Repite la ultima llamada a analizar() tal cual (mismo prompt/contexto).
  reintentar: () => void;
  reset: () => void;
}

// Un bloque 'texto' vacio (o solo espacios) no cuenta como contenido util; el
// resto de tipos (accion/enlace/grafica/comparativa/formulario/opciones/
// progreso) siempre cuentan como algo que mostrar.
function hayContenidoUtil(bloques: Bloque[]): boolean {
  return bloques.some((b) => (b.tipo === 'texto' ? b.texto.trim().length > 0 : true));
}

export function useAyudaIA(): AyudaIA {
  const [estado, setEstado] = useState<EstadoAyudaIA>({ tipo: 'idle' });
  const ultima = useRef<{ prompt: string; contexto?: Record<string, unknown> } | null>(null);

  const analizar = useCallback(async (prompt: string, contexto?: Record<string, unknown>) => {
    ultima.current = { prompt, contexto };
    setEstado({ tipo: 'cargando' });

    const res = await invocarChispa(prompt, contexto);
    if (!res.ok) {
      setEstado({ tipo: 'error', mensaje: mensajeDeError({ message: res.error }, 'Chispa no ha podido analizarlo ahora mismo.') });
      return;
    }
    setEstado(hayContenidoUtil(res.bloques) ? { tipo: 'listo', bloques: res.bloques } : { tipo: 'vacio' });
  }, []);

  const reintentar = useCallback(() => {
    if (ultima.current) analizar(ultima.current.prompt, ultima.current.contexto);
  }, [analizar]);

  const reset = useCallback(() => setEstado({ tipo: 'idle' }), []);

  return { estado, analizar, reintentar, reset };
}
