export interface Cita {
  id: string;
  inicio: string;
  fin: string;
  profesional_id: string;
  cliente_id: string;
  servicio_id: string;
  [key: string]: any;
}

export function isTimeSlotOccupied(
  testStart: Date,
  testEnd: Date,
  citas: Cita[],
  profId: string,
  excludeId?: string
): boolean {
  return citas.some((cita) => {
    if (cita.profesional_id !== profId) return false;
    if (excludeId && cita.id === excludeId) return false;

    const citaInicio = new Date(cita.inicio);
    const citaFinActiva = cita.fin_activa ? new Date(cita.fin_activa) : new Date(cita.fin);
    const citaFinEspera = cita.fin_espera ? new Date(cita.fin_espera) : new Date(cita.fin);
    const citaFin = new Date(cita.fin);

    // Overlaps with first active phase → blocked
    const solapaFaseActiva1 =
      testStart.getTime() < citaFinActiva.getTime() &&
      testEnd.getTime() > citaInicio.getTime();

    // Starts during wait phase but exceeds the wait window → blocked
    // (would collide with second active phase, or simply overflow the wait slot)
    const excedeLaEspera =
      testStart.getTime() >= citaFinActiva.getTime() &&
      testStart.getTime() < citaFinEspera.getTime() &&
      testEnd.getTime() > citaFinEspera.getTime();

    // Starts during second active phase (if it exists) → blocked
    const solapaSegundaFaseActiva =
      citaFinEspera.getTime() < citaFin.getTime() &&
      testStart.getTime() >= citaFinEspera.getTime() &&
      testStart.getTime() < citaFin.getTime();

    return solapaFaseActiva1 || excedeLaEspera || solapaSegundaFaseActiva;
  });
}
