// InfoDot: icono "i" con explicacion al pasar el raton o pulsar.
// Texto: que mide, en que franja/periodo y para que sirve.
//
// Extraido de app/(tabs)/informes.web.tsx el 9 ago 2026 para que lo puedan usar
// tambien las graficas explicadas y la ficha de cliente, en vez de tener tres
// copias del mismo tooltip.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_W = 224;

// La animacion de entrada se inyecta desde aqui: antes vivia en el <style> de
// informes, asi que al usar el InfoDot en otra pantalla el tooltip aparecia de
// golpe. Se inserta una sola vez por documento.
const CSS_ID = 'infodot-css';
function asegurarCss() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent = `@keyframes infoPop {
    from { opacity: 0; transform: translate(-50%, 4px) scale(0.96); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }`;
  document.head.appendChild(el);
}

export const InfoDot = ({ text, color = '#736658' }: { text: string; color?: string }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  // El tooltip se renderiza en un PORTAL a document.body con position:fixed y sus
  // coords calculadas del ancla. Motivo (Sesion 10 del plan): las tarjetas del
  // dashboard tienen transform (animacion de entrada slideInUp con fill 'both' +
  // hover-lift), lo que crea un stacking context que ATRAPA el z-index del
  // tooltip; en flujo normal la tarjeta/seccion siguiente lo tapaba. Portalarlo
  // a body lo saca de todo stacking context y nunca se solapa.
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);

  const recompute = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const anchorCX = r.left + r.width / 2;
    const half = TOOLTIP_W / 2;
    const margin = 10;
    const vw = window.innerWidth;
    // Recorta el centro para que el tooltip no se salga del viewport...
    const left = Math.min(Math.max(anchorCX, margin + half), vw - margin - half);
    // ...y recoloca la flecha para que siga apuntando al ancla real.
    const arrow = Math.min(Math.max(anchorCX - (left - half), 14), TOOLTIP_W - 14);
    setPos({ left, top: r.bottom + 9, arrow });
  }, []);

  useEffect(() => { asegurarCss(); }, []);

  const show = useCallback(() => { recompute(); setOpen(true); }, [recompute]);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onMove = () => recompute();
    // capture: reposiciona ante el scroll de CUALQUIER contenedor, no solo window.
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, recompute]);

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={anchorRef}
        type="button"
        aria-label="Mas informacion"
        onClick={(e) => { e.stopPropagation(); if (open) hide(); else show(); }}
        style={{
          width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', cursor: 'help', padding: 0, margin: '-14px',
          color, flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 16, height: 16, borderRadius: '50%', border: `1px solid ${color}66`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, lineHeight: 1, fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic', transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}1a`; (e.currentTarget as HTMLElement).style.borderColor = color; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = `${color}66`; }}
        >
          i
        </span>
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed', left: pos.left, top: pos.top, transform: 'translateX(-50%)',
            width: TOOLTIP_W, padding: '10px 12px', borderRadius: 10, zIndex: 120,
            background: '#241d17', color: '#f6f1ea', fontSize: 11.5, lineHeight: 1.5,
            fontWeight: 400, fontStyle: 'normal', textTransform: 'none', letterSpacing: 'normal',
            textAlign: 'left', boxShadow: '0 12px 34px rgba(28,24,20,0.30)', pointerEvents: 'none',
            animation: 'infoPop 0.16s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          <span style={{
            position: 'absolute', bottom: '100%', left: pos.arrow, transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderBottom: '6px solid #241d17',
          }} />
          {text}
        </span>,
        document.body
      )}
    </span>
  );
};

export default InfoDot;
