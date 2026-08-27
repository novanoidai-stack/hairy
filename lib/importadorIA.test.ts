import { assertEquals } from 'jsr:@std/assert';
import { parseDurationToMinutes } from './importadorIA';

Deno.test('Importador IA - Duraciones y Tarifas', () => {
  assertEquals(parseDurationToMinutes('1 h 15 min'), 75);
  assertEquals(parseDurationToMinutes('30 min'), 30);
  assertEquals(parseDurationToMinutes('2 h 30 min'), 150);
  assertEquals(parseDurationToMinutes('4 h'), 240);
  assertEquals(parseDurationToMinutes('20 min'), 20);
  assertEquals(parseDurationToMinutes('1h'), 60);
  assertEquals(parseDurationToMinutes(45), 45);
});
