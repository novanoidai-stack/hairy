// Chispa — mascota animada de Mecha. Ahora usa la imagen generada por IA
// (chispa-avatar.png) en vez del SVG anterior, con animaciones de glow pulsante,
// respiración (float) y reacción al mood.
import { useEffect, useRef } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export type ChispaMood = 'idle' | 'wave' | 'think' | 'happy' | 'confused';

const MASCOTA_STYLES = `
  @keyframes chispaFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
  @keyframes chispaGlow {
    0%, 100% { box-shadow: 0 0 8px 2px rgba(244,80,30,0.25), 0 0 20px 4px rgba(255,140,66,0.12); }
    50% { box-shadow: 0 0 14px 4px rgba(244,80,30,0.40), 0 0 32px 8px rgba(255,140,66,0.20); }
  }
  @keyframes chispaThink {
    0%, 100% { box-shadow: 0 0 8px 2px rgba(224,138,0,0.25); }
    50% { box-shadow: 0 0 16px 6px rgba(224,138,0,0.40); }
  }
  @keyframes chispaHappy {
    0%, 100% { box-shadow: 0 0 8px 2px rgba(15,157,107,0.25); transform: scale(1) translateY(0); }
    50% { box-shadow: 0 0 16px 6px rgba(15,157,107,0.35); transform: scale(1.06) translateY(-3px); }
  }
  @keyframes chispaSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .chispa-avatar-idle { animation: chispaFloat 3s ease-in-out infinite, chispaGlow 3s ease-in-out infinite; }
  .chispa-avatar-think { animation: chispaFloat 2s ease-in-out infinite, chispaThink 1.5s ease-in-out infinite; }
  .chispa-avatar-happy { animation: chispaHappy 1.8s ease-in-out infinite; }
  .chispa-avatar-wave { animation: chispaFloat 2s ease-in-out infinite, chispaGlow 2s ease-in-out infinite; }
  .chispa-avatar-confused { animation: chispaFloat 4s ease-in-out infinite; }
  .chispa-avatar-static { box-shadow: 0 0 8px 2px rgba(244,80,30,0.20); }
  @media (prefers-reduced-motion: reduce) {
    .chispa-avatar-idle, .chispa-avatar-think, .chispa-avatar-happy,
    .chispa-avatar-wave, .chispa-avatar-confused { animation: none !important; }
  }
`;

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

// URL del avatar. En produccion (Vercel) web/ es la raiz; en la SPA
// exportada (/app/*) la imagen esta en /chispa-avatar.png.
const AVATAR_URL = '/chispa-avatar.png';

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

  const cls = animar ? `chispa-avatar-${mood}` : 'chispa-avatar-static';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none' }}>
      <img
        src={AVATAR_URL}
        alt="Chispa"
        className={cls}
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        }}
      />
      {showLabel && (
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.textTertiary, marginTop: -2 }}>Chispa</div>
      )}
    </div>
  );
}

export default ChispaMascota;
