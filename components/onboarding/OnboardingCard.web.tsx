import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { OIcon } from './OnboardingIcons';

interface Props {
  coreCompletados: number;
  coreTotal: number;
  isMobile: boolean;
  onOpen: () => void;
  onHide: () => void;
}

// Tarjeta destacada que vive arriba del desplegable de Avisos. No muestra los pasos:
// es la puerta de entrada al panel (OnboardingPanel), con el progreso del nucleo.
export function OnboardingCard({ coreCompletados, coreTotal, isMobile, onOpen, onHide }: Props) {
  const pct = coreTotal > 0 ? Math.round((coreCompletados / coreTotal) * 100) : 0;
  const faltan = Math.max(0, coreTotal - coreCompletados);

  return (
    <div
      style={{
        background: T.primarySoft,
        border: `1px solid ${T.primaryGlow}`,
        borderRadius: 14,
        padding: isMobile ? 14 : 12,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: T.primary, flexShrink: 0 }}>
          <OIcon name="rocket" size={16} color="#fff" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>Pon en marcha tu salon</div>
          <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 1 }}>
            {faltan === 0 ? 'Ultimo repaso para dejarlo listo' : `Te faltan ${faltan} ${faltan === 1 ? 'paso' : 'pasos'} para estar operativo`}
          </div>
        </div>
      </div>

      {/* Barra de progreso del nucleo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(40,30,24,0.10)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: T.primary, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.primaryHi, flexShrink: 0 }}>{coreCompletados}/{coreTotal}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onOpen}
          className="m-btn-primary"
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isMobile ? '12px 12px' : '8px 12px', background: T.primary, border: 'none', borderRadius: 9, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          Ver los pasos
          <OIcon name="arrowRight" size={15} color="#fff" />
        </button>
        <button
          onClick={onHide}
          title="Ocultar de momento"
          style={{ padding: isMobile ? '12px 12px' : '8px 10px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 9, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
