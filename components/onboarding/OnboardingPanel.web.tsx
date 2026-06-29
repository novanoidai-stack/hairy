import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import {
  ONBOARDING_STEPS,
  type OnboardingStepDef,
  type OnboardingStepId,
  type OnboardingLevel,
} from '@/lib/onboarding';
import { OIcon } from './OnboardingIcons';

interface Props {
  isMobile: boolean;
  done: Record<OnboardingStepId, boolean>;
  coreCompletados: number;
  coreTotal: number;
  skipped: OnboardingStepId[];
  onSkip: (id: OnboardingStepId) => void;
  onUnskip: (id: OnboardingStepId) => void;
  onNavigate: (step: OnboardingStepDef) => void;
  onClose: () => void;
}

const LEVEL_META: Record<OnboardingLevel, { label: string; color: string; soft: string }> = {
  imprescindible: { label: 'Imprescindible', color: T.primary, soft: T.primarySoft },
  necesario: { label: 'Necesario', color: T.warning, soft: T.warningSoft },
  recomendado: { label: 'Recomendado', color: T.textTer, soft: 'rgba(115,102,88,0.12)' },
};

const PANEL_ANIM = `
  @keyframes obFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes obPop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes obSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) {
    .ob-backdrop, .ob-card { animation: none !important; }
  }
`;

export default function OnboardingPanel({
  isMobile, done, coreCompletados, coreTotal, skipped, onSkip, onUnskip, onNavigate, onClose,
}: Props) {
  const operativo = coreCompletados >= coreTotal;
  const firstRecomendadoIdx = ONBOARDING_STEPS.findIndex((s) => s.nivel === 'recomendado');

  const cardStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', animation: 'obSheet 0.3s cubic-bezier(0.16,1,0.3,1)' }
    : { position: 'relative', width: 'min(560px, 94vw)', maxHeight: '88vh', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, boxShadow: '0 30px 80px rgba(20,12,6,0.35)', display: 'flex', flexDirection: 'column', animation: 'obPop 0.32s cubic-bezier(0.16,1,0.3,1)' };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PANEL_ANIM }} />
      <div
        className="ob-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,12,6,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20, animation: 'obFade 0.2s ease' }}
      >
        <div className="ob-card" style={cardStyle} onClick={(e) => e.stopPropagation()}>
          {/* Cabecera */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '16px 16px 12px' : '20px 22px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: T.primary, flexShrink: 0 }}>
              <OIcon name="rocket" size={19} color="#fff" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color: T.text }}>Pon en marcha tu salon</div>
              <div style={{ fontSize: 12.5, color: T.textSec }}>Completa lo esencial y queda operativo</div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ display: 'grid', placeItems: 'center', width: isMobile ? 38 : 34, height: isMobile ? 38 : 34, borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}>
              <OIcon name="x" size={17} />
            </button>
          </div>

          {/* Progreso del nucleo */}
          <div style={{ padding: isMobile ? '12px 16px' : '14px 22px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {operativo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.successSoft, border: `1px solid ${T.success}33`, borderRadius: 12 }}>
                <OIcon name="sparkles" size={18} color={T.success} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.success }}>Tu salon ya esta operativo. Lo de abajo es para sacarle mas partido.</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Esenciales para operar</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.primaryHi }}>{coreCompletados}/{coreTotal}</span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'rgba(40,30,24,0.10)', overflow: 'hidden' }}>
                  <div style={{ width: `${coreTotal > 0 ? (coreCompletados / coreTotal) * 100 : 0}%`, height: '100%', borderRadius: 999, background: T.primary, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
              </>
            )}
          </div>

          {/* Lista de pasos */}
          <div style={{ overflowY: 'auto', padding: isMobile ? '12px 16px 24px' : '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ONBOARDING_STEPS.map((step, idx) => (
              <div key={step.id}>
                {idx === firstRecomendadoIdx && (
                  <div style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: T.textTer, fontWeight: 700, margin: '8px 2px 10px' }}>
                    Saca el maximo partido
                  </div>
                )}
                <StepRow
                  step={step}
                  done={!!done[step.id]}
                  skipped={skipped.includes(step.id)}
                  isMobile={isMobile}
                  onNavigate={onNavigate}
                  onSkip={onSkip}
                  onUnskip={onUnskip}
                />
              </div>
            ))}

            <div style={{ fontSize: 11.5, color: T.textTer, lineHeight: 1.5, marginTop: 6, padding: '0 2px' }}>
              Opcional, cuando quieras: la senal con tarjeta y las comisiones del equipo se configuran en Ajustes.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StepRow({ step, done, skipped, isMobile, onNavigate, onSkip, onUnskip }: {
  step: OnboardingStepDef;
  done: boolean;
  skipped: boolean;
  isMobile: boolean;
  onNavigate: (step: OnboardingStepDef) => void;
  onSkip: (id: OnboardingStepId) => void;
  onUnskip: (id: OnboardingStepId) => void;
}) {
  const meta = LEVEL_META[step.nivel];

  // Hecho: fila compacta verde.
  if (done) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', background: T.bgCardHi, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: T.successSoft, flexShrink: 0 }}>
          <OIcon name="check" size={16} color={T.success} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.textSec, textDecoration: 'line-through', textDecorationColor: 'rgba(92,82,73,0.4)' }}>{step.titulo}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.success, background: T.successSoft, borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>Hecho</span>
      </div>
    );
  }

  // Omitido (solo recomendados): fila compacta atenuada con opcion de reactivar.
  if (skipped) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, opacity: 0.7 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'rgba(40,30,24,0.06)', flexShrink: 0 }}>
          <OIcon name={step.icon} size={15} color={T.textMuted} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.textMuted }}>{step.titulo}</span>
        <button onClick={() => onUnskip(step.id)} style={{ background: 'none', border: 'none', color: T.textSec, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Reactivar</button>
      </div>
    );
  }

  // Pendiente: fila completa con explicacion y accion.
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 13 : 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 8 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: meta.soft, flexShrink: 0 }}>
          <OIcon name={step.icon} size={17} color={meta.color} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{step.titulo}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: meta.color, background: meta.soft, borderRadius: 999, padding: '2px 8px' }}>{meta.label}</span>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.5, marginBottom: 11 }}>{step.porque}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onNavigate(step)}
          style={{ flex: isMobile ? 1 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isMobile ? '13px 16px' : '8px 14px', background: T.primary, border: 'none', borderRadius: 9, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          {step.cta}
          <OIcon name="arrowRight" size={15} color="#fff" />
        </button>
        {step.nivel === 'recomendado' && (
          <button
            onClick={() => onSkip(step.id)}
            style={{ padding: isMobile ? '13px 14px' : '8px 12px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 9, color: T.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Omitir
          </button>
        )}
      </div>
    </div>
  );
}
