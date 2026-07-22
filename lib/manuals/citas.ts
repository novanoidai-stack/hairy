import type { ManualContent } from './types';

export const manualCitas: ManualContent = {
  pageKey: 'citas',
  tituloPagina: 'Citas',
  avisoTexto: 'Aquí tienes el historial de todas las citas del salón, con filtros para encontrar cualquiera en segundos.',
  secciones: [
    {
      titulo: 'Para qué sirve esta pantalla',
      texto: 'Es el historial completo de citas, pasadas y futuras, de todo el salón. Se consulta y se filtra, pero no se edita: para cambiar, cobrar o cancelar una cita, ábrela en la Agenda con el botón "Abrir en la agenda".',
    },
    {
      titulo: 'Buscar una cita',
      texto: 'El buscador de arriba a la izquierda encuentra por nombre de cliente, teléfono o servicio. Puedes escribir solo una parte: la lista se filtra según escribes.',
    },
    {
      titulo: 'Filtrar por periodo, estado, profesional o servicio',
      texto: 'Los cuatro selectores acotan la lista: el periodo ("Hoy", "Esta semana", "Este mes" o "Histórico" para verlo todo), el estado (Pendiente, Confirmada, Completada, Cancelada o No presentada), el profesional y el servicio. El botón "Sin confirmar" deja solo las citas que el cliente todavía no ha confirmado.',
    },
    {
      titulo: 'Las cifras de arriba',
      texto: 'Las tarjetas (Citas, Confirmadas, Pendientes, No-shows e Ingresos) se recalculan sobre lo que estás viendo, no sobre todo el histórico: si filtras por un profesional y un mes, esas cifras son las suyas de ese mes. Ingresos solo suma las citas completadas o ya cobradas.',
    },
    {
      titulo: 'Abrir una cita',
      texto: 'Haz clic en cualquier fila para ver su ficha: estado, fecha y hora, profesional, canal por el que se reservó (Mostrador, Web, WhatsApp, Voz IA o Chispa), importe y si está cobrada. Desde ahí puedes llamar al cliente o saltar a esa cita en la Agenda.',
    },
  ],
};
