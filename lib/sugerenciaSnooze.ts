// S15 · Silenciado durable de sugerencias ("ahora no").
// Reutiliza chispa_memoria (S09) como KV por usuario: tipo='hecho',
// clave='snooze:<clave>', valor={ hasta: ISO }. Así "aprende de los descartes"
// de forma persistente (cross-dispositivo) y con RGPD (borrable con la memoria).
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';

const HORAS_DEFECTO = 24;
const PREFIJO = 'snooze:';

// Devuelve el conjunto de claves de sugerencia actualmente silenciadas para el
// usuario (las que aún no han expirado). En demo no hay persistencia.
export async function sugerenciasSilenciadas(): Promise<Set<string>> {
  const vacio = new Set<string>();
  if (IS_DEMO_MODE) return vacio;
  const p = await getUserProfile();
  if (!p?.negocio_id || !p?.id) return vacio;

  const { data, error } = await supabase
    .from('chispa_memoria')
    .select('clave, valor')
    .eq('negocio_id', p.negocio_id)
    .eq('usuario_id', p.id)
    .eq('tipo', 'hecho')
    .like('clave', `${PREFIJO}%`);
  if (error || !Array.isArray(data)) return vacio;

  const ahora = Date.now();
  const set = new Set<string>();
  for (const row of data as Array<{ clave: string; valor: { hasta?: string } }>) {
    const hasta = row.valor?.hasta ? Date.parse(row.valor.hasta) : 0;
    if (hasta > ahora) set.add(row.clave.slice(PREFIJO.length));
  }
  return set;
}

// Silencia una sugerencia durante `horas` (default 24h).
export async function silenciarSugerencia(clave: string, horas = HORAS_DEFECTO): Promise<void> {
  if (IS_DEMO_MODE) return;
  const p = await getUserProfile();
  if (!p?.negocio_id || !p?.id) return;
  const hasta = new Date(Date.now() + horas * 3600000).toISOString();
  await supabase.from('chispa_memoria').upsert(
    {
      negocio_id: p.negocio_id,
      usuario_id: p.id,
      tipo: 'hecho',
      clave: `${PREFIJO}${clave}`,
      valor: { hasta },
      origen: 'proxima_accion',
    },
    { onConflict: 'negocio_id,tipo,clave,usuario_id' },
  );
}
