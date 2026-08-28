import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  eslabonesParaOperar,
  eslabonesParaPintar,
  esPrimerEslabon,
  estaEnCadenaVisible,
  type CitaEncadenable,
} from './cadena.ts';

const esCancelada = (e?: string | null) => e === 'cancelada';

const h = (hhmm: string) => `2026-08-27T${hhmm}:00.000Z`;

function cita(p: Partial<CitaEncadenable> & { id: string; inicio: string }): CitaEncadenable {
  return {
    grupo_id: 'g1',
    cliente_id: 'cli1',
    orden_en_grupo: 0,
    estado: 'confirmada',
    ...p,
  };
}

const CADENA: CitaEncadenable[] = [
  cita({ id: 'b', inicio: h('11:00'), orden_en_grupo: 2 }),
  cita({ id: 'a', inicio: h('10:00'), orden_en_grupo: 1 }),
  cita({ id: 'c', inicio: h('12:00'), orden_en_grupo: 3 }),
  // Ruido: otra clienta, otro grupo.
  cita({ id: 'otra', inicio: h('10:00'), grupo_id: 'g2', cliente_id: 'cli2' }),
  cita({ id: 'suelta', inicio: h('10:00'), grupo_id: null, cliente_id: 'cli3' }),
];

Deno.test('la cadena sale ordenada por orden_en_grupo', () => {
  const c = eslabonesParaOperar(CADENA[1], CADENA);
  assertEquals(c.map((x) => x.id), ['a', 'b', 'c']);
});

Deno.test('una cita sin grupo no tiene cadena', () => {
  assertEquals(eslabonesParaOperar(CADENA[4], CADENA).length, 0);
});

Deno.test('la cadena no arrastra a otra clienta aunque compartiera grupo', () => {
  // Mismo grupo_id, clienta distinta: el cliente_id es el cinturon de seguridad.
  const mezcladas = [
    cita({ id: 'mia', inicio: h('10:00'), grupo_id: 'gX', cliente_id: 'yo' }),
    cita({ id: 'ajena', inicio: h('10:30'), grupo_id: 'gX', cliente_id: 'otro' }),
  ];
  const c = eslabonesParaOperar(mezcladas[0], mezcladas);
  assertEquals(c.map((x) => x.id), ['mia']);
});

Deno.test('solo el primer eslabon dispara la operacion en cadena', () => {
  assert(esPrimerEslabon(CADENA[1], CADENA), '"a" es el primero');
  assertEquals(esPrimerEslabon(CADENA[0], CADENA), false, '"b" no debe disparar');
  assertEquals(esPrimerEslabon(CADENA[2], CADENA), false, '"c" no debe disparar');
});

Deno.test('sin orden_en_grupo el desempate es por hora', () => {
  const sinOrden = [
    cita({ id: 'tarde', inicio: h('12:00'), orden_en_grupo: null }),
    cita({ id: 'pronto', inicio: h('09:00'), orden_en_grupo: null }),
  ];
  assertEquals(
    eslabonesParaOperar(sinOrden[0], sinOrden).map((x) => x.id),
    ['pronto', 'tarde'],
  );
});

// --- Las dos reglas NO son la misma, y esa diferencia es deliberada ---------

Deno.test('la cadena que se PINTA descarta las canceladas', () => {
  const conCancelada = [
    cita({ id: 'a', inicio: h('10:00'), orden_en_grupo: 1 }),
    cita({ id: 'b', inicio: h('11:00'), orden_en_grupo: 2, estado: 'cancelada' }),
    cita({ id: 'c', inicio: h('12:00'), orden_en_grupo: 3 }),
  ];
  // Pintar: se salta la anulada (si no, el contador decia "2/4" y saltaba del 2 al 4).
  assertEquals(
    eslabonesParaPintar('g1', conCancelada, esCancelada).map((x) => x.id),
    ['a', 'c'],
  );
  // Operar: NO se la salta. Es el comportamiento actual, congelado a proposito.
  assertEquals(eslabonesParaOperar(conCancelada[0], conCancelada).length, 3);
});

Deno.test('una cadena con un solo eslabon vivo ya no se pinta como cadena', () => {
  const casiVacia = [
    cita({ id: 'a', inicio: h('10:00') }),
    cita({ id: 'b', inicio: h('11:00'), estado: 'cancelada' }),
  ];
  assertEquals(estaEnCadenaVisible('g1', casiVacia, esCancelada), false);
  assert(estaEnCadenaVisible('g1', CADENA, esCancelada), 'tres vivas si son cadena');
});

Deno.test('sin grupo_id no se pinta riel de cadena', () => {
  assertEquals(estaEnCadenaVisible(null, CADENA, esCancelada), false);
});
