import { useId, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import type { Granularidad } from '@/lib/informes/lecturaSerie';
import { escalaBonita, indicesEtiquetasX } from '@/lib/informes/escalas';

// Gráfico de líneas (SVG) con curvas suaves Bézier, degradado de área y tooltip.
// Muestra el valor exacto (€, recuento, %), la fecha completa y la tendencia.
//
// v2 (9 ago 2026): el gráfico se leía mal y por eso nadie lo entendía. Cambios:
//   - Eje Y con números REDONDOS (antes: max, max/2, 0 — salían cifras como
//     "1.7k" que no dicen nada) y con la unidad rotulada.
//   - Eje X con hasta 7 etiquetas repartidas (antes: 3 fijas) y con el formato
//     del grano real (horas / días / semanas / meses), más el rótulo de qué
//     representa el tiempo.
//   - Línea de la media, para saber si un pico fue un buen día o un milagro.
//   - El máximo marcado siempre, no solo al pasar el ratón.
//   - El pie ya no dice "Total en periodo" a ciegas: sumar porcentajes no
//     significa nada (la gráfica de eficiencia de reposos lo hacía).
// Todas las props nuevas son OPCIONALES: el bloque 'grafica' de Chispa usa este
// mismo componente y sigue funcionando sin tocarlo.

export interface LineChartMiniProps {
  serie: { fecha: Date; valor: number }[];
  color: string;
  fmt: (n: number) => string;
  labelExplicativo?: string;
  /** Unidad del eje Y ("€", "citas", "%"). Se rotula en vertical a la izquierda. */
  unidadY?: string;
  /** Qué representa el eje X ("días de agosto", "meses"). Se rotula debajo. */
  etiquetaX?: string;
  /** Grano del eje X: manda en el formato de las etiquetas de fecha. */
  granularidad?: Granularidad;
  /** Línea punteada con la media del periodo. */
  mostrarMedia?: boolean;
  /** Halo permanente sobre el punto máximo. */
  marcarPico?: boolean;
  /** Qué se resume debajo. 'total' es el comportamiento histórico. */
  pieDeGrafica?: 'total' | 'media' | 'ninguno';
  /**
   * Rótulo del pie. Hace falta porque cuando el eje se recorta a "hasta hoy", un
   * "Total en periodo" contradice al KPI de arriba, que sí cuenta lo ya reservado
   * del resto del mes.
   */
  etiquetaPie?: string;
}

function ejeLabel(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  // Los pasos fraccionarios (0.5) tienen que verse; los enteros, sin decimales.
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Etiqueta corta del eje X según el grano. */
function fmtEjeX(d: Date, g?: Granularidad): string {
  switch (g) {
    case 'hora':
      return `${String(d.getHours()).padStart(2, '0')}:00`;
    case 'semana':
      return `sem. ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
    case 'mes':
      return d.toLocaleDateString('es-ES', { month: 'short' });
    case 'dia':
    default:
      return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
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

export function LineChartMini({
  serie, color, fmt, labelExplicativo,
  unidadY, etiquetaX, granularidad,
  mostrarMedia = false, marcarPico = false, pieDeGrafica = 'total', etiquetaPie,
}: LineChartMiniProps) {
  const rawId = useId();
  const gid = `chispa-grad-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const W = 640, H = 160, pad = 16;
  const vals = serie.map((s) => s.valor);
  const n = serie.length;

  const { max, yTicks } = useMemo(() => {
    const maxDato = Math.max(0, ...vals);
    const enteros = vals.length > 0 && vals.every((v) => Number.isInteger(v));
    const e = escalaBonita(maxDato, { enteros });
    // De arriba a abajo, que es el orden en que se pintan.
    return { max: e.max, yTicks: [...e.ticks].reverse() };
  }, [vals.join(',')]);

  const xx = (i: number) => pad + (n <= 1 ? (W - pad * 2) / 2 : (i / (n - 1)) * (W - pad * 2));
  const yy = (v: number) => pad + (1 - v / max) * (H - pad * 2);

  const points = serie.map((s, i) => ({ x: xx(i), y: yy(s.valor) }));
  const linePath = smoothPath(points);
  const areaPath = n > 0 ? `${linePath} L ${xx(n - 1).toFixed(1)} ${H - pad} L ${xx(0).toFixed(1)} ${H - pad} Z` : '';
  const total = vals.reduce((a, b) => a + b, 0);
  const mediaVal = n > 0 ? total / n : 0;

  // Índice del máximo, para marcarlo sin depender del hover.
  const idxPico = useMemo(() => {
    if (n === 0) return -1;
    let mejor = 0;
    for (let i = 1; i < n; i++) if (vals[i] > vals[mejor]) mejor = i;
    return vals[mejor] > 0 ? mejor : -1;
  }, [vals.join(','), n]);

  const GUTTER = 44;
  const etiquetasX = useMemo(() => indicesEtiquetasX(n), [n]);
  const fmtFechaCompleta = (d: Date) =>
    granularidad === 'hora'
      ? d.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

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
      const dist = Math.abs(x - (xx(i) / W) * rect.width);
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

  const mostrarLineaMedia = mostrarMedia && n >= 2 && mediaVal > 0 && mediaVal < max;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Rótulo vertical de la unidad del eje Y: sin esto el lector no sabe si
            la línea son euros, citas o por cientos. */}
        {unidadY && (
          <div style={{
            width: 14, height: H, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              transform: 'rotate(180deg)', writingMode: 'vertical-rl',
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
              color: T.textTertiary, textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              {unidadY}
            </span>
          </div>
        )}
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
            {/* Media del periodo: sin esta referencia no se sabe si un pico es un
                buen día o un milagro puntual. */}
            {mostrarLineaMedia && (
              <line
                x1={0} y1={yy(mediaVal)} x2={W} y2={yy(mediaVal)}
                stroke={T.textTertiary} strokeWidth={1.5} strokeDasharray="6 4"
                opacity={0.75} vectorEffect="non-scaling-stroke"
              />
            )}
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

            {/* Pico permanente (no depende de que el usuario acierte con el ratón) */}
            {marcarPico && idxPico >= 0 && hoverIdx === null && (
              <>
                <circle cx={xx(idxPico)} cy={yy(vals[idxPico])} r={7} fill={color} opacity={0.22} vectorEffect="non-scaling-stroke" />
                <circle cx={xx(idxPico)} cy={yy(vals[idxPico])} r={3.5} fill={color} vectorEffect="non-scaling-stroke" />
              </>
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
          {mostrarLineaMedia && (
            <div style={{
              position: 'absolute', right: 2, top: (yy(mediaVal) / H) * 100 + '%',
              transform: 'translateY(-115%)', fontSize: 9, fontWeight: 700,
              color: T.textTertiary, background: 'rgba(255,255,255,0.75)',
              padding: '0 3px', borderRadius: 3, pointerEvents: 'none',
            }}>
              media {fmt(mediaVal)}
            </div>
          )}
          {/* Eje X: etiquetas repartidas, cada una alineada con su punto real */}
          <div style={{ position: 'relative', height: 14, marginTop: 6 }}>
            {etiquetasX.map((i) => {
              const pct = n <= 1 ? 50 : ((xx(i) - pad) / (W - pad * 2)) * 100;
              // Los extremos se pegan al borde para no salirse del contenedor.
              const esPrimera = i === 0;
              const esUltima = i === n - 1;
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute', left: `${pct}%`, top: 0,
                    transform: esPrimera ? 'none' : esUltima ? 'translateX(-100%)' : 'translateX(-50%)',
                    fontSize: 10, color: T.textTertiary, whiteSpace: 'nowrap',
                  }}
                >
                  {fmtEjeX(serie[i].fecha, granularidad)}
                </span>
              );
            })}
          </div>
          {etiquetaX && (
            <div style={{
              textAlign: 'center', marginTop: 2, fontSize: 9.5, fontWeight: 700,
              letterSpacing: 0.5, textTransform: 'uppercase', color: T.textTertiary,
            }}>
              {etiquetaX}
            </div>
          )}
        </div>
      </div>
      {/* Pie: sumar sólo tiene sentido en euros y recuentos. Con porcentajes el
          "Total en periodo" era literalmente un número sin significado. */}
      {pieDeGrafica !== 'ninguno' && (
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, fontWeight: 600, color: T.textSecondary }}>
          {etiquetaPie ? `${etiquetaPie}: ` : (pieDeGrafica === 'media' ? 'Media del periodo: ' : 'Total en periodo: ')}
          <strong style={{ color: T.text }}>{fmt(pieDeGrafica === 'media' ? mediaVal : total)}</strong>
        </div>
      )}
      {tooltip}
    </div>
  );
}

export default LineChartMini;
