import type { ManualContent } from './types';

export const manualEquipo: ManualContent = {
  pageKey: 'equipo',
  tituloPagina: 'Equipo',
  avisoTexto: 'Aquí das de alta a tu personal, defines su horario, ves cómo rinde el equipo y llevas su control horario.',
  secciones: [
    {
      titulo: 'Añadir un profesional',
      texto: 'El botón "Añadir profesional", arriba a la derecha, abre "Nuevo profesional": nombre, categoría (Auxiliar, Oficial, Oficial Mayor, Estilista Senior o Dirección), especialidades, porcentaje de comisión y color de agenda. El teléfono y el email se rellenan después editando su ficha. Cada profesional activo aparece luego en la Agenda con su propia columna.',
      captura: '/manuals/equipo/tarjetas.png',
      highlight: { top: '11%', left: '84%', width: '15%', height: '7%' },
    },
    {
      titulo: 'Tres vistas: Fichas, Rendimiento y Control horario',
      texto: 'Arriba hay tres pestañas. "Fichas" es el listado de personas y su configuración. "Rendimiento" es el ranking del equipo del periodo (dinero, servicios, horas o reposo aprovechado) y los objetivos con bonus. "Control horario" es el registro de jornada de todo el salón. Antes las dos últimas estaban escondidas dentro de "Mi jornada"; ahora esa página es solo la tuya y todo lo del equipo vive aquí. Solo las ve quien puede gestionar el equipo.',
      captura: '/manuals/equipo/horarios.png',
      highlight: { top: '27%', left: '33%', width: '64%', height: '70%' },
    },
    {
      titulo: 'Dos horarios que no son lo mismo',
      texto: 'El horario de APERTURA del salón (a qué hora abre y cierra el local, y su cierre del mediodía) se toca una sola vez en Configuración › Horarios; el botón "Horario del salón" te lleva ahí. El horario de TRABAJO de cada persona se toca en su ficha, en "Horario de trabajo de …", con la opción de partir el día en dos turnos. Si el horario de alguien se sale de lo que abre el local, Mecha te lo avisa en su propia ficha con el día concreto.',
      captura: '/manuals/equipo/horarios.png',
      highlight: { top: '27%', left: '33%', width: '64%', height: '70%' },
    },
    {
      titulo: 'Bloqueos puntuales',
      texto: 'En la ficha del profesional, "Bloqueos próximos" tiene el botón "+ Nuevo": elige el tipo (Vacaciones, Formación, Reunión, Baja, Descanso u Otro), el rango de fechas (y de horas, si desmarcas "Todo el dia") y un motivo opcional. Puedes marcarlo como recurrente para descansos fijos. Esos huecos dejan de estar disponibles sin tocar el horario base.',
    },
    {
      titulo: 'Control horario del equipo',
      texto: 'La pestaña "Control horario" tiene el registro de jornada de todo el salón: entradas, salidas y pausas con la hora del servidor, totalizadas por día y por mes, con las incidencias marcadas y descarga en PDF y CSV. Los fichajes no se pueden editar ni borrar; si hay que arreglar algo se pide una corrección que necesita el visto bueno de la empresa y de la persona. Desde la ficha de cada profesional, "Ver su control horario" abre esa misma vista ya filtrada por ella.',
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
