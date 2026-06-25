import { supabase } from '@/lib/supabase';
import { CITA_STATUS } from '@/lib/constants';

// --- Tipos ---

export type AccionPropuesta =
  | {
      tipo: 'crear_cita';
      negocio_id: string;
      profesional_id: string;
      profesional_nombre: string;
      servicio_id: string;
      servicio_nombre: string;
      cliente_id: string | null;
      cliente_nombre: string | null;
      inicio: string;
      fin: string;
      fin_activa: string;
      fin_espera: string;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'reagendar_cita';
      cita_id: string;
      nuevo_inicio: string;
      nuevo_fin: string;
      nuevo_fin_activa: string;
      nuevo_fin_espera: string;
      nuevo_profesional_id?: string;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'cancelar_cita';
      cita_id: string;
      motivo: string | null;
      resumen: string;
    }
  | {
      tipo: 'bloquear_hueco';
      negocio_id: string;
      profesional_id: string;
      profesional_nombre: string;
      inicio: string;
      fin: string;
      motivo: string | null;
      resumen: string;
      solapa: boolean;
    }
  | {
      tipo: 'liberar_hueco';
      bloqueo_id: string;
      resumen: string;
    }
  | {
      tipo: 'cambiar_config';
      negocio_id: string;
      clave: string;
      label: string;
      valor: boolean | number | string;
      valor_actual: boolean | number | string | null;
      resumen: string;
    };

export type EjecucionResultado =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

// --- Ejecutor ---

/**
 * Aplica una accion propuesta por el asistente IA usando la sesion
 * autenticada del usuario (RLS activo — los permisos son los mismos
 * que una accion manual desde la agenda).
 */
export async function ejecutarAccion(
  a: AccionPropuesta,
  userId: string,
): Promise<EjecucionResultado> {
  try {
    switch (a.tipo) {
      case 'crear_cita': {
        const { error } = await supabase.from('citas').insert({
          negocio_id: a.negocio_id,
          profesional_id: a.profesional_id,
          servicio_id: a.servicio_id,
          cliente_id: a.cliente_id,
          inicio: a.inicio,
          fin: a.fin,
          fin_activa: a.fin_activa,
          fin_espera: a.fin_espera,
          estado: CITA_STATUS.CONFIRMADA,
          canal: 'asistente_ia',
          creado_por: userId,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita creada: ${a.resumen}` };
      }

      case 'reagendar_cita': {
        const payload: Record<string, string> = {
          inicio: a.nuevo_inicio,
          fin: a.nuevo_fin,
          fin_activa: a.nuevo_fin_activa,
          fin_espera: a.nuevo_fin_espera,
        };
        if (a.nuevo_profesional_id) {
          payload.profesional_id = a.nuevo_profesional_id;
        }
        const { error } = await supabase
          .from('citas')
          .update(payload)
          .eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita reagendada: ${a.resumen}` };
      }

      case 'cancelar_cita': {
        const { error } = await supabase
          .from('citas')
          .update({ estado: CITA_STATUS.CANCELADA })
          .eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita cancelada: ${a.resumen}` };
      }

      case 'bloquear_hueco': {
        const { error } = await supabase.from('bloqueos_profesional').insert({
          negocio_id: a.negocio_id,
          profesional_id: a.profesional_id,
          inicio: a.inicio,
          fin: a.fin,
          tipo: 'otro',
          motivo: a.motivo,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hueco bloqueado: ${a.resumen}` };
      }

      case 'liberar_hueco': {
        const { error } = await supabase
          .from('bloqueos_profesional')
          .delete()
          .eq('id', a.bloqueo_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hueco liberado: ${a.resumen}` };
      }

      case 'cambiar_config': {
        // Lee la config actual, mezcla la clave y reescribe (RLS de la sesion del usuario).
        const { data: row, error: eRead } = await supabase
          .from('negocio_config')
          .select('config')
          .eq('negocio_id', a.negocio_id)
          .maybeSingle();
        if (eRead) return { ok: false, error: eRead.message };
        const nuevo = { ...((row?.config as Record<string, unknown>) ?? {}), [a.clave]: a.valor };
        const { error } = await supabase
          .from('negocio_config')
          .upsert({ negocio_id: a.negocio_id, config: nuevo }, { onConflict: 'negocio_id' });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hecho: ${a.resumen}` };
      }

      default: {
        // Exhaustividad garantizada por TypeScript
        const _exhaustive: never = a;
        return { ok: false, error: `Tipo de accion desconocido: ${(_exhaustive as AccionPropuesta).tipo}` };
      }
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
