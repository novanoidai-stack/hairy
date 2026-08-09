import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validarTurnoYFestivo, type EvaluacionDisponibilidadFecha } from './validadorFestivosTurnos.ts';

Deno.test('bloquea reserva en festivo cerrado completo (Navidad/Año Nuevo)', () => {
  const e: EvaluacionDisponibilidadFecha = {
    profesionalId: 'p1',
    fechaISO: '2026-12-25T10:00:00.000Z',
    festivos: [
      { fechaYYYYMMDD: '2026-12-25', nombreFestivo: 'Navidad', esCerradoCompleto: true },
    ],
    turnos: [],
  };
  const res = validarTurnoYFestivo(e);
  assertEquals(res.disponible, false);
  assertEquals(res.motivoBloqueo?.includes('Navidad'), true);
});

Deno.test('bloquea reserva si el profesional tiene dia libre en su turno rotativo', () => {
  const e: EvaluacionDisponibilidadFecha = {
    profesionalId: 'p2',
    fechaISO: '2026-08-10T10:00:00.000Z', // Lunes (diaSemana = 1)
    festivos: [],
    turnos: [
      { profesionalId: 'p2', diaSemana: 1, turno: 'libre' },
    ],
  };
  const res = validarTurnoYFestivo(e);
  assertEquals(res.disponible, false);
  assertEquals(res.motivoBloqueo?.includes('día libre'), true);
});
