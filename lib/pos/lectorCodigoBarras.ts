// Lector de codigo de barras de mostrador.
//
// Un escaner USB o Bluetooth no es un aparato especial para el navegador: se
// presenta como un TECLADO y "teclea" el codigo de golpe, terminando con Enter.
// Todo el problema es distinguir eso de una persona escribiendo, porque si no
// cualquiera que escriba "12345" y pulse Enter en la pantalla de caja acaba
// metiendo un producto que no queria.
//
// La señal que los separa es la VELOCIDAD: un escaner mete cada caracter en
// menos de 30 ms; una persona rapida baja de 100 ms de vez en cuando, pero no
// durante ocho o trece caracteres seguidos.
//
// Esta parte va aparte del hook porque es la que se puede equivocar y la unica
// que merece test: el pegamento con el DOM no tiene nada que pensar.

export type TeclaLeida = { char: string; tMs: number };

/** Cuanto puede tardar como mucho entre teclas para seguir pareciendo maquina. */
export const MAX_MS_ENTRE_TECLAS = 40;

/** Longitudes de codigo que se aceptan: EAN-13, EAN-8, UPC-A y DUN-14. */
export const LONGITUDES_VALIDAS = new Set([8, 12, 13, 14]);

/**
 * ¿Esta secuencia de teclas viene de un escaner?
 *
 * Pide tres cosas: que sean solo digitos, que la longitud sea de codigo de
 * barras y que ninguna pausa entre teclas pase del limite.
 */
export function pareceEscaner(teclas: TeclaLeida[]): boolean {
  if (teclas.length < 8) return false;
  if (!LONGITUDES_VALIDAS.has(teclas.length)) return false;
  if (!teclas.every((t) => /^[0-9]$/.test(t.char))) return false;

  for (let i = 1; i < teclas.length; i++) {
    if (teclas[i].tMs - teclas[i - 1].tMs > MAX_MS_ENTRE_TECLAS) return false;
  }
  return true;
}

/**
 * Digito de control de un EAN-13 / EAN-8 / UPC-A.
 *
 * Comprobarlo evita el caso feo: media lectura que por casualidad tiene 13
 * digitos y busca un producto que no es. Un codigo mal leido casi nunca pasa
 * este control.
 */
export function digitoControlValido(codigo: string): boolean {
  if (!/^[0-9]+$/.test(codigo)) return false;
  if (!LONGITUDES_VALIDAS.has(codigo.length)) return false;

  const digitos = codigo.split('').map(Number);
  const control = digitos.pop() as number;

  // De derecha a izquierda, alternando pesos 3 y 1.
  let suma = 0;
  for (let i = digitos.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) {
    suma += digitos[i] * peso;
  }
  return (10 - (suma % 10)) % 10 === control;
}

export type ResultadoLectura =
  | { tipo: 'codigo'; codigo: string }
  | { tipo: 'descartado'; motivo: 'humano' | 'control' };

/**
 * Decide que hacer con lo que se acaba de teclear antes de un Enter.
 *
 * Se separa el motivo del descarte para poder avisar de "ese codigo no es
 * valido, vuelve a pasarlo" (lectura mala) sin dar la lata cuando lo que ha
 * pasado es que alguien estaba escribiendo (que es lo normal).
 */
export function interpretarLectura(teclas: TeclaLeida[]): ResultadoLectura {
  if (!pareceEscaner(teclas)) return { tipo: 'descartado', motivo: 'humano' };

  const codigo = teclas.map((t) => t.char).join('');
  if (!digitoControlValido(codigo)) return { tipo: 'descartado', motivo: 'control' };

  return { tipo: 'codigo', codigo };
}
