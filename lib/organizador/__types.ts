// Tipos compartidos del organizador inteligente (Fase 2+).
//
// El motor de propuestas (motorPropuestas.ts) genera y puntúa miles de
// movimientos candidatos por cita. Estos tipos son el contrato entre el motor,
// la UI (OrganizarAgendaPanel) y, en la Fase 3, el envio a chispaOps / n8n.
//
// Reutiliza el modelo de fases de lib/retrasos.ts (Fases, fasesDe) para no
// duplicar la primitiva de "como ocupa una cita" que ya usa todo el resto del
// organizador determinista.

import type { Fases } from '../retrasos.ts';

// Tipo de movimiento: lo usa la UI para agrupar/etiquetar y el score para
// ponderar (cambiar de dia "pesa" mas que compactar dentro del mismo dia).
export type TipoMovimiento =
  // Adelantar/retrasar dentro del mismo dia y mismo profesional.
  | 'compactar'
  // Mover a otro dia (±N dias). Requiere confirmacion del cliente en Fase 3.
  | 'cambiar_dia'
  // Reasignar a otro profesional (categoria >= categoriaMinima del servicio).
  | 'cambiar_trabajador'
  // Aprovechar un reposo libre de otra cita (tiempo muerto productivo).
  | 'aprovechar_reposo';

// Un movimiento candidato generado por el motor. El score es lo que ordena
// las propuestas: mayor = mejor. -Infinity (usamos -1e9 para no romper sort)
// significa "descartado por hard constraint" (fuera de jornada, choque
// activa-activa, etc.).
export interface MovimientoCandidato {
  citaId: string;
  // Profesional DESTINO. Si coincide con el de la cita, no hay reasignacion.
  profesionalId: string;
  cambioTrabajador: boolean;
  // Dia destino en formato YYYY-MM-DD (local). Si difiere del dia actual,
  // requiere confirmacion del cliente.
  fechaDia: string;
  cambioDia: boolean;
  // Fases del movimiento (ms): el motor las calcula conservando la duracion
  // de cada fase de la cita original, solo desplazadas.
  fases: Fases;
  // Puntacion: mayor = mejor. -1e9 = descartado. Ver scoreMovimiento().
  score: number;
  // Explicacion legible de por que este score (para la tarjeta "por que").
  razonScore: string;
  tipo: TipoMovimiento;
  // Minutos ganados (compactacion) respecto a la posicion actual. Negativo si
  // el movimiento retrasa la cita (caso mover_reasignar a hueco posterior).
  gananciaMin: number;
}

// Resultado del motor para una cita: lista ordenada de candidatos (el [0] es
// la propuesta recomendada), tras descartar los de score -1e9.
export interface PropuestasCita {
  citaId: string;
  // Score de la posicion actual (para saber si mover compensa).
  scoreActual: number;
  candidatos: MovimientoCandidato[];
}

// Constante de descarte. Usamos un numero finito negativo grande en vez de
// -Infinity para que Array.sort no devuelva NaN y los tests sean deterministicos.
export const SCORE_DESCARTADO = -1e9;
