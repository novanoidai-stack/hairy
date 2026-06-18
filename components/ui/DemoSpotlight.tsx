import { useEffect, useState } from 'react';

// Enfoque tipo "spotlight" para la demo guiada: oscurece toda la app y deja
// clara solo la zona que se esta explicando (con borde luminoso de acento).
// Es la alternativa a las flechas: en vez de senalar un pixel, recorta la zona.
//
// Tecnica: un unico div colocado sobre el rect del objetivo con una sombra
// gigante (box-shadow spread 9999px) que pinta de oscuro TODO menos el hueco.
// pointer-events:none -> es solo visual, no bloquea clics (la demo sigue viva).
//
// Solo se usa en web (lo importan archivos .web.tsx). Mide con
// getBoundingClientRect en coordenadas de viewport y se posiciona con fixed,
// que dentro del iframe de la demo equivale al viewport de la app.

type Rect = { top: number; left: number; width: number; height: number };

export function DemoSpotlight({
  targetRef,
  active,
  padding = 10,
  radius = 14,
  label,
}: {
  targetRef: { current: HTMLElement | null };
  active: boolean;
  padding?: number;
  radius?: number;
  label?: string;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!active) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = targetRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        // Evita parpadeos cuando aun no esta colocado (height 0)
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }
      }
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [active, targetRef]);

  if (!active || !rect) return null;

  const top = rect.top - padding;
  const left = rect.left - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;
  // Coloca la etiqueta arriba del hueco salvo que no quepa (entonces, debajo).
  const labelOnTop = top > 40;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top,
          left,
          width,
          height,
          borderRadius: radius,
          boxShadow:
            '0 0 0 9999px rgba(4,3,2,0.85), 0 0 0 2px rgba(244,80,30,0.95), 0 0 34px 6px rgba(244,80,30,0.42)',
          transition: 'top 0.4s cubic-bezier(0.34,1.56,0.64,1), left 0.4s cubic-bezier(0.34,1.56,0.64,1), width 0.4s ease, height 0.4s ease',
        }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: labelOnTop ? top - 30 : top + height + 8,
            left: Math.max(12, left),
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#fff',
            background: 'rgba(18,13,10,0.9)',
            padding: '5px 11px',
            borderRadius: 8,
            border: '1px solid rgba(244,80,30,0.5)',
            boxShadow: '0 8px 20px -6px rgba(0,0,0,0.6)',
            transition: 'top 0.4s ease, left 0.4s ease',
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
