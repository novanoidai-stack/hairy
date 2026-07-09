// Cliente de la cola de hallazgos del escaneo proactivo 24/7 de Chispa (S13).
// El motor (cron pg_cron + detectores SQL) rellena la tabla hallazgos_ia; aqui
// solo se lee, se dispara un barrido bajo demanda al abrir, y se marca el estado.
// La surface accionable rica (Avisos) es S14; esto es el substrato.
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';

export type SeveridadHallazgo = 'urgente' | 'alta' | 'media' | 'baja';
export type EstadoHallazgo = 'nuevo' | 'visto' | 'resuelto' | 'descartado';

// Accion sugerida de un clic (mismo shape que BriefingSignal.accion en lib/briefing.ts).
export interface AccionHallazgo {
  tipo: string; // 'ir_a', 'reenviar_pago', ...
  label: string;
  payload: Record<string, unknown>;
}

export interface Hallazgo {
  id: string;
  negocio_id: string;
  tipo: string;
  familia: 'operativa' | 'recuperar' | 'inventario' | 'setup';
  severidad: SeveridadHallazgo;
  entidad: string | null;
  entidad_id: string | null;
  resumen: string;
  detalle: string | null;
  accion_sugerida: AccionHallazgo | Record<string, never>;
  datos: { count?: number; items?: Array<Record<string, unknown>> };
  estado: EstadoHallazgo;
  creado_en: string;
  actualizado_en: string;
  resuelto_en: string | null;
}

// Lee los hallazgos del propio negocio (por defecto solo abiertos: nuevo/visto).
// El RPC deriva el negocio del auth.uid(); nunca cruza tenants.
export async function cargarHallazgos(incluirCerrados = false): Promise<Hallazgo[]> {
  const { data, error } = await supabase.rpc('hallazgos_del_negocio', {
    p_incluir_cerrados: incluirCerrados,
  });
  if (error || !Array.isArray(data)) return [];
  return data as Hallazgo[];
}

// Barrido bajo demanda al abrir la app: procesa el propio negocio y devuelve los
// hallazgos abiertos. Idempotente en servidor (no duplica). La demo no se persiste.
export async function escanearHallazgosAhora(): Promise<Hallazgo[]> {
  if (IS_DEMO_MODE) return [];
  const { data, error } = await supabase.rpc('escanear_hallazgos_ahora');
  if (error || !Array.isArray(data)) return [];
  return data as Hallazgo[];
}

// Marca un hallazgo del propio negocio como visto/resuelto/descartado.
export async function marcarHallazgo(
  id: string,
  estado: Exclude<EstadoHallazgo, 'nuevo'>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('marcar_hallazgo', { p_id: id, p_estado: estado });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
