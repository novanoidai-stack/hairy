// PDF del ticket de venta (SOLO web — usa jsPDF con carga diferida).
// El nativo usa el stub ticketPdf.ts (el nativo va por detras).
//
// QUE ES Y QUE NO ES: esto imprime un ticket con los datos fiscales del salon,
// el desglose de lo cobrado y la huella del registro interno inalterable
// (hash encadenado de tickets_verifactu). NO es una factura enviada a la AEAT:
// no hay alta en VeriFactu ni QR de verificacion oficial, y el pie del documento
// lo dice con todas las letras. Ver informes/MEGA_INFORME_MECHA.md.

export interface TicketPdfLinea {
  nombre: string;
  precio_cents: number;
  cantidad: number;
}

export interface TicketPdfData {
  // Emisor (datos fiscales del salon)
  razonSocial: string;
  nif: string | null;
  direccionFiscal?: string | null;
  cpFiscal?: string | null;
  poblacionFiscal?: string | null;
  telefono?: string | null;
  color: string;
  // Documento
  numeroFactura: string; // "A-00007"
  fechaEmision: Date;
  clienteNombre?: string | null;
  // Importes (en centimos)
  lineas: TicketPdfLinea[];
  totalCents: number;
  propinaCents: number;
  descuentoCents: number;
  metodo: string;
  // Registro interno
  hash: string;
  hashAnterior: string | null;
  // true si el ticket se reconstruyo a posteriori (no se emitio al cobrar)
  reconstruido?: boolean;
}

// El IVA es el mismo criterio ORIENTATIVO que Informes: 21% plano sobre lo
// cobrado sin propina, porque cobro_lineas no guarda el tipo de cada concepto.
// Se etiqueta como tal en el documento; no vale para liquidar.
const IVA_PCT = 21;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return [244, 80, 30]; // fuego por defecto
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function eur(cents: number): string {
  return (
    (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' EUR'
  );
}

function fmtFechaHora(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function generarTicketPdf(data: TicketPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  // Formato ticket estrecho (80 mm), como el rollo de una impresora de tickets.
  // La altura se estima por contenido: jsPDF necesita el alto al construir.
  const alto = 150 + data.lineas.length * 6;
  const doc = new jsPDF({ unit: 'mm', format: [80, alto] });
  const [r, g, b] = hexToRgb(data.color);
  const ink: [number, number, number] = [28, 24, 20];
  const grey: [number, number, number] = [120, 110, 98];
  const L = 6;
  const R = 74;
  const W = R - L;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 80, 3, 'F');

  let y = 12;

  // --- Emisor ---
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const razon = doc.splitTextToSize(data.razonSocial || 'Salon', W);
  doc.text(razon, L, y);
  y += 5 * (Array.isArray(razon) ? razon.length : 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  if (data.nif) {
    doc.text(`NIF: ${data.nif}`, L, y);
    y += 4;
  }
  const dir = [data.direccionFiscal, [data.cpFiscal, data.poblacionFiscal].filter(Boolean).join(' ')]
    .filter((s) => s && String(s).trim())
    .join(', ');
  if (dir) {
    const dirLines = doc.splitTextToSize(dir, W);
    doc.text(dirLines, L, y);
    y += 4 * (Array.isArray(dirLines) ? dirLines.length : 1);
  }
  if (data.telefono) {
    doc.text(`Tel: ${data.telefono}`, L, y);
    y += 4;
  }

  y += 2;
  doc.setDrawColor(210, 205, 198);
  doc.line(L, y, R, y);
  y += 6;

  // --- Documento ---
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Ticket ${data.numeroFactura}`, L, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.text(fmtFechaHora(data.fechaEmision), L, y);
  y += 4;
  if (data.clienteNombre) {
    doc.text(`Cliente: ${data.clienteNombre}`, L, y);
    y += 4;
  }

  y += 2;
  doc.line(L, y, R, y);
  y += 6;

  // --- Lineas ---
  doc.setTextColor(...ink);
  doc.setFontSize(8);
  for (const li of data.lineas) {
    const cant = li.cantidad > 1 ? `${li.cantidad}x ` : '';
    const nombre = doc.splitTextToSize(`${cant}${li.nombre}`, W - 22);
    doc.text(nombre, L, y);
    doc.text(eur(li.precio_cents * (li.cantidad || 1)), R, y, { align: 'right' });
    y += 4.5 * (Array.isArray(nombre) ? nombre.length : 1);
  }

  y += 2;
  doc.line(L, y, R, y);
  y += 5;

  // --- Importes ---
  const fila = (etiqueta: string, valor: string, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(etiqueta, L, y);
    doc.text(valor, R, y, { align: 'right' });
    y += negrita ? 6 : 4.5;
  };

  if (data.descuentoCents > 0) fila('Descuento', `-${eur(data.descuentoCents)}`);
  if (data.propinaCents > 0) fila('Propina', eur(data.propinaCents));

  // Base e IVA orientativos, sobre lo cobrado sin propina.
  const baseConIva = Math.max(0, data.totalCents - data.propinaCents);
  const cuota = Math.round((baseConIva * IVA_PCT) / (100 + IVA_PCT));
  const base = baseConIva - cuota;
  doc.setTextColor(...grey);
  fila(`Base imponible (orient.)`, eur(base));
  fila(`IVA ${IVA_PCT}% (orient.)`, eur(cuota));

  doc.setTextColor(...ink);
  doc.setFontSize(11);
  fila('TOTAL', eur(data.totalCents), true);

  doc.setFontSize(8);
  doc.setTextColor(...grey);
  doc.setFont('helvetica', 'normal');
  doc.text(`Forma de pago: ${data.metodo}`, L, y);
  y += 6;

  // --- Huella del registro interno ---
  doc.line(L, y, R, y);
  y += 5;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Registro interno inalterable', L, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grey);
  doc.setFontSize(6.5);
  const hashLines = doc.splitTextToSize(`Huella: ${data.hash}`, W);
  doc.text(hashLines, L, y);
  y += 3 * (Array.isArray(hashLines) ? hashLines.length : 1);
  if (data.hashAnterior) {
    const antLines = doc.splitTextToSize(`Enlaza con: ${data.hashAnterior}`, W);
    doc.text(antLines, L, y);
    y += 3 * (Array.isArray(antLines) ? antLines.length : 1);
  }
  if (data.reconstruido) {
    y += 2;
    const avisoLines = doc.splitTextToSize(
      'Huella reconstruida despues del cobro (no se emitio en el momento).',
      W,
    );
    doc.text(avisoLines, L, y);
    y += 3 * (Array.isArray(avisoLines) ? avisoLines.length : 1);
  }

  // --- Pie honesto ---
  y += 4;
  doc.setFontSize(6.5);
  const pie = doc.splitTextToSize(
    'Documento sin valor fiscal: no se ha remitido a la AEAT. El IVA mostrado es orientativo.',
    W,
  );
  doc.text(pie, L, y);

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
