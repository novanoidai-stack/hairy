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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { CoachMark, type Rect } from '@/components/chispa/CoachMark.web';
import {
  CHISPA_COACH_EVENT,
  guiaParaPagina,
  guiaPorId,
  type CoachGuia,
  type CoachPaso,
} from '@/lib/coachGuias';

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
    // El foco al boton de avance lo gestiona CoachMark al cambiar de paso.
    return () => {
      cancelAnimationFrame(rafRef.current);
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

  // Puntos de progreso (solo si hay mas de un paso).
  const progreso = total > 1 ? (
    <div style={{ display: 'flex', gap: 5 }}>
      {guia.pasos.map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            width: i === idx ? 18 : 6, height: 6, borderRadius: 999,
            background: i === idx ? T.primary : T.border,
            transition: reduce.current ? undefined : 'width 0.25s ease, background 0.25s ease',
          }}
        />
      ))}
    </div>
  ) : undefined;

  return (
    <CoachMark
      rect={rect}
      etiqueta="Chispa te ensena"
      titulo={paso.titulo}
      cuerpo={paso.cuerpo}
      isMobile={isMobile}
      reduce={reduce.current}
      onClose={cerrar}
      onNext={avanzar}
      nextLabel={esUltimo ? 'Entendido' : 'Siguiente'}
      onPrev={hayAnterior ? retroceder : undefined}
      cta={paso.cta?.ruta ? { label: paso.cta.label, onClick: () => { const r = paso.cta!.ruta!; cerrar(); router.push(r as never); } } : undefined}
      progreso={progreso}
    />
  );
}

export default CoachLauncher;
