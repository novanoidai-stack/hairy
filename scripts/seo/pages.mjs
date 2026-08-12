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
      { titulo: 'Agenda que respeta los tiempos reales de la barberia', texto: 'Cada servicio lleva su duracion real. Si un servicio tiene tiempo de reposo (un tinte) o encadena dos manos, la agenda lo coloca solo y te avisa de los huecos muertos que podrias estar aprovechando.' },
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
    lead: 'La diferencia entre una agenda cualquiera y una agenda inteligente es que esta entiende como trabaja una peluqueria. La de Mecha sabe que mientras un tinte reposa el sillon esta libre para otro cliente, que una cita puede encadenar varias manos y que un retraso no debe arruinar el resto del dia. Todo automático, decidís vosotros.',
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
      { titulo: 'Registro inalterable', texto: 'Los fichajes no se pueden editar en silenccio: cualquier cambio queda registrado. Conservacion de 4 anos, como exige el Estatuto de los Trabajadores.' },
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
      { titulo: 'Migracion desde Booksy en 10 minutos', texto: 'Importas tus clientes y tu agenda desde Booksy de forma asistida, o subes una foto de tu agenda y el importador IA la convierte en datos.' }
    ],
    comparativa: [
      { aspecto: 'Comision por reserva', mecha: 'No, precios cerrados', otro: 'Si, por cada cita' },
      { aspecto: 'Agenda con tiempos de reposo', mecha: 'Si', otro: 'No' },
      { aspecto: 'Servicios encadenados entre profesionales', mecha: 'Si', otro: 'No' },
      { aspecto: 'Asistente IA por WhatsApp y voz', mecha: 'Si (addon)', otro: 'No' },
      { aspecto: 'Facturacion VeriFactu (AEAT)', mecha: 'Si, incluida', otro: 'No / modulo aparte' },
      { aspecto: 'Fichaje legal (art. 34.9 ET)', mecha: 'Si, incluido', otro: 'No' },
      { aspecto: 'Modelo', mecha: 'Software (tus clientes son tuyos)', otro: 'Marketplace' },
      { aspecto: 'Precio desde', mecha: '39 eur/mes + IVA', otro: 'Base + comisiones' }
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
      { titulo: 'Precios cerrados, sin comision por reserva', texto: 'Frente al modelo de comision por cita, Mecha ofrece precios cerrados desde 39 eur/mes sin porcentaje por reserva ni por cobro. Predecible mes a mes.' },
      { titulo: 'Agenda inteligente de peluqueria', texto: 'Tiempos muertos productivos, fases activo-reposo-activo, servicios encadenados multi-profesional y absorcion automatica de retrasos en cascada.' },
      { titulo: 'IA conversacional 24/7', texto: 'Un asistente que atiende WhatsApp y (opcional) la voz: da cita, consulta el catalogo y cobra la senal fuera de horario.' },
      { titulo: 'VeriFactu y registro de jornada', texto: 'Facturacion oficial AEAT con QR y cadena, y fichaje legal conforme al art. 34.9 ET, integrados en el plan. Sin modulos fiscales extra.' },
      { titulo: 'Tus clientes son tuyos, no un marketplace', texto: 'Mecha es software, no un marketplace: tus clientas no se comparten ni compiten con otros salones. Exportas tus datos cuando quieras.' },
      { titulo: 'Migracion desde Fresha en 10 minutos', texto: 'Importas clientes y agenda desde Fresha de forma asistida, o subes una foto de tu agenda y el importador IA la convierte en datos.' }
    ],
    comparativa: [
      { aspecto: 'Comision por reserva', mecha: 'No, precios cerrados', otro: 'Si, por cita y por transaccion' },
      { aspecto: 'Agenda con tiempos de reposo', mecha: 'Si', otro: 'No' },
      { aspecto: 'Servicios encadenados entre profesionales', mecha: 'Si', otro: 'No' },
      { aspecto: 'Asistente IA por WhatsApp y voz', mecha: 'Si (addon)', otro: 'No' },
      { aspecto: 'Facturacion VeriFactu (AEAT)', mecha: 'Si, incluida', otro: 'No / modulo aparte' },
      { aspecto: 'Fichaje legal (art. 34.9 ET)', mecha: 'Si, incluido', otro: 'No' },
      { aspecto: 'Modelo', mecha: 'Software (tus clientes son tuyos)', otro: 'Marketplace + pagos' },
      { aspecto: 'Precio desde', mecha: '39 eur/mes + IVA', otro: 'Gratuito + comisiones' }
    ],
    faqs: [
      { q: 'Por que cambiar de Fresha a Mecha?', a: 'Porque Mecha no cobra comision por reserva (precios cerrados desde 39 eur/mes), tiene una agenda pensada para peluqueria (tiempos de reposo, servicios encadenados), IA que atiende WhatsApp, VeriFactu y fichaje legal incluidos, y porque Mecha es software, no un marketplace: tus clientes son tuyos.' },
      { q: 'Si Fresha es gratuito, por que pagar Mecha?', a: 'Fresha cobra comision por reserva y por transaccion de pago, que al crecer suele salir mas cara que un precio cerrado. Mecha es predecible (desde 39 eur/mes) sin porcentaje por cita ni por cobro, e incluye funciones que Fresha no tiene.' },
      { q: 'Puedo migrar mis clientes y mi agenda desde Fresha?', a: 'Si. La migracion desde Fresha es asistida y suele tardar unos 10 minutos. Tambien puedes subir una foto de tu agenda de papel y el importador IA de Mecha la convierte en datos.' },
      { q: 'Mecha me obliga a usar sus pagos como un marketplace?', a: 'No. Cobras por tu Stripe, tu Redsys/Bizum o en efectivo. Mecha no se queda un porcentaje de tus cobros ni de tus reservas.' },
      { q: 'Tiene Mecha cosas que Fresha no tiene?', a: 'Si: agenda con tiempos muertos productivos y servicios encadenados, IA conversacional por WhatsApp y voz, facturacion VeriFactu con QR AEAT, fichaje legal y depositos dinamicos por riesgo de no-show.' }
    ]
  }
];
