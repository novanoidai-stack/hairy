import type { ManualContent } from './types';

export const manualInformes: ManualContent = {
  pageKey: 'informes',
  tituloPagina: 'Informes',
  avisoTexto: 'Aquí ves cómo va el salón: ingresos, citas, fidelización de clientes y comisiones. Cada gráfica se explica sola debajo, y todo se exporta a PDF o CSV.',
  secciones: [
    {
      titulo: 'Elegir el periodo',
      texto: 'Los botones de arriba a la derecha ("Hoy", "Semana", "Mes", "3 Meses" y "Anual") cambian el rango: los KPIs y las gráficas se recalculan sobre él. El eje de tiempo de las gráficas se ajusta solo (Hoy va por horas, Semana y Mes por días, 3 Meses por semanas y Anual por meses), así que no hay un segundo filtro que cuadrar. Dos excepciones: los bloques de gastos y de liquidaciones trabajan siempre por meses con su propio selector, y la sección de fidelización usa 13 meses de historial pase lo que pase con este filtro, porque el ciclo de visitas de un cliente no cabe en una semana.',
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
      titulo: 'Leer las gráficas sin pelearte con ellas',
      texto: 'Cada gráfica lleva dos ayudas distintas y conviene no confundirlas. El icono "i" del título explica QUÉ mide y para qué sirve, y no cambia nunca. La banda de debajo dice qué está diciendo ESA gráfica con tus datos: el mejor día con su cifra, el más flojo, tu nivel normal y si la segunda mitad del periodo va por encima o por debajo de la primera. La línea de puntos gris que cruza la gráfica es tu media del periodo, para saber si un pico fue un buen día o un milagro. Si pasas el cursor o tocas un punto sale la fecha exacta, la cifra y la variación respecto al punto anterior.',
    },
    {
      titulo: 'Fidelización: si el salón mejora o no',
      texto: 'Es la sección que responde a la pregunta de verdad: no cuánta gente entra, sino cuánta se queda. La línea de "base fidelizada" cuenta, al cierre de cada mes, los clientes que ya habían venido dos veces o más y seguían vivos (con visita en los últimos 90 días); si esa línea sube, el salón va bien. Debajo, "cada cuánto vuelven" da la mediana de días entre visitas, separando a los fieles de los que solo vinieron dos veces, y por servicio, porque un color y un corte tienen ciclos distintos. Se da la mediana y no la media porque un cliente que reaparece al año y medio infla la media. El embudo enseña cuántos de los clientes nuevos del periodo volvieron una segunda vez y cuántos llegaron a tres. Y plegado abajo está el análisis por cohortes, para cuando quieras entrar al detalle.',
    },
    {
      titulo: 'Comisiones y liquidaciones',
      texto: 'Hay tres escenarios. "Como lo tienes" aplica a cada profesional el porcentaje de su ficha de Equipo, y marca con "sin config." a quien no lo tenga puesto (a ese se le aplica el general). "Simular un % único" y "Simular por tramos" no cambian nada: solo te dicen qué pasaría, y comparan contra lo que tienes hoy en euros y en puntos de margen. Todo se calcula sobre la base SIN IVA, porque el IVA es de Hacienda y no del salón. Además del bruto verás "te cuesta", que le suma la cuota patronal de la Seguridad Social: un empleado no cuesta su sueldo, cuesta un 32 % más. La etiqueta "real" indica que la cifra salió de cobros de Caja y "estim." que se estimó con los precios del catálogo. Más abajo, "Liquidaciones de comisiones" trabaja mes a mes: genera el cierre, expórtalo a CSV y márcalo como pagado.',
    },
    {
      titulo: 'Gastos del negocio',
      texto: 'En el bloque de gastos registras los fijos y variables de cada mes. Son los que convierten los ingresos en margen real, así que sin ellos el margen que ves está incompleto.',
    },
    {
      titulo: 'Control horario',
      texto: 'Es el registro de jornada del equipo, el que tienes que poder enseñar si te lo piden. Eliges el mes, filtras por persona si quieres, y ves entrada, salida, pausas y horas totalizadas de cada día, más el resumen por persona que se adjunta al recibo de salarios. Se descarga en PDF (informe completo con el detalle de asientos) o en CSV. Los fichajes llevan la hora del servidor, no se pueden editar ni borrar y se conservan cuatro años; si hay que arreglar algo se hace con una corrección que necesita el visto bueno de la empresa y de la persona trabajadora, y deja escrito quién, cuándo y por qué. Los días marcados como incidencia son aquellos en los que falta la marca de salida: conviene regularizarlos. "Verificar integridad" recalcula la cadena de huellas y confirma que nadie ha tocado el registro por fuera de la aplicación.',
    },
    {
      titulo: 'Exportar',
      texto: 'Los botones "CSV" y "Descargar PDF" arriba a la derecha generan un informe descargable del periodo seleccionado. El PDF se abre en una pestaña nueva lista para imprimir o guardar: necesitas permitir las ventanas emergentes.',
    },
  ],
};
