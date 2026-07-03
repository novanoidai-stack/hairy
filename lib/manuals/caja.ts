import type { ManualContent } from './types';

export const manualCaja: ManualContent = {
  pageKey: 'caja',
  tituloPagina: 'Caja',
  avisoTexto: 'Aquí cobras las citas completadas, controlas el arqueo del día y registras ventas o fichajes del equipo.',
  secciones: [
    {
      titulo: 'Cobrar una cita',
      texto: 'Marca una o varias citas de la lista con la casilla de selección y pulsa "Cobrar". El importe ya descuenta cualquier señal pagada por adelantado.',
      captura: '/app/manuals/caja/cobrar.png',
    },
    {
      titulo: 'Cobro rápido y venta de producto',
      texto: 'Los botones "Cobro rápido" y "Vender producto", arriba a la derecha, sirven para cobros que no vienen de una cita: un cliente sin reserva o la venta de un producto suelto.',
      captura: '/app/manuals/caja/cobro-rapido.png',
    },
    {
      titulo: 'Arqueo del día',
      texto: 'Las tarjetas resumen (efectivo, datáfono, propinas) muestran lo cobrado hoy en tiempo real. Solo las ve el propietario o dirección del salón.',
      captura: '/app/manuals/caja/arqueo.png',
    },
    {
      titulo: 'Registros descargables',
      texto: 'El botón de descarga exporta un CSV con los cobros y fichajes del periodo seleccionado, listo para llevar a gestoría.',
    },
  ],
};
