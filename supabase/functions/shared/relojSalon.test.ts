// Tests del reloj del salon.
//
//   deno test --no-config supabase/functions/shared/relojSalon.test.ts
//
// OJO: no se puede simular el runtime de la edge con la variable TZ — Deno la
// ignora en Windows (verificado: `TZ=UTC deno eval` sigue diciendo
// Europe/Madrid). Por eso los dos regimenes (runtime UTC como la edge, runtime
// Madrid como el navegador) se prueban INYECTANDO el desfase, que es la unica
// forma de que estos tests signifiquen lo mismo en cualquier maquina.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  offsetMinutos,
  desfaseRuntimeMin,
  parseInstanteSalon,
  enHoraSalon,
  fechaSalon,
  horariosAlRelojDelRuntime,
} from './relojSalon.ts';

const VERANO = new Date('2026-08-27T10:00:00Z'); // CEST, UTC+2
const INVIERNO = new Date('2026-01-15T10:00:00Z'); // CET, UTC+1

Deno.test('offsetMinutos: Madrid va +120 en verano y +60 en invierno', () => {
  assertEquals(offsetMinutos(VERANO), 120);
  assertEquals(offsetMinutos(INVIERNO), 60);
});

Deno.test('parseInstanteSalon: una hora sin zona es hora de Madrid, no UTC', () => {
  // 15:30 de Madrid en agosto = 13:30Z. Si se interpretara como UTC (que es lo
  // que hace new Date() en la edge) la cita caeria dos horas tarde.
  assertEquals(parseInstanteSalon('2026-08-27T15:30').toISOString(), '2026-08-27T13:30:00.000Z');
  assertEquals(parseInstanteSalon('2026-01-15T15:30').toISOString(), '2026-01-15T14:30:00.000Z');
  // Con zona explicita se respeta tal cual.
  assertEquals(parseInstanteSalon('2026-08-27T15:30:00Z').toISOString(), '2026-08-27T15:30:00.000Z');
});

Deno.test('enHoraSalon / fechaSalon: siempre en el reloj de la peluqueria', () => {
  assertEquals(enHoraSalon('2026-08-27T13:30:00Z'), '2026-08-27 15:30');
  // 23:30Z del 26 son las 01:30 del 27 en Madrid: el dia del salon es el 27.
  assertEquals(fechaSalon('2026-08-26T23:30:00Z'), '2026-08-27');
});

Deno.test('desfaseRuntimeMin: 0 si el runtime ya es Madrid, +offset si es UTC', () => {
  const runtime = -VERANO.getTimezoneOffset(); // minutos que el runtime va sobre UTC
  const esperado = 120 - runtime;
  assertEquals(desfaseRuntimeMin(VERANO), esperado);
  // La propiedad que de verdad importa: si el runtime es Madrid, no se toca nada.
  if (runtime === 120) assertEquals(desfaseRuntimeMin(VERANO), 0);
});

Deno.test('horariosAlRelojDelRuntime: en un runtime UTC (la edge) desplaza las horas', () => {
  // Runtime UTC + verano => el reloj del salon va 120 min por delante.
  const filas = [{ dia_semana: 3, abierto: true, apertura: '09:00:00', cierre: '20:00' }];
  const salida = horariosAlRelojDelRuntime(filas, ['apertura', 'cierre'], { desfaseMin: 120 });

  assertEquals(salida[0].apertura, '07:00');
  assertEquals(salida[0].cierre, '18:00');
  // No toca los demas campos ni muta la entrada.
  assertEquals(salida[0].dia_semana, 3);
  assertEquals(salida[0].abierto, true);
  assertEquals(filas[0].apertura, '09:00:00');

  // Propiedad central: con esas horas, el setHours() de las libs puras —
  // ejecutado en un runtime UTC — cae en las 09:00 de Madrid.
  const enUTC = Date.UTC(2026, 7, 27, 7, 0, 0);
  assertEquals(enHoraSalon(enUTC), '2026-08-27 09:00');
});

Deno.test('horariosAlRelojDelRuntime: en un runtime Madrid (el navegador) no toca nada', () => {
  const filas = [{ apertura: '09:00:00', cierre: '20:00' }];
  const salida = horariosAlRelojDelRuntime(filas, ['apertura', 'cierre'], { desfaseMin: 0 });
  assertEquals(salida[0].apertura, '09:00:00');
  assertEquals(salida[0].cierre, '20:00');
});

Deno.test('horariosAlRelojDelRuntime: invierno desplaza 60, no 120', () => {
  const filas = [{ apertura: '09:00', cierre: '20:00' }];
  const salida = horariosAlRelojDelRuntime(filas, ['apertura', 'cierre'], { desfaseMin: 60 });
  assertEquals(salida[0].apertura, '08:00');
  assertEquals(salida[0].cierre, '19:00');
  // Y el desfase de invierno sale de offsetMinutos, que ya se probo arriba.
  assertEquals(offsetMinutos(INVIERNO), 60);
});

Deno.test('horariosAlRelojDelRuntime: tolera nulos, formatos invalidos y recorta al dia', () => {
  const filas = [{ apertura: null as string | null, cierre: 'no-es-hora' }];
  const salida = horariosAlRelojDelRuntime(filas, ['apertura', 'cierre'], { desfaseMin: 120 });
  assertEquals(salida[0].apertura, null);
  assertEquals(salida[0].cierre, 'no-es-hora');
  assert(horariosAlRelojDelRuntime(null, ['x'], { desfaseMin: 120 }).length === 0);

  // Un salon que abriera a la 01:00 no puede desplazarse a las 23:00 del dia
  // anterior: se recorta a 00:00 (envolver pondria la apertura tras el cierre).
  const madrugada = horariosAlRelojDelRuntime(
    [{ apertura: '01:00', cierre: '05:00' }], ['apertura', 'cierre'], { desfaseMin: 120 },
  );
  assertEquals(madrugada[0].apertura, '00:00');
  assertEquals(madrugada[0].cierre, '03:00');
});
