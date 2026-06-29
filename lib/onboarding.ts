// Pasos del checklist de puesta en marcha del salon ("Pon en marcha tu salon").
// Definicion estatica y ordenada por NECESIDAD OBJETIVA de operar (no por valor de
// producto). El estado "hecho" de cada paso NO se guarda a mano: lo calcula
// useOnboardingStatus leyendo los datos reales del negocio. Asi un paso se reabre
// solo si, por ejemplo, se borra el ultimo servicio.

export type OnboardingLevel = 'imprescindible' | 'necesario' | 'recomendado';

export type OnboardingStepId =
  | 'servicios'
  | 'equipo'
  | 'horarios_profesional'
  | 'horario_salon'
  | 'datos_negocio'
  | 'reserva_online'
  | 'fotos_servicios'
  | 'notificaciones';

export interface OnboardingStepDef {
  id: OnboardingStepId;
  titulo: string;
  // Que es y por que importa (cara al usuario, 1-2 lineas).
  porque: string;
  nivel: OnboardingLevel;
  icon: string;            // clave en OnboardingIcons
  cta: string;             // texto del boton de accion
  pathname: string;        // destino expo-router
  params?: Record<string, string>;
}

// El "nucleo": completar estos cinco = salon operativo. Cuando estan todos hechos,
// la tarjeta de Avisos desaparece sola. Los recomendados no bloquean esa desaparicion.
export const CORE_STEP_IDS: OnboardingStepId[] = [
  'servicios',
  'equipo',
  'horarios_profesional',
  'horario_salon',
  'datos_negocio',
];

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: 'servicios',
    titulo: 'Crea tus servicios',
    porque: 'Cada cita es un servicio (corte, color, peinado...). Sin al menos uno no puedes agendar ni cobrar nada.',
    nivel: 'imprescindible',
    icon: 'scissors',
    cta: 'Crear servicios',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'servicios' },
  },
  {
    id: 'equipo',
    titulo: 'Da de alta tu equipo',
    porque: 'Cada profesional es una columna de la agenda y quien presta el servicio. Necesitas al menos uno.',
    nivel: 'imprescindible',
    icon: 'users',
    cta: 'Gestionar equipo',
    pathname: '/(tabs)/equipo',
  },
  {
    id: 'horarios_profesional',
    titulo: 'Define el horario de cada profesional',
    porque: 'De aqui salen los huecos reservables. Sin horario, la agenda no sabe cuando hay disponibilidad con esa persona.',
    nivel: 'imprescindible',
    icon: 'clock',
    cta: 'Configurar horarios',
    pathname: '/(tabs)/equipo',
    params: { focus: 'horarios' },
  },
  {
    id: 'horario_salon',
    titulo: 'Fija el horario del salon',
    porque: 'Marca los dias y horas de apertura. Ordena la agenda y limita la reserva online a tu horario real.',
    nivel: 'necesario',
    icon: 'calendar',
    cta: 'Configurar horario',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'horarios' },
  },
  {
    id: 'datos_negocio',
    titulo: 'Completa los datos del negocio',
    porque: 'Nombre, direccion y telefono aparecen en el portal de reserva, en los mensajes al cliente y en el ticket.',
    nivel: 'necesario',
    icon: 'store',
    cta: 'Completar datos',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'general' },
  },
  {
    id: 'reserva_online',
    titulo: 'Activa la reserva online',
    porque: 'Abre tu pagina publica de reservas (enlace y QR) para que tus clientes pidan cita solos, las 24 horas.',
    nivel: 'recomendado',
    icon: 'globe',
    cta: 'Activar reserva',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'reserva' },
  },
  {
    id: 'fotos_servicios',
    titulo: 'Sube fotos a tus servicios',
    porque: 'El portal funciona sin fotos, pero con ellas entra por los ojos y reserva mas gente.',
    nivel: 'recomendado',
    icon: 'image',
    cta: 'Anadir fotos',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'servicios' },
  },
  {
    id: 'notificaciones',
    titulo: 'Activa los recordatorios por WhatsApp',
    porque: 'Avisos automaticos de confirmacion y recordatorio que reducen los plantones (no-shows).',
    nivel: 'recomendado',
    icon: 'message',
    cta: 'Activar avisos',
    pathname: '/(tabs)/configuracion',
    params: { tab: 'notificaciones' },
  },
];

export const isCoreStep = (id: OnboardingStepId) => CORE_STEP_IDS.includes(id);
