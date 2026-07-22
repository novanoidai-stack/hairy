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
      highlight: { top: '14%', left: '78%', width: '13%', height: '6%' },
    },
    {
      titulo: 'Avisar cuando hay hueco',
      texto: 'El icono de teléfono (solo aparece si guardaste su número) abre WhatsApp con esa persona. "Avisar" cambia su estado a avisada para saber a quién ya has contactado. Desde el ordenador, "Agendar" abre la agenda con sus datos ya rellenos para darle el hueco de un clic.',
    },
    {
      titulo: 'Marcar como resuelta',
      texto: 'Cuando consigue su cita, pulsa "Resuelta": deja de contar como activa y la fila queda atenuada, sin perder el historial (la sigues viendo con el chip "Todas").',
    },
    {
      titulo: 'Quitar de la lista',
      texto: 'La "X" la borra de la lista para siempre y te pide confirmación antes. Si solo quieres dejar constancia de que ya está atendida, usa "Resuelta" en su lugar.',
    },
    {
      titulo: 'Filtrar la lista',
      texto: 'Los chips de arriba ("Activas", "Esperando", "Avisadas", "Todas") acotan qué personas ves según su estado, con el número de cada grupo entre paréntesis.',
    },
  ],
};
