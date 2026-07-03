import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { ManualContent } from '@/lib/manuals/types';

interface Props {
  content: ManualContent;
  isMobile: boolean;
  onVerManual: () => void;
  onCerrar: () => void;
}

// Banner no bloqueante que aparece la primera vez que el usuario visita una pagina con
// manual (ver usePaginaManualVista). No impide usar la pagina mientras esta visible.
// Spec: docs/superpowers/specs/2026-07-03-avisos-manuales-paginas-design.md
export function AvisoPrimeraVisita({ content, isMobile, onVerManual, onCerrar }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: 12,
        padding: isMobile ? '12px 14px' : '10px 18px',
        margin: isMobile ? '10px 14px 0' : '10px 20px 0',
        background: T.primarySoft,
        border: `1px solid ${T.primaryGlow}`,
        borderRadius: 12,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: T.primary, flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }}
      />
      <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0, fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>
        {content.avisoTexto}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: isMobile ? 42 : 0 }}>
        <button
          onClick={onVerManual}
          style={{ padding: '7px 14px', background: T.primary, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Ver manual
        </button>
        <button
          onClick={onCerrar}
          title="Cerrar"
          style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', borderRadius: 8, color: T.textSec, cursor: 'pointer' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
