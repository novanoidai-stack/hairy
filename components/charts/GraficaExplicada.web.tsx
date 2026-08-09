// GraficaExplicada: una gráfica que dice lo que está diciendo.
//
// El problema que resuelve: hasta ahora informes pintaba la línea y, como mucho,
// un icono "i" con un texto FIJO ("esta gráfica mide los ingresos del periodo").
// Eso explica para qué sirve el gráfico, no qué está pasando en el salón. Aquí el
// icono se queda con el concepto y debajo del gráfico va la lectura real de los
// datos, siempre visible: pico, nivel normal y hacia dónde va.
//
// Composición: título + InfoDot (qué es) + LineChartMini + BandaLectura (qué dice).

import { useMemo } from 'react';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { InfoDot } from '@/components/ui/InfoDot.web';
import { LineChartMini } from './LineChartMini.web';
import { BandaLectura, type ChipLectura } from './BandaLectura.web';
import {
  leerSerie,
  formatearValor,
  etiquetarPunto,
  nombreGrano,
  type PuntoSerie,
  type Unidad,
  type Granularidad,
} from '@/lib/informes/lecturaSerie';

export interface GraficaExplicadaProps {
  titulo: string;
  /** Texto del icono "i": qué mide y para qué sirve. Estático a propósito. */
  queEs: string;
  serie: PuntoSerie[];
  color: string;
  unidad: Unidad;
  granularidad: Granularidad;
  /** Sustantivo del conteo, para que se lea "12 citas" y no "12". */
  sustantivo?: string;
  /** Rótulo del eje X. Si no se pasa se deduce de la granularidad. */
  etiquetaX?: string;
  /** Texto corto que aparece en el tooltip al pasar por un punto. */
  labelExplicativo?: string;
  isMobile?: boolean;
}

/** Rótulo del eje Y a partir de la unidad. */
function unidadEjeY(unidad: Unidad, sustantivo?: string): string {
  switch (unidad) {
    case 'eur': return 'euros';
    case 'pct': return '%';
    case 'dias': return 'días';
    case 'conteo': return sustantivo || 'cantidad';
  }
}

/** Rótulo por defecto del eje X según el grano. */
function etiquetaXPorDefecto(g: Granularidad): string {
  switch (g) {
    case 'hora': return 'hora del día';
    case 'dia': return 'día a día';
    case 'semana': return 'semana a semana';
    case 'mes': return 'mes a mes';
  }
}

export function GraficaExplicada({
  titulo, queEs, serie, color, unidad, granularidad,
  sustantivo, etiquetaX, labelExplicativo, isMobile = false,
}: GraficaExplicadaProps) {
  const lectura = useMemo(
    () => leerSerie(serie, { unidad, granularidad, sustantivo }),
    [serie, unidad, granularidad, sustantivo],
  );

  const fmt = (n: number) => formatearValor(n, unidad, sustantivo);
  const sinDatos = lectura.direccion === 'sin_datos';

  // Flecha y color de la tendencia. 'estable' no es ni bueno ni malo, así que va
  // en gris: pintarlo de verde o rojo sería mentir sobre un movimiento de ruido.
  const tend = (() => {
    if (lectura.tendenciaPct === null) return null;
    if (lectura.direccion === 'sube') return { icono: '↑', texto: `+${Math.round(lectura.tendenciaPct)} %`, color: T.success };
    if (lectura.direccion === 'baja') return { icono: '↓', texto: `${Math.round(lectura.tendenciaPct)} %`, color: T.danger };
    return { icono: '→', texto: 'estable', color: T.textTertiary };
  })();

  const chips: ChipLectura[] = [];
  if (!sinDatos) {
    if (lectura.pico) {
      chips.push({
        etiqueta: `Mejor ${nombreGrano(granularidad)}`,
        valor: `${fmt(lectura.pico.valor)} · ${etiquetarPunto(lectura.pico.fecha, granularidad)}`,
      });
    }
    chips.push({ etiqueta: 'Lo normal', valor: fmt(lectura.media) });
    if (tend) chips.push({ etiqueta: 'Tendencia', valor: `${tend.icono} ${tend.texto}`, color: tend.color });
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: T.textSecondary,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {titulo}
        </span>
        <InfoDot text={queEs} color={color} />
      </div>

      <LineChartMini
        serie={serie}
        color={color}
        fmt={fmt}
        labelExplicativo={labelExplicativo}
        unidadY={unidadEjeY(unidad, sustantivo)}
        etiquetaX={etiquetaX ?? etiquetaXPorDefecto(granularidad)}
        granularidad={granularidad}
        mostrarMedia
        marcarPico
        pieDeGrafica={lectura.totalTieneSentido ? 'total' : 'media'}
      />

      <BandaLectura
        frase={lectura.frase}
        chips={chips}
        color={color}
        atenuada={sinDatos}
        isMobile={isMobile}
      />
    </div>
  );
}

export default GraficaExplicada;
