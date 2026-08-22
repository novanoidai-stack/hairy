import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aplicarCambioCita, type ContextoMezcla } from './citasRealtime.ts';

// Ventana cargada: todo agosto de 2026.
const ctx: ContextoMezcla = {
  dentroDeVentana: (iso) =>
    !!iso && iso >= '2026-08-01T00:00:00Z' && iso <= '2026-08-31T23:59:59Z',
  verCanceladas: false,
};

const cita = (id: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  id,
  inicio,
  oculta_en_calendario: false,
  ...extra,
});

Deno.test('una cita nueva dentro de la ventana entra en la lista', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'INSERT',
    fila: cita('b', '2026-08-11T09:00:00Z'),
  }, ctx);

  assertEquals(res.length, 2);
  assertEquals(res[1].id, 'b');
});

Deno.test('una cita fuera de la ventana cargada no se cuela', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'INSERT',
    fila: cita('z', '2026-12-01T09:00:00Z'),
  }, ctx);

  assertStrictEquals(res, previas);
});

Deno.test('el INSERT de una cita que ya esta cargada no la duplica', () => {
  // La pestaña que crea la cita se la añade al estado al instante; el evento de
  // Realtime llega despues y llega tarde.
  const previas = [cita('a', '2026-08-10T10:00:00Z', { estado: 'pendiente' })];
  const res = aplicarCambioCita(previas, {
    tipo: 'INSERT',
    fila: cita('a', '2026-08-10T10:00:00Z', { estado: 'confirmada' }),
  }, ctx);

  assertEquals(res.length, 1);
  assertEquals(res[0].estado, 'confirmada');
});

Deno.test('un UPDATE conserva los campos que el evento no trae', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z', { notas: 'alergia PPD', cobrada: true })];
  const res = aplicarCambioCita(previas, {
    tipo: 'UPDATE',
    fila: { id: 'a', inicio: '2026-08-10T12:00:00Z', oculta_en_calendario: false },
  }, ctx);

  assertEquals(res[0].inicio, '2026-08-10T12:00:00Z');
  assertEquals(res[0].notas, 'alergia PPD');
  assertEquals(res[0].cobrada, true);
});

Deno.test('cancelar una cita la retira si el salon no mira las canceladas', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z'), cita('b', '2026-08-11T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'UPDATE',
    fila: cita('a', '2026-08-10T10:00:00Z', { oculta_en_calendario: true }),
  }, ctx);

  assertEquals(res.map((c) => c.id), ['b']);
});

Deno.test('con el interruptor de canceladas encendido, la cancelada se queda', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'UPDATE',
    fila: cita('a', '2026-08-10T10:00:00Z', { oculta_en_calendario: true }),
  }, { ...ctx, verCanceladas: true });

  assertEquals(res.length, 1);
  assertEquals(res[0].oculta_en_calendario, true);
});

Deno.test('mover una cita fuera de la ventana la saca de la agenda', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'UPDATE',
    fila: cita('a', '2027-01-05T10:00:00Z'),
  }, ctx);

  assertEquals(res.length, 0);
});

Deno.test('el borrado quita la cita', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z'), cita('b', '2026-08-11T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'DELETE',
    fila: null,
    filaAnterior: { id: 'b' },
  }, ctx);

  assertEquals(res.map((c) => c.id), ['a']);
});

Deno.test('un borrado de un id que no teniamos se ignora', () => {
  // Los DELETE llegan sin filtro de negocio: solo se hace caso de lo ya cargado.
  const previas = [cita('a', '2026-08-10T10:00:00Z')];
  const res = aplicarCambioCita(previas, {
    tipo: 'DELETE',
    fila: null,
    filaAnterior: { id: 'de-otro-salon' },
  }, ctx);

  assertStrictEquals(res, previas);
});

Deno.test('si no hay nada que cambiar se devuelve el mismo array', () => {
  const previas = [cita('a', '2026-08-10T10:00:00Z', { oculta_en_calendario: true })];
  const res = aplicarCambioCita(previas, {
    tipo: 'UPDATE',
    fila: cita('otra', '2026-08-12T10:00:00Z', { oculta_en_calendario: true }),
  }, ctx);

  assertStrictEquals(res, previas);
});
