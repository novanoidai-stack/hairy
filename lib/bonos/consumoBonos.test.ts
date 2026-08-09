import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { consumirSesionBono, type BonoCliente } from './consumoBonos.ts';

Deno.test('bono activo con sesiones descuenta 1 sesion correctamente', () => {
  const bono: BonoCliente = {
    bonoId: 'b-1',
    clienteId: 'c-1',
    servicioNombre: 'Bono 5 Sesiones Laser',
    sesionesTotales: 5,
    sesionesRestantes: 3,
    fechaCaducidadISO: '2028-12-31T23:59:59.000Z',
  };

  const res = consumirSesionBono(bono);
  assertEquals(res.exito, true);
  assertEquals(res.sesionesRestantesActualizadas, 2);
  assertEquals(res.descontadoConExito, true);
});

Deno.test('bono caducado no permite consumo y reporta motivo', () => {
  const bono: BonoCliente = {
    bonoId: 'b-2',
    clienteId: 'c-2',
    servicioNombre: 'Bono Masaje 3 Sesiones',
    sesionesTotales: 3,
    sesionesRestantes: 2,
    fechaCaducidadISO: '2020-01-01T00:00:00.000Z',
  };

  const res = consumirSesionBono(bono);
  assertEquals(res.exito, false);
  assertEquals(res.sesionesRestantesActualizadas, 2);
  assertEquals(res.motivoRechazo?.includes('caducado'), true);
});
