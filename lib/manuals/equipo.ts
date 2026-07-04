import type { ManualContent } from './types';

export const manualEquipo: ManualContent = {
  pageKey: 'equipo',
  tituloPagina: 'Equipo',
  avisoTexto: 'Aquí das de alta a tu personal, defines su horario y gestionas ausencias o bloqueos puntuales.',
  secciones: [
    {
      titulo: 'Añadir un profesional',
      texto: 'Botón "Añadir profesional": nombre, rol y datos de contacto. Cada profesional activo aparece luego en la Agenda con su propia columna.',
      captura: '/manuals/equipo/tarjetas.png',
      highlight: { top: '11%', left: '84%', width: '15%', height: '7%' },
    },
    {
      titulo: 'Horario base',
      texto: 'El botón "Horarios base" abre el horario general de apertura del salón (Configuración → Horarios): acota lo que ofrecen la Agenda y la reserva online para todo el equipo.',
      captura: '/manuals/equipo/horarios.png',
      highlight: { top: '27%', left: '33%', width: '64%', height: '70%' },
    },
    {
      titulo: 'El horario de cada persona',
      texto: 'Abre la tarjeta de un profesional (clic sobre ella) para definir sus días y franjas concretas dentro del horario del salón; la Agenda y la reserva solo le ofrecen huecos ahí.',
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
