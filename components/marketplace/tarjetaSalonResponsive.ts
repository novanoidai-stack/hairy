/**
 * Pasada 2 / Micro-Tarea D3: Formateador Responsivo para Tarjetas de Salón en Marketplace (375px)
 * Calcula el diseño flex de las tarjetas de salón para que la imagen, insignias de verificación
 * y botón de "Reservar Cita" no sufran desbordamiento horizontal en pantallas compactas.
 */

export interface DatosTarjetaSalon {
  anchoViewportPx: number;
  nombreSalon: string;
  badges: string[];
}

export interface LayoutTarjetaCalculado {
  flexDirection: 'row' | 'column';
  anchoImagenPx: number;
  altoImagenPx: number;
  maxCaracteresNombre: number;
  esCompacto: boolean;
}

export function calcularLayoutTarjetaSalon(d: DatosTarjetaSalon): LayoutTarjetaCalculado {
  const esCompacto = d.anchoViewportPx < 480;

  if (esCompacto) {
    return {
      flexDirection: 'column',
      anchoImagenPx: Math.max(d.anchoViewportPx - 32, 280),
      altoImagenPx: 160,
      maxCaracteresNombre: 30,
      esCompacto: true,
    };
  }

  return {
    flexDirection: 'row',
    anchoImagenPx: 220,
    altoImagenPx: 140,
    maxCaracteresNombre: 50,
    esCompacto: false,
  };
}
