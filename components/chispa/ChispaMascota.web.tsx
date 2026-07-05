// Chispa — mascota animada de Mecha (llama del logo). Persona UNICA de la capa
// de IA: la comparten el asistente de onboarding y Chispa transversal, para que
// la voz/estetica sea la misma en toda la app (tokens fuego #f4501e/#c0260a).
// Extraida de OnboardingAgentOverlay.web.tsx para no duplicar la persona.
import { useEffect, useRef } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export type ChispaMood = 'idle' | 'wave' | 'think' | 'happy' | 'confused';

const MASCOTA_STYLES = `
  @keyframes chispaFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes chispaBlink { 0%,92%,100% { transform: scaleY(1); } 96% { transform: scaleY(0.05); } }
  @keyframes chispaWave { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(15deg); } 75% { transform: rotate(-10deg); } }
  @keyframes chispaPulse { 0%, 100% { transform: scale(0.88); opacity: 0.5; } 50% { transform: scale(1.05); opacity: 0.95; } }
  .chispa-body { animation: chispaFloat 3s ease-in-out infinite; }
  .chispa-eye { animation: chispaBlink 4s ease-in-out infinite; transform-origin: center; }
  .chispa-arm { animation: chispaWave 2.5s ease-in-out infinite; transform-origin: 50% 100%; }
  @media (prefers-reduced-motion: reduce) {
    .chispa-body, .chispa-eye, .chispa-arm { animation: none !important; }
  }
`;

// Inyecta las keyframes una sola vez por documento (idempotente).
function useMascotaStyles() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (typeof document === 'undefined') return;
    if (document.getElementById('chispa-mascota-styles')) return;
    const el = document.createElement('style');
    el.id = 'chispa-mascota-styles';
    el.textContent = MASCOTA_STYLES;
    document.head.appendChild(el);
  }, []);
}

export function ChispaMascota({
  mood = 'idle',
  size = 80,
  showLabel = true,
  animar = true,
}: {
  mood?: ChispaMood;
  size?: number;
  showLabel?: boolean;
  animar?: boolean;
}) {
  useMascotaStyles();

  const flameColor = mood === 'confused' ? '#e8644a' : mood === 'happy' ? '#ff8c42' : '#f4501e';
  const eyeExpr = mood === 'happy' ? 'U' : mood === 'confused' ? '?' : null; // null = circulos
  const mouthPath =
    mood === 'happy' ? 'M 28 52 Q 36 60 44 52' :
    mood === 'confused' ? 'M 30 54 Q 36 50 42 54' :
    mood === 'think' ? 'M 30 52 L 42 52' :
    'M 28 52 Q 36 58 44 52'; // idle/wave = sonrisa

  const bodyCls = animar ? 'chispa-body' : undefined;
  const eyeCls = animar ? 'chispa-eye' : undefined;
  const armCls = animar ? 'chispa-arm' : undefined;
  const height = Math.round((size * 88) / 80);

  return (
    <div className={bodyCls} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none' }}>
      <svg viewBox="0 0 72 80" width={size} height={height} style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 12px rgba(244,80,30,0.25))' }} aria-hidden="true">
        <defs>
          <radialGradient id="chispaGlow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor={flameColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={flameColor} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="chispaFlame" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#ffcf4a" />
            <stop offset="40%" stopColor="#ff8c42" />
            <stop offset="100%" stopColor={flameColor} />
          </linearGradient>
        </defs>
        <ellipse cx="36" cy="44" rx="38" ry="38" fill="url(#chispaGlow)" />

        {/* Cuerpo de llama */}
        <path d="M 36 4 C 46 12, 58 24, 58 40 C 58 56, 48 68, 36 68 C 24 68, 14 56, 14 40 C 14 24, 26 12, 36 4 Z" fill="url(#chispaFlame)" stroke="rgba(40,30,24,0.08)" strokeWidth="1" />
        {/* Core interior */}
        <path d="M 36 20 C 42 28, 48 34, 48 44 C 48 54, 42 60, 36 60 C 30 60, 24 54, 24 44 C 24 34, 30 28, 36 20 Z" fill="rgba(255,220,130,0.5)" />

        {/* Ojos */}
        {eyeExpr === 'U' ? (
          <>
            <path d="M 27 38 Q 29 42 31 38" stroke="#3d2a1e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M 41 38 Q 43 42 45 38" stroke="#3d2a1e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        ) : eyeExpr === '?' ? (
          <>
            <circle className={eyeCls} cx="29" cy="38" r="3.2" fill="#3d2a1e" />
            <circle cx="43" cy="38" r="3.2" fill="#3d2a1e" />
            <circle cx="43" cy="38" r="1.2" fill="#fff" style={{ transform: 'translate(-1px, -1px)' }} />
            <circle cx="29" cy="38" r="1.2" fill="#fff" style={{ transform: 'translate(-1px, -1px)' }} />
          </>
        ) : (
          <>
            <circle className={eyeCls} cx="29" cy="38" r="3" fill="#3d2a1e" />
            <circle className={eyeCls} cx="43" cy="38" r="3" fill="#3d2a1e" />
            <circle cx="30.5" cy="36.5" r="1" fill="rgba(255,255,255,0.8)" />
            <circle cx="44.5" cy="36.5" r="1" fill="rgba(255,255,255,0.8)" />
          </>
        )}

        {/* Boca */}
        <path d={mouthPath} stroke="#3d2a1e" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Brazo saludando */}
        {mood === 'wave' && (
          <g className={armCls}>
            <path d="M 54 44 C 60 40, 64 34, 62 28" stroke={flameColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <circle cx="62" cy="27" r="3" fill="#ffcf4a" />
          </g>
        )}

        {/* Pensando */}
        {mood === 'think' && (
          <>
            <circle cx="58" cy="18" r="2.5" fill="rgba(40,30,24,0.12)" />
            <circle cx="62" cy="12" r="3.5" fill="rgba(40,30,24,0.1)" />
            <circle cx="64" cy="5" r="4.5" fill="rgba(40,30,24,0.08)" />
          </>
        )}
      </svg>
      {showLabel && (
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.textTertiary, marginTop: -2 }}>Chispa</div>
      )}
    </div>
  );
}

export default ChispaMascota;
