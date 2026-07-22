import type { ManualContent } from './types';

export const manualBandeja: ManualContent = {
  pageKey: 'bandeja',
  tituloPagina: 'Bandeja',
  avisoTexto: 'Aquí llegan los mensajes de clientes y las peticiones de ausencia de tu equipo.',
  secciones: [
    {
      titulo: 'Abrir una conversación',
      texto: 'Haz clic en cualquier fila para ver el hilo completo. Un punto de color marca los mensajes que aún no has leído.',
      captura: '/manuals/bandeja/lista.png',
      highlight: { top: '29%', left: '17%', width: '81%', height: '32%' },
    },
    {
      titulo: 'Responder',
      texto: 'Escribe la respuesta y pulsa "Responder por correo": se envía directamente al email del contacto. "Guardar borrador" la deja escrita sin enviarla.',
    },
    {
      titulo: 'Ayuda para responder',
      texto: '"Sugerir borrador" redacta una respuesta con Chispa a partir del hilo. "Cita (IA)" y "Presupuesto (IA)" convierten la conversación en una cita o en un presupuesto sin salir de aquí.',
    },
    {
      titulo: 'Marcar como resuelta',
      texto: 'Cuando ya no necesitas seguir la conversación, pulsa "Marcar resuelta" para que salga del filtro "Abiertas". El mismo botón pasa a ser "Reabrir" por si vuelve a hacer falta.',
    },
    {
      titulo: 'Presupuestos vinculados',
      texto: 'Si el mensaje viene de un presupuesto (rechazo o petición de cambio), verás su número y total arriba; el botón "Abrir" te lleva a la página de Presupuestos para localizarlo.',
    },
    {
      titulo: 'Peticiones de ausencia',
      texto: 'Cuando alguien del equipo pide vacaciones o un día libre, aparece en "Peticiones de Ausencia": "Aprobar" bloquea su agenda esos días y "Rechazar" descarta la petición.',
    },
  ],
};
