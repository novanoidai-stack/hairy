import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  costeDeMezcla,
  costeUnidadMicros,
  desgloseEnvases,
  formatearCostePorUnidad,
  margenDeServicio,
  type ProductoEscandallo,
} from './escandallo.ts';

// Tubo de 60 g que cuesta 8,50 EUR al salon.
const tinte: ProductoEscandallo = {
  id: 'p1',
  nombre: 'Tinte 7.1',
  unidad_medida: 'gramos',
  capacidad_envase: 60,
  coste_envase_cents: 850,
};

// Garrafa de oxidante de 1 L a 6,80 EUR.
const oxidante: ProductoEscandallo = {
  id: 'p2',
  nombre: 'Oxidante 20 vol',
  unidad_medida: 'mililitros',
  capacidad_envase: 1000,
  coste_envase_cents: 680,
};

const sinTarifa: ProductoEscandallo = {
  id: 'p3',
  nombre: 'Plex sin datos',
  unidad_medida: 'mililitros',
  capacidad_envase: null,
  coste_envase_cents: null,
};

Deno.test('el gramo de tinte sale a 0,1417 EUR', () => {
  // 8,50 / 60 = 0,141666... Se guarda en micros para no perderlo al redondear.
  assertEquals(costeUnidadMicros(tinte), 141667);
  assertEquals(formatearCostePorUnidad(costeUnidadMicros(tinte), 'gramos'), '0,1417 €/g');
});

Deno.test('un producto sin envase ni coste no se inventa un precio', () => {
  assertEquals(costeUnidadMicros(sinTarifa), null);
  assertEquals(formatearCostePorUnidad(null, 'mililitros'), 'sin tarifar');
});

Deno.test('una raiz de 50 g mas 75 ml de oxidante cuesta 7,59 EUR', () => {
  const { totalMicros, sinTarifar } = costeDeMezcla([
    { producto: tinte, cantidad: 50 },
    { producto: oxidante, cantidad: 75 },
  ]);

  // 50 x 141667 + 75 x 6800 = 7083350 + 510000 = 7593350 micros = 7,59 EUR
  assertEquals(totalMicros, 7593350);
  assertEquals(Math.round(totalMicros / 10000), 759);
  assertEquals(sinTarifar, []);
});

Deno.test('lo que no se puede tarifar se dice, no se cuenta como cero', () => {
  // Contarlo como gratis enseñaria un margen buenisimo por falta de datos.
  const { totalMicros, sinTarifar } = costeDeMezcla([
    { producto: tinte, cantidad: 50 },
    { producto: sinTarifa, cantidad: 10 },
  ]);
  assertEquals(sinTarifar, ['Plex sin datos']);
  assertEquals(totalMicros, 50 * 141667);
});

Deno.test('75 g con tubos de 60 son un tubo cerrado y 15 sueltos', () => {
  assertEquals(desgloseEnvases(75, 60), { cerrados: 1, abierto: 15 });
});

Deno.test('sin capacidad de envase no hay envases que contar', () => {
  assertEquals(desgloseEnvases(75, null), null);
  assertEquals(desgloseEnvases(75, 0), null);
});

Deno.test('un stock en negativo no inventa envases', () => {
  // Puede pasar si alguien apunta un consumo mayor que lo que habia.
  assertEquals(desgloseEnvases(-20, 60), { cerrados: 0, abierto: 0 });
});

Deno.test('el margen de una cobertura de 38 EUR descuenta producto y comision', () => {
  const m = margenDeServicio({
    cobradoCents: 3800,
    costeProductoMicros: 7593350, // 7,59 EUR
    comisionCents: 570,           // 15% de comision
  });

  assertEquals(m.costeProductoCents, 759);
  assertEquals(m.margenCents, 3800 - 759 - 570);
  assertEquals(m.margenPct, 65.0);
});

Deno.test('sin comision el margen es lo cobrado menos el producto', () => {
  const m = margenDeServicio({ cobradoCents: 3800, costeProductoMicros: 7593350 });
  assertEquals(m.comisionCents, 0);
  assertEquals(m.margenCents, 3041);
});

Deno.test('un servicio gratis no divide entre cero', () => {
  const m = margenDeServicio({ cobradoCents: 0, costeProductoMicros: 7593350 });
  assertEquals(m.margenPct, null);
  assertEquals(m.margenCents, -759);
});
