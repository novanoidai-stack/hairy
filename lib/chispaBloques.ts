// Protocolo de "bloques tipados" de Chispa (la capa de IA transversal de Mecha).
//
// El edge (supabase/functions/agenda-asistente) devuelve una lista de bloques
// tipados en vez de texto plano. El renderer unico (components/chispa/
// BloqueRenderer.web.tsx) mapea cada tipo a un componente reutilizando lo que
// ya existe. El union type se deja EXTENSIBLE a proposito: 'lista_clientes',
// etc. pueden llegar en sesiones posteriores del plan de IA
// (informes/PLAN-IA-CHISPA.md) sin romper este contrato.
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
// Unidad de un valor numerico de 'grafica'/'comparativa': determina formato y color.
export type ChispaUnidad = 'eur' | 'citas' | 'pct';

// Tipo de campo de un bloque 'formulario'. Determina que control se renderiza
// (ver CampoControl en BloqueRenderer.web.tsx).
export type CampoFormularioTipo = 'texto' | 'numero' | 'euro' | 'tel' | 'hora' | 'select';

export interface CampoFormulario {
  key: string;
  label: string;
  tipo: CampoFormularioTipo;
  // Solo si tipo === 'select'.
  opciones?: { valor: string; label: string }[];
  // Valor por el que el LLM puede pre-rellenar el campo (el usuario lo puede editar).
  valor?: string | number;
  requerido?: boolean;
}

export type Bloque =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'enlace'; ruta: string; label: string; descripcion?: string }
  | { tipo: 'accion'; accion: AccionPropuesta }
  // Serie temporal calculada server-side (nunca inventada por el LLM). 'fecha'
  // viaja como YYYY-MM-DD (cruza el limite JSON del edge).
  | { tipo: 'grafica'; titulo: string; unidad: ChispaUnidad; serie: { fecha: string; valor: number }[] }
  // Dos cifras reales (periodo actual vs anterior equivalente) calculadas server-side.
  | {
      tipo: 'comparativa';
      titulo: string;
      unidad: ChispaUnidad;
      actual: { label: string; valor: number };
      anterior: { label: string; valor: number };
    }
  // Bloques de ENTRADA (Sesion 1 del plan V2): recogen datos sin que el usuario
  // tenga que escribirlos en texto libre. Al enviar/elegir, el panel llama a
  // onRespuestaInteractiva(bloque, payload) y lo convierte en el siguiente turno.
  // 'formulario': payload = Record<clave_del_campo, valor>.
  | { tipo: 'formulario'; id: string; titulo: string; campos: CampoFormulario[]; enviarLabel?: string }
  // 'opciones': payload = string[] (los 'valor' elegidos; un solo elemento si multiple es false/ausente).
  | {
      tipo: 'opciones';
      id: string;
      titulo?: string;
      opciones: { valor: string; label: string; descripcion?: string }[];
      multiple?: boolean;
    }
  // Indicador de paso dentro de un flujo guiado (config guiada, Sesion 2+). No es interactivo.
  | { tipo: 'progreso'; paso: number; total: number; etiqueta?: string };

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
