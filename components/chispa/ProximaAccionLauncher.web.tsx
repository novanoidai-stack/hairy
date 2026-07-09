// S15 · Iniciativa de Chispa: sugiere la próxima mejor acción en contexto.
// Montaje GLOBAL (junto a ChispaLauncher en app/_layout.tsx). Lee la ruta actual
// y los hallazgos del escaneo 24/7 (S13), elige de forma DETERMINISTA la acción
// más valiosa para esa página (lib/proximaAccion) y la ofrece con tacto: una
// tarjeta discreta con "Hacer" (1 clic) y "Ahora no" (la silencia 24h, durable).
// No molesta: solo aparece si hay algo relevante y no silenciado, una vez por
// sesión y clave, y se aparta del camino (z-index por debajo del panel de Chispa).
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { getUserProfile } from '@/lib/auth';
import { cargarHallazgos } from '@/lib/hallazgos';
import { elegirProximaAccion, type SugerenciaProxima } from '@/lib/proximaAccion';
import { sugerenciasSilenciadas, silenciarSugerencia } from '@/lib/sugerenciaSnooze';
import { lanzarCoach } from '@/lib/coachGuias';

// Claves ya atendidas/descartadas en ESTA sesión: no re-molestar al navegar.
const manejadasSesion = new Set<string>();

const KEYFRAMES = '@keyframes pa-in { from { opacity: 0; transform: translate(-50%, 12px) } to { opacity: 1; transform: translate(-50%, 0) } }';

function sevColor(sev: string): string {
  if (sev === 'urgente') return T.danger;
  if (sev === 'alta') return '#fb923c';
  if (sev === 'media') return T.cyan;
  return T.textTertiary;
}

export function ProximaAccionLauncher() {
  const segments = useSegments();
  const router = useRouter();
  const [sugerencia, setSugerencia] = useState<SugerenciaProxima | null>(null);

  const grupo = String(segments[0] ?? '');
  const pagina = grupo === '(tabs)' ? String(segments[1] ?? 'index') : '';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Solo dentro del software (tabs); fuera (login/portal público) no aplica.
    if (grupo !== '(tabs)') { setSugerencia(null); return; }
    let cancel = false;

    (async () => {
      const p = await getUserProfile();
      if (cancel || !p?.negocio_id) { setSugerencia(null); return; }
      const [hallazgos, silenciadas] = await Promise.all([
        cargarHallazgos().catch(() => []),
        sugerenciasSilenciadas().catch(() => new Set<string>()),
      ]);
      if (cancel) return;
      const sug = elegirProximaAccion(pagina, hallazgos, silenciadas);
      // No re-molestar con lo ya atendido/descartado en esta sesión.
      setSugerencia(sug && !manejadasSesion.has(sug.clave) ? sug : null);
    })();

    return () => { cancel = true; };
    // Recalcula al cambiar de página.
  }, [grupo, pagina]);

  if (Platform.OS !== 'web' || !sugerencia) return null;

  const color = sevColor(sugerencia.severidad);

  const hacer = () => {
    manejadasSesion.add(sugerencia.clave);
    const ruta = sugerencia.ruta;
    setSugerencia(null);
    router.push(ruta as never);
  };

  const ahoraNo = () => {
    manejadasSesion.add(sugerencia.clave);
    void silenciarSugerencia(sugerencia.clave, 24);
    setSugerencia(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: isMobile ? 86 : 24,
        width: isMobile ? 'calc(100% - 24px)' : 420,
        maxWidth: 420,
        background: T.bgPanel,
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        boxShadow: '0 18px 44px rgba(20,12,6,0.26)',
        padding: '14px 16px',
        zIndex: 120,
        animation: 'pa-in 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}
      role="status"
    >
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 3l1.8 5.6L19.5 10.4l-5.7 1.8L12 18l-1.8-5.8L4.5 10.4l5.7-1.8L12 3z" stroke={T.primary} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700, marginBottom: 2 }}>Chispa sugiere</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sugerencia.titulo}</div>
          <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.45, marginTop: 2 }}>{sugerencia.cuerpo}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={hacer}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              {sugerencia.cta}
            </button>
            <button
              type="button"
              onClick={ahoraNo}
              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Ahora no
            </button>
            {/* Coach intra-pagina (S16): en vez de irte, Chispa te explica esta
                pantalla in-situ. Entrada proactiva desde la iniciativa (S15). */}
            <button
              type="button"
              onClick={() => { manejadasSesion.add(sugerencia.clave); setSugerencia(null); lanzarCoach(); }}
              style={{ padding: '8px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Enseñame la pantalla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProximaAccionLauncher;
