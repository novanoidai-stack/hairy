import type { ManualContent } from './types';

export const manualCampanas: ManualContent = {
  pageKey: 'campanas',
  tituloPagina: 'Campañas',
  avisoTexto: 'Aquí preparas envíos masivos a un grupo de clientas: reactivar dormidas, difundir una oferta o premiar a las mejores.',
  secciones: [
    {
      titulo: 'Empezar por una plantilla',
      texto: 'Las tres tarjetas de arriba ("Reactivar clientas dormidas", "Difundir una oferta" y "Premiar a las mejores") rellenan de golpe el segmento y un mensaje base. Es la forma más rápida de empezar: luego lo editas todo a tu gusto.',
    },
    {
      titulo: 'Elegir a quién le llega (segmento)',
      texto: 'En "¿A quién? (segmento)" defines el grupo con cuatro criterios que se combinan: días sin volver, visitas mínimas, ticket medio mínimo y una etiqueta concreta. Déjalos vacíos para llegar a toda tu clientela con contacto.',
    },
    {
      titulo: 'El contador en vivo',
      texto: 'Justo debajo del segmento verás cuántas clientas recibirán la campaña. Se recalcula solo cada vez que tocas un criterio o cambias de canal, así sabes el alcance real antes de enviar nada.',
    },
    {
      titulo: 'Escribir el mensaje',
      texto: 'Escribe el texto en "Mensaje" y usa {nombre} donde quieras que aparezca el nombre de cada clienta. La "Vista previa" de debajo te lo muestra ya personalizado, tal y como lo va a recibir.',
    },
    {
      titulo: 'Encolar la campaña',
      texto: 'El botón "Encolar campaña" la deja preparada con sus destinatarios; el envío real de WhatsApp o correo lo hace después el motor de mensajería. El botón solo se activa cuando hay nombre, mensaje y al menos una destinataria.',
    },
    {
      titulo: 'Seguimiento y cancelación',
      texto: 'En "Tus campañas" ves las que ya has creado con su canal, número de destinatarios y estado. Mientras siga en borrador o encolada puedes cancelarla; una vez enviada, ya no.',
    },
    {
      titulo: 'Quién puede usarlo',
      texto: 'Las campañas solo las gestiona el propietario o la dirección del salón; el resto del equipo no ve esta pantalla.',
    },
  ],
};
