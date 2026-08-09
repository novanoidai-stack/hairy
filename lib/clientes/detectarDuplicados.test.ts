import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectarDuplicados, type RegistroCliente } from './detectarDuplicados.ts';

Deno.test('detecta duplicado por telefono igual y sugiere conservar el mas activo', () => {
  const clientes: RegistroCliente[] = [
    { id: 'c1', nombre: 'Ana García',  telefono: '+34612345678', email: 'ana@example.com',   totalVisitas: 3, creadoISO: '2023-01-01T00:00:00Z' },
    { id: 'c2', nombre: 'Ana G.',      telefono: '+34612345678', email: 'anag@example.com',  totalVisitas: 10, creadoISO: '2024-01-01T00:00:00Z' },
  ];

  const res = detectarDuplicados(clientes);
  assertEquals(res.length, 1);
  assertEquals(res[0].motivo, 'telefono');
  assertEquals(res[0].sugerenciaConservar, 'c2'); // más visitas
  assertEquals(res[0].sugerenciaEliminar, 'c1');
});

Deno.test('detecta duplicado por email igual (case-insensitive)', () => {
  const clientes: RegistroCliente[] = [
    { id: 'c3', nombre: 'Lucia',  telefono: '+34600000001', email: 'Lucia@Salon.com', totalVisitas: 1, creadoISO: '2023-06-01T00:00:00Z' },
    { id: 'c4', nombre: 'Lucía', telefono: '+34600000002', email: 'lucia@salon.com',  totalVisitas: 5, creadoISO: '2024-06-01T00:00:00Z' },
  ];

  const res = detectarDuplicados(clientes);
  assertEquals(res.length, 1);
  assertEquals(res[0].motivo, 'email');
  assertEquals(res[0].sugerenciaConservar, 'c4');
});

Deno.test('clientes completamente distintos no generan duplicados', () => {
  const clientes: RegistroCliente[] = [
    { id: 'c5', nombre: 'Pedro',  telefono: '+34611111111', email: 'pedro@a.com', totalVisitas: 2, creadoISO: '2023-01-01T00:00:00Z' },
    { id: 'c6', nombre: 'María',  telefono: '+34622222222', email: 'maria@b.com', totalVisitas: 2, creadoISO: '2023-01-02T00:00:00Z' },
  ];

  const res = detectarDuplicados(clientes);
  assertEquals(res.length, 0);
});
