import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { recomendarProductosHomecare, type DiagnosticoCapilarEntrada } from './recomendarHomecare.ts';

Deno.test('balayage + cabello fragil recomienda mascarilla plex y protector termico', () => {
  const d: DiagnosticoCapilarEntrada = {
    clienteId: 'c1',
    porosidad: 'media',
    elasticidad: 'fragil',
    servicioRealizado: 'Balayage Premium',
  };
  const recs = recomendarProductosHomecare(d);
  assertEquals(recs.length, 2);
  assertEquals(recs.some(r => r.id === 'prod-plex-repair'), true);
  assertEquals(recs.some(r => r.id === 'prod-protector-termico'), true);
});

Deno.test('porosidad alta recomienda serum sellador', () => {
  const d: DiagnosticoCapilarEntrada = {
    clienteId: 'c2',
    porosidad: 'alta',
    elasticidad: 'normal',
    servicioRealizado: 'Corte + Tinte',
  };
  const recs = recomendarProductosHomecare(d);
  assertEquals(recs.length, 1);
  assertEquals(recs[0].id, 'prod-serum-sellador');
});

Deno.test('cabello normal recomienda champu neutro por defecto', () => {
  const d: DiagnosticoCapilarEntrada = {
    clienteId: 'c3',
    porosidad: 'media',
    elasticidad: 'excelente',
    servicioRealizado: 'Corte Caballero',
  };
  const recs = recomendarProductosHomecare(d);
  assertEquals(recs.length, 1);
  assertEquals(recs[0].id, 'prod-champu-neutro');
});
