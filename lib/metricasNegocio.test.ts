// Bateria de tests de COHERENCIA de metricas de negocio.
//
// Objetivo: garantizar que lib/metricasNegocio.ts (la fuente unica de verdad)
// calcula ingresos/propinas/tickets/desgloses de forma determinista. Como todas
// las paginas (Mi Jornada, Caja, Informes, Equipo) llaman ahora a estas mismas
// funciones, si estos tests pasan las cifras cuadran entre pantallas.
//
// Ejecutar:  deno task test   (o)   deno test --allow-read --sloppy-imports
import {
  ingresosRealesCents,
  propinasCents,
  numCobros,
  ticketMedioCents,
  desglosePorMetodoCents,
  desglosePorCanalCents,
  ingresosPrevistosCents,
  esCobroEnRango,
} from './metricasNegocio.ts';
import { esActiva } from './citasMetrics.ts';
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@0.224.0';

// --- Datos de prueba fijos (mes de marzo 2026) ---
const MARZO_DESDE = new Date('2026-03-01T00:00:00Z');
const MARZO_HASTA = new Date('2026-03-31T23:59:59Z');

const COBROS = [
  // 1. Cobro en efectivo con propina (en rango).
  { total_cents: 5000, propina_cents: 500, metodo: 'efectivo', efectivo_cents: 5000, datafono_cents: 0, online_cents: 0, estado: 'completado', cobrado_at: '2026-03-10T12:00:00Z' },
  // 2. Cobro en datafono sin propina (en rango).
  { total_cents: 3000, propina_cents: 0, metodo: 'datafono', efectivo_cents: 0, datafono_cents: 3000, online_cents: 0, estado: 'completado', cobrado_at: '2026-03-10T15:00:00Z' },
  // 3. Walk-in de producto en bizum con propina (en rango).
  { total_cents: 2000, propina_cents: 200, metodo: 'bizum', efectivo_cents: 0, datafono_cents: 0, online_cents: 2000, estado: 'completado', cobrado_at: '2026-03-12T11:00:00Z' },
  // 4. Fuera de rango (febrero): NO debe contar.
  { total_cents: 9999, propina_cents: 0, metodo: 'efectivo', efectivo_cents: 9999, datafono_cents: 0, online_cents: 0, estado: 'completado', cobrado_at: '2026-02-01T00:00:00Z' },
  // 5. No completado (pendiente): NO debe contar.
  { total_cents: 9999, propina_cents: 0, metodo: 'efectivo', efectivo_cents: 0, datafono_cents: 0, online_cents: 0, estado: 'pendiente', cobrado_at: '2026-03-11T00:00:00Z' },
];

const CITAS = [
  { estado: 'completada', inicio: '2026-03-10T12:00:00Z' },   // activa
  { estado: 'confirmada', inicio: '2026-03-11T12:00:00Z' },   // activa
  { estado: 'cancelada', inicio: '2026-03-12T12:00:00Z' },    // NO activa
  { estado: 'no_presentada', inicio: '2026-03-13T12:00:00Z' },// NO activa
  { estado: 'pendiente', inicio: '2026-03-14T12:00:00Z' },    // activa
  { estado: 'confirmada', inicio: '2026-02-05T12:00:00Z' },   // activa pero fuera de rango
];

Deno.test('ingresosRealesCents resta la propina y respeta rango/estado (cobrado_at)', () => {
  // (5000-500) + (3000-0) + (2000-200) = 4500 + 3000 + 1800 = 9300
  assertEquals(ingresosRealesCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), 9300);
});

Deno.test('ingresosRealesCents sin rango suma todo lo completado', () => {
  // Marzo (9300) + febrero (9999) = 19299; el pendiente sigue sin contar.
  assertEquals(ingresosRealesCents(COBROS), 19299);
});

Deno.test('propinasCents se suma aparte y nunca entra en ingresos reales', () => {
  assertEquals(propinasCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), 700);
  // Coherencia: real + propina == total cobrado bruto del periodo.
  const bruto = (5000 + 3000 + 2000);
  assertEquals(ingresosRealesCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }) + propinasCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), bruto);
});

Deno.test('numCobros y ticketMedio usan SOLO los cobros validos del rango', () => {
  assertEquals(numCobros(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), 3);
  // 9300 / 3 = 3100
  assertEquals(ticketMedioCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), 3100);
  // Sin cobros -> ticket 0 (no NaN, no division por cero).
  assertEquals(ticketMedioCents([]), 0);
});

Deno.test('desglosePorMetodoCents agrupa por metodo sin propina', () => {
  const d = desglosePorMetodoCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA });
  assertEquals(d.efectivo, 4500);
  assertEquals(d.datafono, 3000);
  assertEquals(d.bizum, 1800);
});

Deno.test('desglosePorCanalCents suma columnas efectivo/datafono/online', () => {
  const c = desglosePorCanalCents(COBROS, { desde: MARZO_DESDE, hasta: MARZO_HASTA });
  assertEquals(c.efectivo, 5000);
  assertEquals(c.datafono, 3000);
  assertEquals(c.online, 2000);
  assertEquals(c.propinas, 700);
});

Deno.test('esCobroEnRango excluye no-completados y fuera de rango', () => {
  assertEquals(esCobroEnRango(COBROS[0], { desde: MARZO_DESDE, hasta: MARZO_HASTA }), true);
  assertEquals(esCobroEnRango(COBROS[3], { desde: MARZO_DESDE, hasta: MARZO_HASTA }), false); // febrero
  assertEquals(esCobroEnRango(COBROS[4], { desde: MARZO_DESDE, hasta: MARZO_HASTA }), false); // pendiente
});

Deno.test('ingresosPrevistosCents solo cuenta citas activas en rango (catalogo)', () => {
  const precioFijo = () => 1000; // 10 EUR por cita
  // Activas en marzo: completada, confirmada(11), pendiente(14) = 3.
  assertEquals(ingresosPrevistosCents(CITAS, precioFijo, { desde: MARZO_DESDE, hasta: MARZO_HASTA }), 3000);
  // Sin rango: 4 activas (las 3 de marzo + la confirmada de febrero).
  assertEquals(ingresosPrevistosCents(CITAS, precioFijo), 4000);
});

Deno.test('esActiva excluye canceladas y no-show (coherencia con conteo de citas)', () => {
  assertEquals(esActiva({ estado: 'completada' }), true);
  assertEquals(esActiva({ estado: 'confirmada' }), true);
  assertEquals(esActiva({ estado: 'pendiente' }), true);
  assertEquals(esActiva({ estado: 'cancelada' }), false);
  assertEquals(esActiva({ estado: 'no_presentada' }), false);
});

Deno.test('COHERENCIA: la misma fuente devuelve el mismo numero para todas las paginas', () => {
  // Esta es la prueba clave: si Mi Jornada, Caja, Informes y Equipo llaman a
  // ingresosRealesCents con los MISMOS cobros del MISMO profesional/periodo,
  // obtienen EXACTAMENTE el mismo resultado. La coherencia vive en esta funcion.
  const unProfesional = COBROS.filter((_, i) => i < 3); // los 3 de marzo
  const rango = { desde: MARZO_DESDE, hasta: MARZO_HASTA };
  const miJornada = ingresosRealesCents(unProfesional, rango);
  const caja = ingresosRealesCents(unProfesional, rango);
  const informes = ingresosRealesCents(unProfesional, rango);
  const equipo = ingresosRealesCents(unProfesional, rango);
  assertEquals(miJornada, caja);
  assertEquals(caja, informes);
  assertEquals(informes, equipo);
  assertEquals(equipo, 9300);
  // Y none de ellos incluye la propina en el total principal.
  assertNotEquals(miJornada, 9300 + 700);
});
