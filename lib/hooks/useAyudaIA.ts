// Patron reutilizable "IA proactiva por pagina" (Sesion 4, PLAN-IA-CHISPA-V2-REDISENO.md).
// A diferencia de useChispaSugerencia (que solo devuelve un borrador de texto
// suelto), este hook expone un ESTADO EXPLICITO por el que toda superficie de
// IA por pagina debe pasar: idle -> cargando -> vacio | error | listo. Asi
// "PROHIBIDOS los fallos silenciosos" es real: nunca hay un cargando() que no
// resuelva en algo visible. Ver informes/PATRON-IA-POR-PAGINA.md.
import { useCallback, useRef, useState } from 'react';
import { invocarChispa, type OpcionesChispa } from '@/lib/hooks/useChispaSugerencia';
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
  // opts por defecto: tarea:'lectura' (las tarjetas de IA por pagina son analisis).
  analizar: (prompt: string, contexto?: Record<string, unknown>, opts?: OpcionesChispa) => Promise<void>;
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
  const ultima = useRef<{ prompt: string; contexto?: Record<string, unknown>; opts?: OpcionesChispa } | null>(null);

  const analizar = useCallback(async (prompt: string, contexto?: Record<string, unknown>, opts?: OpcionesChispa) => {
    // Default 'lectura': las tarjetas de IA por pagina son analisis (modelo barato).
    const opciones: OpcionesChispa = { tarea: 'lectura', ...opts };
    ultima.current = { prompt, contexto, opts: opciones };
    setEstado({ tipo: 'cargando' });

    const res = await invocarChispa(prompt, contexto, opciones);
    if (!res.ok) {
      setEstado({ tipo: 'error', mensaje: mensajeDeError({ message: res.error }, 'Chispa no ha podido analizarlo ahora mismo.') });
      return;
    }
    setEstado(hayContenidoUtil(res.bloques) ? { tipo: 'listo', bloques: res.bloques } : { tipo: 'vacio' });
  }, []);

  const reintentar = useCallback(() => {
    if (ultima.current) analizar(ultima.current.prompt, ultima.current.contexto, ultima.current.opts);
  }, [analizar]);

  const reset = useCallback(() => setEstado({ tipo: 'idle' }), []);

  return { estado, analizar, reintentar, reset };
}
