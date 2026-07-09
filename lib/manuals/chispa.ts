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
      titulo: 'Pregúntale qué sabe hacer',
      texto: 'Chispa se conoce a sí misma. Si no sabes por dónde empezar, pregúntale "¿qué sabes hacer?" o "¿dónde configuro la reserva online?": te enumerará las funciones de IA disponibles y te ofrecerá un enlace directo a cada pantalla. Nunca inventa funciones que no existan.',
    },
    {
      titulo: 'Vigilancia proactiva 24/7',
      texto: 'Chispa no espera a que le preguntes: revisa tu negocio de forma autónoma cada 15 minutos y también al abrir la app. Detecta señales sin pagar, citas sin confirmar de las próximas 48 horas, bandeja sin responder, presupuestos sin respuesta, stock bajo y clientas en riesgo de fuga. En la campana de Avisos, bajo "Chispa está vigilando", cada hallazgo aparece con su gravedad y tres acciones de un clic: verlo en su pantalla, marcarlo como resuelto o descartarlo. Los hallazgos se cierran solos cuando dejan de aplicar (por ejemplo, cuando repones el stock o la clienta confirma). Lo urgente (una cita en menos de 12 horas que sigue sin confirmar) se marca además para avisarte por WhatsApp. La detección es determinista, respeta tu negocio (nunca ve datos de otro salón) y queda registrada en la bitácora.',
    },
    {
      titulo: 'Configuración guiada',
      texto: 'Si eres gestor, Chispa puede configurar tu salón paso a paso. Di "configúrame el salón" o pulsa el botón "Poner en marcha tu salón" desde Avisos. Chispa te guiará por datos del negocio, servicios, equipo, horarios y notificaciones con formularios pre‑rellenados.',
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
      titulo: 'Voz de Chispa',
      texto: 'Chispa puede leer sus respuestas en voz alta. Activa el altavocito en el panel. La primera vez te pedirá permiso para usar el micro. Usa voz premium (ElevenLabs) o voz básica del navegador si la primera no está disponible.',
    },
    {
      titulo: 'Catálogo completo',
      texto: 'Para ver TODAS las funciones de IA del software con enlaces a cada pantalla, ve a Configuración > Qué hace la IA. Allí tienes el catálogo completo organizado por categoría.',
    },
  ],
};
