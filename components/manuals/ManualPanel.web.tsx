import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { ManualContent } from '@/lib/manuals/types';

interface Props {
  content: ManualContent;
  isMobile: boolean;
  onClose: () => void;
}

const PANEL_ANIM = `
  @keyframes mpFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes mpPop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes mpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes pulseHighlight {
    0% { border-color: rgba(244, 80, 30, 0.4); box-shadow: 0 0 0 0 rgba(244, 80, 30, 0.4); }
    70% { border-color: rgba(244, 80, 30, 1); box-shadow: 0 0 0 6px rgba(244, 80, 30, 0.4); }
    100% { border-color: rgba(244, 80, 30, 0.4); box-shadow: 0 0 0 0 rgba(244, 80, 30, 0); }
  }
  .pulse-highlight {
    animation: pulseHighlight 2s infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mp-backdrop, .mp-card { animation: none !important; }
  }
`;

// Panel/modal generico de manual de uso: recibe el contenido de una pagina (lib/manuals/*)
// y renderiza sus secciones. Se abre desde AvisoPrimeraVisita o desde el icono de ayuda
// persistente de la cabecera de la pagina — mismo componente para ambos casos.
// Spec: docs/superpowers/specs/2026-07-03-avisos-manuales-paginas-design.md
export function ManualPanel({ content, isMobile, onClose }: Props) {
  const cardStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column', animation: 'mpSheet 0.3s cubic-bezier(0.16,1,0.3,1)' }
    : { position: 'relative', width: 'min(560px, 94vw)', maxHeight: '88vh', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 20, boxShadow: '0 30px 80px rgba(20,12,6,0.35)', display: 'flex', flexDirection: 'column', animation: 'mpPop 0.32s cubic-bezier(0.16,1,0.3,1)' };

  const getCapturaUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('/app/')) return path;
    const hasAppPrefix = typeof window !== 'undefined' && window.location.pathname.startsWith('/app');
    if (hasAppPrefix) {
      return `/app${path}`;
    }
    return path;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PANEL_ANIM }} />
      <div
        className="mp-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,12,6,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20, animation: 'mpFade 0.2s ease' }}
      >
        <div className="mp-card" style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '16px 16px 12px' : '20px 22px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: T.primary, flexShrink: 0 }}
              dangerouslySetInnerHTML={{ __html: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color: T.text }}>{content.tituloPagina}</div>
              <div style={{ fontSize: 12.5, color: T.textSec }}>Manual de uso</div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ display: 'grid', placeItems: 'center', width: isMobile ? 38 : 34, height: isMobile ? 38 : 34, borderRadius: 9, background: T.bgCard, border: `1px solid ${T.border}`, color: T.textSec, cursor: 'pointer', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: isMobile ? '14px 16px 24px' : '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Intro: para que sirve la pestana. Reutiliza el avisoTexto (que hasta
                ahora solo se veia en el banner de primera visita) para que al abrir
                el manual quede claro de un vistazo el proposito de la pantalla. */}
            {content.avisoTexto && (
              <div style={{ display: 'flex', gap: 10, padding: isMobile ? '12px 14px' : '13px 16px', borderRadius: 12, background: T.primarySoft, border: `1px solid ${T.primary}22` }}>
                <span style={{ display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1, color: T.primary }}
                  dangerouslySetInnerHTML={{ __html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>` }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: T.primaryHi, marginBottom: 3 }}>Para qué sirve</div>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{content.avisoTexto}</div>
                </div>
              </div>
            )}
            {content.secciones.map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>{s.titulo}</div>
                <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, marginBottom: s.captura ? 12 : 0 }}>{s.texto}</div>
                {s.captura && (
                  <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: T.bgCardHi, padding: 12, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                      <img
                        src={getCapturaUrl(s.captura)}
                        alt={s.titulo}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '320px',
                          height: 'auto',
                          borderRadius: 6,
                          objectFit: 'contain',
                          display: 'block',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}
                      />
                      {s.highlight && (
                        <div
                          className="pulse-highlight"
                          style={{
                            position: 'absolute',
                            top: s.highlight.top,
                            left: s.highlight.left,
                            width: s.highlight.width,
                            height: s.highlight.height,
                            border: `3px solid ${T.primary}`,
                            borderRadius: '4px',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
