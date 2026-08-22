// Arqueo de caja: contar lo que hay en el cajon y ver si cuadra.
//
// El arqueo es CIEGO: quien cierra teclea lo que ha contado sin ver antes lo
// que el sistema espera. El teorico lo calcula el servidor en el momento del
// cierre (cerrar_caja) y lo devuelve ya con la diferencia. Por eso aqui no hay
// nada que "prevea" el descuadre: solo se ayuda a contar.

/** Billetes y monedas de euro, de mayor a menor, en centimos. */
export const DENOMINACIONES_EUR: readonly number[] = [
  50000, 20000, 10000, 5000, 2000, 1000, // billetes
  500, 200, 100, 50, 20, 10, 5, 2, 1,    // monedas
];

export type Conteo = Record<number, number>;

/** Lo que suma el conteo de billetes y monedas, en centimos. */
export function totalContado(conteo: Conteo): number {
  return Object.entries(conteo).reduce((suma, [valor, cantidad]) => {
    const v = Number(valor);
    const c = Number(cantidad);
    if (!Number.isFinite(v) || !Number.isFinite(c) || c <= 0) return suma;
    return suma + v * c;
  }, 0);
}

export type Gravedad = 'cuadra' | 'leve' | 'grave';

/**
 * Como de serio es un descuadre.
 *
 * Los umbrales van en euros absolutos y no en porcentaje a proposito: a un
 * salon le duele igual que falten 20 EUR un martes flojo que un sabado bueno,
 * y con porcentaje el dia flojo saltaria siempre y el bueno nunca.
 */
export function gravedadDescuadre(descuadreCents: number): Gravedad {
  const abs = Math.abs(descuadreCents);
  if (abs === 0) return 'cuadra';
  if (abs <= 500) return 'leve';   // hasta 5 EUR: cambio mal dado, pasa
  return 'grave';
}

/** Texto del descuadre en lenguaje de mostrador. */
export function textoDescuadre(descuadreCents: number): string {
  if (descuadreCents === 0) return 'La caja cuadra.';
  const euros = (Math.abs(descuadreCents) / 100).toFixed(2).replace('.', ',');
  return descuadreCents > 0
    ? `Sobran ${euros} €.`
    : `Faltan ${euros} €.`;
}

export type ResumenCierre = {
  numeroZ: number;
  fondoInicialCents: number;
  teoricoEfectivoCents: number;
  contadoEfectivoCents: number;
  descuadreCents: number;
  gravedad: Gravedad;
  texto: string;
};

/** Da forma a lo que devuelve cerrar_caja para pintarlo. */
export function resumenDeCierre(respuesta: {
  numero_z: number;
  fondo_inicial_cents: number;
  teorico_efectivo_cents: number;
  contado_efectivo_cents: number;
  descuadre_cents: number;
}): ResumenCierre {
  return {
    numeroZ: respuesta.numero_z,
    fondoInicialCents: respuesta.fondo_inicial_cents,
    teoricoEfectivoCents: respuesta.teorico_efectivo_cents,
    contadoEfectivoCents: respuesta.contado_efectivo_cents,
    descuadreCents: respuesta.descuadre_cents,
    gravedad: gravedadDescuadre(respuesta.descuadre_cents),
    texto: textoDescuadre(respuesta.descuadre_cents),
  };
}

/** "12,50 €" a partir de centimos. */
export function euros(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Etiqueta de una denominacion: "50 €" o "20 cent". */
export function etiquetaDenominacion(cents: number): string {
  return cents >= 100 ? `${cents / 100} €` : `${cents} cent`;
}
