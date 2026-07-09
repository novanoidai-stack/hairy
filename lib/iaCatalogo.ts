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
  // PANEL CHISPA (chatbot + bloques interactivos)
  {
    id: 'chispa-panel',
    titulo: 'Chispa (asistente de IA)',
    descripcion: 'Panel conversacional que atiende dudas, reserva citas y ejecuta acciones por voz o texto. Responde siempre en la mejor superficie (acción de un clic, gráfica, opciones, enlace o formulario), casi nunca en texto plano, y nunca te deja sin un siguiente paso accionable. La conversación muestra siempre quién habla y cuándo (nombre y hora por turno, con los mensajes agrupados) y se puede abrir a pantalla completa.',
    ubicacion: '/app?chispa=1',
    uso: 'Pulsa la pestaña Chispa (icono de estrella) o escribe "?chispa=1" en la URL.',
    categoria: 'panel',
  },
  {
    id: 'chispa-vo-z',
    titulo: 'Voz de Chispa',
    descripcion: 'Chispa lee sus respuestas en voz alta con voz premium (ElevenLabs) o voz básica del navegador si la primera no está disponible.',
    ubicacion: '/app?chispa=1',
    uso: 'Desde el panel Chispa, activa el altavoz. La primera vez te pedirá permiso para usar el micro.',
    categoria: 'voz',
  },

  {
    id: 'chispa-autoconocimiento',
    titulo: 'Pregúntale a Chispa qué sabe hacer',
    descripcion: 'Chispa se conoce a sí misma: pregúntale "¿qué sabes hacer?" o "¿dónde configuro X?" y te enumera las funciones de IA disponibles con un enlace directo a cada pantalla.',
    ubicacion: '/app?chispa=1',
    uso: 'En el panel Chispa, escribe "¿qué puedes hacer?" o "¿dónde está la reserva online?".',
    categoria: 'panel',
  },
  {
    id: 'chispa-deshacer',
    titulo: 'Deshacer acciones',
    descripcion: 'Casi todas las acciones de Chispa (crear citas, reagendar, cambiar configuración) son reversibles durante 10 segundos. Una ventana de seguridad para corregir errores sin manchar la base de datos.',
    ubicacion: '/app?chispa=1',
    uso: 'Tras confirmar una acción de Chispa, pulsa el botón "Deshacer" en el aviso que aparece.',
    categoria: 'panel',
  },

  // CONFIGURACIÓN GUIADA
  {
    id: 'chispa-config-guiada',
    titulo: 'Configuración guiada del salón',
    descripcion: 'Asistente visual que configura tu salón paso a paso: datos del negocio, servicios, equipo, horarios, reserva online y notificaciones. Todo con formularios pre‑rellenados, sin escribir.',
    ubicacion: '/app/configuracion',
    uso: 'Di "configúrame el salón" a Chispa o pulsa el botón "Poner en marcha tu salón" desde Avisos.',
    categoria: 'config',
    soloGestor: true,
  },

  // AGENDA
  {
    id: 'organizador-agenda',
    titulo: 'Organizador de agenda',
    descripcion: 'Detecta retrasos, huecos muertos y solapes en tu agenda de hoy, y propone arreglos de un clic (retrasar, compactar, pedir cita). Mueve las 4 marcas de la cita coherentemente.',
    ubicacion: '/app/agenda',
    uso: 'Desde la Agenda, pulsa el botón "Organizar mi agenda" (icono de chispa).',
    categoria: 'agenda',
  },

  // PÁGINAS CON IA PROACTIVA
  {
    id: 'mi-jornada-coaching',
    titulo: 'Coaching de huecos (Mi Jornada)',
    descripcion: 'Analiza tu día y sugiere cómo aprovechar los huecos libres entre citas: contactar a una clienta, descansar, prepararse para el siguiente servicio...',
    ubicacion: '/app/mi-jornada',
    uso: 'En Mi Jornada, pulsa "Analizar mi día". El resumen de citas/horas siempre visible.',
    categoria: 'pagina',
  },
  {
    id: 'caja-upsell',
    titulo: 'Sugerencia de producto en Caja',
    descripcion: 'Al cobrar una cita, sugiere un producto complementario ( shampoo, tratamiento...) según el servicio. Cálculo determinista sin LLM; la IA solo redacta el texto comercial.',
    ubicacion: '/app/caja',
    uso: 'Selecciona una cita para cobrar. La tarjeta de IA mostrará el producto si aplica.',
    categoria: 'pagina',
  },
  {
    id: 'presupuestos-nl',
    titulo: 'Presupuestos desde lenguaje natural',
    descripcion: 'Crea un presupuesto desde una frase ("Presupuesto para Ana: corte y barba, 30€"). El parser extrae líneas de catálogo y abre un editor para revisar antes de guardar.',
    ubicacion: '/app/presupuestos',
    uso: 'Pulsa "Crear presupuesto rápido" (icono de chispa) y escribe la descripción.',
    categoria: 'pagina',
  },
  {
    id: 'presupuestos-seguimiento',
    titulo: 'Seguimiento de presupuestos',
    descripcion: 'Alerta proactiva cuando un presupuesto lleva N días sin respuesta. Propone reenviarlo por correo o WhatsApp con un clic.',
    ubicacion: '/app/presupuestos',
    uso: 'En la cabecera de Presupuestos, aparecerá una tarjeta si hay presupuestos pendientes.',
    categoria: 'pagina',
  },
  {
    id: 'clientes-riesgo',
    titulo: 'Riesgo de no-show (Clientes)',
    descripcion: 'Pastilla de riesgo que indica la probabilidad de ausencia de una clienta. "Avisar" reenvía el recordatorio de WhatsApp para reforzar la cita.',
    ubicacion: '/app/clientes',
    uso: 'En la ficha de una clienta, verás la pastilla "Riesgo de ausencia" si aplica. Pulsa "Avisar" para reforzar.',
    categoria: 'pagina',
  },
  {
    id: 'clientes-fuga',
    titulo: 'Riesgo de fuga (Clientes)',
    descripcion: 'Detecta clientas que llevan tiempo sin venir y superan su frecuencia habitual. "Recuperar" envía un mensaje personalizado para reconectar.',
    ubicacion: '/app/clientes',
    uso: 'En la lista o ficha de clientas, verás "Fuga · Xd" si aplica. Pulsa "Recuperar".',
    categoria: 'pagina',
  },
  {
    id: 'clientes-qa',
    titulo: 'Preguntas y respuestas sobre la clienta',
    descripcion: 'Haz preguntas en lenguaje natural sobre una clienta ( gasto medio, última visita, servicios frecuentes...). La IA responde con datos reales, sin inventar.',
    ubicacion: '/app/clientes',
    uso: 'En la ficha de una clienta, usa el input "Pregunta algo sobre..." y pulsa enter.',
    categoria: 'pagina',
  },
  {
    id: 'informes-narrado',
    titulo: 'Informe narrado (Informes)',
    descripcion: 'Resumen en lenguaje natural de la evolución del periodo (citas, ingresos, no‑shows) con comparativa frente al periodo anterior y gráficas incrustadas.',
    ubicacion: '/app/informes',
    uso: 'En Informes, pulsa "Analizar periodo". El resumen de cifras siempre visible.',
    categoria: 'pagina',
  },
  {
    id: 'resenas-borrador',
    titulo: 'Borrador de respuesta a reseñas',
    descripcion: 'Genera un borrador de respuesta a una reseña (positiva o negativa) con el tono de tu salón. Editable antes de publicar.',
    ubicacion: '/app/resenas',
    uso: 'En la ficha de una reseña, pulsa "Sugerir respuesta".',
    categoria: 'pagina',
  },
  {
    id: 'resenas-temas',
    titulo: 'Temas recurrentes en reseñas',
    descripcion: 'Resumen proactivo de los temas más mencionados en las reseñas del periodo (servicios, ambiente, precio...).',
    ubicacion: '/app/resenas',
    uso: 'En Reseñas, aparece una tarjeta de IA con el resumen de temas si hay reseñas.',
    categoria: 'pagina',
  },
  {
    id: 'bandeja-triage',
    titulo: 'Triaje de mensajes (Bandeja)',
    descripcion: 'Propone convertir un mensaje entrante en una cita o presupuesto de un clic. Extrae cliente, servicio y fecha/hora del mensaje.',
    ubicacion: '/app/bandeja',
    uso: 'En Bandeja, junto a cada mensaje sin leer verás botones "Cita (IA)" y "Presupuesto (IA)".',
    categoria: 'pagina',
  },
  {
    id: 'bandeja-borrador',
    titulo: 'Borrador de respuesta (Bandeja)',
    descripcion: 'Genera un borrador de respuesta a un mensaje entrante. Se guarda en el hilo como borrador para revisar y enviar por WhatsApp o correo.',
    ubicacion: '/app/bandeja',
    uso: 'En Bandeja, pulsa "Responder con IA" en un mensaje.',
    categoria: 'pagina',
  },

  // MIGRACIÓN
  {
    id: 'migracion-magica',
    titulo: 'Migración Mágica',
    descripcion: 'Importa datos desde otros softwares ( Booksy, Fresha) o desde fotos ( lista de precios, albaranes). La IA extrae la estructura y la importa en bloque.',
    ubicacion: '/app/configuracion',
    uso: 'En Configuración > Migración Mágica, sube tu CSV o imagen y confirma la vista previa.',
    categoria: 'migracion',
    soloGestor: true,
  },
];

// Agrupación por categoría para el Hub
export const CATALOGO_POR_CATEGORIA: Record<FuncionIA['categoria'], FuncionIA[]> = {
  panel: CATALOGO_IA.filter(f => f.categoria === 'panel'),
  config: CATALOGO_IA.filter(f => f.categoria === 'config'),
  agenda: CATALOGO_IA.filter(f => f.categoria === 'agenda'),
  pagina: CATALOGO_IA.filter(f => f.categoria === 'pagina'),
  migracion: CATALOGO_IA.filter(f => f.categoria === 'migracion'),
  voz: CATALOGO_IA.filter(f => f.categoria === 'voz'),
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
