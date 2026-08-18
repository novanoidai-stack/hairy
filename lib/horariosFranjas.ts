// Franjas (turnos) del horario laboral: parte PURA, sin BD.
// Modular 3, seccion 5: el horario de un profesional es una o varias franjas por dia.
// Una cita es valida si cabe COMPLETA dentro de alguna franja (RN-EQ-020).
// Vive aparte de lib/horarios.ts para poder testearse sin arrastrar el cliente de
// Supabase (y sus polyfills de React Native).

export interface Franja {
  hora_inicio: string; // 'HH:MM' o 'HH:MM:SS'
  hora_fin: string;
  turno?: number | null;
}

export function horaAMin(h: string): number {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + (mm || 0);
}

export function minAHora(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// True si [inicioMin, finMin] cae completo dentro de alguna franja.
export function dentroDeAlgunaFranja(franjas: Franja[], inicioMin: number, finMin: number): boolean {
  return franjas.some(f => inicioMin >= horaAMin(f.hora_inicio) && finMin <= horaAMin(f.hora_fin));
}

// True si la cita [inicioMin, inicioMin+duracionMin] cabe en alguna franja. Version
// sincrona de `validarHorarioLaboral` para cuando ya se tienen las franjas cargadas.
export function cabeEnAlgunaFranja(
  franjas: Franja[],
  inicioMin: number,
  duracionMin: number,
): boolean {
  return dentroDeAlgunaFranja(franjas, inicioMin, inicioMin + Math.max(0, duracionMin));
}

// Horas de inicio ('HH:MM', rejilla de `pasoMin`) en las que una cita de `duracionMin`
// cabe ENTERA dentro de alguna franja. Es la misma regla que aplica el guardado, pero
// por adelantado: si la cita no termina antes de que acabe el turno, esa hora no se
// ofrece.
//
// Sin esto la rejilla de "Nueva cita" eran 09:00-20:00 fijas para todo el mundo: ofrecia
// horas de turnos que ese dia no existen y horas donde la cita se sale por el final (un
// color de 80' a las 19:45). El servidor las rechazaba despues, ya con la cita montada.
export function slotsQueCaben(
  franjas: Franja[],
  duracionMin: number,
  pasoMin = 15,
): string[] {
  const dur = Math.max(0, Math.round(duracionMin));
  const paso = Math.max(1, Math.round(pasoMin));
  const vistos = new Set<number>();
  for (const f of franjas) {
    const ini = horaAMin(f.hora_inicio);
    const fin = horaAMin(f.hora_fin);
    for (let t = ini; t < fin && t + dur <= fin; t += paso) vistos.add(t);
  }
  return [...vistos].sort((a, b) => a - b).map(minAHora);
}

// Texto legible de las franjas, ordenadas. Ej: "09:00-14:00 y 16:00-20:00".
export function franjasTexto(franjas: Franja[]): string {
  return franjas
    .slice()
    .sort((a, b) => horaAMin(a.hora_inicio) - horaAMin(b.hora_inicio))
    .map(f => `${f.hora_inicio.slice(0, 5)}-${f.hora_fin.slice(0, 5)}`)
    .join(' y ');
}
