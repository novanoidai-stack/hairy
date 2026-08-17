// Tipos y formateadores puros del registro de jornada (Art. 34.9 ET).
// Desacoplados de Supabase para poder importarse en Node / SSR / Web / Tests.

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
  return {
    desde: `${y}-${dd(m + 1)}-01`,
    hasta: `${y}-${dd(m + 1)}-${dd(ultimo)}`,
  };
}
