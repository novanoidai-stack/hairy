// EL CARGADOR UNICO DE ADD-ONS.
//
// POR QUE EXISTE (6 sep 2026)
// Un add-on colgaba de UN servicio (`service_addons.servicio_id NOT NULL`). Para
// ofrecer "Espuma" en los 78 servicios activos del salon de Jose harian falta 78
// filas mantenidas a mano, una por una, cada vez que cambia el precio. Por eso
// `servicio_id` pasa a admitir NULL:
//
//   servicio_id = <uuid>  ->  add-on de ESE servicio
//   servicio_id = NULL    ->  add-on de SALON: vale para cualquier servicio
//
// Y por eso este fichero: la consulta estaba COPIADA en cuatro sitios (Ajustes,
// NewCitaModal, DetalleCitaModal y el selector de cobro), los cuatro con
// `.eq('servicio_id', X)`. Cualquiera que se quede sin actualizar deja de ver
// los add-ons de salon y no falla: devuelve menos filas y sigue. Es el
// invariante repartido del que avisa la decision 10 del CLAUDE.md, con el
// agravante de que la version rota parece funcionar.
//
// Quien consulte `service_addons` desde el cliente pasa por aqui. Lo vigila
// `scripts/vigilantes/addons-cargador.mjs`.
import { supabaseTipado } from '@/lib/supabase';

export type Addon = {
  id: string;
  nombre: string;
  precio: number;
  duracion_min: number;
  activo: boolean;
  // null = add-on de salon. La columna existe en el tipo A PROPOSITO: sin ella
  // la interfaz no puede distinguir "solo este servicio" de "todo el salon", y
  // editar uno global desde la ficha de un servicio lo cambia en todos.
  servicio_id: string | null;
};

// Columnas: el superconjunto de lo que pedian los cuatro cargadores (regla 1 de
// la capa de datos). `duracion_min` se lee aunque el sistema la ignore desde el
// 1 sep 2026, porque los modales todavia la reciben en su tipo local.
const COLUMNAS = 'id, nombre, duracion_min, precio, activo, servicio_id';

// --- Piezas puras (son las que tienen test) ---------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Expresion `or` de PostgREST para el ambito de un servicio: los suyos mas los
 * del salon. Sin servicio elegido solo quedan los del salon.
 *
 * El id se valida como uuid antes de concatenarlo. No es paranoia gratuita: esta
 * cadena se pega dentro de un filtro que el servidor parsea, asi que un valor
 * con comas o parentesis podria reescribir la condicion entera.
 */
export function expresionAmbito(servicioId: string | null): string {
  if (servicioId === null || servicioId === '') return 'servicio_id.is.null';
  if (!UUID.test(servicioId)) {
    throw new Error(`servicioId no es un uuid: ${JSON.stringify(servicioId)}`);
  }
  return `servicio_id.eq.${servicioId},servicio_id.is.null`;
}

/**
 * Clave para comparar nombres de add-on: sin acentos, sin mayusculas y sin
 * espacios de sobra. "Ampolla  de Brillo" y "ampolla de brillo" son el mismo
 * extra para quien esta detras del mostrador.
 */
export function claveNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Deja un add-on por nombre: si el salon tiene uno global y ademas uno colgado
 * de este servicio, gana el del SERVICIO (es un precio a medida para ese caso).
 * Ordena por nombre, que es como se listan en todas las pantallas.
 *
 * Sin esto, el dia que alguien convierta un extra en global sin borrar las
 * copias por servicio, el cliente ve el mismo nombre dos veces con dos precios
 * y no hay forma de saber cual se le va a cobrar.
 */
export function conciliarAddons(filas: Addon[]): Addon[] {
  const porNombre = new Map<string, Addon>();
  for (const fila of filas) {
    const clave = claveNombre(fila.nombre);
    const previo = porNombre.get(clave);
    if (!previo) {
      porNombre.set(clave, fila);
      continue;
    }
    // El especifico manda sobre el global; entre dos iguales, el primero.
    if (previo.servicio_id === null && fila.servicio_id !== null) {
      porNombre.set(clave, fila);
    }
  }
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// --- Consultas ---------------------------------------------------------------

/**
 * Add-ons que se le pueden ofrecer a una clienta en este servicio: los del
 * servicio mas los del salon, solo activos y sin nombres repetidos.
 *
 * Es la funcion del contrato: la usan los dos modales de cita y el selector de
 * cobro. Para la pantalla de Ajustes, que tiene que ver TAMBIEN los apagados y
 * los repetidos (o no se pueden borrar), esta `listarAddonsDeServicio`.
 */
export async function cargarAddonsAplicables(
  negocioId: string,
  servicioId: string | null,
): Promise<Addon[]> {
  const { data, error } = await supabaseTipado
    .from('service_addons')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId)
    .eq('activo', true)
    .or(expresionAmbito(servicioId));
  if (error) throw error;
  return conciliarAddons((data ?? []) as unknown as Addon[]);
}

/**
 * Lo que hay guardado para un servicio, tal cual: activos y apagados, sin
 * conciliar. Es lo que necesita quien ADMINISTRA el catalogo -- si Ajustes
 * escondiera una fila repetida, nadie podria borrarla.
 */
export async function listarAddonsDeServicio(
  negocioId: string,
  servicioId: string | null,
): Promise<Addon[]> {
  const { data, error } = await supabaseTipado
    .from('service_addons')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId)
    .or(expresionAmbito(servicioId))
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as unknown as Addon[];
}

/**
 * Todos los add-ons activos del salon, cuelguen de donde cuelguen. Lo pide el
 * selector unificado de cobro, que vende extras sueltos sin haber elegido antes
 * un servicio.
 */
export async function listarAddonsDelSalon(negocioId: string): Promise<Addon[]> {
  const { data, error } = await supabaseTipado
    .from('service_addons')
    .select(COLUMNAS)
    .eq('negocio_id', negocioId)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as unknown as Addon[];
}
