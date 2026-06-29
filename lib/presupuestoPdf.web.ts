// Generación del PDF del presupuesto (SOLO web — usa jsPDF, carga diferida).
// El nativo usa el stub presupuestoPdf.ts (el nativo va por detrás).
import { eur } from './presupuestos';

export interface PresupuestoPdfLinea {
  nombre: string;
  precio_cents: number;
  cantidad: number;
}

export interface PresupuestoPdfData {
  salonNombre: string;
  color: string; // hex de acento (#rrggbb)
  salonDireccion?: string | null;
  salonTelefono?: string | null;
  numero: number | null;
  fecha: Date;
  contactoNombre?: string | null;
  titulo?: string | null;
  notas?: string | null;
  lineas: PresupuestoPdfLinea[];
  totalCents: number;
  validoHasta?: string | null; // ISO date
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return [244, 80, 30]; // fuego por defecto
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function generarPresupuestoPdf(data: PresupuestoPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const [r, g, b] = hexToRgb(data.color);
  const ink: [number, number, number] = [28, 24, 20];
  const grey: [number, number, number] = [120, 110, 98];
  const L = 18;
  const R = 192;
  const W = R - L;

  // Barra de acento superior
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 6, 'F');

  // Cabecera: salón (izq) + bloque presupuesto (der)
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(data.salonNombre || 'Salón', L, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  let subY = 30;
  if (data.salonDireccion) { doc.text(String(data.salonDireccion), L, subY); subY += 4.5; }
  if (data.salonTelefono) { doc.text(String(data.salonTelefono), L, subY); subY += 4.5; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(r, g, b);
  doc.text('PRESUPUESTO', R, 24, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...grey);
  doc.text(`Nº P-${data.numero ?? '—'}`, R, 30, { align: 'right' });
  doc.text(fmtFecha(data.fecha), R, 34.5, { align: 'right' });

  // Línea divisoria
  let y = Math.max(subY, 40) + 2;
  doc.setDrawColor(225, 218, 208);
  doc.setLineWidth(0.3);
  doc.line(L, y, R, y);
  y += 8;

  // Para + título
  if (data.contactoNombre) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...grey);
    doc.text('PARA', L, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(String(data.contactoNombre), L, y + 5.5);
    y += 12;
  }
  if (data.titulo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(String(data.titulo), L, y);
    y += 7;
  }

  // Cabecera de la tabla
  const colCant = R - 78;   // centro de "Cant."
  const colPrecio = R - 40; // derecha de "Precio"
  const colImporte = R;     // derecha de "Importe"
  y += 2;
  doc.setFillColor(248, 244, 238);
  doc.rect(L, y - 5, W, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);
  doc.text('CONCEPTO', L + 2, y);
  doc.text('CANT.', colCant, y, { align: 'center' });
  doc.text('PRECIO', colPrecio, y, { align: 'right' });
  doc.text('IMPORTE', colImporte - 2, y, { align: 'right' });
  y += 9;

  // Filas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const linea of data.lineas) {
    if (y > 268) { doc.addPage(); y = 24; }
    const cant = Math.max(1, linea.cantidad || 1);
    const importe = (linea.precio_cents || 0) * cant;
    doc.setTextColor(...ink);
    const nombre = doc.splitTextToSize(String(linea.nombre || ''), W - 86);
    doc.text(nombre, L + 2, y);
    doc.setTextColor(...grey);
    doc.text(String(cant), colCant, y, { align: 'center' });
    doc.text(eur(linea.precio_cents || 0), colPrecio, y, { align: 'right' });
    doc.setTextColor(...ink);
    doc.text(eur(importe), colImporte - 2, y, { align: 'right' });
    const filas = Array.isArray(nombre) ? nombre.length : 1;
    y += 6 * filas + 2;
    doc.setDrawColor(238, 232, 224);
    doc.line(L, y - 3, R, y - 3);
  }

  // Total
  y += 4;
  if (y > 262) { doc.addPage(); y = 24; }
  doc.setFillColor(r, g, b);
  doc.roundedRect(R - 78, y - 6, 78, 13, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', R - 74, y + 2);
  doc.setFontSize(14);
  doc.text(eur(data.totalCents), R - 4, y + 2.5, { align: 'right' });
  y += 16;

  // Validez + notas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  if (data.validoHasta) {
    const d = new Date(data.validoHasta + 'T00:00:00');
    if (!isNaN(d.getTime())) { doc.text(`Válido hasta el ${fmtFecha(d)}.`, L, y); y += 5; }
  }
  if (data.notas) {
    const notas = doc.splitTextToSize(String(data.notas), W);
    doc.text(notas, L, y);
    y += 5 * (Array.isArray(notas) ? notas.length : 1);
  }

  // Pie
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.text(
    `Presupuesto orientativo · No es una factura · ${data.salonNombre || ''}`.trim(),
    105, 288, { align: 'center' }
  );

  return doc.output('blob');
}

export function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
