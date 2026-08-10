import { type ReactNode, useState, useEffect } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { BloqueRenderer, type BloqueRendererProps } from '@/components/chispa/BloqueRenderer.web';
import type { EstadoAyudaIA } from '@/lib/hooks/useAyudaIA';
import { obtenerTipCarga } from '@/lib/chispaPrompts';

const SPIN_KEYFRAMES = '@keyframes taia-spin { to { transform: rotate(360deg) } }';

function renderNegritas(texto: string): ReactNode {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4
      ? <strong key={i} style={{ color: T.primaryHi }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

function IconoChispa({ size = 18, color = T.primary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3l1.8 5.6L19.5 10.4l-5.7 1.8L12 18l-1.8-5.8L4.5 10.4l5.7-1.8L12 3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FilaCargando({ tip }: { tip: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 2px', fontSize: 13, color: T.textSecondary }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${T.primary}`, borderTopColor: 'transparent', flexShrink: 0, animation: 'taia-spin 0.8s linear infinite' }} />
        <span style={{ fontWeight: 600 }}>Analizando con IA proactiva...</span>
      </div>
      {tip ? (
        <div style={{
          fontSize: 11.5, color: T.textSecondary, lineHeight: 1.45,
          fontStyle: 'italic', marginTop: 4, background: T.bgPanel,
          padding: '8px 10px', borderRadius: 8, border: `1px dashed ${T.border}`,
          display: 'flex', flexDirection: 'column', gap: 2
        }}>
          <span style={{ fontWeight: 700, color: T.primaryHi, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tip de Chispa</span>
          <span>{tip}</span>
        </div>
      ) : null}
    </div>
  );
}

function FilaVacio({ mensaje }: { mensaje: string }) {
  return <div style={{ padding: '10px 2px', fontSize: 13, color: T.textTertiary }}>{mensaje}</div>;
}

function FilaError({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: T.dangerSoft, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: T.danger }}>{mensaje}</span>
      <button
        type="button"
        className="btn-interactive"
        onClick={onReintentar}
        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.danger}`, background: 'transparent', color: T.danger, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
      >
        Reintentar
      </button>
    </div>
  );
}

export interface TarjetaAyudaIAProps {
  titulo: string;
  subtitulo?: string;
  estado: EstadoAyudaIA;
  onAnalizar: () => void;
  botonLabel?: string;
  onReintentar?: () => void;
  mensajeVacio?: string;
  resumenDeterminista?: ReactNode;
  accionEstado?: BloqueRendererProps['accionEstado'];
  onConfirmarAccion?: BloqueRendererProps['onConfirmar'];
  onCancelarAccion?: BloqueRendererProps['onCancelar'];
  isMobile?: boolean;
  onOcultar?: () => void;
}

export function TarjetaAyudaIA({
  titulo,
  subtitulo,
  estado,
  onAnalizar,
  botonLabel = 'Analizar con IA',
  onReintentar,
  mensajeVacio = 'Chispa no ha encontrado nada que destacar ahora mismo.',
  resumenDeterminista,
  accionEstado,
  onConfirmarAccion,
  onCancelarAccion,
  isMobile,
  onOcultar,
}: TarjetaAyudaIAProps) {
  const cargando = estado.tipo === 'cargando';
  const [tipCarga, setTipCarga] = useState('');
  const [desplegado, setDesplegado] = useState(false);

  useEffect(() => {
    if (estado.tipo === 'cargando') {
      setTipCarga(obtenerTipCarga());
      setDesplegado(true);
    }
    if (estado.tipo === 'listo') {
      setDesplegado(true);
    }
  }, [estado.tipo]);

  const mostrarContenido = desplegado && estado.tipo !== 'idle';

  // Si está replegado (idle o contraído), se muestra como un botón/mini-barra ultracompacto
  if (!desplegado && estado.tipo === 'idle') {
    return (
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            setDesplegado(true);
            onAnalizar();
          }}
          className="btn-interactive"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(244,80,30,0.08), rgba(244,80,30,0.16))',
            border: `1px solid ${T.primarySoft}`,
            cursor: 'pointer',
            fontSize: 12.5,
            fontWeight: 700,
            color: T.primary,
            boxShadow: '0 2px 8px rgba(244,80,30,0.1)',
            transition: 'all 0.2s ease',
          }}
        >
          <IconoChispa size={16} />
          <span>{titulo} — {botonLabel}</span>
          <span style={{
            fontSize: 11,
            background: T.fireGradient,
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 12,
            fontWeight: 800,
            marginLeft: 4,
          }}>
            ✨ IA
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel magic-border" style={{ borderRadius: 16, padding: '12px 16px', marginBottom: 14 }}>
      <style>{SPIN_KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <IconoChispa />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{titulo}</div>
            {subtitulo && <div style={{ fontSize: 11.5, color: T.textSecondary }}>{subtitulo}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-interactive"
            onClick={cargando ? undefined : () => {
              if (desplegado && estado.tipo === 'listo') {
                setDesplegado(false);
              } else {
                setDesplegado(true);
                onAnalizar();
              }
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              background: cargando ? T.bgCardHi : T.fireGradient,
              color: cargando ? T.textMuted : '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: cargando ? 'default' : 'pointer',
              flexShrink: 0,
              boxShadow: cargando ? 'none' : '0 3px 10px rgba(244,80,30,0.2)',
            }}
          >
            {cargando ? 'Pensando...' : desplegado && estado.tipo === 'listo' ? 'Plegar IA' : botonLabel}
          </button>

          {onOcultar && (
            <button
              type="button"
              aria-label="Ocultar"
              title="Ocultar esta tarjeta"
              onClick={onOcultar}
              className="btn-interactive"
              style={{
                width: 26, height: 26, borderRadius: 999,
                border: `1px solid ${T.border}`, background: 'transparent',
                color: T.textTertiary, cursor: 'pointer', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
      </div>

      {resumenDeterminista && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.text, lineHeight: 1.45 }}>
          {resumenDeterminista}
        </div>
      )}

      {mostrarContenido && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, position: 'relative' }}>
          {estado.tipo === 'cargando' && <FilaCargando tip={tipCarga} />}
          {estado.tipo === 'vacio' && <FilaVacio mensaje={mensajeVacio} />}
          {estado.tipo === 'error' && <FilaError mensaje={estado.mensaje} onReintentar={onReintentar ?? onAnalizar} />}
          {estado.tipo === 'listo' && (() => {
            const primero = estado.bloques[0];
            const hayTitular = !!primero && primero.tipo === 'texto' && primero.texto.trim().length > 0;
            // El titular se renderiza con renderNegritas(), que NO entiende '\n' ni
            // viñetas (solo **negrita** en linea): si un informe narrado entero
            // (titular + varias viñetas) llega como un unico bloque 'texto', el
            // navegador colapsaba todos los saltos de linea y se veia como un muro
            // de texto. Solo la PRIMERA linea es titular de verdad; el resto (si lo
            // hay) se trata como un bloque 'texto' mas y pasa por BloqueRenderer,
            // que si sabe pintar viñetas en lineas separadas.
            const primerTexto = hayTitular && primero.tipo === 'texto' ? primero.texto : '';
            const saltoIdx = primerTexto.indexOf('\n');
            const tituloLinea = saltoIdx === -1 ? primerTexto : primerTexto.slice(0, saltoIdx);
            const restoDelPrimero = saltoIdx === -1 ? '' : primerTexto.slice(saltoIdx + 1).trim();
            const resto = [
              ...(restoDelPrimero ? [{ tipo: 'texto' as const, texto: restoDelPrimero }] : []),
              ...(hayTitular ? estado.bloques.slice(1) : estado.bloques),
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hayTitular && (
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
                    {renderNegritas(tituloLinea)}
                  </div>
                )}
                {resto.map((b, i) => (
                  <BloqueRenderer
                    key={i}
                    bloque={b}
                    accionEstado={b.tipo === 'accion' ? accionEstado : undefined}
                    onConfirmar={onConfirmarAccion}
                    onCancelar={onCancelarAccion}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default TarjetaAyudaIA;
