// Visual compartido del coach/tour de Chispa (S16 + S17).
//
// Dado el rect de un elemento REAL de la pantalla, pinta una capa fija NO
// bloqueante (pointer-events:none, los clics pasan al elemento) con:
//   - un anillo de resalte que envuelve el elemento,
//   - una burbuja de Chispa (pointer-events:auto) que lo explica in-situ.
//
// El calculo de posicion (movil = hoja inferior; escritorio = burbuja anclada),
// el foco al CTA y el respeto de prefers-reduced-motion viven aqui, para que
// tanto el coach intra-pagina (CoachLauncher, S16) como el motor de tours
// (TourLauncher, S17) compartan EXACTAMENTE la misma experiencia. El contenido
// (etiqueta, textos, botones, progreso) lo inyecta cada llamador.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { ChispaMascota } from '@/components/chispa/ChispaMascota.web';

export type Rect = { top: number; left: number; width: number; height: number };

const BUBBLE_W = 320;

export interface CoachMarkProps {
  rect: Rect;
  etiqueta: string;
  titulo: string;
  cuerpo: string;
  isMobile: boolean;
  reduce: boolean;
  onClose: () => void;
  onNext: () => void;
  nextLabel: string;
  onPrev?: () => void;
  // Accion primaria opcional (p.ej. "Hazlo tu" que navega/ejecuta).
  cta?: { label: string; onClick: () => void };
  // Indicador de progreso: puntos (coach) o barra (tour). Lo pinta el llamador.
  progreso?: ReactNode;
}

export function CoachMark({
  rect, etiqueta, titulo, cuerpo, isMobile, reduce,
  onClose, onNext, nextLabel, onPrev, cta, progreso,
}: CoachMarkProps) {
  const nextRef = useRef<HTMLButtonElement | null>(null);

  // Foco al boton de avance al cambiar de paso (teclado + lector de pantalla).
  useEffect(() => {
    const tf = setTimeout(() => nextRef.current?.focus(), 120);
    return () => clearTimeout(tf);
  }, [titulo]);

  const pad = 8;
  const ringTop = rect.top - pad;
  const ringLeft = rect.left - pad;
  const ringW = rect.width + pad * 2;
  const ringH = rect.height + pad * 2;

  const trans = reduce
    ? undefined
    : 'top 0.32s cubic-bezier(0.34,1.56,0.64,1), left 0.32s cubic-bezier(0.34,1.56,0.64,1), width 0.28s ease, height 0.28s ease';

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  let bubbleStyle: CSSProperties;
  if (isMobile) {
    bubbleStyle = { position: 'fixed', left: 12, right: 12, bottom: 92, maxWidth: 520, margin: '0 auto' };
  } else {
    const debajo = ringTop + ringH + 12 + 190 < vh;
    const top = debajo ? ringTop + ringH + 12 : Math.max(12, ringTop - 12 - 190);
    let left = rect.left + rect.width / 2 - BUBBLE_W / 2;
    left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12));
    bubbleStyle = { position: 'fixed', top, left, width: BUBBLE_W };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2147483200, pointerEvents: 'none' }}>
      {/* Anillo de resalte (no bloquea clics: puedes usar el elemento) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: ringTop, left: ringLeft, width: ringW, height: ringH,
          borderRadius: 14, border: `2px solid ${T.primary}`,
          boxShadow: '0 0 0 3px rgba(244,80,30,0.18), 0 0 28px 6px rgba(244,80,30,0.34)',
          transition: trans, pointerEvents: 'none',
        }}
      />

      {/* Burbuja de Chispa: explica el elemento in-situ */}
      <div
        role="dialog"
        aria-label={`${etiqueta}: ${titulo}`}
        style={{
          ...bubbleStyle, pointerEvents: 'auto', background: T.bgPanel,
          border: `1px solid ${T.border}`, borderRadius: 16,
          boxShadow: '0 20px 50px rgba(20,12,6,0.30)', padding: 16,
          fontFamily: 'Inter, system-ui, sans-serif',
          animation: reduce ? undefined : 'coach-in 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <style>{'@keyframes coach-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }'}</style>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flexShrink: 0 }}>
            <ChispaMascota size={34} showLabel={false} animar={!reduce} mood="wave" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700 }}>
                {etiqueta}
              </span>
              <button
                type="button" onClick={onClose} aria-label="Cerrar la guia"
                style={{ border: 'none', background: 'transparent', color: T.textTertiary, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginTop: 2, lineHeight: 1.2 }}>{titulo}</div>
            <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.5, marginTop: 4 }}>{cuerpo}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              {cta && (
                <button
                  type="button" onClick={cta.onClick}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {cta.label}
                </button>
              )}
              {onPrev && (
                <button
                  type="button" onClick={onPrev}
                  style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Anterior
                </button>
              )}
              <button
                ref={nextRef} type="button" onClick={onNext}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: cta ? 'transparent' : T.primary,
                  color: cta ? T.primaryHi : '#fff',
                  boxShadow: cta ? `inset 0 0 0 1px ${T.border}` : undefined,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto',
                }}
              >
                {nextLabel}
              </button>
            </div>

            {progreso ? <div style={{ marginTop: 12 }}>{progreso}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachMark;
