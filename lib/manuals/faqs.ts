export interface FAQItem {
  id: string;
  pregunta: string;
  respuesta: string;
  categoria: 'primeros_pasos' | 'configuracion' | 'agenda' | 'caja' | 'equipo' | 'reserva' | 'mensajes' | 'bonos' | 'planes' | 'ia';
  linkManualKey?: string;
}

export const FAQS_INICIALES: FAQItem[] = [
  // ── 1. PRIMEROS PASOS E IMPORTACIÓN ──
  {
    id: 'importar-datos',
    categoria: 'primeros_pasos',
    pregunta: '¿Cómo importo mi agenda, clientes y catálogo de servicios desde otro programa?',
    respuesta: 'En Mecha tienes la herramienta "Migración Mágica" en Configuración > Migración Mágica. Puedes subir un archivo CSV exportado de programas como Booksy, Fresha o Square, o incluso subir una foto/PDF de tu lista de precios o albarán. La Inteligencia Artificial extraerá todos los nombres, precios y teléfonos e importará los datos en bloque en pocos segundos.',
    linkManualKey: 'configuracion',
  },
  {
    id: 'primeros-pasos-donde-empezar',
    categoria: 'primeros_pasos',
    pregunta: '¿Por dónde empiezo a configurar mi salón al entrar por primera vez?',
    respuesta: 'Te recomendamos seguir estos 3 sencillos pasos: 1) Da de alta o revisa tus servicios y precios en Configuración > Servicios. 2) Añade a tu equipo en la sección Equipo. 3) Ajusta tus horarios de apertura en Configuración > Horarios. Si quieres, también puedes decírselo a Chispa por chat ("configúrame el salón") y te guiará paso a paso.',
    linkManualKey: 'configuracion',
  },
  {
    id: 'acceso-empleados',
    categoria: 'primeros_pasos',
    pregunta: '¿Cómo hago para que mis empleados y equipo puedan acceder al software?',
    respuesta: 'Tienes 2 opciones según cómo trabajéis: A) Modo Compartido (para tablet/PC del salón): Inicias sesión con la cuenta del salón y en pantalla aparece "¿Quién eres?". Cada empleado toca su nombre. El dueño protege la caja e informes configurando un PIN. B) Modo Individual (para móviles de cada empleado): En la sección Equipo pulsa "Invitar a alguien", pon su correo y elegirá su propia contraseña.',
    linkManualKey: 'equipo',
  },

  // ── 2. ROLES Y RECEPCIONISTAS ──
  {
    id: 'roles-recepcionistas',
    categoria: 'equipo',
    pregunta: '¿Qué son los recepcionistas y qué diferencia hay entre los roles del equipo?',
    respuesta: 'Los roles determinan qué puede ver y tocar cada trabajador en Mecha: 1) Profesional: Solo ve su propia agenda y sus fichas de clientes. 2) Recepción: Gestiona la agenda global de todo el salón y cobros, pero no toca configuración ni informes. 3) Dirección: Accede además a gestión de equipo, informes y ajustes. 4) Propietario: Acceso total a caja, suscripción, PIN y datos fiscales.',
    linkManualKey: 'equipo',
  },
  {
    id: 'proteger-pin',
    categoria: 'equipo',
    pregunta: '¿Cómo protejo la caja y los informes si compartimos tablet en el salón?',
    respuesta: 'Ve a Configuración > Accesos y roles y activa el PIN de Propietario (4 a 8 dígitos). Al estar en Modo Compartido, cualquiera puede identificarse como su ficha de empleado para meter sus citas, pero si alguien intenta entrar como "Propietario" o "Dirección", Mecha le pedirá el PIN obligatorio.',
    linkManualKey: 'equipo',
  },

  // ── 3. RESERVA ONLINE Y SEÑALES ──
  {
    id: 'link-reservas-online',
    categoria: 'reserva',
    pregunta: '¿Dónde está mi link de reservas online para ponerlo en Instagram, WhatsApp o Web?',
    respuesta: 'Tu enlace público de reserva se encuentra en Configuración > Reserva online. Desde ahí puedes copiar tu dirección web personalizada (ej: mi-salon.mecha.app) para ponerla en la bio de tu Instagram, en el botón de reservar de Google Maps o enviarla por WhatsApp a tus clientas.',
    linkManualKey: 'configuracion',
  },
  {
    id: 'configurar-senal',
    categoria: 'reserva',
    pregunta: '¿Cómo configuro o creo la señal (depósito previo) para asegurar las reservas y evitar no-shows?',
    respuesta: 'En Configuración > Reserva online tienes la opción "Cobro de señal". Puedes activar la pasarela de pago (con Stripe) y definir qué porcentaje o importe fijo de depósito debe abonar el cliente al reservar online (ej: 20% o 10€). Si el cliente no acude, la señal queda registrada a tu favor. En la cita se descuenta automáticamente el importe pagado.',
    linkManualKey: 'configuracion',
  },

  // ── 4. MENSAJES Y RECORDATORIOS ──
  {
    id: 'recordatorios-clientes',
    categoria: 'mensajes',
    pregunta: '¿Le llegan recordatorios automáticos a mis clientes para confirmar sus citas?',
    respuesta: 'Sí. Mecha envía recordatorios automáticos por WhatsApp y/o Email 24 o 48 horas antes de la cita (puedes ajustar la antelación en Configuración > Notificaciones). El cliente recibe un mensaje con los datos de su cita y un botón para confirmar o avisar si no puede asistir, actualizando el estado de la agenda en tiempo real.',
    linkManualKey: 'bandeja',
  },
  {
    id: 'enviar-mensaje-personalizado',
    categoria: 'mensajes',
    pregunta: '¿Cómo le envío un mensaje personalizado a un cliente concreto o a todos a la vez?',
    respuesta: 'A) A un cliente concreto: Ve a la ficha de la clienta en Clientes o en Bandeja y pulsa el icono de WhatsApp para abrir el chat directo o mandarle un mensaje predeterminado. B) A todos o a un grupo (masivo): Ve a la sección Campañas, filtra por segmento (ej: clientas que no vienen hace 60 días, VIPs, o todas) y redacta la campaña de envío masivo.',
    linkManualKey: 'campanas',
  },

  // ── 5. COBROS, BONOS Y TARJETAS REGALO ──
  {
    id: 'bonos-tarjetas-regalo',
    categoria: 'caja',
    pregunta: '¿Cómo funcionan los bonos de sesiones, tarjetas de regalo y descuentos?',
    respuesta: '1) Bonos de sesiones: Se venden desde Caja o Clientes. Al cobrar un servicio, el sistema detecta si la clienta tiene un bono activo del servicio y descuenta 1 sesión automáticamente. 2) Tarjetas de regalo: Se emiten con un importe (ej: 50€). El cliente la canjea en caja introduciendo el código y se le descuenta del saldo. 3) Descuentos: En la pantalla de cobro en Caja puedes aplicar descuentos en porcentaje (%) o cantidad fija (€) a la línea o al total del ticket.',
    linkManualKey: 'caja',
  },
  {
    id: 'cierre-caja',
    categoria: 'caja',
    pregunta: '¿Cómo hago el arqueo y cierre de caja al terminar el día?',
    respuesta: 'En la pestaña Caja, pulsa el botón "Cerrar caja". Mecha calculará los totales cobrados en efectivo, tarjeta y otros medios. Introduces el efectivo real de tu cajón y el sistema te generará el informe de cierre indicando si hay descuadres antes de dar por cerrado el día.',
    linkManualKey: 'caja',
  },

  // ── 6. PLANES DE SUSCRIPCIÓN Y ADDON DE IA ──
  {
    id: 'planes-diferencias',
    categoria: 'planes',
    pregunta: '¿Qué ofrecen exactamente los planes (Esencial y Estudio) de Mecha?',
    respuesta: 'Todos los planes de pago de Mecha incluyen el SOFTWARE COMPLETO del salón: Agenda ilimitada, Fichas de Clientes, Caja, Cobro de Señales con Stripe, Campañas de Marketing, Lista de Espera, Presupuestos, Inventario y Facturación legal. La diferencia principal entre planes radica en el volumen y plazas de profesionales activos en tu agenda.',
    linkManualKey: 'configuracion',
  },
  {
    id: 'addon-ia-chispa',
    categoria: 'ia',
    pregunta: '¿Qué incluye el Addon de Inteligencia Artificial (Chispa) y la IA por Voz?',
    respuesta: 'El Addon de IA es una mejora opcional que añade a tu salón: 1) Chispa por WhatsApp: Asistente que atiende chats, escanea tu salón 24/7 en busca de riesgos de cancelación o stock bajo, y redacta respuestas y promociones. 2) Contestador por Voz (IA): La IA puede atender las llamadas telefónicas de tu salón, hablar con las clientas y agendarles cita de voz de forma autónoma sin que tengas que descolgar el teléfono.',
    linkManualKey: 'chispa',
  },
  {
    id: 'permanencia-cambio-plan',
    categoria: 'planes',
    pregunta: '¿Hay permanencia o puedo cambiar de plan en cualquier momento?',
    respuesta: 'Sin ninguna permanencia. Puedes ampliar tus profesionales, activar o desactivar el Addon de IA o cambiar tu plan en cualquier momento desde Configuración > Cuenta o poniéndote en contacto con nuestro equipo.',
    linkManualKey: 'configuracion',
  },
];
