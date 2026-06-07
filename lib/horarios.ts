// Validacion de horario laboral del profesional, respetando horario partido.
// Modular 3, seccion 5: el horario laboral se modela como una o varias franjas
// (turnos) por dia. Una cita es valida si cabe completa dentro de ALGUNA franja.
// RN-EQ-020: la agenda solo permite citas dentro del horario laboral.

import { supabase } from './supabase';

export interface Franja {
  hora_inicio: string; // 'HH:MM' o 'HH:MM:SS'
  hora_fin: string;
  turno?: number | null;
}

function horaAMin(h: string): number {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + (mm || 0);
}

// Carga las franjas (turnos) del profesional para un dia (0=Dom .. 6=Sab).
export async function franjasDelDia(profesionalId: string, diaSemana: number): Promise<Franja[]> {
  const { data } = await supabase
    .from('horarios_profesional')
    .select('hora_inicio, hora_fin, turno')
    .eq('profesional_id', profesionalId)
    .eq('dia_semana', diaSemana);
  return (data as Franja[]) ?? [];
}

// True si [inicioMin, finMin] cae completo dentro de alguna franja.
export function dentroDeAlgunaFranja(franjas: Franja[], inicioMin: number, finMin: number): boolean {
  return franjas.some(f => inicioMin >= horaAMin(f.hora_inicio) && finMin <= horaAMin(f.hora_fin));
}

// Texto legible de las franjas, ordenadas. Ej: "09:00-14:00 y 16:00-20:00".
export function franjasTexto(franjas: Franja[]): string {
  return franjas
    .slice()
    .sort((a, b) => horaAMin(a.hora_inicio) - horaAMin(b.hora_inicio))
    .map(f => `${f.hora_inicio.slice(0, 5)}-${f.hora_fin.slice(0, 5)}`)
    .join(' y ');
}

// Valida una cita [inicio, fin] contra el horario laboral del profesional.
// Si no hay franjas configuradas ese dia, no se bloquea (sin restriccion).
// Devuelve null si OK, o un mensaje de error si cae fuera de todas las franjas.
export async function validarHorarioLaboral(
  profesionalId: string,
  inicio: Date,
  fin: Date,
): Promise<string | null> {
  const franjas = await franjasDelDia(profesionalId, inicio.getDay());
  if (franjas.length === 0) return null;
  const inicioMin = inicio.getHours() * 60 + inicio.getMinutes();
  const finMin = fin.getHours() * 60 + fin.getMinutes();
  if (dentroDeAlgunaFranja(franjas, inicioMin, finMin)) return null;
  return `Fuera del horario laboral (${franjasTexto(franjas)})`;
}
