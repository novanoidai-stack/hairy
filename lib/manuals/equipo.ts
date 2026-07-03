import type { ManualContent } from './types';

export const manualEquipo: ManualContent = {
  pageKey: 'equipo',
  tituloPagina: 'Equipo',
  avisoTexto: 'Aquí das de alta a tu personal, defines su horario y gestionas ausencias o bloqueos puntuales.',
  secciones: [
    {
      titulo: 'Añadir un profesional',
      texto: 'Botón "Añadir profesional": nombre, rol y datos de contacto. Cada profesional activo aparece luego en la Agenda con su propia columna.',
    },
    {
      titulo: 'Horario base',
      texto: 'Define qué días y en qué franjas horarias trabaja cada persona. La Agenda y la reserva online solo ofrecen huecos dentro de ese horario.',
    },
    {
      titulo: 'Bloqueos puntuales',
      texto: 'Para vacaciones, bajas o cualquier ausencia concreta, crea un bloqueo con su rango de fechas: esos huecos dejan de estar disponibles sin tocar el horario base.',
    },
    {
      titulo: 'Editar o desactivar',
      texto: 'Desde la ficha de cada profesional puedes cambiar sus datos o desactivarlo si deja el salón; sus citas pasadas se conservan en el historial.',
    },
  ],
};
