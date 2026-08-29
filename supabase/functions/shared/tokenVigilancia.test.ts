// Tests de la puerta de VIGILANCIA_TOKEN.
//
// Es un chequeo de autorizacion: si se rompe, dos funciones con verify_jwt=false
// quedan abiertas al mundo. No puede depender de que alguien se acuerde de
// probarlo a mano.

import { assertEquals } from 'jsr:@std/assert@1';
import { autorizarVigilancia, igualesEnTiempoConstante } from './tokenVigilancia.ts';

const pide = (token?: string) =>
  new Request('https://x/y', {
    method: 'POST',
    headers: token === undefined ? {} : { 'x-vigilancia-token': token },
  });

Deno.test('compara en tiempo constante y acierta', () => {
  assertEquals(igualesEnTiempoConstante('abc', 'abc'), true);
  assertEquals(igualesEnTiempoConstante('abc', 'abd'), false);
  assertEquals(igualesEnTiempoConstante('abc', 'abcd'), false);
  assertEquals(igualesEnTiempoConstante('', ''), true);
});

Deno.test('sin VIGILANCIA_TOKEN configurado NO se acepta nada', () => {
  Deno.env.delete('VIGILANCIA_TOKEN');
  const v = autorizarVigilancia(pide('lo-que-sea'), 'prueba');
  assertEquals(v.ok, false);
  if (!v.ok) assertEquals(v.status, 500);
});

Deno.test('token correcto pasa', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'secreto-de-prueba');
  assertEquals(autorizarVigilancia(pide('secreto-de-prueba'), 'prueba').ok, true);
});

Deno.test('token incorrecto o ausente da 401', () => {
  Deno.env.set('VIGILANCIA_TOKEN', 'secreto-de-prueba');
  for (const malo of ['otro', '', undefined]) {
    const v = autorizarVigilancia(pide(malo), 'prueba');
    assertEquals(v.ok, false, `deberia rechazar ${JSON.stringify(malo)}`);
    if (!v.ok) assertEquals(v.status, 401);
  }
  Deno.env.delete('VIGILANCIA_TOKEN');
});
