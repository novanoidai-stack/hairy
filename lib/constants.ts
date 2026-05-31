export const NEGOCIO_ID_FALLBACK = 'prueba_46980';

export const HORARIO_APERTURA = {
  horas: 9,
  minutos: 0,
};

export const HORARIO_CIERRE = {
  horas: 20,
  minutos: 0,
};

export const INTERVALO_MINUTOS = 15;

export const CITA_CARD_DETAILS_MIN_HEIGHT = 38;

export const CITA_STATUS = {
  CONFIRMADA: 'confirmada',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada',
  NO_PRESENTADA: 'no_presentada',
} as const;

export type CitaStatus = typeof CITA_STATUS[keyof typeof CITA_STATUS];

export const CITA_STATUS_TERMINALES: CitaStatus[] = [
  CITA_STATUS.COMPLETADA,
  CITA_STATUS.CANCELADA,
  CITA_STATUS.NO_PRESENTADA,
];

export const CITA_STATUS_ACTIVOS: CitaStatus[] = [
  CITA_STATUS.CONFIRMADA,
];

export const CITA_CANAL = {
  MANUAL: 'manual',
  WEB: 'web',
  WHATSAPP: 'whatsapp',
  AGENTE_VOZ: 'agente_voz',
  ASISTENTE_IA: 'asistente_ia',
} as const;

export const CATEGORIAS_PROFESIONAL = [
  { value: 'auxiliar', label: 'Auxiliar' },
  { value: 'oficial', label: 'Oficial' },
  { value: 'oficial_mayor', label: 'Oficial Mayor' },
  { value: 'estilista_senior', label: 'Estilista Senior' },
  { value: 'direccion', label: 'Dirección' },
] as const;

export type CategoriaProfesional = typeof CATEGORIAS_PROFESIONAL[number]['value'];

export const LOCALE = 'es-ES';

export const OCUPACION_MAX_PER_MES = 240;
