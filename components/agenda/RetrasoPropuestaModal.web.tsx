import { useState } from 'react';
import type { PropuestaRetraso } from '@/lib/retrasos';
import { DESIGN_TOKENS } from '@/lib/designTokens';

// Modal de propuesta de retraso encadenado (IA de agenda). Muestra como se recolocan las
// citas siguientes del profesional y deja al profesional CONFIRMAR (aplicar + avisar) o
// cancelar. Componente aislado: AgendaCalendar lo abre con una propuesta ya calculada
// (lib/retrasos.ts). No toca BD; las acciones se delegan via callbacks.
// Spec: docs/superpowers/specs/2026-06-18-retrasos-encadenados-design.md

const T = {
  panel: DESIGN_TOKENS.bgPanel,
  card: DESIGN_TOKENS.bgCard,
  border: DESIGN_TOKENS.borderHi,
  text: DESIGN_TOKENS.text,
  textSec: DESIGN_TOKENS.textSecondary,
  textTer: DESIGN_TOKENS.textTertiary,
  primary: DESIGN_TOKENS.primary,
  primaryHi: DESIGN_TOKENS.primaryHi,
  primarySoft: DESIGN_TOKENS.primarySoft,
  amber: DESIGN_TOKENS.warning,
  amberSoft: DESIGN_TOKENS.warningSoft,
};
const FIRE = DESIGN_TOKENS.fireGradient;

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export interface RetrasoPropuestaModalProps {
  propuesta: PropuestaRetraso;
  minutos: number; // retraso declarado
  profesionalNombre?: string;
  avisarDisponible?: boolean; // si el negocio tiene activado el aviso al cliente (config)
  enviando?: boolean;
  onConfirmar: (avisarClientes: boolean) => void;
  onCancelar: () => void;
}

export default function RetrasoPropuestaModal({
  propuesta, minutos, profesionalNombre, avisarDisponible = false, enviando = false,
  onConfirmar, onCancelar,
}: RetrasoPropuestaModalProps) {
  const [avisar, setAvisar] = useState<boolean>(avisarDisponible);
  const hayAfectadas = propuesta.totalAfectadas > 0;

  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,4,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', background: T.panel, borderRadius: 20, border: `1px solid ${T.border}`, boxShadow: '0 24px 60px rgba(40,30,24,0.22)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Cabecera */}
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: T.amberSoft, alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${T.amber}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` }} />

            <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text }}>Retraso de {minutos} min</div>
          </div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 6, lineHeight: 1.45 }}>
            {profesionalNombre ? `${profesionalNombre}: ` : ''}
            {hayAfectadas
              ? `se recolocarían ${propuesta.totalAfectadas} cita${propuesta.totalAfectadas > 1 ? 's' : ''} del resto del día.`
              : 'el resto del día no se ve afectado (los huecos absorben el retraso).'}
          </div>
        </div>

        {/* Lista de afectadas */}
        {hayAfectadas && (
          <div style={{ padding: '12px 20px' }}>
            {propuesta.items.map((it, i) => (
              <div key={it.cita_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < propuesta.items.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.cliente || 'Cliente'}</div>
                  {it.servicio && <div style={{ fontSize: 12, color: T.textTer }}>{it.servicio}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span style={{ color: T.textTer, textDecoration: 'line-through' }}>{fmtHora(it.inicioPrevisto)}</span>
                  <span style={{ color: T.textTer }}>→</span>
                  <span style={{ fontWeight: 800, color: T.primaryHi }}>{fmtHora(it.inicioNuevo)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, background: T.amberSoft, borderRadius: 6, padding: '2px 6px' }}>+{it.empujeMin}m</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Aviso al cliente */}
        {hayAfectadas && avisarDisponible && (
          <div style={{ padding: '0 20px 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} style={{ width: 17, height: 17, accentColor: T.primary }} />
              <span style={{ fontSize: 13, color: T.text }}>Avisar por WhatsApp a los clientes afectados de la nueva hora</span>
            </label>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px 18px' }}>
          <button onClick={onCancelar} disabled={enviando} style={{ flex: 1, padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={() => onConfirmar(avisar && avisarDisponible)} disabled={enviando} style={{ flex: 2, padding: '13px', borderRadius: 13, border: 'none', background: hayAfectadas ? FIRE : '#cfc6bd', color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1, boxShadow: hayAfectadas ? '0 10px 26px rgba(192,38,10,0.25)' : 'none' }}>
            {enviando ? 'Aplicando…' : hayAfectadas ? 'Aplicar recolocación' : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
}
