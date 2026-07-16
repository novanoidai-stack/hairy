// Tests puros de la pila de deshacer/rehacer de la agenda (deno test).
// Ejecutar: deno test lib/agendaUndo.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PILA_VACIA,
  MAX_PASOS,
  registrar,
  deshacer,
  rehacer,
  snapshotDe,
  mismoSitio,
  type SnapshotCita,
  type PasoAgenda,
} from './agendaUndo.ts';

function snap(h: number, prof = 'P1'): SnapshotCita {
  const hh = String(h).padStart(2, '0');
  return {
    inicio: `2026-07-16T${hh}:00:00.000Z`,
    fin: `2026-07-16T${hh}:30:00.000Z`,
    fin_activa: null,
    fin_espera: null,
    profesional_id: prof,
  };
}
function paso(citaId: string, de: number, a: number, profDe = 'P1', profA = 'P1'): PasoAgenda {
  return [{ citaId, antes: snap(de, profDe), despues: snap(a, profA) }];
}

Deno.test('pila vacia: no hay nada que deshacer ni rehacer', () => {
  assertEquals(deshacer(PILA_VACIA), null);
  assertEquals(rehacer(PILA_VACIA), null);
});

Deno.test('deshacer devuelve el paso con los valores ANTES', () => {
  const p1 = registrar(PILA_VACIA, paso('A', 10, 12));
  const r = deshacer(p1)!;
  assert(r, 'debe haber algo que deshacer');
  assertEquals(r.aplicar[0].citaId, 'A');
  assertEquals(r.aplicar[0].antes.inicio, snap(10).inicio);
  assertEquals(r.pila.deshacer.length, 0);
  assertEquals(r.pila.rehacer.length, 1);
});

Deno.test('rehacer devuelve el mismo paso y lo repone en deshacer', () => {
  const p1 = registrar(PILA_VACIA, paso('A', 10, 12));
  const tras = deshacer(p1)!;
  const re = rehacer(tras.pila)!;
  assertEquals(re.aplicar[0].despues.inicio, snap(12).inicio);
  assertEquals(re.pila.deshacer.length, 1);
  assertEquals(re.pila.rehacer.length, 0);
});

Deno.test('ciclo completo deshacer->rehacer->deshacer es estable', () => {
  let pila = registrar(PILA_VACIA, paso('A', 10, 12));
  const d1 = deshacer(pila)!; pila = d1.pila;
  const r1 = rehacer(pila)!; pila = r1.pila;
  const d2 = deshacer(pila)!;
  assertEquals(d2.aplicar[0].antes.inicio, snap(10).inicio);
  assertEquals(d2.pila.deshacer.length, 0);
});

Deno.test('un cambio nuevo invalida la pila de rehacer', () => {
  let pila = registrar(PILA_VACIA, paso('A', 10, 12));
  pila = deshacer(pila)!.pila;
  assertEquals(pila.rehacer.length, 1);
  // El usuario hace algo nuevo tras deshacer: el futuro deshecho ya no existe.
  pila = registrar(pila, paso('B', 9, 11));
  assertEquals(pila.rehacer.length, 0);
  assertEquals(pila.deshacer.length, 1);
});

Deno.test('un movimiento que no mueve nada no gasta un paso', () => {
  // Drag que suelta la cita donde estaba.
  const pila = registrar(PILA_VACIA, paso('A', 10, 10));
  assertEquals(pila.deshacer.length, 0);
  assertEquals(deshacer(pila), null);
});

Deno.test('un cambio de solo profesional SI cuenta como movimiento', () => {
  const pila = registrar(PILA_VACIA, paso('A', 10, 10, 'P1', 'P2'));
  assertEquals(pila.deshacer.length, 1);
  assertEquals(deshacer(pila)!.aplicar[0].antes.profesional_id, 'P1');
});

Deno.test('un lote multi-cita (cascada del organizador) se deshace entero', () => {
  const lote: PasoAgenda = [
    { citaId: 'A', antes: snap(10), despues: snap(11) },
    { citaId: 'B', antes: snap(11), despues: snap(12) },
    { citaId: 'C', antes: snap(12), despues: snap(13) },
  ];
  const pila = registrar(PILA_VACIA, lote);
  assertEquals(pila.deshacer.length, 1, 'la cascada es UN paso, no tres');
  assertEquals(deshacer(pila)!.aplicar.length, 3, 'deshacerla a medias dejaria la agenda peor');
});

Deno.test('la pila se corta en MAX_PASOS y conserva los mas recientes', () => {
  let pila = PILA_VACIA;
  for (let i = 0; i < MAX_PASOS + 5; i++) pila = registrar(pila, paso(`C${i}`, 10, 12));
  assertEquals(pila.deshacer.length, MAX_PASOS);
  assertEquals(deshacer(pila)!.aplicar[0].citaId, `C${MAX_PASOS + 4}`, 'el ultimo paso debe seguir ahi');
});

Deno.test('snapshotDe normaliza las fases ausentes a null', () => {
  const s = snapshotDe({ inicio: 'i', fin: 'f', profesional_id: 'P1' });
  assertEquals(s.fin_activa, null);
  assertEquals(s.fin_espera, null);
});

Deno.test('mismoSitio compara las 5 marcas, no solo la hora', () => {
  const a = snap(10);
  assert(mismoSitio(a, { ...a }));
  assert(!mismoSitio(a, { ...a, profesional_id: 'P2' }));
  assert(!mismoSitio(a, { ...a, fin_activa: '2026-07-16T10:15:00.000Z' }));
});
