import { useCallback, useEffect, useState } from 'react';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile, invalidateAuthCache } from '@/lib/auth';

// Aviso de primera visita a una pagina + reapertura del manual bajo demanda. El estado
// de "visto" vive en profiles.paginas_manual_vistas (por persona, cruza dispositivos).
// La cuenta demo compartida queda exenta: nunca escribe en el perfil compartido, y no
// muestra el aviso (igual que el gate de privacidad hace con IS_DEMO_MODE).

export interface PaginaManualVista {
  loading: boolean;
  visto: boolean;
  marcarVisto: () => void;
}

export function usePaginaManualVista(pageKey: string): PaginaManualVista {
  const [loading, setLoading] = useState(true);
  // Por defecto true mientras carga: evita que el banner parpadee un instante en cada
  // visita antes de saber el estado real.
  const [visto, setVisto] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [vistas, setVistas] = useState<Record<string, string>>({});

  useEffect(() => {
    if (IS_DEMO_MODE) { setLoading(false); setVisto(true); return; }
    let cancel = false;
    (async () => {
      const profile = await getUserProfile();
      if (cancel) return;
      const v = profile?.paginas_manual_vistas ?? {};
      setUserId(profile?.id ?? null);
      setVistas(v);
      setVisto(!!v[pageKey]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [pageKey]);

  const marcarVisto = useCallback(() => {
    if (IS_DEMO_MODE || !userId || visto) return;
    const actualizadas = { ...vistas, [pageKey]: new Date().toISOString() };
    setVisto(true);
    setVistas(actualizadas);
    supabase.from('profiles').update({ paginas_manual_vistas: actualizadas }).eq('id', userId)
      .then(() => invalidateAuthCache());
  }, [userId, pageKey, visto, vistas]);

  return { loading, visto, marcarVisto };
}
