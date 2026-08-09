/**
 * Micro-Tarea C15: Algoritmo de Ranking y Reordenación Transparente para Marketplace Mecha
 * Ordena salones verificando puntuación ponderada por número de reseñas reales (Bayesian Average).
 */

export interface SalonMarketplaceItem {
  id: string;
  nombre: string;
  puntuacionMedia: number; // 1-5
  totalResenas: number;
  esMechaVerificado: boolean;
  distanciaKm?: number;
}

export function calcularScoreRanking(s: SalonMarketplaceItem, m: number = 5, C: number = 4.5): number {
  // Bayesian Average: (v*R + m*C) / (v + m)
  // v = totalResenas, R = puntuacionMedia, m = peso minimo de resenas (5), C = media global (4.5)
  const v = Math.max(s.totalResenas || 0, 0);
  const R = s.puntuacionMedia || 0;
  
  const bayesianScore = (v * R + m * C) / (v + m);

  // Bonus +0.5 por ser salon Mecha verificado (con reserva directa)
  const bonusMecha = s.esMechaVerificado ? 0.5 : 0;

  // Penalización por distancia si existe
  const penaltyDistancia = s.distanciaKm ? Math.min(s.distanciaKm * 0.05, 1.0) : 0;

  const scoreFinal = Math.round((bayesianScore + bonusMecha - penaltyDistancia) * 100) / 100;
  return scoreFinal;
}

export function ordenarSalonesMarketplace(salones: SalonMarketplaceItem[]): SalonMarketplaceItem[] {
  return [...salones].sort((a, b) => calcularScoreRanking(b) - calcularScoreRanking(a));
}
