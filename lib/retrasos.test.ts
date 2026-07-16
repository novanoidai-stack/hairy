// Tests puros del motor de retrasos (deno test). Cubren la cascada existente y las
// estrategias alternativas de la Sesion 4 (mover a hueco, aprovechar reposo, pedir
// retraso), la duracion aprendida y el anti-solape al arrastrar.
// Ejecutar: deno test lib/retrasos.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  proponerRetrasoPorCita,
  construirUpdatesRetraso,
  calcularEstrategiasRetraso,
  calcularEstrategiasSolape,
  duracionRealAprendida,
  mejorAlternativaSlot,
  type CitaRetraso,
} from './retrasos.ts';
import { categoriaCumple } from './constants.ts';

// Helpers para construir citas de un dia (hora local del runner; solo importan los deltas).
const D = '2026-07-06';
function iso(h: number, m = 0): string {
  return new Date(`${D}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
}
function cita(id: string, hIni: number, mIni: number, durMin: number, extra: Partial<CitaRetraso> = {}): CitaRetraso {
  const ini = new Date(`${D}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`);
  const fin = new Date(ini.getTime() + durMin * 60000);
  return {
    id,
    inicio: ini.toISOString(),
    fin: fin.toISOString(),
    cliente: `Cli-${id}`,
    telefono: '600000000',
    servicio: `Srv-${id}`,
    ...extra,
  };
}

Deno.test('cascada: empuja las citas pegadas y respeta un hueco que la absorbe', () => {
  // 10:00 A (30m), 10:30 B (30m) pegada, hueco, 12:00 C (30m).
  const citas = [cita('A', 10, 0, 30), cita('B', 10, 30, 30), cita('C', 12, 0, 30)];
  const prop = proponerRetrasoPorCita(citas, 'A', 15);
  // A y B se mueven; C queda intacta (el hueco 11:00-12:00 absorbe el retraso).
  assertEquals(prop.items.map((i) => i.cita_id), ['A', 'B']);
  assertEquals(prop.cortaEn, 'C');
});

Deno.test('estrategias: retraso sin citas detras solo ofrece la cascada (0 otras movidas)', () => {
  const citas = [cita('A', 10, 0, 30)];
  const est = calcularEstrategiasRetraso(citas, 'A', 15);
  // Sin citas detras no hay decision que tomar: solo la cascada (que desplaza esta cita).
  assertEquals(est.length, 1);
  assertEquals(est[0].tipo, 'cascada');
  assertEquals(est[0].citasMovidas, 0);
});

Deno.test('estrategias: siempre incluye cascada y marca una recomendada', () => {
  const citas = [cita('A', 10, 0, 30), cita('B', 10, 30, 30), cita('C', 11, 0, 30)];
  const est = calcularEstrategiasRetraso(citas, 'A', 15);
  assert(est.some((e) => e.tipo === 'cascada'));
  assertEquals(est.filter((e) => e.recomendada).length, 1);
  // La recomendada es la de menor disrupcion (va primera tras el sort).
  assert(est[0].recomendada);
});

Deno.test('aprovechar_reposo: encaja la siguiente cita en el reposo del tinte', () => {
  // A = tinte con reposo: activa 10:00-10:20, reposo 10:20-11:00, activa2 11:00-11:15.
  const A: CitaRetraso = {
    id: 'A',
    inicio: iso(10, 0),
    fin: iso(11, 15),
    fin_activa: iso(10, 20),
    fin_espera: iso(11, 0),
    cliente: 'Ana',
    telefono: '600111222',
    servicio: 'Tinte',
  };
  // B = corte corto 15m justo despues, que en cascada se empujaria.
  const B = cita('B', 11, 15, 15, { cliente: 'Bea' });
  const est = calcularEstrategiasRetraso([A, B], 'A', 15, { cierreMs: +new Date(iso(20, 0)) });
  const reposo = est.find((e) => e.tipo === 'aprovechar_reposo');
  assert(reposo, 'deberia existir estrategia de reposo');
  // Solo mueve 1 cita (B) ademas de la retrasada.
  assertEquals(reposo!.citasMovidas, 1);
  // B queda dentro del reposo desplazado de A (10:35-11:15): su inicio cae >= 10:35.
  const bUpd = reposo!.updates.find((u) => u.id === 'B')!;
  const bIni = +new Date(bUpd.inicio);
  assert(bIni >= +new Date(iso(10, 35)) && bIni < +new Date(iso(11, 15)), `B en reposo, fue ${bUpd.inicio}`);
});

Deno.test('estrategias: nunca proponen un solape activa-activa', () => {
  const A: CitaRetraso = {
    id: 'A', inicio: iso(9, 0), fin: iso(10, 30),
    fin_activa: iso(9, 20), fin_espera: iso(10, 10), cliente: 'Ana', telefono: '600', servicio: 'Tinte',
  };
  const B = cita('B', 10, 30, 30, { cliente: 'Bea' });
  const C = cita('C', 11, 0, 30, { cliente: 'Cris' });
  const est = calcularEstrategiasRetraso([A, B, C], 'A', 20, { cierreMs: +new Date(iso(20, 0)) });
  for (const e of est) {
    // Reconstruye el dia con los updates y verifica que no hay dos ventanas activas solapadas.
    const dia: CitaRetraso[] = [A, B, C].map((c) => {
      const u = e.updates.find((x) => x.id === c.id);
      return u ? { ...c, inicio: u.inicio, fin: u.fin, fin_activa: u.fin_activa ?? c.fin_activa, fin_espera: u.fin_espera ?? c.fin_espera } : c;
    });
    // ventana activa 1 de cada cita, ordenadas: no deben pisarse
    const wins = dia
      .map((c) => [+new Date(c.inicio), +new Date(c.fin_activa ?? c.fin)] as [number, number])
      .sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < wins.length; i++) {
      assert(wins[i][0] >= wins[i - 1][1] - 1, `solape activa-activa en ${e.tipo}`);
    }
  }
});

Deno.test('duracionRealAprendida: propone la mediana real si difiere del catalogo', () => {
  const hist = [
    { servicio_id: 's1', inicio: iso(9, 0), fin: iso(10, 0), estado: 'completada' }, // 60m
    { servicio_id: 's1', inicio: iso(11, 0), fin: iso(12, 5), estado: 'completada' }, // 65m
    { servicio_id: 's1', inicio: iso(13, 0), fin: iso(14, 0), estado: 'completada' }, // 60m
    { servicio_id: 's2', inicio: iso(9, 0), fin: iso(9, 30), estado: 'completada' }, // otro servicio
  ];
  // Catalogo dice 30m; la clienta tarda ~60m -> sugerir 60m.
  const d = duracionRealAprendida(hist, 's1', 30);
  assert(d, 'deberia sugerir');
  assertEquals(d!.minutos, 60);
  assertEquals(d!.muestras, 3);
  assert(d!.difMin > 0);
});

Deno.test('duracionRealAprendida: no sugiere sin muestras ni si coincide con catalogo', () => {
  assertEquals(duracionRealAprendida([], 's1', 30), null);
  const hist = [
    { servicio_id: 's1', inicio: iso(9, 0), fin: iso(9, 30), estado: 'completada' },
    { servicio_id: 's1', inicio: iso(10, 0), fin: iso(10, 30), estado: 'completada' },
  ];
  // Real 30m == catalogo 30m -> null (nada que sugerir).
  assertEquals(duracionRealAprendida(hist, 's1', 30), null);
});

Deno.test('mejorAlternativaSlot: devuelve el hueco valido mas cercano al soltar en conflicto', () => {
  // Columna con una cita 10:00-10:30. Soltamos una cita de 30m a las 10:15 (choca).
  const ocupada = cita('X', 10, 0, 30);
  const movida = cita('M', 10, 15, 30);
  const alt = mejorAlternativaSlot(movida, +new Date(iso(10, 15)), [ocupada], {
    aperturaMs: +new Date(iso(9, 0)),
    cierreMs: +new Date(iso(12, 0)),
  });
  assert(alt, 'deberia encontrar alternativa');
  // 10:30 es el slot valido mas cercano hacia adelante.
  assertEquals(alt, iso(10, 30));
});

Deno.test('mejorAlternativaSlot: si el punto ya es valido lo devuelve tal cual', () => {
  const ocupada = cita('X', 10, 0, 30);
  const movida = cita('M', 11, 0, 30);
  const alt = mejorAlternativaSlot(movida, +new Date(iso(11, 0)), [ocupada], {
    aperturaMs: +new Date(iso(9, 0)),
    cierreMs: +new Date(iso(12, 0)),
  });
  assertEquals(alt, iso(11, 0));
});

// Helper local: ms de una hora del dia base D.
function msD(h: number, m = 0): number {
  return +new Date(iso(h, m));
}

Deno.test('solape: ofrece mover la intrusa y adelantar la fija; recomienda la de menor disrupcion', () => {
  // A 10:00-11:00 (fija), B 10:30-11:00 (intrusa) chocan.
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const tipos = est.map((e) => e.tipo).sort();
  assertEquals(tipos, ['adelantar_otra', 'mover_hueco']);
  // Recomendada unica y primera.
  assertEquals(est.filter((e) => e.recomendada).length, 1);
  assert(est[0].recomendada);
  // La recomendada adelanta la fija A a las 9:00 (0 min de retraso de cierre).
  assertEquals(est[0].tipo, 'adelantar_otra');
  assertEquals(est[0].updates[0].id, 'A');
  assertEquals(est[0].updates[0].inicio, iso(9, 0));
  // La otra mueve la intrusa B al hueco de las 11:00.
  const hueco = est.find((e) => e.tipo === 'mover_hueco')!;
  assertEquals(hueco.updates[0].id, 'B');
  assertEquals(hueco.updates[0].inicio, iso(11, 0));
});

Deno.test('solape: si la intrusa cabe en un reposo de otra cita, lo ofrece (y deduplica el hueco identico)', () => {
  // A activa 10:00-10:20, reposo hasta 11:00, fin 11:15. B 10:10-10:30 choca con la activa de A.
  const citas = [
    cita('A', 10, 0, 75, { fin_activa: iso(10, 20), fin_espera: iso(11, 0) }),
    cita('B', 10, 10, 20),
  ];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const reposo = est.find((e) => e.tipo === 'aprovechar_reposo');
  assert(reposo, 'debe ofrecer aprovechar_reposo');
  assertEquals(reposo!.updates[0].id, 'B');
  // Primer slot alineado a 15 min dentro del reposo [10:20, 11:00) que no pisa la activa de A.
  assertEquals(reposo!.updates[0].inicio, iso(10, 30));
  // Tipos unicos (keys del modal): ninguna estrategia repite tipo.
  assertEquals(new Set(est.map((e) => e.tipo)).size, est.length);
  // El hueco que caeria en el mismo slot que el reposo se deduplica.
  assertEquals(est.filter((e) => e.updates[0].id === 'B' && e.updates[0].inicio === iso(10, 30)).length, 1);
});

Deno.test('solape: la cascada arrastra las citas siguientes cuando hace falta', () => {
  // A 10:00-11:00 (fija), B 10:30-11:00 (intrusa), C 11:00-11:30 pegada detras de B.
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30), cita('C', 11, 0, 30)];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const cascada = est.find((e) => e.tipo === 'cascada');
  assert(cascada, 'debe ofrecer cascada');
  assert(cascada!.citasMovidas >= 1);
  // La cascada recoloca B y C.
  const ids = cascada!.updates.map((u) => u.id).sort();
  assertEquals(ids, ['B', 'C']);
});

Deno.test('solape: una intrusa encadenada (grupoId) no se mueve sola', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cadena-1' })];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  // Ninguna estrategia toca la cita B (encadenada); solo cabe adelantar la fija A.
  assert(est.every((e) => e.updates.every((u) => u.id !== 'B')));
  assert(est.some((e) => e.tipo === 'adelantar_otra'));
});

Deno.test('solape: sin ninguna salida (ambas encadenadas, sin adelanto posible) devuelve []', () => {
  const citas = [
    cita('A', 10, 0, 60, { grupoId: 'cad-A' }),
    cita('B', 10, 30, 30, { grupoId: 'cad-B' }),
  ];
  // Ambas encadenadas: no se puede mover sola ni la intrusa (hueco/reposo/cascada) ni la fija (adelantar).
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(10, 30) });
  assertEquals(est.length, 0);
});

Deno.test('categoriaCumple: null minima cualquiera cumple; respeta la jerarquia', () => {
  assertEquals(categoriaCumple('auxiliar', null), true);
  assertEquals(categoriaCumple('auxiliar', undefined), true);
  assertEquals(categoriaCumple('oficial', 'oficial'), true);
  assertEquals(categoriaCumple('estilista_senior', 'oficial'), true);
  assertEquals(categoriaCumple('auxiliar', 'oficial'), false);
  assertEquals(categoriaCumple('desconocida', 'oficial'), false);
});

Deno.test('reasignar: otro profesional libre a la misma hora (sin requisito) se ofrece', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const rea = est.find((e) => e.tipo === 'reasignar');
  assert(rea, 'debe ofrecer reasignar');
  assertEquals(rea!.updates[0].id, 'B');
  assertEquals(rea!.updates[0].profesional_id, 'P2');
  assertEquals(rea!.updates[0].inicio, iso(10, 30));
  assertEquals(rea!.citasMovidas, 0);
});

Deno.test('reasignar: descarta candidato de categoria insuficiente', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'auxiliar', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});

Deno.test('reasignar: elige la categoria cualificada mas baja', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [
      { id: 'P3', nombre: 'Cris', categoria: 'estilista_senior', ocupacion: [] as CitaRetraso[] },
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const rea = est.find((e) => e.tipo === 'reasignar')!;
  assertEquals(rea.updates[0].profesional_id, 'P2');
});

Deno.test('reasignar: candidato ocupado en la ventana no cuenta', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 30, 30)] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});

Deno.test('reasignar: intrusa encadenada (grupoId) no se reasigna', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cad-1' })];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});

// --- Palanca mover_reasignar: mover la intrusa al hueco de OTRO profesional (slice 3) ---

Deno.test('mover_reasignar: nadie libre a la hora exacta, pero uno tiene hueco despues', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      // Ocupado a las 10:30 (tapa la reasignacion a misma hora), libre a partir de las 11:00.
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'), 'no debe haber reasignar a misma hora');
  const mv = est.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'debe ofrecer mover_reasignar');
  assertEquals(mv!.updates.length, 1);
  assertEquals(mv!.updates[0].id, 'B');
  assertEquals(mv!.updates[0].profesional_id, 'P2');
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
  assertEquals(mv!.citasMovidas, 0);
});

Deno.test('mover_reasignar: elige el hueco mas temprano entre candidatos', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      // Cris se libera a las 12:00; Bea a las 11:00 -> gana Bea aunque este antes en la lista.
      { id: 'P3', nombre: 'Cris', categoria: 'oficial', ocupacion: [cita('Y', 10, 0, 120)] },
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.updates[0].profesional_id, 'P2');
  assertEquals(mv.updates[0].inicio, iso(11, 0));
});

Deno.test('mover_reasignar: no adelanta a la clienta a un hueco anterior', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    // Bea esta libre TODA la manana pero ocupada justo en la ventana de B (10:30-11:00).
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 30, 30)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'debe ofrecer mover_reasignar');
  // El hueco de las 9:00 existe, pero la busqueda arranca en la hora original (10:30).
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
});

Deno.test('mover_reasignar: un bloqueo del destino tapa el hueco', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      {
        id: 'P2',
        nombre: 'Bea',
        categoria: 'oficial',
        ocupacion: [cita('X', 10, 0, 60)],
        // Reunion de 11:00 a 12:00 -> el primer hueco pasa a ser las 12:00.
        bloqueos: [{ inicio: iso(11, 0), fin: iso(12, 0) }],
      },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.updates[0].inicio, iso(12, 0));
});

Deno.test('mover_reasignar: descarta candidato de categoria insuficiente', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'auxiliar', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'mover_reasignar'));
});

Deno.test('mover_reasignar: intrusa encadenada (grupoId) no se mueve', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cad-1' })];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'mover_reasignar'));
});

Deno.test('mover_reasignar: reasignar a misma hora gana (dedup por firma)', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    // Bea libre del todo: el hueco mas temprano ES la hora original -> misma firma que reasignar.
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(est.some((e) => e.tipo === 'reasignar'), 'reasignar debe estar');
  assert(!est.some((e) => e.tipo === 'mover_reasignar'), 'mover_reasignar es el mismo efecto: dedup');
});

Deno.test('mover_reasignar: determinista ante huecos equivalentes (categoria, luego nombre)', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const base = [
    { id: 'P3', nombre: 'Cris', categoria: 'estilista_senior', ocupacion: [cita('Y', 10, 0, 60)] },
    { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
  ];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', {
    ahoraMs: msD(9, 0),
    reasignacion: { categoriaMinima: 'oficial', candidatos: base },
  });
  const inv = calcularEstrategiasSolape(citas, 'B', 'A', {
    ahoraMs: msD(9, 0),
    reasignacion: { categoriaMinima: 'oficial', candidatos: base.slice().reverse() },
  });
  const a = est.find((e) => e.tipo === 'mover_reasignar')!;
  const b = inv.find((e) => e.tipo === 'mover_reasignar')!;
  // Mismo hueco (11:00) para ambos -> gana la categoria cualificada mas baja, sea cual sea el orden.
  assertEquals(a.updates[0].profesional_id, 'P2');
  assertEquals(b.updates[0].profesional_id, 'P2');
});

Deno.test('mover_reasignar: avisa a la clienta del cambio de hora', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.avisos.length, 1);
  assertEquals(mv.avisos[0].cita_id, 'B');
  assertEquals(mv.avisos[0].inicioNuevo, iso(11, 0));
  assertEquals(mv.avisos[0].minutos, 30);
});
