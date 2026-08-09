import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularPausaDesinfeccion, type CitaParaPausa } from './desinfeccionPausas.ts';

Deno.test('decoloracion calcula 10 min de desinfeccion', () => {
  const c: CitaParaPausa = {
    citaId: 'c1',
    servicioNombre: 'Balayage Platinum',
    categoriaServicio: 'decoloracion',
    finCitaISO: '2026-08-09T11:30:00.000Z',
  };
  const res = calcularPausaDesinfeccion(c);
  assertEquals(res.duracionMin, 10);
  assertEquals(res.inicioPausaISO, '2026-08-09T11:30:00.000Z');
  assertEquals(res.finPausaISO, '2026-08-09T11:40:00.000Z');
});

Deno.test('estetica facial requiere 15 min de desinfeccion de cabina', () => {
  const c: CitaParaPausa = {
    citaId: 'c2',
    servicioNombre: 'Higiene Facial Profunda',
    categoriaServicio: 'estetica_facial',
    finCitaISO: '2026-08-09T16:00:00.000Z',
  };
  const res = calcularPausaDesinfeccion(c);
  assertEquals(res.duracionMin, 15);
  assertEquals(res.finPausaISO, '2026-08-09T16:15:00.000Z');
});
