import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  digitoControlValido,
  interpretarLectura,
  pareceEscaner,
  type TeclaLeida,
} from './lectorCodigoBarras.ts';

/** Teclea un codigo con una separacion fija entre teclas. */
function teclear(codigo: string, msEntreTeclas: number): TeclaLeida[] {
  return codigo.split('').map((char, i) => ({ char, tMs: i * msEntreTeclas }));
}

// EAN-13 real de un producto de gran consumo (agua mineral). Digito de control 3.
const EAN_BUENO = '8410128750213';

Deno.test('el escaner teclea el codigo en un suspiro', () => {
  assertEquals(pareceEscaner(teclear(EAN_BUENO, 8)), true);
});

Deno.test('una persona escribiendo no se confunde con un escaner', () => {
  // 120 ms entre teclas es tecleo humano rapido.
  assertEquals(pareceEscaner(teclear(EAN_BUENO, 120)), false);
});

Deno.test('una sola pausa en medio ya delata a la persona', () => {
  const teclas = teclear(EAN_BUENO, 8);
  // Se para a mirar el papel a mitad de codigo.
  for (let i = 7; i < teclas.length; i++) teclas[i].tMs += 400;
  assertEquals(pareceEscaner(teclas), false);
});

Deno.test('un numero corto no es un codigo de barras', () => {
  // Alguien tecleando "12345" y pulsando Enter en la pantalla de caja.
  assertEquals(pareceEscaner(teclear('12345', 5)), false);
});

Deno.test('las letras no entran', () => {
  assertEquals(pareceEscaner(teclear('84101287A0213', 8)), false);
});

Deno.test('el digito de control detecta una lectura a medias', () => {
  assertEquals(digitoControlValido(EAN_BUENO), true);
  // Mismo codigo con dos digitos cambiados de sitio: el control no cuadra.
  assertEquals(digitoControlValido('8410128750231'), false);
});

Deno.test('el control vale para EAN-8 y para UPC-A', () => {
  assertEquals(digitoControlValido('96385074'), true);       // EAN-8
  assertEquals(digitoControlValido('036000291452'), true);   // UPC-A
});

Deno.test('una lectura limpia devuelve el codigo', () => {
  const r = interpretarLectura(teclear(EAN_BUENO, 6));
  assertEquals(r, { tipo: 'codigo', codigo: EAN_BUENO });
});

Deno.test('lo tecleado a mano se descarta sin dar la lata', () => {
  // Motivo 'humano': no se avisa de nada, es lo normal.
  assertEquals(interpretarLectura(teclear('12345678', 200)), {
    tipo: 'descartado',
    motivo: 'humano',
  });
});

Deno.test('una lectura rapida pero mala si merece aviso', () => {
  // Velocidad de maquina y longitud correcta, pero el control falla: el
  // escaner ha leido mal y hay que volver a pasar el producto.
  assertEquals(interpretarLectura(teclear('8410128750231', 6)), {
    tipo: 'descartado',
    motivo: 'control',
  });
});
