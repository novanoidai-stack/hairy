import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularAjusteReasignacion, type DatosReasignacion } from './bonificacionReasignacion.ts';

Deno.test('reasignacion entre misma categoria no genera diferencia de tarifa', () => {
  const d: DatosReasignacion = {
    citaId: 'c1',
    categoriaProfOriginal: 'estandar',
    categoriaProfNuevo: 'estandar',
    precioBaseServicio: 30,
    respetarPrecioOriginal: true,
  };
  const res = calcularAjusteReasignacion(d);
  assertEquals(res.precioFinalCliente, 30);
  assertEquals(res.diferenciaTarifa, 0);
  assertEquals(res.ajusteAbsorbidoPorSalon, false);
});

Deno.test('reasignacion de estandar a master respetando precio absorbe la diferencia', () => {
  const d: DatosReasignacion = {
    citaId: 'c2',
    categoriaProfOriginal: 'estandar',
    categoriaProfNuevo: 'master',
    precioBaseServicio: 50,
    respetarPrecioOriginal: true,
  };
  const res = calcularAjusteReasignacion(d);
  assertEquals(res.precioFinalCliente, 50);
  assertEquals(res.diferenciaTarifa, 15); // (50 * 1.3 = 65) - 50 = 15
  assertEquals(res.ajusteAbsorbidoPorSalon, true);
  assertEquals(res.incentivoProfesional, 3.00);
});

Deno.test('reasignacion sin respetar precio aplica tarifa superior al cliente', () => {
  const d: DatosReasignacion = {
    citaId: 'c3',
    categoriaProfOriginal: 'junior',
    categoriaProfNuevo: 'senior',
    precioBaseServicio: 40,
    respetarPrecioOriginal: false,
  };
  const res = calcularAjusteReasignacion(d);
  // Junior: 40 * 0.9 = 36. Senior: 40 * 1.15 = 46
  assertEquals(res.precioFinalCliente, 46);
  assertEquals(res.diferenciaTarifa, 10);
  assertEquals(res.ajusteAbsorbidoPorSalon, false);
});
