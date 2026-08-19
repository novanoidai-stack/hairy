// El contrato que devuelve el parser local tiene que ser EL MISMO que el de la
// edge migracion-magica, porque TabMigracionMagica lee uno solo: fecha + hora_inicio.
// Cuando no lo era, el fallback local importaba clientes y servicios pero perdia
// TODAS las citas sin dar un error. Estas pruebas existen para que no vuelva a pasar.

import { assertEquals } from 'jsr:@std/assert';
import { parsearMigracionLocal } from './migracionParserLocal.ts';

const CSV = [
  'Cliente,Telefono,Email,Servicio,Precio,Fecha',
  'Ana Lopez,600111222,ana@mail.com,Corte mujer,25,2026-09-14 10:30',
  'Luis Diaz,600333444,luis@mail.com,Color raiz,45,2026-09-15 17:00',
].join('\n');

Deno.test('las citas salen con fecha y hora_inicio, no con inicio ISO', () => {
  const r = parsearMigracionLocal(CSV, 'agenda.csv');
  assertEquals(r.citas.length, 2);
  const c = r.citas[0];
  assertEquals(c.fecha, '2026-09-14');
  assertEquals(c.hora_inicio, '10:30');
  assertEquals(c.servicio_nombre, 'Corte mujer');
  assertEquals(c.cliente_telefono, '600111222');
});

Deno.test('clientes y servicios se extraen sin duplicar', () => {
  const r = parsearMigracionLocal(CSV, 'agenda.csv');
  assertEquals(r.clientes.length, 2);
  assertEquals(r.servicios.length, 2);
  assertEquals(r.clientes[0].nombre, 'Ana Lopez');
  assertEquals(r.servicios[0].precio, 25);
});

Deno.test('una fecha ilegible descarta la cita en vez de inventar el dia de hoy', () => {
  const malo = [
    'Cliente,Telefono,Servicio,Precio,Fecha',
    'Ana Lopez,600111222,Corte mujer,25,fecha-rota',
  ].join('\n');
  const r = parsearMigracionLocal(malo, 'agenda.csv');
  assertEquals(r.citas.length, 0);
  // El cliente y el servicio SI se aprovechan: solo se pierde la cita.
  assertEquals(r.clientes.length, 1);
  assertEquals(r.servicios.length, 1);
});
