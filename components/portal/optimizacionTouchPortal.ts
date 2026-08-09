/**
 * Pasada 2 / Micro-Tarea D2: Formateador de Grid y Selección Touch para Modal de Reserva Pública (375px)
 * Organiza los botones de franjas horarias en cuadrícula de 3 columnas (mínimo 44px de target touch)
 * previniendo solapes visuales y garantizando área de toque accesiible según W3C WCAG 2.1.
 */

export interface HorarioDisponibleItem {
  horaHHMM: string; // ej. "10:30"
  disponible: boolean;
  esExpress?: boolean;
}

export interface GridPortalCalculada {
  columnasGrid: number;
  anchoBotonPx: number;
  altoBotonPx: number; // Mínimo 44px para WCAG 2.1 AAA
  esTouchAccessible: boolean;
}

export function calcularGridSlotsPortal(anchoContenedorPx: number): GridPortalCalculada {
  // En iPhone SE (375px), con padding lateral de 16px (343px útiles):
  // 3 columnas de 100px con 10px de gap
  const gapPx = 10;
  const paddingLateralPx = 32;
  const anchoUtil = Math.max(anchoContenedorPx - paddingLateralPx, 200);

  const columnasGrid = anchoContenedorPx < 400 ? 3 : 4;
  const anchoBotonPx = Math.floor((anchoUtil - (gapPx * (columnasGrid - 1))) / columnasGrid);
  const altoBotonPx = 48; // Cumple holgadamente los 44px mínimos touch

  return {
    columnasGrid,
    anchoBotonPx,
    altoBotonPx,
    esTouchAccessible: altoBotonPx >= 44 && anchoBotonPx >= 60,
  };
}
