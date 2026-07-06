import { useId } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Grafico de linea (SVG) minimalista para series temporales cortas. Mismo
// algoritmo que el LineChart local de informes.web.tsx (9.4 tendencia),
// generalizado a un solo 'valor' por punto (en vez de {ingresos,citas}) para
// poder reutilizarlo tambien en el bloque 'grafica' de Chispa (BloqueRenderer).
// Sin dependencias externas de charting.

export interface LineChartMiniProps {
  serie: { fecha: Date; valor: number }[];
  color: string;
  fmt: (n: number) => string;
}

export function LineChartMini({ serie, color, fmt }: LineChartMiniProps) {
  const gid = `chispa-grad-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 640, H = 150, pad = 14;
  const vals = serie.map((s) => s.valor);
  const max = Math.max(1, ...vals);
  const n = serie.length;
  const xx = (i: number) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2));
  const yy = (v: number) => pad + (1 - v / max) * (H - pad * 2);
  const line = serie.map((s, i) => `${i === 0 ? 'M' : 'L'}${xx(i).toFixed(1)} ${yy(s.valor).toFixed(1)}`).join(' ');
  const area = n > 0 ? `${line} L${xx(n - 1).toFixed(1)} ${H - pad} L${xx(0).toFixed(1)} ${H - pad} Z` : '';
  const total = vals.reduce((a, b) => a + b, 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#${gid})`} />}
        {n > 0 && <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: T.textTertiary }}>
        <span>{serie.length ? serie[0].fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}</span>
        <span style={{ fontWeight: 600, color: T.textSecondary }}>Total: {fmt(total)}</span>
        <span>{serie.length ? serie[serie.length - 1].fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}</span>
      </div>
    </div>
  );
}

export default LineChartMini;
