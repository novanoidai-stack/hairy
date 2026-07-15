import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CORE_STEP_IDS, ONBOARDING_STEPS, type OnboardingStepId } from '@/lib/onboarding';

export interface OnboardingStatus {
  loading: boolean;
  ready: boolean;                                 // datos cargados al menos una vez
  done: Record<OnboardingStepId, boolean>;
  coreDone: boolean;                              // nucleo (pasos 1-5) completo -> operativo
  coreTotal: number;
  coreCompletados: number;
  refresh: () => void;
}

const emptyDone = (): Record<OnboardingStepId, boolean> =>
  ONBOARDING_STEPS.reduce((acc, s) => { acc[s.id] = false; return acc; }, {} as Record<OnboardingStepId, boolean>);

// Calcula que pasos del onboarding estan hechos leyendo los datos reales del negocio.
// El dueno ya tiene permiso RLS de lectura sobre todas estas tablas (las pantallas de
// Ajustes/Equipo ya las consultan), asi que no hace falta RPC ni migracion.
export function useOnboardingStatus(negocioId: string | null, enabled: boolean): OnboardingStatus {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<Record<OnboardingStepId, boolean>>(emptyDone);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!enabled || !negocioId) { setReady(false); setDone(emptyDone()); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [servRes, profRes, horSalonRes, cfgRes, portalRes] = await Promise.all([
          supabase.from('servicios').select('id, activo, precio, duracion_activa_min, foto_url').eq('negocio_id', negocioId),
          supabase.from('profesionales').select('id, activo').eq('negocio_id', negocioId),
          supabase.from('negocio_horarios').select('abierto, apertura, cierre').eq('negocio_id', negocioId),
          supabase.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle(),
          supabase.from('negocio_portal').select('slug, portal_activo').eq('negocio_id', negocioId).maybeSingle(),
        ]);

        const servicios = (servRes.data ?? []) as any[];
        const activeServicios = servicios.filter((s) => s.activo !== false);
        const profesionales = (profRes.data ?? []) as any[];
        const activeProfs = profesionales.filter((p) => p.activo !== false);

        // Horario de cada profesional activo: query acotado a sus ids (RLS por propiedad).
        let horariosProfDone = false;
        if (activeProfs.length > 0) {
          const ids = activeProfs.map((p) => p.id);
          const { data: horProf } = await supabase
            .from('horarios_profesional').select('profesional_id').in('profesional_id', ids);
          const conHorario = new Set((horProf ?? []).map((h: any) => h.profesional_id));
          horariosProfDone = ids.every((id) => conHorario.has(id));
        }

        const horarios = (horSalonRes.data ?? []) as any[];
        const cfg = (cfgRes.data?.config ?? {}) as any;
        const portal = portalRes.data as any;

        const next = emptyDone();
        next.servicios = activeServicios.some((s) => Number(s.precio) > 0 && Number(s.duracion_activa_min) > 0);
        next.equipo = activeProfs.length > 0;
        next.horarios_profesional = horariosProfDone;
        next.horario_salon = horarios.some((h) => h.abierto && h.apertura && h.cierre);
        next.datos_negocio = Boolean(cfg.nombre && cfg.direccion && cfg.telefono);
        next.reserva_online = Boolean(portal && portal.slug && portal.portal_activo);
        next.fotos_servicios = activeServicios.length > 0 && activeServicios.some((s) => !!s.foto_url);
        next.notificaciones = cfg.notifRecordatorioActiva === true;

        if (!cancel) { setDone(next); setReady(true); }
      } catch {
        // No bloquear la UI si una consulta falla: dejamos ready para no mostrar la tarjeta en falso.
        if (!cancel) setReady(true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [negocioId, enabled, nonce]);

  const coreCompletados = CORE_STEP_IDS.filter((id) => done[id]).length;
  const coreDone = ready && coreCompletados === CORE_STEP_IDS.length;

  return { loading, ready, done, coreDone, coreTotal: CORE_STEP_IDS.length, coreCompletados, refresh };
}
