// S16 (plan IA Chispa V3) — Motor del coach intra-pagina.
//
// Montaje GLOBAL (junto a ChispaLauncher/ProximaAccionLauncher en
// app/_layout.tsx). Escucha el evento CHISPA_COACH_EVENT (lib/coachGuias.ts),
// resuelve la guia de la pagina actual y va resaltando elementos REALES de la
// pantalla in-situ (coach mark), sin sacarte de donde estas.
//
// Diseno clave (frente al DemoSpotlight, que oscurece toda la app):
//   - NO bloquea la pagina: la capa es pointer-events:none y el anillo tambien,
//     asi que los clics pasan al elemento resaltado (puedes usarlo mientras te
//     lo explico). Solo la burbuja captura eventos.
//   - Sigue al elemento: mide su rect con requestAnimationFrame (aguanta scroll,
//     resize y animaciones de entrada).
//   - Encadena pasos ("y aqui...") sin navegar.
//   - Robusto: si un ancla no existe en esta vista (rol/movil), salta el paso;
//     nunca senala un elemento inexistente. Si no queda ninguno, se cierra.
//   - Accesible: role dialog, foco al abrir/cambiar de paso, Esc cierra,
//     respeta prefers-reduced-motion. Movil primero (burbuja como hoja inferior).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { ChispaMascota } from '@/components/chispa/ChispaMascota.web';
import {
  CHISPA_COACH_EVENT,
  guiaParaPagina,
  guiaPorId,
  type CoachGuia,
  type CoachPaso,
} from '@/lib/coachGuias';

type Rect = { top: number; left: number; width: number; height: number };

const BUBBLE_W = 320;

function prefiereMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CoachLauncher() {
  const segments = useSegments();
  const router = useRouter();

  const grupo = String(segments[0] ?? '');
  const pagina = grupo === '(tabs)' ? String(segments[1] ?? 'index') : '';

  const [guia, setGuia] = useState<CoachGuia | null>(null);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768,
  );
  const reduce = useRef(prefiereMenosMovimiento());
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cerrar = useCallback(() => {
    setGuia(null);
    setRect(null);
    setIdx(0);
  }, []);

  // Devuelve el primer paso (desde `desde`) cuyo ancla existe HOY en el DOM.
  // Si ninguno existe, devuelve -1 (el llamador cierra el coach).
  const primerPasoVisible = useCallback((g: CoachGuia, desde: number): number => {
    for (let i = desde; i < g.pasos.length; i++) {
      const el = document.querySelector(g.pasos[i].target);
      if (el) return i;
    }
    return -1;
  }, []);

  // Arranque: escucha el evento global (desde el panel, la iniciativa, etc.).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { guiaId?: string } | undefined;
      const g = detail?.guiaId ? guiaPorId(detail.guiaId) : guiaParaPagina(pagina || 'index');
      if (!g) return;
      const primero = primerPasoVisible(g, 0);
      if (primero < 0) return; // nada que resaltar en esta pantalla
      reduce.current = prefiereMenosMovimiento();
      setGuia(g);
      setIdx(primero);
    };
    window.addEventListener(CHISPA_COACH_EVENT, handler);
    return () => window.removeEventListener(CHISPA_COACH_EVENT, handler);
  }, [pagina, primerPasoVisible]);

  // Esc cierra.
  useEffect(() => {
    if (!guia) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guia, cerrar]);

  const paso: CoachPaso | null = guia ? guia.pasos[idx] ?? null : null;

  // Al cambiar de paso: trae el elemento a la vista y mide su rect en bucle.
  useEffect(() => {
    if (!paso) return;
    const el = document.querySelector(paso.target) as HTMLElement | null;
    if (!el) {
      // El ancla desaparecio (p.ej. tras navegar): busca el siguiente visible.
      if (guia) {
        const sig = primerPasoVisible(guia, idx + 1);
        if (sig >= 0) setIdx(sig);
        else cerrar();
      }
      return;
    }
    try {
      el.scrollIntoView({ behavior: reduce.current ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    } catch {
      el.scrollIntoView();
    }
    const medir = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      rafRef.current = requestAnimationFrame(medir);
    };
    medir();
    // Foco al CTA para que teclado/lector lo anuncien.
    const tf = setTimeout(() => ctaRef.current?.focus(), 120);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(tf);
    };
  }, [paso, idx, guia, primerPasoVisible, cerrar]);

  if (Platform.OS !== 'web' || !guia || !paso || !rect) return null;

  const total = guia.pasos.length;
  const esUltimo = primerPasoVisible(guia, idx + 1) < 0;

  const avanzar = () => {
    if (esUltimo) { cerrar(); return; }
    const sig = primerPasoVisible(guia, idx + 1);
    if (sig >= 0) setIdx(sig); else cerrar();
  };
  const retroceder = () => {
    // Busca hacia atras el paso visible anterior.
    for (let i = idx - 1; i >= 0; i--) {
      if (document.querySelector(guia.pasos[i].target)) { setIdx(i); return; }
    }
  };
  const hayAnterior = (() => {
    for (let i = idx - 1; i >= 0; i--) {
      if (document.querySelector(guia.pasos[i].target)) return true;
    }
    return false;
  })();

  const pad = 8;
  const ringTop = rect.top - pad;
  const ringLeft = rect.left - pad;
  const ringW = rect.width + pad * 2;
  const ringH = rect.height + pad * 2;

  const trans = reduce.current
    ? undefined
    : 'top 0.32s cubic-bezier(0.34,1.56,0.64,1), left 0.32s cubic-bezier(0.34,1.56,0.64,1), width 0.28s ease, height 0.28s ease';

  // Colocacion de la burbuja. Movil: hoja inferior fija (por encima del tab bar).
  // Escritorio: debajo del elemento si cabe, si no encima; centrada en su ancho
  // y siempre dentro del viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  let bubbleStyle: CSSProperties;
  if (isMobile) {
    bubbleStyle = {
      position: 'fixed',
      left: 12,
      right: 12,
      bottom: 92,
      maxWidth: 520,
      margin: '0 auto',
    };
  } else {
    const debajo = ringTop + ringH + 12 + 190 < vh; // ~190 alto estimado burbuja
    const top = debajo ? ringTop + ringH + 12 : Math.max(12, ringTop - 12 - 190);
    let left = rect.left + rect.width / 2 - BUBBLE_W / 2;
    left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12));
    bubbleStyle = { position: 'fixed', top, left, width: BUBBLE_W };
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2147483200, pointerEvents: 'none' }}
    >
      {/* Anillo de resalte (no bloquea clics: puedes usar el elemento) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: ringTop,
          left: ringLeft,
          width: ringW,
          height: ringH,
          borderRadius: 14,
          border: `2px solid ${T.primary}`,
          boxShadow: '0 0 0 3px rgba(244,80,30,0.18), 0 0 28px 6px rgba(244,80,30,0.34)',
          transition: trans,
          pointerEvents: 'none',
        }}
      />

      {/* Burbuja de Chispa: explica el elemento in-situ */}
      <div
        role="dialog"
        aria-label={`Chispa te ensena: ${paso.titulo}`}
        style={{
          ...bubbleStyle,
          pointerEvents: 'auto',
          background: T.bgPanel,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(20,12,6,0.30)',
          padding: 16,
          fontFamily: 'Inter, system-ui, sans-serif',
          animation: reduce.current ? undefined : 'coach-in 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <style>{'@keyframes coach-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }'}</style>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flexShrink: 0 }}>
            <ChispaMascota size={34} showLabel={false} animar={!reduce.current} mood="wave" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700 }}>
                Chispa te ensena
              </span>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar la guia"
                style={{ border: 'none', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginTop: 2, lineHeight: 1.2 }}>{paso.titulo}</div>
            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5, marginTop: 4 }}>{paso.cuerpo}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              {paso.cta?.ruta && (
                <button
                  type="button"
                  onClick={() => { const r = paso.cta!.ruta!; cerrar(); router.push(r as never); }}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {paso.cta.label}
                </button>
              )}
              {hayAnterior && (
                <button
                  type="button"
                  onClick={retroceder}
                  style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Anterior
                </button>
              )}
              <button
                ref={ctaRef}
                type="button"
                onClick={avanzar}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: paso.cta?.ruta ? 'transparent' : T.primary,
                  color: paso.cta?.ruta ? T.primaryHi : '#fff',
                  boxShadow: paso.cta?.ruta ? `inset 0 0 0 1px ${T.border}` : undefined,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto',
                }}
              >
                {esUltimo ? 'Entendido' : 'Siguiente'}
              </button>
            </div>

            {total > 1 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
                {guia.pasos.map((_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    style={{
                      width: i === idx ? 18 : 6,
                      height: 6,
                      borderRadius: 999,
                      background: i === idx ? T.primary : T.border,
                      transition: reduce.current ? undefined : 'width 0.25s ease, background 0.25s ease',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachLauncher;
