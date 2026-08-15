// Tarjeta comun de la pestana "Registros legales".
//
// Las cinco secciones (tickets, gastos, productos, control horario y auditoria)
// pintaban su propia cabecera a mano: tres seguian un estilo, las otras dos otro
// distinto, y varias redefinian sus propios TOKENS locales (deuda C14). El
// resultado era que la misma pantalla parecia hecha por cinco personas.
//
// Aqui vive esa cabecera UNA vez, con los tokens de verdad. Ademas trae los
// estados que todas repetian (cargando / error / vacio) y el "ver mas", para que
// ninguna vuelva a volcar mil filas de golpe.

import type { ReactNode } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';

interface RegistroCardProps {
  titulo: string;
  descripcion?: string;
  /** Icono en linea (SVG). Sin emojis: convencion del repo. */
  icono: ReactNode;
  /** Color de acento del icono. */
  acento: string;
  /** Accion a la derecha de la cabecera (exportar, anadir...). */
  accion?: ReactNode;
  /** Fila de filtros/busqueda bajo la cabecera. */
  toolbar?: ReactNode;
  children: ReactNode;
}

export function RegistroCard({
  titulo,
  descripcion,
  icono,
  acento,
  accion,
  toolbar,
  children,
}: RegistroCardProps) {
  const { isMobile } = useResponsive();
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 10 : 12,
          padding: isMobile ? '11px 13px' : '14px 18px',
          borderRadius: '14px 14px 0 0',
          background: T.bgCard,
          border: `1px solid ${T.border}`,
        }}
      >
        <div
          style={{
            width: isMobile ? 30 : 36,
            height: isMobile ? 30 : 36,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${acento}18`,
            color: acento,
            flexShrink: 0,
          }}
        >
          {icono}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 13.5 : 14, fontWeight: 700, color: T.text }}>{titulo}</div>
          {descripcion && (
            <div style={{ fontSize: isMobile ? 10.5 : 11, color: T.textTer, marginTop: 1, lineHeight: 1.45 }}>
              {descripcion}
            </div>
          )}
        </div>
        {accion && <div style={{ flexShrink: 0 }}>{accion}</div>}
      </div>

      <div
        style={{
          padding: isMobile ? 13 : 18,
          borderRadius: '0 0 14px 14px',
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderTop: 'none',
        }}
      >
        {toolbar && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            {toolbar}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Cargando / error / vacio: los tres estados que repetian las cinco secciones. */
export function RegistroEstado({
  tipo,
  children,
}: {
  tipo: 'cargando' | 'error' | 'vacio';
  children: ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '28px 10px',
        fontSize: 13,
        lineHeight: 1.5,
        color: tipo === 'error' ? T.danger : T.textSec,
      }}
    >
      {children}
    </div>
  );
}

/** Boton "ver mas": ninguna seccion debe volcar todas las filas de golpe. */
export function RegistroVerMas({ restantes, onClick }: { restantes: number; onClick: () => void }) {
  if (restantes <= 0) return null;
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 14,
        width: '100%',
        padding: '10px 0',
        background: 'transparent',
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        color: T.textSec,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Ver mas ({restantes} {restantes === 1 ? 'restante' : 'restantes'})
    </button>
  );
}

/** Buscador estandar de la pestana. */
export function RegistroBuscador({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: 1,
        minWidth: 200,
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        fontSize: 13,
        color: T.text,
        boxSizing: 'border-box',
      }}
    />
  );
}

/** Chip de filtro (activo/inactivo) con el mismo aspecto en toda la pestana. */
export function RegistroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${activo ? T.primary : T.border}`,
        background: activo ? T.primarySoft : 'transparent',
        color: activo ? T.primaryHi : T.textSec,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Iconos de la pestana, en SVG (nada de emojis en UI). */
export const IconosRegistro = {
  ticket: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z" />
      <path d="M9 5v14" />
    </svg>
  ),
  gasto: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  producto: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  reloj: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  auditoria: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 11 11 13 15 9" />
    </svg>
  ),
};
