import type { ManualContent } from './types';

export const manualListaEspera: ManualContent = {
  pageKey: 'lista-espera',
  tituloPagina: 'Lista de espera',
  avisoTexto: 'Apunta aquí a quien quiere un hueco lleno y avísale en cuanto se libere uno.',
  secciones: [
    {
      titulo: 'Añadir a alguien',
      texto: 'Pulsa "Añadir a la lista": busca al cliente por nombre o teléfono (o escribe uno nuevo), y opcionalmente indica servicio, profesional preferido y franja horaria.',
      captura: '/manuals/lista-espera/lista.png',
    },
    {
      titulo: 'Avisar cuando hay hueco',
      texto: 'El botón de WhatsApp abre una conversación directa con esa persona. "Avisar" cambia su estado para saber a quién ya has contactado.',
    },
    {
      titulo: 'Marcar como resuelta',
      texto: 'Cuando consigue su cita, márcala como "Resuelta" para que salga de la lista activa sin perder el historial.',
    },
    {
      titulo: 'Filtrar la lista',
      texto: 'Los chips de arriba ("Activas", "Esperando", "Avisadas", "Todas") acotan qué personas ves según su estado.',
    },
  ],
};
