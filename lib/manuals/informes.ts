import type { ManualContent } from './types';

export const manualInformes: ManualContent = {
  pageKey: 'informes',
  tituloPagina: 'Informes',
  avisoTexto: 'Aquí ves cómo va el salón: ocupación, ingresos, comisiones y no-shows, con exportación a PDF o CSV.',
  secciones: [
    {
      titulo: 'Elegir el periodo',
      texto: 'El selector de arriba cambia el rango del informe (semana, mes...). Todo lo demás en la pantalla se recalcula sobre ese periodo.',
      captura: '/manuals/informes/kpis.png',
    },
    {
      titulo: 'Ocupación e ingresos',
      texto: 'Ocupación mide cuánto de tu horario disponible se llena de citas. Ingresos suma el precio de los servicios completados (no cuenta cancelaciones ni no-shows) y lo desglosa por profesional, servicio y cliente.',
    },
    {
      titulo: 'Comisiones y liquidaciones',
      texto: 'Calcula la comisión estimada de cada profesional según sus servicios completados y su porcentaje configurado. Desde "Liquidaciones" puedes generar el cierre del periodo y marcarlo como pagado.',
    },
    {
      titulo: 'Exportar',
      texto: 'Los botones "CSV" y "Descargar PDF" arriba a la derecha generan un informe descargable con los datos del periodo seleccionado.',
    },
  ],
};
