// Categorias y metodos de pago de los gastos del salon.
//
// FUENTE UNICA a proposito. Estas listas las necesitan tres sitios --
// el formulario de alta, el desglose por categoria de Informes y la seccion de
// Caja -- y escribirlas en cada uno es la fabrica de regresiones que describe la
// decision 10 del CLAUDE.md: el dia que se anada una categoria, aparecera en el
// desplegable y no en el desglose, o al reves.
//
// EL CHECK DE LA BASE MANDA. `gastos_categoria_check` y `gastos_metodo_pago_check`
// (migracion 20260907142944) admiten exactamente estos valores. Anadir uno aqui
// sin tocar el CHECK da un 23514 al guardar; quitarlo de aqui sin tocar el CHECK
// deja filas que la interfaz no sabe nombrar. Van juntos, siempre.

export type CategoriaGasto =
  | 'alquiler'
  | 'suministros'
  | 'producto'
  | 'personal'
  | 'formacion'
  | 'marketing'
  | 'mantenimiento'
  | 'seguros'
  | 'impuestos'
  | 'software'
  | 'gestoria'
  | 'equipamiento'
  | 'otros';

export type MetodoPagoGasto =
  | 'efectivo'
  | 'tarjeta'
  | 'transferencia'
  | 'domiciliado'
  | 'otro';

/**
 * En el orden en que se ensenan. Las cuatro primeras son las que existian antes
 * del 7 sep 2026 y siguen siendo las mas usadas; "Otros" va al final porque es
 * el cajon de sastre y ponerlo arriba invita a no clasificar.
 */
export const CATEGORIAS_GASTO: { valor: CategoriaGasto; etiqueta: string }[] = [
  { valor: 'alquiler', etiqueta: 'Alquiler' },
  { valor: 'suministros', etiqueta: 'Suministros (luz, agua, internet)' },
  { valor: 'producto', etiqueta: 'Producto y material' },
  { valor: 'personal', etiqueta: 'Personal (nominas y seguros sociales)' },
  { valor: 'formacion', etiqueta: 'Formacion' },
  { valor: 'marketing', etiqueta: 'Marketing y publicidad' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento y reparaciones' },
  { valor: 'seguros', etiqueta: 'Seguros' },
  { valor: 'impuestos', etiqueta: 'Impuestos y tasas' },
  { valor: 'software', etiqueta: 'Software y suscripciones' },
  { valor: 'gestoria', etiqueta: 'Gestoria y asesoria' },
  { valor: 'equipamiento', etiqueta: 'Equipamiento y mobiliario' },
  { valor: 'otros', etiqueta: 'Otros' },
];

export const METODOS_PAGO_GASTO: { valor: MetodoPagoGasto; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'domiciliado', etiqueta: 'Domiciliado' },
  { valor: 'otro', etiqueta: 'Otro' },
];

/**
 * Nombre legible de una categoria. Devuelve el valor crudo si no la conoce, en
 * vez de una cadena vacia: una fila guardada con una categoria retirada tiene
 * que seguir siendo identificable en pantalla, no desaparecer.
 */
export function etiquetaCategoria(valor: string | null | undefined): string {
  if (!valor) return 'Sin categoria';
  return CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

/** Igual que `etiquetaCategoria`, para el metodo de pago. Vacio = no se anoto. */
export function etiquetaMetodoPago(valor: string | null | undefined): string {
  if (!valor) return '';
  return METODOS_PAGO_GASTO.find((m) => m.valor === valor)?.etiqueta ?? valor;
}
