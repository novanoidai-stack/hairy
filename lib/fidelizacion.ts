/**
 * Librería de fidelización - Sistema de gamificación
 *
 * Maneja niveles, logros, recompensas y cálculo de puntos/sellos.
 * Multi-tenant por negocio_id.
 */

import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NivelFidelizacion {
  id: string;
  negocio_id: string;
  nombre: string;
  umbral_visitas: number;
  umbral_gastado_cents: number;
  color: string;
  icono: string;
  orden: number;
  activo: boolean;
}

export interface Logro {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'primera_visita' | 'visitas_multiple' | 'gastado_total' | 'sin_noshow' | 'servicio_fav' | 'antiguedad' | 'custom';
  condicion: Record<string, any>;
  icono: string;
  color: string;
  activo: boolean;
}

export interface LogroDesbloqueado {
  id: string;
  negocio_id: string;
  cliente_id: string;
  logro_id: string;
  desbloqueado_en: string;
  detalles: Record<string, any>;
}

export interface Recompensa {
  id: string;
  negocio_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'descuento_pct' | 'descuento_eur' | 'producto' | 'servicio';
  valor: string;
  umbral_visitas: number;
  expira_meses: number | null;
  activo: boolean;
}

export interface RecompensaCanjeada {
  id: string;
  negocio_id: string;
  cliente_id: string;
  recompensa_id: string;
  cita_id: string | null;
  canjeado_en: string;
  estado: 'canjeado' | 'usado' | 'expirado' | 'cancelado';
  usado_en: string | null;
  notas: string | null;
}

export interface EstadoFidelizacion {
  nivel: NivelFidelizacion | null;
  nivel_nombre: string;
  nivel_color: string;
  nivel_icono: string;
  nivel_orden: number;
  visitas_totales: number;
  gastado_cents: number;
  logros_desbloqueados: LogroDesbloqueado[];
  recompensas_disponibles: Recompensa[];
  sellos_totales: number;
  sellos_caducan_en: string | null;
}

// ---------------------------------------------------------------------------
// RPCs (funciones que llaman a Supabase)
// ---------------------------------------------------------------------------

/**
 * Obtiene el nivel de fidelización de un cliente
 * @param clienteId UUID del cliente
 * @returns Nivel actual con métricas (visitas, gastado)
 */
export async function obtenerNivelCliente(clienteId: string): Promise<{
  ok: boolean;
  nivel?: NivelFidelizacion;
  nivel_nombre?: string;
  nivel_color?: string;
  nivel_icono?: string;
  nivel_orden?: number;
  visitas?: number;
  gastado_cents?: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_nivel_cliente', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo nivel cliente:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Verifica y desbloquea logros automáticamente
 * Debe llamarse tras completar una cita o al cargar perfil de cliente
 * @param clienteId UUID del cliente
 * @returns Cantidad de logros desbloqueados en esta llamada
 */
export async function verificarLogrosCliente(clienteId: string): Promise<{
  ok: boolean;
  desbloqueados?: number;
  visitas?: number;
  gastado_cents?: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('verificar_logros_cliente', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error verificando logros:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Obtiene logros desbloqueados de un cliente
 * @param clienteId UUID del cliente
 * @returns Lista de logros con detalles del logro base
 */
export async function obtenerLogrosDesbloqueados(clienteId: string): Promise<{
  ok: boolean;
  logros?: (LogroDesbloqueado & {
    logro_nombre: string;
    logro_descripcion: string | null;
    logro_tipo: string;
    logro_icono: string;
    logro_color: string
  })[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_logros_desbloqueados', {
      p_cliente_id: clienteId,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo logros desbloqueados:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Obtiene recompensas disponibles del negocio
 * @param negocioId ID del negocio
 * @param soloActivas Si true, solo retorna activas
 * @returns Lista de recompensas configuradas
 */
export async function obtenerRecompensasNegocio(negocioId: string, soloActivas = true): Promise<{
  ok: boolean;
  recompensas?: Recompensa[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('obtener_recompensas_negocio', {
      p_negocio_id: negocioId,
      p_solo_activas: soloActivas,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error obteniendo recompensas:', e);
    return { ok: false, error: (e as any).message };
  }
}

/**
 * Canjea una recompensa para un cliente
 * @param recompensaId UUID de la recompensa
 * @param clienteId UUID del cliente
 * @param citaId UUID opcional de la cita asociada
 * @returns Resultado del canje con ID y detalles
 */
export async function canjearRecompensa(
  recompensaId: string,
  clienteId: string,
  citaId?: string
): Promise<{
  ok: boolean;
  canje_id?: string;
  recompensa?: string;
  valor?: string;
  error?: string;
  visitas_actuales?: number;
  visitas_requeridas?: number;
}> {
  try {
    const { data, error } = await supabase.rpc('canjear_recompensa', {
      p_recompensa_id: recompensaId,
      p_cliente_id: clienteId,
      p_cita_id: citaId || null,
    });

    if (error) throw error;
    return data as any;
  } catch (e) {
    console.error('Error canjeando recompensa:', e);
    return { ok: false, error: (e as any).message };
  }
}

// ---------------------------------------------------------------------------
// Helpers de cálculo (frontend)
// ---------------------------------------------------------------------------

/**
 * Calcula sellos totales de un cliente basado en sus citas
 * Sellos = sum(bonus_puntos) de citas completadas
 * @param citas Array de citas con estado y bonus_puntos
 * @returns Total de sellos acumulados
 */
export function calcularSellosVisitas(citas: Array<{ bonus_puntos?: number; estado: string }>): number {
  return citas
    .filter(c => c.estado === 'completada')
    .reduce((acc, c) => acc + (c.bonus_puntos || 1), 0);
}

/**
 * Calcula cuándo caducan los sellos más antiguos
 * @param citas Array de citas ordenadas por fecha
 * @param expiraMeses Meses de caducidad (0 = no expira)
 * @returns ISO string de fecha de caducidad o null
 */
export function calcularCaducidadSellos(
  citas: Array<{ inicio: string; estado: string; bonus_puntos?: number }>,
  expiraMeses: number
): string | null {
  if (expiraMeses === 0 || expiraMeses === null) return null;

  // Primera visita con sellos (cita completada más antigua)
  const primera = citas
    .filter(c => c.estado === 'completada')
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

  if (!primera) return null;

  const fecha = new Date(primera.inicio);
  fecha.setMonth(fecha.getMonth() + expiraMeses);
  return fecha.toISOString();
}

/**
 * Obtiene estado completo de fidelización de un cliente
 * Función principal que agrega nivel, logros, recompensas y sellos
 * @param clienteId UUID del cliente
 * @param negocioId ID del negocio
 * @param citas Optional array de citas para calcular sellos sin query adicional
 * @returns Estado completo de fidelización
 */
export async function obtenerEstadoFidelizacion(
  clienteId: string,
  negocioId: string,
  citas?: Array<{ inicio: string; estado: string; bonus_puntos?: number }>
): Promise<EstadoFidelizacion> {
  // Ejecutar todas las consultas en paralelo
  const [nivel, logros, recompensas] = await Promise.all([
    obtenerNivelCliente(clienteId),
    obtenerLogrosDesbloqueados(clienteId),
    obtenerRecompensasNegocio(negocioId),
  ]);

  // Calcular sellos si se proporcionan citas
  const sellos_totales = citas ? calcularSellosVisitas(citas) : 0;

  // Calcular caducidad (usar primera recompensa como referencia)
  const sellos_caducan_en = recompensas.recompensas?.[0]
    ? calcularCaducidadSellos(
        citas || [],
        recompensas.recompensas[0].expira_meses || 0
      )
    : null;

  return {
    nivel: nivel.nivel || null,
    nivel_nombre: nivel.nivel_nombre || 'Nuevo',
    nivel_color: nivel.nivel_color || '#9ca3af',
    nivel_icono: nivel.nivel_icono || 'star',
    nivel_orden: nivel.nivel_orden || 0,
    visitas_totales: nivel.visitas || 0,
    gastado_cents: nivel.gastado_cents || 0,
    logros_desbloqueados: logros.logros || [],
    recompensas_disponibles: recompensas.recompensas || [],
    sellos_totales,
    sellos_caducan_en,
  };
}

/**
 * Obtiene recompensas canjeables por un cliente
 * Filtra recompensas según sellos del cliente
 * @param clienteId UUID del cliente
 * @param sellosTotales Sellos actuales del cliente
 * @returns Lista de recompensas canjeables
 */
export async function obtenerRecompensasCanjeables(
  clienteId: string,
  sellosTotales: number
): Promise<{
  ok: boolean;
  canjeables?: Array<Recompensa & { puede_canjear: boolean }>;
  error?: string;
}> {
  try {
    // Obtener recompensas del negocio (del cliente)
    const { data: cliente } = await supabase
      .from('clientes')
      .select('negocio_id')
      .eq('id', clienteId)
      .single();

    if (!cliente?.negocio_id) {
      return { ok: false, error: 'Cliente no encontrado' };
    }

    const resultado = await obtenerRecompensasNegocio(cliente.negocio_id, true);

    if (!resultado.ok || !resultado.recompensas) {
      return resultado;
    }

    // Filtrar por umbral de sellos
    const canjeables = resultado.recompensas.map(r => ({
      ...r,
      puede_canjear: sellosTotales >= r.umbral_visitas,
    }));

    return { ok: true, canjeables };
  } catch (e) {
    console.error('Error obteniendo recompensas canjeables:', e);
    return { ok: false, error: (e as any).message };
  }
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

/**
 * Obtiene estilos CSS para badge de nivel
 * @param nivel Nivel de fidelización (puede ser null)
 * @returns Objeto con bg, color, border
 */
export function getNivelBadgeStyle(nivel: EstadoFidelizacion['nivel']) {
  if (!nivel) {
    return {
      bg: '#f3f4f6',
      color: '#6b7280',
      border: '#d1d5db',
    };
  }
  return {
    bg: `${nivel.color}15`, // 15% opacity
    color: nivel.color,
    border: nivel.color,
  };
}

/**
 * Formatea diferencia de tiempo para caducidad de sellos
 * @param fechaIso ISO string de fecha de caducidad o null
 * @returns Texto legible: "Caducan en X días", "No caducan", etc.
 */
export function formatearCaducidad(fechaIso: string | null): string {
  if (!fechaIso) return 'No caducan';

  const fecha = new Date(fechaIso);
  const hoy = new Date();
  const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  if (dias < 0) return 'Caducados';
  if (dias === 0) return 'Caducan hoy';
  if (dias === 1) return 'Caducan mañana';
  if (dias < 7) return `Caducan en ${dias} días`;
  if (dias < 30) return `Caducan en ${Math.ceil(dias / 7)} semanas`;
  if (dias < 365) return `Caducan en ${Math.ceil(dias / 30)} meses`;
  return `Caducan en ${Math.ceil(dias / 365)} años`;
}

/**
 * Formatea importe en céntimos a euros
 * @param cents Importe en céntimos
 * @returns String formateado: "15,00 €"
 */
export function formatearEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
}

/**
 * Verifica si un logro está desbloqueado
 * @param logrosDesbloqueados Lista de logros desbloqueados
 * @param logroId UUID del logro a verificar
 * @returns true si el logro está en la lista
 */
export function estaLogroDesbloqueado(
  logrosDesbloqueados: LogroDesbloqueado[],
  logroId: string
): boolean {
  return logrosDesbloqueados.some(l => l.logro_id === logroId);
}

/**
 * Calcula progreso hacia el próximo nivel
 * @param nivelActual Nivel actual del cliente
 * @param niveles Ordenados por orden ascendente
 * @param visitas Visitas totales del cliente
 * @param gastado Importe gastado en céntimos
 * @returns Objeto con progreso (0-1) y nivel destino
 */
export function calcularProgresoNivel(
  nivelActual: NivelFidelizacion | null,
  niveles: NivelFidelizacion[],
  visitas: number,
  gastado: number
): { progreso: number; siguienteNivel: NivelFidelizacion | null } {
  // Buscar siguiente nivel
  const ordenActual = nivelActual?.orden ?? -1;
  const siguientes = niveles.filter(n => n.orden > ordenActual && n.activo);
  const siguiente = siguientes.sort((a, b) => a.orden - b.orden)[0] || null;

  if (!siguiente) {
    return { progreso: 1, siguienteNivel: null };
  }

  // Calcular progreso hacia el siguiente nivel
  // Usar el menor de los umbrales como referencia
  const umbralVisitas = siguiente.umbral_visitas ?? Infinity;
  const umbralGastado = siguiente.umbral_gastado_cents ?? Infinity;

  // Progreso basado en visits (prioridad)
  if (umbralVisitas < Infinity) {
    const progreso = Math.min(1, visitas / umbralVisitas);
    return { progreso, siguienteNivel: siguiente };
  }

  // Si no hay umbral de visitas, usar gastado
  if (umbralGastado < Infinity) {
    const progreso = Math.min(1, gastado / umbralGastado);
    return { progreso, siguienteNivel: siguiente };
  }

  return { progreso: 1, siguienteNivel: null };
}
