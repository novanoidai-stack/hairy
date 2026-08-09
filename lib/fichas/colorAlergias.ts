/**
 * Módulo Técnico de Fórmulas de Color y Alergias en Ficha de Cliente
 */

export interface FormulaColor {
  clienteId: string;
  fecha: string;
  profesionalId: string;
  marcaProducto: string;
  tono: string; // ej. "7.3 Rubio Dorado"
  volumenesOxigenada: number; // ej. 10, 20, 30, 40
  tiempoExposicionMin: number;
  sensibilidadCueroCabelludo: boolean;
  alergiasRegistradas?: string[];
}

export interface DiagnosticoSeguridadColor {
  apto: boolean;
  alertas: string[];
  requierePruebaAlergia: boolean;
}

export function evaluarSeguridadFormula(f: FormulaColor): DiagnosticoSeguridadColor {
  const alertas: string[] = [];
  let requierePruebaAlergia = false;

  if (f.alergiasRegistradas && f.alergiasRegistradas.length > 0) {
    alertas.push(`Cliente con alergias declaradas: ${f.alergiasRegistradas.join(', ')}`);
    requierePruebaAlergia = true;
  }

  if (f.sensibilidadCueroCabelludo && f.volumenesOxigenada >= 30) {
    alertas.push(`Atención: Sensibilidad en cuero cabelludo combinada con agua de ${f.volumenesOxigenada} vol. Se recomienda reducir a 20 vol.`);
  }

  if (f.tiempoExposicionMin > 45) {
    alertas.push(`Tiempo de exposición (${f.tiempoExposicionMin} min) excede el máximo recomendado de 45 min.`);
  }

  if (f.volumenesOxigenada >= 40) {
    alertas.push('Uso de 40 vol requiere supervisión constante del estilista.');
  }

  return {
    apto: alertas.length === 0,
    alertas,
    requierePruebaAlergia,
  };
}
