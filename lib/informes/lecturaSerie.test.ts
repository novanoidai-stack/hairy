// Tests puros del motor de lectura de graficas.
// Ejecutar: deno test lib/informes/lecturaSerie.test.ts
import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  leerSerie,
  leerReparto,
  media,
  mediana,
  tendenciaMitades,
  formatearValor,
  etiquetarPunto,
  type PuntoSerie,
} from './lecturaSerie.ts';

function serie(valores: number[], desde = '2026-08-01'): PuntoSerie[] {
  const base = new Date(`${desde}T00:00:00`);
  return valores.map((valor, i) => ({
    fecha: new Date(base.getTime() + i * 86400000),
    valor,
  }));
}

// --- Estadistica basica -----------------------------------------------------

Deno.test('media de una lista vacia es 0 y no NaN', () => {
  assertEquals(media([]), 0);
});

Deno.test('mediana con numero par promedia los dos centrales', () => {
  assertEquals(mediana([1, 2, 3, 4]), 2.5);
});

Deno.test('mediana con numero impar toma el central', () => {
  assertEquals(mediana([5, 1, 3]), 3);
});

Deno.test('la mediana aguanta el valor extremo que destroza la media', () => {
  // Nueve clientes vuelven cada ~28 dias y uno reaparece tras 400.
  const gaps = [26, 27, 28, 28, 29, 30, 27, 28, 29, 400];
  assertEquals(mediana(gaps), 28);
  assert(media(gaps) > 60, 'la media se va por encima de 60 por el valor extremo');
});

Deno.test('tendencia null con menos de 4 puntos: no hay dos mitades con sentido', () => {
  assertEquals(tendenciaMitades([1, 2, 3]), null);
});

Deno.test('tendencia compara las dos mitades y deja fuera el punto central impar', () => {
  // 5 puntos: primera mitad [10,10], central 999 ignorado, segunda [20,20].
  assertAlmostEquals(tendenciaMitades([10, 10, 999, 20, 20])!, 100, 0.001);
});

Deno.test('tendencia null si la primera mitad es 0 pero la segunda no (subida sin base)', () => {
  assertEquals(tendenciaMitades([0, 0, 5, 5]), null);
});

Deno.test('tendencia 0 si ambas mitades son 0', () => {
  assertEquals(tendenciaMitades([0, 0, 0, 0]), 0);
});

// --- Formato ----------------------------------------------------------------

Deno.test('formatearValor no deja decimales sueltos y pone la unidad', () => {
  assertEquals(formatearValor(412.4, 'eur'), '412 €');
  assertEquals(formatearValor(61.7, 'pct'), '62 %');
  assertEquals(formatearValor(1, 'dias'), '1 día');
  assertEquals(formatearValor(28, 'dias'), '28 días');
  assertEquals(formatearValor(12, 'conteo', 'citas'), '12 citas');
  assertEquals(formatearValor(12, 'conteo'), '12');
});

Deno.test('con un solo elemento usa el singular en vez de decir "1 citas"', () => {
  assertEquals(formatearValor(1, 'conteo', 'citas', 'cita'), '1 cita');
  assertEquals(formatearValor(2, 'conteo', 'citas', 'cita'), '2 citas');
  assertEquals(formatearValor(0, 'conteo', 'citas', 'cita'), '0 citas');
  // Sin singular no se inventa uno quitando la "s": "veces" no da "vece".
  assertEquals(formatearValor(1, 'conteo', 'veces'), '1 veces');
  assertEquals(formatearValor(1, 'conteo', 'veces', 'vez'), '1 vez');
});

Deno.test('la frase respeta el singular del sustantivo', () => {
  const l = leerSerie(serie([0, 1, 0, 0]), { unidad: 'conteo', granularidad: 'dia', sustantivo: 'citas', sustantivoSing: 'cita' });
  assert(l.frase.includes('1 cita,') || l.frase.includes('con 1 cita'), l.frase);
  assert(!l.frase.includes('1 citas'), l.frase);
});

Deno.test('etiquetarPunto nombra el punto segun el grano del eje X', () => {
  const d = new Date('2026-08-06T17:00:00');
  assertEquals(etiquetarPunto(d, 'hora'), 'las 17:00');
  assert(etiquetarPunto(d, 'dia').includes('agosto'));
  assert(etiquetarPunto(d, 'semana').startsWith('la semana del'));
  assert(etiquetarPunto(d, 'mes').includes('agosto'));
});

// --- Lectura de series ------------------------------------------------------

Deno.test('serie vacia o toda a cero se declara sin datos, no se inventa lectura', () => {
  const l = leerSerie(serie([0, 0, 0, 0]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.direccion, 'sin_datos');
  assertEquals(l.pico, null);
  assert(l.frase.includes('suficientes datos'));
});

Deno.test('un solo punto no da lectura', () => {
  assertEquals(leerSerie(serie([100]), { unidad: 'eur', granularidad: 'dia' }).direccion, 'sin_datos');
});

Deno.test('detecta el pico y el valle correctos', () => {
  const l = leerSerie(serie([100, 412, 98, 200]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.pico!.valor, 412);
  assertEquals(l.valle!.valor, 98);
  assert(l.frase.includes('412 €'));
  assert(l.frase.includes('98 €'));
});

Deno.test('subida clara se lee como "va subiendo" con su porcentaje', () => {
  const l = leerSerie(serie([100, 100, 200, 200]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.direccion, 'sube');
  assertAlmostEquals(l.tendenciaPct!, 100, 0.001);
  assert(l.frase.includes('Va subiendo'));
  assert(l.frase.includes('100 %'));
});

Deno.test('bajada clara se lee como "va bajando"', () => {
  const l = leerSerie(serie([200, 200, 100, 100]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.direccion, 'baja');
  assert(l.frase.includes('Va bajando'));
});

Deno.test('un movimiento por debajo del 5 % es ruido, no tendencia', () => {
  const l = leerSerie(serie([100, 100, 102, 102]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.direccion, 'estable');
  assert(l.frase.includes('estable'));
});

Deno.test('el total solo tiene sentido en euros y conteos, nunca en porcentajes', () => {
  assertEquals(leerSerie(serie([10, 20, 30, 40]), { unidad: 'eur', granularidad: 'dia' }).totalTieneSentido, true);
  assertEquals(leerSerie(serie([10, 20, 30, 40]), { unidad: 'conteo', granularidad: 'dia' }).totalTieneSentido, true);
  // Este era el bug real: "Total en periodo" sumando porcentajes de reposo.
  assertEquals(leerSerie(serie([10, 20, 30, 40]), { unidad: 'pct', granularidad: 'dia' }).totalTieneSentido, false);
  assertEquals(leerSerie(serie([10, 20, 30, 40]), { unidad: 'dias', granularidad: 'dia' }).totalTieneSentido, false);
});

Deno.test('la frase dice cual es el nivel normal, no solo el pico', () => {
  const l = leerSerie(serie([100, 200, 300, 400]), { unidad: 'eur', granularidad: 'dia' });
  assertEquals(l.media, 250);
  assert(l.frase.includes('250 €'));
  assert(l.frase.includes('Lo normal'));
});

Deno.test('con conteos usa el sustantivo que se le pasa', () => {
  const l = leerSerie(serie([1, 5, 2, 3]), { unidad: 'conteo', granularidad: 'dia', sustantivo: 'citas' });
  assert(l.frase.includes('5 citas'));
});

Deno.test('con dos puntos hay lectura pero no se menciona el valle', () => {
  const l = leerSerie(serie([100, 200]), { unidad: 'eur', granularidad: 'dia' });
  assert(l.direccion !== 'sin_datos');
  assertEquals(l.tendenciaPct, null); // menos de 4 puntos
  assert(!l.frase.includes('el más flojo'));
});

// --- Lectura de repartos ----------------------------------------------------

Deno.test('reparto vacio se declara sin datos', () => {
  const l = leerReparto([{ etiqueta: 'A', valor: 0 }], { dimension: 'franja' });
  assertEquals(l.fuerte, null);
  assert(l.frase.includes('Sin datos'));
});

Deno.test('reparto identifica el fuerte y el flojo con sus porcentajes', () => {
  // Reparto de 100 citas entre las 5 franjas reales de informes.
  const l = leerReparto([
    { etiqueta: '09-11', valor: 18 },
    { etiqueta: '11-13', valor: 22 },
    { etiqueta: '13-15', valor: 9 },
    { etiqueta: '15-17', valor: 17 },
    { etiqueta: '17-20', valor: 34 },
  ], { dimension: 'franja', sustantivo: 'citas' });
  assertEquals(l.fuerte!.etiqueta, '17-20');
  assertEquals(l.flojo!.etiqueta, '13-15');
  assertEquals(l.total, 100);
  assertAlmostEquals(l.pctFuerte, 34, 0.001);
  assert(l.frase.includes('17-20'));
  assert(l.frase.includes('13-15'));
  assertEquals(l.concentrado, false);
});

Deno.test('reparto avisa cuando uno solo concentra mas de la mitad', () => {
  const l = leerReparto([
    { etiqueta: 'Laura', valor: 80 },
    { etiqueta: 'Ana', valor: 20 },
  ], { dimension: 'profesional', sustantivo: 'citas' });
  assertEquals(l.concentrado, true);
  assertAlmostEquals(l.pctFuerte, 80, 0.001);
  assert(l.frase.includes('más de la mitad'));
});

Deno.test('los items a cero no pueden salir como "el mas flojo"', () => {
  const l = leerReparto([
    { etiqueta: 'A', valor: 5 },
    { etiqueta: 'B', valor: 3 },
    { etiqueta: 'Vacia', valor: 0 },
  ], { dimension: 'franja' });
  assertEquals(l.flojo!.etiqueta, 'B');
});
