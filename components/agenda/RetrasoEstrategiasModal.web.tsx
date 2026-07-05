import { useMemo, useState } from 'react';
import type { EstrategiaRetraso } from '@/lib/retrasos';
import { DESIGN_TOKENS } from '@/lib/designTokens';

// Modal de RESOLUCION de retraso con estrategias comparadas (Sesion 4, IA de agenda).
// Reemplaza al modal de "solo cascada": ahora Chispa ofrece 2-3 estrategias (empujar en
// cascada, mover una cita a un hueco, aprovechar el reposo, pedir venir mas tarde) con su
// coste comparable (cuantas citas se mueven, cuanto se retrasa el cierre) y el profesional
// elige. Cada estrategia se pinta como una tarjeta propone->confirma (lenguaje de bloques
// de Chispa). No toca BD: la aplicacion se delega via callback con los updates ya calculados.
// Spec: docs/superpowers/specs/2026-06-18-retrasos-encadenados-design.md + PLAN-IA-CHISPA S4.

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
  success: DESIGN_TOKENS.success,
};
const FIRE = DESIGN_TOKENS.fireGradient;

export interface RetrasoEstrategiasModalProps {
  estrategias: EstrategiaRetraso[];
  minutos: number;
  profesionalNombre?: string;
  avisarDisponible?: boolean; // el negocio tiene el aviso al cliente activado (config)
  enviando?: boolean;
  onConfirmar: (estrategia: EstrategiaRetraso, avisarClientes: boolean) => void;
  onCancelar: () => void;
}

function Chip({ label, tone }: { label: string; tone: 'neutral' | 'amber' | 'good' }) {
  const bg = tone === 'amber' ? T.amberSoft : tone === 'good' ? 'rgba(15,157,107,0.12)' : 'rgba(148,163,184,0.12)';
  const fg = tone === 'amber' ? T.amber : tone === 'good' ? T.success : T.textSec;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: fg, background: bg, borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

export default function RetrasoEstrategiasModal({
  estrategias, minutos, profesionalNombre, avisarDisponible = false, enviando = false,
  onConfirmar, onCancelar,
}: RetrasoEstrategiasModalProps) {
  // Preselecciona la estrategia recomendada (o la primera).
  const idxRecomendada = useMemo(() => {
    const i = estrategias.findIndex((e) => e.recomendada);
    return i >= 0 ? i : 0;
  }, [estrategias]);
  const [sel, setSel] = useState<number>(idxRecomendada);
  const elegida = estrategias[sel];
  const puedeAvisar = avisarDisponible && (elegida?.avisos.length ?? 0) > 0;
  const [avisar, setAvisar] = useState<boolean>(avisarDisponible);

  const sinEstrategias = estrategias.length === 0;

  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,6,4,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: T.panel, borderRadius: 20, border: `1px solid ${T.border}`, boxShadow: '0 24px 60px rgba(40,30,24,0.22)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Cabecera */}
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 8, background: T.amberSoft, alignItems: 'center', justifyContent: 'center' }}
              dangerouslySetInnerHTML={{ __html: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${T.amber}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` }} />
            <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text }}>Retraso de {minutos} min</div>
          </div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 6, lineHeight: 1.45 }}>
            {profesionalNombre ? `${profesionalNombre}: ` : ''}
            {sinEstrategias
              ? 'el resto del dia no se ve afectado (los huecos absorben el retraso).'
              : 'Chispa propone estas formas de resolverlo. Elige una.'}
          </div>
        </div>

        {/* Lista de estrategias comparadas */}
        {!sinEstrategias && (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {estrategias.map((e, i) => {
              const activa = i === sel;
              return (
                <button
                  key={e.tipo}
                  onClick={() => setSel(i)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', width: '100%',
                    background: activa ? T.primarySoft : T.card,
                    border: `1.5px solid ${activa ? T.primary : T.border}`,
                    borderRadius: 14, padding: '13px 14px', transition: 'all 0.15s ease',
                    display: 'flex', flexDirection: 'column', gap: 7,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 999, border: `2px solid ${activa ? T.primary : T.textTer}`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {activa && <span style={{ width: 8, height: 8, borderRadius: 999, background: T.primary }} />}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.text, flex: 1, minWidth: 0 }}>{e.titulo}</span>
                    {e.recomendada && <Chip label="Recomendada" tone="good" />}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSec, lineHeight: 1.4, marginLeft: 26 }}>{e.resumen}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 26 }}>
                    <Chip label={e.citasMovidas === 0 ? 'No mueve otras citas' : `Mueve ${e.citasMovidas} cita${e.citasMovidas > 1 ? 's' : ''}`} tone={e.citasMovidas === 0 ? 'good' : 'amber'} />
                    <Chip label={e.retrasoCierreMin === 0 ? 'Cierra a su hora' : `Cierra +${e.retrasoCierreMin}m`} tone={e.retrasoCierreMin === 0 ? 'good' : 'amber'} />
                    {e.avisos.length > 0 && <Chip label={`Avisa a ${e.avisos.length}`} tone="neutral" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Aviso al cliente para la estrategia elegida */}
        {puedeAvisar && (
          <div style={{ padding: '0 20px 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 }}>
              <input type="checkbox" checked={avisar} onChange={(ev) => setAvisar(ev.target.checked)} style={{ width: 17, height: 17, accentColor: T.primary }} />
              <span style={{ fontSize: 13, color: T.text }}>Avisar por WhatsApp a los clientes afectados de su nueva hora</span>
            </label>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 20px 18px' }}>
          <button onClick={onCancelar} disabled={enviando} style={{ flex: 1, padding: '13px', borderRadius: 13, border: `1.5px solid ${T.border}`, background: T.card, color: T.textSec, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => elegida && onConfirmar(elegida, avisar && puedeAvisar)}
            disabled={enviando || sinEstrategias}
            style={{ flex: 2, padding: '13px', borderRadius: 13, border: 'none', background: sinEstrategias ? '#cfc6bd' : FIRE, color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1, boxShadow: sinEstrategias ? 'none' : '0 10px 26px rgba(192,38,10,0.25)' }}>
            {enviando ? 'Aplicando…' : sinEstrategias ? 'Entendido' : 'Aplicar esta opcion'}
          </button>
        </div>
      </div>
    </div>
  );
}
