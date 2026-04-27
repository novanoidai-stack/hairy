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
  profId: string
): boolean {
  return citas.some((cita) => {
    if (cita.profesional_id !== profId) return false;
    const citaInicio = new Date(cita.inicio);
    const citaFin = new Date(cita.fin);
    return (
      testStart.getTime() < citaFin.getTime() &&
      testEnd.getTime() > citaInicio.getTime()
    );
  });
}
