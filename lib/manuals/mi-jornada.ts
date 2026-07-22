import type { ManualContent } from './types';

export const manualMiJornada: ManualContent = {
  pageKey: 'mi-jornada',
  tituloPagina: 'Mi jornada',
  avisoTexto: 'Aquí fichas tu entrada y salida, ves tus números del periodo y gestionas turnos y ausencias.',
  secciones: [
    {
      titulo: 'Fichar entrada y salida',
      texto: 'En la tarjeta "Tu fichaje de hoy" el botón cambia entre "Fichar entrada" y "Fichar salida" según tu estado, y mientras trabajas tienes "Pausa" y "Reanudar" para los descansos. Cada marca queda registrada con su hora exacta y la ves listada debajo.',
      captura: '/manuals/mi-jornada/fichar.png',
    },
    {
      titulo: 'El resumen de tu día (Chispa)',
      texto: 'La tarjeta "Resumen de tu día" muestra de entrada tus cifras de hoy. Pulsa "Analizar mi día" y Chispa revisa tus citas para señalarte huecos aprovechables (incluidos los tiempos de reposo de un tinte) y posibles retrasos. En móvil la tarjeta viene plegada: tócala para abrirla.',
    },
    {
      titulo: 'Cambiar de periodo y vista',
      texto: 'Los botones "Hoy", "Semana" y "Mes" cambian el rango de las estadísticas. Si tu cuenta es de propietario o administración aparece además el conmutador "Mi jornada" / "Equipo", con el ranking de todo el personal ordenable por dinero, servicios, horas o productividad.',
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
