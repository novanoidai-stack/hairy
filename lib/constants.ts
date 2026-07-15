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
  PENDIENTE: 'pendiente',
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

// Jerarquia de categorias de menor a mayor (para requisitos de categoria minima).
export const CATEGORIA_ORDEN: CategoriaProfesional[] = [
  'auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion',
];

// True si un profesional de categoria `profCat` cumple el requisito `minima`.
// minima null/undefined = sin requisito. Requisito desconocido no bloquea; categoria
// desconocida no cumple cuando hay requisito.
export function categoriaCumple(
  profCat: string | null | undefined,
  minima: string | null | undefined,
): boolean {
  if (!minima) return true;
  const need = CATEGORIA_ORDEN.indexOf(minima as CategoriaProfesional);
  if (need < 0) return true;
  const have = CATEGORIA_ORDEN.indexOf((profCat ?? '') as CategoriaProfesional);
  return have >= need;
}

// Etiquetas reservadas para el seguimiento manual de resenas. Las resenas del portal son
// anonimas, asi que el staff marca a mano si un cliente ha valorado el salon y/o Mecha.
// Se guardan en clientes.etiquetas pero NO se muestran como etiquetas manuales.
export const TAG_RESENO_SALON = 'Reseñó salón';
export const TAG_RESENO_MECHA = 'Reseñó Mecha';
export const TAGS_RESENA = [TAG_RESENO_SALON, TAG_RESENO_MECHA];

export const LOCALE = 'es-ES';

export const OCUPACION_MAX_PER_MES = 240;
