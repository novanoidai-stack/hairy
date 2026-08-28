// Configuracion del salon: lo que casi nunca cambia y todo el mundo consulta.
//
// Horarios, cierres, categorias y la fila de configuracion. Son las tablas que
// `fetchSinRepetir` (lib/supabase.ts) ya trataba aparte con un TTL de 3 s
// porque se piden desde muchos sitios seguidos; aqui pasan a cache de verdad,
// compartida entre pantallas y con invalidacion explicita.
import { supabaseTipado } from '@/lib/supabase';

// La primera parte de cada clave es el nombre EXACTO de la tabla, y la segunda
// el negocio. Lo primero, porque la invalidacion automatica al escribir empareja
// por ahi (ver crearQueryClient); lo segundo, por aislamiento entre salones.
export const clavesConfig = {
  negocioConfig: (negocioId: string) => ['negocio_config', negocioId] as const,
  negocioHorarios: (negocioId: string) => ['negocio_horarios', negocioId] as const,
  categorias: (negocioId: string) => ['categorias_servicio', negocioId] as const,
  cierres: (negocioId: string) => ['cierres_negocio', negocioId] as const,
  horariosProfesional: (negocioId: string) => ['horarios_profesional', negocioId] as const,
  duraciones: (negocioId: string) => ['duraciones_profesional', negocioId] as const,
  overridesServicio: (negocioId: string) => ['professional_service_overrides', negocioId] as const,
  recursos: (negocioId: string) => ['recursos', negocioId] as const,
  serviceAddons: (negocioId: string) => ['service_addons', negocioId] as const,
  bloqueos: (negocioId: string) => ['bloqueos_profesional', negocioId] as const,
} as const;

export async function leerNegocioConfig(negocioId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseTipado
    .from('negocio_config')
    .select('config')
    .eq('negocio_id', negocioId)
    .maybeSingle();
  if (error) throw error;
  const cfg = (data as { config?: unknown } | null)?.config;
  return cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {};
}

export async function listarNegocioHorarios(negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('negocio_horarios')
    .select('dia_semana, abierto, apertura, cierre')
    .eq('negocio_id', negocioId);
  if (error) throw error;
  return data ?? [];
}

export async function listarCategorias(negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('categorias_servicio')
    .select('id, nombre, color, orden, icono')
    .eq('negocio_id', negocioId)
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data ?? [];
}

export async function listarCierres(negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('cierres_negocio')
    .select('fecha, motivo')
    .eq('negocio_id', negocioId);
  if (error) throw error;
  return data ?? [];
}

// OJO: `horarios_profesional` NO tiene columna negocio_id (solo profesional_id),
// asi que la consulta no lleva filtro: quien acota es RLS. El negocioId entra
// igualmente en la CLAVE de cache, que es cosa distinta -- sin el, al cambiar de
// salon se reutilizarian los horarios del anterior.
// Y ojo tambien con el dia_semana: aqui 0 = DOMINGO (extract(dow) de Postgres),
// al reves que en negocio_horarios, donde 0 = lunes.
export async function listarHorariosProfesional(_negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('horarios_profesional')
    .select('profesional_id, dia_semana, hora_inicio, hora_fin, turno');
  if (error) throw error;
  return data ?? [];
}

// Duracion de un servicio PARA UN PROFESIONAL concreto. La duracion efectiva no
// sale del catalogo: manda el override. Igual que arriba, sin negocio_id en la
// tabla (acota RLS) pero con el negocio en la clave de cache.
export async function listarDuracionesProfesional(_negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('duraciones_profesional')
    .select(
      'profesional_id, servicio_id, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min',
    );
  if (error) throw error;
  return data ?? [];
}

export async function listarOverridesServicio(_negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('professional_service_overrides')
    .select(
      'professional_id, service_id, duracion, duracion_espera_min, duracion_activa_extra_min, precio, activo',
    );
  if (error) throw error;
  return data ?? [];
}

// Puestos del salon (lavacabezas, cabinas...). Solo los activos: los apagados
// no suman capacidad.
export async function listarRecursos(_negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('recursos')
    .select('id, nombre, tipo, capacidad, activo')
    .eq('activo', true);
  if (error) throw error;
  return data ?? [];
}

// Bloqueos del profesional (descansos, vacaciones, bajas, formacion).
//
// Estos SI cambian durante la jornada -- el salon los crea desde Equipo -- y aun
// asi se pueden cachear: cualquier escritura sobre `bloqueos_profesional`
// invalida esta clave sola (ver crearQueryClient). Sin esa invalidacion
// automatica esto no seria seguro y la agenda ensenaria descansos fantasma.
export async function listarBloqueos(negocioId: string) {
  const { data, error } = await supabaseTipado
    .from('bloqueos_profesional')
    .select('*')
    .eq('negocio_id', negocioId);
  if (error) throw error;
  return data ?? [];
}
