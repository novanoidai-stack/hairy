// Catalogo del salon: servicios y profesionales.
//
// Son los datos que MAS se repiten entre pantallas: la agenda, clientes,
// presupuestos, caja e informes los piden todos al montar. En la medicion del
// 27 ago 2026, volver a la agenda desde clientes costaba 14 peticiones, y
// buena parte eran justo estas dos tablas otra vez.
//
// Cambian de Pascuas a Ramos, asi que aguantan cache de verdad (FRESCURA.referencia).
import { useQuery } from '@tanstack/react-query';
import { supabaseTipado } from '@/lib/supabase';
import { claves, FRESCURA } from './queryClient';

// Las columnas son el SUPERCONJUNTO de lo que pedian las distintas pantallas.
//
// Es la condicion para que la cache sirva de algo: si la agenda pide seis
// columnas y clientes tres, son dos entradas distintas y cada pantalla se
// descarga lo suyo igual que antes. Con una sola consulta canonica, quien
// llegue segundo no pide nada. El coste de que clientes reciba un par de
// columnas que no mira es despreciable (un salon tiene decenas de servicios,
// no miles); el de duplicar la consulta, no.
export type ServicioCatalogo = Record<string, unknown> & {
  id: string;
  nombre: string;
  precio: number | null;
};

export type ProfesionalCatalogo = Record<string, unknown> & {
  id: string;
  nombre: string;
  color: string | null;
};

const COLS_SERVICIOS =
  'id, nombre, precio, duracion_activa_min, duracion_espera_min, ' +
  'duracion_activa_extra_min, categoria_id, categoria_minima, duracion_minima_min, ' +
  'min_antelacion_min, recurso_tipo, recurso_fase';

const COLS_PROFESIONALES = 'id, nombre, color, activo, foto_perfil, categoria';

// --- Consultas (sin React: se pueden usar sueltas y son faciles de leer) ----

// OJO con el ORDEN: estas consultas NO llevan `.order(...)`, igual que las que
// sustituyen. No es un olvido. La agenda ordena sus columnas con el orden que
// el salon se haya guardado (`aplicarOrdenGuardado`), y cuando no hay ninguno
// guardado se queda con el orden en que llegan las filas. Meter aqui un
// `.order('nombre')` le reordenaria las columnas de la agenda a todo salon que
// no las haya ordenado a mano. Primero mover, luego mejorar.
export async function listarServicios(negocioId: string): Promise<ServicioCatalogo[]> {
  const { data, error } = await supabaseTipado
    .from('servicios')
    .select(COLS_SERVICIOS)
    .eq('negocio_id', negocioId);
  if (error) throw error;
  return (data ?? []) as unknown as ServicioCatalogo[];
}

export async function listarProfesionales(negocioId: string): Promise<ProfesionalCatalogo[]> {
  const { data, error } = await supabaseTipado
    .from('profesionales')
    .select(COLS_PROFESIONALES)
    .eq('negocio_id', negocioId);
  if (error) throw error;
  return (data ?? []) as unknown as ProfesionalCatalogo[];
}

// --- Hooks -----------------------------------------------------------------

export function useServicios(negocioId: string | null) {
  return useQuery({
    queryKey: claves.servicios(negocioId ?? ''),
    queryFn: () => listarServicios(negocioId as string),
    enabled: !!negocioId,
    staleTime: FRESCURA.referencia,
  });
}

export function useProfesionales(negocioId: string | null) {
  return useQuery({
    queryKey: claves.profesionales(negocioId ?? ''),
    queryFn: () => listarProfesionales(negocioId as string),
    enabled: !!negocioId,
    staleTime: FRESCURA.referencia,
  });
}
