// S17 (plan IA Chispa V3) — Motor de tours y redirecciones guiadas.
//
// Montaje GLOBAL (junto a ChispaLauncher/ProximaAccionLauncher/CoachLauncher en
// app/_layout.tsx). Escucha CHISPA_TOUR_EVENT (lib/tours.ts) y guia un flujo
// MULTI-PANTALLA: navega a la ruta de cada paso, ancla el mismo coach mark que
// S16 (CoachMark) sobre un elemento real de esa pantalla, muestra una barra de
// progreso y avanza confirmando. Reanudable (progreso durable en localStorage)
// y abandonable en cualquier momento (Salir / Esc / boton cerrar).
//
// Robustez: si tras navegar el ancla no aparece en unos segundos (p.ej. una
// seccion oculta por rol), el motor avanza solo al siguiente paso en vez de
// dejar al usuario encallado. Nunca bloquea la pagina (CoachMark es no
// bloqueante). Movil primero.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { CoachMark, type Rect } from '@/components/chispa/CoachMark.web';
import {
  CHISPA_TOUR_EVENT, tourPorId, leerProgresoTour, guardarProgresoTour, limpiarProgresoTour,
  type Tour,
} from '@/lib/tours';

function prefiereMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TourLauncher() {
  const segments = useSegments();
  const router = useRouter();

  const grupo = String(segments[0] ?? '');
  const pagina = grupo === '(tabs)' ? String(segments[1] ?? 'index') : '';

  const [tour, setTour] = useState<Tour | null>(null);
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

  // Salir: cierra el tour PERO conserva el progreso (reanudable). Solo al
  // terminarlo del todo se limpia.
  const salir = useCallback(() => {
    setTour(null);
    setRect(null);
  }, []);

  const finalizar = useCallback(() => {
    limpiarProgresoTour();
    setTour(null);
    setRect(null);
    setIdx(0);
  }, []);

  // Arranque desde el evento global.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tourId?: string; reiniciar?: boolean } | undefined;
      const t = detail?.tourId ? tourPorId(detail.tourId) : undefined;
      if (!t) return;
      let inicio = 0;
      if (!detail?.reiniciar) {
        const prog = leerProgresoTour();
        if (prog && prog.id === t.id && prog.idx > 0 && prog.idx < t.pasos.length) inicio = prog.idx;
      }
      reduce.current = prefiereMenosMovimiento();
      setTour(t);
      setIdx(inicio);
    };
    window.addEventListener(CHISPA_TOUR_EVENT, handler);
    return () => window.removeEventListener(CHISPA_TOUR_EVENT, handler);
  }, []);

  // Esc abandona.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') salir(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, salir]);

  const total = tour ? tour.pasos.length : 0;
  const esUltimo = tour ? idx >= total - 1 : false;

  const avanzar = useCallback(() => {
    if (!tour) return;
    if (idx >= tour.pasos.length - 1) { finalizar(); return; }
    setIdx(idx + 1);
  }, [tour, idx, finalizar]);

  const retroceder = useCallback(() => {
    if (idx > 0) setIdx(idx - 1);
  }, [idx]);

  // Navega al paso y sigue el ancla en pantalla (rAF). Si no aparece a tiempo,
  // avanza solo para no encallar. Guarda progreso en cada paso (reanudable).
  useEffect(() => {
    if (Platform.OS !== 'web' || !tour) return;
    const paso = tour.pasos[idx];
    if (!paso) { finalizar(); return; }

    guardarProgresoTour(tour.id, idx);

    // Redireccion guiada: llevar al usuario a la pantalla del paso.
    if (pagina !== paso.pagina) {
      try { router.push(paso.ruta as never); } catch { /* ruta invalida: se ignora */ }
    }

    setRect(null);
    let scrolled = false;
    const deadline = Date.now() + 4000;
    const loop = () => {
      const el = document.querySelector(paso.target) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          if (!scrolled) {
            scrolled = true;
            try { el.scrollIntoView({ behavior: reduce.current ? 'auto' : 'smooth', block: 'center', inline: 'nearest' }); } catch { el.scrollIntoView(); }
          }
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }
      } else if (Date.now() > deadline) {
        // El ancla no aparecio (rol/movil): avanza para no dejar al usuario colgado.
        cancelAnimationFrame(rafRef.current);
        avanzar();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafRef.current);
    // `pagina` en deps: al completarse la navegacion se re-mide sobre la pantalla ya montada.
  }, [tour, idx, pagina, router, avanzar, finalizar]);

  if (Platform.OS !== 'web' || !tour || !rect) return null;

  const paso = tour.pasos[idx];
  if (!paso) return null;

  const progreso = (
    <div>
      <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 600, marginBottom: 5 }}>
        {tour.titulo} · paso {idx + 1} de {total}
      </div>
      <div style={{ height: 5, borderRadius: 999, background: T.border, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', width: `${((idx + 1) / total) * 100}%`,
            background: T.primary, borderRadius: 999,
            transition: reduce.current ? undefined : 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );

  return (
    <CoachMark
      rect={rect}
      etiqueta="Tour guiado"
      titulo={paso.titulo}
      cuerpo={paso.cuerpo}
      isMobile={isMobile}
      reduce={reduce.current}
      onClose={salir}
      onNext={avanzar}
      nextLabel={esUltimo ? 'Finalizar' : 'Siguiente'}
      onPrev={idx > 0 ? retroceder : undefined}
      progreso={progreso}
    />
  );
}

export default TourLauncher;
