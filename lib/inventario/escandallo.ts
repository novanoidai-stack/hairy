// Escandallo: lo que cuesta de verdad el producto que se gasta en una clienta.
//
// El inventario contaba unidades enteras, y eso vale para el champu que se
// vende, no para la zona tecnica: un tinte se gasta en gramos. Hasta que no se
// sabe cuantos gramos han entrado en una cobertura de canas no se puede decir
// que margen deja.
//
// Los costes se llevan en MICROS (millonesimas de euro) y no en centimos. Un
// gramo de tinte cuesta del orden de 0,1417 EUR: redondeado a centimos serian
// 0,14 y una mezcla de 50 g se iria casi un 2% -- y en decoloraciones de 200 g,
// mucho mas. Solo se redondea a la hora de enseñarlo.

export type UnidadMedida = 'unidades' | 'gramos' | 'mililitros';

export type ProductoEscandallo = {
  id: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  /** Cantidad de unidad base por envase: 60 g un tubo, 1000 ml una garrafa. */
  capacidad_envase?: number | null;
  /** Lo que cuesta comprar UN envase, sin IVA, en centimos. */
  coste_envase_cents?: number | null;
};

export type LineaMezcla = {
  producto: ProductoEscandallo;
  /** En la unidad base del producto. */
  cantidad: number;
};

export const UNIDAD_SIMBOLO: Record<UnidadMedida, string> = {
  unidades: 'ud',
  gramos: 'g',
  mililitros: 'ml',
};

const MICROS_POR_CENTIMO = 10_000;

/**
 * Coste de una unidad base (un gramo, un mililitro, una unidad) en micros de
 * euro. Devuelve null si el producto no tiene puestos el envase y su coste: sin
 * eso no se puede inventar un precio.
 */
export function costeUnidadMicros(p: ProductoEscandallo): number | null {
  const capacidad = p.capacidad_envase ?? 0;
  const coste = p.coste_envase_cents;
  if (coste == null || capacidad <= 0) return null;
  return Math.round((coste * MICROS_POR_CENTIMO) / capacidad);
}

/** Coste en micros de gastar `cantidad` de un producto. */
export function costeDeLinea(linea: LineaMezcla): number | null {
  const unidad = costeUnidadMicros(linea.producto);
  if (unidad == null) return null;
  return unidad * linea.cantidad;
}

export type CosteMezcla = {
  totalMicros: number;
  /** Productos de la mezcla a los que les falta envase o coste de compra. */
  sinTarifar: string[];
};

/**
 * Suma lo que cuesta una formula entera.
 *
 * Los productos sin tarifar NO se cuentan como cero a la callada: se devuelven
 * aparte para poder decir "faltan datos de X" en vez de enseñar un margen que
 * parece bueno solo porque falta media formula.
 */
export function costeDeMezcla(lineas: LineaMezcla[]): CosteMezcla {
  let totalMicros = 0;
  const sinTarifar: string[] = [];

  for (const linea of lineas) {
    const coste = costeDeLinea(linea);
    if (coste == null) sinTarifar.push(linea.producto.nombre);
    else totalMicros += coste;
  }

  return { totalMicros, sinTarifar };
}

export type DesgloseEnvases = {
  /** Envases sin abrir. */
  cerrados: number;
  /** Lo que queda del empezado, en unidad base. */
  abierto: number;
};

/**
 * Traduce un stock en unidad base a "cuantos botes cerrados y cuanto suelto",
 * que es como lo cuenta quien abre el armario. 75 g con tubos de 60 son 1 tubo
 * y 15 g.
 */
export function desgloseEnvases(
  stockUnidadBase: number,
  capacidadEnvase?: number | null,
): DesgloseEnvases | null {
  if (!capacidadEnvase || capacidadEnvase <= 0) return null;
  const stock = Math.max(0, stockUnidadBase);
  return {
    cerrados: Math.floor(stock / capacidadEnvase),
    abierto: stock % capacidadEnvase,
  };
}

export type MargenServicio = {
  /** Lo cobrado, en centimos. */
  cobradoCents: number;
  costeProductoCents: number;
  comisionCents: number;
  margenCents: number;
  /** Sobre lo cobrado. null si no se cobro nada (no se divide entre cero). */
  margenPct: number | null;
};

/**
 * Margen bruto real de un servicio: lo que entra menos el producto que se ha
 * gastado y la comision de quien lo hizo.
 *
 * Todo en centimos ya redondeados, porque es lo que se enseña. El coste llega
 * en micros desde costeDeMezcla.
 */
export function margenDeServicio(params: {
  cobradoCents: number;
  costeProductoMicros: number;
  comisionCents?: number;
}): MargenServicio {
  const costeProductoCents = Math.round(params.costeProductoMicros / MICROS_POR_CENTIMO);
  const comisionCents = params.comisionCents ?? 0;
  const margenCents = params.cobradoCents - costeProductoCents - comisionCents;

  return {
    cobradoCents: params.cobradoCents,
    costeProductoCents,
    comisionCents,
    margenCents,
    margenPct: params.cobradoCents > 0
      ? Math.round((margenCents / params.cobradoCents) * 1000) / 10
      : null,
  };
}

/** Formatea micros de euro como "0,14 €/g". */
export function formatearCostePorUnidad(
  micros: number | null,
  unidad: UnidadMedida,
): string {
  if (micros == null) return 'sin tarifar';
  const euros = micros / (MICROS_POR_CENTIMO * 100);
  // 4 decimales: a 2 decimales, casi todos los tintes salen "0,14 €/g" y no se
  // distingue uno de otro.
  return `${euros.toFixed(4).replace('.', ',')} €/${UNIDAD_SIMBOLO[unidad]}`;
}
