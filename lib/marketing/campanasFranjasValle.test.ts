import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { identificarFranjasValleYRecomendar, type OcupacionFranjaHora } from './campanasFranjasValle.ts';

Deno.test('identifica franjas con <40% de ocupacion y asigna descuentos dinamicos', () => {
  const franjas: OcupacionFranjaHora[] = [
    { diaSemana: 'Martes', horaHHMM: '12:00', porcentajeOcupacion: 15 }, // <20 -> 25% dto
    { diaSemana: 'Miércoles', horaHHMM: '16:00', porcentajeOcupacion: 35 }, // <40 -> 15% dto
    { diaSemana: 'Viernes', horaHHMM: '18:00', porcentajeOcupacion: 90 }, // >40 -> No promocionar
  ];

  const res = identificarFranjasValleYRecomendar(franjas);
  assertEquals(res.length, 2);

  // La de menor ocupacion (15%) queda primera
  assertEquals(res[0].diaSemana, 'Martes');
  assertEquals(res[0].descuentoSugeridoPorcentaje, 25);
  assertEquals(res[0].frasePromocional.includes('25%'), true);

  assertEquals(res[1].diaSemana, 'Miércoles');
  assertEquals(res[1].descuentoSugeridoPorcentaje, 15);
});
