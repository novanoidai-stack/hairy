import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

export interface ClienteVisitasHistorial {
  clienteId: string;
  nombre: string;
  fechasVisitas: string[]; // YYYY-MM-DD
}

export function evaluarRiesgoFuga(c: ClienteVisitasHistorial, hoyISO: string): { enRiesgo: boolean; nivel?: 'medio' | 'alto' | 'critico'; diasSinVenir?: number } {
  if (c.fechasVisitas.length < 2) return { enRiesgo: false };

  const ordenadas = [...c.fechasVisitas].sort();
  const ultima = new Date(ordenadas[ordenadas.length - 1]);
  const hoy = new Date(hoyISO);

  const diffMs = hoy.getTime() - ultima.getTime();
  const diasSinVenir = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diasSinVenir < 40) {
    return { enRiesgo: false, diasSinVenir };
  }

  let nivel: 'medio' | 'alto' | 'critico' = 'medio';
  if (diasSinVenir >= 90) nivel = 'critico';
  else if (diasSinVenir >= 60) nivel = 'alto';

  return { enRiesgo: true, nivel, diasSinVenir };
}

Deno.test('cliente con menos de 2 visitas no se considera en riesgo', () => {
  const res = evaluarRiesgoFuga({ clienteId: '1', nombre: 'Ana', fechasVisitas: ['2026-05-01'] }, '2026-08-01');
  assertEquals(res.enRiesgo, false);
});

Deno.test('cliente con visita reciente (<40 dias) no esta en riesgo', () => {
  const res = evaluarRiesgoFuga({ clienteId: '2', nombre: 'Elena', fechasVisitas: ['2026-06-01', '2026-07-15'] }, '2026-08-01');
  assertEquals(res.enRiesgo, false);
});

Deno.test('cliente con 50 dias sin venir entra en riesgo medio', () => {
  const res = evaluarRiesgoFuga({ clienteId: '3', nombre: 'Maria', fechasVisitas: ['2026-04-01', '2026-06-10'] }, '2026-08-01');
  assertEquals(res.enRiesgo, true);
  assertEquals(res.nivel, 'medio');
});

Deno.test('cliente con 70 dias sin venir entra en riesgo alto', () => {
  const res = evaluarRiesgoFuga({ clienteId: '4', nombre: 'Carmen', fechasVisitas: ['2026-03-01', '2026-05-20'] }, '2026-08-01');
  assertEquals(res.enRiesgo, true);
  assertEquals(res.nivel, 'alto');
});

Deno.test('cliente con 100 dias sin venir entra en riesgo critico', () => {
  const res = evaluarRiesgoFuga({ clienteId: '5', nombre: 'Lucia', fechasVisitas: ['2026-01-01', '2026-04-01'] }, '2026-08-01');
  assertEquals(res.enRiesgo, true);
  assertEquals(res.nivel, 'critico');
});
