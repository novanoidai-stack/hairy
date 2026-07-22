import type { ManualContent } from './types';

export const manualConfiguracion: ManualContent = {
  pageKey: 'configuracion',
  tituloPagina: 'Configuración',
  avisoTexto: 'Aquí ajustas cómo funciona tu salón: datos del negocio, horarios, servicios, notificaciones y reserva online.',
  secciones: [
    {
      titulo: 'Cómo se organiza',
      texto: 'El menú lateral agrupa los ajustes en cuatro bloques (Negocio, Operativa, Comunicación y Cuenta) con sus apartados dentro: General, Horarios, Servicios, Agenda, Comisiones, Notificaciones, Reserva online, Accesos y roles... Elige uno para ver y editar sus opciones. En móvil el menú ocupa la pantalla y se abre el apartado al tocarlo.',
      captura: '/manuals/configuracion/menu.png',
    },
    {
      titulo: 'Guardar cambios',
      texto: 'Arriba a la derecha verás "Todo guardado" o, en cuanto toques algo, "Cambios sin guardar". Pulsa "Guardar cambios" ("Guardar" en móvil) para aplicarlos, o "Descartar" para volver atrás.',
    },
    {
      titulo: 'Datos del negocio y horarios',
      texto: 'En "General" están el nombre, dirección y contacto del salón. En "Horarios" defines los días y franjas en que el salón abre, más los festivos y cierres: la reserva online no ofrece huecos esos días.',
      captura: '/manuals/configuracion/general.png',
      highlight: { top: '33%', left: '33%', width: '65%', height: '44%' },
    },
    {
      titulo: 'Servicios y precios',
      texto: 'Da de alta cada servicio con su precio y duración, y ajusta variaciones por profesional si algunos tardan distinto o cobran distinto por el mismo servicio.',
    },
    {
      titulo: 'Reserva online y notificaciones',
      texto: 'Activa el portal de reserva pública con su propio enlace, y configura qué recordatorios o avisos por WhatsApp se envían automáticamente a tus clientes.',
    },
    {
      titulo: 'Cobros, señales y roles',
      texto: 'En los apartados de cobro conectas la pasarela de pago, decides si pides señal (y a quién, según el riesgo) y ajustas propinas y fiscalidad. En "Accesos y roles" das de alta las cuentas de tu equipo y eliges qué ve cada rol: Propietario, Dirección, Recepción o Profesional.',
    },
    {
      titulo: 'Chispa (Asistente de IA)',
      texto: 'Chispa es el asistente de inteligencia artificial que atiende dudas y reserva citas por WhatsApp. En "Qué hace la IA" consultas todo lo que puede hacer en tu salón, y en "Voz de Chispa" eliges cómo suena y con qué tono habla.',
    },
  ],
};
