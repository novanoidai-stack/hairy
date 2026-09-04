// Test unitario del saneador de tecnificar-catalogo.
// Ejecutar con: deno task test:tecnificador
//
// Lo que se prueba aqui no es "que la IA acierte" --eso no se puede probar-- sino
// que NADA de lo que devuelva pueda escribirse tal cual. Un reposo de 400 minutos
// o un recurso inventado tienen que caer con su motivo, y el motivo tiene que
// verse: un descarte mudo es lo que hace que la duena no entienda por que faltan
// servicios en la lista.

import { assertEquals, assert } from 'jsr:@std/assert@1';
// Del modulo del saneador, NO de index.ts: index.ts llama a Deno.serve() en el
// nivel superior y importarlo desde aqui levantaba un servidor y tumbaba la CI.
import { sanear, sanearFases } from './sanear.ts';

const SERVICIO = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  nombre: 'Tinte raiz',
  descripcion: null,
  categoria: null,
  duracion_activa_min: 45,
  duracion_espera_min: null,
  recurso_tipo: null,
  recurso_fase: null,
};
const conocidos = new Map([[SERVICIO.id, SERVICIO]]);

const base = {
  id: SERVICIO.id,
  duracion_activa_min: 25,
  duracion_espera_min: 35,
  recurso_tipo: 'lavacabezas',
  recurso_fase: 'final',
  confianza: 'alta',
  motivo: 'Cobertura de canas: se aplica, reposa y se lava.',
};

Deno.test('una propuesta buena pasa entera', () => {
  const r = sanear(base, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.duracion_activa_min, 25);
  assertEquals(r.duracion_espera_min, 35);
  assertEquals(r.recurso_tipo, 'lavacabezas');
  assertEquals(r.recurso_fase, 'final');
});

Deno.test('un id que no estaba en la tanda se descarta', () => {
  const r = sanear({ ...base, id: 'bbbbbbbb-0000-0000-0000-000000000002' }, conocidos);
  assert('descartada' in r);
});

Deno.test('duraciones absurdas se descartan con su motivo', () => {
  for (const activa of [0, 4, 301, 99999, 'mucho', null]) {
    const r = sanear({ ...base, duracion_activa_min: activa }, conocidos);
    assert('descartada' in r, `deberia caer con activa=${activa}`);
    assert(r.descartada.includes('activa'), 'el motivo tiene que decir cual es');
  }
  for (const espera of [-5, 121, 400]) {
    const r = sanear({ ...base, duracion_espera_min: espera }, conocidos);
    assert('descartada' in r, `deberia caer con espera=${espera}`);
  }
});

Deno.test('un reposo de 0 es valido: no todo servicio tiene reposo', () => {
  const r = sanear({ ...base, duracion_espera_min: 0, recurso_tipo: null }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.duracion_espera_min, 0);
});

// Un recurso inventado no puede tirar la propuesta entera: los minutos son lo que
// vale, y el puesto se pone despues a mano en dos clics.
Deno.test('un recurso inventado se limpia pero no invalida los minutos', () => {
  const r = sanear({ ...base, recurso_tipo: 'sillon-magico' }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.recurso_tipo, null);
  assertEquals(r.recurso_fase, null, 'sin recurso no puede quedar una fase suelta');
  assertEquals(r.duracion_espera_min, 35);
});

Deno.test('una fase sin recurso se descarta; un recurso sin fase la deduce', () => {
  const sinRecurso = sanear({ ...base, recurso_tipo: null, recurso_fase: 'final' }, conocidos);
  assert(!('descartada' in sinRecurso));
  assertEquals(sinRecurso.recurso_fase, null);

  const sinFase = sanear({ ...base, recurso_fase: null }, conocidos);
  assert(!('descartada' in sinFase));
  // Con reposo, el puesto solo hace falta despues (el lavado del tinte).
  assertEquals(sinFase.recurso_fase, 'final');

  const sinFaseNiReposo = sanear({ ...base, recurso_fase: null, duracion_espera_min: 0 }, conocidos);
  assert(!('descartada' in sinFaseNiReposo));
  assertEquals(sinFaseNiReposo.recurso_fase, 'completa');
});

Deno.test('una confianza rara se degrada a baja, no se cuela', () => {
  const r = sanear({ ...base, confianza: 'altisima' }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.confianza, 'baja');
});

Deno.test('el motivo se recorta: no puede llevarse la pantalla por delante', () => {
  const r = sanear({ ...base, motivo: 'x'.repeat(5000) }, conocidos);
  assert(!('descartada' in r));
  assert(r.motivo.length <= 200);
});

Deno.test('basura entera no revienta', () => {
  for (const cruda of [null, undefined, 42, 'texto', [], {}]) {
    const r = sanear(cruda, conocidos);
    assert('descartada' in r, `deberia descartar: ${JSON.stringify(cruda)}`);
  }
});

// ---------------------------------------------------------------------------
// La SECUENCIA de fases. Regla que gobierna estos tests: la secuencia es un
// extra, y un extra roto nunca puede tirar los dos numeros. La forma exigida es
// la misma del CHECK servicios_fases_forma de la base de datos.
// ---------------------------------------------------------------------------

const SECUENCIA = [
  { tipo: 'activa', min: 25, etiqueta: 'Aplicacion' },
  { tipo: 'reposo', min: 35 },
  { tipo: 'activa', min: 15, etiqueta: 'Lavado y peinado' },
];

Deno.test('una secuencia buena pasa y el resumen sale del primer reposo', () => {
  const r = sanear({ ...base, fases: SECUENCIA }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.fases?.length, 3);
  assertEquals(r.fases?.[1].tipo, 'reposo');
  // duracion_espera_min MANDA la secuencia (35 = reposo de la plantilla), no el
  // numero suelto que dijo el modelo: el resumen no puede contradecir a la
  // plantilla.
  assertEquals(r.duracion_espera_min, 35);
});

Deno.test('el resumen se recalcula aunque el modelo dijera otro numero', () => {
  const r = sanear({ ...base, duracion_espera_min: 20, fases: SECUENCIA }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.duracion_espera_min, 35);
});

Deno.test('secuencia sin reposo pone el resumen a 0', () => {
  const r = sanear({
    ...base,
    duracion_espera_min: 35,
    fases: [{ tipo: 'activa', min: 30 }, { tipo: 'transicion', min: 10 }, { tipo: 'activa', min: 20 }],
  }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.duracion_espera_min, 0);
});

Deno.test('dos reposos seguidos tumban la secuencia, no la propuesta', () => {
  const r = sanear({
    ...base,
    fases: [{ tipo: 'activa', min: 20 }, { tipo: 'reposo', min: 30 }, { tipo: 'reposo', min: 10 }, { tipo: 'activa', min: 15 }],
  }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.fases, null);
  assertEquals(r.duracion_espera_min, 35, 'el numero suelto se conserva');
});

Deno.test('todo reposo, o sin trabajo, no es una plantilla', () => {
  const todoReposo = sanear({ ...base, fases: [{ tipo: 'reposo', min: 30 }] }, conocidos);
  assert(!('descartada' in todoReposo));
  assertEquals(todoReposo.fases, null);
});

Deno.test('minutos y etiquetas fuera de regla tumban la secuencia', () => {
  for (const fases of [
    [{ tipo: 'activa', min: 0 }],
    [{ tipo: 'activa', min: 301 }],
    [{ tipo: 'activa', min: '99999999999' }],
    [{ tipo: 'activa', min: 20, etiqueta: 'x'.repeat(41) }],
    [{ tipo: 'vuelo', min: 20 }],
    // 13 fases: el CHECK admite hasta 12
    Array.from({ length: 13 }, () => ({ tipo: 'activa', min: 1 })),
    // suma > 600
    [{ tipo: 'activa', min: 300 }, { tipo: 'reposo', min: 301 }],
  ]) {
    const r = sanear({ ...base, fases }, conocidos);
    assert(!('descartada' in r), `la propuesta entera no cae: ${JSON.stringify(fases)}`);
    assertEquals(r.fases, null, `la secuencia debe caer: ${JSON.stringify(fases)}`);
  }
});

Deno.test('un reposo de la secuencia mayor que 120 tumba la secuencia', () => {
  // El CHECK de la tabla admite reposos de hasta 300, pero el resumen (que
  // guarda la RPC) esta acotado a 120: una secuencia cuyo resumen no cupiera
  // no sale del saneador.
  const r = sanear({
    ...base,
    fases: [{ tipo: 'activa', min: 20 }, { tipo: 'reposo', min: 150 }, { tipo: 'activa', min: 15 }],
  }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.fases, null);
  assertEquals(r.duracion_espera_min, 35, 'el numero suelto original se queda');
});

Deno.test('un recurso inventado en una fase se limpia, la fase sigue', () => {
  const r = sanear({
    ...base,
    fases: [{ tipo: 'activa', min: 20, recurso_tipo: 'secador-magico' }, { tipo: 'reposo', min: 30 }],
  }, conocidos);
  assert(!('descartada' in r));
  assertEquals(r.fases?.[0].recurso_tipo, null);
});

Deno.test('sanearFases directo: null y basura no revientan', () => {
  assertEquals(sanearFases(null), null);
  assertEquals(sanearFases(undefined), null);
  assertEquals(sanearFases('texto'), null);
  assertEquals(sanearFases([]), null);
  assertEquals(sanearFases({}), null);
});
