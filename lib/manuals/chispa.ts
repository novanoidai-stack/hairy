// Manual de Chispa (IA) - SESIÓN 9 PLAN-IA-CHISPA-V2-REDISENO.md
import type { ManualContent } from './types';

export const manualChispa: ManualContent = {
  pageKey: 'chispa',
  tituloPagina: 'Chispa - IA',
  avisoTexto: 'Chispa es el asistente de inteligencia artificial de Mecha. Aprende qué puede hacer y cómo usarlo.',
  secciones: [
    {
      titulo: 'Qué es Chispa',
      texto: 'Chispa es la capa de inteligencia artificial de Mecha. No es solo un chatbot: es un sistema proactivo que te ayuda en cada pantalla del software con sugerencias, análisis y acciones de un clic. Todo lo que hace Chispa también puedes hacerlo tú manualmente.',
    },
    {
      titulo: 'Panel Chispa (chatbot)',
      texto: 'El panel de Chispa (pestaña con icono de estrella) es tu asistente conversacional. Puedes preguntarle cualquier cosa en voz o texto: crear citas, servicios, presupuestos, consultar datos de clientas o pedirle que organice tu agenda. Soporta formularios visuales para no tener que escribir. En la conversación siempre ves de un vistazo quién habla y cuándo: cada turno lleva el nombre (tú o Chispa) y la hora, los mensajes seguidos de la misma persona se agrupan y hay separación clara entre turnos. Puedes abrirlo a pantalla completa (icono en la cabecera) para trabajar con más espacio.',
    },
    {
      titulo: 'Configuración guiada sin ambigüedad',
      texto: 'Cuando pides "configúrame el salón", Chispa te lleva paso a paso con formularios y el chat libre se pausa a propósito (es un flujo en orden). Mientras dura, un aviso siempre visible te lo recuerda y te ofrece dos botones claros: "Saltar paso" y "Salir". Al terminar o al salir, el chat normal se reanuda al instante. Nunca te quedas con un campo bloqueado sin saber por qué.',
    },
    {
      titulo: 'Siempre en la mejor superficie',
      texto: 'Chispa casi nunca te responde con un muro de texto. Ante cualquier petición sigue siempre los mismos pasos: entiende qué quieres, y te lo devuelve en la forma más útil: una acción de un clic, una gráfica, unas opciones para elegir, un enlace a la pantalla o un formulario si le falta algún dato (solo te pide lo justo, ya pre-rellenado). Si no acaba de entenderte, en vez de un "no te he entendido" te ofrece un menú con lo más probable. Nunca te deja con la duda de "¿y ahora qué?".',
    },
    {
      titulo: 'Respuestas con datos en su mejor formato',
      texto: 'Cuando le preguntas por cifras de tu negocio, Chispa elige sola el formato que mejor las cuenta: una cifra suelta ("¿cuánto he hecho hoy?") aparece como un indicador grande con su variación respecto al periodo anterior; un reparto por categoría ("ingresos por servicio") como barras; una evolución en el tiempo ("la caja de la última semana") como una gráfica de línea; un listado o histórico ("mis mejores clientas") como una tabla con totales; y el recorrido de una clienta como una línea de tiempo. Todas las cifras son reales de tu negocio, nunca inventadas.',
    },
    {
      titulo: 'Pregúntale qué sabe hacer',
      texto: 'Chispa se conoce a sí misma. Si no sabes por dónde empezar, pregúntale "¿qué sabes hacer?" o "¿dónde configuro la reserva online?": te enumerará las funciones de IA disponibles y te ofrecerá un enlace directo a cada pantalla. Nunca inventa funciones que no existan.',
    },
    {
      titulo: 'Vigilancia proactiva 24/7',
      texto: 'Chispa no espera a que le preguntes: revisa tu negocio de forma autónoma cada 15 minutos y también al abrir la app. Detecta señales sin pagar, citas sin confirmar de las próximas 48 horas, bandeja sin responder, presupuestos sin respuesta, stock bajo y clientas en riesgo de fuga. En la campana de Avisos, bajo "Chispa está vigilando", cada hallazgo aparece con su gravedad y tres acciones de un clic: verlo en su pantalla, marcarlo como resuelto o descartarlo. Los hallazgos se cierran solos cuando dejan de aplicar (por ejemplo, cuando repones el stock o la clienta confirma). Lo urgente (una cita en menos de 12 horas que sigue sin confirmar) se marca además para avisarte por WhatsApp. La detección es determinista, respeta tu negocio (nunca ve datos de otro salón) y queda registrada en la bitácora.',
    },
    {
      titulo: 'Próxima mejor acción (iniciativa)',
      texto: 'Chispa no solo espera a que le preguntes: toma la iniciativa con tacto. Según la pantalla en la que estés y lo que ha detectado el escaneo 24/7, te propone de forma discreta —una tarjeta pequeña abajo— la acción más valiosa en ese momento: recuperar una clienta en fuga cuando estás en Clientes, confirmar las citas de mañana en la Agenda, reponer stock en Inventario, dar un empujón a un presupuesto... Pulsa la acción para hacerlo de un clic, o "Ahora no" para posponerla (la silencia 24 horas). La elección es determinista y aprende de tus descartes: no repite lo que ya has apartado ni te satura.',
    },
    {
      titulo: 'Coach que te sigue en la pantalla',
      texto: 'Chispa no solo te redirige y te suelta: puede acompañarte donde ya estás. Pulsa el botón "Enséñame esta pantalla" en la cabecera del panel (icono de diana) y Chispa aparece flotando, resalta un elemento real de la pantalla, te lo explica en el sitio y encadena varias explicaciones ("y aquí...") sin sacarte de donde estás. La guía no bloquea la página (puedes seguir usándola mientras te explica), se cierra sin fricción y respeta el teclado y la preferencia de menos movimiento. También puedes lanzarla desde la tarjeta de iniciativa ("Enséñame la pantalla").',
    },
    {
      titulo: 'Tours guiados entre pantallas',
      texto: 'Además de explicarte la pantalla en la que estás, Chispa puede llevarte de la mano por un flujo completo que pasa por varias pantallas. En el panel, al empezar una conversación, verás "Tours guiados" con recorridos como "Primeros pasos en Mecha" o "Haz tu primer cobro": Chispa te navega a cada pantalla, resalta qué mirar y avanza contigo con una barra de progreso. Puedes salir en cualquier momento (botón cerrar o Escape) y el tour queda guardado para reanudarlo justo donde lo dejaste ("Reanudar" aparece en el panel). Funciona en móvil y escritorio.',
    },
    {
      titulo: 'Configuración guiada',
      texto: 'Si eres gestor, Chispa puede configurar tu salón paso a paso. Di "configúrame el salón" o pulsa el botón "Poner en marcha tu salón" desde Avisos. Chispa te guiará por datos del negocio, servicios, equipo, horarios y notificaciones con formularios pre‑rellenados. Si ya tienes cosas hechas, retoma justo donde lo dejaste (salta lo ya configurado, no empieza de cero), y no para en lo mínimo: te acompaña hasta dejar el salón al 100%.',
      captura: '/manuals/chispa/config-guiada.png',
    },
    {
      titulo: 'Organizador de agenda',
      texto: 'Desde la Agenda, pulsa "Organizar mi agenda" (icono de chispa en la toolbar). Chispa analizará tu día detectando retrasos, huecos muertos y solapes, y propondrá arreglos de un clic: retrasar citas, compactar huecos o pedir citas para llenarlos.',
      captura: '/manuals/chispa/organizador-agenda.png',
      highlight: { top: '10%', left: '80%', width: '15%', height: '8%' },
    },
    {
      titulo: 'Mi Jornada - Coaching de huecos',
      texto: 'En Mi Jornada, pulsa "Analizar mi día". Chispa te mostrará un resumen de tus citas e ingresos, y te sugerirá cómo aprovechar los huecos libres: contactar a una clienta, descansar, prepararte para el siguiente servicio...',
    },
    {
      titulo: 'Caja - Upsell de productos',
      texto: 'Al seleccionar una cita para cobrar en Caja, Chispa sugerirá un producto complementario según el servicio (ej. shampoo para un corte). El cálculo es determinista; la IA solo redacta el texto comercial.',
    },
    {
      titulo: 'Presupuestos desde lenguaje natural',
      texto: 'En Presupuestos, pulsa "Crear presupuesto rápido" (icono de chispa). Escribe algo como "Presupuesto para Ana: corte y barba, 30€" y Chispa extraerá las líneas del catálogo y abrirá un editor para revisar antes de guardar.',
    },
    {
      titulo: 'Clientes - Riesgo y fuga',
      texto: 'En la ficha de una clienta, verás pastillas de riesgo de no‑show (ausencia) y fuga (tiempo sin venir). Pulsa "Avisar" para reforzar el recordatorio de una cita, o "Recuperar" para reconectar con una clienta que no viene.',
    },
    {
      titulo: 'Clientes - Preguntas y respuestas',
      texto: 'En la ficha de una clienta, usa el input "Pregunta algo sobre..." para preguntar en lenguaje natural: gasto medio, última visita, servicios frecuentes... Chispa responderá con datos reales, sin inventar.',
    },
    {
      titulo: 'Informes narrados',
      texto: 'En Informes, pulsa "Analizar periodo". Chispa generará un resumen en lenguaje natural de la evolución (citas, ingresos, no‑shows) con gráficas incrustadas y comparativa con el periodo anterior.',
    },
    {
      titulo: 'Reseñas - Respuestas con IA',
      texto: 'En la ficha de una reseña, pulsa "Sugerir respuesta". Chispa redactará un borrador con el tono de tu salón que puedes editar antes de publicar.',
    },
    {
      titulo: 'Bandeja - Triaje de mensajes',
      texto: 'En Bandeja, junto a cada mensaje sin leer verás botones "Cita (IA)" y "Presupuesto (IA)". Chispa extraerá cliente, servicio y fecha/hora del mensaje y propondrá crear la cita o presupuesto de un clic.',
    },
    {
      titulo: 'Migración Mágica',
      texto: 'En Configuración > Migración Mágica, sube un CSV de Booksy/Fresha o una foto de tu lista de precios/albarán. Chispa extraerá los datos con IA y los importará en bloque. Solo para gestores.',
    },
    {
      titulo: 'Voz de Chispa (seleccionable)',
      texto: 'Chispa puede leer sus respuestas en voz alta con voz neural natural (motor Kokoro). Y sí puedes cambiarla: en Configuración > Voz eliges entre varias voces de distintos tonos y géneros, con un botón "Escuchar" para probar cada una; la voz elegida se aplica a todos los dispositivos del salón. Para oírla en el chat, activa el altavocito en el panel (la primera vez te pedirá permiso para usar el micro). Si la voz neural no está disponible, cae a la voz básica del navegador avisándote.',
    },
    {
      titulo: 'Listar y analizar tus datos',
      texto: 'Chispa lista y segmenta lo que le pidas: "qué clientes tengo", "mis VIP", "quién no viene hace tiempo", "los nuevos"; devuelve KPIs y una tabla ordenable (por gasto, frecuencia o fecha), sin datos de salud y respetando el consentimiento de IA. Con "analiza mi salón" o "dame el panorama" te da un panel 360 de un vistazo (caja, agenda, citas sin confirmar, clientes y avisos) con acciones de un clic. Para una clienta concreta, pídele su ficha por el nombre. Y si el cliente aún no ha confirmado su cita, puede reenviarle el recordatorio.',
    },
    {
      titulo: 'Biblioteca de Prompts Prefabricados',
      texto: 'Al abrir el chat de Chispa sin mensajes, verás una mini-biblioteca con sugerencias diseñadas específicamente para tu salón (organizadas por pestañas: Agenda, Clientes, Gestión, Marketing). Además, cuando estés chateando, te aparecerán pequeños chips dinámicos recomendados según la pantalla en la que te encuentres, listos para enviar con un solo toque.',
    },
    {
      titulo: 'Consejos en Pantallas de Carga',
      texto: 'Mientras Chispa analiza datos, calcula propuestas u organiza tu jornada, te enseñará consejos prácticos aleatorios sobre sus propias capacidades. Así aprenderás nuevas formas de exprimir el asistente mientras esperas.',
    },
    {
      titulo: 'Catálogo completo',
      texto: 'Para ver TODAS las funciones de IA del software con enlaces a cada pantalla, ve a Configuración > Qué hace la IA. Allí tienes el catálogo completo organizado por categoría.',
    },
  ],
};
