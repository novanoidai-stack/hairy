import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularGridSlotsPortal } from './optimizacionTouchPortal.ts';

Deno.test('pantalla 375px genera grid de 3 columnas touch accesibles (>=44px)', () => {
  const res = calcularGridSlotsPortal(375);
  assertEquals(res.columnasGrid, 3);
  assertEquals(res.altoBotonPx >= 44, true);
  assertEquals(res.esTouchAccessible, true);
  assertEquals(res.anchoBotonPx >= 100, true);
});

Deno.test('pantalla escritorio (>400px) genera grid de 4 columnas', () => {
  const res = calcularGridSlotsPortal(600);
  assertEquals(res.columnasGrid, 4);
  assertEquals(res.esTouchAccessible, true);
});
