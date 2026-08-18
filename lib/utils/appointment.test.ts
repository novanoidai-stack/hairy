// Ocupacion del profesional: que hueco esta libre de verdad.
// Regla unica (Modular 1): una cita ocupa a su profesional en [inicio, fin_activa)
// y en [fin_espera, fin). El reposo [fin_activa, fin_espera) lo deja LIBRE, y ahi si
// se puede encajar otra cita (tiempo muerto productivo).
// Ejecutar: deno test --no-check lib/utils/appointment.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isTimeSlotOccupied, citaSolapaOcupacion, type Cita } from './appointment.ts';

const DIA = '2026-08-18';
const at = (h: number, m = 0) => new Date(`${DIA}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
const iso = (h: number, m = 0) => at(h, m).toISOString();

const PROF = 'prof-1';
const OTRO = 'prof-2';

function cita(p: Partial<Cita> & { inicio: string; fin: string }): Cita {
  return {
    id: p.id ?? 'c1',
    profesional_id: p.profesional_id ?? PROF,
    cliente_id: 'cli',
    servicio_id: 'srv',
    ...p,
  } as Cita;
}

// El caso que se colo en produccion: "Cobertura de canas" 10:00-11:20 sembrada sin
// fin_espera. Sin ese dato NO se puede afirmar que hay reposo, asi que la cita ocupa
// entera. Antes se leia al reves (reposo hasta el final) y la agenda ofrecia las 10:30.
Deno.test('cita con fin_espera NULL ocupa hasta el final', () => {
  const citas = [cita({ id: 'unai', inicio: iso(10), fin: iso(11, 20), fin_activa: iso(10, 30), fin_espera: null })];
  assertEquals(isTimeSlotOccupied(at(10, 30), at(11, 0), citas, PROF), true);
  assertEquals(isTimeSlotOccupied(at(11, 0), at(11, 30), citas, PROF), true);
  // Justo al terminar ya esta libre.
  assertEquals(isTimeSlotOccupied(at(11, 20), at(11, 50), citas, PROF), false);
});

Deno.test('cita sin ninguna fase escrita ocupa entera', () => {
  const citas = [cita({ id: 'x', inicio: iso(10), fin: iso(11), fin_activa: null, fin_espera: null })];
  assertEquals(isTimeSlotOccupied(at(10, 30), at(10, 45), citas, PROF), true);
});

// Con las fases completas, el reposo si es hueco aprovechable.
Deno.test('el reposo declarado deja hueco para otra fase activa', () => {
  const citas = [cita({ id: 'unai', inicio: iso(10), fin: iso(11, 20), fin_activa: iso(10, 30), fin_espera: iso(11, 5) })];
  // Cabe entera dentro del reposo 10:30-11:05.
  assertEquals(isTimeSlotOccupied(at(10, 30), at(11, 0), citas, PROF), false);
  // Toca el limite exacto: sigue valiendo.
  assertEquals(isTimeSlotOccupied(at(10, 35), at(11, 5), citas, PROF), false);
  // Se pasa del reposo y pisa la segunda fase activa (11:05-11:20).
  assertEquals(isTimeSlotOccupied(at(10, 45), at(11, 15), citas, PROF), true);
  // Empieza dentro de la segunda fase activa.
  assertEquals(isTimeSlotOccupied(at(11, 10), at(11, 40), citas, PROF), true);
});

Deno.test('la primera fase activa nunca se comparte', () => {
  const citas = [cita({ id: 'unai', inicio: iso(10), fin: iso(11, 20), fin_activa: iso(10, 30), fin_espera: iso(11, 5) })];
  assertEquals(isTimeSlotOccupied(at(10, 15), at(10, 45), citas, PROF), true);
  assertEquals(isTimeSlotOccupied(at(9, 30), at(10, 0), citas, PROF), false); // pega justo antes
  assertEquals(isTimeSlotOccupied(at(9, 45), at(10, 15), citas, PROF), true);
});

Deno.test('solo cuentan las citas del mismo profesional y no la excluida', () => {
  const citas = [cita({ id: 'unai', inicio: iso(10), fin: iso(11), fin_activa: iso(11), fin_espera: null, profesional_id: OTRO })];
  assertEquals(isTimeSlotOccupied(at(10, 15), at(10, 45), citas, PROF), false);
  const propias = [cita({ id: 'unai', inicio: iso(10), fin: iso(11), fin_activa: iso(11), fin_espera: null })];
  assertEquals(isTimeSlotOccupied(at(10, 15), at(10, 45), propias, PROF), true);
  assertEquals(isTimeSlotOccupied(at(10, 15), at(10, 45), propias, PROF, 'unai'), false);
});

// citaSolapaOcupacion valida LAS DOS fases activas de la cita nueva de una sola vez:
// el guardado comprobaba solo la primera y colaba una segunda fase encima de otra cita.
Deno.test('la segunda fase activa de la cita nueva tambien se valida', () => {
  const citas = [cita({ id: 'otra', inicio: iso(9, 50), fin: iso(10, 30), fin_activa: iso(10, 30), fin_espera: null })];
  const candidata = { inicio: at(9, 0), finActiva: at(9, 15), finEspera: at(9, 45), fin: at(10, 0) };
  // La fase activa 1 (09:00-09:15) esta limpia, pero la 2 (09:45-10:00) pisa a 'otra'.
  assertEquals(isTimeSlotOccupied(candidata.inicio, candidata.finActiva, citas, PROF), false);
  assertEquals(citaSolapaOcupacion(candidata, citas, PROF), true);
});

Deno.test('citaSolapaOcupacion deja pasar el encaje limpio en reposo', () => {
  const citas = [cita({ id: 'unai', inicio: iso(10), fin: iso(11, 20), fin_activa: iso(10, 30), fin_espera: iso(11, 5) })];
  // Servicio corto sin segunda fase que cabe entero en el reposo.
  const candidata = { inicio: at(10, 30), finActiva: at(11, 0), finEspera: at(11, 0), fin: at(11, 0) };
  assertEquals(citaSolapaOcupacion(candidata, citas, PROF), false);
});

// El reposo de la cita NUEVA puede pisar la fase activa de otra: el profesional esta
// libre durante su propio reposo, que es justo de lo que va el tiempo muerto productivo.
Deno.test('el reposo de la cita nueva puede solaparse con el trabajo de otra', () => {
  const citas = [cita({ id: 'otra', inicio: iso(10, 30), fin: iso(11, 0), fin_activa: iso(11, 0), fin_espera: null })];
  const candidata = { inicio: at(10, 0), finActiva: at(10, 30), finEspera: at(11, 0), fin: at(11, 15) };
  assertEquals(citaSolapaOcupacion(candidata, citas, PROF), false);
});
