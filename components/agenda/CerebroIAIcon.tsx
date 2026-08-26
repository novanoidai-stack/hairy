import React, { useEffect, useMemo, useState } from 'react';

// Icono "cerebro IA" del organizador de agenda (ago-2026). Identidad visual de
// la capa inteligente: un cerebro SVG con gradientes violeta-cian-magenta, un
// pulso de glow exterior y una "onda neuronal" que recorre las circunvoluciones.
//
// Variantes:
// - idle: animacion suave y lenta (boton "Organizar" de la rejilla).
// - thinking: mas rapida e intensa (mientras el modelo de IA razona).
// - alerta: cuando hay problemas detectados, el glow pulsa en ambar/rojo.
//
// Accesibilidad: respeta prefers-reduced-motion (queda estatico, sin animar).

export type CerebroIAVariant = 'idle' | 'thinking' | 'alerta';

interface CerebroIAIconProps {
  size?: number;
  variant?: CerebroIAVariant;
  /** Intensidad del glow exterior (0-1). Default segun variante. */
  glow?: number;
  style?: React.CSSProperties;
}

// Keyframes globales (una sola vez por pagina). Nombres prefijados cerebroIA-
// para no chocar con iaAuroraWave/iaBeamFloat de AgendaCalendar.
const KEYFRAMES = `
@keyframes cerebroIA-pulso {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.06); }
}
@keyframes cerebroIA-onda {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -120; }
}
@keyframes cerebroIA-glow {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.9; }
}
@keyframes cerebroIA-sinapsis {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  25% { opacity: 1; }
  60% { opacity: 0.6; transform: translate(3px, -2px) scale(1); }
  100% { opacity: 0; transform: translate(6px, -4px) scale(0.3); }
}
@keyframes cerebroIA-rotar {
  0% { transform: rotate(0deg) translateX(1px); }
  100% { transform: rotate(360deg) translateX(1px); }
}
@media (prefers-reduced-motion: reduce) {
  .cerebroIA-anim { animation: none !important; }
}
`;

let estilosInyectados = false;
function usarKeyframes() {
  if (estilosInyectados || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.id = 'cerebroIA-keyframes';
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
  estilosInyectados = true;
}

// Ids de gradiente unicos por instancia: si hay varios iconos en pantalla, cada
// uno necesita sus propios <linearGradient> (los ids duplicados se pisan).
let contador = 0;

export default function CerebroIAIcon({
  size = 22,
  variant = 'idle',
  glow,
  style,
}: CerebroIAIconProps) {
  usarKeyframes();
  const uid = useMemo(() => `cerebroIA-${++contador}`, []);
  const [reducirMovimiento, setReducirMovimiento] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const upd = () => setReducirMovimiento(mq.matches);
    upd();
    mq.addEventListener?.('change', upd);
    return () => mq.removeEventListener?.('change', upd);
  }, []);

  const pensando = variant === 'thinking';
  const alerta = variant === 'alerta';
  const glowBase = glow ?? (pensando ? 0.95 : alerta ? 0.8 : 0.5);
  // Duraciones: idle 3.2s, alerta 1.8s, thinking 1.1s (la "mente" acelera).
  const durPulso = pensarDur(pensando, alerta);
  const animar = !reducirMovimiento;

  return (
    <span
      className={animar ? 'cerebroIA-anim' : undefined}
      style={{ display: 'inline-flex', position: 'relative', width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          {/* Gradiente principal del cerebro: violeta -> magenta -> cian */}
          <linearGradient id={`${uid}-corteza`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="0.5" stopColor="#d946ef" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          {/* Onda neuronal que recorre las circunvoluciones */}
          <linearGradient id={`${uid}-onda`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="1" stopColor="#e879f9" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={alerta ? '#f59e0b' : '#a78bfa'} stopOpacity="0.9" />
            <stop offset="1" stopColor={alerta ? '#ef4444' : '#8b5cf6'} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Halo/glow exterior pulsante */}
        <circle
          cx="16" cy="16" r="15" fill={`url(#${uid}-glow)`}
          style={animar ? { animation: `cerebroIA-glow ${durPulso}s ease-in-out infinite`, opacity: glowBase } : { opacity: glowBase * 0.6 }}
        />

        {/* Silueta del cerebro: dos hemisferios con circunvoluciones.
            Path dibujado a mano: lado izquierdo redondeado (lóbulo frontal),
            surco central, lado derecho con dos circunvoluciones. */}
        <g
          style={animar ? { animation: `cerebroIA-pulso ${durPulso}s ease-in-out infinite`, transformOrigin: 'center' } : undefined}
        >
          <path
            d="M15.2 4.5c-2.1-1.4-5.2-1-6.6 1.2-1.6.3-3 1.6-3.2 3.3-1.7.9-2.4 3.1-1.5 4.8-1 1.6-.6 3.9 1 5 .1 1.9 1.7 3.5 3.6 3.6.6 1.7 2.4 2.7 4.2 2.4 1.3-.2 2.3-1 2.8-2.2V6.6c-.4-.9-.9-1.6-2.3-2.1Z"
            fill={`url(#${uid}-corteza)`}
            fillOpacity="0.28"
            stroke={`url(#${uid}-corteza)`}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M16.8 4.5c2.1-1.4 5.2-1 6.6 1.2 1.6.3 3 1.6 3.2 3.3 1.7.9 2.4 3.1 1.5 4.8 1 1.6.6 3.9-1 5-.1 1.9-1.7 3.5-3.6 3.6-.6 1.7-2.4 2.7-4.2 2.4-1.3-.2-2.3-1-2.8-2.2V6.6c.4-.9.9-1.6 2.3-2.1Z"
            fill={`url(#${uid}-corteza)`}
            fillOpacity="0.28"
            stroke={`url(#${uid}-corteza)`}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Circunvoluciones interiores (surcos) */}
          <path
            d="M8.5 10.5c1.5-.8 3-.4 3.8.8M19.7 11.3c1.3-1 2.9-.9 3.9.2M7.8 16.2c1.4.6 2.8.2 3.5-1M20.5 16.8c1.5.5 2.9-.1 3.4-1.3M12 21c1.2.7 2.5.5 3.3-.4"
            stroke={`url(#${uid}-corteza)`}
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.75"
          />
          {/* Tronco / tallo neuronal inferior */}
          <path
            d="M14 25.5c0 1.4-.8 2.3-2 2.8M18 25.5c0 1.4.8 2.3 2 2.8"
            stroke={`url(#${uid}-corteza)`}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>

        {/* Onda neuronal: dashes que recorren un circuito interno */}
        <path
          d="M9 12c2-2 5-2 7 0s5 2 7 0M9 19c2 2 5 2 7 0s5-2 7 0"
          stroke={`url(#${uid}-onda)`}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeDasharray="4 8"
          style={animar ? { animation: `cerebroIA-onda ${pensando ? 1.6 : 3}s linear infinite` } : { opacity: 0.5 }}
        />

        {/* Sinapsis: puntos que destellan y se desplazan */}
        {animar && !reducirMovimiento && (
          <g>
            <circle cx="11" cy="14" r="1" fill="#67e8f9" style={{ animation: `cerebroIA-sinapsis ${pensando ? 1.2 : 2.4}s ease-in-out infinite` }} />
            <circle cx="21" cy="17" r="1" fill="#f0abfc" style={{ animation: `cerebroIA-sinapsis ${pensando ? 1.2 : 2.4}s ease-in-out infinite`, animationDelay: '0.4s' }} />
            <circle cx="16" cy="21.5" r="1" fill="#a5b4fc" style={{ animation: `cerebroIA-sinapsis ${pensando ? 1.2 : 2.4}s ease-in-out infinite`, animationDelay: '0.8s' }} />
          </g>
        )}

        {/* Chispa orbital (solo en thinking): un punto que orbita el cerebro */}
        {animar && pensando && (
          <g style={{ transformOrigin: '16px 16px', animation: 'cerebroIA-rotar 2.2s linear infinite' }}>
            <circle cx="16" cy="3" r="1.3" fill="#fef08a" />
          </g>
        )}
      </svg>
    </span>
  );
}

function pensarDur(pensando: boolean, alerta: boolean): number {
  if (pensando) return 1.1;
  if (alerta) return 1.8;
  return 3.2;
}
