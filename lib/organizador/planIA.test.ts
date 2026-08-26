// Tests del validador de planes generativos (F1, deno test).
//
// Lo que se prueba aqui es la promesa entera del motor generativo: que un plan
// inventado por un LLM no puede tocar la agenda si no cumple EXACTAMENTE la
// misma geometria que el motor determinista, y que la linea roja del
// consentimiento la decide el codigo, no el modelo.
//
// Ejecutar: deno test --allow-read --sloppy-imports --no-check lib/organizador/planIA.test.ts
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  validarPlan,
  validarPlanes,
  planAMovimientos,
  planAUpdates,
  rehidratarPlan,
  huecosLibresProfesional,
  refDeCliente,
  TOPE_MOVIMIENTOS_PLAN,
  type PlanIABruto,
  type ValidarPlanOpts,
} from './planIA.ts';
import type { CitaOrganizar } from '../organizarAgenda.ts';

const D = '2026-07-08'; // miercoles
const DOW = new Date(`${D}T00:00:00`).getDay();

function iso(h: number, m: number, dia: string = D): string {
  return new Date(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
}
function ms(h: number, m: number, dia: string = D): number {
  return +new Date(iso(h, m, dia));
}
function ymd(offsetDias: number): string {
  const d = new Date(`${D}T00:00:00`);
  d.setDate(d.getDate() + offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Cliente distinto por cita (sin telefono): refDeCliente cae al nombre, asi el
// anti-spam no confunde a dos clientas distintas en los tests.
function cita(
  id: string,
  profId: string,
  hIni: number,
  mIni: number,
  durMin: number,
  extra: Partial<CitaOrganizar> = {},
): CitaOrganizar {
  const ini = new Date(`${D}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`);
  const fin = new Date(ini.getTime() + durMin * 60000);
  return {
    id,
    profesional_id: profId,
    estado: 'confirmada',
    inicio: ini.toISOString(),
    fin: fin.toISOString(),
    cliente: `Cli-${id}`,
    telefono: null,
    servicio: `Srv-${id}`,
    ...extra,
  };
}

// Cita con reposo: activa [ini, +activaMin), reposo hasta +activaMin+reposoMin,
// y segunda activa hasta el final.
function citaConReposo(
  id: string, profId: string, hIni: number, mIni: number,
  activaMin: number, reposoMin: number, activa2Min: number,
): CitaOrganizar {
  const ini = new Date(`${D}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`);
  const finA = new Date(ini.getTime() + activaMin * 60000);
  const finE = new Date(finA.getTime() + reposoMin * 60000);
  const fin = new Date(finE.getTime() + activa2Min * 60000);
  return {
    id, profesional_id: profId, estado: 'confirmada',
    inicio: ini.toISOString(), fin: fin.toISOString(),
    fin_activa: finA.toISOString(), fin_espera: finE.toISOString(),
    cliente: `Cli-${id}`, telefono: null, servicio: `Srv-${id}`,
  };
}

function horarioProf(profId: string, hIni: number, hFin: number, dow = DOW) {
  return {
    profesional_id: profId,
    dia_semana: dow,
    hora_inicio: `${String(hIni).padStart(2, '0')}:00:00`,
    hora_fin: `${String(hFin).padStart(2, '0')}:00:00`,
    turno: 1,
  };
}

const PROFS = [
  { id: 'P1', nombre: 'Ana', categoria: 'estilista_senior' },
  { id: 'P2', nombre: 'Bea', categoria: 'oficial' },
  { id: 'P3', nombre: 'Cris', categoria: 'auxiliar' },
];

function optsBase(citas: CitaOrganizar[], over: Partial<ValidarPlanOpts> = {}): ValidarPlanOpts {
  return {
    ahoraMs: ms(8, 0),
    citas,
    profesionales: PROFS,
    horariosProfesional: [horarioProf('P1', 9, 20), horarioProf('P2', 9, 20), horarioProf('P3', 9, 20)],
    // Los limites del salon se desactivan salvo en los tests que los prueban:
    // si no, cualquier movimiento grande se caeria por el techo y no se estaria
    // probando lo que se cree.
    maxAdelantoMin: 600,
    maxRetrasoMin: 600,
    margenReaccionMin: 0,
    ...over,
  };
}

function plan(movs: { citaId: string; inicio: string; profesionalId?: string; tipo?: string }[], over: Partial<PlanIABruto> = {}): PlanIABruto {
  return {
    tipoProblema: 'reposo_alineable',
    titulo: 'Alinea los reposos de la manana',
    diagnostico: 'Los tres reposos estan desperdigados.',
    razonamiento: 'Juntandolos cabe una cita mas a mediodia.',
    confianza: 'alta',
    impactoMin: 45,
    movimientos: movs.map((m) => ({ tipo: 'mover', ...m })),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Geometria basica
// ---------------------------------------------------------------------------

Deno.test('plan: un movimiento limpio sobrevive con la geometria de la cita real', () => {
  const a = citaConReposo('A', 'P1', 17, 0, 30, 40, 20); // 17:00 → 18:30
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(10, 0) }]), optsBase([a]));

  assert(v.valido);
  assertEquals(v.movimientos.length, 1);
  assertEquals(v.podados.length, 0);
  const m = v.movimientos[0];
  // Las 4 marcas se trasladan enteras conservando cada duracion de fase.
  assertEquals(m.inicio, iso(10, 0));
  assertEquals(m.finActiva, iso(10, 30));
  assertEquals(m.finEspera, iso(11, 10));
  assertEquals(m.fin, iso(11, 30));
  assertEquals(m.desplazoMin, 420); // 7 h de adelanto
  assertEquals(v.impactoMin, 420);
});

Deno.test('plan: las fases que manda el modelo se IGNORAN (la geometria sale de la cita)', () => {
  // El modelo alucina un fin_activa imposible. El validador no lo mira: deriva
  // las fases de la cita real con reubicar().
  const a = citaConReposo('A', 'P1', 17, 0, 30, 40, 20);
  const bruto = plan([{ citaId: 'A', inicio: iso(10, 0) }]);
  bruto.movimientos[0].fases = { ini: iso(10, 0), finA: iso(23, 0), finE: iso(23, 30), fin: iso(23, 59) };

  const v = validarPlan(bruto, optsBase([a]));
  assertEquals(v.movimientos[0].finActiva, iso(10, 30));
  assertEquals(v.movimientos[0].fin, iso(11, 30));
});

Deno.test('plan: poda un movimiento fuera de la jornada del profesional', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const opts = optsBase([a], { horariosProfesional: [horarioProf('P1', 9, 14)] });
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(16, 0) }]), opts);

  assertFalse(v.valido);
  assertEquals(v.podados[0].motivo, 'fuera_jornada');
});

Deno.test('plan: poda un movimiento que no cabe ENTERO en el turno (comida entre turnos)', () => {
  // P1 trabaja 9-14 y 16-20. Una cita de 60 min a las 13:30 se saldria del
  // primer turno: no vale aunque las 13:30 esten dentro de la jornada.
  const a = cita('A', 'P1', 10, 0, 60);
  const opts = optsBase([a], {
    horariosProfesional: [horarioProf('P1', 9, 14), { ...horarioProf('P1', 16, 20), turno: 2 }],
  });
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(13, 30) }]), opts);
  assertEquals(v.podados[0].motivo, 'fuera_jornada');
});

Deno.test('plan: poda un movimiento que choca activa-activa', () => {
  const a = cita('A', 'P1', 17, 0, 60);
  const b = cita('B', 'P1', 10, 0, 60);
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(10, 30) }]), optsBase([a, b]));

  assertFalse(v.valido);
  assertEquals(v.podados[0].motivo, 'colision');
});

Deno.test('plan: encajar en el REPOSO de otra cita NO es colision (tiempo muerto)', () => {
  // B tiene reposo de 10:30 a 11:30: ahi el profesional esta libre.
  const b = citaConReposo('B', 'P1', 10, 0, 30, 60, 30); // activa 10-10:30, reposo →11:30, activa →12:00
  const a = cita('A', 'P1', 17, 0, 45);
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(10, 30) }]), optsBase([a, b]));

  assert(v.valido, JSON.stringify(v.podados));
  assert(v.movimientos[0].aprovechaReposo, 'debe marcarse como aprovechamiento de reposo');
});

Deno.test('plan: poda mover a un dia cerrado por cierres_negocio', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const opts = optsBase([a], {
    cierres: [{ fecha: ymd(1), motivo: 'Festivo' }],
    horariosProfesional: [horarioProf('P1', 9, 20), horarioProf('P1', 9, 20, (DOW + 1) % 7)],
  });
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(11, 0, ymd(1)) }]), opts);
  assertEquals(v.podados[0].motivo, 'dia_cerrado');
});

Deno.test('plan: poda un movimiento dentro de un bloqueo del profesional', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const opts = optsBase([a], {
    bloqueos: [{ profesional_id: 'P1', inicio: iso(10, 0), fin: iso(12, 0) }],
  });
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(11, 0) }]), opts);
  assertEquals(v.podados[0].motivo, 'fuera_jornada');
});

// ---------------------------------------------------------------------------
// Simulacion sombra y poda en cascada
// ---------------------------------------------------------------------------

Deno.test('plan: el segundo movimiento se valida contra el PRIMERO ya aplicado (estado sombra)', () => {
  // A 10:00-11:00 y B 11:00-12:00. El plan saca A al hueco de las 12:00 y mete
  // B a las 10:00. Sin estado sombra, B chocaria con la A "vieja".
  const a = cita('A', 'P1', 10, 0, 60);
  const b = cita('B', 'P1', 11, 0, 60);
  const v = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(12, 0) },
      { citaId: 'B', inicio: iso(10, 0) },
    ]),
    optsBase([a, b]),
  );

  assertEquals(v.podados.length, 0, JSON.stringify(v.podados));
  assertEquals(v.movimientos.length, 2);
  assertEquals(v.movimientos[0].inicio, iso(12, 0));
  assertEquals(v.movimientos[1].inicio, iso(10, 0));
});

Deno.test('plan: si el movimiento k falla, se podan k..n y sobreviven los anteriores', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const b = cita('B', 'P1', 18, 0, 30);
  const c = cita('C', 'P1', 19, 0, 30);
  const v = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(10, 0) },   // valido
      { citaId: 'B', inicio: iso(23, 0) },   // fuera de jornada → tumba el plan aqui
      { citaId: 'C', inicio: iso(11, 0) },   // valido en si mismo, pero dependia
    ]),
    optsBase([a, b, c]),
  );

  assertEquals(v.movimientos.map((m) => m.citaId), ['A']);
  assertEquals(v.podados.map((p) => p.citaId), ['B', 'C']);
  assertEquals(v.podados[0].motivo, 'fuera_jornada');
  assertEquals(v.podados[1].motivo, 'dependencia_podada');
  assert(v.valido, 'el plan sigue siendo util aunque se pode la cola');
});

// ---------------------------------------------------------------------------
// Cadenas (grupo_id): o enteras o nada
// ---------------------------------------------------------------------------

Deno.test('plan: una cadena movida a medias se poda entera', () => {
  const c1 = cita('C1', 'P1', 17, 0, 30, { grupoId: 'G1' });
  const c2 = cita('C2', 'P1', 17, 30, 30, { grupoId: 'G1' });
  const v = validarPlan(plan([{ citaId: 'C1', inicio: iso(10, 0) }]), optsBase([c1, c2]));

  assertFalse(v.valido);
  assertEquals(v.podados[0].motivo, 'cadena_incompleta');
});

Deno.test('plan: una cadena entera con el MISMO desplazamiento pasa', () => {
  const c1 = cita('C1', 'P1', 17, 0, 30, { grupoId: 'G1' });
  const c2 = cita('C2', 'P1', 17, 30, 30, { grupoId: 'G1' });
  const v = validarPlan(
    plan([
      { citaId: 'C1', inicio: iso(10, 0) },
      { citaId: 'C2', inicio: iso(10, 30) },
    ]),
    optsBase([c1, c2]),
  );

  assert(v.valido, JSON.stringify(v.podados));
  assertEquals(v.movimientos.length, 2);
  // Tocar una cadena SIEMPRE requiere el visto bueno de la clienta.
  assert(v.movimientos.every((m) => m.requiereConsentimiento));
});

Deno.test('plan: una cadena con desplazamientos distintos se poda (rompe la continuidad)', () => {
  const c1 = cita('C1', 'P1', 17, 0, 30, { grupoId: 'G1' });
  const c2 = cita('C2', 'P1', 17, 30, 30, { grupoId: 'G1' });
  const v = validarPlan(
    plan([
      { citaId: 'C1', inicio: iso(10, 0) },
      { citaId: 'C2', inicio: iso(12, 0) }, // deberia ser 10:30
    ]),
    optsBase([c1, c2]),
  );

  assertFalse(v.valido);
  assertEquals(v.podados[0].motivo, 'cadena_desigual');
});

Deno.test('plan: no se reasigna un eslabon de cadena a otro profesional', () => {
  const c1 = cita('C1', 'P1', 17, 0, 30, { grupoId: 'G1' });
  const c2 = cita('C2', 'P1', 17, 30, 30, { grupoId: 'G1' });
  const v = validarPlan(
    plan([
      { citaId: 'C1', inicio: iso(10, 0), profesionalId: 'P2' },
      { citaId: 'C2', inicio: iso(10, 30) },
    ]),
    optsBase([c1, c2]),
  );
  assertEquals(v.podados[0].motivo, 'cadena_reasignada');
});

// ---------------------------------------------------------------------------
// Linea roja: consentimiento (§4 del informe)
// ---------------------------------------------------------------------------

Deno.test('consentimiento: adelantar a una clienta que no esta en el salon SI lo requiere', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(10, 0) }]), optsBase([a]));
  assert(v.movimientos[0].requiereConsentimiento);
  assertEquals(v.aplicablesEnCaliente, 0);
  assertEquals(v.requierenPropuesta, 1);
});

Deno.test('consentimiento: mover a una clienta que YA ESTA en el salon no lo requiere', () => {
  // Cita 10:00-11:00 y son las 10:30: esta sentada delante, se le dice en persona.
  const a = cita('A', 'P1', 10, 0, 60);
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 45) }]),
    optsBase([a], { ahoraMs: ms(10, 30) }),
  );
  assert(v.valido, JSON.stringify(v.podados));
  assertFalse(v.movimientos[0].requiereConsentimiento);
  assertEquals(v.aplicablesEnCaliente, 1);
});

Deno.test('consentimiento: el modelo NO decide (dice que no hace falta y se le corrige)', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const bruto = plan([{ citaId: 'A', inicio: iso(10, 0) }]);
  bruto.movimientos[0].requiereConsentimiento = false; // mentira del modelo
  const v = validarPlan(bruto, optsBase([a]));
  assert(v.movimientos[0].requiereConsentimiento, 'la clasificacion es determinista, no del LLM');
});

Deno.test('consentimiento: cambiar de dia y cambiar de profesional siempre lo requieren', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const b = cita('B', 'P1', 14, 0, 30);
  const opts = optsBase([a, b], {
    horariosProfesional: [
      horarioProf('P1', 9, 20), horarioProf('P2', 9, 20),
      horarioProf('P1', 9, 20, (DOW + 1) % 7),
    ],
  });
  const v = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(11, 0, ymd(1)) },      // otro dia
      { citaId: 'B', inicio: iso(14, 0), profesionalId: 'P2' }, // otra persona
    ]),
    opts,
  );
  assertEquals(v.movimientos.length, 2, JSON.stringify(v.podados));
  assert(v.movimientos[0].cambioDia && v.movimientos[0].requiereConsentimiento);
  assert(v.movimientos[1].cambioProfesional && v.movimientos[1].requiereConsentimiento);
});

Deno.test('consentimiento: respeta el margen de reaccion de la clienta', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 0) }]),
    optsBase([a], { ahoraMs: ms(9, 0), margenReaccionMin: 120 }), // 10:00 esta a 60 min
  );
  assertEquals(v.podados[0].motivo, 'margen_reaccion');
});

Deno.test('consentimiento: respeta el techo de adelanto del salon', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 0) }]), // 7 h de adelanto
    optsBase([a], { maxAdelantoMin: 120 }),
  );
  assertEquals(v.podados[0].motivo, 'techo_adelanto');
});

Deno.test('anti-spam: una clienta con propuesta hoy no recibe otra', () => {
  const a = cita('A', 'P1', 17, 0, 30, { telefono: '600111222' });
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 0) }]),
    optsBase([a], {
      propuestasRecientes: [{ clienteRef: refDeCliente(a), enviadaEn: iso(7, 0) }],
    }),
  );
  assertEquals(v.podados[0].motivo, 'antispam_clienta');
});

Deno.test('anti-spam: el propio plan no manda dos propuestas a la misma clienta', () => {
  // Misma persona (mismo telefono) con dos citas distintas el mismo dia.
  const a = cita('A', 'P1', 16, 0, 30, { telefono: '600111222' });
  const b = cita('B', 'P2', 18, 0, 30, { telefono: '600111222' });
  const v = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(10, 0) },
      { citaId: 'B', inicio: iso(12, 0) },
    ]),
    optsBase([a, b]),
  );
  assertEquals(v.movimientos.length, 1);
  assertEquals(v.podados[0].motivo, 'antispam_clienta');
});

// ---------------------------------------------------------------------------
// Filtros baratos
// ---------------------------------------------------------------------------

Deno.test('plan: tope de movimientos por plan', () => {
  const citas = Array.from({ length: 8 }, (_, i) => cita(`A${i}`, 'P1', 9, 0, 15));
  // Las coloco en horas distintas para que no choquen entre si.
  citas.forEach((c, i) => {
    const ini = new Date(`${D}T${String(9 + i).padStart(2, '0')}:00:00`);
    c.inicio = ini.toISOString();
    c.fin = new Date(ini.getTime() + 15 * 60000).toISOString();
  });
  const movs = citas.map((c, i) => ({ citaId: c.id, inicio: iso(9 + i, 30) }));
  const v = validarPlan(plan(movs), optsBase(citas));

  assert(v.movimientos.length + v.podados.filter((p) => p.motivo !== 'tope_movimientos').length <= TOPE_MOVIMIENTOS_PLAN);
  assertEquals(v.podados.filter((p) => p.motivo === 'tope_movimientos').length, 8 - TOPE_MOVIMIENTOS_PLAN);
});

Deno.test('plan: cita inexistente, no movible, duplicada, en el pasado o comprometida', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const cancelada = cita('X', 'P1', 16, 0, 30, { estado: 'cancelada' });
  const comprometida = cita('Y', 'P2', 15, 0, 30);
  const v = validarPlan(
    plan([
      { citaId: 'NO-EXISTE', inicio: iso(10, 0) },
      { citaId: 'X', inicio: iso(10, 0) },
      { citaId: 'Y', inicio: iso(10, 0) },
      { citaId: 'A', inicio: iso(7, 0) }, // antes de ahora (8:00)
      { citaId: 'A', inicio: iso(11, 0) },
      { citaId: 'A', inicio: iso(12, 0) },
    ]),
    optsBase([a, cancelada, comprometida], { citasComprometidas: ['Y'] }),
  );
  const motivos = v.podados.map((p) => p.motivo);
  assert(motivos.includes('cita_inexistente'));
  assert(motivos.includes('cita_no_movible'));
  assert(motivos.includes('cita_comprometida'));
  assert(motivos.includes('en_el_pasado'));
  assert(motivos.includes('cita_duplicada'));
});

Deno.test('plan: no reasigna a alguien sin la categoria minima del servicio', () => {
  const a = cita('A', 'P1', 12, 0, 30, { categoriaMinima: 'estilista_senior' });
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(12, 0), profesionalId: 'P3' }]), // Cris es auxiliar
    optsBase([a]),
  );
  assertEquals(v.podados[0].motivo, 'categoria_insuficiente');
});

Deno.test('plan: no reasigna a un profesional inactivo o desconocido', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(12, 0), profesionalId: 'P9' }]),
    optsBase([a]),
  );
  assertEquals(v.podados[0].motivo, 'profesional_desconocido');
});

Deno.test('plan: un plan sin nada aplicable no es valido', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const v = validarPlan(plan([{ citaId: 'A', inicio: iso(3, 0) }]), optsBase([a]));
  assertFalse(v.valido);
  assertEquals(v.movimientos.length, 0);
});

// ---------------------------------------------------------------------------
// Varios planes y puente a la escritura
// ---------------------------------------------------------------------------

Deno.test('validarPlanes: un plan no puede pisar las citas de otro ya aceptado', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const p1 = plan([{ citaId: 'A', inicio: iso(10, 0) }], { titulo: 'Plan 1' });
  const p2 = plan([{ citaId: 'A', inicio: iso(11, 0) }], { titulo: 'Plan 2' });
  const salida = validarPlanes([p1, p2], optsBase([a]));

  assertEquals(salida.length, 1, 'el segundo plan toca la misma cita: se descarta');
  assertEquals(salida[0].titulo, 'Plan 1');
});

Deno.test('validarPlanes: ordena por impacto ponderado por confianza', () => {
  const a = cita('A', 'P1', 12, 0, 30);
  const b = cita('B', 'P2', 18, 0, 30);
  const flojo = plan([{ citaId: 'A', inicio: iso(11, 0) }], { titulo: 'Flojo', confianza: 'baja' });
  const fuerte = plan([{ citaId: 'B', inicio: iso(10, 0) }], { titulo: 'Fuerte', confianza: 'alta' });
  const salida = validarPlanes([flojo, fuerte], optsBase([a, b]));

  assertEquals(salida.map((p) => p.titulo), ['Fuerte', 'Flojo']);
});

Deno.test('planAMovimientos: solo salen los movimientos que NO necesitan consentimiento', () => {
  // A esta en el salon (aplicable en caliente), B no (propuesta).
  const a = cita('A', 'P1', 10, 0, 60);
  const b = cita('B', 'P2', 17, 0, 30);
  const v = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(10, 45) },
      { citaId: 'B', inicio: iso(12, 0) },
    ]),
    optsBase([a, b], { ahoraMs: ms(10, 30) }),
  );
  assertEquals(v.movimientos.length, 2, JSON.stringify(v.podados));
  const ejecutables = planAMovimientos(v);
  assertEquals(ejecutables.length, 1);
  assertEquals(ejecutables[0].cita_id, 'A');
  assertEquals(ejecutables[0].nuevo_inicio, iso(10, 45));
});

Deno.test('planAMovimientos: no manda fin_activa/fin_espera si la cita no los tenia', () => {
  const a = cita('A', 'P1', 10, 0, 60); // sin fases
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 45) }]),
    optsBase([a], { ahoraMs: ms(10, 30) }),
  );
  const [m] = planAMovimientos(v);
  assertEquals(m.nuevo_fin_activa, undefined);
  assertEquals(m.nuevo_fin_espera, undefined);
});

// ---------------------------------------------------------------------------
// Geometria precalculada para el generador
// ---------------------------------------------------------------------------

Deno.test('huecosLibres: el REPOSO de una cita cuenta como hueco', () => {
  // B: activa 10:00-10:30, reposo 10:30-11:30, activa 11:30-12:00.
  const b = citaConReposo('B', 'P1', 10, 0, 30, 60, 30);
  const huecos = huecosLibresProfesional('P1', ms(12, 0), [b], {
    ahoraMs: ms(9, 0),
    horariosProfesional: [horarioProf('P1', 9, 14)],
  });
  // 9:00-10:00, 10:30-11:30 (el reposo) y 12:00-14:00.
  assertEquals(huecos.map((h) => h.minutos), [60, 60, 120]);
  assertEquals(huecos[1].desde, iso(10, 30));
  assertEquals(huecos[1].hasta, iso(11, 30));
});

Deno.test('huecosLibres: respeta turnos, bloqueos, lo ya pasado y el dia cerrado', () => {
  const a = cita('A', 'P1', 10, 0, 60);
  const base = {
    ahoraMs: ms(9, 30),
    horariosProfesional: [horarioProf('P1', 9, 14), { ...horarioProf('P1', 16, 20), turno: 2 }],
    bloqueos: [{ profesional_id: 'P1', inicio: iso(16, 0), fin: iso(18, 0) }],
  };
  const huecos = huecosLibresProfesional('P1', ms(12, 0), [a], base);
  // 9:30-10:00 (no 9:00: ya paso), 11:00-14:00 y 18:00-20:00. La comida
  // (14:00-16:00) no aparece, y el bloqueo se come 16:00-18:00.
  assertEquals(huecos.map((h) => [h.desde, h.hasta]), [
    [iso(9, 30), iso(10, 0)],
    [iso(11, 0), iso(14, 0)],
    [iso(18, 0), iso(20, 0)],
  ]);

  const cerrado = huecosLibresProfesional('P1', ms(12, 0), [a], {
    ...base,
    cierres: [{ fecha: ymd(0), motivo: 'Festivo' }],
  });
  assertEquals(cerrado.length, 0);
});

// ---------------------------------------------------------------------------
// Re-validacion (la carrera del §7: la agenda cambia entre generar y aplicar)
// ---------------------------------------------------------------------------

Deno.test('rehidratarPlan: un plan validado se puede volver a validar y da lo mismo', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const b = cita('B', 'P2', 18, 0, 30);
  const opts = optsBase([a, b]);
  const v1 = validarPlan(
    plan([
      { citaId: 'A', inicio: iso(10, 0) },
      { citaId: 'B', inicio: iso(12, 0) },
    ]),
    opts,
  );
  const v2 = validarPlan(rehidratarPlan(v1), opts);

  assertEquals(v2.movimientos.map((m) => [m.citaId, m.inicio]), v1.movimientos.map((m) => [m.citaId, m.inicio]));
  assertEquals(v2.impactoMin, v1.impactoMin);
  assertEquals(v2.id, v1.id, 'el id se conserva: es el mismo plan, no uno nuevo');
});

Deno.test('rehidratarPlan: si la agenda cambio debajo, la re-validacion lo poda', () => {
  const a = cita('A', 'P1', 17, 0, 30);
  const opts = optsBase([a]);
  const v1 = validarPlan(plan([{ citaId: 'A', inicio: iso(10, 0) }]), opts);
  assert(v1.valido);

  // Alguien ha metido una cita a las 10:00 mientras el plan estaba en pantalla.
  const intrusa = cita('Z', 'P1', 10, 0, 60);
  const v2 = validarPlan(rehidratarPlan(v1), optsBase([a, intrusa]));

  assertFalse(v2.valido);
  assertEquals(v2.podados[0].motivo, 'colision');
});

Deno.test('planAUpdates: solo los movimientos en caliente, con las 4 marcas', () => {
  const a = citaConReposo('A', 'P1', 10, 0, 30, 40, 20);
  const v = validarPlan(
    plan([{ citaId: 'A', inicio: iso(10, 45) }]),
    optsBase([a], { ahoraMs: ms(10, 30) }), // esta en el salon: en caliente
  );
  const [u] = planAUpdates(v);
  assertEquals(u.id, 'A');
  assertEquals(u.inicio, iso(10, 45));
  assertEquals(u.fin_activa, iso(11, 15));
  assertEquals(u.fin_espera, iso(11, 55));
  assertEquals(u.profesional_id, undefined);
});

Deno.test('refDeCliente: el telefono manda sobre el nombre', () => {
  const a = cita('A', 'P1', 10, 0, 30, { telefono: '+34 600 11 22 33', cliente: 'Maria' });
  const b = cita('B', 'P1', 11, 0, 30, { telefono: '600112233', cliente: 'Maria Lopez' });
  assertEquals(refDeCliente(a), refDeCliente(b), 'mismo telefono = misma persona');
  const sinTel = cita('C', 'P1', 12, 0, 30, { cliente: 'Maria' });
  assertEquals(refDeCliente(sinTel), 'nom:maria');
});
