import type { ManualContent } from './types';

export const manualAgenda: ManualContent = {
  pageKey: 'agenda',
  tituloPagina: 'Agenda',
  avisoTexto: 'Aquí gestionas las citas del día: crealas, edítalas, cóbralas y controla avisos y lista de espera.',
  secciones: [
    {
      titulo: 'Crear una cita',
      texto: 'Pulsa "Nueva cita" arriba a la derecha (en móvil, "Cita"), o haz clic directamente sobre un hueco vacío de la rejilla para prellenar la hora y el profesional. Elige servicio, profesional y cliente para confirmarla.',
      captura: '/manuals/agenda/nueva-cita.png',
    },
    {
      titulo: 'Cambiar de vista',
      texto: 'Los botones "Dia", "Semana" y "Mes", junto a la fecha de la agenda, cambian el rango que se muestra. La vista de día es la que usarás la mayor parte del tiempo; al lado tienes "Hoy" para volver de un salto.',
    },
    {
      titulo: 'Editar, cobrar o cancelar una cita',
      texto: 'Haz clic sobre cualquier cita de la rejilla para abrir su ficha: desde ahí puedes cambiar la hora y el servicio, cobrarla, marcar "No se presentó" o cancelarla. Las citas se dan por completadas solas al terminar, salvo que actives el cierre manual en Configuración.',
    },
    {
      titulo: 'Mover citas y reorganizar el día',
      texto: 'Arrastra una cita para cambiarla de hora o de profesional. Si el día se tuerce, el botón de organizar (junto a "Hoy") propone cómo recolocar retrasos, solapes y huecos, y "Cerrar salon" gestiona de golpe un cierre imprevisto.',
    },
    {
      titulo: 'El panel de Avisos',
      texto: 'El icono de campana, arriba a la derecha, agrupa citas sin confirmar en las próximas 48h, el progreso de puesta en marcha del salón y otros avisos operativos del día.',
      captura: '/manuals/agenda/avisos.png',
      highlight: { top: '9%', left: '55%', width: '4%', height: '5%' },
    },
    {
      titulo: 'Lista de espera',
      texto: 'El botón "Lista de espera", arriba junto a la campana de avisos, muestra de un vistazo quién espera un hueco; desde ahí abres la página completa de Lista de espera.',
      captura: '/manuals/agenda/lista-espera.png',
    },
  ],
};
