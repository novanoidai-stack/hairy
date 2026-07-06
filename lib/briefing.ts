// Briefing proactivo del copiloto (Fase 3). Agrega senales de tres fuentes y las
// rankea segun la etapa de vida del salon. Determinista: la deteccion operativa la
// hace el RPC agenda_briefing (SQL); aqui solo se fusiona y ordena.
import { supabase } from '@/lib/supabase';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import type { OnboardingStatus } from '@/lib/hooks/useOnboardingStatus';

export type SeveridadSenal = 'alta' | 'media' | 'baja';

export interface BriefingSignal {
  tipo: string;
  familia: 'operativa' | 'recuperar' | 'setup';
  severidad: SeveridadSenal;
  titulo: string;
  detalle: string;
  count: number;
  items: Array<Record<string, unknown>>;
  accion?: { tipo: string; label: string; payload: Record<string, unknown> } | null;
}

// Senales operativas del RPC agenda_briefing (senales_sin_pagar + bandeja_sin_responder).
// El RPC deriva negocio/rol del auth.uid(); scope 'self' oculta las de negocio.
export async function cargarSenalesOperativas(scope: 'all' | 'self'): Promise<BriefingSignal[]> {
  const { data, error } = await supabase.rpc('agenda_briefing', { p_scope: scope });
  if (error || !Array.isArray(data)) return [];
  return data as BriefingSignal[];
}

// Clientes a recuperar: reusa clientes_en_riesgo_fuga() (ya existe, self-gated por auth.uid()).
// Solo tiene sentido a nivel de negocio: para scope profesional no se muestra.
export async function cargarClientesRecuperar(scope: 'all' | 'self'): Promise<BriefingSignal | null> {
  if (scope === 'self') return null;
  const { data, error } = await supabase.rpc('clientes_en_riesgo_fuga');
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return {
    tipo: 'clientes_a_recuperar',
    familia: 'recuperar',
    severidad: 'baja',
    titulo: 'Clientes a recuperar',
    detalle: `${data.length} ${data.length === 1 ? 'cliente lleva' : 'clientes llevan'} tiempo sin volver`,
    count: data.length,
    items: data.slice(0, 20) as Array<Record<string, unknown>>,
    accion: { tipo: 'ir_a', label: 'Ver clientes', payload: { destino: 'clientes', filtro: 'fuga' } },
  };
}

// No-show inminente (Sesion 7): citas de MANANA sin confirmar de clientas con
// riesgo medio/alto (RPC citas_riesgo_no_show, self-gated por auth.uid()). Chispa
// sugiere reforzar el recordatorio. Solo a nivel de negocio (scope all).
export async function cargarNoShowInminente(scope: 'all' | 'self'): Promise<BriefingSignal | null> {
  if (scope === 'self') return null;
  // Ventana: desde el inicio de manana hasta el inicio de pasado manana (hora local).
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() + 1);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  const { data, error } = await supabase.rpc('citas_riesgo_no_show', {
    p_desde: inicio.toISOString(),
    p_hasta: fin.toISOString(),
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return {
    tipo: 'no_show_inminente',
    familia: 'operativa',
    severidad: 'media',
    titulo: 'Posibles ausencias manana',
    detalle: `${data.length} ${data.length === 1 ? 'cita sin confirmar de una clienta' : 'citas sin confirmar de clientas'} con historial de no-show. Refuerza el recordatorio.`,
    count: data.length,
    items: data.slice(0, 20) as Array<Record<string, unknown>>,
    accion: { tipo: 'ir_a', label: 'Ver agenda de manana', payload: { destino: 'agenda' } },
  };
}

// Senales de puesta en marcha: un paso pendiente del onboarding = una senal.
// Reusa ONBOARDING_STEPS (titulo/porque/cta/pathname) para no duplicar textos ni destinos.
export function senalesSetup(status: OnboardingStatus): BriefingSignal[] {
  if (!status.ready) return [];
  return ONBOARDING_STEPS.filter((s) => status.done[s.id] === false).map((s) => ({
    tipo: `setup_${s.id}`,
    familia: 'setup',
    severidad: s.nivel === 'imprescindible' ? 'alta' : s.nivel === 'necesario' ? 'media' : 'baja',
    titulo: s.titulo,
    detalle: s.porque,
    count: 1,
    items: [],
    accion: { tipo: 'ir_a', label: s.cta, payload: { pathname: s.pathname, params: s.params ?? {} } },
  }));
}

const SEV_ORDEN: Record<SeveridadSenal, number> = { alta: 0, media: 1, baja: 2 };

// Si el nucleo del onboarding no esta completo, mandan las senales de puesta en marcha;
// cuando el salon ya es operativo, mandan las operativas.
export function rankearSenales(
  setup: BriefingSignal[],
  operativas: BriefingSignal[],
  recuperar: BriefingSignal | null,
  coreDone: boolean,
): BriefingSignal[] {
  const porSeveridad = (a: BriefingSignal, b: BriefingSignal) => SEV_ORDEN[a.severidad] - SEV_ORDEN[b.severidad];
  const ops = [...operativas.filter((s) => s.count > 0), ...(recuperar ? [recuperar] : [])].sort(porSeveridad);
  const setupOrdenado = [...setup].sort(porSeveridad);
  return coreDone ? [...ops, ...setupOrdenado] : [...setupOrdenado, ...ops];
}
