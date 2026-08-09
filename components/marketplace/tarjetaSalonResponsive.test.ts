import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularLayoutTarjetaSalon, type DatosTarjetaSalon } from './tarjetaSalonResponsive.ts';

Deno.test('viewport 375px conmuta tarjeta a columna para evitar desbordamiento', () => {
  const d: DatosTarjetaSalon = {
    anchoViewportPx: 375,
    nombreSalon: 'Peluquería & Estética Mecha Central',
    badges: ['Mecha Verificado', 'Parking Gratuito'],
  };
  const res = calcularLayoutTarjetaSalon(d);
  assertEquals(res.flexDirection, 'column');
  assertEquals(res.esCompacto, true);
  assertEquals(res.anchoImagenPx, 343); // 375 - 32 = 343px
});

Deno.test('viewport escritorio (800px) mantiene diseño en fila con imagen lateral', () => {
  const d: DatosTarjetaSalon = {
    anchoViewportPx: 800,
    nombreSalon: 'Salón Mecha Premium',
    badges: ['Mecha Verificado'],
  };
  const res = calcularLayoutTarjetaSalon(d);
  assertEquals(res.flexDirection, 'row');
  assertEquals(res.esCompacto, false);
  assertEquals(res.anchoImagenPx, 220);
});
