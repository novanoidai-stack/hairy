import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pisaOtraCitaAlSoltar, type FilaSolape } from './solapeAlSoltar.ts';
import type { CitaCandidata } from '../utils/appointment.ts';

const PROF = 'prof-1';
const MOVIDA = 'cita-movida';

// Helpers: horas del mismo dia, para que los casos se lean como en la agenda.
const h = (hhmm: string) => new Date(`2026-08-27T${hhmm}:00.000Z`);

// Cita candidata SIN reposo: una sola fase activa de 10:00 a 11:00.
function candidataSimple(desde: string, hasta: string): CitaCandidata {
  return { inicio: h(desde), finActiva: h(hasta), finEspera: h(hasta), fin: h(hasta) };
}

// Cita candidata CON reposo (un color): activa, reposo, activa.
function candidataConReposo(
  ini: string,
  finActiva: string,
  finEspera: string,
  fin: string,
): CitaCandidata {
  return { inicio: h(ini), finActiva: h(finActiva), finEspera: h(finEspera), fin: h(fin) };
}

function fila(p: Partial<FilaSolape> & { inicio: string; fin: string }): FilaSolape {
  return {
    id: p.id ?? 'otra',
    inicio: h(p.inicio).toISOString(),
    fin: h(p.fin).toISOString(),
    fin_activa: p.fin_activa ? h(p.fin_activa as string).toISOString() : null,
    fin_espera: p.fin_espera ? h(p.fin_espera as string).toISOString() : null,
  };
}

Deno.test('sin filas frescas no hay choque', () => {
  assertEquals(pisaOtraCitaAlSoltar(candidataSimple('10:00', '11:00'), [], PROF, MOVIDA), false);
  assertEquals(pisaOtraCitaAlSoltar(candidataSimple('10:00', '11:00'), null, PROF, MOVIDA), false);
});

Deno.test('choque de frente: dos fases activas pisandose', () => {
  const filas = [fila({ inicio: '10:30', fin: '11:30' })];
  assert(pisaOtraCitaAlSoltar(candidataSimple('10:00', '11:00'), filas, PROF, MOVIDA));
});

Deno.test('la que entra justo cuando la otra sale no choca', () => {
  const filas = [fila({ inicio: '11:00', fin: '12:00' })];
  assertEquals(
    pisaOtraCitaAlSoltar(candidataSimple('10:00', '11:00'), filas, PROF, MOVIDA),
    false,
  );
});

Deno.test('encajar en el REPOSO de otra cita esta permitido (el diferencial)', () => {
  // Otra cita: activa 10:00-10:20, reposo 10:20-11:00, activa 11:00-11:20.
  // Durante el reposo el profesional esta libre: una cita corta cabe ahi.
  const filas = [
    fila({ inicio: '10:00', fin: '11:20', fin_activa: '10:20', fin_espera: '11:00' }),
  ];
  assertEquals(
    pisaOtraCitaAlSoltar(candidataSimple('10:25', '10:55'), filas, PROF, MOVIDA),
    false,
    'caer dentro del reposo ajeno deberia permitirse',
  );
});

Deno.test('pisar la segunda fase activa de otra cita SI choca', () => {
  const filas = [
    fila({ inicio: '10:00', fin: '11:20', fin_activa: '10:20', fin_espera: '11:00' }),
  ];
  assert(
    pisaOtraCitaAlSoltar(candidataSimple('11:05', '11:35'), filas, PROF, MOVIDA),
    'la cola activa posterior al reposo ocupa igual que la primera fase',
  );
});

Deno.test('la cita movida no choca consigo misma', () => {
  const filas = [fila({ id: MOVIDA, inicio: '10:00', fin: '11:00' })];
  assertEquals(
    pisaOtraCitaAlSoltar(candidataSimple('10:00', '11:00'), filas, PROF, MOVIDA),
    false,
  );
});

// --- Los dos casos que la comparacion a mano dejaba pasar -------------------
// Son la razon de que este modulo exista. Si alguien vuelve a escribir el
// predicado a mano dentro de la agenda, estos dos son los que fallan.

Deno.test('REGRESION: la SEGUNDA fase activa de la cita que se mueve tambien cuenta', () => {
  // Se arrastra un color: activa 10:00-10:20, reposo 10:20-11:00, activa 11:00-11:20.
  // Justo en esa cola hay otra cita trabajando. La comparacion a mano solo
  // miraba [inicio, finActiva) y dejaba pasar este caso.
  const candidata = candidataConReposo('10:00', '10:20', '11:00', '11:20');
  const filas = [fila({ inicio: '11:00', fin: '11:30' })];
  assert(
    pisaOtraCitaAlSoltar(candidata, filas, PROF, MOVIDA),
    'la segunda fase activa de la cita arrastrada estaba sin comprobar',
  );
});

Deno.test('REGRESION: sin fin_espera la otra cita ocupa ENTERA, no solo hasta fin_activa', () => {
  // Fila con fin_activa pero fin_espera NULL (color importado o sembrado sin
  // fases completas). Sin fin_espera no se puede afirmar que haya reposo.
  // La comparacion a mano daba por libre [fin_activa, fin) y colocaba encima.
  const filas = [fila({ inicio: '10:00', fin: '11:00', fin_activa: '10:20', fin_espera: null })];
  assert(
    pisaOtraCitaAlSoltar(candidataSimple('10:30', '10:50'), filas, PROF, MOVIDA),
    'sin fin_espera la cola no es reposo: la cita ocupa entera',
  );
});
