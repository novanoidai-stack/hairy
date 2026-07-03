import type { ManualContent } from './types';

export const manualBandeja: ManualContent = {
  pageKey: 'bandeja',
  tituloPagina: 'Bandeja',
  avisoTexto: 'Aquí llegan los mensajes de clientes: rechazos y cambios de presupuestos, y contactos desde tu página pública.',
  secciones: [
    {
      titulo: 'Abrir una conversación',
      texto: 'Haz clic en cualquier fila para ver el hilo completo. Un punto de color marca los mensajes que aún no has leído.',
      captura: '/app/manuals/bandeja/lista.png',
    },
    {
      titulo: 'Responder',
      texto: 'Escribe la respuesta y pulsa "Responder por correo": se envía directamente al email del contacto.',
    },
    {
      titulo: 'Marcar como resuelta',
      texto: 'Cuando ya no necesitas seguir la conversación, márcala como resuelta para que salga del filtro "Abiertas". Puedes reabrirla en cualquier momento.',
    },
    {
      titulo: 'Presupuestos vinculados',
      texto: 'Si el mensaje viene de un presupuesto (rechazo o petición de cambio), verás su número y total arriba, con acceso directo para abrirlo.',
    },
  ],
};
