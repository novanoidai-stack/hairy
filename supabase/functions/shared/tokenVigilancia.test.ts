// La puerta de VIGILANCIA_TOKEN. Es lo unico que separa de internet a las dos
// funciones que llama GitHub Actions, y las dos tienen verify_jwt = false: si
// esto se rompe, quedan abiertas al mundo.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { autorizarVigilancia, igualesEnTiempoConstante } from './tokenVigilancia.ts';

const peticion = (token?: string) =>
  new Request('https://x.test/', {
    method: 'POST',
    headers: token === undefined ? {} : { 'x-vigilancia-token': token },
  });

Deno.test('la comparacion no se rinde antes de tiempo por longitudes iguales', () => {
  assert(igualesEnTiempoConstante('abc', 'abc'));
  assert(!igualesEnTiempoConstante('abc', 'abd'));
});

Deno.test('longitudes distintas no casan', () => {
  assert(!igualesEnTiempoConstante('abc', 'abcd'));
  assert(!igualesEnTiempoConstante('', 'a'));
});

Deno.test('sin VIGILANCIA_TOKEN en el entorno, falla RUIDOSAMENTE con 500', () => {
  Deno.env.delete('VIGILANCIA_TOKEN');
  const v = autorizarVigilancia(peticion('lo-que-sea'), 'prueba');
  assert(!v.ok);
  if (v.ok) return;
  // 500 y no 401 a proposito: no es que el que llama se equivoque, es que la
  // funcion esta mal configurada. Aceptar cualquier cosa "porque no hay token"
  // seria exactamente el agujero.
  assertEquals(v.status, 500);
  assertEquals(v.cuerpo.error, 'sin_configurar');
});

Deno.test('con el token correcto, pasa', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'token-de-prueba-largo');
  assertEquals(autorizarVigilancia(peticion('token-de-prueba-largo'), 'prueba').ok, true);
});

Deno.test('con un token distinto, 401', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'token-de-prueba-largo');
  const v = autorizarVigilancia(peticion('otro-token-cualquiera'), 'prueba');
  assert(!v.ok);
  if (v.ok) return;
  assertEquals(v.status, 401);
});

Deno.test('sin cabecera, 401 (y no un pase gratis)', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'token-de-prueba-largo');
  const v = autorizarVigilancia(peticion(undefined), 'prueba');
  assert(!v.ok);
  if (v.ok) return;
  assertEquals(v.status, 401);
});

Deno.test('un token vacio tampoco cuela', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'token-de-prueba-largo');
  assertEquals(autorizarVigilancia(peticion(''), 'prueba').ok, false);
});
