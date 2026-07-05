// Protocolo de "bloques tipados" de Chispa (la capa de IA transversal de Mecha).
//
// El edge (supabase/functions/agenda-asistente) devuelve una lista de bloques
// tipados en vez de texto plano. El renderer unico (components/chispa/
// BloqueRenderer.web.tsx) mapea cada tipo a un componente reutilizando lo que
// ya existe. El union type se deja EXTENSIBLE a proposito: 'grafica',
// 'comparativa', 'lista_clientes', etc. llegan en sesiones posteriores del plan
// de IA (informes/PLAN-IA-CHISPA.md) sin romper este contrato.
//
// PR-12: las escrituras nunca las ejecuta el LLM. El bloque 'accion' es una
// PROPUESTA que el profesional confirma; la ejecucion vive en lib/agendaOps.ts.

import type { AccionPropuesta } from '@/lib/agendaOps';

// Allowlist de rutas para los bloques 'enlace'. El LLM no inventa rutas: elige
// una CLAVE de este mapa y el edge la valida contra el antes de emitir el
// bloque. Asi un enlace nunca navega a una ruta inexistente. Deben coincidir
// con las rutas reales de app/(tabs).
export const CHISPA_RUTAS: Record<string, { ruta: string; label: string }> = {
  agenda: { ruta: '/(tabs)', label: 'Ir a la agenda' },
  clientes: { ruta: '/(tabs)/clientes', label: 'Ver clientes' },
  caja: { ruta: '/(tabs)/caja', label: 'Ir a Caja' },
  informes: { ruta: '/(tabs)/informes', label: 'Ver informes' },
  equipo: { ruta: '/(tabs)/equipo', label: 'Ir a Equipo' },
  configuracion: { ruta: '/(tabs)/configuracion', label: 'Abrir Configuracion' },
  'lista-espera': { ruta: '/(tabs)/lista-espera', label: 'Ver lista de espera' },
  presupuestos: { ruta: '/(tabs)/presupuestos', label: 'Ver presupuestos' },
  resenas: { ruta: '/(tabs)/resenas', label: 'Ver resenas' },
  bandeja: { ruta: '/(tabs)/bandeja', label: 'Abrir bandeja' },
  inventario: { ruta: '/(tabs)/inventario', label: 'Ver inventario' },
  'mi-jornada': { ruta: '/(tabs)/mi-jornada', label: 'Ver Mi Jornada' },
};

export type ChispaRutaKey = keyof typeof CHISPA_RUTAS;

// Bloque tipado. Union EXTENSIBLE: anadir nuevos tipos aqui + su caso en
// BloqueRenderer, sin tocar el resto del flujo.
export type Bloque =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'enlace'; ruta: string; label: string; descripcion?: string }
  | { tipo: 'accion'; accion: AccionPropuesta };

export interface ChispaRespuesta {
  bloques: Bloque[];
  // El edge puede devolver ademas un error de nivel superior (auth, etc.).
  error?: string;
}

// Compatibilidad hacia atras: si llega la forma antigua { texto, accion_propuesta }
// (edge no redeplegado o respuesta cacheada), la convierte a bloques. Cualquier
// respuesta ya en formato { bloques } se devuelve tal cual.
export function normalizarRespuesta(data: unknown): Bloque[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as {
    bloques?: unknown;
    texto?: unknown;
    accion_propuesta?: unknown;
  };

  if (Array.isArray(d.bloques)) {
    return d.bloques.filter((b): b is Bloque => !!b && typeof b === 'object' && 'tipo' in b);
  }

  const bloques: Bloque[] = [];
  if (typeof d.texto === 'string' && d.texto.trim()) {
    bloques.push({ tipo: 'texto', texto: d.texto });
  }
  if (d.accion_propuesta && typeof d.accion_propuesta === 'object') {
    bloques.push({ tipo: 'accion', accion: d.accion_propuesta as AccionPropuesta });
  }
  return bloques;
}
