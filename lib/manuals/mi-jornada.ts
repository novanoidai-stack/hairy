import type { ManualContent } from './types';

export const manualMiJornada: ManualContent = {
  pageKey: 'mi-jornada',
  tituloPagina: 'Mi jornada',
  avisoTexto: 'Aquí fichas tu entrada y salida, ves tu comisión estimada y gestionas turnos y ausencias.',
  secciones: [
    {
      titulo: 'Fichar entrada y salida',
      texto: 'El botón grande de arriba cambia entre "Fichar entrada" y "Fichar salida" según tu estado. Cada fichaje queda registrado con su hora exacta.',
      captura: '/manuals/mi-jornada/fichar.png',
    },
    {
      titulo: 'Chispa (Briefing Proactivo)',
      texto: 'Cada mañana, al abrir "Mi jornada", Chispa revisa tus citas y te muestra un resumen automático (citas clave, clientas VIP, posibles huecos o riesgos de impuntualidad) para que arranques el día con todo bajo control.',
    },
    {
      titulo: 'Cambiar de periodo y vista',
      texto: 'Los botones "Hoy", "Semana" y "Mes" cambian el rango de las estadísticas. Si eres propietario o dirección, el selector "Equipo" muestra el ranking de todo el personal en vez de solo el tuyo.',
    },
    {
      titulo: 'Tu actividad y comisión',
      texto: 'La fila "Tu actividad" resume citas completadas, horas, cobrado y ticket medio del periodo. Si tienes un % de comisión asignado (Equipo → tu ficha), aquí aparece también "Comisión estimada"; y si el negocio activa objetivos, se muestran con su bonificación al cumplirlos.',
      captura: '/manuals/mi-jornada/actividad.png',
      highlight: { top: '31%', left: '20%', width: '78%', height: '27%' },
    },
    {
      titulo: 'Intercambio de turnos',
      texto: 'Puedes proponer a un compañero cambiar un día de turno; la solicitud queda pendiente hasta que la acepte.',
    },
    {
      titulo: 'Registrar una ausencia',
      texto: 'Indica el rango de fechas y un motivo opcional (vacaciones, baja, cita médica...) para dejar constancia de que no vas a fichar esos días.',
      captura: '/manuals/mi-jornada/ausencia.png',
    },
  ],
};
