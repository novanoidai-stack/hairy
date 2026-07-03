import type { ManualContent } from './types';

export const manualPresupuestos: ManualContent = {
  pageKey: 'presupuestos',
  tituloPagina: 'Presupuestos',
  avisoTexto: 'Aquí creas presupuestos, los envías en PDF por correo y los cobras en Caja cuando la clienta acepte.',
  secciones: [
    {
      titulo: 'Crear un presupuesto',
      texto: 'Pulsa "Nuevo presupuesto" arriba a la derecha. Añade conceptos (servicios o líneas libres) con su precio; el total se calcula solo.',
      captura: '/app/manuals/presupuestos/lista.png',
    },
    {
      titulo: 'Enviarlo a la clienta',
      texto: 'Desde la ficha del presupuesto puedes descargarlo en PDF, enviarlo por correo o copiar un enlace para mandarlo por WhatsApp.',
    },
    {
      titulo: 'Filtrar por estado',
      texto: 'Los chips "Borradores", "Enviados", "Aceptados" y "Cobrados" filtran la lista según en qué punto está cada presupuesto.',
    },
    {
      titulo: 'Cobrar un presupuesto aceptado',
      texto: 'Cuando la clienta lo acepta, aparece automáticamente en Caja como pendiente de cobro: se cobra con el mismo botón "Cobrar" que una cita normal.',
    },
  ],
};
