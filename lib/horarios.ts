// Validacion de horario laboral del profesional, respetando horario partido.
// Modular 3, seccion 5: el horario laboral se modela como una o varias franjas
// (turnos) por dia. Una cita es valida si cabe completa dentro de ALGUNA franja.
// RN-EQ-020: la agenda solo permite citas dentro del horario laboral.
//
// La aritmetica de franjas (pura, testeable) vive en ./horariosFranjas; aqui queda
// solo lo que habla con la BD. Se reexporta para no romper los imports existentes.

import { supabase } from './supabase';
import { reportarError } from './reportarError';
import { dentroDeAlgunaFranja, franjasTexto, type Franja } from './horariosFranjas';

export {
  dentroDeAlgunaFranja,
  cabeEnAlgunaFranja,
  franjasTexto,
  slotsQueCaben,
  horaAMin,
  minAHora,
} from './horariosFranjas';
export type { Franja } from './horariosFranjas';

// Carga las franjas (turnos) del profesional para un dia (0=Dom .. 6=Sab).
export async function franjasDelDia(profesionalId: string, diaSemana: number): Promise<Franja[]> {
  const { data, error } = await supabase
    .from('horarios_profesional')
    .select('hora_inicio, hora_fin, turno')
    .eq('profesional_id', profesionalId)
    .eq('dia_semana', diaSemana);

  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    return [];
  }
  return (data as Franja[]) ?? [];
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
