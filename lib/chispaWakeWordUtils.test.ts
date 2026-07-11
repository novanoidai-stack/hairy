// Tests puros de la deteccion de "Hola Mecha" (deno test, sin DOM/navegador).
// Ejecutar: deno test lib/chispaWakeWordUtils.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizarTextoVoz, detectarActivacion, FRASES_ACTIVACION } from './chispaWakeWordUtils.ts';

Deno.test('normaliza mayusculas y tildes', () => {
  assertEquals(normalizarTextoVoz('Hóla MÉCHA'), 'hola mecha');
});

Deno.test('colapsa espacios repetidos', () => {
  assertEquals(normalizarTextoVoz('hola    mecha'), 'hola mecha');
});

Deno.test('detecta la frase exacta sin texto adicional', () => {
  const r = detectarActivacion('hola mecha');
  assertEquals(r.activado, true);
  assertEquals(r.resto, '');
});

Deno.test('detecta la frase con un comando pegado en la misma frase', () => {
  const r = detectarActivacion('hola mecha, cuanto llevo hoy');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'cuanto llevo hoy');
});

Deno.test('detecta la frase con texto delante ("oye, hola mecha")', () => {
  const r = detectarActivacion('oye, hola mecha');
  assertEquals(r.activado, true);
  assertEquals(r.resto, '');
});

Deno.test('detecta la variante "hola chispa"', () => {
  const r = detectarActivacion('hola chispa que tal');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'que tal');
});

Deno.test('no detecta si no aparece ninguna frase', () => {
  const r = detectarActivacion('cuanto llevo hoy');
  assertEquals(r.activado, false);
  assertEquals(r.resto, '');
});

Deno.test('ignora tildes/mayusculas en la frase de activacion', () => {
  const r = detectarActivacion('HÓLA MÉCHA cuanto llevo');
  assertEquals(r.activado, true);
  assertEquals(r.resto, 'cuanto llevo');
});

Deno.test('FRASES_ACTIVACION incluye mecha y chispa', () => {
  assertEquals(FRASES_ACTIVACION.includes('hola mecha'), true);
  assertEquals(FRASES_ACTIVACION.includes('hola chispa'), true);
});
