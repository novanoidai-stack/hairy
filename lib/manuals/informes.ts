import type { ManualContent } from './types';

export const manualInformes: ManualContent = {
  pageKey: 'informes',
  tituloPagina: 'Informes',
  avisoTexto: 'Aquí ves cómo va el salón: ingresos, distribución de citas, comisiones y no-shows, con exportación a PDF o CSV.',
  secciones: [
    {
      titulo: 'Elegir el periodo',
      texto: 'Los botones de arriba a la derecha ("Semana", "Mes", "3 Meses" y "Anual") cambian el rango: los KPIs y las gráficas se recalculan sobre él. Los bloques de gastos y de liquidaciones son la excepción: trabajan siempre por meses y tienen su propio selector.',
      captura: '/manuals/informes/kpis.png',
      highlight: { top: '11%', left: '57%', width: '40%', height: '5%' },
    },
    {
      titulo: 'Ingresos estimados y cobrado real',
      texto: '"Ingresos" suma el precio de catálogo de todas las citas vivas del periodo (pendientes, confirmadas y completadas), sin contar cancelaciones ni no-shows, y se desglosa por profesional, servicio y cliente. Si registras cobros en Caja verás además "Cobrado (real)", que es la cifra buena, y el margen aproximado tras los gastos.',
    },
    {
      titulo: 'Distribución de citas',
      texto: 'Reparte tus citas por profesional, franja horaria y día de la semana. Los porcentajes son sobre el total de citas del periodo, no sobre las horas que tienes disponibles.',
    },
    {
      titulo: 'Comisiones y liquidaciones',
      texto: 'La tabla de comisiones aplica un mismo porcentaje a todo el equipo: lo eliges en pantalla (20, 25, 30, 35, 40 % u otro) y se calcula sobre la base sin IVA; la etiqueta "real" indica que salió de cobros de Caja y "estim." que se estimó por catálogo. Más abajo, "Liquidaciones de comisiones" trabaja mes a mes: genera el cierre, expórtalo a CSV y márcalo como pagado.',
    },
    {
      titulo: 'Gastos del negocio',
      texto: 'En el bloque de gastos registras los fijos y variables de cada mes. Son los que convierten los ingresos en margen real, así que sin ellos el margen que ves está incompleto.',
    },
    {
      titulo: 'Exportar',
      texto: 'Los botones "CSV" y "Descargar PDF" arriba a la derecha generan un informe descargable del periodo seleccionado. El PDF se abre en una pestaña nueva lista para imprimir o guardar: necesitas permitir las ventanas emergentes.',
    },
  ],
};
