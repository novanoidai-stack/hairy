import type { ManualContent } from './types';

export const manualPresupuestos: ManualContent = {
  pageKey: 'presupuestos',
  tituloPagina: 'Presupuestos',
  avisoTexto: 'Aquí creas presupuestos, los envías en PDF por correo y los cobras en Caja cuando la clienta acepte.',
  secciones: [
    {
      titulo: 'Crear un presupuesto',
      texto: 'Pulsa "Nuevo presupuesto" arriba a la derecha. Añade conceptos (servicios o líneas libres) con su precio; el total se calcula solo.',
      captura: '/manuals/presupuestos/lista.png',
      highlight: { top: '10%', left: '85%', width: '13%', height: '6%' },
    },
    {
      titulo: 'Crearlo escribiéndolo',
      texto: 'En "Crear presupuesto rápido" describe lo que quieres ("presupuesto para María, balayage y corte") y pulsa "Crear": Chispa propone las líneas con los precios de tu catálogo y las abre en el editor para que las revises antes de guardar.',
    },
    {
      titulo: 'Enviarlo a la clienta',
      texto: 'Desde la ficha puedes descargarlo en PDF o pulsar "Enviar por correo" (necesita el email del cliente; al enviarlo pasa a estado "Enviado"). Para mandarlo por WhatsApp usa el icono de enlace de la fila en la lista: copia el enlace y pégalo tú en el chat.',
    },
    {
      titulo: 'Filtrar por estado',
      texto: 'Los chips "Todos", "Borradores", "Enviados", "Aceptados" y "Cobrados" filtran la lista según en qué punto está cada presupuesto; los rechazados y caducados solo aparecen en "Todos". Al lado tienes un buscador por nombre, número o título.',
    },
    {
      titulo: 'Presupuestos sin respuesta',
      texto: 'Si uno enviado lleva tres días o más sin contestación, aparece arriba en el aviso de presupuestos sin respuesta, con un botón "Reenviar" que se lo manda otra vez por correo.',
    },
    {
      titulo: 'Cobrar un presupuesto aceptado',
      texto: 'Cuando la clienta lo acepta, aparece automáticamente en Caja como pendiente de cobro: se cobra con el mismo botón "Cobrar" que una cita normal.',
    },
  ],
};
