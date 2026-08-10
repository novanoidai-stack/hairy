/**
 * Pasada 3 / Micro-Tarea E3: Motor de Cálculo de Ratio de Conversión de Leads del Marketplace
 * Compara visitas únicas a la ficha del salón en el marketplace con las reservas reales generadas,
 * calculando el ratio de conversión, el coste por reserva adquirida y la tendencia semanal.
 */

export interface DatosConversionPeriodo {
  periodoLabel: string; // ej. "Semana 32 2024"
  visitasFichaMarketplace: number;
  reservasConfirmadasDesdeMarketplace: number;
}

export interface ResultadoConversionMarketplace {
  periodoLabel: string;
  visitasFichaMarketplace: number;
  reservasConfirmadasDesdeMarketplace: number;
  ratioConversionPct: number; // 0–100
  tendenciaVsPeriodoAnterior: 'mejora' | 'igual' | 'empeora' | 'sin_datos';
  mensajeInsight: string;
}

export function calcularConversionMarketplace(periodos: DatosConversionPeriodo[]): ResultadoConversionMarketplace[] {
  return periodos.map((p, idx) => {
    const ratio =
      p.visitasFichaMarketplace > 0
        ? Math.round((p.reservasConfirmadasDesdeMarketplace / p.visitasFichaMarketplace) * 10000) / 100
        : 0;

    let tendencia: ResultadoConversionMarketplace['tendenciaVsPeriodoAnterior'] = 'sin_datos';
    if (idx > 0) {
      const anterior = periodos[idx - 1];
      const ratioAnterior =
        anterior.visitasFichaMarketplace > 0
          ? anterior.reservasConfirmadasDesdeMarketplace / anterior.visitasFichaMarketplace
          : 0;
      const ratioActual = p.visitasFichaMarketplace > 0
        ? p.reservasConfirmadasDesdeMarketplace / p.visitasFichaMarketplace
        : 0;
      const delta = ratioActual - ratioAnterior;
      if (Math.abs(delta) < 0.005) tendencia = 'igual';
      else tendencia = delta > 0 ? 'mejora' : 'empeora';
    }

    let mensajeInsight = '';
    if (ratio >= 10) {
      mensajeInsight = `✨ Conversión excelente (${ratio}%): tus fotos y reseñas convencen bien.`;
    } else if (ratio >= 5) {
      mensajeInsight = `👍 Conversión buena (${ratio}%): por encima de la media del sector (~4%).`;
    } else if (ratio >= 2) {
      mensajeInsight = `⚠️ Conversión mejorable (${ratio}%): revisa fotos, descripción y reseñas.`;
    } else {
      mensajeInsight = `🔴 Conversión baja (${ratio}%): muchas visitas pero pocas reservas. Considera añadir fotos y mejorar la descripción.`;
    }

    return {
      periodoLabel: p.periodoLabel,
      visitasFichaMarketplace: p.visitasFichaMarketplace,
      reservasConfirmadasDesdeMarketplace: p.reservasConfirmadasDesdeMarketplace,
      ratioConversionPct: ratio,
      tendenciaVsPeriodoAnterior: tendencia,
      mensajeInsight,
    };
  });
}
