// KB de Mecha como modulo TS (se empaqueta con la funcion: mas fiable que
// leer un fichero estatico en el runtime de Supabase).
export const KB = `# BASE DE CONOCIMIENTO REAL DE MECHA (para Chispa — dudas de la demo)

Fuente de verdad: código del producto (app/), informes internos (informes/INFORME_MAESTRO_MECHA.md, MEGA_INFORME_MECHA.md, ARQUITECTURA_FISCAL_Y_COMPLIANCE_MECHA.md, ARQUITECTURA_PAGOS_MECHA.md, ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md), ROADMAP_MECHA.md y documentación modular (agenda, clientes, equipo, catálogo, caja, capa IA). NO inventar nada fuera de aquí.

## 1. Qué es Mecha
- Software de gestión (SaaS) para peluquerías, barberías y salones de belleza. Web (app móvil-first en el navegador), iOS y Android (Expo/React Native compilado). Sin comisiones por reserva: todo lo que factura el salón es suyo.
- Marca/web: mechaa.es (novanoidai.com es el espejo comercial). Demo navegable en /demo.html: es una CUENTA FALSA con datos ficticios (salón demo) para ver el funcionamiento real del software; nada de lo que se toca ahí afecta a salones reales.
- Dos planes de software con el mismo contenido: Esencial 39 €/mes y Estudio 59 €/mes (IVA no incluido). 1 mes gratis sin tarjeta, sin permanencia, profesionales ilimitados. Addon opcional "Recepcionistas IA": Solo WhatsApp +19 €/mes, Solo voz +29 €/mes, Completo +39 €/mes.
- 3 visitas gratis a la demo por cuenta; el equipo comparte enlaces ?share=1 que no gastan visitas.

## 2. Páginas / módulos de la app (navegación por tabs)
Tabs principales: Agenda (/(tabs)), Clientes (/(tabs)/clientes), Equipo (/(tabs)/equipo), Informes (/(tabs)/informes), Configuración (/(tabs)/configuracion). Más: bandeja de mensajes/notificaciones, portal de reservas público, página pública de aceptación de presupuestos y portal de pago (señales/suscripciones).

### Agenda
- Vista de día/semana con columnas por profesional; drag & drop de citas; orden de columnas personalizable y persistente.
- Crear cita: tocar hueco → se abre con hora ya puesta; cliente (existente o creado al vuelo), servicio(s), profesional. El servicio arrastra duración y precio.
- Servicios encadenados: una visita puede pasar por varios profesionales (p. ej. color con una, corte con otra) sin solapamientos.
- Estados de cita: pendiente, confirmada, en curso, cobrada, completada, no-show, cancelada. El estado pinta la agenda y alimenta los informes.
- TIEMPOS DE REPOSO (diferenciador clave): los servicios con reposo (tinte, decoloración…) se parten en bloques activo → reposo → activo. Durante el reposo la cita LIBERA la agenda y se puede meter otro cliente en ese hueco: se factura más sin alargar la jornada. Booksy/Fresha dejan ese hueco vacío.
- Bloqueos: vacaciones y ausencias por profesional (si un profesional está de vacaciones, no pinta columna y aparece como "De vacaciones").
- Citas con señales (anti no-show): se cobra un depósito por Stripe al reservar desde el portal.

### Fichas de cliente
- Ficha completa: historial de citas, fórmulas de color (memoria de color: producto, tono, tiempos y resultado — para repetir el color exacto), fotos antes/después, alergias y alertas, notas, presupuestos y tickets asociados.
- Segmentación automática VIP/habituales, riesgo de no-show por cliente, indicador de fuga (tiempo sin venir).

### Caja y cobros
- Cobro de citas: efectivo, tarjeta (TPV físico), Stripe (link/checkout), y cobro con BONO (sesiones prepago; el servicio cubierto por bono se cobra a 0,00 € en el ticket; los productos extra sí se cobran y admiten descuento € o %).
- Descuentos por cobro en € o %.
- Ticket PDF con desglose (servicios, productos, propinas, "(Bono)" en líneas cubiertas por bono).
- Propinas registradas y repartidas por profesional en los informes.
- Caja fuerte / arqueo: el Historial de Caja mantiene el anidado visual de las operaciones por cobro y muestra indicadores de citas cobradas.

### Presupuestos
- Presupuestos numerados (P-xxx) con líneas (servicio/producto, cantidad, precio), total, estado (pendiente/aceptado/rechazado), PDF y página pública de aceptación con enlace tokenizado.
- Se envían por correo al cliente desde el buzón del salón (SMTP Hostinger) con el logo y colores del salón. En la app: crear, duplicar, enviar, convertir en cita al aceptar.

### Fichajes (legal)
- Fichaje de jornada por profesional conforme a la ley: entrada, salida, pausas. Horas calculadas por jornada/semana. Base para el cumplimiento de registro horario obligatorio.

### Facturación legal — VeriFactu
- Tickets/simplificadas homologadas VeriFactu (AEAT) con QR, encadenamiento de registros y requisitos del RD 1007/2023. Mecha genera la factura/ticket legal con impuestos y se queda listo para inspección. (informes/ARQUITECTURA_FISCAL_Y_COMPLIANCE_MECHA.md)

### Equipo y comisiones
- Roles: owner (dueño), profesional, con permisos por módulo (cada uno ve lo justo; dinero y ajustes solo el owner).
- Horarios y jornadas por profesional, vacaciones/bloqueos.
- Comisiones: fijas o por %, por profesional y por servicio; objetivos; ranking de quién factura más. Calculadora de comisiones de la web para ver dinero y tiempo ganados.

### Informes
- Ingresos (por servicio, producto, profesional, método de pago), ocupación, tasa de no-show, ticket medio, retención/fuga de clientes, propinas, comisiones a pagar. Descargables en PDF y CSV.

### Configuración
- Datos del negocio (nombre, moneda, huso, colores/logo de marca), horarios y descansos, catálogo de servicios con precios/duraciones/reposos por profesional, reglas de reserva (antelación, cancelaciones, prepagos/señales), comisiones, plantillas de fórmulas y notas, notificaciones automáticas (recordatorios y confirmación por WhatsApp, aviso de reseña), página de reserva online propia (enlace + QR), referidos, accesos y roles, cuenta/plan/facturación.

## 3. Chispa (la IA)
- Chispa es la capa IA de Mecha (mascota presente en la app): recepcionista 24/7 que atiende WhatsApp y teléfono, responde dudas del cliente del salón, reserva citas sola y cobra la señal con Stripe; organiza el día para evitar huecos sueltos; ayuda a recuperar clientas (campañas y lista de espera inteligente).
- Addon IA: Solo WhatsApp +19 €/mes · Solo voz +29 €/mes · Completo +39 €/mes. Se activa/desactiva cuando el salón quiera.
- En la demo y la landing, las dudas las responde esta misma IA entrenada con todo el funcionamiento de Mecha.

## 4. Arquitectura técnica (resumen honesto)
- Frontend: web estática (Vercel/Cloudflare) + app Expo/React Native. Backend: Supabase (Postgres con RLS por negocio — cada salón solo ve sus datos), Auth, Storage, Edge Functions (Deno) para pagos (Stripe/Redsys), emails (SMTP Hostinger con denomailer), voz (STT/TTS ElevenLabs), visión (OpenAI Vision para fórmulas de color e Instagram), y Chispa (LLM vía OpenRouter).
- Seguridad: RLS estricto en todas las tablas, RPCs auditadas, rate limiting por IP, captcha en formularios, tokens opacos (nada de emails en URLs), sesiones de demo aisladas.
- Migración desde Booksy/Fresha: importación puntual de clientes e historial desde Excel exportado o foto de la agenda ("Migración Mágica", ~10 min). NO existe integración/sincronización continua con Booksy/Fresha, y las reseñas de esos marketplaces no son exportables (decirlo sin rodeos).

## 5. Cómo probar / acceder
- Demo: mechaa.es → "Ver demo" (3 visitas gratis, cuenta demo con datos ficticios, tour guiado de 16 pasos + tutorial de configuración de 11 pasos, o explorar libre).
- Cuenta completa: crear cuenta gratis (1 mes sin tarjeta) o hablar con el equipo (reservar.html / WhatsApp +34 690 79 29 75) para activar el salón y dar de alta el equipo.

## 6. Landing y marketing (mechaa.es)
- Landing principal con secciones: hero con demo de la recepcionista IA, características, calculadoras de ahorro (calculadora de comisiones vs marketplaces y de tiempo/dinero), carta comercial, especificaciones, comparativas contra competidores, FAQ y contacto (WhatsApp +34 690 79 29 75, LinkedIn de los fundadores).
- SEO + AIO: manifiestos llms.txt y llms-full.txt para que los modelos de IA (ChatGPT, Claude, Gemini, Perplexity) lean e indexen Mecha; cientos de páginas prerenderizadas como HTML estático (landings de nicho, comparativas, páginas por ciudad tipo "peluquerías en X" y fichas de salón); sitemap dinámico regenerado en cada deploy; JSON-LD (Product, Offers, FAQPage); Cloudflare (DNS/WAF) + Vercel (edge) + Supabase con redirecciones canónicas.
- MARKETPLACE PROPIO: directorio de salones dentro de mechaa.es. Cada salón activo tiene ficha pública (página propia indexable en Google) y portal de reserva online con su marca (enlace + QR). A diferencia de Booksy/Treatwell, Mecha NO cobra comisión por reserva ni comparte tus clientes con un marketplace: el directorio te da visibilidad gratis y las clientas son TUYAS.
- Comparativa vs marketplaces (argumentos honestos): Booksy/Fresha/Treatwell cobran 20-35% de comisión por cliente nuevo + suscripción; Mecha 0% comisiones y planes desde 39 €/mes con todo incluido (agenda con reposos, IA, caja, VeriFactu, fichajes). Las reseñas de esos marketplaces no son exportables (se quedan allí); los clientes y el historial SÍ se migran (Excel o foto de la agenda, ~10 min).

## 7. Argumentos de venta (para dudas de decisión)
- Anti no-show: recordatorios automáticos por WhatsApp + opción de cobrar señal/depósito por Stripe al reservar online (se descuenta del total). Un no-show medio ~35 €: evitando 1-2 al mes ya paga el plan o el addon IA.
- Tiempos de reposo = facturar más sin alargar jornada (lo que Booksy/Fresha dejan vacío).
- Todo lo legal español resuelto: fichajes conforme a ley, facturación VeriFactu con QR (Ley Antifraude), RGPD con portal de privacidad.
- Onboarding: el equipo monta el salón contigo (importa clientes, configura servicios y horarios); 1 mes gratis sin tarjeta, sin permanencia; se activa o cancela cuando quiera.
- Si la duda es sobre precios/funciones no confirmadas: ofrecer la demo guiada (demo.html) o la llamada (reservar.html).
`;
