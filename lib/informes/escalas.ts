// Escalas y etiquetado de ejes. Vive en lib/ y no dentro del componente para
// poder probarlo con `deno test` sin arrastrar React.
//
// Motivo de existir: el eje Y se pintaba con max / max/2 / 0, así que en una
// gráfica de ingresos salían marcas como "1,7k" y "833". El ojo no lee eso. Y el
// eje X tenía tres etiquetas fijas, con lo que en un mes por días era imposible
// situar un pico en el calendario.

/**
 * Escala con números redondos: el paso siempre es 1, 2 o 5 por una potencia de
 * 10. `enteros` fuerza pasos de al menos 1 para que en una gráfica de citas no
 * aparezca "2,5 citas".
 */
export function escalaBonita(
  maxDato: number,
  opts: { objetivoTicks?: number; enteros?: boolean } = {},
): { max: number; ticks: number[] } {
  const { objetivoTicks = 4, enteros = false } = opts;
  if (!Number.isFinite(maxDato) || maxDato <= 0) return { max: 1, ticks: [0, 1] };

  const bruto = maxDato / Math.max(1, objetivoTicks - 1);
  const exp = Math.floor(Math.log10(bruto));
  const base = Math.pow(10, exp);
  const norm = bruto / base;
  let paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * base;
  if (enteros) paso = Math.max(1, Math.round(paso));

  const max = Math.ceil(maxDato / paso) * paso;
  const ticks: number[] = [];
  // El +paso/2 evita perder el último tick por error de coma flotante.
  for (let v = 0; v <= max + paso / 2; v += paso) ticks.push(Number(v.toFixed(6)));
  return { max, ticks };
}

/**
 * Índices de los puntos que llevan etiqueta en el eje X, repartidos de forma
 * uniforme e incluyendo siempre el primero y el último.
 */
export function indicesEtiquetasX(n: number, maxEtiquetas = 7): number[] {
  if (n <= 0) return [];
  if (maxEtiquetas < 2) return [0];
  if (n <= maxEtiquetas) return Array.from({ length: n }, (_, i) => i);
  const paso = (n - 1) / (maxEtiquetas - 1);
  const idx = new Set<number>();
  for (let k = 0; k < maxEtiquetas; k++) idx.add(Math.round(k * paso));
  return Array.from(idx).sort((a, b) => a - b);
}
