// Tests puros de la logica de resenas del portal publico (deno test).
// Ejecutar: deno test lib/portalResenas.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barrasDistribucion, subNotas } from './portalResenas.ts';

Deno.test('barrasDistribucion ordena de 5 a 1 y calcula porcentajes', () => {
  const r = barrasDistribucion({ '5': 7, '4': 2, '3': 1, '2': 0, '1': 0 }, 10);
  assertEquals(r.map((x) => x.star), [5, 4, 3, 2, 1]);
  assertEquals(r[0].pct, 70);
  assertEquals(r[1].pct, 20);
  assertEquals(r[4].pct, 0);
});

Deno.test('barrasDistribucion no divide por cero', () => {
  const r = barrasDistribucion({ '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 }, 0);
  assertEquals(r.every((x) => x.pct === 0), true);
});

Deno.test('barrasDistribucion tolera una distribucion ausente', () => {
  const r = barrasDistribucion(undefined, 10);
  assertEquals(r.length, 5);
  assertEquals(r.every((x) => x.count === 0 && x.pct === 0), true);
});

Deno.test('barrasDistribucion rellena las estrellas que falten', () => {
  const r = barrasDistribucion({ '5': 3 }, 3);
  assertEquals(r.find((x) => x.star === 5)?.count, 3);
  assertEquals(r.find((x) => x.star === 2)?.count, 0);
});

// Caso real del salon demo, tal cual lo devuelve la RPC tras la migracion.
Deno.test('barrasDistribucion cuadra con la salida real de la RPC', () => {
  const r = barrasDistribucion({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 }, 3);
  assertEquals(r.find((x) => x.star === 5)?.pct, 67);
  assertEquals(r.find((x) => x.star === 4)?.pct, 33);
  assertEquals(r.reduce((a, x) => a + x.count, 0), 3);
});

Deno.test('subNotas solo devuelve las que existen', () => {
  assertEquals(
    subNotas({ trato: 4, productos: null }),
    [{ etiqueta: 'Trato', valor: 4 }]
  );
});

Deno.test('subNotas devuelve vacio cuando no hay ninguna', () => {
  assertEquals(subNotas({}), []);
});

Deno.test('subNotas devuelve las dos cuando estan las dos', () => {
  assertEquals(
    subNotas({ trato: 5, productos: 3 }),
    [{ etiqueta: 'Trato', valor: 5 }, { etiqueta: 'Limpieza/Prod', valor: 3 }]
  );
});

// Un cero es una nota valida, no un "sin dato". Si se usara `if (r.trato)` en
// vez de `!= null`, esta se perderia.
Deno.test('subNotas no confunde el cero con la ausencia', () => {
  assertEquals(
    subNotas({ trato: 0 }),
    [{ etiqueta: 'Trato', valor: 0 }]
  );
});
