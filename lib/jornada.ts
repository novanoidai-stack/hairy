/**
 * Control horario / registro de jornada.
 *
 * Capa unica de acceso a las RPC de jornada (`fichar_jornada`, `jornada_totales`,
 * `jornada_registro`, correcciones...). Nada de esto se consulta con
 * `supabase.from('fichajes')` desde la UI: la hora del asiento la pone el
 * servidor y el alcance (lo mio vs todo el centro) lo decide la RPC, no el
 * cliente. Ver migrations/control-horario-legal.sql y control-horario-rpcs.sql.
 *
 * Contexto legal (España): art. 34.9 del Estatuto de los Trabajadores en la
 * redaccion del RD-ley 8/2019 — registro diario obligatorio, totalizacion,
 * conservacion 4 años y puesta a disposicion de la persona trabajadora, de su
 * representacion legal y de la Inspeccion de Trabajo.
 */
import { supabase } from './supabase';
import { reportarError } from './reportarError';

import {
  TipoMarca, Modalidad, EstadoJornada, MARCA_LABEL, ORIGEN_LABEL, MarcaHoy,
  JornadaEstado, DiaJornada, PersonaJornada, JornadaTotales, AsientoJornada,
  CorreccionJornada, ConfigJornada, fmtMinutos, minutosADecimal, fmtHoraCorta,
  fmtDiaLargo, rangoMes,
} from './jornadaTypes';

export * from './jornadaTypes';

/** "agosto de 2026" -> "Agosto de 2026" (solo la inicial: con CSS capitalize
 *  salia "Agosto De 2026"). */
export function nombreMes(ref: Date): string {
  const s = ref.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Llamadas ─────────────────────────────────────────────────────────────────

function desempaquetar<T>(data: any, error: any, vacio: T): T {
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  if (data && data.ok === false && data.error) {
    const errObj = new Error(data.error);
    reportarError(errObj, { origen: 'app', tipo: 'operativo' });
    throw errObj;
  }
  return (data as T) ?? vacio;
}

export async function fichar(
  tipo: TipoMarca,
  opts: { modalidad?: Modalidad; profesionalId?: string | null; nota?: string; origen?: string } = {}
): Promise<{ ok: boolean; error?: string; id?: string; marcado_at?: string }> {
  const { data, error } = await supabase.rpc('fichar_jornada', {
    p_tipo: tipo,
    p_modalidad: opts.modalidad ?? 'presencial',
    p_profesional_id: opts.profesionalId ?? null,
    p_nota: opts.nota ?? null,
    p_origen: opts.origen ?? 'app',
    p_dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  return data as any;
}

export async function cargarEstadoJornada(profesionalId?: string | null): Promise<JornadaEstado> {
  const { data, error } = await supabase.rpc('jornada_estado', {
    p_profesional_id: profesionalId ?? null,
  });
  return desempaquetar<JornadaEstado>(data, error, {
    ok: true, vinculado: false, estado: 'sin_ficha', modalidad: 'presencial',
    minutos_hoy: 0, minutos_pausa_hoy: 0, marcas: [],
  });
}

export async function cargarTotales(
  desde: string, hasta: string, profesionalId?: string | null
): Promise<JornadaTotales> {
  const { data, error } = await supabase.rpc('jornada_totales', {
    p_desde: desde, p_hasta: hasta, p_profesional_id: profesionalId ?? null,
  });
  return desempaquetar<JornadaTotales>(data, error, {
    ok: true, desde, hasta, zona: 'Europe/Madrid', dias: [], personas: [],
    total_minutos: 0, total_pausa_minutos: 0, incidencias: 0,
  });
}

export async function cargarRegistro(
  desde: string, hasta: string, profesionalId?: string | null, incluirAnulados = true
): Promise<AsientoJornada[]> {
  const { data, error } = await supabase.rpc('jornada_registro', {
    p_desde: desde, p_hasta: hasta,
    p_profesional_id: profesionalId ?? null,
    p_incluir_anulados: incluirAnulados,
  });
  const res = desempaquetar<{ asientos: AsientoJornada[] }>(data, error, { asientos: [] });
  return res.asientos ?? [];
}

export async function cargarConfigJornada(): Promise<ConfigJornada> {
  const { data, error } = await supabase.rpc('jornada_config');
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  return (data as ConfigJornada) ?? {
    exigir_fichaje: false, bloquear: false, jornada_semanal: 40, zona: 'Europe/Madrid',
  };
}

export async function solicitarCorreccion(args: {
  tipoSolicitud: 'anadir' | 'corregir' | 'anular';
  motivo: string;
  fichajeId?: string | null;
  profesionalId?: string | null;
  tipo?: TipoMarca | null;
  marcadoAt?: string | null;   // ISO
  modalidad?: Modalidad;
}): Promise<{ ok: boolean; error?: string; mensaje?: string }> {
  const { data, error } = await supabase.rpc('solicitar_correccion_jornada', {
    p_tipo_solicitud: args.tipoSolicitud,
    p_motivo: args.motivo,
    p_fichaje_id: args.fichajeId ?? null,
    p_profesional_id: args.profesionalId ?? null,
    p_tipo: args.tipo ?? null,
    p_marcado_at: args.marcadoAt ?? null,
    p_modalidad: args.modalidad ?? 'presencial',
  });
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  return data as any;
}

// `profesionalId` = identidad activa. Hace falta en modo compartido: la cuenta
// es la del jefe, asi que sin esto el servidor no sabe quien esta dando su
// conformidad delante de la tablet.
export async function resolverCorreccion(
  id: string, aprobar: boolean, nota?: string, profesionalId?: string | null
): Promise<{ ok: boolean; error?: string; estado?: string }> {
  const { data, error } = await supabase.rpc('resolver_correccion_jornada', {
    p_id: id, p_aprobar: aprobar, p_nota: nota ?? null, p_profesional_id: profesionalId ?? null,
  });
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  return data as any;
}

export async function listarCorrecciones(
  estado?: string, profesionalId?: string | null
): Promise<CorreccionJornada[]> {
  const { data, error } = await supabase.rpc('listar_correcciones_jornada', {
    p_estado: estado ?? null, p_limit: 200, p_profesional_id: profesionalId ?? null,
  });
  const res = desempaquetar<{ solicitudes: CorreccionJornada[] }>(data, error, { solicitudes: [] });
  return res.solicitudes ?? [];
}

export async function verificarIntegridad(): Promise<{
  ok: boolean; error?: string; asientos?: number; integra?: boolean;
  primer_asiento_alterado?: number | null; verificado_at?: string;
}> {
  const { data, error } = await supabase.rpc('jornada_verificar_integridad');
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  return data as any;
}

// ── Exportacion ──────────────────────────────────────────────────────────────

/**
 * Filas del registro de jornada listas para CSV. Es el fichero que se le
 * entrega a la Inspeccion o a la gestoria: un asiento por linea, con el hash
 * que acredita que no se ha alterado.
 */
export function asientosACSV(asientos: AsientoJornada[]): Record<string, any>[] {
  return asientos.map((a) => ({
    'Nº asiento': a.secuencia,
    'Persona trabajadora': a.profesional,
    'Fecha': a.dia,
    'Hora': a.hora,
    'Marca': MARCA_LABEL[a.tipo] ?? a.tipo,
    'Modalidad': a.modalidad === 'remoto' ? 'Remoto' : 'Presencial',
    'Origen': ORIGEN_LABEL[a.origen] ?? a.origen,
    'Estado': a.estado === 'anulado' ? 'Anulado' : 'Valido',
    'Observaciones': a.nota ?? '',
    'Huella de integridad (SHA-256)': a.hash ?? '',
  }));
}

/** Filas de la totalizacion diaria (lo que exige "totalizar la jornada"). */
export function diasACSV(dias: DiaJornada[]): Record<string, any>[] {
  return dias.map((d) => ({
    'Persona trabajadora': d.profesional,
    'Fecha': d.dia,
    'Entrada': fmtHoraCorta(d.entrada),
    'Salida': d.en_curso ? 'En curso' : fmtHoraCorta(d.salida),
    'Horas trabajadas': fmtMinutos(d.minutos),
    'Horas (decimal)': minutosADecimal(d.minutos),
    'Pausas (no computables)': fmtMinutos(d.minutos_pausa),
    'Incidencia': d.incidencia ? 'Falta fichar la salida' : '',
  }));
}
