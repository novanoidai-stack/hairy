import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Indicador DISCRETO de riesgo de no-show (Sesion 7 del PLAN-IA-CHISPA).
//
// Regla de no estigmatizar: tono NEUTRO (nunca rojo de alarma), texto sobrio,
// SOLO visible para el equipo. No se muestra nada para riesgo bajo (la mayoria
// fiable no se etiqueta). El score se calcula server-side (RPC riesgo_no_show_
// cliente / clientes_riesgo_no_show); aqui solo se pinta.

export type NivelRiesgo = 'bajo' | 'medio' | 'alto';

export interface RiesgoNoShow {
  nivel: NivelRiesgo;
  score?: number;
  no_shows?: number;
  cancelaciones_tardias?: number;
}

// Amarillo apagado para 'alto', gris calido para 'medio': senal operativa, no alarma.
const ESTILO: Record<'medio' | 'alto', { color: string; bg: string; borde: string; label: string }> = {
  alto: { color: '#b45309', bg: 'rgba(245,158,11,0.12)', borde: 'rgba(245,158,11,0.35)', label: 'Riesgo de ausencia alto' },
  medio: { color: T.textSecondary, bg: 'rgba(115,102,88,0.10)', borde: T.border, label: 'Riesgo de ausencia medio' },
};

function motivoTexto(r: RiesgoNoShow): string {
  const partes: string[] = [];
  if (r.no_shows && r.no_shows > 0) partes.push(`${r.no_shows} ausencia${r.no_shows === 1 ? '' : 's'} sin avisar`);
  if (r.cancelaciones_tardias && r.cancelaciones_tardias > 0) {
    partes.push(`${r.cancelaciones_tardias} cancelacion${r.cancelaciones_tardias === 1 ? '' : 'es'} de ultima hora`);
  }
  const base = partes.length > 0 ? partes.join(' y ') + ' en su historial.' : 'Aun con poco historial de visitas.';
  return `${base} Solo visible para el equipo; considera pedir confirmacion o senal.`;
}

export function RiesgoNoShowIndicator({ riesgo, compact = false }: { riesgo: RiesgoNoShow | null | undefined; compact?: boolean }) {
  if (!riesgo || riesgo.nivel === 'bajo') return null;
  const est = ESTILO[riesgo.nivel];
  const titulo = motivoTexto(riesgo);
  return (
    <span
      title={titulo}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: est.bg,
        border: `1px solid ${est.borde}`,
        color: est.color,
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: est.color, flexShrink: 0 }} />
      {compact ? (riesgo.nivel === 'alto' ? 'Riesgo alto' : 'Riesgo medio') : est.label}
    </span>
  );
}

export default RiesgoNoShowIndicator;
