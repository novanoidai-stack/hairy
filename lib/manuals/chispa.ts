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
      texto: 'El panel de Chispa (pestaña con icono de estrella) es tu asistente conversacional. Puedes preguntarle cualquier cosa en voz o texto: crear citas, servicios, presupuestos, consultar datos de clientas o pedirle que organice tu agenda. Soporta formularios visuales para no tener que escribir.',
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
