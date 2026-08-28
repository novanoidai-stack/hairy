// Ultimo control de solape al SOLTAR una cita arrastrada, contra datos frescos.
//
// Por que existe este modulo y no una comparacion a mano donde se usa:
// todo lo que decide el arrastre se calcula con la foto local de citas. Entre
// que empiezas a arrastrar y sueltas puede entrar una cita por otro sitio (otro
// dispositivo, el portal publico, el agente de WhatsApp), asi que antes de
// guardar se vuelve a preguntar a la base de datos. Esa segunda comprobacion
// estuvo escrita a mano dentro de AgendaCalendar.web.tsx y NO decia lo mismo
// que la regla de la casa:
//
//   1. Solo miraba la PRIMERA fase activa de la cita que se mueve. Una cita de
//      color tiene dos (activa - reposo - activa): si la segunda caia encima
//      del trabajo de otra, este control la dejaba pasar.
//   2. Con `fin_espera` a NULL daba por libre toda la cola posterior a
//      `fin_activa`, cuando sin `fin_espera` no se puede afirmar que haya
//      reposo: la cita ocupa entera.
//
// Era la quinta copia del predicado de ocupacion. Ya hubo cuatro divergentes y
// costaron citas creadas encima de otras (ver migrations/citas-fases-completas.sql).
// Aqui se delega en `citaSolapaOcupacion`, que es la MISMA regla que usa el
// control principal del arrastre, la pantalla de nueva cita y el SQL del portal.
import { citaSolapaOcupacion, type Cita, type CitaCandidata } from '@/lib/utils/appointment';

// Lo minimo que se pide a la BD para decidir. Se deja abierto porque la consulta
// real trae solo estas columnas, no la fila entera.
export type FilaSolape = {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string | null;
  fin_espera?: string | null;
};

// True si la cita que se acaba de soltar pisa el trabajo real de alguna de las
// filas recien traidas. Caer dentro del REPOSO de otra cita no cuenta: ese es
// justamente el hueco aprovechable que se quiere permitir (tiempos muertos
// productivos), y es la razon de que esto no sea un simple solape de rangos.
export function pisaOtraCitaAlSoltar(
  candidata: CitaCandidata,
  filas: FilaSolape[] | null | undefined,
  profesionalId: string,
  citaMovidaId: string,
): boolean {
  if (!filas || filas.length === 0) return false;

  // citaSolapaOcupacion filtra por profesional y excluye la cita movida, asi que
  // se le da a cada fila el profesional destino: la consulta ya venia filtrada
  // por ese profesional, y aqui no hay motivo para volver a arrastrar el dato.
  const citas: Cita[] = filas.map((f) => ({
    id: f.id,
    inicio: f.inicio,
    fin: f.fin,
    fin_activa: f.fin_activa ?? null,
    fin_espera: f.fin_espera ?? null,
    profesional_id: profesionalId,
    cliente_id: '',
    servicio_id: '',
  }));

  return citaSolapaOcupacion(candidata, citas, profesionalId, citaMovidaId);
}
