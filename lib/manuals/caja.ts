import type { ManualContent } from './types';

export const manualCaja: ManualContent = {
  pageKey: 'caja',
  tituloPagina: 'Caja',
  avisoTexto: 'Aquí cobras las citas completadas, controlas el arqueo del día y vendes productos, bonos y tarjetas regalo.',
  secciones: [
    {
      titulo: 'Cobrar una cita',
      texto: 'Marca una o varias citas de la lista con la casilla de selección y pulsa "Cobrar". El importe ya descuenta cualquier señal pagada por adelantado. Cobrar desde Caja está reservado al propietario y a dirección.',
      captura: '/manuals/caja/cobrar.png',
    },
    {
      titulo: 'Cobros que no vienen de una cita',
      texto: 'Arriba a la derecha: "Cobro rápido" (un cliente sin reserva), "Vender producto", "Vender bono" y "Vender tarjeta regalo".',
      captura: '/manuals/caja/cobro-rapido.png',
      highlight: { top: '10%', left: '74%', width: '25%', height: '6%' },
    },
    {
      titulo: 'Arqueo del día',
      texto: 'Las tarjetas resumen ("Cobrado hoy", "Efectivo", "Datáfono", "Propinas" e "IVA estim.") muestran lo cobrado hoy en tiempo real. Solo las ve el propietario o dirección del salón.',
      captura: '/manuals/caja/arqueo.png',
      highlight: { top: '21%', left: '36%', width: '47%', height: '13%' },
    },
    {
      titulo: 'Presupuestos y cobros online',
      texto: 'Los presupuestos aceptados aparecen aquí como pendientes, con su propio botón "Cobrar". En "Cobros online de hoy" ves lo pagado por enlace o señal, con la opción de "Reembolsar" si hace falta.',
    },
    {
      titulo: 'Registros descargables',
      texto: 'El botón "Cobros (CSV)", en el bloque "Exportar registros del día", descarga los cobros completados hoy, listo para llevar a gestoría. Los fichajes del equipo se descargan desde "Mi jornada".',
    },
  ],
};
