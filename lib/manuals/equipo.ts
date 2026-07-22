import type { ManualContent } from './types';

export const manualEquipo: ManualContent = {
  pageKey: 'equipo',
  tituloPagina: 'Equipo',
  avisoTexto: 'Aquí das de alta a tu personal, defines su horario y gestionas ausencias o bloqueos puntuales.',
  secciones: [
    {
      titulo: 'Añadir un profesional',
      texto: 'El botón "Añadir profesional", arriba a la derecha, abre "Nuevo profesional": nombre, categoría (Auxiliar, Oficial, Oficial Mayor, Estilista Senior o Dirección), especialidades, porcentaje de comisión y color de agenda. El teléfono y el email se rellenan después editando su ficha. Cada profesional activo aparece luego en la Agenda con su propia columna.',
      captura: '/manuals/equipo/tarjetas.png',
      highlight: { top: '11%', left: '84%', width: '15%', height: '7%' },
    },
    {
      titulo: 'Horario base',
      texto: 'El botón "Horarios base" abre el horario general de apertura del salón (Configuración › Horarios): acota lo que ofrecen la Agenda y la reserva online para todo el equipo. Solo lo ves si tu rol tiene acceso a Configuración.',
      captura: '/manuals/equipo/horarios.png',
      highlight: { top: '27%', left: '33%', width: '64%', height: '70%' },
    },
    {
      titulo: 'El horario de cada persona',
      texto: 'Abre la tarjeta de un profesional (clic sobre ella) y baja hasta su bloque "Horario base": ahí defines sus días y franjas dentro del horario del salón, con la opción de partir el día en dos turnos. La Agenda y la reserva solo le ofrecen huecos ahí.',
    },
    {
      titulo: 'Bloqueos puntuales',
      texto: 'En la ficha del profesional, "Bloqueos próximos" tiene el botón "+ Nuevo": elige el tipo (Vacaciones, Formación, Reunión, Baja, Descanso u Otro), el rango de fechas (y de horas, si desmarcas "Todo el dia") y un motivo opcional. Puedes marcarlo como recurrente para descansos fijos. Esos huecos dejan de estar disponibles sin tocar el horario base.',
    },
    {
      titulo: 'Dar acceso a la app',
      texto: 'Una ficha sin cuenta vinculada aparece marcada como "Sin cuenta": ese profesional no puede fichar ni ver "Mi jornada". Desde su ficha, en "Cuenta de acceso", puedes invitarle por email para que entre con su propio usuario.',
    },
    {
      titulo: 'Editar o desactivar',
      texto: 'Desde la ficha puedes "Editar" sus datos o "Desactivar" a quien deja el salón: deja de aparecer en la Agenda pero se conserva su histórico. Dentro de "Editar" hay además "Eliminar profesional": úsalo solo para fichas creadas por error, porque el borrado es definitivo.',
    },
  ],
};
