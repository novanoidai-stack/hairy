import type { ManualContent } from './types';

export const manualMiJornada: ManualContent = {
  pageKey: 'mi-jornada',
  tituloPagina: 'Mi jornada',
  avisoTexto: 'Aquí fichas tu entrada y salida, ves tus números del periodo y gestionas turnos y ausencias.',
  secciones: [
    {
      titulo: 'Fichar entrada y salida',
      texto: 'En la tarjeta "Tu fichaje de hoy" el botón cambia entre "Fichar entrada" y "Fichar salida" según tu estado, y mientras trabajas tienes "Pausa" y "Reanudar" para los descansos. Antes de fichar la entrada eliges si trabajas "Presencial" o "Remoto". La hora la pone el servidor, no tu dispositivo, y cada marca queda listada debajo.',
      captura: '/manuals/mi-jornada/fichar.png',
    },
    {
      titulo: 'Mi registro de jornada',
      texto: 'En "Registro" tienes tu control horario mes a mes: entrada, salida, pausas y total de horas de cada día, más el resumen del mes. Puedes descargarlo cuando quieras en PDF o en CSV; es tu copia y no necesitas pedírsela a nadie. Los fichajes no se pueden editar ni borrar y se conservan cuatro años, como exige el registro de jornada (art. 34.9 del Estatuto de los Trabajadores).',
    },
    {
      titulo: 'Si falta o sobra un fichaje',
      texto: 'Si un día olvidaste fichar la salida, aparece marcado como incidencia. Pulsa "Ver asientos" y luego "Corregir" (o "Falta un fichaje" si no llegaste a marcar nada) y explica el motivo. La corrección no cambia el asiento original: lo anula y crea uno nuevo, y necesita el visto bueno de la empresa y el tuyo. Todo queda registrado con nombre, fecha y motivo, y si alguien no está de acuerdo la discrepancia también se guarda.',
    },
    {
      titulo: 'El resumen de tu día (Chispa)',
      texto: 'La tarjeta "Resumen de tu día" muestra de entrada tus cifras de hoy. Pulsa "Analizar mi día" y Chispa revisa tus citas para señalarte huecos aprovechables (incluidos los tiempos de reposo de un tinte) y posibles retrasos. En móvil la tarjeta viene plegada: tócala para abrirla.',
    },
    {
      titulo: 'Cambiar de periodo y vista',
      texto: 'Los botones "Hoy", "Semana" y "Mes" cambian el rango de las estadísticas. Esta página es solo tuya: el rendimiento del resto del equipo y el control horario de todo el salón están en la página de Equipo.',
    },
    {
      titulo: 'Tu actividad y comisión',
      texto: '"Tu actividad" resume citas completadas, tintes, horas trabajadas, cobrado, propinas y ticket medio del periodo. La "Comisión estimada" y los importes cobrados solo se muestran si el propietario ha activado que el equipo los vea, aunque tengas tu porcentaje asignado en la ficha. Tus objetivos, si los hay, van siempre por mes.',
      captura: '/manuals/mi-jornada/actividad.png',
      highlight: { top: '31%', left: '20%', width: '78%', height: '27%' },
    },
    {
      titulo: 'Cambios de turno',
      texto: 'El botón "+ Pedir cambio" abre la solicitud: eliges compañero, "Tu dia" y "Su dia", y un motivo opcional. La propuesta pasa por dos aprobaciones, primero tu compañero y después el responsable. Mientras esté pendiente puedes retirarla con "Cancelar solicitud".',
    },
    {
      titulo: 'Pedir una ausencia',
      texto: 'Pulsa "Pedir Ausencia" (arriba a la derecha) e indica las fechas de inicio y fin, el motivo ("Vacaciones", "Baja Médica" o "Asuntos Propios") y notas si quieres. La solicitud queda pendiente de aprobación y esos días dejan de ofrecerse en tu agenda. Las ves en "Mis ausencias", donde puedes retirar las que aún no han pasado.',
      captura: '/manuals/mi-jornada/ausencia.png',
    },
    {
      titulo: 'Si no ves tus datos',
      texto: 'Si tu cuenta todavía no está vinculada a una ficha de profesional puedes fichar, pero no verás citas, cobros ni rendimiento. Pídele al propietario que te vincule desde Equipo.',
    },
  ],
};
