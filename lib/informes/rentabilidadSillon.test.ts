import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularRentabilidadSillon, type DatosSillonTrabajo } from './rentabilidadSillon.ts';

Deno.test('sillon con 80% ocupacion y 40€/h califica como optimo', () => {
  const d: DatosSillonTrabajo = {
    sillonId: 's1',
    nombreSillon: 'Sillón 1 - Balayage',
    horasDisponiblesMes: 160,
    horasOcupadasMes: 128, // 80%
    facturacionTotalMes: 5120, // 5120 / 128 = 40€/h
  };
  const res = calcularRentabilidadSillon(d);
  assertEquals(res.porcentajeOcupacion, 80);
  assertEquals(res.facturacionPorHoraOcupada, 40);
  assertEquals(res.nivelEficiencia, 'optimo');
});

Deno.test('cabina con ocupacion baja (30%) califica como infrautilizado', () => {
  const d: DatosSillonTrabajo = {
    sillonId: 's2',
    nombreSillon: 'Cabina Estética 3',
    horasDisponiblesMes: 160,
    horasOcupadasMes: 48, // 30%
    facturacionTotalMes: 1200,
  };
  const res = calcularRentabilidadSillon(d);
  assertEquals(res.porcentajeOcupacion, 30);
  assertEquals(res.nivelEficiencia, 'infrautilizado');
});
