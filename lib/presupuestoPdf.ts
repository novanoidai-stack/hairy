// Stub nativo: la generación de PDF de presupuestos es solo web por ahora
// (el nativo va por detrás). El bundler web usa presupuestoPdf.web.ts.
export interface PresupuestoPdfLinea {
  nombre: string;
  precio_cents: number;
  cantidad: number;
}

export interface PresupuestoPdfData {
  salonNombre: string;
  color: string;
  salonDireccion?: string | null;
  salonTelefono?: string | null;
  numero: number | null;
  fecha: Date;
  contactoNombre?: string | null;
  titulo?: string | null;
  notas?: string | null;
  lineas: PresupuestoPdfLinea[];
  totalCents: number;
  validoHasta?: string | null;
}

export async function generarPresupuestoPdf(_data: PresupuestoPdfData): Promise<Blob> {
  throw new Error('La generación de PDF de presupuestos solo está disponible en la web por ahora.');
}

export function descargarBlob(_blob: Blob, _filename: string): void {
  throw new Error('Descarga de PDF no disponible en nativo.');
}
