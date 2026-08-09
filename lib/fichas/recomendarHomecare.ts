/**
 * Micro-Tarea C11: Motor de Recomendación Automatizada de Productos Homecare segun Diagnóstico Capilar
 */

export interface DiagnosticoCapilarEntrada {
  clienteId: string;
  porosidad: 'baja' | 'media' | 'alta';
  elasticidad: 'excelente' | 'normal' | 'fragil' | 'quebradizo';
  servicioRealizado: string; // ej. "Balayage + Olaplex"
}

export interface ProductoRecomendado {
  id: string;
  nombre: string;
  categoria: 'champú' | 'mascarilla' | 'sérum' | 'protector_térmico';
  razon: string;
  precioSugerido: number;
}

export function recomendarProductosHomecare(d: DiagnosticoCapilarEntrada): ProductoRecomendado[] {
  const recomendaciones: ProductoRecomendado[] = [];

  if (d.elasticidad === 'quebradizo' || d.elasticidad === 'fragil') {
    recomendaciones.push({
      id: 'prod-plex-repair',
      nombre: 'Mascarilla Reparadora de Enlaces (Bond Repair)',
      categoria: 'mascarilla',
      razon: 'Restauración de puentes disulfuro para cabello frágil o quebradizo',
      precioSugerido: 28.50,
    });
  }

  if (d.porosidad === 'alta') {
    recomendaciones.push({
      id: 'prod-serum-sellador',
      nombre: 'Sérum Sellador de Cutícula pH Ácido',
      categoria: 'sérum',
      razon: 'Sellado de la cutícula para retener el pigmento de color y la humedad',
      precioSugerido: 24.00,
    });
  }

  if (d.servicioRealizado.toLowerCase().includes('balayage') || d.servicioRealizado.toLowerCase().includes('decoloracion')) {
    recomendaciones.push({
      id: 'prod-protector-termico',
      nombre: 'Spray Protector Térmico e UV',
      categoria: 'protector_térmico',
      razon: 'Protección contra herramientas de calor y radiación solar en cabellos aclarados',
      precioSugerido: 19.90,
    });
  }

  if (recomendaciones.length === 0) {
    recomendaciones.push({
      id: 'prod-champu-neutro',
      nombre: 'Champú Hidratante de Uso Frecuente sin Sulfatos',
      categoria: 'champú',
      razon: 'Mantenimiento diario de hidratación y brillo',
      precioSugerido: 18.00,
    });
  }

  return recomendaciones;
}
