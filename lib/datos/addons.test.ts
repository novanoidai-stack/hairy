import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type Addon,
  claveNombre,
  conciliarAddons,
  expresionAmbito,
} from '@/lib/datos/addons';

const SERVICIO = '11111111-2222-3333-4444-555555555555';

function addon(parcial: Partial<Addon> & { nombre: string }): Addon {
  return {
    id: crypto.randomUUID(),
    precio: 10,
    duracion_min: 0,
    activo: true,
    servicio_id: null,
    ...parcial,
  };
}

// --- expresionAmbito ---------------------------------------------------------

Deno.test('sin servicio elegido solo pide los add-ons de salon', () => {
  assertEquals(expresionAmbito(null), 'servicio_id.is.null');
  assertEquals(expresionAmbito(''), 'servicio_id.is.null');
});

Deno.test('con servicio pide los suyos Y los del salon', () => {
  // Los del salon TIENEN que entrar: si esta expresion se queda en un `eq`, la
  // pantalla no falla, simplemente deja de ver los extras globales.
  assertEquals(
    expresionAmbito(SERVICIO),
    `servicio_id.eq.${SERVICIO},servicio_id.is.null`,
  );
});

Deno.test('un servicioId que no es uuid no se concatena al filtro', () => {
  // La cadena se pega dentro de un filtro que parsea PostgREST: un valor con
  // comas reescribiria la condicion entera.
  assertThrows(() => expresionAmbito('abc'), Error, 'no es un uuid');
  assertThrows(
    () => expresionAmbito('11111111-2222-3333-4444-555555555555,precio.gt.0'),
    Error,
    'no es un uuid',
  );
});

// --- claveNombre -------------------------------------------------------------

Deno.test('el nombre se compara sin acentos, mayusculas ni espacios de sobra', () => {
  assertEquals(claveNombre('  Ampolla   de Brillo '), 'ampolla de brillo');
  assertEquals(claveNombre('Hidratación'), claveNombre('hidratacion'));
  assertEquals(claveNombre('Mascarilla'), 'mascarilla');
});

// --- conciliarAddons ---------------------------------------------------------

Deno.test('el add-on del servicio gana al global con el mismo nombre', () => {
  const global = addon({ nombre: 'Ampolla de brillo', precio: 8, servicio_id: null });
  const propio = addon({ nombre: 'Ampolla de brillo', precio: 12, servicio_id: SERVICIO });

  // En los dos ordenes de llegada: el resultado no puede depender de como los
  // devuelva Postgres.
  for (const filas of [[global, propio], [propio, global]]) {
    const salida = conciliarAddons(filas);
    assertEquals(salida.length, 1);
    assertEquals(salida[0].precio, 12);
    assertEquals(salida[0].servicio_id, SERVICIO);
  }
});

Deno.test('dos globales repetidos se quedan en uno', () => {
  // Es el caso de la demo antes de consolidar: la misma "Ampolla de brillo"
  // colgada de tres servicios distintos.
  const filas = [
    addon({ nombre: 'Ampolla de brillo', servicio_id: SERVICIO }),
    addon({ nombre: 'Ampolla de brillo', servicio_id: SERVICIO }),
  ];
  assertEquals(conciliarAddons(filas).length, 1);
});

Deno.test('add-ons distintos se conservan todos y salen por nombre', () => {
  const filas = [
    addon({ nombre: 'Tratamiento hidratante' }),
    addon({ nombre: 'Ampolla de brillo' }),
    addon({ nombre: 'Masaje capilar' }),
  ];
  assertEquals(
    conciliarAddons(filas).map((a) => a.nombre),
    ['Ampolla de brillo', 'Masaje capilar', 'Tratamiento hidratante'],
  );
});

Deno.test('conciliar no inventa ni pierde filas cuando no hay repetidos', () => {
  const filas = [addon({ nombre: 'Espuma' })];
  assertEquals(conciliarAddons(filas), filas);
});
