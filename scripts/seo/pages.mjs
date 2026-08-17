// Spec de contenido para las paginas SEO de long-tail (nicho, modulo, comparativa).
// Source-of-truth commiteado en git; el HTML se regenera como artefacto de build.
//
// Cada pagina lleva contenido unico (no plantillas repetidas) orientado a la
// intencion de busqueda del long-tail. El generador produce H1, lead, bloques,
// FAQ visible (que ademas alimenta el JSON-LD FAQPage) y CTA.

export const LANDING_PAGES = [
  /* ============================ NICHOS ============================ */
  {
    slug: 'software-barberia',
    tipo: 'nicho',
    h1: 'Software para barberias: agenda, caja y barba, sin letra pequena',
    title: 'Software para barberias 2026 | Agenda y caja con IA — Mecha',
    description: 'Software para barberias con agenda inteligente, fichajes legales, facturacion VeriFactu y un asistente que atiende WhatsApp por ti. Desde 39 eur/mes, sin comisiones.',
    lead: 'Mecha es el software de gestion pensado para barberias: una agenda que entiende que un afeitado de navaja y un corte no duran lo mismo, una caja que cuadra sola y un asistente de IA que atiende WhatsApp y cobra la senal cuando un cliente pide hora fuera de horario. Sin comisiones por reserva y sin permanencia.',
    bullets: [
      { titulo: 'Agenda que respeta los tiempos reales de la barberia', texto: 'Cada servicio lleva su duracion real. Si un servicio tiene tiempo de reposo (un tinte o tratamiento de barba) o encadena dos manos, la agenda lo coloca solo y te avisa de los huecos muertos que podrias estar aprovechando.' },
      { titulo: 'Barberia y peluqueria en la misma cuenta', texto: 'Si combinas servicio de senor y senora, tarifas de barba, corte y color, todo convive sin duplicar clientes ni agendas. Servicios combinables y precios por profesional.' },
      { titulo: 'Fichaje legal del personal', texto: 'Registro de jornada inalterable que cumple el art. 34.9 del Estatuto de los Trabajadores, con entradas, salidas, pausas y correcciones con doble conformidad. Descargable en PDF para una inspeccion.' },
      { titulo: 'Facturacion VeriFactu en regla', texto: 'Tickets y facturas con cadena AEAT, QR de cotejo y envio a Hacienda. Sin otro programa de facturacion encimado.' },
      { titulo: 'Asistente que atiende WhatsApp 24/7', texto: 'Reserva citas, consulta el catalogo y cobra la senal por Stripe cuando alguien escribe fuera de horario. La barberia sigue vendiendo aunque estes cortando.' },
      { titulo: 'Sin comisiones por reserva', texto: 'No cobramos un porcentaje de cada cita ni de cada cobro. Precios cerrados desde 39 eur/mes, profesionales ilimitados.' }
    ],
    faqs: [
      { q: 'Es Mecha un software solo para barberias o sirve para peluqueria tambien?', a: 'Mecha sirve para barberias, peluquerias mixtas y centros de estetica. Si tu local combina servicio de senor y senora, lo llevas en una sola cuenta con tarifas, profesionales y agenda unificados.' },
      { q: 'Puedo pasar mi agenda de papel o de otro programa a Mecha?', a: 'Si. Puedes importar tus clientes y tu agenda desde Booksy o Fresha en unos 10 minutos, o subir una foto de tu agenda de papel y el importador IA de Mecha la convierte en datos.' },
      { q: 'El registro de jornada de Mecha sirve para una inspeccion de trabajo?', a: 'Si. El fichaje es inalterable, registra hora del servidor, conserva los datos 4 anos y se exporta en PDF/CSV. Las correcciones requieren doble conformidad de empresa y empleado, como pide la norma.' },
      { q: 'Cobra Mecha comision por cada reserva o cobro?', a: 'No. Mecha tiene precios cerrados (Esencial 39 eur/mes, Estudio 59 eur/mes, mas IVA), sin comision por reserva ni por cobro. Puedes cobrar por Stripe, Redsys o Bizum sin que Mecha se lleve un porcentaje.' },
      { q: 'Necesito un datofono aparte para cobrar con tarjeta?', a: 'No es obligatorio. Mecha soporta Stripe Terminal y Tap to Pay (cobro por NFC con el movil), ademas de Redsys/Bizum con el conector de tu TPV y cobro por QR en el local.' }
    ]
  },
  {
    slug: 'software-estetica',
    tipo: 'nicho',
    h1: 'Software para centros de estetica y belleza: agenda, senales y fichas',
    title: 'Software para centros de estetica 2026 | Con IA — Mecha',
    description: 'Software para centros de estetica y belleza: agenda con senal anti no-show, fichas tecnicas, caja, campañas y facturacion VeriFactu. Desde 39 eur/mes, sin comisiones.',
    lead: 'Mecha lleva la operativa de los centros de estetica y belleza: una agenda que no se come los huecos de los servicios largos, senales que eliminan las citas que no se presentan, fichas tecnicas de cada clienta y un asistente de IA que atiende WhatsApp y cobra por ti. Todo en un solo software, sin comisiones por reserva.',
    bullets: [
      { titulo: 'Senal anti no-show que protege tu agenda', texto: 'Deposito obligatorio por enlace (Stripe) configurable por perfil de riesgo: clientas VIP sin senal, nuevas con un 20% y reincidentes en no-show con el 100%. Si no vienen, cobras el hueco.' },
      { titulo: 'Fichas tecnicas y memoria de cada tratamiento', texto: 'Alergias y alertas sanitarias visibles, fotos antes/despues, historial de servicios y productos de homecare recomendados. Todo en la ficha de la clienta.' },
      { titulo: 'Agenda para servicios largos y combinados', texto: 'Tiempos de reposo aprovechados (mientras un producto actua, atiendes a otra clienta) y servicios que encadenan varias manos sin descoordinar el dia.' },
      { titulo: 'Campañas y fidelizacion', texto: 'Reactiva a tus clientas con campañas de WhatsApp, cumpleanos automatizados, bonos, tarjetas regalo y un programa de fidelizacion por niveles y referidos.' },
      { titulo: 'Caja, informes y VeriFactu integrados', texto: 'Cobro multi-pago (efectivo, tarjeta, bono), arqueo, informes de ingresos por profesional/servicio y facturacion oficial AEAT con QR de cotejo. Un solo programa, no cinco.' },
      { titulo: 'Asistente de IA por WhatsApp y voz', texto: 'Da cita, contesta dudas y cobra la senal fuera de horario. Opcional y aparte del plan: se activa o se apaga cuando quieras.' }
    ],
    faqs: [
      { q: 'Sirve Mecha para un centro de estetica con varias salas y profesionales?', a: 'Si. Cada profesional es una columna de agenda con sus servicios, duraciones, precios y horarios. Los servicios largos y los que combinan varias manos se colocan sin solaparse, y ves el salon completo en una sola pantalla.' },
      { q: 'Como evito que las clientas no se presenten?', a: 'Con la senal anti no-show: activas el deposito por enlace (Stripe) y lo ajustas por perfil de riesgo. Ademas, los recordatorios automaticos por WhatsApp reducen los olvidos y avisan al salon de las reservas de riesgo.' },
      { q: 'Puedo gestionar bonos, tarjetas regalo y campañas desde Mecha?', a: 'Si. Venta y consumo de bonos, tarjetas regalo con movimientos, campañas de WhatsApp segmentadas, cumpleanos automaticos y un programa de fidelizacion con niveles, logros y referidos.' },
      { q: 'Mecha cumple el RGPD para tratar datos de salud/estetica?', a: 'Mecha gestiona consentimientos, anonimizacion y retencion, lleva auditoria inmutable de registros y te permite exportar o eliminar los datos de una clienta (derecho al olvido) bajo RGPD.' },
      { q: 'Tengo que pagar comision por cada reserva?', a: 'No. Precios cerrados (Esencial 39 eur/mes, Estudio 59 eur/mes, mas IVA), sin comision por reserva ni por cobro. Las senales y los cobros van por tu Stripe o tu Redsys/Bizum.' }
    ]
  },
  {
    slug: 'software-unas-manicura',
    tipo: 'nicho',
    h1: 'Software para salones de manicura y unas: micro-citas y senales sin comision',
    title: 'Software para salones de manicura y unas 2026 | Con IA — Mecha',
    description: 'Software para salones de unas, manicura y pedicura: agenda rapida, senales por Stripe para eliminar no-shows, recordatorios por WhatsApp y caja. Desde 39 eur/mes.',
    lead: 'En los salones de unas y nail art, cada 15 minutos cuentan. Mecha te ofrece una agenda visual que encaja micro-servicios, pedicuras y decoraciones sin solapes, cobra senal automatica para evitar ausencias y atiende WhatsApp con IA 24/7 sin interrumpir tu trabajo.',
    bullets: [
      { titulo: 'Micro-slots para servicios express', texto: 'Configura citas de 15, 30 o 45 minutos segun el tipo de manicura (semipermanente, acrilico, gel o express) y combina servicios adicionales (retirada, decoracion) sin desajustar el horario.' },
      { titulo: 'Senales anti no-show para proteger tus huecos', texto: 'Cobra una senal por Stripe a clientas nuevas o con historial de ausencias. Si no asisten, el hueco queda compensado y la lista de espera se activa sola.' },
      { titulo: 'WhatsApp con IA que atiende mientras trabajas', texto: 'Chispa responde dudas de precios, muestra huecos libres y reserva citas mientras tienes las manos ocupadas con una clienta.' },
      { titulo: 'Fichas con fotos de disenos y preferencias', texto: 'Guarda fotos de disenos anteriores, colores favoritos y sensibilidades en la ficha de cada clienta para dar un servicio personalizado.' },
      { titulo: 'Facturacion VeriFactu y control de caja', texto: 'Cobro por tarjeta, Bizum o efectivo con tickets homologados por la AEAT y arqueo diario sin errores.' }
    ],
    faqs: [
      { q: 'Puedo combinar retirada de esmalte y manicura en una sola cita?', a: 'Si. Mecha permite anadir complementos (add-ons) y servicios encadenados para que la clienta reserve el servicio principal y los extras con su duracion real calculada.' },
      { q: 'Como ayuda Mecha a evitar las cancelaciones de ultima hora?', a: 'Con el cobro de fianza/senal por enlace de Stripe y recordatorios interactivos por WhatsApp 24h antes que permiten confirmar o reagendar con un solo clic.' },
      { q: 'Cobra Mecha un porcentaje de mis cobros de unas?', a: 'No. Tarifa plana desde 39 eur/mes sin comisiones por cita ni por volumen de facturacion.' }
    ]
  },
  {
    slug: 'software-peluqueria-canina',
    tipo: 'nicho',
    h1: 'Software para peluquerias caninas y estetica de mascotas: citas por raza y tamano',
    title: 'Software para peluqueria canina 2026 | Agenda y gestion — Mecha',
    description: 'Software de gestion para peluquerias caninas: agenda con tiempos de bano y secado por tamano de raza, recordatorios WhatsApp, caja y fichas de mascotas. 0% comisiones.',
    lead: 'La peluqueria canina requiere gestionar tiempos de bano, secador y corte segun el tamano y pelaje de cada mascota. Mecha adapta la agenda a los tiempos de secado (mientras un perro se seca en cabina, puedes banar a otro), lleva el historial de cada mascota y cobra senales para evitar ausencias.',
    bullets: [
      { titulo: 'Tiempos de secado y bano optimizados', texto: 'Aprovecha los tiempos pasivos de secado en cabina para banar o cepillar al siguiente perro, duplicando el flujo de trabajo del salon canino.' },
      { titulo: 'Fichas completas de mascota y propietario', texto: 'Registra raza, peso, caracter, alergias a champus, historial de cortes y telefono del dueno en una ficha unificada.' },
      { titulo: 'Recordatorios por WhatsApp automaticos', texto: 'Avisa a los duenos antes de la cita y envia un mensaje automatico cuando su perro este listo para ser recogido.' },
      { titulo: 'Caja, TPV y productos de higiene', texto: 'Venta de champus, correas y alimentacion integrada con el cobro del servicio de peluqueria.' }
    ],
    faqs: [
      { q: 'Sirve Mecha para peluquerias caninas con varios baneros y estilistas?', a: 'Si. Puedes organizar la agenda por columnas de profesionales o puestos de trabajo (banyeras, mesas de corte) sin solapes.' },
      { q: 'Puedo avisar al dueno cuando su mascota este lista?', a: 'Si. Con un toque desde la agenda envias un WhatsApp notificando que el servicio ha terminado y pueden pasar a recogerla.' }
    ]
  },

  /* ============================ MODULOS ============================ */
  {
    slug: 'verifactu-peluqueria',
    tipo: 'modulo',
    h1: 'Facturacion VeriFactu para peluquerias: tickets AEAT con QR, sin otro programa',
    title: 'VeriFactu para peluquerias | Facturacion AEAT con QR — Mecha',
    description: 'Facturacion VeriFactu para peluquerias y barberias: tickets y facturas con cadena AEAT, QR de cotejo y envio a Hacienda, integrados en tu software de gestion. Sin otro programa.',
    lead: 'Con la obligacion de VeriFactu, los tickets de tu peluqueria tienen que ir a Hacienda con cadena, huella y QR. Mecha lo lleva integrado: cobras en caja y la factura se genera, encadena, firma y envia a la AEAT sin abrir otro programa ni otro datofono fiscal.',
    bullets: [
      { titulo: 'Cadena AEAT con huella SHA-256', texto: 'Cada factura se encadena con la anterior mediante huella SHA-256, segun el esquema RegFactuSistemaFacturacion. Inmutable una vez generada.' },
      { titulo: 'QR de cotejo en cada factura', texto: 'El cliente puede escanear el QR y verificar la factura en el portal de la AEAT. Cumple el formato exigido por la orden HAC.' },
      { titulo: 'Envio automatico de Altas y Anulaciones', texto: 'Mecha genera el XML de Alta y lo envia a la AEAT, gestiona la respuesta y permite anular facturas con su evento correspondiente.' },
      { titulo: 'Modalidad puro VeriFactu', texto: 'Disenado para la modalidad de aseguramiento por el propio sistema del contribuyente, sin depender de terceros para el encadenamiento.' },
      { titulo: 'Todo en tu caja habitual', texto: 'No duplicas operativa: cobras en el TPV de Mecha y la factura fiscal nace del cobro, con el cliente, las lineas y los impuestos correctos.' },
      { titulo: 'Configuracion fiscal y borradores', texto: 'Defines tus datos fiscales, serie, numero, regimen de IVA y generas borradores antes de remitir. Controles de test de cadena incluidos.' }
    ],
    faqs: [
      { q: 'Que es VeriFactu y a quien obliga?', a: 'VeriFactu es el sistema de facturacion verificable aprobado por la Orden HAC/1177/2024 que obliga a determinados contribuyentes (incluidos muchos salones) a remitir los registros de facturacion a la AEAT con encadenamiento y firma. Mecha lo implementa en modalidad puro.' },
      { q: 'Tengo que comprar un datofono fiscal aparte?', a: 'No. Mecha genera la factura VeriFactu directamente desde tu cobro de caja, con el QR y la cadena AEAT. No necesitas un sistema fiscal independiente.' },
      { q: 'Como se encadenan las facturas en Mecha?', a: 'Cada factura lleva una huella SHA-256 calculada a partir de la factura anterior, formando una cadena inmutable que cumple el esquema RegFactuSistemaFacturacion de la AEAT.' },
      { q: 'Puedo anular una factura emitida por error?', a: 'Si. Mecha registra el evento de anulacion correspondiente y lo envia a la AEAT, manteniendo la cadena y la trazabilidad intactas.' },
      { q: 'El VeriFactu de Mecha esta incluido en el precio?', a: 'Si. La facturacion VeriFactu esta dentro del plan Esencial (39 eur/mes mas IVA), junto con la agenda, las fichas, la caja y los informes. Sin modulos extra para facturar en regla.' }
    ]
  },
  {
    slug: 'agenda-inteligente-peluqueria',
    tipo: 'modulo',
    h1: 'Agenda inteligente para peluquerias: tiempos de reposo, servicios encadenados y huecos',
    title: 'Agenda inteligente para peluquerias | Reposo y encadenados — Mecha',
    description: 'La agenda inteligente para peluquerias: detecta tiempos de reposo del tinte, encadena servicios entre profesionales, absorbe retrasos y aprovecha huecos muertos. Sin comisiones.',
    lead: 'La diferencia entre una agenda cualquiera y una agenda inteligente es que esta entiende como trabaja una peluqueria. La de Mecha sabe que mientras un tinte reposa el sillon esta libre para otro cliente, que una cita puede encadenar varias manos y que un retraso no debe arruinar el resto del dia. Todo automatico, decidis vosotros.',
    bullets: [
      { titulo: 'Tiempos muertos productivos', texto: 'Mientras un tinte o una decoloracion reposa, la agenda libera el sillon y te ofrece meter a otro cliente en ese hueco. Tiempo que antes se perdia, ahora se factura.' },
      { titulo: 'Fases de la cita (activo - reposo - activo)', texto: 'Una cita con reposo se divide en sus fases reales. La agenda reserva el segundo bloque del mismo profesional y evita falsos conflictos.' },
      { titulo: 'Servicios encadenados entre profesionales', texto: 'Una clienta que hace color con una y corte con otra entra como una sola visita que fluye por el salon sin descoordinar a nadie.' },
      { titulo: 'Absorbe retrasos en cascada', texto: 'Si una cita se alarga, Mecha calcula el efecto domino, recorta huecos muertos y te propone como recolocar el dia. Propone: decides tu.' },
      { titulo: 'Lista de espera inteligente', texto: 'Cuando se libera un hueco, el sistema ofrece la cita a las clientas en lista de espera que encajan y manda el aviso por WhatsApp.' },
      { titulo: 'Estados de cita en vivo y drag & drop', texto: 'Pendiente, confirmada, en curso, completada, no-show. Mueve citas arrastrando, con validacion de conflictos en tiempo real.' }
    ],
    faqs: [
      { q: 'Que son los tiempos muertos productivos de la agenda?', a: 'Son los tiempos de reposo de un servicio (por ejemplo, un tinte) en los que el sillon queda libre. La agenda de Mecha los detecta y te permite meter a otro cliente en ese hueco, aprovechando tiempo que antes se perdia.' },
      { q: 'Puede la agenda encadenar un color con un corte aunque sean de profesionales distintos?', a: 'Si. Los servicios encadenados multi-profesional permiten que una clienta haga color con una persona y corte con otra como una sola visita, reservando los bloques correctos de cada una.' },
      { q: 'La IA reorganiza mi agenda sin mi permiso?', a: 'No. La IA de Mecha siempre propone y el salon aprueba. Ante un retraso te muestra como recolocar el dia, con preview, y tu decides si lo aplicas.' },
      { q: 'Sirve para evitar las citas que se quedan sin cubrir?', a: 'Si. La lista de espera inteligente empareja huecos libres con clientas en espera y avisa por WhatsApp; los recordatorios automaticos reducen los olvidos.' },
      { q: 'Necesito instalar algo para usar la agenda?', a: 'No. Mecha funciona en web, iOS y Android. La agenda se abre en el navegador del ordenador del salon y en el movil, sin instalar nada.' }
    ]
  },
  {
    slug: 'fichaje-legal-peluqueria',
    tipo: 'modulo',
    h1: 'Fichaje legal para peluquerias: registro de jornada conforme al art. 34.9 ET',
    title: 'Fichaje legal para peluquerias | Registro de jornada art. 34.9 — Mecha',
    description: 'Registro de jornada legal para peluquerias y barberias: fichaje inalterable, entradas/salidas/pausas, correcciones con doble conformidad y exportacion PDF/CSV. Cumple art. 34.9 ET.',
    lead: 'El registro de jornada es obligatorio y debe ser inalterable. Mecha lleva el fichaje legal de tu peluqueria integrado con la agenda: el personal ficha entrada, salida y pausas con hora del servidor, las correcciones requieren doble conformidad y todo se exporta en PDF para una inspeccion de trabajo.',
    bullets: [
      { titulo: 'Registro inalterable', texto: 'Los fichajes no se pueden editar en silencio: cualquier cambio queda registrado. Conservacion de 4 anos, como exige el Estatuto de los Trabajadores.' },
      { titulo: 'Entradas, salidas y pausas', texto: 'El personal ficha con la hora del servidor (no la del dispositivo). Pausas, turnos partidos y horas extras quedan reflejados.' },
      { titulo: 'Correcciones con doble conformidad', texto: 'Para corregir un fichaje hacen falta empresa y empleado; si hay discrepancia, queda registrada. Cumple el criterio de la Inspeccion de Trabajo.' },
      { titulo: 'Exportable a PDF y CSV', texto: 'Descarga el control horario de cualquier periodo (por persona o por salon) en PDF o CSV para entregar en una inspeccion o al asesor laboral.' },
      { titulo: 'Integrado con la agenda', texto: 'El fichaje convive con la agenda de citas: ves jornada y citas del dia en el mismo sitio, sin cambiar de programa.' },
      { titulo: 'Acceso compartido al fichaje', texto: 'Cada empleado ve su propio registro desde su cuenta; la direccion ve el del salon entero, con permisos por rol.' }
    ],
    faqs: [
      { q: 'El registro de jornada de Mecha cumple la ley?', a: 'Si. Es inalterable, con hora del servidor, conserva los datos 4 anos y las correcciones requieren doble conformidad de empresa y empleado. Cumple el art. 34.9 del Estatuto de los Trabajadores y el criterio de la Inspeccion de Trabajo.' },
      { q: 'Como se ficha en Mecha?', a: 'Cada persona ficha la entrada, la salida y las pausas desde su cuenta (en el movil o en el ordenador del salon). La hora es la del servidor, no la del dispositivo, para que no se pueda manipular.' },
      { q: 'Que pasa si hay que corregir un fichaje?', a: 'La correccion necesita conformidad de empresa y empleado. Si hay discrepancia, queda registrada. Nunca se borra la traza del fichaje original.' },
      { q: 'Puedo entregar el control horario en una inspeccion?', a: 'Si. Exportas el control horario del periodo que sea, por persona o por salon, en PDF o CSV listo para presentar a la Inspeccion de Trabajo o al asesor.' },
      { q: 'El fichaje legal va incluido en el plan?', a: 'Si. El registro de jornada esta dentro del plan Esencial (39 eur/mes mas IVA), junto con la agenda, las fichas de cliente, la caja, los informes y la facturacion VeriFactu.' }
    ]
  },
  {
    slug: 'reducir-no-shows-peluqueria',
    tipo: 'modulo',
    h1: 'Reducir los no-shows en peluquerias: senales, recordatorios y deteccion de riesgo',
    title: 'Reducir no-shows en peluquerias | Senales y recordatorios — Mecha',
    description: 'Reduce las ausencias (no-shows) en tu peluqueria con senales por Stripe, recordatorios por WhatsApp y deteccion de clientas de riesgo. Sin comisiones. Desde 39 eur/mes.',
    lead: 'Una clienta que no viene es un hueco que no facturas. Mecha ataca los no-shows en peluqueria desde tres lados: recordatorios automaticos por WhatsApp, senal anti no-show por Stripe (con deposito segun el riesgo de cada clienta) y deteccion temprana de las reservas que tienen pinta de quedarse sin cubrir.',
    bullets: [
      { titulo: 'Senal anti no-show por Stripe', texto: 'Cobro de deposito por enlace, configurable por perfil: clientas VIP sin senal, nuevas con un 20% y reincidentes en no-show con el 50-100%. El hueco deja de ser gratis.' },
      { titulo: 'Depositos dinamicos por riesgo', texto: 'Mecha calcula el riesgo de no-show de cada clienta segun su historial y ajusta el deposito. Fidelidad sin deposito manda sobre el riesgo.' },
      { titulo: 'Recordatorios por WhatsApp', texto: 'Avisos automaticos antes de la cita y, si lo activa el salon, conversacion bidireccional: la clienta confirma, cambia o cancela desde el chat.' },
      { titulo: 'Deteccion de riesgo en la ficha', texto: 'Cada clienta lleva un indicador de riesgo de no-show visible. Sabes a quien conviene pedir senal antes de reservar.' },
      { titulo: 'Aviso de reservas de riesgo', texto: 'Mecha vigila la agenda y avisa de las reservas que tienen pinta de quedarse sin cubrir para que las confirmes a mano o las ofrezcas a la lista de espera.' },
      { titulo: 'Lista de espera que rellena los huecos', texto: 'Si alguien cancela, el sistema ofrece el hueco a las clientas en lista de espera que encajan y manda el aviso por WhatsApp.' }
    ],
    faqs: [
      { q: 'Como funciona la senal anti no-show de Mecha?', a: 'Activas el deposito por enlace (Stripe) y lo ajustas por perfil de riesgo: clientas VIP sin senal, nuevas con un 20% y reincidentes con el 50-100%. Si la clienta no viene, cobras el hueco.' },
      { q: 'La senal asusta a mis clientas habituales?', a: 'No tiene por que. El deposito es dinamico: las clientas VIP o fieles no pagan senal. La fidelidad sin deposito manda sobre el riesgo, asi que solo pagaran senal quienes tienen historial de no-show.' },
      { q: 'Los recordatorios por WhatsApp reducen de verdad los no-shows?', a: 'Si. La mayoria de los no-shows son olvidos. Un recordatorio automatico antes de la cita, con opcion de confirmar o cancelar por WhatsApp, reduce esos olvidos de forma muy significativa.' },
      { q: 'Como se que clientas tienen mas riesgo de no-show?', a: 'Mecha asigna un indicador de riesgo a cada clienta segun su historial y te lo muestra en la ficha y al crear la cita. Ademas avisa de las reservas concretas que tienen pinta de quedarse sin cubrir.' },
      { q: 'Cobrais comision por cada senal o cobro?', a: 'No. Las senales y los cobros van por tu Stripe o tu Redsys/Bizum. Mecha tiene precios cerrados (desde 39 eur/mes mas IVA), sin comision por reserva ni por cobro.' }
    ]
  },

  /* ============================ COMPARATIVAS ============================ */
  {
    slug: 'alternativa-booksy',
    tipo: 'comparativa',
    competidor: 'Booksy',
    h1: 'Alternativa a Booksy: el software de peluqueria sin comisiones por reserva',
    title: 'Alternativa a Booksy 2026 | Sin comisiones, con IA — Mecha',
    description: 'Por que Mecha es la mejor alternativa a Booksy: agenda con tiempos de reposo, IA que atiende WhatsApp, senales, VeriFactu y fichaje legal. Sin comision por reserva. Migra en 10 min.',
    lead: 'Si buscas una alternativa a Booksy, Mecha te da lo mismo que necesitas de Booksy (agenda y reserva online) y lo que Booksy no tiene: precios cerrados sin comision por reserva, IA que atiende WhatsApp y cobra la senal sola, facturacion VeriFactu, fichaje legal y una agenda que entiende los tiempos de reposo del tinte. Y migras en 10 minutos sin perder tus clientes.',
    bullets: [
      { titulo: 'Sin comision por reserva', texto: 'Booksy cobra por cada reserva que entra. Mecha no: precios cerrados desde 39 eur/mes, sin porcentaje por cita ni por cobro. Cuanto mas creces, mas te ahorras.' },
      { titulo: 'Una agenda que entiende el tinte', texto: 'Tiempos muertos productivos, fases activo-reposo-activo y servicios encadenados entre profesionales. La agenda de Mecha esta hecha para como trabaja una peluqueria, no para cualquier negocio.' },
      { titulo: 'IA que atiende WhatsApp 24/7', texto: 'Un asistente que da cita, contesta dudas y cobra la senal fuera de horario. En Booksy no existe; en Mecha es un addon que activas cuando quieras.' },
      { titulo: 'VeriFactu y fichaje legal incluidos', texto: 'Facturacion oficial AEAT con QR de cotejo y registro de jornada conforme al art. 34.9 ET, dentro del plan. Sin modulos fiscales extra.' },
      { titulo: 'Tus clientes son tuyos', texto: 'Mecha no es un marketplace: no compartes tus clientas con otros salones ni competis en el mismo buscador. Tus datos son tuyos y los exportas cuando quieras.' },
      { titulo: 'Migracion desde Booksy en 10 minutos', texto: 'Importas tus clientes y tu agenda desde Booksy de forma asistida, o subes una foto de tu agenda y el importador IA de Mecha la convierte en datos.' }
    ],
    comparativa: [
      { aspecto: 'Comision por reserva', mecha: 'No, precios cerrados (0%)', otro: 'Si, por cada cita o cliente' },
      { aspecto: 'Agenda con tiempos de reposo de tinte', mecha: 'Si (fases activo-reposo)', otro: 'No' },
      { aspecto: 'Servicios encadenados entre profesionales', mecha: 'Si', otro: 'No' },
      { aspecto: 'Asistente IA por WhatsApp y voz 24/7', mecha: 'Si (Chispa)', otro: 'No' },
      { aspecto: 'Facturacion VeriFactu (AEAT)', mecha: 'Si, incluida (SHA-256)', otro: 'No / modulo aparte' },
      { aspecto: 'Fichaje legal (art. 34.9 ET)', mecha: 'Si, inalterable', otro: 'No' },
      { aspecto: 'Modelo de privacidad', mecha: 'Software (tus clientas son tuyas)', otro: 'Marketplace competidor' },
      { aspecto: 'Precio mensual', mecha: 'Desde 39 eur/mes + IVA', otro: 'Cuota base + comisiones' }
    ],
    faqs: [
      { q: 'Por que cambiar de Booksy a Mecha?', a: 'Porque Mecha no cobra comision por reserva (precios cerrados desde 39 eur/mes), tiene una agenda pensada para peluqueria (tiempos de reposo, servicios encadenados), IA que atiende WhatsApp, VeriFactu y fichaje legal incluidos, y porque tus clientes son tuyos: Mecha no es un marketplace.' },
      { q: 'Puedo migrar mis clientes y mi agenda desde Booksy?', a: 'Si. La migracion desde Booksy es asistida y suele tardar unos 10 minutos. Tambien puedes subir una foto de tu agenda de papel y el importador IA de Mecha la convierte en datos.' },
      { q: 'Mecha cobra comision por cada reserva como Booksy?', a: 'No. Mecha tiene precios cerrados (Esencial 39 eur/mes, Estudio 59 eur/mes, mas IVA) sin comision por reserva ni por cobro. Cuantas mas reservas entran, mas te ahorras frente a un modelo por comision.' },
      { q: 'En Mecha mis clientes compiten con otros salones como en un marketplace?', a: 'No. Mecha es software de gestion, no un marketplace. Tus clientas no se comparten ni aparecen junto a otros salones en un buscador. Tus datos son tuyos y los exportas cuando quieras.' },
      { q: 'Tiene Mecha cosas que Booksy no tiene?', a: 'Si: agenda con tiempos muertos productivos y servicios encadenados, IA conversacional por WhatsApp y voz, facturacion VeriFactu con QR AEAT, fichaje legal y depositos dinamicos por riesgo de no-show.' }
    ]
  },
  {
    slug: 'alternativa-fresha',
    tipo: 'comparativa',
    competidor: 'Fresha',
    h1: 'Alternativa a Fresha: software de peluqueria sin comisiones de reserva',
    title: 'Alternativa a Fresha 2026 | Sin comisiones, con IA — Mecha',
    description: 'Por que Mecha es la mejor alternativa a Fresha: agenda con reposo, IA que atiende WhatsApp, VeriFactu, fichaje legal y senales anti no-show. Sin comision por reserva. Migra en 10 min.',
    lead: 'Si buscas una alternativa a Fresha, Mecha te ofrece agenda y reserva online sin las comisiones por reserva del modelo de Fresha. Ademas anade una agenda hecha para peluqueria (con tiempos de reposo y servicios encadenados), IA que atiende WhatsApp y cobra la senal, facturacion VeriFactu y fichaje legal. Migras en 10 minutos sin perder tus clientes.',
    bullets: [
      { titulo: 'Precios cerrados, sin comision por reserva', texto: 'Frente al modelo de 20% por cliente nuevo y comision por cita de Fresha, Mecha ofrece precios cerrados desde 39 eur/mes sin porcentaje por reserva ni por cobro. Ahorra miles de euros al ano.' },
      { titulo: 'Agenda inteligente de peluqueria', texto: 'Tiempos muertos productivos, fases activo-reposo-activo, servicios encadenados multi-profesional y absorcion automatica de retrasos en cascada.' },
      { titulo: 'IA conversacional 24/7', texto: 'Un asistente que atiende WhatsApp y (opcional) la voz: da cita, consulta el catalogo y cobra la senal fuera de horario.' },
      { titulo: 'VeriFactu y registro de jornada', texto: 'Facturacion oficial AEAT con QR y cadena, y fichaje legal conforme al art. 34.9 ET, integrados en el plan. Sin modulos fiscales extra.' },
      { titulo: 'Tus clientes son tuyos, no un marketplace', texto: 'Mecha es software, no un marketplace: tus clientas no se comparten ni compiten con otros salones. Exportas tus datos cuando quieras.' },
      { titulo: 'Migracion desde Fresha en 10 minutos', texto: 'Importas clientes y agenda desde Fresha de forma asistida, o subes una foto de tu agenda y el importador IA la convierte en datos.' }
    ],
    comparativa: [
      { aspecto: 'Comision por cliente nuevo', mecha: '0%', otro: '20% por cada nuevo cliente' },
      { aspecto: 'Comision por transaccion', mecha: '0% (usa tu propio TPV)', otro: '1.29% a 2.19% + 0.20 eur' },
      { aspecto: 'Agenda con tiempos de reposo', mecha: 'Si', otro: 'No' },
      { aspecto: 'Asistente IA por WhatsApp y voz', mecha: 'Si (addon)', otro: 'No' },
      { aspecto: 'Facturacion VeriFactu (AEAT)', mecha: 'Si, incluida', otro: 'No / modulo aparte' },
      { aspecto: 'Fichaje legal (art. 34.9 ET)', mecha: 'Si, incluido', otro: 'No' },
      { aspecto: 'Modelo', mecha: 'Software (tus clientes son tuyos)', otro: 'Marketplace + pagos obligatorios' },
      { aspecto: 'Precio desde', mecha: '39 eur/mes + IVA', otro: 'Gratuito falso + comisiones caras' }
    ],
    faqs: [
      { q: 'Por que cambiar de Fresha a Mecha?', a: 'Porque Mecha no cobra comision por reserva ni el 20% por cliente nuevo, tiene una agenda pensada para peluqueria (tiempos de reposo, servicios encadenados), IA que atiende WhatsApp, VeriFactu y fichaje legal incluidos, y porque Mecha es software, no un marketplace: tus clientes son tuyos.' },
      { q: 'Si Fresha dice ser gratuito, por que pagar Mecha?', a: 'Fresha cobra 20% por cada cliente nuevo y comisiones por cada pago con tarjeta. Un salon mediano acaba pagando entre 400 y 900 euros al mes a Fresha. Con Mecha pagas solo 39 euros al mes fijos.' },
      { q: 'Puedo migrar mis clientes y mi agenda desde Fresha?', a: 'Si. La migracion desde Fresha es asistida y suele tardar unos 10 minutos. Tambien puedes subir una foto de tu agenda de papel y el importador IA de Mecha la convierte en datos.' },
      { q: 'Mecha me obliga a usar un datofono propietario caro?', a: 'No. Puedes cobrar con tu propio datofono del banco (Redsys/Bizum al 0.3%), con Stripe o con Tap to Pay directamente desde tu movil.' }
    ]
  },
  {
    slug: 'alternativa-treatwell',
    tipo: 'comparativa',
    competidor: 'Treatwell',
    h1: 'Alternativa a Treatwell: el software que no se queda con el 35% de tus clientes',
    title: 'Alternativa a Treatwell 2026 | Sin comisiones abusivas — Mecha',
    description: 'Por que cambiar de Treatwell a Mecha: 0% comisiones, agenda con tiempos de reposo, IA por WhatsApp, VeriFactu y fichaje legal. Ahorra mas de 6.000 eur al ano.',
    lead: 'Treatwell cobra hasta un 35% de comision por cada cliente nuevo y te obliga a hacer descuentos que devaluan tu trabajo. Mecha te devuelve el control de tu salon: tarifa plana de 39 eur/mes, 0% comisiones, agenda inteligente con tiempos de reposo y recepcionista de WhatsApp 24/7.',
    bullets: [
      { titulo: '0% comisiones frente al 35% de Treatwell', texto: 'No cedas un tercio de tu facturacion en comisiones de marketplace. Con Mecha el 100% del dinero de cada cita es para tu salon.' },
      { titulo: 'Tus clientas nunca veran a la competencia', texto: 'En Treatwell tus clientas reciben ofertas de otros salones cercanos. En Mecha tu portal de reservas es privado y exclusivo de tu marca.' },
      { titulo: 'Agenda especializada en peluqueria y color', texto: 'Gestiona fases de reposo de tinte, balayage y tratamientos sin bloquear el sillon a ciegas como hace Treatwell.' },
      { titulo: 'VeriFactu y control horario incluidos', texto: 'Facturas homologadas por la AEAT con QR y registro inalterable de jornada para inspecciones laborales dentro de tu cuota.' },
      { titulo: 'Migracion asistida en 10 minutos', texto: 'Traspasa tu base de datos de clientes desde Treatwell de forma rapida y segura.' }
    ],
    comparativa: [
      { aspecto: 'Comision por cliente nuevo', mecha: '0%', otro: 'Hasta 35% + IVA' },
      { aspecto: 'Comision por citas recurrentes', mecha: '0%', otro: '2% a 3% por transaccion' },
      { aspecto: 'Agenda con tiempos de reposo de tinte', mecha: 'Si', otro: 'No' },
      { aspecto: 'Recepcionista IA WhatsApp 24/7', mecha: 'Si (Chispa)', otro: 'No' },
      { aspecto: 'Facturacion VeriFactu (AEAT)', mecha: 'Si, incluida', otro: 'No' },
      { aspecto: 'Control horario (Art. 34.9 ET)', mecha: 'Si, incluido', otro: 'No' },
      { aspecto: 'Propiedad del cliente', mecha: '100% tuya', otro: 'Del marketplace' },
      { aspecto: 'Precio', mecha: '39 eur/mes fijos', otro: 'Comisiones variables abusivas' }
    ],
    faqs: [
      { q: 'Cuanto puedo ahorrar al cambiarme de Treatwell a Mecha?', a: 'Un salon que capta 20 clientas nuevas al mes en Treatwell con un ticket medio de 45 euros paga mas de 315 euros al mes solo en comisiones (3.780 euros al ano). Con Mecha pagas 39 euros al mes, ahorrando mas de 3.300 euros limpios al ano.' },
      { q: 'Pierdo a mis clientes si dejo Treatwell?', a: 'No. Puedes exportar el listado de clientes de Treatwell e importarlo en Mecha en 10 minutos. Tus clientas reservaran en tu nuevo enlace privado sin ver otros salones.' }
    ]
  },
  {
    slug: 'alternativa-square-appointments',
    tipo: 'comparativa',
    competidor: 'Square Appointments',
    h1: 'Alternativa a Square Appointments: software especializado en peluqueria con IA',
    title: 'Alternativa a Square Appointments 2026 | Peluquerias — Mecha',
    description: 'Mecha vs Square Appointments: agenda con tiempos de reposo, fichas tecnicas con formulas de color, IA por WhatsApp, VeriFactu y control horario laboral. Desde 39 eur/mes.',
    lead: 'Square Appointments es un sistema generico pensado para tiendas y cafeterias, no para salones. Mecha es el software vertical disenado para peluquerias: entiende que un tinte tiene tiempos de reposo, guarda formulas tecnicas exactas y cumple las leyes fiscales (VeriFactu) y laborales (fichajes) de Espana.',
    bullets: [
      { titulo: 'Especializado en peluqueria y estetica', texto: 'Fichas de color con oxidante, gramos, tonos y tiempos de exposicion que Square no tiene.' },
      { titulo: 'Tiempos de reposo quimico nativos', texto: 'La agenda de Mecha permite meter cortes rapidos mientras un tinte actua, duplicando el rendimiento por sillon.' },
      { titulo: 'Cumplimiento fiscal VeriFactu (AEAT)', texto: 'Tickets encadenados con SHA-256 y codigo QR oficial de Hacienda, adaptado a la ley espanola.' },
      { titulo: 'Fichaje legal inalterable art. 34.9 ET', texto: 'Registro de jornada obligatorio con marca de tiempo del servidor para inspecciones de trabajo.' },
      { titulo: 'Recepcionista de WhatsApp con IA', texto: 'Atiende y cobra reservas automaticamente mientras Square solo envia SMS basicos.' }
    ],
    comparativa: [
      { aspecto: 'Fichas con formulas de color y tecnicas', mecha: 'Si, especializado', otro: 'Notas de texto basicas' },
      { aspecto: 'Tiempos de reposo en la agenda', mecha: 'Si (fases automaticas)', otro: 'No (bloque continuo ciego)' },
      { aspecto: 'VeriFactu AEAT con QR de cotejo', mecha: 'Si, homologado', otro: 'No' },
      { aspecto: 'Registro de jornada laboral (Art. 34.9 ET)', mecha: 'Si, inalterable', otro: 'No' },
      { aspecto: 'Asistente IA por WhatsApp 24/7', mecha: 'Si (Chispa)', otro: 'No' },
      { aspecto: 'Tarifa mensual', mecha: 'Desde 39 eur/mes', otro: 'Gratis limitado / suscripcion por staff' }
    ],
    faqs: [
      { q: 'Por que elegir Mecha frente a Square si Square tiene version gratuita?', a: 'Porque Square carece de las funciones criticas de una peluqueria: no gestiona tiempos de reposo (te hace perder hasta un 40% de citas), no guarda formulas de tinte estructuradas y no cumple con la normativa espanola de VeriFactu ni el registro obligatorio de jornada laboral.' }
    ]
  }
];
