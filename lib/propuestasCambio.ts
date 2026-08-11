// Propuestas de cambio de hora al cliente (entrega 2 de C+D).
//
// Adelantar una cita deja de ser un movimiento unilateral: se propone, el
// cliente contesta, y solo entonces se mueve. Mientras tanto el hueco queda
// RETENIDO (una fila en bloqueos_profesional con tipo 'reserva_temporal', que
// las RPC publicas de disponibilidad y de reserva ya respetan).
//
// El envio del WhatsApp NO se hace aqui: la RPC deja una fila en
// lista_espera_avisos con template 'propuesta_cambio_cita' y el workflow de n8n
// la drena, igual que ya hace con los avisos de lista de espera.
import { supabase } from '@/lib/supabase';
import { reportarError } from '@/lib/reportarError';

export interface ResultadoPropuesta {
  ok: boolean;
  error?: string;
  /** true cuando la cita no tiene telefono al que avisar (walk-in sin ficha). */
  sinTelefono?: boolean;
  propuestaId?: string;
  expiraAt?: string;
}

/**
 * Propone al cliente adelantar su cita. No mueve nada todavia.
 *
 * @param margenReaccionMin minutos que como minimo deben quedar entre AHORA y la
 *   hora nueva, para que le de tiempo a leer el aviso y contestar.
 */
export async function proponerCambioCita(
  citaId: string,
  inicioPropuestoISO: string,
  margenReaccionMin: number,
): Promise<ResultadoPropuesta> {
  const { data, error } = await supabase.rpc('proponer_cambio_cita', {
    p_cita_id: citaId,
    p_inicio_propuesto: inicioPropuestoISO,
    p_margen_reaccion_min: margenReaccionMin,
  });
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    return { ok: false, error: error.message };
  }
  const r = (data ?? {}) as any;
  if (r && r.ok === false && r.error) {
    reportarError(new Error(r.error), { origen: 'app', tipo: 'operativo' });
  }
  return {
    ok: !!r.ok,
    error: r.error,
    sinTelefono: !!r.sin_telefono,
    propuestaId: r.propuesta_id,
    expiraAt: r.expira_at,
  };
}

/**
 * Aviso honesto para la UI. El salon tiene que saber que proponer no es mover:
 * el cliente puede no leerlo, y entonces la cita se queda donde estaba.
 */
export function avisoRiesgoPropuesta(expiraAt?: string): string {
  const base =
    'Se le enviara un WhatsApp para que lo confirme. Hasta que conteste, la cita NO se mueve y el hueco queda reservado.';
  if (!expiraAt) return `${base} Ojo: puede no leerlo a tiempo.`;
  const min = Math.max(1, Math.round((+new Date(expiraAt) - Date.now()) / 60000));
  const cuanto = min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`;
  return `${base} Tiene ${cuanto} para contestar; si no lo lee, se queda como esta.`;
}
