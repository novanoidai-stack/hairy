// Tarjeta "IA proactiva por pagina" (Sesion 4, PLAN-IA-CHISPA-V2-REDISENO.md):
// UN solo componente que pinta los 5 estados de useAyudaIA de forma consistente
// en toda la app, para que ninguna superficie de IA se quede en blanco si el
// edge falla. Antes de anadir una tarjeta nueva (Sesiones 6-8), lee
// informes/PATRON-IA-POR-PAGINA.md.
//
// Regla de layout: esta tarjeta vive SIEMPRE en el flujo normal de la pagina
// (sin position fixed/absolute) para no competir en z-index con AvisosBell ni
// con el dashboard (ver Sesion 10 del plan).
import type { ReactNode } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { BloqueRenderer, type BloqueRendererProps } from '@/components/chispa/BloqueRenderer.web';
import type { EstadoAyudaIA } from '@/lib/hooks/useAyudaIA';

const SPIN_KEYFRAMES = '@keyframes taia-spin { to { transform: rotate(360deg) } }';

function IconoChispa({ size = 18, color = T.primary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3l1.8 5.6L19.5 10.4l-5.7 1.8L12 18l-1.8-5.8L4.5 10.4l5.7-1.8L12 3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FilaCargando() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px', fontSize: 13, color: T.textSecondary }}>
      <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${T.primary}`, borderTopColor: 'transparent', flexShrink: 0, animation: 'taia-spin 0.8s linear infinite' }} />
      Analizando...
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
  // Boton principal: relanza el analisis con los datos actuales de la pagina.
  onAnalizar: () => void;
  botonLabel?: string;
  // Boton de la fila de error; por defecto repite onAnalizar. Pasa
  // ayudaIA.reintentar (en vez de onAnalizar) cuando quieras repetir
  // EXACTAMENTE la ultima peticion en vez de recalcularla.
  onReintentar?: () => void;
  mensajeVacio?: string;
  // Resumen CALCULADO EN CLIENTE (sin LLM), siempre visible sea cual sea el
  // estado de la IA — es la base "determinista primero" del patron.
  resumenDeterminista?: ReactNode;
  accionEstado?: BloqueRendererProps['accionEstado'];
  onConfirmarAccion?: BloqueRendererProps['onConfirmar'];
  onCancelarAccion?: BloqueRendererProps['onCancelar'];
  isMobile?: boolean;
}

export function TarjetaAyudaIA({
  titulo,
  subtitulo,
  estado,
  onAnalizar,
  botonLabel = 'Analizar',
  onReintentar,
  mensajeVacio = 'Chispa no ha encontrado nada que destacar ahora mismo.',
  resumenDeterminista,
  accionEstado,
  onConfirmarAccion,
  onCancelarAccion,
  isMobile,
}: TarjetaAyudaIAProps) {
  const cargando = estado.tipo === 'cargando';

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.primary}40`, borderRadius: 12, padding: '14px 18px' }}>
      <style>{SPIN_KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <IconoChispa />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{titulo}</div>
            {subtitulo && <div style={{ fontSize: 12, color: T.textSecondary }}>{subtitulo}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={onAnalizar}
          disabled={cargando}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: T.primarySoft, color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: cargando ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        >
          {cargando ? 'Analizando...' : botonLabel}
        </button>
      </div>

      {resumenDeterminista && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
          {resumenDeterminista}
        </div>
      )}

      {estado.tipo !== 'idle' && (
        <div style={{ marginTop: resumenDeterminista ? 8 : 14, paddingTop: resumenDeterminista ? 0 : 14, borderTop: resumenDeterminista ? 'none' : `1px solid ${T.border}` }}>
          {estado.tipo === 'cargando' && <FilaCargando />}
          {estado.tipo === 'vacio' && <FilaVacio mensaje={mensajeVacio} />}
          {estado.tipo === 'error' && <FilaError mensaje={estado.mensaje} onReintentar={onReintentar ?? onAnalizar} />}
          {estado.tipo === 'listo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {estado.bloques.map((b, i) => (
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
          )}
        </div>
      )}
    </div>
  );
}

export default TarjetaAyudaIA;
