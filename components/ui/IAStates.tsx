// Componentes comunes de estados para la capa IA (Chispa).
// Reutilizables por todas las superficies: TarjetaAyudaIA, panel, hub, etc.
// Móvil primero, sin emojis, diseño pulido y consistente.
import type { ReactNode } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

const SPIN_KEYFRAMES = '@keyframes ia-spin { to { transform: rotate(360deg) } }';

// Icono de información (vacío)
function IconoInfo({ size = 16, color = T.textMuted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// Icono de alerta (error)
function IconoAlerta({ size = 16, color = T.danger }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// Spinner de carga (dots animados)
function SpinnerDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: T.primary,
            animation: `ia-spin 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// Skeleton de carga (para listas y tarjetas)
export function Skeleton({ width = '100%', height = 40, radius = 8 }: { width?: string | number; height?: string | number; radius?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #f6f1ea 25%, #fbf6f0 50%, #f6f1ea 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

// Estado vacío (sin resultados, sin datos, etc.)
export interface EstadoVacioProps {
  mensaje: string;
  icono?: ReactNode;
  accion?: {
    label: string;
    onClick: () => void;
  };
}

export function EstadoVacio({ mensaje, icono, accion }: EstadoVacioProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '24px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: T.textMuted }}>{icono || <IconoInfo size={24} />}</div>
      <div style={{ fontSize: 13.5, color: T.textTertiary, lineHeight: 1.5 }}>{mensaje}</div>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          style={{
            marginTop: 4,
            padding: '8px 14px',
            borderRadius: 10,
            border: `1.5px solid ${T.primary}`,
            background: T.primarySoft,
            color: T.primaryHi,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {accion.label}
        </button>
      )}
    </div>
  );
}

// Estado de carga (loading)
export interface EstadoCargandoProps {
  mensaje?: string;
  skeleton?: boolean;
  skeletonCount?: number;
}

export function EstadoCargando({ mensaje = 'Cargando...', skeleton = false, skeletonCount = 3 }: EstadoCargandoProps) {
  if (skeleton) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} height={i === 0 ? 60 : 40} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 12px' }}>
      <SpinnerDots />
      <span style={{ fontSize: 13, color: T.textSecondary }}>{mensaje}</span>
      <style>{SPIN_KEYFRAMES}</style>
    </div>
  );
}

// Estado de error (con reintento)
export interface EstadoErrorProps {
  mensaje: string;
  onReintentar?: () => void;
  reintentarLabel?: string;
}

export function EstadoError({ mensaje, onReintentar, reintentarLabel = 'Reintentar' }: EstadoErrorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 10,
        background: T.dangerSoft,
        border: `1px solid ${T.danger}40`,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <IconoAlerta size={16} />
        <span style={{ fontSize: 13, color: T.danger, lineHeight: 1.4 }}>{mensaje}</span>
      </div>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: `1px solid ${T.danger}`,
            background: 'transparent',
            color: T.danger,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {reintentarLabel}
        </button>
      )}
    </div>
  );
}
