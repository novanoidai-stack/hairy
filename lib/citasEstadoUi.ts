// Como se PINTA el estado de una cita: etiqueta y colores. Fuente unica.
//
// Antes esto vivia copiado en tres sitios distintos de la agenda (el mapa del
// modal de detalle, el del badge y el de la vista de lista) y no coincidian:
// `confirmada` salia verde en unos y naranja en otros, `no_presentada` roja o
// ambar segun donde miraras, y `pendiente` directamente no existia en dos de
// ellos — con lo que caia en el fallback y se pintaba igual que `confirmada`.
// Eso ultimo pasa a ser critico ahora que las citas nacen en `pendiente`: sin su
// color propio, no habria forma de distinguir de un vistazo lo que falta por
// confirmar.
//
// Se usan valores literales (no TOKENS) a proposito: estos mapas los consumen
// ficheros .web.tsx que aun redefinen sus propios TOKENS locales (deuda C14), y
// el objetivo aqui es justamente que todos digan lo MISMO.

import { CITA_STATUS } from './constants';

export interface EstadoCitaUi {
  label: string;
  /** Color del texto y del punto/borde. */
  color: string;
  /** Fondo suave para chips y badges. */
  soft: string;
}

export const ESTADO_CITA_UI: Record<string, EstadoCitaUi> = {
  // Ambar: "esto todavia te pide algo". Es el aviso de que falta confirmar.
  [CITA_STATUS.PENDIENTE]: {
    label: 'Pendiente',
    color: '#e08a00',
    soft: 'rgba(224,138,0,0.16)',
  },
  // Verde de marca: la cita esta cerrada y en pie.
  [CITA_STATUS.CONFIRMADA]: {
    label: 'Confirmada',
    color: '#0f9d6b',
    soft: 'rgba(15,157,107,0.12)',
  },
  // Verde mas claro: ya paso y salio bien.
  [CITA_STATUS.COMPLETADA]: {
    label: 'Completada',
    color: '#22c55e',
    soft: 'rgba(34,197,94,0.12)',
  },
  [CITA_STATUS.CANCELADA]: {
    label: 'Cancelada',
    color: '#e23b34',
    soft: 'rgba(226,59,52,0.12)',
  },
  // Rojo apagado, no ambar: un no-show es una perdida, no un aviso pendiente.
  [CITA_STATUS.NO_PRESENTADA]: {
    label: 'No presentada',
    color: '#ef4444',
    soft: 'rgba(239,68,68,0.15)',
  },
};

// La cita puede traer un estado que este mapa no conoce (lo escribe la capa de
// IA o una version anterior). Sin fallback, leer .color/.label de undefined
// dejaba la pantalla en blanco al abrir el detalle. Se muestra en crudo y neutro.
export function metaEstadoCita(estado?: string | null): EstadoCitaUi {
  return (
    ESTADO_CITA_UI[estado ?? ''] ?? {
      label: estado || 'Sin estado',
      color: '#5c5249',
      soft: 'rgba(148,163,184,0.12)',
    }
  );
}
