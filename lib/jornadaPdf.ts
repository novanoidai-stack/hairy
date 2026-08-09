// Stub nativo: el PDF del registro de jornada es solo web por ahora (el nativo
// va por detras). El bundler web usa jornadaPdf.web.ts.
import type { DiaJornada, AsientoJornada } from './jornada';

export interface JornadaPdfData {
  salonNombre: string;
  salonCif?: string | null;
  salonDireccion?: string | null;
  profesional: string;
  desde: string;
  hasta: string;
  zona: string;
  dias: DiaJornada[];
  totalMinutos: number;
  totalPausaMinutos: number;
  incidencias: number;
  asientos?: AsientoJornada[];
}

export async function generarJornadaPdf(_data: JornadaPdfData): Promise<Blob> {
  throw new Error('El PDF del registro de jornada solo esta disponible en la web por ahora.');
}

export function descargarBlob(_blob: Blob, _filename: string): void {
  throw new Error('Descarga de PDF no disponible en nativo.');
}
