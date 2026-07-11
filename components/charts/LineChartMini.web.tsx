import { useId } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Grafico de linea (SVG) minimalista para series temporales cortas. Mismo
// algoritmo que el LineChart local de informes.web.tsx (9.4 tendencia),
// generalizado a un solo 'valor' por punto (en vez de {ingresos,citas}) para
// poder reutilizarlo tambien en el bloque 'grafica' de Chispa (BloqueRenderer).
// Sin dependencias externas de charting.
//
// Ejes con numeros: antes la grafica "parecia un dibujo" sin escala legible.
// Ahora lleva eje Y (0 / medio / max) con lineas de rejilla y ticks de fecha
// en X, para poder leer de verdad la magnitud de cada punto.

export interface LineChartMiniProps {
  serie: { fecha: Date; valor: number }[];
  color: string;
  fmt: (n: number) => string;
}

// Etiqueta compacta para el eje Y (evita que "1.234 EUR" desborde el gutter).
function ejeLabel(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
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

  // Eje Y: tres marcas (max, medio, 0). Se posicionan por px porque la altura
  // del SVG es fija (H) y no se estira (solo el ancho, por preserveAspectRatio).
  const yTicks = [max, max / 2, 0];
  const GUTTER = 42;
  // Fecha intermedia en X cuando la serie tiene suficientes puntos.
  const fechaMid = n >= 3 ? serie[Math.floor((n - 1) / 2)].fecha : null;
  const fmtFecha = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Eje Y con valores */}
        <div style={{ width: GUTTER, height: H, position: 'relative', flexShrink: 0 }}>
          {yTicks.map((v, i) => (
            <span
              key={i}
              style={{ position: 'absolute', right: 0, top: yy(v), transform: 'translateY(-50%)', fontSize: 9.5, color: T.textTertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
            >
              {ejeLabel(v)}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.22" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Lineas de rejilla horizontales (a la altura de cada tick del eje Y) */}
            {yTicks.map((v, i) => (
              <line key={i} x1={0} y1={yy(v)} x2={W} y2={yy(v)} stroke={T.border} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={i === yTicks.length - 1 ? undefined : '3 4'} />
            ))}
            {area && <path d={area} fill={`url(#${gid})`} />}
            {n > 0 && <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: T.textTertiary }}>
            <span>{n ? fmtFecha(serie[0].fecha) : ''}</span>
            {fechaMid && <span>{fmtFecha(fechaMid)}</span>}
            <span>{n ? fmtFecha(serie[n - 1].fecha) : ''}</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 4, fontSize: 10.5, fontWeight: 600, color: T.textSecondary }}>
        Total: {fmt(total)}
      </div>
    </div>
  );
}

export default LineChartMini;
