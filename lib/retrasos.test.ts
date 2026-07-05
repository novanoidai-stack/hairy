// Tests puros del motor de retrasos (deno test). Cubren la cascada existente y las
// estrategias alternativas de la Sesion 4 (mover a hueco, aprovechar reposo, pedir
// retraso), la duracion aprendida y el anti-solape al arrastrar.
// Ejecutar: deno test lib/retrasos.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  proponerRetrasoPorCita,
  construirUpdatesRetraso,
  calcularEstrategiasRetraso,
  duracionRealAprendida,
  mejorAlternativaSlot,
  type CitaRetraso,
} from './retrasos.ts';

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
