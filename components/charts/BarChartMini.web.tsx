import { DESIGN_TOKENS as T } from '@/lib/designTokens';

// Grafico de barras HORIZONTALES para el "reparto de una medida entre
// categorias" (ingresos por servicio, citas por profesional...). Elegido segun
// la guia de dataviz: una sola medida repartida entre categorias => UN solo tono
// (magnitud), nunca un arcoiris de colores por categoria; valores etiquetados
// directamente (no leyenda). Barras horizontales para que las etiquetas de
// categoria se lean sin rotar. Sin dependencias de charting.
//
// Accesibilidad: cada fila es legible como "<categoria>: <valor>" (title +
// aria-label); el texto va en tinta (no en el color de la barra).

export interface BarChartMiniProps {
  datos: { etiqueta: string; valor: number }[];
  color: string;
  fmt: (n: number) => string;
}

export function BarChartMini({ datos, color, fmt }: BarChartMiniProps) {
  if (!datos || datos.length === 0) {
    return <div style={{ fontSize: 13, color: T.textTertiary, fontStyle: 'italic' }}>No hay datos para mostrar.</div>;
  }
  const max = Math.max(1, ...datos.map((d) => d.valor));

  return (
    <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {datos.map((d, i) => {
        const pct = Math.max(0, Math.min(100, (d.valor / max) * 100));
        return (
          <div
            key={`${d.etiqueta}-${i}`}
            role="listitem"
            aria-label={`${d.etiqueta}: ${fmt(d.valor)}`}
            title={`${d.etiqueta}: ${fmt(d.valor)}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, lineHeight: 1.2 }}>
              <span style={{ color: T.textSecondary, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.etiqueta}</span>
              <span style={{ color: T.text, fontWeight: 700, flexShrink: 0 }}>{fmt(d.valor)}</span>
            </div>
            {/* Carril + barra: extremo redondeado 4px, 2px de aire con el carril */}
            <div style={{ height: 10, borderRadius: 999, background: T.bgCardHi, overflow: 'hidden', padding: 0 }}>
              <div style={{
                width: `${pct}%`, height: '100%', minWidth: pct > 0 ? 6 : 0,
                background: color, borderRadius: 999,
                transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BarChartMini;
