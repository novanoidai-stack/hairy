// Montaje GLOBAL de Chispa (web). Se coloca en app/_layout.tsx (dentro de
// CalendarProvider) para que la burbuja/pestana este disponible en TODA la app
// autenticada, no solo en la Agenda (PR02: la IA es transversal, no una pantalla
// aparte). Gateado por negocio_config.asistenteAgendaActivo. Fuera de rutas
// publicas y del login.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { useCalendarRefresh } from '@/lib/calendarContext';
import ChispaPanel from '@/components/chispa/ChispaPanel.web';

type PerfilChispa = { id: string; role?: string | null; negocio_id: string };

export function ChispaLauncher() {
  const segments = useSegments();
  const { triggerRefresh } = useCalendarRefresh();
  const [perfil, setPerfil] = useState<PerfilChispa | null>(null);
  const [activo, setActivo] = useState(false);
  // Briefing proactivo (Sesion 6): default ON, distinto de asistenteAgendaActivo
  // (que por defecto es false). Una clave ausente en negocio_config NO debe
  // apagar el briefing ya en produccion para salones existentes.
  const [briefingActivo, setBriefingActivo] = useState(true);

  // Mismo criterio de rutas publicas que app/_layout.tsx: en ellas no hay
  // sesion de staff y la IA de gestion no debe aparecer.
  const grupo = String(segments[0]);
  const isPublicRoute = ['r', 'resena', 'cita', 'pago', 'presupuesto', 'contacto'].includes(grupo);
  const isLogin = grupo === 'login';

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancel = false;

    async function cargar() {
      const p = await getUserProfile();
      if (cancel) return;
      if (!p || !p.negocio_id) { setPerfil(null); setActivo(false); return; }
      const { data: cfgRow } = await supabase
        .from('negocio_config')
        .select('config')
        .eq('negocio_id', p.negocio_id)
        .maybeSingle();
      if (cancel) return;
      const cfg = (cfgRow?.config ?? {}) as Record<string, unknown>;
      setPerfil({ id: p.id, role: p.role, negocio_id: p.negocio_id });
      setActivo(cfg.asistenteAgendaActivo === true);
      setBriefingActivo(cfg.briefingProactivoActivo !== false);
    }

    void cargar();
    // La demo compartida entra sola tras el montaje (signInDemoViewer); reintenta
    // al cambiar la sesion para no quedarnos sin perfil por la carrera inicial.
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void cargar(); });
    return () => { cancel = true; sub.subscription.unsubscribe(); };
  }, []);

  if (Platform.OS !== 'web') return null;
  if (isPublicRoute || isLogin) return null;
  if (!activo || !perfil) return null;

  return <ChispaPanel negocioId={perfil.negocio_id} profile={perfil} onAgendaChanged={triggerRefresh} briefingActivo={briefingActivo} />;
}

export default ChispaLauncher;
