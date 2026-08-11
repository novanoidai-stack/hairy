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

export type TipoMarca = 'entrada' | 'salida' | 'pausa_inicio' | 'pausa_fin';
export type Modalidad = 'presencial' | 'remoto';
export type EstadoJornada = 'trabajando' | 'en_pausa' | 'fuera' | 'sin_ficha';

export const MARCA_LABEL: Record<TipoMarca, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  pausa_inicio: 'Inicio de pausa',
  pausa_fin: 'Fin de pausa',
};

export const ORIGEN_LABEL: Record<string, string> = {
  app: 'App',
  movil: 'Movil',
  quiosco: 'Quiosco',
  correccion: 'Correccion autorizada',
  importado: 'Importado',
  automatico: 'Automatico',
};

export interface MarcaHoy {
  tipo: TipoMarca;
  marcado_at: string;
  modalidad: Modalidad;
  origen: string;
}

export interface JornadaEstado {
  ok: boolean;
  error?: string;
  vinculado: boolean;
  profesional_id?: string;
  estado: EstadoJornada;
  modalidad: Modalidad;
  desde?: string | null;
  minutos_hoy: number;
  minutos_pausa_hoy: number;
  marcas: MarcaHoy[];
}

export interface DiaJornada {
  profesional_id: string | null;
  profesional: string;
  dia: string;            // YYYY-MM-DD
  minutos: number;
  minutos_pausa: number;
  entrada: string | null;
  salida: string | null;
  en_curso: boolean;
  incidencia: boolean;
}

export interface PersonaJornada {
  profesional_id: string | null;
  profesional: string;
  minutos: number;
  minutos_pausa: number;
  dias_trabajados: number;
  incidencias: number;
}

export interface JornadaTotales {
  ok: boolean;
  error?: string;
  desde: string;
  hasta: string;
  zona: string;
  dias: DiaJornada[];
  personas: PersonaJornada[];
  total_minutos: number;
  total_pausa_minutos: number;
  incidencias: number;
}

export interface AsientoJornada {
  id: string;
  secuencia: number;
  profesional_id: string | null;
  profesional: string;
  tipo: TipoMarca;
  marcado_at: string;
  dia: string;
  hora: string;
  modalidad: Modalidad;
  origen: string;
  estado: 'valido' | 'anulado';
  nota: string | null;
  anulado_at: string | null;
  corrige_a: string | null;
  hash: string;
}

export interface CorreccionJornada {
  id: string;
  tipo_solicitud: 'anadir' | 'corregir' | 'anular';
  propuesta: { tipo?: TipoMarca; marcado_at?: string; modalidad?: Modalidad };
  motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitada_por_rol: 'empresa' | 'trabajador';
  solicitada_por_nombre: string | null;
  created_at: string;
  resuelta_por_nombre: string | null;
  resuelta_at: string | null;
  resolucion_nota: string | null;
  discrepancia: string | null;
  fichaje_id: string | null;
  fichaje_nuevo_id: string | null;
  profesional_id: string | null;
  profesional: string;
  fichaje_tipo: TipoMarca | null;
  fichaje_marcado_at: string | null;
  me_toca: boolean;
}

export interface ConfigJornada {
  exigir_fichaje: boolean;
  bloquear: boolean;
  jornada_semanal: number;
  zona: string;
}

// ── Formato ──────────────────────────────────────────────────────────────────

/** 487 -> "8h 07m". Es el formato que se enseña en pantalla y en el PDF. */
export function fmtMinutos(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}

/** 487 -> "8,12" — formato decimal español, el que pide una gestoria para nomina. */
export function minutosADecimal(min: number): string {
  return ((Math.max(0, min || 0)) / 60).toFixed(2).replace('.', ',');
}

export function fmtHoraCorta(iso: string | null | undefined, zona = 'Europe/Madrid'): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', timeZone: zona,
    });
  } catch {
    return '—';
  }
}

export function fmtDiaLargo(dia: string): string {
  // `dia` viene ya en la zona del centro (YYYY-MM-DD): se formatea sin volver a
  // convertir zonas, o un dia 1 se convierte en el 31 del mes anterior.
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-ES', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/** Primer y ultimo dia del mes de `ref`, en YYYY-MM-DD (sin saltos de zona). */
export function rangoMes(ref: Date): { desde: string; hasta: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const dd = (n: number) => String(n).padStart(2, '0');
  const ultimo = new Date(y, m + 1, 0).getDate();
  return { desde: `${y}-${dd(m + 1)}-01`, hasta: `${y}-${dd(m + 1)}-${dd(ultimo)}` };
}

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
