import type { ManualContent } from './types';

export const manualMiJornada: ManualContent = {
  pageKey: 'mi-jornada',
  tituloPagina: 'Mi jornada',
  avisoTexto: 'Aquí fichas tu entrada y salida, ves tu comisión estimada y gestionas turnos y ausencias.',
  secciones: [
    {
      titulo: 'Fichar entrada y salida',
      texto: 'El botón grande de arriba cambia entre "Fichar entrada" y "Fichar salida" según tu estado. Cada fichaje queda registrado con su hora exacta.',
    },
    {
      titulo: 'Cambiar de periodo y vista',
      texto: 'Los botones "Hoy", "Semana" y "Mes" cambian el rango de las estadísticas. Si eres propietario o dirección, el selector "Equipo" muestra el ranking de todo el personal en vez de solo el tuyo.',
    },
    {
      titulo: 'Objetivos y comisión',
      texto: 'La tarjeta "Comisión estimada" calcula lo que llevas ganado sobre servicios en el periodo. Los objetivos gamificados marcan metas personales o de equipo con una bonificación al cumplirlas.',
    },
    {
      titulo: 'Intercambio de turnos',
      texto: 'Puedes proponer a un compañero cambiar un día de turno; la solicitud queda pendiente hasta que la acepte.',
    },
    {
      titulo: 'Registrar una ausencia',
      texto: 'Indica el rango de fechas y un motivo opcional (vacaciones, baja, cita médica...) para dejar constancia de que no vas a fichar esos días.',
    },
  ],
};
