// Informe de registro de jornada en PDF (SOLO web — jsPDF con carga diferida).
// El nativo usa el stub jornadaPdf.ts.
//
// Este PDF es el documento que:
//   · se entrega a la persona trabajadora junto al recibo de salarios (resumen
//     mensual totalizado, que es lo que exige el art. 34.9 ET);
//   · se le ensena a la Inspeccion de Trabajo, con el detalle de asientos y la
//     huella de integridad de cada uno.
import {
  fmtMinutos, minutosADecimal, fmtHoraCorta, MARCA_LABEL, ORIGEN_LABEL,
  type DiaJornada, type AsientoJornada,
} from './jornada';

export interface JornadaPdfData {
  salonNombre: string;
  salonCif?: string | null;
  salonDireccion?: string | null;
  profesional: string;          // 'Todo el equipo' si es global
  desde: string;                // YYYY-MM-DD
  hasta: string;
  zona: string;
  dias: DiaJornada[];
  totalMinutos: number;
  totalPausaMinutos: number;
  incidencias: number;
  asientos?: AsientoJornada[];  // si viene, se añade el detalle de asientos
}

function fmtFechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function generarJornadaPdf(data: JornadaPdfData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ink: [number, number, number] = [28, 24, 20];
  const grey: [number, number, number] = [120, 110, 98];
  const L = 15;
  const R = 195;
  let y = 0;

  const nuevaPagina = () => {
    doc.addPage();
    y = 20;
  };
  const asegurar = (alto: number) => {
    if (y + alto > 282) nuevaPagina();
  };

  // ── Cabecera ───────────────────────────────────────────────────────────────
  doc.setFillColor(28, 24, 20);
  doc.rect(0, 0, 210, 4, 'F');

  y = 20;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Registro de jornada', L, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...grey);
  y += 6;
  doc.text(data.salonNombre || 'Centro de trabajo', L, y);
  if (data.salonCif) { y += 4.5; doc.text(`CIF/NIF: ${data.salonCif}`, L, y); }
  if (data.salonDireccion) { y += 4.5; doc.text(data.salonDireccion, L, y); }

  y += 4.5;
  doc.text(
    `Periodo: ${fmtFechaCorta(data.desde)} — ${fmtFechaCorta(data.hasta)}  ·  Zona horaria: ${data.zona}`,
    L, y
  );
  y += 4.5;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.text(`Persona trabajadora: ${data.profesional}`, L, y);

  // ── Totales ────────────────────────────────────────────────────────────────
  y += 8;
  doc.setFillColor(246, 244, 241);
  doc.roundedRect(L, y, R - L, 16, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grey);
  doc.text('Tiempo efectivo de trabajo', L + 4, y + 5.5);
  doc.text('Pausas (no computables)', L + 68, y + 5.5);
  doc.text('Dias con registro', L + 128, y + 5.5);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ink);
  doc.text(`${fmtMinutos(data.totalMinutos)}  (${minutosADecimal(data.totalMinutos)} h)`, L + 4, y + 12);
  doc.text(fmtMinutos(data.totalPausaMinutos), L + 68, y + 12);
  doc.text(String(new Set(data.dias.map((d) => d.dia)).size), L + 128, y + 12);
  y += 22;

  // ── Totalizacion diaria ────────────────────────────────────────────────────
  const cols = [L, L + 30, L + 78, L + 100, L + 122, L + 150, L + 172];
  const cabecera = () => {
    doc.setFillColor(28, 24, 20);
    doc.rect(L, y - 4.5, R - L, 6.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('FECHA', cols[0] + 2, y);
    doc.text('PERSONA', cols[1], y);
    doc.text('ENTRADA', cols[2], y);
    doc.text('SALIDA', cols[3], y);
    doc.text('TRABAJADO', cols[4], y);
    doc.text('PAUSAS', cols[5], y);
    doc.text('INC.', cols[6], y);
    y += 6;
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text('Totalizacion diaria', L, y);
  y += 7;
  cabecera();

  const ordenados = [...data.dias].sort(
    (a, b) => a.dia.localeCompare(b.dia) || a.profesional.localeCompare(b.profesional)
  );

  for (const d of ordenados) {
    if (y > 276) { nuevaPagina(); y += 4; cabecera(); }
    doc.text(fmtFechaCorta(d.dia), cols[0] + 2, y);
    doc.text(String(d.profesional).slice(0, 26), cols[1], y);
    doc.text(fmtHoraCorta(d.entrada, data.zona), cols[2], y);
    doc.text(d.en_curso ? 'En curso' : fmtHoraCorta(d.salida, data.zona), cols[3], y);
    doc.text(fmtMinutos(d.minutos), cols[4], y);
    doc.text(d.minutos_pausa > 0 ? fmtMinutos(d.minutos_pausa) : '—', cols[5], y);
    if (d.incidencia) {
      doc.setTextColor(190, 60, 45);
      doc.text('SI', cols[6], y);
      doc.setTextColor(...ink);
    }
    y += 5;
    doc.setDrawColor(232, 228, 222);
    doc.line(L, y - 3.4, R, y - 3.4);
  }

  if (ordenados.length === 0) {
    doc.setTextColor(...grey);
    doc.text('Sin registros en el periodo.', L + 2, y);
    doc.setTextColor(...ink);
    y += 6;
  }

  if (data.incidencias > 0) {
    asegurar(12);
    y += 4;
    doc.setTextColor(190, 60, 45);
    doc.setFontSize(8);
    doc.text(
      `${data.incidencias} dia(s) con incidencia: falta la marca de salida. Debe regularizarse mediante una correccion autorizada.`,
      L, y
    );
    doc.setTextColor(...ink);
    y += 6;
  }

  // ── Detalle de asientos (para la Inspeccion) ───────────────────────────────
  if (data.asientos && data.asientos.length > 0) {
    nuevaPagina();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Detalle de asientos', L, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text(
      'Cada asiento lleva una huella SHA-256 encadenada con la del asiento anterior: si se alterase o borrase alguno, la cadena deja de cuadrar.',
      L, y, { maxWidth: R - L }
    );
    y += 8;
    doc.setTextColor(...ink);

    const ac = [L, L + 14, L + 40, L + 60, L + 88, L + 112, L + 136];
    const acab = () => {
      doc.setFillColor(28, 24, 20);
      doc.rect(L, y - 4.5, R - L, 6.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('Nº', ac[0] + 1, y);
      doc.text('PERSONA', ac[1], y);
      doc.text('FECHA', ac[2], y);
      doc.text('HORA', ac[3], y);
      doc.text('MARCA', ac[4], y);
      doc.text('MODALIDAD', ac[5], y);
      doc.text('HUELLA / ESTADO', ac[6], y);
      y += 6;
      doc.setTextColor(...ink);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    };
    acab();

    for (const a of data.asientos) {
      if (y > 278) { nuevaPagina(); y += 4; acab(); }
      const anulado = a.estado === 'anulado';
      if (anulado) doc.setTextColor(...grey);
      doc.text(String(a.secuencia), ac[0] + 1, y);
      doc.text(String(a.profesional).slice(0, 14), ac[1], y);
      doc.text(fmtFechaCorta(a.dia), ac[2], y);
      doc.text(a.hora, ac[3], y);
      doc.text(MARCA_LABEL[a.tipo] ?? a.tipo, ac[4], y);
      doc.text(
        `${a.modalidad === 'remoto' ? 'Remoto' : 'Presencial'} · ${ORIGEN_LABEL[a.origen] ?? a.origen}`.slice(0, 22),
        ac[5], y
      );
      doc.text(anulado ? `ANULADO · ${(a.hash || '').slice(0, 10)}` : (a.hash || '').slice(0, 20), ac[6], y);
      if (anulado) doc.setTextColor(...ink);
      y += 4.4;
    }
  }

  // ── Pie legal en todas las paginas ─────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(...grey);
    doc.text(
      'Registro de jornada emitido por Mecha conforme al art. 34.9 del Estatuto de los Trabajadores. ' +
      'Los asientos son inalterables y se conservan cuatro años a disposicion de la persona trabajadora, ' +
      'de su representacion legal y de la Inspeccion de Trabajo.',
      L, 289, { maxWidth: R - L - 18 }
    );
    doc.text(`${i}/${paginas}`, R - 8, 292);
  }

  return doc.output('blob');
}

export function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
