// PDF del ticket de venta (SOLO web — usa jsPDF con carga diferida).
// El nativo usa el stub ticketPdf.ts (el nativo va por detras).
//
// QUE ES Y QUE NO ES (30 ago 2026): imprime un ticket con los datos fiscales del
// salon, el desglose de lo cobrado y la huella del registro inalterable
// (tickets_verifactu). Desde hoy, si el salon tiene NIF configurado, la huella se
// calcula con la CADENA OFICIAL de la AEAT y el ticket lleva su QR de cotejo.
//
// Lo que sigue sin ser: una factura REMITIDA a la AEAT. El QR se genera en local
// --no hace falta apoderamiento para eso-- pero hasta que el envio funcione, la
// URL que lleva dentro no encontrara el registro al otro lado. Por eso el pie
// cambia segun `qrUrl`: con QR dice que el envio esta en curso, y sin el sigue
// diciendo con todas las letras que el documento no se ha remitido.
// Ver informes/ESTUDIO-SECTORIAL-Y-REAUDITORIA-2026-08-30.md §7.

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
  // Registro inalterable
  hash: string;
  hashAnterior: string | null;
  /** URL de cotejo de la AEAT. Null mientras el salon no tenga NIF configurado. */
  qrUrl?: string | null;
  /** 'aeat_v1' | 'interno_v1'. Decide el titulo y el pie del bloque. */
  formatoHuella?: string | null;
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
  const alto = 150 + data.lineas.length * 6 + (data.qrUrl ? 34 : 0);
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

  // Cobros con bono: la linea de servicio llega marcada "(Bono)" desde
  // consumir_bono_cita. Se avisa explicitamente para que el cliente vea
  // que el servicio lo cubria un bono y solo se cobran productos/propina.
  const usaBono = data.lineas.some((li) => /\(bono\)/i.test(li.nombre || ''));
  if (usaBono) fila('Servicio cubierto por bono', '0,00 EUR');

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
  const esAeat = data.formatoHuella === 'aeat_v1';
  doc.text(esAeat ? 'Registro de facturacion (RD 1007/2023)' : 'Registro interno inalterable', L, y);
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

  // --- QR de cotejo ---
  //
  // Se dibuja solo si el ticket lo trae. No se inventa aqui: lo compone
  // `mint_ticket_verifactu` en el momento de emitir, con el NIF, el numero de
  // serie, la fecha y el importe que de verdad se sellaron. Construirlo en el
  // cliente seria poder dibujar un QR que no cuadre con lo firmado.
  if (data.qrUrl) {
    y += 4;
    try {
      const qrcode = (await import('qrcode-generator')).default;
      // Nivel M: es el que aguanta el manoseo de un ticket de papel sin crecer
      // demasiado en un rollo de 80 mm. Tipo 0 = que elija el tamano el solo.
      const qr = qrcode(0, 'M');
      qr.addData(data.qrUrl);
      qr.make();
      const lado = 26;
      doc.addImage(qr.createDataURL(4, 0), 'GIF', L, y, lado, lado);
      doc.setFontSize(6);
      doc.setTextColor(...grey);
      doc.text('Cotejo AEAT', L + lado + 3, y + 4);
      const urlLines = doc.splitTextToSize(data.qrUrl, W - lado - 3);
      doc.text(urlLines, L + lado + 3, y + 7.5);
      y += lado + 2;
    } catch {
      // Un QR que no se puede pintar no puede tumbar la descarga del ticket:
      // el ticket es lo que la clienta se lleva y el QR es un extra.
      doc.setFontSize(6.5);
      doc.setTextColor(...grey);
      doc.text('QR de cotejo no disponible en este dispositivo.', L, y);
      y += 3;
    }
  }

  // --- Pie honesto ---
  y += 4;
  doc.setFontSize(6.5);
  doc.setTextColor(...grey);
  const pie = doc.splitTextToSize(
    data.qrUrl
      ? 'Registro encadenado segun el RD 1007/2023. La remision a la AEAT esta en curso: hasta que se complete, el codigo de cotejo puede no localizar el registro.'
      : 'Documento sin valor fiscal: no se ha remitido a la AEAT. El IVA mostrado es orientativo.',
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
