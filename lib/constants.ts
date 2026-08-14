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

// Limites del organizador de agenda. Configurables por salon en negocio_config
// (claves agendaMaxAdelantoMin / agendaUmbralHuecoMin); estos son los defaults.
// Cuanto se puede adelantar una cita como maximo.
//
// OJO: un techo en minutos de adelanto es un mal criterio y por eso ya no manda
// solo. Adelantar de 17:00 a 10:00 es razonable si son las 7:00 (la clienta
// tiene 3 horas para contestar) y una temeridad si son las 9:50. Lo que de
// verdad limita es AGENDA_MARGEN_REACCION_MIN_DEFAULT: el hueco entre que
// recibe el aviso y la hora nueva. Este techo se mantiene alto como red de
// seguridad para que el organizador no proponga barbaridades de dia entero.
export const AGENDA_MAX_ADELANTO_MIN_DEFAULT = 240;
// Margen minimo entre que la clienta recibe la propuesta y la hora nueva. Es el
// limite que de verdad importa: si no le da tiempo a leerlo y contestar, no se
// propone. Configurable por salon (clave agendaMargenReaccionMin).
export const AGENDA_MARGEN_REACCION_MIN_DEFAULT = 120;
// Ganancia minima para proponer mover a una clienta: media hora justifica el
// aviso, un slot (15 min) es ruido.
export const AGENDA_UMBRAL_HUECO_MIN_DEFAULT = 30;

export const CITA_CARD_DETAILS_MIN_HEIGHT = 38;

export const CITA_STATUS = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  COMPLETADA: 'completada',
  FINALIZADA: 'finalizada',
  CANCELADA: 'cancelada',
  NO_PRESENTADA: 'no_presentada',
} as const;

export type CitaStatus = typeof CITA_STATUS[keyof typeof CITA_STATUS];

export const CITA_STATUS_TERMINALES: CitaStatus[] = [
  CITA_STATUS.COMPLETADA,
  CITA_STATUS.CANCELADA,
  CITA_STATUS.NO_PRESENTADA,
];

// Citas VIVAS para filtrar en consultas SQL (`.in('estado', ...)`).
//
// Tiene que decir lo mismo que el predicado `esActiva` de lib/citasMetrics, que
// ya cuenta las pendientes. Antes esta lista solo traia `confirmada` y las dos
// se contradecian pese a llamarse igual. Con las citas naciendo en `pendiente`
// eso dejaba de ser un detalle: la "proxima cita" de una clienta salia vacia y
// los huecos libres del dia daban por libre un hueco ya reservado.
// (`completada` se anade en el sitio que la necesite, como Mi jornada.)
export const CITA_STATUS_ACTIVOS: CitaStatus[] = [
  CITA_STATUS.PENDIENTE,
  CITA_STATUS.CONFIRMADA,
];

// Estados que OCUPAN hueco: con una cita asi encima, no se puede poner otra.
//
// Es la fuente unica para TODOS los chequeos de solape (alta simple, encadenado,
// serie recurrente y analisis del dia). Antes cada sitio comprobaba a mano
// `estado = 'confirmada'`, con lo que una cita `pendiente` era INVISIBLE para la
// validacion: se dejaba crear otra encima y luego el repartidor de columnas las
// pintaba en paralelo. Ese era el bug de la "doble columna".
//
// Entran `pendiente` (aun sin confirmar, pero el hueco ya es suyo) y `confirmada`.
// NO entran `cancelada` ni `no_presentada`: ahi el hueco vuelve a estar libre de
// verdad. Tampoco `completada`, a proposito: apuntar a posteriori un trabajo ya
// hecho es un flujo real del mostrador y no debe chocar consigo mismo.
export const CITA_STATUS_BLOQUEAN_SOLAPE: CitaStatus[] = [
  CITA_STATUS.PENDIENTE,
  CITA_STATUS.CONFIRMADA,
];

// Estados que NO se pintan como columna propia en la rejilla: no compiten por
// espacio con las citas vivas (una cancelada no debe partir el dia en dos).
export const CITA_STATUS_SIN_LANE: CitaStatus[] = [
  CITA_STATUS.CANCELADA,
  CITA_STATUS.NO_PRESENTADA,
];

// Versiones en forma de predicado: el `estado` que llega de la BD es un `string`
// suelto, asi que estas evitan tener que castear en cada punto de uso.
export const bloqueaSolape = (estado?: string | null): boolean =>
  (CITA_STATUS_BLOQUEAN_SOLAPE as string[]).includes(estado ?? '');

export const sinCarrilPropio = (estado?: string | null): boolean =>
  (CITA_STATUS_SIN_LANE as string[]).includes(estado ?? '');

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
