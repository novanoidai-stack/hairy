// Tests puros del analizador de "Organizar mi agenda" (Sesion 5, deno test).
// Cubren la priorizacion por profesional (retraso > solape > huecos), el
// filtro al dia de "ahora", el umbral de ruido y la exclusion de cadenas
// multiprofesional de la compactacion de huecos.
// Ejecutar: deno test lib/organizarAgenda.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  analizarAgendaDia,
  ordenarPorPrioridad,
  prioridadProblema,
  type CitaOrganizar,
  type ProblemaAgenda,
} from './organizarAgenda.ts';

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
  // Adelantar B de 12:00 a 10:30 son 90 min: por encima del techo por defecto (60), asi que
  // este escenario necesita un salon que permita adelantos largos. Ver el test siguiente.
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 20), maxAdelantoMin: 120 });
  const reposo = problemas.find((p) => p.tipo === 'reposo_desaprovechado')!;
  assert(reposo, 'B debe poder adelantarse al reposo de A');
  assertEquals(reposo.estrategias[0].updates[0].id, 'B');
  assertEquals(reposo.estrategias[0].updates[0].inicio, iso(10, 30));
  // Ademas queda un hueco real detras de A (11:15) que nadie puede tapar.
  const vacio = problemas.find((p) => p.tipo === 'hueco_vacio')!;
  assert(vacio, 'el tramo 11:15-12:00 sigue vacio y debe avisarse');
  assertEquals(vacio.zona.desde, iso(11, 15));
  assertEquals(vacio.zona.hasta, iso(12, 0));
});

Deno.test('reposo_desaprovechado: el techo manda tambien sobre los reposos', () => {
  // Mismo caso, con el techo por defecto. Aprovechar un tiempo muerto es valioso (PA-03),
  // pero no justifica pedirle a la clienta que venga 90 min antes: eso lo decide el salon.
  const citas = [
    cita('A', 'P3', 10, 0, 75, { fin_activa: iso(10, 20), fin_espera: iso(11, 0) }),
    cita('B', 'P3', 12, 0, 20),
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 20) });
  assert(
    !problemas.some((p) => p.tipo === 'reposo_desaprovechado'),
    'el reposo de las 10:30 esta a 90 min: fuera del techo por defecto',
  );
  // Pero el techo acota, no cancela: B si puede adelantarse hasta donde el techo permite.
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto');
  assert(hueco, 'dentro del techo (45 min) la propuesta sigue siendo valida');
  assertEquals(hueco!.estrategias[0].updates[0].inicio, iso(11, 15));
});

Deno.test('hueco por debajo del umbral (20 min) no genera problema', () => {
  const citas = [cita('X', 'P4', 10, 0, 30), cita('Y', 'P4', 10, 45, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  assertEquals(problemas.length, 0);
});

Deno.test('solape: dos citas activas que chocan ofrecen varias estrategias con tipos unicos', () => {
  const citas = [cita('A', 'P5', 10, 0, 60), cita('B', 'P5', 10, 30, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'solape');
  assertEquals(problemas[0].citaIds.sort(), ['A', 'B']);
  // Varias estrategias, tipos unicos (keys del modal), exactamente una recomendada.
  assert(problemas[0].estrategias.length >= 2);
  assertEquals(
    new Set(problemas[0].estrategias.map((e) => e.tipo)).size,
    problemas[0].estrategias.length,
  );
  assertEquals(problemas[0].estrategias.filter((e) => e.recomendada).length, 1);
  assert(problemas[0].estrategias.some((e) => e.tipo === 'mover_hueco'));
  assert(problemas[0].estrategias.some((e) => e.tipo === 'adelantar_otra'));
});

Deno.test('cadena multiprofesional (grupoId) no se propone para compactar huecos', () => {
  const citas = [
    cita('X', 'P6', 10, 0, 30),
    cita('Y', 'P6', 11, 30, 30, { grupoId: 'cadena-1' }),
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  // Mover la cadena sigue prohibido...
  assert(!problemas.some((p) => p.tipo === 'hueco_muerto' || p.tipo === 'reposo_desaprovechado'));
  // ...pero el hueco de 10:31 a 11:30 existe y hay que avisarlo (no hay nada que
  // adelantar, asi que es informativo: se ofrece a la lista de espera).
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'hueco_vacio');
  assertEquals(problemas[0].estrategias.length, 0);
  assertEquals(problemas[0].citaIds.length, 0);
  assertEquals(problemas[0].zona.hasta, iso(11, 30));
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

Deno.test('un retraso ya NO deja mudo al organizador sobre los huecos del mismo profesional', () => {
  const citas = [
    cita('A', 'P1', 9, 0, 30), // 9:00-9:30, ya deberia haber acabado a las 9:45
    cita('B', 'P1', 11, 0, 30), // hueco grande detras
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 45) });
  assert(problemas.some((p) => p.tipo === 'retraso'), 'A va 15 min tarde');
  // Antes el `continue` por profesional se comia esto y solo salia el retraso.
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto')!;
  assert(hueco, 'el hueco hasta las 11:00 debe seguir saliendo pese al retraso');
  assertEquals(hueco.citaIds, ['B']);
});

Deno.test('retraso: una cita comprometida por el arreglo no se propone ademas para compactar', () => {
  // Cascada: el arreglo del retraso ya mueve B, asi que B no puede salir tambien
  // como "hueco muerto" (serian dos ordenes contradictorias sobre la misma cita).
  const citas = [
    cita('A', 'P1', 9, 0, 30),
    cita('B', 'P1', 9, 40, 30), // pegada: entra en la cascada del retraso
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 45) });
  const retraso = problemas.find((p) => p.tipo === 'retraso')!;
  assert(retraso);
  const movidasPorElRetraso = new Set(retraso.citaIds);
  for (const p of problemas) {
    if (p.tipo === 'hueco_muerto' || p.tipo === 'reposo_desaprovechado') {
      assert(
        !p.citaIds.some((id) => movidasPorElRetraso.has(id)),
        `${p.id} propone mover una cita que el retraso ya mueve`,
      );
    }
  }
});

Deno.test('hueco_vacio: no se reporta el tramo antes de la primera cita ni despues de la ultima', () => {
  // Solo interesan los huecos INTERIORES. Que el dia empiece tarde o acabe
  // pronto no es un problema de organizacion: es que no esta lleno.
  // La cita va encadenada para que tampoco se proponga compactarla hacia la
  // apertura y quede claro que el tramo suelto no genera aviso por si mismo.
  const citas = [cita('A', 'P2', 12, 0, 30, { grupoId: 'cadena-9' })];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) });
  assertEquals(problemas.length, 0);
});

Deno.test('hueco_vacio: un bloqueo (ausencia) tapa el hueco, no se avisa', () => {
  const citas = [cita('A', 'P2', 10, 0, 30), cita('B', 'P2', 12, 0, 30)];
  const bloqueos = [{ profesional_id: 'P2', inicio: iso(10, 30), fin: iso(12, 0) }];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0), bloqueos });
  assert(!problemas.some((p) => p.tipo === 'hueco_vacio'));
});

Deno.test('diaMs: analiza el dia que se esta MIRANDO, no solo hoy', () => {
  const manana = '2026-07-09';
  const citas = [
    cita('X', 'P4', 10, 0, 30, { inicio: iso(10, 0, manana), fin: iso(10, 30, manana) }),
    cita('Y', 'P4', 12, 0, 30, { inicio: iso(12, 0, manana), fin: iso(12, 30, manana) }),
  ];
  // Sin diaMs (comportamiento viejo): no ve nada, las citas no son de hoy.
  assertEquals(analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) }).length, 0);
  // Con diaMs apuntando a manana si las analiza.
  const problemas = analizarAgendaDia(citas, PROFS, {
    ahoraMs: ms(9, 0),
    diaMs: ms(15, 0, manana),
  });
  assert(problemas.length > 0, 'el dia siguiente tiene un hueco de 10:30 a 12:00');
  assert(problemas.every((p) => p.profesionalId === 'P4'));
});

Deno.test('diaMs: un dia ya terminado no genera problemas', () => {
  const ayer = '2026-07-07';
  const citas = [
    cita('X', 'P4', 10, 0, 30, { inicio: iso(10, 0, ayer), fin: iso(10, 30, ayer) }),
    cita('Y', 'P4', 12, 0, 30, { inicio: iso(12, 0, ayer), fin: iso(12, 30, ayer) }),
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0), diaMs: ms(12, 0, ayer) });
  assertEquals(problemas.length, 0);
});

Deno.test('el tope de adelanto explica "por que a esa hora y no antes"', () => {
  // Caso que reporto Carlos: son las 14:00, hay una cita a las 15:30 y el
  // organizador propone las 14:30, no las 14:00. Motivo: el techo de adelanto
  // (60 min por defecto) — no un capricho. La tarjeta tiene que decirlo.
  const citas = [
    cita('A', 'P1', 13, 0, 30), // 13:00-13:30, ya pasada
    cita('B', 'P1', 15, 30, 30), // la candidata a adelantarse
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(14, 0) });
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto')!;
  assert(hueco, 'B puede adelantarse');
  // 15:30 - 60 min = 14:30, no 14:00.
  assertEquals(hueco.estrategias[0].updates[0].inicio, iso(14, 30));
  assertEquals(hueco.accionCorta, 'Adelantar a las 14:30');
  assert(/adelanto maximo/.test(hueco.porQue ?? ''), `porQue no explica el techo: ${hueco.porQue}`);
  // Y con el techo subido, si llega a las 14:00.
  const conTechoAlto = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(14, 0), maxAdelantoMin: 240 });
  const hueco2 = conTechoAlto.find((p) => p.tipo === 'hueco_muerto')!;
  assertEquals(hueco2.estrategias[0].updates[0].inicio, iso(14, 0));
});

Deno.test('un hueco que se puede tapar trae zonaOrigen para pintar la flecha', () => {
  const citas = [cita('X', 'P2', 10, 0, 30), cita('Y', 'P2', 11, 30, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(10, 31) });
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto')!;
  assert(hueco.zonaOrigen, 'sin origen no se puede dibujar "mueve ESTA hasta AQUI"');
  // Origen = donde esta ahora (11:30); destino = a donde iria (10:45).
  assertEquals(hueco.zonaOrigen!.desde, iso(11, 30));
  assertEquals(hueco.zona.desde, iso(10, 45));
  assert(+new Date(hueco.zona.desde) < +new Date(hueco.zonaOrigen!.desde), 'adelantar va hacia arriba');
});

Deno.test('todo problema trae zona para poder resaltarlo en la rejilla', () => {
  const citas = [
    cita('A', 'P5', 10, 0, 60),
    cita('B', 'P5', 10, 30, 30), // solape
    cita('C', 'P6', 10, 0, 30),
    cita('D', 'P6', 11, 30, 30), // hueco
  ];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) });
  assert(problemas.length > 0);
  for (const p of problemas) {
    assert(p.zona, `${p.tipo} sin zona`);
    assertEquals(p.zona.profesionalId, p.profesionalId);
    assert(+new Date(p.zona.hasta) > +new Date(p.zona.desde), `${p.tipo} con zona vacia`);
  }
});

Deno.test('solape: si otro profesional esta libre a la misma hora, ofrece reasignar', () => {
  const citas = [cita('A', 'P5', 10, 0, 60), cita('B', 'P5', 10, 30, 30)];
  const profs = [
    { id: 'P5', nombre: 'Eva', categoria: 'oficial' },
    { id: 'P6', nombre: 'Fer', categoria: 'oficial' },
  ];
  const problemas = analizarAgendaDia(citas, profs, { ahoraMs: ms(9, 0) });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const rea = solape.estrategias.find((e) => e.tipo === 'reasignar');
  assert(rea, 'debe ofrecer reasignar');
  assertEquals(rea!.updates[0].id, 'B');
  assertEquals(rea!.updates[0].profesional_id, 'P6');
  assertEquals(rea!.updates[0].inicio, iso(10, 30));
});

// --- Integracion del slice 3: la palanca mover_reasignar llega end-to-end hasta el panel ---

Deno.test('solape: analizarAgendaDia ofrece mover_reasignar con el hueco de otro profesional', () => {
  const citas = [
    // P1 tiene el solape: A 10:00-11:00 y B (intrusa) 10:30-11:00.
    cita('A', 'P1', 10, 0, 60),
    cita('B', 'P1', 10, 30, 30),
    // P2 esta ocupada a la hora de B (10:00-11:00) -> no vale reasignar a misma hora,
    // pero queda libre a las 11:00 -> mover_reasignar debe encontrar ese hueco.
    cita('X', 'P2', 10, 0, 60),
  ];
  const profs = [{ id: 'P1', nombre: 'Ana' }, { id: 'P2', nombre: 'Bea' }];
  const problemas = analizarAgendaDia(citas, profs, { ahoraMs: ms(9, 0) });
  const solape = problemas.find((p) => p.tipo === 'solape');
  assert(solape, 'debe detectar el solape');
  const mv = solape!.estrategias.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'la estrategia mover_reasignar debe llegar hasta el panel');
  assertEquals(mv!.updates[0].id, 'B');
  assertEquals(mv!.updates[0].profesional_id, 'P2');
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
});

Deno.test('solape: los bloqueos de opts llegan al candidato y tapan su hueco', () => {
  const citas = [
    cita('A', 'P1', 10, 0, 60),
    cita('B', 'P1', 10, 30, 30),
    cita('X', 'P2', 10, 0, 60),
  ];
  const profs = [{ id: 'P1', nombre: 'Ana' }, { id: 'P2', nombre: 'Bea' }];
  const problemas = analizarAgendaDia(citas, profs, {
    ahoraMs: ms(9, 0),
    // Bea tiene reunion de 11:00 a 12:00 -> su primer hueco pasa a ser las 12:00.
    bloqueos: [{ profesional_id: 'P2', inicio: iso(11, 0), fin: iso(12, 0) }],
  });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const mv = solape.estrategias.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.updates[0].inicio, iso(12, 0));
});

// --- Jornada real del negocio (negocio_horarios) ---
// OJO: dia_semana es 0=LUNES..6=DOMINGO; Date.getDay() es 0=domingo. Mapeo: (getDay()+6)%7.

Deno.test('jornada: usa el horario del dia correcto (0=lunes, no 0=domingo)', () => {
  // 2026-07-12 es DOMINGO -> dia_semana 6 con el mapeo correcto. El lunes (fila 0) cierra a las
  // 23:00; el domingo (fila 6) esta cerrado -> fallback 09:00-20:00.
  // Las citas van al FINAL del dia a proposito: el unico hueco para la intrusa es a las 20:00
  // (tras A), que cabe con el cierre del lunes (23:00) pero NO con el fallback del domingo.
  //   - mapeo correcto -> fila 6 -> cierre 20:00 -> no se propone nada que pase de las 20:00.
  //   - getDay() sin mapear -> fila 0 (lunes) -> cierre 23:00 -> propone 20:00-20:30 -> FALLA.
  const DOM = '2026-07-12';
  const citas = [
    { ...cita('A', 'P1', 19, 0, 60), inicio: iso(19, 0, DOM), fin: iso(20, 0, DOM) },
    { ...cita('B', 'P1', 19, 30, 30), inicio: iso(19, 30, DOM), fin: iso(20, 0, DOM) },
  ];
  const horarios = [
    { dia_semana: 0, abierto: true, apertura: '09:00', cierre: '23:00' }, // lunes: cierra tardisimo
    { dia_semana: 6, abierto: false, apertura: null, cierre: null },      // domingo: cerrado
  ];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], {
    ahoraMs: ms(9, 0, DOM),
    horarios,
  });
  const solape = problemas.find((p) => p.tipo === 'solape');
  assert(solape, 'debe detectar el solape');
  // Se mira mover_hueco (que busca hueco y por tanto respeta el cierre) y NO la cascada: la
  // cascada empuja y puede pasarse del cierre por diseno, y ese coste ya lo dice retrasoCierreMin.
  assert(
    !solape!.estrategias.some((e) => e.tipo === 'mover_hueco'),
    'con el cierre del domingo (20:00) la intrusa no cabe a las 20:00; si aparece mover_hueco es que se cogio la fila del lunes',
  );
});

Deno.test('jornada: cierre corto a las 14:00 no ofrece huecos posteriores', () => {
  // D = 2026-07-08 es miercoles -> dia_semana 2. Citas pegadas al cierre a proposito: el unico
  // hueco para la intrusa seria las 14:00 (fin 14:30), que cabria con la constante de las 20:00
  // pero no con el cierre real de las 14:00.
  const citas = [cita('A', 'P1', 13, 0, 60), cita('B', 'P1', 13, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:00', cierre: '14:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  assert(
    !solape.estrategias.some((e) => e.tipo === 'mover_hueco'),
    'no debe ofrecer mover la intrusa a las 14:00: el salon ya ha cerrado',
  );
});

Deno.test('jornada: sin cierre real (fallback 20:00) ese mismo hueco de las 14:00 SI se ofrece', () => {
  // Espejo del test anterior: prueba que lo que lo hace fallar es el cierre, no otra cosa.
  const citas = [cita('A', 'P1', 13, 0, 60), cita('B', 'P1', 13, 30, 30)];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0) });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const mover = solape.estrategias.find((e) => e.tipo === 'mover_hueco');
  assert(mover, 'con el fallback de las 20:00 el hueco de las 14:00 es valido');
  assertEquals(mover!.updates[0].inicio, iso(14, 0));
});

Deno.test('jornada: cierre a las 21:00 permite huecos que la constante de las 20:00 tapaba', () => {
  const citas = [
    cita('A', 'P1', 19, 0, 60),  // 19:00-20:00
    cita('B', 'P1', 19, 30, 30), // intrusa 19:30-20:00
  ];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '07:00', cierre: '21:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const mover = solape.estrategias.find((e) => e.tipo === 'mover_hueco');
  assert(mover, 'con cierre 21:00 debe caber mover la intrusa a las 20:00');
  assertEquals(mover!.updates[0].inicio, iso(20, 0));
});

Deno.test('jornada: apertura 09:30 impide adelantar una cita a las 09:00', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:30', cierre: '20:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(8, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  for (const e of solape.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.inicio) >= +new Date(iso(9, 30)), `${e.tipo} propone inicio ${u.inicio}, antes de abrir`);
    }
  }
});

Deno.test('jornada: sin horarios en opts, comportamiento identico al actual', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const conNada = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0) });
  const conVacio = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios: [] });
  assertEquals(JSON.stringify(conNada), JSON.stringify(conVacio));
  assert(conNada.length > 0, 'debe seguir detectando el solape');
});

Deno.test('jornada: abierto=false con citas ese dia cae al fallback y sigue habiendo estrategias', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: false, apertura: null, cierre: null }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape');
  assert(solape, 'apertura excepcional: debe seguir pudiendo reorganizarse');
  assert(solape!.estrategias.length > 0);
});

Deno.test('jornada: acepta el formato HH:MM:SS que devuelve Postgres', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:00:00', cierre: '14:00:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  for (const e of solape.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.fin) <= +new Date(iso(14, 0)), `${e.tipo} ignora el cierre en HH:MM:SS`);
    }
  }
});

// --- Limites de adelanto configurables por salon ---
// El caso real de produccion (16 jul, prueba_46980): el organizador proponia adelantar
// a cuatro clientas 180 min. Ningun salon aplica eso.

Deno.test('limites: el caso real de produccion, adelantar 180 min, queda acotado al techo', () => {
  // Cita a las 17:00 y el dia entero libre por delante -> el hueco "natural" son 180 min,
  // que es lo que se proponia el 16 jul en prueba_46980. El techo NO cancela la propuesta:
  // la acota, asi que como mucho se adelanta 60 min (a las 16:00), nunca a las 14:00.
  const citas = [cita('A', 'P1', 17, 0, 60)];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(14, 0) });
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto');
  assert(hueco, 'sigue habiendo propuesta, pero razonable');
  assertEquals(hueco!.estrategias[0].updates[0].inicio, iso(16, 0));
});

Deno.test('limites: un adelanto de 45 min si se propone (dentro del techo, sobre el umbral)', () => {
  const citas = [cita('A', 'P1', 14, 45, 60)];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(14, 0) });
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto');
  assert(hueco, 'adelantar 45 min es razonable: debe proponerse');
  assertEquals(hueco!.estrategias[0].updates[0].inicio, iso(14, 0));
});

Deno.test('limites: el techo es configurable por salon', () => {
  // Un salon que no quiere adelantar mas de 15 min: la cita de las 17:00 solo puede
  // llegar a las 16:45, no a las 16:00 como con el techo por defecto.
  const citas = [cita('A', 'P1', 17, 0, 60)];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], {
    ahoraMs: ms(14, 0),
    maxAdelantoMin: 15,
    umbralHuecoMin: 10,
  });
  const hueco = problemas.find((p) => p.tipo === 'hueco_muerto')!;
  assertEquals(hueco.estrategias[0].updates[0].inicio, iso(16, 45));
});

Deno.test('limites: la ganancia minima es configurable por salon', () => {
  // Salon que si quiere que le avisen por ganancias pequenas (umbral 5, el default viejo).
  const citas = [cita('A', 'P1', 14, 20, 60)];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], {
    ahoraMs: ms(14, 0),
    umbralHuecoMin: 5,
  });
  assert(problemas.some((p) => p.tipo === 'hueco_muerto'), 'con umbral 5 una ganancia de 20 min cuenta');
});

Deno.test('limites: el techo no afecta a mover_reasignar (solo va hacia adelante)', () => {
  const citas = [
    cita('A', 'P1', 10, 0, 60),
    cita('B', 'P1', 10, 30, 30),
    cita('X', 'P2', 10, 0, 60),
  ];
  const profs = [{ id: 'P1', nombre: 'Ana' }, { id: 'P2', nombre: 'Bea' }];
  const problemas = analizarAgendaDia(citas, profs, { ahoraMs: ms(9, 0), maxAdelantoMin: 0 });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const mv = solape.estrategias.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'mover_reasignar retrasa, no adelanta: el techo no le aplica');
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
});

// --- Prioridad: por donde empezar cuando el dia saca varios avisos ---

function problemaFalso(
  tipo: 'solape' | 'retraso' | 'hueco_muerto' | 'reposo_desaprovechado' | 'hueco_vacio',
  o: { id: string; minutos?: number; desde?: string; hasta?: string } ,
): ProblemaAgenda {
  return {
    id: o.id,
    tipo,
    profesionalId: 'P1',
    profesionalNombre: 'Ana',
    titulo: tipo,
    descripcion: '',
    citaIds: [],
    estrategias: [],
    minutos: o.minutos,
    zona: { profesionalId: 'P1', desde: o.desde ?? iso(10, 0), hasta: o.hasta ?? iso(10, 30) },
    accionCorta: '',
  };
}

Deno.test('prioridad: un solape pesa mas que cualquier retraso', () => {
  const solape = problemaFalso('solape', { id: 's' });
  const retrasoGordo = problemaFalso('retraso', { id: 'r', minutos: 240 });
  assert(prioridadProblema(solape) > prioridadProblema(retrasoGordo));
});

Deno.test('prioridad: entre dos retrasos manda el que va mas tarde', () => {
  const corto = problemaFalso('retraso', { id: 'a', minutos: 5 });
  const largo = problemaFalso('retraso', { id: 'b', minutos: 45 });
  assert(prioridadProblema(largo) > prioridadProblema(corto));
});

Deno.test('prioridad: un hueco enorme nunca adelanta a un solape', () => {
  const hueco = problemaFalso('hueco_muerto', { id: 'h', desde: iso(9, 0), hasta: iso(20, 0) });
  const solape = problemaFalso('solape', { id: 's' });
  assert(prioridadProblema(solape) > prioridadProblema(hueco), 'el recorte de magnitud evita el sorpaso');
});

Deno.test('ordenarPorPrioridad: solape, retrasos por tamaño y huecos al final', () => {
  const lista = [
    problemaFalso('hueco_vacio', { id: 'hv' }),
    problemaFalso('retraso', { id: 'r-corto', minutos: 5 }),
    problemaFalso('solape', { id: 'sol' }),
    problemaFalso('retraso', { id: 'r-largo', minutos: 60 }),
    problemaFalso('hueco_muerto', { id: 'hm' }),
  ];
  const orden = ordenarPorPrioridad(lista).map((p) => p.id);
  assertEquals(orden, ['sol', 'r-largo', 'r-corto', 'hm', 'hv']);
});

Deno.test('ordenarPorPrioridad: a igual peso, primero lo que pasa antes', () => {
  const tarde = problemaFalso('hueco_muerto', { id: 'tarde', desde: iso(18, 0), hasta: iso(18, 30) });
  const pronto = problemaFalso('hueco_muerto', { id: 'pronto', desde: iso(9, 0), hasta: iso(9, 30) });
  assertEquals(ordenarPorPrioridad([tarde, pronto]).map((p) => p.id), ['pronto', 'tarde']);
});

Deno.test('ordenarPorPrioridad no toca la lista original', () => {
  const lista = [
    problemaFalso('hueco_vacio', { id: 'a' }),
    problemaFalso('solape', { id: 'b' }),
  ];
  ordenarPorPrioridad(lista);
  assertEquals(lista.map((p) => p.id), ['a', 'b']);
});

// --- Jornada real por profesional (subproyecto C+D, entrega 1) ---------------
//
// OJO con dia_semana: horarios_profesional usa 0=domingo (extract(dow) de
// Postgres / getDay() de JS), MIENTRAS QUE negocio_horarios usa 0=lunes. Estos
// tests derivan el dia de D con getDay() a proposito: si alguien "arregla" el
// codigo copiando el (getDay()+6)%7 de ventanaDelDia, fallan.
const DOW = new Date(`${D}T00:00:00`).getDay();

function horarioProf(profId: string, hIni: number, hFin: number, turno = 1) {
  return {
    profesional_id: profId,
    dia_semana: DOW,
    hora_inicio: `${String(hIni).padStart(2, '0')}:00:00`,
    hora_fin: `${String(hFin).padStart(2, '0')}:00:00`,
    turno,
  };
}

Deno.test('jornada: no se propone un hueco fuera del horario del profesional', () => {
  // Ana acaba a las 14:00. Su cita de las 17:00 (fuera de jornada, pero existe)
  // NO puede adelantarse a las 16:00 aunque este libre: a esa hora no trabaja.
  const citas = [cita('A', 'P1', 17, 0, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, {
    ahoraMs: ms(8, 0),
    horariosProfesional: [horarioProf('P1', 9, 14)],
    maxAdelantoMin: 600,
  });
  const huecos = problemas.filter((p) => p.tipo === 'hueco_muerto' || p.tipo === 'reposo_desaprovechado');
  for (const h of huecos) {
    const destino = new Date(h.zona.desde).getHours();
    assert(destino >= 9 && destino < 14, `propuso las ${destino}h, fuera de 9-14`);
  }
});

Deno.test('jornada: no se propone meter una cita en la pausa entre turnos', () => {
  // Dos turnos: 09-13 y 16-20. La comida (13-16) no es hueco aprovechable.
  const citas = [cita('A', 'P1', 18, 0, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, {
    ahoraMs: ms(8, 0),
    horariosProfesional: [horarioProf('P1', 9, 13, 1), horarioProf('P1', 16, 20, 2)],
    maxAdelantoMin: 600,
  });
  for (const p of problemas) {
    const h = new Date(p.zona.desde).getHours();
    assert(!(h >= 13 && h < 16), `propuso las ${h}h, que es la pausa de comida`);
  }
});

Deno.test('jornada: sin fila de horario, el profesional se comporta como antes', () => {
  const citas = [cita('A', 'P1', 12, 0, 30)];
  const antes = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(8, 0) });
  const despues = analizarAgendaDia(citas, PROFS, {
    ahoraMs: ms(8, 0),
    horariosProfesional: [horarioProf('P2', 9, 14)], // horario de OTRO profesional
  });
  assertEquals(despues.length, antes.length);
});

Deno.test('jornada: un horario de otro dia de la semana no se aplica', () => {
  // Fila para el dia siguiente: para D, P1 no tiene horario propio -> no limita.
  const citas = [cita('A', 'P1', 12, 0, 30)];
  const otroDia = { ...horarioProf('P1', 9, 10), dia_semana: (DOW + 1) % 7 };
  const conOtroDia = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(8, 0), horariosProfesional: [otroDia] });
  const sinHorario = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(8, 0) });
  assertEquals(conOtroDia.length, sinHorario.length);
});

Deno.test('reposo: se ofrecen las dos estrategias cuando hay reposo y hueco normal', () => {
  // Cita larga con reposo: activa 10:00-10:30, espera 10:30-11:30, activa 11:30-12:00.
  // grupoId: la cita larga NO se mueve (cadena multiprofesional). Sin esto el
  // organizador la adelantaria primero, se comeria la mañana, y al llegar a la
  // corta el unico hueco que quedaria SERIA el reposo: los dos candidatos
  // coincidirian y solo habria una estrategia (que es la respuesta correcta,
  // pero no es lo que este test quiere comprobar).
  const larga = cita('L', 'P1', 10, 0, 120, {
    fin_activa: iso(10, 30),
    fin_espera: iso(11, 30),
    grupoId: 'G1',
  });
  // Cita corta a las 15:00 que cabe tanto en el reposo (10:30-11:30) como en el
  // hueco libre de despues de las 12:00.
  const corta = cita('C', 'P1', 15, 0, 30);
  const problemas = analizarAgendaDia([larga, corta], PROFS, {
    ahoraMs: ms(8, 0),
    maxAdelantoMin: 600,
    horariosProfesional: [horarioProf('P1', 9, 20)],
  });
  const p = problemas.find((x) => x.citaIds.includes('C'));
  assert(p, 'no se detecto problema para la cita C');
  assertEquals(p!.tipo, 'reposo_desaprovechado');
  assertEquals(p!.estrategias.length, 2, `estrategias: ${p!.estrategias.map((e) => e.tipo).join(', ')}`);
  assertEquals(p!.estrategias[0].tipo, 'aprovechar_reposo');
  assert(p!.estrategias[0].recomendada, 'el reposo deberia venir marcado como recomendado');
  assertEquals(p!.estrategias[1].tipo, 'mover_hueco');
});
