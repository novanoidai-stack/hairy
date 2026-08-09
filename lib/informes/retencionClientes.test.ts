// Tests de retención y fidelización.
// Ejecutar: deno test lib/informes/retencionClientes.test.ts
import { assert, assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  serieBaseFidelizada,
  embudoFidelizacion,
  cohortesRetencion,
  frasesCohortes,
  frecuenciaRetorno,
  fraseFrecuencia,
  frecuenciaDiasCliente,
  visitasPorCliente,
  claveMes,
  inicioMes,
  finMes,
  sumarMeses,
  type VisitaHistorica,
} from './retencionClientes.ts';

function v(clienteId: string, iso: string, servicioId?: string): VisitaHistorica {
  return { clienteId, fecha: new Date(`${iso}T12:00:00`), servicioId };
}

const HASTA = new Date('2026-08-09T23:59:59');

// --- Calendario -------------------------------------------------------------

Deno.test('inicioMes y finMes cubren el mes entero sin desbordarlo', () => {
  const d = new Date('2026-02-15T10:00:00');
  assertEquals(inicioMes(d).getDate(), 1);
  assertEquals(finMes(d).getMonth(), 1); // sigue en febrero
  assertEquals(finMes(d).getDate(), 28); // 2026 no es bisiesto
});

Deno.test('sumarMeses cruza el cambio de año', () => {
  assertEquals(claveMes(sumarMeses(new Date('2026-11-01T00:00:00'), 3)), '2027-02');
  assertEquals(claveMes(sumarMeses(new Date('2026-02-01T00:00:00'), -3)), '2025-11');
});

Deno.test('visitasPorCliente ordena de mas antigua a mas nueva', () => {
  const m = visitasPorCliente([v('a', '2026-05-01'), v('a', '2026-01-01'), v('a', '2026-03-01')]);
  const fechas = m.get('a')!.map((x) => x.fecha.getMonth());
  assertEquals(fechas, [0, 2, 4]);
});

Deno.test('visitasPorCliente ignora visitas sin cliente', () => {
  const m = visitasPorCliente([{ clienteId: '', fecha: new Date() }, v('a', '2026-01-01')]);
  assertEquals(m.size, 1);
});

// --- B1: base fidelizada ----------------------------------------------------

Deno.test('sin visitas la serie sale a cero, no vacia', () => {
  const s = serieBaseFidelizada([], { meses: 3, hasta: HASTA });
  assertEquals(s.length, 3);
  assertEquals(s.map((p) => p.valor), [0, 0, 0]);
});

Deno.test('un cliente de una sola visita no cuenta como fidelizado', () => {
  const s = serieBaseFidelizada([v('a', '2026-08-01')], { meses: 1, hasta: HASTA });
  assertEquals(s[0].valor, 0);
});

Deno.test('con dos visitas ya cuenta como fidelizado', () => {
  const s = serieBaseFidelizada([v('a', '2026-07-01'), v('a', '2026-08-01')], { meses: 1, hasta: HASTA });
  assertEquals(s[0].valor, 1);
});

Deno.test('la serie no usa informacion del futuro', () => {
  // Segunda visita en agosto: en el cierre de junio ese cliente aun no estaba
  // fidelizado y el mes de junio no puede contarlo.
  const visitas = [v('a', '2026-06-15'), v('a', '2026-08-01')];
  const s = serieBaseFidelizada(visitas, { meses: 3, hasta: HASTA });
  const porMes = new Map(s.map((p) => [claveMes(p.fecha), p.valor]));
  assertEquals(porMes.get('2026-06'), 0);
  assertEquals(porMes.get('2026-08'), 1);
});

Deno.test('un cliente que deja de venir cae de la base al pasar la ventana', () => {
  // Dos visitas en enero y nada mas: en enero cuenta, en agosto ya no.
  const visitas = [v('a', '2026-01-05'), v('a', '2026-01-25')];
  const s = serieBaseFidelizada(visitas, { meses: 8, hasta: HASTA });
  const porMes = new Map(s.map((p) => [claveMes(p.fecha), p.valor]));
  assertEquals(porMes.get('2026-01'), 1);
  assertEquals(porMes.get('2026-02'), 1); // dentro de los 90 dias
  assertEquals(porMes.get('2026-08'), 0); // fuera
});

Deno.test('la serie viene ordenada de mes mas antiguo a mas reciente', () => {
  const s = serieBaseFidelizada([v('a', '2026-01-01'), v('a', '2026-02-01')], { meses: 6, hasta: HASTA });
  for (let i = 1; i < s.length; i++) {
    assert(s[i].fecha.getTime() > s[i - 1].fecha.getTime(), 'serie desordenada');
  }
});

Deno.test('la base fidelizada creciente se ve como una linea que sube', () => {
  const visitas: VisitaHistorica[] = [];
  // Cada mes entra un cliente nuevo que viene dos veces y sigue viniendo.
  for (let mes = 3; mes <= 8; mes++) {
    const mm = String(mes).padStart(2, '0');
    for (let cli = 1; cli <= mes - 2; cli++) {
      visitas.push(v(`c${cli}`, `2026-${mm}-05`), v(`c${cli}`, `2026-${mm}-20`));
    }
  }
  const s = serieBaseFidelizada(visitas, { meses: 6, hasta: HASTA });
  assert(s[s.length - 1].valor > s[0].valor, 'la base deberia crecer');
});

// --- B2: embudo -------------------------------------------------------------

Deno.test('embudo vacio no divide por cero', () => {
  const e = embudoFidelizacion([], { desde: new Date('2026-08-01'), hasta: HASTA });
  assertEquals(e.nuevos, 0);
  assertEquals(e.pctVuelven, 0);
  assertEquals(e.pctFieles, 0);
});

Deno.test('nuevo es quien estrena el salon en el periodo, no quien lo visita', () => {
  const visitas = [
    v('viejo', '2025-03-01'), v('viejo', '2026-08-02'), // ya venia de antes
    v('nuevo', '2026-08-03'),
  ];
  const e = embudoFidelizacion(visitas, { desde: new Date('2026-08-01T00:00:00'), hasta: HASTA });
  assertEquals(e.nuevos, 1);
});

Deno.test('el embudo mide las tres etapas y sus porcentajes', () => {
  const desde = new Date('2026-08-01T00:00:00');
  const visitas = [
    // 4 nuevos: uno viene una vez, dos vuelven, uno llega a tres.
    v('a', '2026-08-01'),
    v('b', '2026-08-02'), v('b', '2026-08-20'),
    v('c', '2026-08-03'), v('c', '2026-08-22'),
    v('d', '2026-08-04'), v('d', '2026-08-15'), v('d', '2026-08-28'),
  ];
  const e = embudoFidelizacion(visitas, { desde, hasta: HASTA });
  assertEquals(e.nuevos, 4);
  assertEquals(e.volvieron, 3);
  assertEquals(e.fieles, 1);
  assertEquals(Math.round(e.pctVuelven), 75);
  assertEquals(Math.round(e.pctFieles), 25);
});

Deno.test('los peldaños del embudo nunca crecen hacia abajo', () => {
  const desde = new Date('2026-08-01T00:00:00');
  const visitas = [v('a', '2026-08-01'), v('a', '2026-08-10'), v('a', '2026-08-20')];
  const e = embudoFidelizacion(visitas, { desde, hasta: HASTA });
  assert(e.nuevos >= e.volvieron && e.volvieron >= e.fieles);
});

// --- B3: cohortes -----------------------------------------------------------

Deno.test('cohortes sin datos no revientan y la frase lo dice', () => {
  const c = cohortesRetencion([], { meses: 3, hasta: HASTA });
  assertEquals(c.cohortes.length, 3);
  assert(frasesCohortes(c).includes('Todavía no hay'));
});

Deno.test('un mes que aun no ha llegado es null, no 0', () => {
  // Cohorte de agosto (mes actual): septiembre en adelante no existe todavia.
  const c = cohortesRetencion([v('a', '2026-08-01')], { meses: 1, hasta: HASTA });
  assertEquals(c.cohortes[0].tamano, 1);
  for (const r of c.cohortes[0].retencion) assertEquals(r, null);
});

Deno.test('la cohorte cuenta a quien volvio en el mes siguiente', () => {
  const visitas = [
    v('a', '2026-06-05'), v('a', '2026-07-05'), // vuelve al mes siguiente
    v('b', '2026-06-06'),                       // no vuelve
  ];
  const c = cohortesRetencion(visitas, { meses: 3, hasta: HASTA });
  const junio = c.cohortes.find((x) => claveMes(x.mes) === '2026-06')!;
  assertEquals(junio.tamano, 2);
  assertAlmostEquals(junio.retencion[0]!, 50, 0.001);
});

Deno.test('una cohorte vacia deja la fila en null en vez de un 0 enganoso', () => {
  const c = cohortesRetencion([v('a', '2026-06-05')], { meses: 3, hasta: HASTA });
  const julio = c.cohortes.find((x) => claveMes(x.mes) === '2026-07')!;
  assertEquals(julio.tamano, 0);
  assertEquals(julio.retencion[0], null);
});

Deno.test('la frase de cohortes traduce el porcentaje a "de cada 10"', () => {
  const visitas: VisitaHistorica[] = [];
  // 10 clientes entran en junio, 4 vuelven en julio.
  for (let i = 0; i < 10; i++) visitas.push(v(`c${i}`, '2026-06-05'));
  for (let i = 0; i < 4; i++) visitas.push(v(`c${i}`, '2026-07-05'));
  const frase = frasesCohortes(cohortesRetencion(visitas, { meses: 3, hasta: HASTA }));
  assert(frase.includes('4 vuelven al mes siguiente'), frase);
});

// --- Frecuencia de un cliente suelto (fallback de la ficha) -----------------

Deno.test('con menos de 3 visitas no hay frecuencia, y se dice con null', () => {
  assertEquals(frecuenciaDiasCliente([]), null);
  assertEquals(frecuenciaDiasCliente([new Date('2026-08-01')]), null);
  assertEquals(frecuenciaDiasCliente([new Date('2026-07-01'), new Date('2026-08-01')]), null);
});

Deno.test('con 3 visitas da la media de los intervalos', () => {
  // Intervalos de 20 y 30 dias -> media 25.
  const f = frecuenciaDiasCliente([
    new Date('2026-06-01T12:00:00'),
    new Date('2026-06-21T12:00:00'),
    new Date('2026-07-21T12:00:00'),
  ]);
  assertEquals(f, 25);
});

Deno.test('solo promedia los ultimos 6 intervalos, como hace el SQL', () => {
  // 8 visitas: los dos primeros intervalos son enormes y NO deben contar.
  const fechas = [new Date('2020-01-01T12:00:00'), new Date('2022-01-01T12:00:00'), new Date('2026-01-01T12:00:00')];
  let d = new Date('2026-01-01T12:00:00');
  for (let i = 0; i < 6; i++) {
    d = new Date(d.getTime() + 30 * 86400000);
    fechas.push(new Date(d));
  }
  assertEquals(frecuenciaDiasCliente(fechas), 30);
});

Deno.test('las fechas desordenadas se ordenan antes de medir', () => {
  const f = frecuenciaDiasCliente([
    new Date('2026-07-21T12:00:00'),
    new Date('2026-06-01T12:00:00'),
    new Date('2026-06-21T12:00:00'),
  ]);
  assertEquals(f, 25);
});

Deno.test('dos servicios el mismo dia no cuentan como retorno en la ficha', () => {
  const f = frecuenciaDiasCliente([
    new Date('2026-06-01T10:00:00'),
    new Date('2026-06-01T12:00:00'),
    new Date('2026-07-01T12:00:00'),
  ]);
  assertEquals(f, 30);
});

// --- A6: cada cuanto vuelven ------------------------------------------------

Deno.test('sin clientes repetidores no se puede medir la frecuencia', () => {
  const f = frecuenciaRetorno([v('a', '2026-08-01')]);
  assertEquals(f.global.intervalos, 0);
  assert(fraseFrecuencia(f).includes('no se puede medir'));
});

Deno.test('dos servicios el mismo dia no cuentan como un retorno', () => {
  const f = frecuenciaRetorno([v('a', '2026-08-01', 's1'), v('a', '2026-08-01', 's2')]);
  assertEquals(f.global.intervalos, 0);
});

Deno.test('la mediana no se mueve con la reaparicion tardia que si mueve la media', () => {
  const visitas: VisitaHistorica[] = [];
  // 9 clientes con ciclo de 28 dias y uno que reaparece tras mas de un ano.
  for (let i = 0; i < 9; i++) {
    visitas.push(v(`c${i}`, '2026-07-01'), v(`c${i}`, '2026-07-29'));
  }
  visitas.push(v('tardio', '2025-06-01'), v('tardio', '2026-08-01'));
  const f = frecuenciaRetorno(visitas);
  assertEquals(Math.round(f.global.medianaDias), 28);
  assert(f.global.mediaDias > 50, `la media deberia estar inflada, es ${f.global.mediaDias}`);
  // Y la frase avisa de la diferencia en vez de dar la media por buena.
  assert(fraseFrecuencia(f).includes('reapariciones sueltas'));
});

Deno.test('la ficha "cajon" de sin cita no arrastra la mediana del salon', () => {
  const visitas: VisitaHistorica[] = [];
  // Cinco clientes de verdad con ciclo de 28 dias.
  for (let i = 0; i < 5; i++) {
    visitas.push(v(`c${i}`, '2026-07-01'), v(`c${i}`, '2026-07-29'));
  }
  // Y una ficha con 60 visitas seguidas dia tras dia: la de atender sin cita.
  const base = new Date('2026-06-01T12:00:00');
  for (let d = 0; d < 60; d++) {
    visitas.push({ clienteId: 'sin-cita', fecha: new Date(base.getTime() + d * 86400000) });
  }

  const f = frecuenciaRetorno(visitas);
  assertEquals(Math.round(f.global.medianaDias), 28);
  assertEquals(f.fichasDescartadas, 1);

  // Sin el descarte, esa ficha sola manda: la mediana se iria a 1 dia.
  const sinDescarte = frecuenciaRetorno(visitas, { minDiasCicloCliente: 0 });
  assertEquals(Math.round(sinDescarte.global.medianaDias), 1);
  assertEquals(sinDescarte.fichasDescartadas, 0);
});

Deno.test('un cliente normal no se descarta por tener una visita seguida sueltas', () => {
  // Ciclo de 30 dias con una repeticion al dia siguiente: la mediana sigue alta.
  const visitas = [
    v('a', '2026-05-01'), v('a', '2026-05-02'),
    v('a', '2026-06-01'), v('a', '2026-07-01'),
  ];
  const f = frecuenciaRetorno(visitas);
  assertEquals(f.fichasDescartadas, 0);
  assert(f.global.medianaDias >= 2, `mediana ${f.global.medianaDias}`);
});

Deno.test('separa fieles (3+ visitas) de ocasionales (2 visitas)', () => {
  const visitas = [
    // fiel: ciclo de 20 dias
    v('fiel', '2026-06-01'), v('fiel', '2026-06-21'), v('fiel', '2026-07-11'),
    // ocasional: volvio a los 70 dias y no mas
    v('ocas', '2026-05-01'), v('ocas', '2026-07-10'),
  ];
  const f = frecuenciaRetorno(visitas);
  assertEquals(Math.round(f.fieles.medianaDias), 20);
  assertEquals(Math.round(f.ocasionales.medianaDias), 70);
  assert(fraseFrecuencia(f).includes('ya son del salón'));
});

Deno.test('por servicio solo se publica lo que tiene muestra suficiente', () => {
  const visitas: VisitaHistorica[] = [];
  // Color: 5 intervalos de 45 dias. Corte: un solo intervalo (no debe salir).
  for (let i = 0; i < 5; i++) {
    visitas.push(v(`col${i}`, '2026-05-01', 'color'), v(`col${i}`, '2026-06-15', 'color'));
  }
  visitas.push(v('cort', '2026-06-01', 'corte'), v('cort', '2026-06-27', 'corte'));
  const f = frecuenciaRetorno(visitas, { minIntervalosServicio: 4 });
  assertEquals(f.porServicio.length, 1);
  assertEquals(f.porServicio[0].servicioId, 'color');
  assertEquals(Math.round(f.porServicio[0].medianaDias), 45);
});

Deno.test('los servicios se ordenan de ciclo mas largo a mas corto', () => {
  const visitas: VisitaHistorica[] = [];
  for (let i = 0; i < 5; i++) {
    visitas.push(v(`a${i}`, '2026-05-01', 'color'), v(`a${i}`, '2026-06-15', 'color'));
    visitas.push(v(`b${i}`, '2026-06-01', 'corte'), v(`b${i}`, '2026-06-27', 'corte'));
  }
  const f = frecuenciaRetorno(visitas);
  assertEquals(f.porServicio.map((x) => x.servicioId), ['color', 'corte']);
  const frase = fraseFrecuencia(f, (id) => (id === 'color' ? 'Color' : 'Corte'));
  assert(frase.includes('Color cada 45'), frase);
  assert(frase.includes('Corte cada 26'), frase);
});

Deno.test('la frase da el umbral de fuga coherente con el aviso automatico (x1,4)', () => {
  const visitas = [v('a', '2026-06-01'), v('a', '2026-07-01')]; // 30 dias
  const frase = fraseFrecuencia(frecuenciaRetorno(visitas));
  assert(frase.includes('42 días'), frase); // 30 * 1,4
});
