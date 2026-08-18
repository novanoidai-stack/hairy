// Tests de la semantica de ESTADOS de cita: que ocupa hueco, que reparte
// carril y como se pinta. Son las tres decisiones que estaban copiadas a mano
// por media agenda y que provocaban el bug de la "doble columna".
//
// Ejecutar: deno test --allow-read --sloppy-imports --no-check lib/citasEstados.test.ts

import {
  CITA_STATUS,
  CITA_STATUS_ACTIVOS,
  CITA_STATUS_BLOQUEAN_SOLAPE,
  CITA_STATUS_SIN_LANE,
  bloqueaSolape,
  sinCarrilPropio,
  sigueViva,
} from './constants.ts';
import { esActiva } from './citasMetrics.ts';
import { ESTADO_CITA_UI, metaEstadoCita } from './citasEstadoUi.ts';
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@0.224.0';

// --- Que ocupa hueco -------------------------------------------------------

Deno.test('una cita pendiente ocupa hueco (era la causa de la doble columna)', () => {
  assertEquals(bloqueaSolape(CITA_STATUS.PENDIENTE), true);
  assertEquals(bloqueaSolape(CITA_STATUS.CONFIRMADA), true);
});

Deno.test('cancelada y no-show liberan el hueco', () => {
  assertEquals(bloqueaSolape(CITA_STATUS.CANCELADA), false);
  assertEquals(bloqueaSolape(CITA_STATUS.NO_PRESENTADA), false);
});

Deno.test('una cita completada sigue ocupando su hueco', () => {
  // El trabajo se hizo: ese rato la profesional estuvo ocupada. Como el cron
  // autocompleta en cuanto pasa la hora, dejarla fuera abria una ventana en la
  // que se podia crear otra cita encima de la que acababa de terminar; luego el
  // reparto de carriles (donde completada SI cuenta) partia la columna en dos.
  assertEquals(bloqueaSolape(CITA_STATUS.COMPLETADA), true);
});

Deno.test('ocupar hueco y seguir viva son cosas distintas', () => {
  // Ojo al reusar la lista equivocada: "vencidas por resolver" y "mover la cola
  // por un retraso" quieren las VIVAS; una completada ya esta resuelta.
  assertEquals(sigueViva(CITA_STATUS.PENDIENTE), true);
  assertEquals(sigueViva(CITA_STATUS.CONFIRMADA), true);
  assertEquals(sigueViva(CITA_STATUS.COMPLETADA), false);
  assertEquals(sigueViva(CITA_STATUS.CANCELADA), false);
  assertEquals(sigueViva(null), false);
});

Deno.test('bloqueaSolape aguanta null/undefined/estado desconocido', () => {
  assertEquals(bloqueaSolape(null), false);
  assertEquals(bloqueaSolape(undefined), false);
  assertEquals(bloqueaSolape(''), false);
  assertEquals(bloqueaSolape('inventado_por_la_ia'), false);
});

// --- Que reparte carril ----------------------------------------------------

Deno.test('solo cancelada y no-show quedan fuera del reparto de carriles', () => {
  assertEquals(sinCarrilPropio(CITA_STATUS.CANCELADA), true);
  assertEquals(sinCarrilPropio(CITA_STATUS.NO_PRESENTADA), true);
  assertEquals(sinCarrilPropio(CITA_STATUS.PENDIENTE), false);
  assertEquals(sinCarrilPropio(CITA_STATUS.CONFIRMADA), false);
  assertEquals(sinCarrilPropio(CITA_STATUS.COMPLETADA), false);
});

Deno.test('lo que ocupa hueco nunca queda fuera del reparto de carriles', () => {
  // Si un estado bloqueara el hueco pero no pintara carril, se solaparian dos
  // citas vivas en el mismo sitio sin que se note.
  for (const estado of CITA_STATUS_BLOQUEAN_SOLAPE) {
    assertEquals(sinCarrilPropio(estado), false);
  }
});

// --- Coherencia entre listas -----------------------------------------------

Deno.test('CITA_STATUS_ACTIVOS concuerda con el predicado esActiva', () => {
  // Se llamaban igual y decian cosas distintas: la lista SQL solo traia
  // confirmada mientras esActiva ya contaba las pendientes.
  for (const estado of CITA_STATUS_ACTIVOS) {
    assertEquals(esActiva({ estado }), true);
  }
  assertEquals(CITA_STATUS_ACTIVOS.includes(CITA_STATUS.PENDIENTE), true);
});

Deno.test('ningun estado esta a la vez en bloquea-solape y sin-carril', () => {
  const cruce = CITA_STATUS_BLOQUEAN_SOLAPE.filter((e) =>
    CITA_STATUS_SIN_LANE.includes(e),
  );
  assertEquals(cruce, []);
});

// --- Como se pinta ---------------------------------------------------------

Deno.test('pendiente tiene color propio y NO hereda el de confirmada', () => {
  // Antes pendiente no estaba en el mapa y caia en el fallback "confirmada",
  // asi que una cita sin confirmar se veia como confirmada.
  const pendiente = metaEstadoCita(CITA_STATUS.PENDIENTE);
  const confirmada = metaEstadoCita(CITA_STATUS.CONFIRMADA);
  assertEquals(pendiente.label, 'Pendiente');
  assertNotEquals(pendiente.color, confirmada.color);
});

Deno.test('todos los estados reales tienen color definido', () => {
  for (const estado of Object.values(CITA_STATUS)) {
    if (estado === CITA_STATUS.FINALIZADA) continue; // valor historico, sin uso
    assertEquals(
      Object.prototype.hasOwnProperty.call(ESTADO_CITA_UI, estado),
      true,
      `falta color para el estado ${estado}`,
    );
  }
});

Deno.test('un estado desconocido no revienta: cae en neutro legible', () => {
  // Sin este fallback, leer .color de undefined dejaba el detalle en blanco.
  const meta = metaEstadoCita('estado_que_no_existe');
  assertEquals(meta.label, 'estado_que_no_existe');
  assertEquals(typeof meta.color, 'string');
  assertEquals(metaEstadoCita(null).label, 'Sin estado');
});
