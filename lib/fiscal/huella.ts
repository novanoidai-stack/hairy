/**
 * lib/fiscal/huella.ts
 * Utilidades para calcular la huella y encadenamiento VeriFactu.
 */

// Si estamos en Node o React Native/Expo, el entorno puede variar.
// Usaremos un digest isomorfo. Para simplificar, usamos WebCrypto
// que esta disponible en Deno (Edge), Node >= 18 y navegadores.

export async function calcularHuella(params: {
  idEmisor: string;
  numSerieFactura: string;
  fechaExpedicion: string; // DD-MM-YYYY
  tipoFactura: string;     // F1, F2...
  cuotaTotal: string;      // p.ej. "12.35"
  importeTotal: string;    // p.ej. "123.45"
  huellaAnterior: string;  // vacio si es la primera
  fechaHoraRegistro: string; // ISO8601 con huso (+01:00)
}): Promise<string> {
  const cadena = `IDEmisorFactura=${params.idEmisor}&NumSerieFactura=${params.numSerieFactura}&FechaExpedicionFactura=${params.fechaExpedicion}&TipoFactura=${params.tipoFactura}&CuotaTotal=${params.cuotaTotal}&ImporteTotal=${params.importeTotal}&Huella=${params.huellaAnterior}&FechaHoraHusoGenRegistro=${params.fechaHoraRegistro}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(cadena);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex.toUpperCase();
}
