import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DENOMINACIONES_EUR,
  etiquetaDenominacion,
  euros,
  gravedadDescuadre,
  resumenDeCierre,
  textoDescuadre,
  totalContado,
} from './sesionCaja.ts';

Deno.test('el conteo suma billetes y monedas', () => {
  // 2 de 50 + 1 de 20 + 3 de 2 + 4 de 0,50 = 100 + 20 + 6 + 2 = 128 EUR
  const total = totalContado({ 5000: 2, 2000: 1, 200: 3, 50: 4 });
  assertEquals(total, 12800);
});

Deno.test('una caja vacia suma cero', () => {
  assertEquals(totalContado({}), 0);
});

Deno.test('las cantidades absurdas no cuentan', () => {
  // Un campo vacio o en negativo no puede restar dinero del arqueo.
  assertEquals(totalContado({ 5000: 0, 2000: -3, 100: 2 }), 200);
});

Deno.test('el euro con el que se cuenta es el de verdad', () => {
  // Sin billete de 500 (ya no se emite) y con las ocho monedas.
  assertEquals(DENOMINACIONES_EUR.includes(50000), true);
  assertEquals(DENOMINACIONES_EUR.includes(1), true);
  assertEquals(DENOMINACIONES_EUR.length, 15);
  // De mayor a menor, que es como se cuenta.
  const ordenado = [...DENOMINACIONES_EUR].sort((a, b) => b - a);
  assertEquals([...DENOMINACIONES_EUR], ordenado);
});

Deno.test('cuadrar es cuadrar', () => {
  assertEquals(gravedadDescuadre(0), 'cuadra');
  assertEquals(textoDescuadre(0), 'La caja cuadra.');
});

Deno.test('hasta 5 EUR es un despiste; mas, no', () => {
  assertEquals(gravedadDescuadre(-500), 'leve');
  assertEquals(gravedadDescuadre(-501), 'grave');
  assertEquals(gravedadDescuadre(2000), 'grave');
});

Deno.test('sobrar tambien es descuadrar', () => {
  // Que sobre dinero no es buena noticia: significa que algo no se apunto.
  assertEquals(gravedadDescuadre(1500), 'grave');
  assertEquals(textoDescuadre(1500), 'Sobran 15,00 €.');
  assertEquals(textoDescuadre(-2050), 'Faltan 20,50 €.');
});

Deno.test('el resumen del cierre trae ya el veredicto', () => {
  const r = resumenDeCierre({
    numero_z: 7,
    fondo_inicial_cents: 15000,
    teorico_efectivo_cents: 19000,
    contado_efectivo_cents: 17000,
    descuadre_cents: -2000,
  });

  assertEquals(r.numeroZ, 7);
  assertEquals(r.gravedad, 'grave');
  assertEquals(r.texto, 'Faltan 20,00 €.');
});

Deno.test('los euros se escriben como en España', () => {
  assertEquals(euros(12850), '128,50 €');
  assertEquals(euros(0), '0,00 €');
  assertEquals(euros(null), '—');
});

Deno.test('las denominaciones se llaman como en el cajon', () => {
  assertEquals(etiquetaDenominacion(5000), '50 €');
  assertEquals(etiquetaDenominacion(100), '1 €');
  assertEquals(etiquetaDenominacion(20), '20 cent');
});
