import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularLayoutAgendaMovil, type DimensionesLayoutAgenda } from './optimizacionTouchAgenda.ts';

Deno.test('pantalla 375px con 4 profesionales activa scroll horizontal y mantiene 120px por columna', () => {
  const d: DimensionesLayoutAgenda = {
    anchoPantallaPx: 375,
    numProfesionales: 4,
    anchoColumnaHorasPx: 50,
  };
  const res = calcularLayoutAgendaMovil(d);
  assertEquals(res.anchoColumnaProfesionalPx, 120);
  assertEquals(res.requiereScrollHorizontal, true);
  assertEquals(res.columnasVisiblesSimultaneas, 2); // 325px / 120px = 2 columnas
  assertEquals(res.anchoTotalGridPx, 530); // 50 + 4*120 = 530px
});

Deno.test('pantalla 375px con 2 profesionales no requiere scroll horizontal', () => {
  const d: DimensionesLayoutAgenda = {
    anchoPantallaPx: 375,
    numProfesionales: 2,
    anchoColumnaHorasPx: 50,
  };
  const res = calcularLayoutAgendaMovil(d);
  assertEquals(res.requiereScrollHorizontal, false);
  assertEquals(res.anchoColumnaProfesionalPx, 162); // (375-50)/2 = 162px
  assertEquals(res.columnasVisiblesSimultaneas, 2);
});
