// BandaLectura: la tira que va debajo de una gráfica o de un grupo de barras y
// dice en castellano llano qué está pasando con esos datos.
//
// Se comparte entre las gráficas de línea (GraficaExplicada) y las secciones de
// barras de informes, para que la explicación tenga el mismo aspecto en todas
// partes y el usuario aprenda a buscarla siempre en el mismo sitio.

import { DESIGN_TOKENS as T } from '@/lib/designTokens';

export interface ChipLectura {
  etiqueta: string;
  valor: string;
  color?: string;
}

export interface BandaLecturaProps {
  frase: string;
  chips?: ChipLectura[];
  /** Color de acento; normalmente el de la gráfica que acompaña. */
  color?: string;
  /** true cuando no hay datos: la banda se apaga en vez de fingir una lectura. */
  atenuada?: boolean;
  isMobile?: boolean;
}

export function BandaLectura({
  frase, chips = [], color = T.primary, atenuada = false, isMobile = false,
}: BandaLecturaProps) {
  return (
    <div style={{
      marginTop: 10, padding: isMobile ? '9px 11px' : '10px 13px', borderRadius: 10,
      background: atenuada ? 'rgba(115,102,88,0.06)' : `${color}0d`,
      border: `1px solid ${atenuada ? T.border : color + '33'}`,
    }}>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 6 : 8, marginBottom: 7 }}>
          {chips.map((c) => (
            <span key={c.etiqueta} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 5,
              fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
              background: T.bgCard, border: `1px solid ${T.border}`,
            }}>
              <span style={{ color: T.textTertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {c.etiqueta}
              </span>
              <span style={{ color: c.color || T.text, fontWeight: 700, fontSize: 11 }}>
                {c.valor}
              </span>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: isMobile ? 11.5 : 12, lineHeight: 1.5, color: T.textSecondary }}>
        {frase}
      </div>
    </div>
  );
}

export default BandaLectura;
