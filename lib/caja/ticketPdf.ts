// Stub nativo: la generacion del PDF del ticket es solo web por ahora
// (el nativo va por detras). El bundler web usa ticketPdf.web.ts.

export interface TicketPdfLinea {
  nombre: string;
  precio_cents: number;
  cantidad: number;
}

export interface TicketPdfData {
  razonSocial: string;
  nif: string | null;
  direccionFiscal?: string | null;
  cpFiscal?: string | null;
  poblacionFiscal?: string | null;
  telefono?: string | null;
  color: string;
  numeroFactura: string;
  fechaEmision: Date;
  clienteNombre?: string | null;
  lineas: TicketPdfLinea[];
  totalCents: number;
  propinaCents: number;
  descuentoCents: number;
  metodo: string;
  hash: string;
  hashAnterior: string | null;
  reconstruido?: boolean;
}

export async function generarTicketPdf(_data: TicketPdfData): Promise<Blob> {
  throw new Error('La generacion del PDF del ticket solo esta disponible en la web por ahora.');
}

export function descargarBlob(_blob: Blob, _filename: string): void {
  throw new Error('Descarga de PDF no disponible en nativo.');
}
