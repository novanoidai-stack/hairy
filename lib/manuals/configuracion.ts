import type { ManualContent } from './types';

export const manualConfiguracion: ManualContent = {
  pageKey: 'configuracion',
  tituloPagina: 'Configuración',
  avisoTexto: 'Aquí ajustas cómo funciona tu salón: datos del negocio, horarios, servicios, notificaciones y reserva online.',
  secciones: [
    {
      titulo: 'Cómo se organiza',
      texto: 'El menú de la izquierda agrupa los ajustes por bloques (General, Horarios, Servicios, Notificaciones, Reserva online, Cuenta...). Elige uno para ver y editar sus opciones.',
      captura: '/manuals/configuracion/menu.png',
    },
    {
      titulo: 'Guardar cambios',
      texto: 'Mientras editas, arriba a la derecha verás "Cambios sin guardar". Pulsa "Guardar cambios" para aplicarlos, o "Descartar" para volver atrás.',
    },
    {
      titulo: 'Datos del negocio y horarios',
      texto: 'En "General" están el nombre, dirección y contacto del salón. En "Horarios" defines los días y franjas en que el salón abre, que acotan lo que ofrece la reserva online.',
      captura: '/manuals/configuracion/general.png',
    },
    {
      titulo: 'Servicios y precios',
      texto: 'Da de alta cada servicio con su precio y duración, y ajusta variaciones por profesional si algunos tardan distinto o cobran distinto por el mismo servicio.',
    },
    {
      titulo: 'Reserva online y notificaciones',
      texto: 'Activa el portal de reserva pública con su propio enlace, y configura qué recordatorios o avisos por WhatsApp se envían automáticamente a tus clientes.',
    },
  ],
};
