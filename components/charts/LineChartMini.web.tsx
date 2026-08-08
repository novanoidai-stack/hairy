import { useId, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Gráfico de líneas (SVG) de alta fidelidad con curvas suaves Bézier (Splines),
// degradado de área y tooltip interactivo premium.
// Muestra el valor exacto (€, recuento, %), la fecha completa y la tendencia (% vs punto anterior).

export interface LineChartMiniProps {
  serie: { fecha: Date; valor: number }[];
  color: string;
  fmt: (n: number) => string;
  labelExplicativo?: string;
}

function ejeLabel(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const cpX = (curr.x + next.x) / 2;
    path += ` C ${cpX.toFixed(1)} ${curr.y.toFixed(1)}, ${cpX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return path;
}

export function LineChartMini({ serie, color, fmt, labelExplicativo }: LineChartMiniProps) {
  const rawId = useId();
  const gid = `chispa-grad-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 640, H = 160, pad = 16;
  const vals = serie.map((s) => s.valor);
  const max = Math.max(1, ...vals);
  const n = serie.length;

  const xx = (i: number) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2));
  const yy = (v: number) => pad + (1 - v / max) * (H - pad * 2);

  const points = serie.map((s, i) => ({ x: xx(i), y: yy(s.valor) }));
  const linePath = smoothPath(points);
  const areaPath = n > 0 ? `${linePath} L ${xx(n - 1).toFixed(1)} ${H - pad} L ${xx(0).toFixed(1)} ${H - pad} Z` : '';
  const total = vals.reduce((a, b) => a + b, 0);

  const yTicks = [max, max / 2, 0];
  const GUTTER = 44;
  const fechaMid = n >= 3 ? serie[Math.floor((n - 1) / 2)].fecha : null;
  const fmtFechaCorta = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const fmtFechaCompleta = (d: Date) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(x - xx(i));
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    setHoverIdx(closestIdx);
    setTooltipPos({ x: rect.left + (xx(closestIdx) / W) * rect.width, y: rect.top + (yy(serie[closestIdx].valor) / H) * rect.height });
  };

  const handlePointerLeave = () => {
    setHoverIdx(null);
  };

  // Cálculo de variación % respecto al punto previo
  let pctVar: string | null = null;
  let isUp = true;
  if (hoverIdx !== null && hoverIdx > 0) {
    const prev = serie[hoverIdx - 1].valor;
    const curr = serie[hoverIdx].valor;
    if (prev > 0) {
      const diff = ((curr - prev) / prev) * 100;
      isUp = diff >= 0;
      pctVar = `${isUp ? '+' : ''}${diff.toFixed(1)}%`;
    } else if (curr > 0) {
      pctVar = '+100%';
    }
  }

  // Tooltip en portal flotante
  const tooltip = hoverIdx !== null && tooltipPos && typeof window !== 'undefined' ? createPortal(
    <div style={{
      position: 'fixed',
      left: tooltipPos.x,
      top: tooltipPos.y - 12,
      transform: 'translate(-50%, -100%)',
      background: '#121826',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 999999,
      boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      border: '1px solid rgba(255,255,255,0.12)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{fmt(serie[hoverIdx].valor)}</span>
        {pctVar && (
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 4,
            background: isUp ? 'rgba(15,157,107,0.2)' : 'rgba(226,59,52,0.2)',
            color: isUp ? '#22c55e' : '#ef4444',
          }}>
            {pctVar}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500, textTransform: 'capitalize' }}>
        {fmtFechaCompleta(serie[hoverIdx].fecha)}
      </span>
      {labelExplicativo && (
        <span style={{ fontSize: 9.5, color: T.primary, fontWeight: 600, marginTop: 1 }}>
          {labelExplicativo}
        </span>
      )}
      <div style={{
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: '5px solid #121826',
      }} />
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Eje Y con valores */}
        <div style={{ width: GUTTER, height: H, position: 'relative', flexShrink: 0 }}>
          {yTicks.map((v, i) => (
            <span
              key={i}
              style={{
                position: 'absolute', right: 0, top: yy(v), transform: 'translateY(-50%)',
                fontSize: 9.5, color: T.textTertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'
              }}
            >
              {ejeLabel(v)}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <svg 
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`} 
            width="100%" 
            height={H} 
            preserveAspectRatio="none" 
            style={{ display: 'block', touchAction: 'pan-y', cursor: 'crosshair' }}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Líneas de rejilla horizontales */}
            {yTicks.map((v, i) => (
              <line
                key={i}
                x1={0}
                y1={yy(v)}
                x2={W}
                y2={yy(v)}
                stroke={T.border}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={i === yTicks.length - 1 ? undefined : '3 4'}
              />
            ))}
            {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
            {n > 0 && (
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0px 4px 6px ${color}50)` }}
              />
            )}
            
            {/* Indicador interactivo de punto hover */}
            {hoverIdx !== null && (
              <>
                <line 
                  x1={xx(hoverIdx)} y1={0} 
                  x2={xx(hoverIdx)} y2={H - pad} 
                  stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} 
                  vectorEffect="non-scaling-stroke" 
                />
                <circle 
                  cx={xx(hoverIdx)} cy={yy(serie[hoverIdx].valor)} r={5} 
                  fill="#ffffff" stroke={color} strokeWidth={2.5} 
                  vectorEffect="non-scaling-stroke" 
                />
              </>
            )}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: T.textTertiary }}>
            <span>{n ? fmtFechaCorta(serie[0].fecha) : ''}</span>
            {fechaMid && <span>{fmtFechaCorta(fechaMid)}</span>}
            <span>{n ? fmtFechaCorta(serie[n - 1].fecha) : ''}</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, fontWeight: 600, color: T.textSecondary }}>
        Total en periodo: <strong style={{ color: T.text }}>{fmt(total)}</strong>
      </div>
      {tooltip}
    </div>
  );
}

export default LineChartMini;
