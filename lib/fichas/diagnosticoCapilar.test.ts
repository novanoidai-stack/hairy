import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluarPruebaMechon, type PruebaMechon } from './diagnosticoCapilar.ts';

Deno.test('cabello saludable con buena elasticidad es apto para decolorar', () => {
  const p: PruebaMechon = {
    clienteId: 'c1',
    porosidad: 'media',
    elasticidad: 'excelente',
    historialDecoloracion: false,
    tonosAclaradosDeseados: 4,
  };
  const res = evaluarPruebaMechon(p);
  assertEquals(res.aptoParaDecolorar, true);
  assertEquals(res.advertencias.length, 0);
});

Deno.test('cabello quebradizo desaconseja decoloracion e impone reconstruccion', () => {
  const p: PruebaMechon = {
    clienteId: 'c2',
    porosidad: 'alta',
    elasticidad: 'quebradizo',
    historialDecoloracion: true,
    tonosAclaradosDeseados: 3,
  };
  const res = evaluarPruebaMechon(p);
  assertEquals(res.aptoParaDecolorar, false);
  assertEquals(res.advertencias.length, 2);
  assertEquals(res.tratamientoRecomendado.includes('Plex'), true);
});
