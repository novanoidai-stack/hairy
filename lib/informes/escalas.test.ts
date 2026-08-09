// Tests de las escalas de ejes.
// Ejecutar: deno test lib/informes/escalas.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { escalaBonita, indicesEtiquetasX } from './escalas.ts';

// --- Eje Y ------------------------------------------------------------------

Deno.test('escala vacia o negativa no revienta y devuelve 0..1', () => {
  assertEquals(escalaBonita(0), { max: 1, ticks: [0, 1] });
  assertEquals(escalaBonita(-5), { max: 1, ticks: [0, 1] });
  assertEquals(escalaBonita(NaN), { max: 1, ticks: [0, 1] });
});

Deno.test('los pasos son siempre 1, 2 o 5 por una potencia de 10', () => {
  for (const maxDato of [3, 7, 12, 47, 130, 412, 1700, 23000, 0.4]) {
    const { ticks } = escalaBonita(maxDato);
    const paso = ticks[1] - ticks[0];
    const exp = Math.floor(Math.log10(paso));
    const mantisa = Number((paso / Math.pow(10, exp)).toPrecision(6));
    assert(
      [1, 2, 5].includes(mantisa),
      `paso ${paso} (mantisa ${mantisa}) no es 1, 2 ni 5 por una potencia de 10 para max ${maxDato}`,
    );
  }
});

Deno.test('la escala siempre llega hasta el dato o por encima, nunca lo corta', () => {
  for (const maxDato of [1, 3, 7, 47, 412, 1700, 23000]) {
    const { max } = escalaBonita(maxDato);
    assert(max >= maxDato, `la escala ${max} corta el dato ${maxDato}`);
  }
});

Deno.test('la escala empieza en cero para que las alturas sean comparables', () => {
  assertEquals(escalaBonita(412).ticks[0], 0);
});

Deno.test('con datos enteros no se generan pasos fraccionarios', () => {
  // Antes: max 1 daba paso 0.5 y el eje decia "0,5 citas".
  const { ticks } = escalaBonita(1, { enteros: true });
  for (const t of ticks) assert(Number.isInteger(t), `${t} no es entero`);
});

Deno.test('con datos pequeños y enteros el paso minimo es 1', () => {
  const { ticks } = escalaBonita(3, { enteros: true });
  assertEquals(ticks[1] - ticks[0], 1);
  assertEquals(ticks, [0, 1, 2, 3]);
});

Deno.test('los ticks van en orden y sin duplicados por coma flotante', () => {
  const { ticks } = escalaBonita(0.7);
  for (let i = 1; i < ticks.length; i++) {
    assert(ticks[i] > ticks[i - 1], `tick repetido o desordenado en ${JSON.stringify(ticks)}`);
  }
});

// --- Eje X ------------------------------------------------------------------

Deno.test('sin puntos no hay etiquetas', () => {
  assertEquals(indicesEtiquetasX(0), []);
});

Deno.test('si caben todas las etiquetas se pintan todas', () => {
  assertEquals(indicesEtiquetasX(5), [0, 1, 2, 3, 4]);
});

Deno.test('con mas puntos que etiquetas se reparten e incluyen los extremos', () => {
  // 31 dias de un mes en 7 etiquetas: antes solo se pintaban 3.
  const idx = indicesEtiquetasX(31);
  assertEquals(idx[0], 0);
  assertEquals(idx[idx.length - 1], 30);
  assert(idx.length <= 7, `${idx.length} etiquetas es mas de 7`);
  assert(idx.length >= 6, 'se han perdido etiquetas por colisiones de redondeo');
});

Deno.test('los indices nunca se repiten ni se salen del rango', () => {
  for (const n of [8, 13, 31, 90, 365]) {
    const idx = indicesEtiquetasX(n);
    assertEquals(new Set(idx).size, idx.length, `indices repetidos con n=${n}`);
    for (const i of idx) assert(i >= 0 && i < n, `indice ${i} fuera de rango con n=${n}`);
  }
});

Deno.test('un solo punto da una sola etiqueta', () => {
  assertEquals(indicesEtiquetasX(1), [0]);
});
