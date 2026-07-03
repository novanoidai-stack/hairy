import type { ManualContent } from './types';

export const manualAgenda: ManualContent = {
  pageKey: 'agenda',
  tituloPagina: 'Agenda',
  avisoTexto: 'Aquí gestionas las citas del día: crealas, edítalas, cóbralas y controla avisos y lista de espera.',
  secciones: [
    {
      titulo: 'Crear una cita',
      texto: 'Pulsa "Nueva cita" arriba a la derecha, o haz clic directamente sobre un hueco vacío de la rejilla para prellenar la hora y el profesional. Elige servicio, profesional y cliente para confirmarla.',
      captura: '/manuals/agenda/nueva-cita.png',
    },
    {
      titulo: 'Cambiar de vista',
      texto: 'Los botones "Día", "Semana" y "Mes" arriba a la izquierda cambian el rango de la agenda que se muestra. La vista de día es la que usarás la mayor parte del tiempo.',
      captura: '/manuals/agenda/vistas.png',
    },
    {
      titulo: 'Editar, cobrar o cancelar una cita',
      texto: 'Haz clic sobre cualquier cita de la rejilla para abrir su ficha: desde ahí puedes cambiar la hora, marcarla como completada, cobrarla o cancelarla.',
    },
    {
      titulo: 'El panel de Avisos',
      texto: 'El icono de campana, arriba a la derecha, agrupa citas sin confirmar en las próximas 48h, el progreso de puesta en marcha del salón y otros avisos operativos del día.',
      captura: '/manuals/agenda/avisos.png',
    },
    {
      titulo: 'Lista de espera',
      texto: 'El botón "Lista de espera" de la barra de filtros abre la gestión de clientes que quieren hueco antes de su próxima cita disponible.',
      captura: '/manuals/agenda/lista-espera.png',
    },
  ],
};
