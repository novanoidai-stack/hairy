import { parseDurationToMinutes } from './importadorIA';

describe('Importador IA - Duraciones y Tarifas', () => {
  test('debe convertir duraciones en horas y minutos correctamente', () => {
    expect(parseDurationToMinutes('1 h 15 min')).toBe(75);
    expect(parseDurationToMinutes('30 min')).toBe(30);
    expect(parseDurationToMinutes('2 h 30 min')).toBe(150);
    expect(parseDurationToMinutes('4 h')).toBe(240);
    expect(parseDurationToMinutes('20 min')).toBe(20);
    expect(parseDurationToMinutes('1h')).toBe(60);
    expect(parseDurationToMinutes(45)).toBe(45);
  });
});
