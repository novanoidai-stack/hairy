// Catálogo de funciones de IA de Mecha (Chispa)
// Derivado de datos, mantenible. Fuente de verdad para Hub y manuales.
// SESIÓN 9 - PLAN-IA-CHISPA-V2-REDISENO.md

export interface FuncionIA {
  id: string;
  titulo: string;
  descripcion: string;
  // Dónde está: ruta de la app (puede incluir #anchor)
  ubicacion: string;
  // Cómo se usa: instrucción breve
  uso: string;
  // Categoría para agrupar en el Hub
  categoria: 'panel' | 'config' | 'agenda' | 'pagina' | 'migracion' | 'voz';
  // Solo gestor (true) o todo el mundo (false/undefined)
  soloGestor?: boolean;
}

export const CATALOGO_IA: FuncionIA[] = [
  {
    id: 'chispa-clientes',
    titulo: 'Consultas de Clientes',
    descripcion: 'Consulta la cartera completa, segmentos (VIP, nuevos, en riesgo, inactivos), última visita, gasto, frecuencia, ficha 360 de una clienta, y riesgo de no-show y fuga.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "Enséñame mis clientes VIP" o "Quién lleva tiempo sin venir".',
    categoria: 'panel',
  },
  {
    id: 'chispa-agenda',
    titulo: 'Consultas de Agenda',
    descripcion: 'Consulta citas de hoy o de un rango, por profesional, cliente o estado. Revisa la disponibilidad de huecos y los horarios del equipo.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "¿Qué citas tengo hoy?" o "Huecos libres mañana".',
    categoria: 'panel',
  },
  {
    id: 'chispa-caja',
    titulo: 'Caja y Finanzas',
    descripcion: 'Consulta el dinero cobrado hoy, esta semana o este mes (efectivo, datáfono, propinas). Revisa ingresos por periodo y comparativas.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "¿Cuánto he cobrado hoy?" o "Compara ingresos con el mes pasado".',
    categoria: 'panel',
    soloGestor: true,
  },
  {
    id: 'chispa-informes',
    titulo: 'Informes y Evolución',
    descripcion: 'Obtén resúmenes de citas (confirmadas, no-shows, canceladas) y observa la evolución de tu salón con gráficas día a día.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "Resumen de citas canceladas" o "Evolución de citas de este mes".',
    categoria: 'panel',
    soloGestor: true,
  },
  {
    id: 'chispa-equipo',
    titulo: 'Gestión de Equipo',
    descripcion: 'Revisa los objetivos mensuales y su progreso, comisiones liquidadas y las fichas de los profesionales.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "Progreso de objetivos del equipo" o "Comisiones de este mes".',
    categoria: 'panel',
  },
  {
    id: 'chispa-inventario',
    titulo: 'Inventario y Stock',
    descripcion: 'Consulta el stock actual, alertas de bajo stock y el historial de tus productos.',
    ubicacion: '/app?chispa=1',
    uso: 'Pregunta a Chispa: "¿Qué productos tienen bajo stock?" o "Dime el stock actual".',
    categoria: 'panel',
  }
];

// Agrupación por categoría para el Hub
export const CATALOGO_POR_CATEGORIA: Record<FuncionIA['categoria'], FuncionIA[]> = {
  panel: CATALOGO_IA,
  config: [],
  agenda: [],
  pagina: [],
  migracion: [],
  voz: [],
};

// Helper: funciones disponibles en una página específica
export const funcionesParaPagina = (path: string): FuncionIA[] => {
  const cleanPath = path.replace(/\/app/, '').split('?')[0].split('#')[0];
  return CATALOGO_IA.filter(f => f.ubicacion.includes(cleanPath));
};

// Helper: filtro por rol (solo gestor vs todo el mundo)
export const funcionesParaRol = (esGestor: boolean): FuncionIA[] => {
  if (!esGestor) return CATALOGO_IA.filter(f => !f.soloGestor);
  return CATALOGO_IA;
};
