/**
 * Micro-Tarea C9: Generador y Validador de Encadenamiento de Hash Inmutable VeriFactu (Ley Antifraude Española)
 */

export interface FacturaVeriFactu {
  numeroFactura: string;
  fechaEmision: string; // ISO 8601
  cifEmisor: string;
  totalEuros: number;
  hashAnterior: string; // Hash de la factura inmediatamente anterior en la serie
}

/**
 * Calcula el hash SHA-256 encadenado para la factura cumpliendo la especificación VeriFactu.
 */
export async function calcularHashVeriFactu(f: FacturaVeriFactu): Promise<string> {
  const payload = `${f.cifEmisor}|${f.numeroFactura}|${f.fechaEmision}|${f.totalEuros.toFixed(2)}|${f.hashAnterior}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);

  // Usar Crypto API del entorno (browser / Deno / Node)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica si el hash presentado coincide exactamente con el cálculo atómico de la factura.
 */
export async function verificarEncadenamientoVeriFactu(f: FacturaVeriFactu, hashEsperado: string): Promise<boolean> {
  const hashCalculado = await calcularHashVeriFactu(f);
  return hashCalculado.toLowerCase() === hashEsperado.toLowerCase();
}
