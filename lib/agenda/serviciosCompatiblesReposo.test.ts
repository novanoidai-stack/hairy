import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { serviciosQueCabenEnReposos, type ServicioParaEncaje } from './serviciosCompatiblesReposo.ts';
import type { CitaFase } from './citaFases.ts';

// 10:00 activa 45' | 10:45 reposo 35' | 11:20 activa 20' | 11:40 reposo 15' | 11:55 activa 25'
const fases: CitaFase[] = [
  { orden: 1, tipo: 'activa', inicio: '2026-09-15T10:00:00Z', fin: '2026-09-15T10:45:00Z' },
  { orden: 2, tipo: 'reposo', inicio: '2026-09-15T10:45:00Z', fin: '2026-09-15T11:20:00Z', etiqueta: 'Aclarado' },
  { orden: 3, tipo: 'activa', inicio: '2026-09-15T11:20:00Z', fin: '2026-09-15T11:40:00Z' },
  { orden: 4, tipo: 'reposo', inicio: '2026-09-15T11:40:00Z', fin: '2026-09-15T11:55:00Z', etiqueta: 'Matiz' },
  { orden: 5, tipo: 'activa', inicio: '2026-09-15T11:55:00Z', fin: '2026-09-15T12:20:00Z' },
];

Deno.test('la cinta de aqui cabe filtra por reposo real, no por un numero suelto', () => {
  const servicios: ServicioParaEncaje[] = [
    { id: 's1', nombre: 'Depilación Cejas', duracionTotalMin: 10 }, // 10+5 <= 15 -> cabe hasta en el segundo
    { id: 's2', nombre: 'Manicura Exprés', duracionTotalMin: 25 }, // 25+5 = 30 <= 35 -> solo en el primero
    { id: 's3', nombre: 'Mechas + Matiz', duracionTotalMin: 120 }, // no cabe en ninguno
  ];

  const res = serviciosQueCabenEnReposos(fases, servicios);
  assertEquals(res.length, 2);
  // Ordenados por duracion ascendente
  assertEquals(res[0].servicio.id, 's1');
  assertEquals(res[0].reposoOrden, 2); // con 10+5 cabe ya en el primer reposo (35')
  assertEquals(res[1].servicio.id, 's2');
  assertEquals(res[1].reposoOrden, 2); // 25+5 solo cabe en el reposo de 35'
  assertEquals(res.some((e) => e.servicio.id === 's3'), false);
});

Deno.test('sin reposos ni catalogo la cinta no dice nada', () => {
  assertEquals(serviciosQueCabenEnReposos([], [{ id: 'x', nombre: 'X', duracionTotalMin: 5 }]).length, 0);
  assertEquals(serviciosQueCabenEnReposos(fases, []).length, 0);
  const sinReposo: CitaFase[] = [
    { orden: 1, tipo: 'activa', inicio: '2026-09-15T10:00:00Z', fin: '2026-09-15T11:00:00Z' },
  ];
  assertEquals(serviciosQueCabenEnReposos(sinReposo, [{ id: 'x', nombre: 'X', duracionTotalMin: 5 }]).length, 0);
});
