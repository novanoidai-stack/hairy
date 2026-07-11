// Taxonomia compartida de Avisos: categorias, urgencia y utilidades de orden y
// tiempo. La usan las DOS superficies (campana web AvisosBell.web.tsx y hoja
// movil AvisosSheet.tsx) para que categorias, colores de urgencia y textos sean
// identicos en toda la app. El RENDER del icono es por plataforma (web = SVG
// inline; nativo = Ionicons por su nombre en CATEGORIA_META.ionicon).
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { Hallazgo } from '@/lib/hallazgos';

// Categorias en las que agrupamos TODOS los avisos del negocio. El icono + la
// etiqueta las distinguen; el color de cada fila lo marca la URGENCIA (abajo),
// no la categoria, para que el triaje visual sea por prioridad.
export type AvisoCategoria =
  | 'citas'        // citas sin confirmar
  | 'pagos'        // senales sin pagar
  | 'agenda'       // retrasos, solapes, huecos (familia operativa)
  | 'mensajes'     // bandeja sin responder
  | 'clientes'     // riesgo de fuga, cumpleanos, recuperar
  | 'inventario'   // stock bajo
  | 'presupuestos' // presupuestos sin respuesta
  | 'otros';       // resto de hallazgos de Chispa

export type AvisoUrgencia = 'urgente' | 'alta' | 'media' | 'baja';

// Un aviso normalizado: todo lo que una fila necesita para pintarse y navegar a
// resolverse, venga de la fuente que venga (cita, hallazgo, cumpleanos...).
export interface AvisoItem {
  id: string;
  categoria: AvisoCategoria;
  urgencia: AvisoUrgencia;
  titulo: string;
  subtitulo?: string;
  // Momento relevante del aviso (epoch ms): inicio de la cita / cumpleanos
  // (futuro) o creado_en del hallazgo (pasado). Sirve para el orden y el "cuando".
  ts: number;
  ruta: string;             // a donde navega al pulsarlo
  hallazgoId?: string;      // si es un hallazgo resoluble (resolver/descartar)
  meta?: string;            // etiqueta corta opcional (p.ej. "3 casos")
}

// Peso para ordenar por urgencia (mayor = mas arriba).
export const URGENCIA_PESO: Record<AvisoUrgencia, number> = {
  urgente: 3, alta: 2, media: 1, baja: 0,
};

// Color de cada urgencia (tokens de la paleta fuego/semantica). fg = acento de
// la fila (borde izquierdo + badge); bg = fondo suave del badge.
export function urgenciaColor(u: AvisoUrgencia): { fg: string; bg: string; label: string } {
  switch (u) {
    case 'urgente': return { fg: T.danger, bg: T.dangerSoft, label: 'Urgente' };
    case 'alta': return { fg: T.warning, bg: T.warningSoft, label: 'Alta' };
    case 'media': return { fg: T.cyan, bg: T.cyanSoft, label: 'Media' };
    default: return { fg: T.textTertiary, bg: T.bgCardHi, label: 'Baja' };
  }
}

export interface CategoriaMeta {
  label: string;
  // Nombre de icono Ionicons (hoja movil). El web usa su propio SVG por clave.
  ionicon: string;
  // Tinte del icono de categoria (los colores de fila los da la urgencia).
  tint: string;
}

export const CATEGORIA_META: Record<AvisoCategoria, CategoriaMeta> = {
  citas:        { label: 'Citas',        ionicon: 'calendar-outline',      tint: T.primary },
  pagos:        { label: 'Señales',      ionicon: 'card-outline',          tint: T.warning },
  agenda:       { label: 'Agenda',       ionicon: 'time-outline',          tint: T.primaryHi },
  mensajes:     { label: 'Mensajes',     ionicon: 'mail-outline',          tint: T.cyan },
  clientes:     { label: 'Clientas',     ionicon: 'people-outline',        tint: T.rose },
  inventario:   { label: 'Inventario',   ionicon: 'cube-outline',          tint: T.warning },
  presupuestos: { label: 'Presupuestos', ionicon: 'document-text-outline', tint: T.cyan },
  otros:        { label: 'Otros',        ionicon: 'sparkles-outline',      tint: T.textTertiary },
};

// Orden de aparicion de los chips de categoria (los vacios se ocultan en la UI).
export const CATEGORIA_ORDEN: AvisoCategoria[] = [
  'citas', 'pagos', 'agenda', 'mensajes', 'clientes', 'inventario', 'presupuestos', 'otros',
];

// Mapea un hallazgo del escaneo proactivo (S13) a una categoria de avisos. Se
// apoya en tipo (mas especifico) y cae a familia. Los tipos que YA tienen su
// propia seccion nativa (cita_sin_confirmar, fuga_clienta, bandeja_sin_responder)
// se filtran antes en useAvisos, pero se mapean igual por robustez.
export function categoriaDeHallazgo(h: Pick<Hallazgo, 'tipo' | 'familia'>): AvisoCategoria {
  switch (h.tipo) {
    case 'senal_sin_pagar': return 'pagos';
    case 'presupuesto_sin_respuesta': return 'presupuestos';
    case 'stock_bajo': return 'inventario';
    case 'bandeja_sin_responder': return 'mensajes';
    case 'cita_sin_confirmar': return 'citas';
    case 'fuga_clienta': return 'clientes';
  }
  switch (h.familia) {
    case 'inventario': return 'inventario';
    case 'recuperar': return 'clientes';
    case 'operativa': return 'agenda';
    default: return 'otros';
  }
}

// Orden canonico de una lista de avisos: primero por urgencia (desc), luego por
// cercania temporal (los mas proximos/recientes primero). Se usa tanto en la
// vista "Todos" como dentro de cada categoria.
export function ordenarAvisos(items: AvisoItem[]): AvisoItem[] {
  const ahora = Date.now();
  return [...items].sort((a, b) => {
    const du = URGENCIA_PESO[b.urgencia] - URGENCIA_PESO[a.urgencia];
    if (du !== 0) return du;
    // Cercania a "ahora" (un aviso de hace 1h o dentro de 1h pesa mas que uno de
    // hace/dentro de 3 dias): ordena por distancia absoluta al momento actual.
    return Math.abs(a.ts - ahora) - Math.abs(b.ts - ahora);
  });
}

// Etiqueta de tiempo relativa y corta para la fila del aviso ("en 2 h", "hoy",
// "hace 3 d"). Distingue pasado/futuro respecto a ahora.
export function tiempoRelativo(ts: number, ahora: number = Date.now()): string {
  const diff = ts - ahora;                 // >0 futuro, <0 pasado
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const horas = Math.round(abs / 3600000);
  const dias = Math.round(abs / 86400000);
  if (min < 1) return 'ahora';
  if (diff >= 0) {
    if (min < 60) return `en ${min} min`;
    if (horas < 24) return `en ${horas} h`;
    if (dias === 1) return 'mañana';
    return `en ${dias} d`;
  }
  if (min < 60) return `hace ${min} min`;
  if (horas < 24) return `hace ${horas} h`;
  if (dias === 1) return 'ayer';
  return `hace ${dias} d`;
}
