// Horas ofrecibles segun el horario real del profesional.
// Ejecutar: deno test --no-check lib/horarios.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { slotsQueCaben, cabeEnAlgunaFranja, dentroDeAlgunaFranja, type Franja } from './horariosFranjas.ts';

const f = (hora_inicio: string, hora_fin: string): Franja => ({ hora_inicio, hora_fin });

Deno.test('la ultima hora ofrecida deja terminar la cita dentro de la franja', () => {
  const slots = slotsQueCaben([f('09:00', '11:00')], 30);
  assertEquals(slots[0], '09:00');
  assertEquals(slots[slots.length - 1], '10:30');
});

Deno.test('un servicio largo recorta la cola de la franja', () => {
  // 80' (color con reposo) en un turno de 09:00 a 11:00: la ultima de la rejilla de
  // 15' que termina a tiempo es 09:30 (09:45 + 80' = 11:05, se sale).
  assertEquals(slotsQueCaben([f('09:00', '11:00')], 80).slice(-1)[0], '09:30');
  // Si no cabe ninguna vez, no se ofrece nada.
  assertEquals(slotsQueCaben([f('09:00', '10:00')], 90), []);
});

Deno.test('horario partido: no se ofrecen horas de la pausa', () => {
  const slots = slotsQueCaben([f('09:00', '14:00'), f('16:00', '20:00')], 60);
  assertEquals(slots.includes('13:00'), true);
  assertEquals(slots.includes('13:15'), false); // se saldria de la franja de manana
  assertEquals(slots.includes('14:30'), false); // pausa de comida
  assertEquals(slots.includes('16:00'), true);
  assertEquals(slots.slice(-1)[0], '19:00');
});

Deno.test('sin franjas no hay horas', () => {
  assertEquals(slotsQueCaben([], 30), []);
});

Deno.test('franjas solapadas no duplican horas y salen ordenadas', () => {
  const slots = slotsQueCaben([f('10:00', '12:00'), f('09:00', '11:00')], 30);
  assertEquals(slots[0], '09:00');
  assertEquals(new Set(slots).size, slots.length);
  assertEquals([...slots].sort().join(), slots.join());
});

Deno.test('acepta HH:MM:SS como devuelve Postgres', () => {
  assertEquals(slotsQueCaben([f('09:00:00', '10:00:00')], 30).slice(-1)[0], '09:30');
});

Deno.test('cabeEnAlgunaFranja respeta el limite exacto', () => {
  const franjas = [f('09:00', '14:00'), f('16:00', '20:00')];
  assertEquals(cabeEnAlgunaFranja(franjas, 13 * 60, 60), true); // 13:00-14:00 justo
  assertEquals(cabeEnAlgunaFranja(franjas, 13 * 60 + 15, 60), false);
  assertEquals(cabeEnAlgunaFranja(franjas, 19 * 60, 60), true);
  assertEquals(cabeEnAlgunaFranja(franjas, 15 * 60, 30), false); // en la pausa
  assertEquals(dentroDeAlgunaFranja(franjas, 9 * 60, 10 * 60), true);
});
