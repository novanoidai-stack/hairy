// i18n de los portales publicos (reserva + resena).
// El selector de idioma del salon (configuracion -> Reserva online) ofrece es/ca/en/pt;
// hasta ahora el portal no traducia (textos hardcodeados en es). Esto lo arregla.
//
// Uso:
//   const t = makeT(info.negocio.idioma);
//   t('s1_title')                      -> string en el idioma del salon (fallback a es)
//   t('paso', { n: 2, t: 5 })          -> interpola {n}/{t}
//   const loc = localeOf(idioma);      -> Intl locale para fechas/horas

export type Lang = 'es' | 'en';
export const PORTAL_LANGS: Lang[] = ['es', 'en'];

type Dict = Record<string, string>;

const es: Dict = {
  // comun
  splash_powered: 'Potenciado por',
  splash_connecting: 'Conectando con {n}…',
  footer_reservas: 'Reservas con',
  footer_resenas: 'Con',
  atras: 'Atras',
  // reservas: estados
  notfound_title: 'Reservas no disponibles',
  notfound_sub: 'Este salon todavia no tiene la reserva online activa.',
  // pasos
  step_servicio: 'Servicio',
  step_profesional: 'Profesional',
  step_fecha: 'Fecha',
  step_datos: 'Tus datos',
  step_confirmar: 'Confirmar',
  paso: 'Paso {n} de {t}',
  // paso 1
  s1_title: '¿Que te apetece?',
  s1_sub: 'Elige el servicio para empezar',
  empty_servicios_t: 'Sin servicios',
  empty_servicios_x: 'Este salon aun no tiene servicios para reservar online.',
  min: 'min',
  // paso 2
  s2_title: '¿Con quien?',
  any_pro: 'Cualquiera disponible',
  any_pro_badge: 'Mas rapido',
  any_pro_sub: 'Mas opciones de horario',
  // paso 3
  s3_title: 'Elige dia y hora',
  any: 'cualquiera',
  empty_huecos_t: 'Sin huecos proximos',
  empty_huecos_x: 'Ahora mismo no hay disponibilidad online en los proximos dias.',
  call_us: ' Llamanos y te buscamos hueco.',
  hoy: 'Hoy',
  manana_rel: 'Mañana',
  dia_completo_t: 'Dia completo',
  dia_completo_x: 'No quedan huecos este dia. Prueba con otra fecha del calendario.',
  franja_manana: 'Mañana',
  franja_tarde: 'Tarde',
  franja_noche: 'Noche',
  huecos: 'huecos',
  continuar: 'Continuar',
  // paso 4
  s4_sub: 'Solo lo justo para reservar',
  f_nombre: 'Nombre y apellidos',
  f_nombre_ph: 'Tu nombre',
  f_tel: 'Telefono',
  f_email: 'Email (opcional)',
  f_notas: 'Notas (opcional)',
  f_notas_ph: 'Algo que debamos saber',
  consent: 'He leido y acepto la {priv}.',
  consent_link: 'politica de privacidad',
  consent_note: 'Usaremos tu telefono solo para gestionar esta reserva.',
  revisar: 'Revisar reserva',
  err_nombre: 'Indica tu nombre.',
  err_tel: 'Indica un telefono valido.',
  err_consent: 'Debes aceptar la politica de privacidad para continuar.',
  err_ocupado: 'Ese hueco ya no esta libre. Elige otro, por favor.',
  err_generic: 'No se pudo completar la reserva.',
  // paso 5
  s5_title: 'Confirma tu reserva',
  s5_sub: 'Repasa que todo este bien',
  prepago: 'Este servicio requiere una señal. Te indicaremos como abonarla para confirmar la reserva.',
  confirmar_reserva: 'Confirmar reserva',
  reservando: 'Reservando…',
  // paso 6
  ok_recibida: 'Reserva recibida',
  ok_confirmada: '¡Reserva confirmada!',
  ok_esperamos: 'Te esperamos el {fecha} a las {hora}. ¡Nos vemos!',
  ok_deposito: 'Queda pendiente la señal de {imp}€. Te contactaremos para completar el pago.',
  add_cal: 'Añadir al calendario',
  otra: 'Hacer otra reserva',
  // establecimiento
  est_titulo: 'El salon',
  como_llegar: 'Como llegar',
  llamar: 'Llamar',
  visitar_web: 'Web',
  // consentimiento IA (opt-in) + reserva de grupo
  grupo_cta_titulo: '¿Venis en grupo?',
  grupo_cta_sub: 'Reservad varias personas a la misma hora (bodas, madres+hijas...).',
  consent_ia: 'Quiero usar funciones de Inteligencia Artificial (Chispa) para gestionar mis reservas y sugerencias, aceptando que mi nombre e historial de citas sea procesado por IA.',
  consent_ia_note: 'Opcional. Los datos medicos, de salud o alergias nunca se comparten.',
  slot_con_pro: 'con {pro}',
  grupo_ok_title: 'Reserva de grupo confirmada',
  grupo_ok_personas: '{n} personas',
  grupo_ok_aviso: 'Recibireis un aviso con los detalles.',
  grupo_ok_cerrar: 'Cerrar',
  // valoraciones
  valoracion_1: 'valoracion',
  valoracion_n: 'valoraciones',
  verificadas: 'verificadas',
  // ---- resenas ----
  res_header_default: 'Tu opinion importa',
  res_scale: '5 mechas = excelente · 1 mecha = mejorable',
  res_salon_title: 'Sobre el salon',
  res_salon_sub: 'Cuentanos que tal fue tu experiencia general.',
  res_mecha_title: 'Sobre el sistema de reserva',
  res_mecha_sub: '¿Que te ha parecido reservar con Mecha?',
  res_obligatorio: 'Obligatorio',
  res_opcional: 'Detalles opcionales',
  res_lbl_trato: 'Trato de los profesionales',
  res_lbl_productos: 'Calidad de los productos',
  res_lbl_facilidad: 'Facilidad de la reserva',
  res_lbl_disponibilidad: 'Disponibilidad de horarios',
  res_lbl_pagos: 'Sistema de pagos',
  res_comment_salon: 'Comentario para el salon (opcional)',
  res_comment_salon_ph: '¿Que te ha gustado del servicio?',
  res_strengths: 'Puntos fuertes (opcional)',
  res_strengths_ph: '¿Te ha sido facil reservar?',
  res_improve: '¿Que podriamos mejorar? (opcional)',
  res_improve_ph: 'Alguna sugerencia sobre gestion, diseño…',
  res_name: 'Tu nombre (opcional)',
  res_name_ph: 'Como quieres aparecer en la reseña',
  res_send: 'Enviar valoracion',
  res_sending: 'Enviando…',
  res_err_salon: 'Elige una puntuacion general para el salon.',
  res_err_mecha: 'Por favor, valora tambien el sistema de reserva.',
  res_thanks_title: '¡Gracias por tu fuego!',
  res_thanks_sub: 'Nos ayuda muchisimo a mejorar.',
  res_notfound_t: 'No disponible',
  res_notfound_x: 'Este salon no tiene activadas las valoraciones.',
  res_human: 'Valoraciones de personas reales',
  res_human_x: 'Solo cuentan como verificadas las opiniones de clientes con una visita real al salon.',
  et_1: 'Lo siento', et_2: 'Mejorable', et_3: 'Bien', et_4: 'Muy bien', et_5: '¡Excelente!',
};


const en: Dict = {
  splash_powered: 'Powered by',
  splash_connecting: 'Connecting to {n}…',
  footer_reservas: 'Bookings by',
  footer_resenas: 'With',
  atras: 'Back',
  notfound_title: 'Bookings unavailable',
  notfound_sub: 'This salon hasn\'t enabled online booking yet.',
  step_servicio: 'Service',
  step_profesional: 'Professional',
  step_fecha: 'Date',
  step_datos: 'Your details',
  step_confirmar: 'Confirm',
  paso: 'Step {n} of {t}',
  s1_title: 'What are you after?',
  s1_sub: 'Pick a service to start',
  empty_servicios_t: 'No services',
  empty_servicios_x: 'This salon has no services to book online yet.',
  min: 'min',
  s2_title: 'With whom?',
  any_pro: 'Anyone available',
  any_pro_badge: 'Fastest',
  any_pro_sub: 'More time options',
  s3_title: 'Pick day and time',
  any: 'anyone',
  empty_huecos_t: 'No upcoming slots',
  empty_huecos_x: 'There\'s no online availability in the coming days right now.',
  call_us: ' Call us and we\'ll find you a slot.',
  hoy: 'Today',
  manana_rel: 'Tomorrow',
  dia_completo_t: 'Fully booked',
  dia_completo_x: 'No slots left this day. Try another date.',
  franja_manana: 'Morning',
  franja_tarde: 'Afternoon',
  franja_noche: 'Evening',
  huecos: 'slots',
  continuar: 'Continue',
  s4_sub: 'Just what we need to book',
  f_nombre: 'Full name',
  f_nombre_ph: 'Your name',
  f_tel: 'Phone',
  f_email: 'Email (optional)',
  f_notas: 'Notes (optional)',
  f_notas_ph: 'Anything we should know',
  consent: 'I have read and accept the {priv}.',
  consent_link: 'privacy policy',
  consent_note: 'We\'ll use your phone only to manage this booking.',
  revisar: 'Review booking',
  err_nombre: 'Enter your name.',
  err_tel: 'Enter a valid phone.',
  err_consent: 'You must accept the privacy policy to continue.',
  err_ocupado: 'That slot is no longer free. Please pick another.',
  err_generic: 'We couldn\'t complete the booking.',
  s5_title: 'Confirm your booking',
  s5_sub: 'Check everything\'s right',
  prepago: 'This service requires a deposit. We\'ll tell you how to pay it to confirm the booking.',
  confirmar_reserva: 'Confirm booking',
  reservando: 'Booking…',
  ok_recibida: 'Booking received',
  ok_confirmada: 'Booking confirmed!',
  ok_esperamos: 'See you on {fecha} at {hora}!',
  ok_deposito: 'A {imp}€ deposit is pending. We\'ll contact you to complete the payment.',
  add_cal: 'Add to calendar',
  otra: 'Make another booking',
  est_titulo: 'The salon',
  como_llegar: 'Directions',
  llamar: 'Call',
  visitar_web: 'Website',
  grupo_cta_titulo: 'Coming as a group?',
  grupo_cta_sub: 'Book several people at the same time (weddings, mothers+daughters...).',
  consent_ia: 'I want to use AI features (Chispa) to manage my bookings and suggestions, accepting that my name and appointment history is processed by AI.',
  consent_ia_note: 'Optional. Medical, health or allergy data is never shared.',
  slot_con_pro: 'with {pro}',
  grupo_ok_title: 'Group booking confirmed',
  grupo_ok_personas: '{n} people',
  grupo_ok_aviso: 'You\'ll get a notice with the details.',
  grupo_ok_cerrar: 'Close',
  valoracion_1: 'review',
  valoracion_n: 'reviews',
  verificadas: 'verified',
  res_header_default: 'Your opinion matters',
  res_scale: '5 flames = excellent · 1 flame = needs work',
  res_salon_title: 'About the salon',
  res_salon_sub: 'Tell us how your overall experience went.',
  res_mecha_title: 'About the booking system',
  res_mecha_sub: 'How was booking with Mecha?',
  res_obligatorio: 'Required',
  res_opcional: 'Optional details',
  res_lbl_trato: 'Staff service',
  res_lbl_productos: 'Product quality',
  res_lbl_facilidad: 'Booking ease',
  res_lbl_disponibilidad: 'Time availability',
  res_lbl_pagos: 'Payment system',
  res_comment_salon: 'Comment for the salon (optional)',
  res_comment_salon_ph: 'What did you like about the service?',
  res_strengths: 'Highlights (optional)',
  res_strengths_ph: 'Was it easy to book?',
  res_improve: 'What could we improve? (optional)',
  res_improve_ph: 'Any suggestion about management, design…',
  res_name: 'Your name (optional)',
  res_name_ph: 'How you want to appear in the review',
  res_send: 'Send review',
  res_sending: 'Sending…',
  res_err_salon: 'Pick an overall rating for the salon.',
  res_err_mecha: 'Please also rate the booking system.',
  res_thanks_title: 'Thanks for your fire!',
  res_thanks_sub: 'It helps us improve so much.',
  res_notfound_t: 'Unavailable',
  res_notfound_x: 'This salon has no reviews enabled.',
  res_human: 'Reviews from real people',
  res_human_x: 'Only opinions from clients with a real salon visit count as verified.',
  et_1: 'Sorry', et_2: 'Could be better', et_3: 'Good', et_4: 'Very good', et_5: 'Excellent!',
};

const DICTS: Record<Lang, Dict> = { es, en };
const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-GB' };

function normLang(lang?: string | null): Lang {
  return (lang && (lang in DICTS) ? lang : 'es') as Lang;
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(lang?: string | null): TFn {
  const l = normLang(lang);
  const d = DICTS[l];
  return (key, vars) => {
    let s = d[key] ?? es[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
  };
}

export function localeOf(lang?: string | null): string {
  return LOCALES[normLang(lang)];
}

