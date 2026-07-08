// Tests puros del analizador de "Organizar mi agenda" (Sesion 5, deno test).
// Cubren la priorizacion por profesional (retraso > solape > huecos), el
// filtro al dia de "ahora", el umbral de ruido y la exclusion de cadenas
// multiprofesional de la compactacion de huecos.
// Ejecutar: deno test lib/organizarAgenda.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analizarAgendaDia, type CitaOrganizar } from './organizarAgenda.ts';

const D = '2026-07-08';
function iso(h: number, m = 0, dia: string = D): string {
  return new Date(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
}
function ms(h: number, m = 0, dia: string = D): number {
  return +new Date(iso(h, m, dia));
}
function cita(id: string, profId: string, hIni: number, mIni: number, durMin: number, extra: Partial<CitaOrganizar> = {}): CitaOrganizar {
  const ini = new Date(`${D}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`);
  const fin = new Date(ini.getTime() + durMin * 60000);
  return {
    id,
    profesional_id: profId,
    estado: 'confirmada',
    inicio: ini.toISOString(),
    fin: fin.toISOString(),
    cliente: `Cli-${id}`,
    telefono: '600000000',
    servicio: `Srv-${id}`,
    ...extra,
  };
}
const PROFS = [
  { id: 'P1', nombre: 'Ana' }, { id: 'P2', nombre: 'Bea' }, { id: 'P3', nombre: 'Cris' },
  { id: 'P4', nombre: 'Dani' }, { id: 'P5', nombre: 'Eva' }, { id: 'P6', nombre: 'Fer' },
  { id: 'P7', nombre: 'Gia' }, { id: 'P8', nombre: 'Hugo' },
];

Deno.test('retraso: cita confirmada que ya deberia haber acabado genera un problema con estrategias', () => {
  const citas = [cita('A', 'P1', 10, 0, 30)]; // 10:00-10:30
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 50) }); // 20 min tarde
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'retraso');
  assertEquals(problemas[0].profesionalId, 'P1');
  assertEquals(problemas[0].profesionalNombre, 'Ana');
  assert(problemas[0].estrategias.length >= 1);
  assert(problemas[0].estrategias[0].updates.some((u) => u.id === 'A'));
});

Deno.test('retraso: por debajo del umbral (10 min) no genera problema', () => {
  const citas = [cita('A', 'P1', 10, 0, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 33) }); // 3 min tarde
  assertEquals(problemas.length, 0);
});

Deno.test('retraso: una cita "olvidada" de hace horas no se trata como retraso activo', () => {
  const citas = [cita('A', 'P1', 10, 0, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(15, 0) }); // 4h30 tarde
  assertEquals(problemas.length, 0);
});

Deno.test('hueco_muerto: compacta una cita futura al primer hueco libre', () => {
  const citas = [cita('X', 'P2', 10, 0, 30), cita('Y', 'P2', 11, 30, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'hueco_muerto');
  assertEquals(problemas[0].profesionalId, 'P2');
  assertEquals(problemas[0].estrategias[0].updates[0].id, 'Y');
  assertEquals(problemas[0].estrategias[0].updates[0].inicio, iso(10, 45));
});

Deno.test('reposo_desaprovechado: adelanta una cita al reposo libre de otra', () => {
  const citas = [
    cita('A', 'P3', 10, 0, 75, { fin_activa: iso(10, 20), fin_espera: iso(11, 0) }), // activa 10:00-10:20, reposo hasta 11:00, fin 11:15
    cita('B', 'P3', 12, 0, 20),
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 20) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'reposo_desaprovechado');
  assertEquals(problemas[0].estrategias[0].updates[0].id, 'B');
  assertEquals(problemas[0].estrategias[0].updates[0].inicio, iso(10, 30));
});

Deno.test('hueco por debajo del umbral (20 min) no genera problema', () => {
  const citas = [cita('X', 'P4', 10, 0, 30), cita('Y', 'P4', 10, 45, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  assertEquals(problemas.length, 0);
});

Deno.test('solape: dos citas activas que chocan se resuelven moviendo la segunda', () => {
  const citas = [cita('A', 'P5', 10, 0, 60), cita('B', 'P5', 10, 30, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'solape');
  assertEquals(problemas[0].citaIds.sort(), ['A', 'B']);
  assertEquals(problemas[0].estrategias[0].updates[0].id, 'B');
  assertEquals(problemas[0].estrategias[0].updates[0].inicio, iso(11, 0));
});

Deno.test('cadena multiprofesional (grupoId) no se propone para compactar huecos', () => {
  const citas = [
    cita('X', 'P6', 10, 0, 30),
    cita('Y', 'P6', 11, 30, 30, { grupoId: 'cadena-1' }),
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  assertEquals(problemas.length, 0);
});

Deno.test('dia limpio (huecos por debajo del umbral): no reporta ruido', () => {
  const citas = [cita('A', 'P7', 10, 0, 30), cita('B', 'P7', 11, 0, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 35) });
  assertEquals(problemas.length, 0);
});

Deno.test('solo analiza el dia de "ahora": una cita retrasada de ayer no cuenta', () => {
  const ayer = '2026-07-07';
  const citas = [cita('A', 'P8', 23, 0, 20, { inicio: iso(23, 0, ayer), fin: iso(23, 20, ayer) })];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(0, 0) }); // hoy 00:00 (40 min "tarde" si no filtrase por dia)
  assertEquals(problemas.length, 0);
});

Deno.test('retraso tiene prioridad: no reporta huecos del mismo profesional en la misma pasada', () => {
  const citas = [
    cita('A', 'P1', 9, 0, 30), // 9:00-9:30, ya deberia haber acabado a las 9:45
    cita('B', 'P1', 11, 0, 30), // hueco grande detras, pero se ignora esta pasada
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 45) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'retraso');
});
