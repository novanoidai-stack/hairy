// Biblioteca de prompts prefabricados y consejos de carga dinámicos para Chispa V3.
// Diseñada para potenciar la proactividad e interactividad en cada pantalla del software.

export interface PromptBiblioteca {
  id: string;
  icono: string;
  label: string;      // Nombre corto para el chip
  prompt: string;     // Mensaje completo enviado al chat
  descripcion: string; // Explicación corta
  categoria: 'agenda' | 'clientes' | 'gestion' | 'marketing' | 'general';
  paginas?: string[]; // Rutas asociadas (normalizadas, ej: '/agenda', '/clientes')
  soloGestor?: boolean;
}

export const BIBLIOTECA_PROMPTS: PromptBiblioteca[] = [
  // AGENDA Y TURNOS
  {
    id: 'opt-agenda',
    icono: '📅',
    label: 'Optimizar agenda',
    prompt: 'Analiza mi agenda de hoy y proponme sugerencias para compactar los huecos y evitar retrasos.',
    descripcion: 'Busca huecos muertos y solapes en la agenda diaria.',
    categoria: 'agenda',
    paginas: ['/', '/agenda', '/mi-jornada'],
  },
  {
    id: 'buscar-retrasos',
    icono: '🕒',
    label: 'Verificar retrasos de hoy',
    prompt: '¿Hay retrasos previstos en la agenda de hoy? Analiza las citas y sugiéreme estrategias para mitigarlos.',
    descripcion: 'Analiza si alguna cita va a provocar retrasos en cascada.',
    categoria: 'agenda',
    paginas: ['/', '/agenda', '/mi-jornada'],
  },
  {
    id: 'citas-sin-confirmar',
    icono: '🔔',
    label: 'Citas sin confirmar mañana',
    prompt: 'Dime qué citas de mañana están todavía sin confirmar por parte del cliente y redacta un recordatorio.',
    descripcion: 'Identifica citas sin confirmar y genera un mensaje amable.',
    categoria: 'agenda',
    paginas: ['/', '/agenda', '/bandeja'],
  },
  {
    id: 'resumen-dia',
    icono: '📋',
    label: 'Resumen de mi jornada',
    prompt: 'Hazme un resumen completo de la jornada de hoy: citas agendadas, horas ocupadas e ingresos estimados.',
    descripcion: 'Una visión general de tu agenda y facturación para hoy.',
    categoria: 'agenda',
    paginas: ['/', '/agenda', '/mi-jornada'],
  },

  // CLIENTES Y CAMPAÑAS
  {
    id: 'clientes-fuga',
    icono: '🏃',
    label: 'Clientes a recuperar',
    prompt: 'Muéstrame los clientes que están en riesgo alto de fuga (que llevan tiempo sin venir) y cómo recuperarlos.',
    descripcion: 'Identifica clientes inactivos para reconectar con ellos.',
    categoria: 'clientes',
    paginas: ['/clientes', '/campanas'],
  },
  {
    id: 'analizar-reseñas',
    icono: '⭐',
    label: 'Analizar reseñas del mes',
    prompt: 'Analiza las reseñas y valoraciones de los clientes de este mes. Dime cuáles son los temas más repetidos.',
    descripcion: 'Agrupa el feedback de los clientes para ver qué mejorar.',
    categoria: 'clientes',
    paginas: ['/resenas', '/informes'],
  },
  {
    id: 'crear-campaña',
    icono: '📢',
    label: 'Diseñar campaña WhatsApp',
    prompt: 'Ayúdame a diseñar una campaña para clientes que no han venido en los últimos 90 días, sugiriendo un descuento.',
    descripcion: 'Crea una campaña segmentada y redacta el mensaje de WhatsApp.',
    categoria: 'marketing',
    paginas: ['/campanas', '/clientes'],
    soloGestor: true,
  },
  {
    id: 'upsell-sugerencia',
    icono: '🧴',
    label: 'Upsell de producto',
    prompt: 'Recomiéndame productos de reventa para complementar un servicio de corte o color y cómo ofrecérselo al cliente.',
    descripcion: 'Asesoramiento de productos para aumentar el ticket medio.',
    categoria: 'marketing',
    paginas: ['/caja', '/inventario', '/clientes'],
  },

  // CAJA Y GESTIÓN
  {
    id: 'cierre-caja',
    icono: '💰',
    label: 'Revisar caja de hoy',
    prompt: 'Hazme un resumen del estado de la caja de hoy: total cobrado, métodos de pago y si hay descuadres o citas pendientes de cobro.',
    descripcion: 'Verifica los ingresos cobrados y los pendientes de hoy.',
    categoria: 'gestion',
    paginas: ['/caja', '/informes'],
    soloGestor: true,
  },
  {
    id: 'comparar-semanas',
    icono: '📈',
    label: 'Facturación vs semana anterior',
    prompt: 'Compara la facturación de esta semana con la semana anterior. Dime la evolución en ingresos y número de citas.',
    descripcion: 'Análisis comparativo financiero de tu negocio.',
    categoria: 'gestion',
    paginas: ['/caja', '/informes'],
    soloGestor: true,
  },
  {
    id: 'stock-bajo',
    icono: '📦',
    label: 'Auditar stock bajo',
    prompt: 'Dime qué productos de inventario están por debajo de su stock mínimo de seguridad y propón un pedido de reposición.',
    descripcion: 'Audita los niveles de stock para evitar roturas.',
    categoria: 'gestion',
    paginas: ['/inventario', '/configuracion'],
    soloGestor: true,
  },
  {
    id: 'rendimiento-equipo',
    icono: '👥',
    label: 'Rendimiento de profesionales',
    prompt: 'Compara la ocupación and facturación de los miembros del equipo en lo que va de mes.',
    descripcion: 'Verifica quién tiene mayor ocupación y ventas.',
    categoria: 'gestion',
    paginas: ['/equipo', '/informes'],
    soloGestor: true,
  },

  // GENERAL Y CONFIGURACIÓN
  {
    id: 'crear-presupuesto',
    icono: '📄',
    label: 'Redactar presupuesto',
    prompt: 'Ayúdame a redactar un presupuesto detallado para un servicio de boda: peinado novia, maquillaje y prueba.',
    descripcion: 'Genera borradores estructurados en un clic.',
    categoria: 'general',
    paginas: ['/presupuestos'],
  },
  {
    id: 'configurar-salon',
    icono: '⚙️',
    label: 'Poner en marcha el salón',
    prompt: 'Quiero poner en marcha mi salón y configurar los datos del negocio, servicios, equipo y horarios.',
    descripcion: 'Inicia el asistente paso a paso del onboarding del salón.',
    categoria: 'general',
    paginas: ['/configuracion'],
    soloGestor: true,
  },
  {
    id: 'que-puedes-hacer',
    icono: '✨',
    label: '¿Qué sabes hacer?',
    prompt: 'Cuéntame detalladamente qué puedes hacer y en qué pantallas me puedes ayudar con inteligencia artificial.',
    descripcion: 'Muestra un listado de todas las habilidades de Chispa.',
    categoria: 'general',
  },
];

export const TIPS_CARGA = [
  "Chispa puede ayudarte a organizar tu agenda de hoy y sugerir cambios si hay retrasos.",
  "Pídele a Chispa: 'cierra el día' para ver un informe de la facturación y citas cobradas.",
  "Chispa vigila tu inventario y te avisará en la campana de alertas si el stock de tintes es bajo.",
  "¿Quieres recuperar clientes? Chispa analiza quién lleva tiempo sin venir y te redacta un mensaje personalizado.",
  "Puedes dictarle a Chispa usando el icono del micrófono para gestionar el salón con manos libres.",
  "Si te equivocas confirmando una acción en el chat, tienes 10 segundos para pulsar 'Deshacer'.",
  "Pulsa 'Enséñame esta pantalla' (icono de diana) para que Chispa te guíe flotando por el menú actual.",
  "Chispa escanea tu agenda en segundo plano y te avisa si hay citas con alto riesgo de no-show para mañana.",
  "Pregunta a Chispa '¿qué sabes hacer?' para consultar el catálogo completo de funciones inteligentes.",
  "Puedes enviar campañas de WhatsApp redactando una plantilla que Chispa personalizará por ti.",
  "Sube un CSV o foto de tus precios en Migración Mágica para que Chispa importe tus datos en bloque."
];

export function obtenerTipCarga(): string {
  if (typeof Math === 'undefined') return TIPS_CARGA[0];
  const idx = Math.floor(Math.random() * TIPS_CARGA.length);
  return TIPS_CARGA[idx];
}

// ---------------------------------------------------------------------------
// Prompt de IA POR PAGINA (rework KISS, Titular -> Visual -> Accion).
// El contrato de FORMATO duro (titular + bloque visual + accion de 1 clic) vive
// en el system prompt del edge (buildSystemPrompt, turno de LECTURA). Aqui solo
// se arma la INTENCION concreta de la pagina: su objetivo y, si la tiene, la
// accion de 1 clic que se espera al final. Funcion pura (comentarios en espanol).
// ---------------------------------------------------------------------------
export interface PromptPaginaCfg {
  pagina: string;        // nombre legible de la pantalla (p.ej. 'clientes', 'informes')
  objetivo: string;      // que debe analizar/hacer Chispa en esa pantalla
  accionEsperada?: string; // accion de 1 clic sugerida al cierre (p.ej. 'recuperar', 'responder')
}

export function buildPromptPagina(cfg: PromptPaginaCfg): string {
  const partes: string[] = [
    `Estas en la pantalla "${cfg.pagina}" del software del salon. ${cfg.objetivo}`,
    'Responde con un TITULAR de una frase (dato clave en negrita) y el MEJOR bloque visual con cifras reales; nada de muros de texto.',
  ];
  if (cfg.accionEsperada) {
    partes.push(`Cierra ofreciendo, si procede, una accion de 1 clic: ${cfg.accionEsperada}.`);
  }
  return partes.join(' ');
}

// Normaliza el pathname eliminando prefijos de tabs y parámetros para un matching exacto
export function normalizarPathname(pathname: string): string {
  if (!pathname) return '/';
  let clean = pathname.split('?')[0].split('#')[0];
  clean = clean.replace(/^\/\(tabs\)/, '');
  if (clean === '') return '/';
  return clean;
}
