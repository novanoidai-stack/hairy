import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcularScoreRanking, ordenarSalonesMarketplace, type SalonMarketplaceItem } from './rankingMarketplace.ts';

Deno.test('salon Mecha verificado recibe bonus de ranking', () => {
  const s1: SalonMarketplaceItem = {
    id: '1',
    nombre: 'Salón Mecha Directo',
    puntuacionMedia: 4.8,
    totalResenas: 20,
    esMechaVerificado: true,
  };
  const s2: SalonMarketplaceItem = {
    id: '2',
    nombre: 'Salón Externo',
    puntuacionMedia: 4.8,
    totalResenas: 20,
    esMechaVerificado: false,
  };

  const score1 = calcularScoreRanking(s1);
  const score2 = calcularScoreRanking(s2);

  assertEquals(score1 > score2, true);
});

Deno.test('bayesian average evita que 1 sola resena de 5.0 gane a 50 resenas de 4.8', () => {
  const sUnicaResena: SalonMarketplaceItem = {
    id: '1',
    nombre: 'Salón 1 reseña',
    puntuacionMedia: 5.0,
    totalResenas: 1,
    esMechaVerificado: false,
  };
  const sMuchasResenas: SalonMarketplaceItem = {
    id: '2',
    nombre: 'Salón Consolidado',
    puntuacionMedia: 4.8,
    totalResenas: 50,
    esMechaVerificado: false,
  };

  const salones = [sUnicaResena, sMuchasResenas];
  const ordenados = ordenarSalonesMarketplace(salones);

  assertEquals(ordenados[0].id, '2'); // El consolidado debe ganar
});
