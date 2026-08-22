import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  avisoDeRecurso,
  capacidadDe,
  ocupacionEnTramo,
  tramoDeRecurso,
  type CitaConRecurso,
  type Recurso,
} from './recursos.ts';

const dosPilas: Recurso[] = [
  { id: 'r1', nombre: 'Lavacabezas', tipo: 'lavacabezas', capacidad: 2, activo: true },
];
const unaCabina: Recurso[] = [
  { id: 'r2', nombre: 'Cabina laser', tipo: 'cabina', capacidad: 1, activo: true },
];

// Balayage: entra a las 10, aplica 45 min, reposa 35 y sale al lavado a las 11:20.
const balayage = (id: string, min: number): CitaConRecurso => ({
  id,
  inicio: `2026-08-25T10:${String(min).padStart(2, '0')}:00Z`,
  fin_activa: '2026-08-25T10:45:00Z',
  fin_espera: '2026-08-25T11:20:00Z',
  fin: '2026-08-25T12:00:00Z',
  estado: 'confirmada',
  recurso_tipo: 'lavacabezas',
  recurso_fase: 'final',
});

Deno.test('el lavacabezas se ocupa al salir del reposo, no al empezar la cita', () => {
  const t = tramoDeRecurso(balayage('a', 0))!;
  assertEquals(new Date(t.desde).toISOString(), '2026-08-25T11:20:00.000Z');
  assertEquals(new Date(t.hasta).toISOString(), '2026-08-25T12:00:00.000Z');
});

Deno.test('una cabina se ocupa de punta a punta', () => {
  const t = tramoDeRecurso({
    id: 'c',
    inicio: '2026-08-25T09:00:00Z',
    fin: '2026-08-25T10:00:00Z',
    estado: 'confirmada',
    recurso_tipo: 'cabina',
    recurso_fase: 'completa',
  })!;
  assertEquals(new Date(t.desde).toISOString(), '2026-08-25T09:00:00.000Z');
});

Deno.test('una cita sin fases marcadas ocupa desde el principio', () => {
  // Sin fin_espera no hay reposo que valga: no se puede dar por libre ese rato.
  const t = tramoDeRecurso({
    id: 'x',
    inicio: '2026-08-25T10:00:00Z',
    fin: '2026-08-25T10:40:00Z',
    estado: 'confirmada',
    recurso_tipo: 'lavacabezas',
    recurso_fase: 'final',
  })!;
  assertEquals(new Date(t.desde).toISOString(), '2026-08-25T10:00:00.000Z');
});

Deno.test('un servicio sin recurso no ocupa nada', () => {
  assertEquals(
    tramoDeRecurso({ id: 'x', inicio: '2026-08-25T10:00:00Z', fin: '2026-08-25T10:30:00Z' }),
    null,
  );
});

Deno.test('el tercer tinte a la misma hora se queda sin pila', () => {
  const yaPuestas = [balayage('a', 0), balayage('b', 5)];
  const aviso = avisoDeRecurso(balayage('c', 10), yaPuestas, dosPilas);

  assertEquals(aviso?.tipo, 'lavacabezas');
  assertEquals(aviso?.ocupados, 2);
  assertEquals(aviso?.capacidad, 2);
  assertEquals(aviso?.mensaje, 'A esa hora ya se usan los 2 lavacabezas a la vez.');
});

Deno.test('el segundo tinte todavia cabe', () => {
  assertEquals(avisoDeRecurso(balayage('b', 5), [balayage('a', 0)], dosPilas), null);
});

Deno.test('sin recursos dados de alta no se avisa de nada', () => {
  // Cero configurado = "no lo controlo". No puede convertirse en un salon que
  // de pronto no deja reservar.
  assertEquals(avisoDeRecurso(balayage('c', 10), [balayage('a', 0), balayage('b', 5)], []), null);
});

Deno.test('una cita cancelada devuelve el puesto', () => {
  const cancelada = { ...balayage('a', 0), estado: 'cancelada' };
  const oculta = { ...balayage('b', 5), oculta_en_calendario: true };
  assertEquals(avisoDeRecurso(balayage('c', 10), [cancelada, oculta], dosPilas), null);
});

Deno.test('la que entra justo cuando la otra sale no compite', () => {
  const siguiente: CitaConRecurso = {
    id: 'd',
    inicio: '2026-08-25T12:00:00Z',
    fin: '2026-08-25T12:40:00Z',
    estado: 'confirmada',
    recurso_tipo: 'lavacabezas',
    recurso_fase: 'final',
  };
  assertEquals(ocupacionEnTramo([balayage('a', 0)], 'lavacabezas', tramoDeRecurso(siguiente)!).length, 0);
});

Deno.test('la cabina no admite dos a la vez', () => {
  const enCabina = (id: string): CitaConRecurso => ({
    id,
    inicio: '2026-08-25T09:00:00Z',
    fin: '2026-08-25T10:00:00Z',
    estado: 'pendiente',
    recurso_tipo: 'cabina',
    recurso_fase: 'completa',
  });
  const aviso = avisoDeRecurso(enCabina('b'), [enCabina('a')], unaCabina);
  assertEquals(aviso?.capacidad, 1);
  assertEquals(aviso?.mensaje, 'A esa hora la cabina ya está ocupada.');
});

Deno.test('los recursos apagados no suman capacidad', () => {
  const mixto: Recurso[] = [
    { id: '1', nombre: 'Pila 1', tipo: 'lavacabezas', capacidad: 1, activo: true },
    { id: '2', nombre: 'Pila 2', tipo: 'lavacabezas', capacidad: 1, activo: false },
  ];
  assertEquals(capacidadDe(mixto, 'lavacabezas'), 1);
});

Deno.test('mover una cita no compite consigo misma', () => {
  const a = balayage('a', 0);
  const b = balayage('b', 5);
  // Se reubica 'b' en el mismo tramo: solo debe contar 'a'.
  assertEquals(avisoDeRecurso(b, [a, b], dosPilas), null);
});
