/**
 * Generador de ROADMAP.docx
 * Ejecutar: node scripts/generate-roadmap.js
 * Para marcar un item: cambiar su status a 'done' | 'progress' | 'pending'
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── DATOS DEL ROADMAP ────────────────────────────────────────────────────────
// status: 'done' | 'progress' | 'pending'

const FASES = [
  {
    id: 1,
    titulo: 'Fase 1 — Nucleo de la cita (edicion en tiempo real)',
    items: [
      { num: '1.1', regla: 'PA-01 + CE-AG-02', desc: 'Editar hora/duracion de cita EN_CURSO. Si el fin se extiende, desplazar citas siguientes del mismo profesional en cadena.', status: 'done' },
      { num: '1.2', regla: 'RN-AG-002', desc: 'Validar solapamientos al mover/editar una cita (mismo profesional, misma franja)', status: 'pending' },
      { num: '1.3', regla: 'RN-AG-010', desc: 'Respetar el minimo de antelacion configurable al crear cita', status: 'pending' },
      { num: '1.4', regla: 'RN-AG-014', desc: 'Bloquear franjas fuera del horario laboral del profesional', status: 'pending' },
      { num: '1.5', regla: 'PA-05 + CE-AG-05', desc: 'Drag & drop para reasignar hora/profesional directamente desde el calendario', status: 'pending' },
      { num: '1.6', regla: 'RN-AG-032', desc: 'Sistema de confirmacion de cita (propuesta a confirmada) con accion manual o automatica', status: 'pending' },
      { num: '1.7', regla: 'CE-AG-08', desc: 'Reasignacion automatica cuando un profesional se bloquea con citas ya confirmadas', status: 'pending' },
      { num: '1.8', regla: 'CU-AG-05', desc: 'Flujo completo de cancelacion desde clienta + PA-06 (nunca borrado fisico)', status: 'pending' },
    ],
  },
  {
    id: 2,
    titulo: 'Fase 2 — Ciclo de cobro y post-cita',
    items: [
      { num: '2.1', regla: 'CU-AG-06', desc: 'Flujo cobro: finalizada a cobrada a historica (boton Cobrar en detalle de cita)', status: 'pending' },
      { num: '2.2', regla: 'RN-AG-061', desc: 'Importe final editable al cobrar (descuentos, ajustes)', status: 'pending' },
      { num: '2.3', regla: 'RN-AG-062', desc: 'Registro del metodo de pago al cobrar (efectivo, tarjeta, bizum)', status: 'pending' },
      { num: '2.4', regla: '—', desc: 'Cobro familiar: una transaccion cubre multiples citas del mismo grupo', status: 'pending' },
      { num: '2.5', regla: '—', desc: 'Post-cita: pantalla resumen tras cobrar (productos usados, propina, nota)', status: 'pending' },
    ],
  },
  {
    id: 3,
    titulo: 'Fase 3 — Tiempos muertos productivos [DIFERENCIAL CLAVE]',
    nota: 'Durante el tiempo de reposo (ej. tinte procesando) el profesional puede atender a otra clienta. Feature diferencial frente a Booksy y Fresha.',
    items: [
      { num: '3.1', regla: 'RN-AG-040', desc: 'Cada servicio tiene duracion_activa + tiempo_reposo separados', status: 'pending' },
      { num: '3.2', regla: 'RN-AG-041', desc: 'Durante tiempo de reposo el profesional puede atender otra cita (solapamiento gestionado)', status: 'pending' },
      { num: '3.3', regla: 'RN-AG-042', desc: 'El slot de reposo se muestra visualmente diferenciado en el calendario', status: 'pending' },
      { num: '3.4', regla: 'RN-AG-043', desc: 'Al calcular disponibilidad, solo bloquear duracion_activa, no el reposo', status: 'pending' },
      { num: '3.5', regla: 'RN-AG-070', desc: 'Motor de asignacion inteligente: maximizar uso de tiempos de reposo para citas adicionales', status: 'pending' },
      { num: '3.6', regla: 'RN-AG-071', desc: 'Sugerir hueco optimo al crear nueva cita aprovechando reposos existentes', status: 'pending' },
      { num: '3.7', regla: 'RN-AG-072', desc: 'Alerta si se solapa activo+activo (prohibido) vs activo+reposo (permitido)', status: 'pending' },
      { num: '3.8', regla: 'RN-AG-073-074', desc: 'Metricas de aprovechamiento: % tiempos muertos aprovechados por profesional/dia', status: 'pending' },
    ],
  },
  {
    id: 4,
    titulo: 'Fase 4 — Anti no-show y comunicaciones',
    items: [
      { num: '4.1', regla: 'RN-AG-050', desc: 'Recordatorio automatico configurable (24h, 2h antes) por WhatsApp/SMS/email', status: 'pending' },
      { num: '4.2', regla: 'RN-AG-051', desc: 'Deposito/senal: cobro parcial al confirmar para reducir no-shows', status: 'pending' },
      { num: '4.3', regla: 'RN-AG-052', desc: 'Marcar cita como NO_PRESENTADA tras X minutos de no llegada', status: 'pending' },
      { num: '4.4', regla: 'RN-AG-053', desc: 'Historial de no-shows por clienta (visible en ficha clienta)', status: 'pending' },
      { num: '4.5', regla: 'RN-AG-110', desc: 'Plantillas de mensaje personalizables por salon', status: 'pending' },
      { num: '4.6', regla: 'RN-AG-111', desc: 'Mensajes de confirmacion, recordatorio, cancelacion y post-cita', status: 'pending' },
      { num: '4.7', regla: 'RN-AG-112', desc: 'Log de comunicaciones enviadas visible desde la cita', status: 'pending' },
      { num: '4.8', regla: 'RN-AG-031', desc: 'Lista de espera: cuando cita cancelada libera hueco, notificar a clientas en espera', status: 'pending' },
      { num: '4.9', regla: 'RN-AG-033-034', desc: 'Gestion de lista de espera: prioridad, notificacion, confirmacion con deadline', status: 'pending' },
    ],
  },
  {
    id: 5,
    titulo: 'Fase 5 — Servicios encadenados multi-profesional [DIFERENCIAL CLAVE]',
    nota: 'Una cita puede requerir varios profesionales en secuencia (ej. corte + tinte + secado por distintas personas).',
    items: [
      { num: '5.1', regla: 'CU-AG-02', desc: 'Crear cita con multiples servicios encadenados', status: 'pending' },
      { num: '5.2', regla: 'RN-AG-080', desc: 'Cada sub-servicio puede tener profesional diferente asignado', status: 'pending' },
      { num: '5.3', regla: 'RN-AG-081', desc: 'Los sub-servicios se encadenan en tiempo (fin de uno = inicio del siguiente)', status: 'pending' },
      { num: '5.4', regla: 'RN-AG-082', desc: 'Validar disponibilidad de todos los profesionales implicados simultaneamente', status: 'pending' },
      { num: '5.5', regla: 'RN-AG-083', desc: 'Calendario muestra la cita encadenada como bloque unificado con secciones por profesional', status: 'pending' },
      { num: '5.6', regla: 'RN-AG-004-005', desc: 'Sub-tipos de servicio: servicio principal + add-ons opcionales', status: 'pending' },
      { num: '5.7', regla: 'CE-AG-04', desc: 'Excepcion: un profesional del encadenado no esta disponible, sugerir reorganizacion', status: 'pending' },
      { num: '5.8', regla: '—', desc: 'Asignacion inteligente: sugerir combinacion optima de profesionales para encadenado', status: 'pending' },
    ],
  },
  {
    id: 6,
    titulo: 'Fase 6 — Reorganizaciones y casos de excepcion',
    items: [
      { num: '6.1', regla: 'CE-AG-01', desc: 'Profesional llega tarde, ajustar citas del dia sin perder informacion', status: 'pending' },
      { num: '6.2', regla: 'CE-AG-02', desc: 'Cita se alarga mas de lo previsto, aviso de impacto en citas siguientes', status: 'done' },
      { num: '6.3', regla: 'CE-AG-03', desc: 'Clienta llega tarde, opciones: reducir servicio, mover, cancelar', status: 'pending' },
      { num: '6.4', regla: 'CE-AG-07', desc: 'Salon cierra inesperadamente, cancelacion masiva con notificacion a todas las clientas', status: 'pending' },
      { num: '6.5', regla: 'RN-AG-090', desc: 'Reagendado: mover cita a otra franja conservando todo el historial', status: 'pending' },
      { num: '6.6', regla: 'RN-AG-091', desc: 'Al reagendar, verificar disponibilidad del profesional en nuevo slot', status: 'pending' },
      { num: '6.7', regla: 'RN-AG-092', desc: 'Notificacion automatica a clienta cuando se reagenda su cita', status: 'pending' },
      { num: '6.8', regla: 'RN-AG-100', desc: 'Bloqueo de agenda del profesional (vacaciones, reunion, baja)', status: 'pending' },
      { num: '6.9', regla: 'RN-AG-101', desc: 'Al crear bloqueo sobre citas existentes, opcion de reagendar o cancelar afectadas', status: 'pending' },
      { num: '6.10', regla: 'RN-AG-102', desc: 'Bloqueo recurrente (ej. reunion semanal todos los lunes a las 9h)', status: 'pending' },
    ],
  },
  {
    id: 7,
    titulo: 'Fase 7 — Reserva omnicanal',
    items: [
      { num: '7.1', regla: 'CU-AG-03', desc: 'Portal de reserva publica para clientas (web/app sin login)', status: 'pending' },
      { num: '7.2', regla: 'CU-AG-04', desc: 'Integracion con Instagram / Google / WhatsApp para recibir reservas', status: 'pending' },
      { num: '7.3', regla: '—', desc: 'Walk-ins: registrar cita al momento sin reserva previa', status: 'pending' },
      { num: '7.4', regla: '—', desc: 'QR de reserva para mostrar en el salon', status: 'pending' },
      { num: '7.5', regla: '—', desc: 'Widget embebible en web propia del salon', status: 'pending' },
    ],
  },
  {
    id: 8,
    titulo: 'Fase 8 — Vistas y busqueda avanzada',
    items: [
      { num: '8.1', regla: '—', desc: 'Vista por profesional: columna unica con toda su agenda', status: 'pending' },
      { num: '8.2', regla: '—', desc: 'Vista por clienta: historial cronologico de todas sus citas', status: 'pending' },
      { num: '8.3', regla: '—', desc: 'Filtros en calendario: por profesional, servicio, estado, fecha', status: 'pending' },
      { num: '8.4', regla: '—', desc: 'Buscador global: encontrar cita por nombre clienta, telefono, servicio', status: 'pending' },
      { num: '8.5', regla: '—', desc: 'Vista semana / mes ademas de vista dia actual', status: 'pending' },
    ],
  },
  {
    id: 9,
    titulo: 'Fase 9 — Metricas e informes',
    items: [
      { num: '9.1', regla: 'M-01', desc: '% ocupacion por profesional / franja horaria / dia semana', status: 'pending' },
      { num: '9.2', regla: 'M-02', desc: 'Tasa de no-shows por profesional / servicio / periodo', status: 'pending' },
      { num: '9.3', regla: 'M-03', desc: 'Tiempo medio de espera entre citas (eficiencia de agenda)', status: 'pending' },
      { num: '9.4', regla: 'M-04', desc: '% tiempos de reposo aprovechados (citas adicionales metidas)', status: 'pending' },
      { num: '9.5', regla: 'M-05', desc: 'Ingresos por profesional, servicio, clienta, periodo', status: 'pending' },
      { num: '9.6', regla: 'M-06', desc: 'Servicios mas solicitados y combinaciones mas frecuentes', status: 'pending' },
      { num: '9.7', regla: 'M-07', desc: 'Retencion de clientas: frecuencia de visita, tiempo desde ultima cita', status: 'pending' },
      { num: '9.8', regla: 'M-08', desc: 'Comisiones por profesional calculadas automaticamente', status: 'pending' },
      { num: '9.9', regla: '—', desc: 'Informes exportables (PDF/CSV)', status: 'pending' },
      { num: '9.10', regla: '—', desc: 'Dashboard visual con KPIs principales en pantalla inicio', status: 'pending' },
    ],
  },
  {
    id: 10,
    titulo: 'Fase 10 — Gestion de equipo avanzada',
    items: [
      { num: '10.1', regla: '—', desc: 'Especialidades por profesional (que servicios puede hacer cada uno)', status: 'pending' },
      { num: '10.2', regla: '—', desc: 'Horario partido: dos turnos en el mismo dia con pausa en medio', status: 'pending' },
      { num: '10.3', regla: '—', desc: 'Precios diferenciados por categoria de profesional (senior vs junior)', status: 'pending' },
      { num: '10.4', regla: '—', desc: 'Sub-tipos de servicio: mismo servicio con variantes de precio/duracion', status: 'pending' },
      { num: '10.5', regla: '—', desc: 'Rol de recepcionista: gestionar agenda sin acceso a configuracion ni informes', status: 'pending' },
    ],
  },
  {
    id: 11,
    titulo: 'Fase 11 — IA avanzada',
    items: [
      { num: '11.1', regla: 'IA-NS', desc: 'Prediccion de no-shows: modelo que puntua probabilidad por clienta + franja + historial', status: 'pending' },
      { num: '11.2', regla: 'IA-OA', desc: 'Optimizacion automatica de agenda: sugerir reordenacion del dia para maximizar ingresos', status: 'pending' },
      { num: '11.3', regla: '—', desc: 'Analisis lenguaje natural: reportes en texto (ej. "este mes bajaron los cortes un 12%")', status: 'pending' },
      { num: '11.4', regla: '—', desc: 'Sugerencia de servicios: "esta clienta suele pedir tinte cada 8 semanas, ya van 9"', status: 'pending' },
    ],
  },
];

const DECISIONES = [
  'Deposito minimo: importe fijo, % del servicio, o configurable por servicio?',
  'Politica de cancelacion tardia: cobrar penalizacion? en que plazo? % del servicio?',
  'Reagendado automatico vs manual: proponer opciones a la clienta o dejar que elija libremente?',
  'Encadenado multi-salon: una cita puede tener profesionales de distintas sedes?',
  'Tiempo de reposo compartido: dos profesionales pueden compartir el mismo hueco de reposo?',
  'Visibilidad de precios en portal publico: mostrar precios antes de reservar o solo al confirmar?',
  'Integracion calendario externo: sincronizar con Google Calendar / Apple Calendar?',
  'App clienta independiente: app separada para que las clientas gestionen sus citas?',
];

// ─── COLORES ──────────────────────────────────────────────────────────────────

const C = {
  indigo: '6366F1',
  indigoSoft: 'EEF2FF',
  green: '16A34A',
  greenSoft: 'DCFCE7',
  amber: 'B45309',
  amberSoft: 'FEF3C7',
  gray: '64748B',
  graySoft: 'F8FAFC',
  border: 'E2E8F0',
  borderDark: 'CBD5E1',
  text: '0F172A',
  textSec: '475569',
  white: 'FFFFFF',
  phaseHeader: 'EEF2FF',
  notesBg: 'F0FDF4',
  notesBorder: 'BBF7D0',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const border = (color = C.border) => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color = C.border) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

function cell(children, opts = {}) {
  return new TableCell({
    borders: borders(opts.borderColor || C.border),
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}

function txt(text, opts = {}) {
  return new TextRun({
    text,
    font: 'Arial',
    size: opts.size || 18,
    bold: opts.bold || false,
    color: opts.color || C.text,
    italics: opts.italic || false,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore || 0, after: opts.spaceAfter || 0 },
    children: Array.isArray(children) ? children : [children],
    border: opts.border || undefined,
  });
}

function statusLabel(status) {
  if (status === 'done')     return { text: 'Completado', bg: C.greenSoft, color: C.green };
  if (status === 'progress') return { text: 'En progreso', bg: C.amberSoft, color: C.amber };
  return { text: 'Pendiente', bg: C.white, color: C.gray };
}

// ─── DOCUMENT BUILDER ─────────────────────────────────────────────────────────

function buildDoc() {
  const children = [];

  // Title
  children.push(para([
    txt('Hairy', { size: 52, bold: true, color: C.indigo }),
    txt(' — Roadmap de producto', { size: 52, bold: true, color: C.text }),
  ], { spaceBefore: 0, spaceAfter: 160 }));

  // Subtitle
  children.push(para(
    txt('Documento generado a partir de la lectura completa de los documentos de referencia. Cubre todos los puntos del Documento Modular 1.', { size: 18, color: C.textSec }),
    { spaceAfter: 400 }
  ));

  // Refs table
  children.push(para(txt('Documentos de referencia', { size: 22, bold: true }), { spaceAfter: 120 }));
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 4000, 2360],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([para(txt('Documento', { bold: true, size: 17, color: C.white }))], { bg: C.indigo, borderColor: C.indigo, width: 3000 }),
          cell([para(txt('Ruta', { bold: true, size: 17, color: C.white }))], { bg: C.indigo, borderColor: C.indigo, width: 4000 }),
          cell([para(txt('Prioridad', { bold: true, size: 17, color: C.white }))], { bg: C.indigo, borderColor: C.indigo, width: 2360 }),
        ],
      }),
      new TableRow({ children: [
        cell([para(txt('Documento Modular 1 — Agenda', { size: 17 }))], { width: 3000 }),
        cell([para(txt('Documentacion/documento-modular-1-agenda.docx', { size: 16, color: C.textSec }))], { width: 4000 }),
        cell([para(txt('MAXIMA — define el COMO', { size: 17, bold: true, color: C.green }))], { width: 2360 }),
      ]}),
      new TableRow({ children: [
        cell([para(txt('Dossier de Requisitos Innegociables', { size: 17 }))], { bg: C.graySoft, width: 3000 }),
        cell([para(txt('Documentacion/dossier_requisitos_innegociables.html', { size: 16, color: C.textSec }))], { bg: C.graySoft, width: 4000 }),
        cell([para(txt('Define el QUE minimo de v1', { size: 17 }))], { bg: C.graySoft, width: 2360 }),
      ]}),
      new TableRow({ children: [
        cell([para(txt('Documento 1 — Vision y Principios', { size: 17 }))], { width: 3000 }),
        cell([para(txt('Documentacion/documento-1-vision-principios-rectores(1).docx', { size: 16, color: C.textSec }))], { width: 4000 }),
        cell([para(txt('Marco estrategico', { size: 17 }))], { width: 2360 }),
      ]}),
    ],
  }));

  children.push(para(txt('Regla de jerarquia: En caso de contradiccion, el Documento Modular 1 tiene prioridad sobre el Dossier.', { size: 17, bold: true, color: C.indigo }), { spaceBefore: 160, spaceAfter: 400 }));

  // Legend
  children.push(para(txt('Estado actual', { size: 22, bold: true }), { spaceAfter: 120 }));
  children.push(new Table({
    width: { size: 4000, type: WidthType.DXA },
    columnWidths: [1400, 2600],
    rows: [
      new TableRow({ children: [
        cell([para(txt('Completado', { size: 17, bold: true, color: C.green }))], { bg: C.greenSoft, width: 1400 }),
        cell([para(txt('Item implementado y funcionando', { size: 17 }))], { width: 2600 }),
      ]}),
      new TableRow({ children: [
        cell([para(txt('En progreso', { size: 17, bold: true, color: C.amber }))], { bg: C.amberSoft, width: 1400 }),
        cell([para(txt('Item en desarrollo activo', { size: 17 }))], { width: 2600 }),
      ]}),
      new TableRow({ children: [
        cell([para(txt('Pendiente', { size: 17, color: C.gray }))], { width: 1400 }),
        cell([para(txt('Item no iniciado', { size: 17 }))], { width: 2600 }),
      ]}),
    ],
  }));
  children.push(para('', { spaceAfter: 400 }));

  // Phases
  for (const fase of FASES) {
    const doneCount = fase.items.filter(i => i.status === 'done').length;
    const totalCount = fase.items.length;

    // Phase header
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [7760, 1600],
      rows: [
        new TableRow({ children: [
          cell([para(txt(fase.titulo, { size: 22, bold: true, color: C.indigo }))], { bg: C.phaseHeader, borderColor: C.indigo, width: 7760 }),
          cell([para(txt(`${doneCount}/${totalCount}`, { size: 20, bold: true, color: doneCount === totalCount ? C.green : C.indigo }), { align: AlignmentType.CENTER })], { bg: C.phaseHeader, borderColor: C.indigo, width: 1600 }),
        ]}),
      ],
    }));

    // Optional note
    if (fase.nota) {
      children.push(para(txt(fase.nota, { size: 17, italic: true, color: C.green }), { spaceBefore: 80, spaceAfter: 80 }));
    }

    // Items table
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [520, 1400, 5640, 1800],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell([para(txt('#', { bold: true, size: 16, color: C.textSec }))], { bg: C.graySoft, width: 520 }),
            cell([para(txt('Regla', { bold: true, size: 16, color: C.textSec }))], { bg: C.graySoft, width: 1400 }),
            cell([para(txt('Descripcion', { bold: true, size: 16, color: C.textSec }))], { bg: C.graySoft, width: 5640 }),
            cell([para(txt('Estado', { bold: true, size: 16, color: C.textSec }))], { bg: C.graySoft, width: 1800 }),
          ],
        }),
        ...fase.items.map((item, idx) => {
          const s = statusLabel(item.status);
          const rowBg = idx % 2 === 0 ? C.white : C.graySoft;
          return new TableRow({ children: [
            cell([para(txt(item.num, { size: 17, color: C.textSec }))], { bg: rowBg, width: 520 }),
            cell([para(txt(item.regla, { size: 17, color: C.indigo, bold: item.regla !== '—' }))], { bg: rowBg, width: 1400 }),
            cell([para(txt(item.desc, { size: 17 }))], { bg: item.status === 'done' ? C.greenSoft : rowBg, width: 5640 }),
            cell([para(txt(s.text, { size: 17, bold: item.status !== 'pending', color: s.color }))], { bg: s.bg, width: 1800 }),
          ]});
        }),
      ],
    }));

    children.push(para('', { spaceAfter: 280 }));
  }

  // Pending decisions
  children.push(para(txt('Decisiones pendientes (seccion 17 del Documento Modular 1)', { size: 22, bold: true, color: C.indigo }), { spaceBefore: 200, spaceAfter: 120 }));
  children.push(para(txt('Deben resolverse antes o durante la fase correspondiente.', { size: 17, color: C.textSec }), { spaceAfter: 160 }));
  for (let i = 0; i < DECISIONES.length; i++) {
    children.push(para([
      txt(`${i + 1}.  `, { bold: true, size: 18, color: C.indigo }),
      txt(DECISIONES[i], { size: 18 }),
    ], { spaceBefore: 60, spaceAfter: 60 }));
  }

  // Footer
  children.push(para(txt('Basado en lectura completa de los documentos de referencia — mayo 2026', { size: 16, color: C.gray, italic: true }), { spaceBefore: 400 }));

  return new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 18, color: C.text } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children,
    }],
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, '..', 'ROADMAP.docx');

Packer.toBuffer(buildDoc()).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('ROADMAP.docx generado.');
});
