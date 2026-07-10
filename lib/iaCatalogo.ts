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
    descripcion: 'Chispa se conoce a sí misma y conoce todo el ecosistema de IA: pregúntale "¿qué sabes hacer?", "¿qué funciones de IA hay en esta pantalla?" o "¿dónde configuro X?" y enumera las funciones disponibles con enlace directo. Además audita el registro para explicar ejecuciones concretas ("¿por qué me salió este upsell?", "¿cuándo se analizó mi día?") mostrando su resultado y su motivo en una línea de tiempo.',
    ubicacion: '/app?chispa=1',
    uso: 'En el panel Chispa, escribe "¿qué puedes hacer?", "¿qué IA hay en Clientes?" o "¿por qué apareció esa sugerencia?".',
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

  {
    id: 'chispa-vigilancia-24-7',
    titulo: 'Vigilancia proactiva 24/7',
    descripcion: 'Chispa revisa tu negocio de forma autónoma cada 15 minutos (y al abrir la app) y detecta problemas y oportunidades: señales sin pagar, citas sin confirmar de las próximas 48h, bandeja sin responder, presupuestos sin respuesta, stock bajo y clientas en riesgo de fuga. En la campana de Avisos aparecen con su gravedad y acciones de un clic: verlo en su pantalla, marcarlo resuelto o descartarlo. Los hallazgos se cierran solos cuando dejan de aplicar. Lo urgente (una cita en menos de 12h sin confirmar) se encola además para aviso externo por WhatsApp. Detección determinista (sin LLM), multi-tenant y registrada en la bitácora del negocio.',
    ubicacion: '/app/avisos',
    uso: 'Abre la campana de Avisos: en "Chispa está vigilando" verás los hallazgos con sus botones ver/resolver/descartar. Vigila solo, sin activar nada.',
    categoria: 'panel',
    soloGestor: true,
  },

  {
    id: 'chispa-proxima-accion',
    titulo: 'Próxima mejor acción (iniciativa)',
    descripcion: 'Chispa toma la iniciativa con tacto: según la pantalla en la que estés y lo que ha detectado el escaneo 24/7, te propone de forma discreta la acción más valiosa en ese momento (recuperar una clienta en fuga en Clientes, confirmar citas en Agenda, reponer stock en Inventario...). Un clic para hacerlo o "Ahora no" para posponerlo 24h. Elección determinista (sin LLM); aprende de tus descartes y no repite ni molesta.',
    ubicacion: '/app',
    uso: 'Aparece sola, abajo, cuando hay algo relevante en la pantalla en la que estás. Pulsa la acción o "Ahora no".',
    categoria: 'panel',
  },

  {
    id: 'chispa-coach-intrapagina',
    titulo: 'Coach que te enseña la pantalla',
    descripcion: 'Chispa no solo te redirige: puede acompañarte donde ya estás. Aparece flotando, resalta un elemento real de la pantalla, te lo explica en el sitio y encadena varias explicaciones sin sacarte de donde estás. La guía no bloquea la página (puedes usarla mientras te explica), se cierra sin fricción, respeta el teclado y la preferencia de menos movimiento, y funciona en móvil y escritorio.',
    ubicacion: '/app',
    uso: 'Pulsa "Enséñame esta pantalla" (icono de diana) en la cabecera del panel Chispa, o "Enséñame la pantalla" en la tarjeta de iniciativa.',
    categoria: 'panel',
  },

  {
    id: 'chispa-tours-guiados',
    titulo: 'Tours guiados entre pantallas',
    descripcion: 'Recorridos paso a paso que pasan por varias pantallas: Chispa te navega a cada una, resalta qué mirar con el coach mark y avanza contigo con barra de progreso. Curados para los flujos de más valor ("Primeros pasos en Mecha", "Haz tu primer cobro"). Se puede salir en cualquier momento (cerrar o Escape) y el tour queda guardado para reanudarlo donde lo dejaste. No bloquea la página; móvil y escritorio.',
    ubicacion: '/app',
    uso: 'En el panel Chispa, al inicio de la conversación, pulsa un tour en "Tours guiados" (o "Reanudar" si dejaste uno a medias).',
    categoria: 'panel',
  },

  // CONFIGURACIÓN GUIADA
  {
    id: 'chispa-config-guiada',
    titulo: 'Configuración guiada del salón',
    descripcion: 'Asistente visual que configura tu salón paso a paso: datos del negocio, servicios, equipo, horarios, reserva online y notificaciones. Todo con formularios pre‑rellenados, sin escribir. Retoma donde lo dejaste (salta lo ya hecho) y te lleva hasta dejar el salón al 100%, no solo a lo mínimo.',
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
    id: 'equipo-rendimiento',
    titulo: 'Análisis de Rendimiento (Equipo)',
    descripcion: 'Analiza la carga de trabajo y rendimiento de un profesional, sugiriendo descansos o cambios en la agenda para evitar burnout y mejorar ocupación.',
    ubicacion: '/app/equipo',
    uso: 'En la pestaña Equipo, selecciona un profesional y pulsa "Analizar Rendimiento".',
    categoria: 'pagina',
  },
  {
    id: 'inventario-prediccion',
    titulo: 'Predicción de Stock (Inventario)',
    descripcion: 'Cruza el ritmo de ventas y consumo con el stock actual para predecir cuándo te quedarás sin producto y generar borradores de pedidos automáticamente.',
    ubicacion: '/app/inventario',
    uso: 'En la pestaña Inventario, pulsa "Predecir Stock" para auditar tus niveles.',
    categoria: 'pagina',
  },
  {
    id: 'configuracion-auditoria',
    titulo: 'Auditoría de Configuración',
    descripcion: 'Revisa tu configuración actual de servicios, profesionales y notificaciones, sugiriendo ajustes clave para automatizar tareas y ahorrar tiempo.',
    ubicacion: '/app/configuracion',
    uso: 'En la pestaña Configuración General, usa el asistente de "Auditoría de Configuración".',
    categoria: 'config',
    soloGestor: true,
  },
  {
    id: 'agenda-optimizacion',
    titulo: 'Optimización de Agenda Diaria',
    descripcion: 'Identifica tiempos muertos y solapes en el día, ofreciendo sugerencias para mover citas y llenar huecos de manera inteligente.',
    ubicacion: '/app/agenda',
    uso: 'En la pestaña Agenda, abre los filtros y pulsa "Analizar jornada".',
    categoria: 'agenda',
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
    id: 'campanas-reactivacion',
    titulo: 'Campañas de reactivación y difusión',
    descripcion: 'Define un segmento por criterios reales (clientas sin volver hace X días, visitas mínimas, ticket medio, etiqueta), ve el conteo en vivo, redacta el mensaje con {nombre} y encola la campaña. El envío real (WhatsApp/correo) lo hace el motor de mensajería.',
    ubicacion: '/app/campanas',
    uso: 'Menú Campañas (solo gestor). Elige una plantilla o define el segmento, escribe el mensaje y pulsa Encolar.',
    categoria: 'pagina',
  },
  {
    id: 'chispa-gestion-salon',
    titulo: 'Llevar el salón (cierre del día y gestión)',
    descripcion: 'Chispa hace de mano derecha de dirección: dile "cierra el día", "prepara la semana" o "revisa lo urgente" y te devuelve un panel con las cifras reales (citas, cobrado, sin confirmar, avisos del escaneo) y un menú de acciones de un clic. Todo se propone y tú confirmas; los envíos quedan encolados para el motor de mensajería. Solo dirección/propietario.',
    ubicacion: '/app?chispa=1',
    uso: 'En el panel Chispa, escribe "cierra el día", "prepara la semana" o "revisa lo urgente".',
    categoria: 'panel',
    soloGestor: true,
  },
  {
    id: 'chispa-datos-formato',
    titulo: 'Respuestas con datos en su mejor formato',
    descripcion: 'Cuando preguntas por cifras del negocio, Chispa elige sola el formato: indicador (KPI) con variación para una cifra, barras para un reparto por categoría, gráfica de línea para una evolución, tabla con totales para un listado y línea de tiempo para un histórico. Cifras siempre reales.',
    ubicacion: '/app',
    uso: 'Pregunta a Chispa por datos ("¿cuánto he hecho hoy?", "ingresos por servicio", "mis mejores clientas").',
    categoria: 'panel',
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
  {
    id: 'chispa-biblioteca-prompts',
    titulo: 'Biblioteca de Prompts Prefabricados',
    descripcion: 'Una mini-biblioteca con prompts útiles categorizados (Agenda, Clientes, Gestión, Marketing) al iniciar el chat, además de chips dinámicos de un toque recomendados según la página en la que te encuentres.',
    ubicacion: '/app?chispa=1',
    uso: 'Abre el chat de Chispa. En el estado vacío verás la biblioteca por pestañas; en el chat activo verás los chips de sugerencia encima de la caja de texto.',
    categoria: 'panel',
  },
  {
    id: 'chispa-consejos-carga',
    titulo: 'Consejos de carga explicativos',
    descripcion: 'Mientras Chispa piensa o procesa una solicitud en el chat o en las páginas del salón, te mostrará pequeños consejos aleatorios enseñándote qué más puede hacer por ti.',
    ubicacion: '/app',
    uso: 'Aparecen automáticamente en el bocadillo de carga de Chispa y en las tarjetas de ayuda de la página cuando la IA está analizando.',
    categoria: 'panel',
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
