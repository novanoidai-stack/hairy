// Edge Function: enviar-informe-periodico
// Envia al propietario de cada salon el informe en PDF de su actividad: semanal
// (todos los lunes, la semana que acaba de cerrar) o mensual (dia 1, el mes que
// acaba de cerrar). Lo disparan los crons mecha_informe_semanal / mecha_informe_mensual
// con la service_role key como Bearer (ver migrations/informe-periodico-email.sql).
//
// El PDF replica TODAS las secciones de la pantalla Informes (resumen, ocupacion,
// no-shows, tiempos productivos, ingresos, servicios, fidelizacion, comisiones),
// con una maquetacion mas seca (tablas, sin graficas). Para fidelizacion y
// comisiones reutiliza el MISMO motor que la app y la calculadora publica
// (lib/informes/retencionClientes.ts y lib/comisiones/motor.js, copiados sin
// tocar en ./lib) para que los numeros nunca diverjan de lo que ve el propietario
// en pantalla.
//
// Secretos (Supabase -> Edge Functions -> Secrets, compartidos con enviar-presupuesto):
//   SMTP_HOST (def smtp.hostinger.com) SMTP_PORT (def 465) SMTP_USER SMTP_PASS
//   SMTP_FROM (def = SMTP_USER) PUBLIC_APP_URL (def https://www.mechaa.es)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import { calcularComisiones } from './lib/motor.js';
import { AVISO_LEGAL, CUOTA_PATRONAL_PCT } from './lib/parametrosLegales.js';
import {
  serieBaseFidelizada, embudoFidelizacion, frecuenciaRetorno, cohortesRetencion,
  frasesCohortes, type VisitaHistorica,
} from './lib/retencionClientes.ts';
import { claveServicio } from '../shared/claveServicio.ts';

const SERVICE_ROLE = claveServicio();
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', SERVICE_ROLE);
const SMTP_HOST = Deno.env.get('SMTP_HOST') || Deno.env.get('EMAIL_HOST') || 'smtp.hostinger.com';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || Deno.env.get('EMAIL_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER') || Deno.env.get('EMAIL_USER') || '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') || Deno.env.get('EMAIL_PASS') || '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') || SMTP_USER;
const APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://www.mechaa.es').replace(/\/$/, '');

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const ESTADOS_ACTIVOS = new Set(['pendiente', 'confirmada', 'completada']);
const COMISION_PCT_POR_DEFECTO = 30;
const MESES_HISTORICO = 13;
const TOPE_HISTORICO = 20000;
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const FRANJAS = ['09-11', '11-13', '13-15', '15-17', '17-20'];
function franjaIndex(hora: number): number {
  if (hora < 11) return 0;
  if (hora < 13) return 1;
  if (hora < 15) return 2;
  if (hora < 17) return 3;
  return 4;
}

const fmtEur = (n: number) => `${(n || 0).toFixed(2)} EUR`;
const fmtPct = (n: number) => `${Math.round(n || 0)}%`;

type Destinatario = { profile_id: string; negocio_id: string; email: string; nombre_negocio: string | null };
type Rango = { desde: string; hasta: string };
type CitaRow = {
  id: string; inicio: string; fin: string; fin_activa: string | null; fin_espera: string | null;
  estado: string; profesional_id: string | null; servicio_id: string | null; cliente_id: string | null;
};

function toB64(bytes: Uint8Array): string {
  let bin = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function fmtDateEs(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso));
}
function fmtMonthEs(iso: string): string {
  const s = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function madridDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
const DIA_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// El runtime del edge function corre en UTC, pero franjas/dias/agrupaciones deben
// leerse en hora de Madrid (como hace el navegador del propietario) o un turno de
// noche cerca de medianoche cambiaria de dia/franja al cruzar el Atlantico horario.
function madridHourAndDay(iso: string): { hour: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date(iso));
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  const day = DIA_MAP[parts.find(p => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
  return { hour, day };
}

// ===========================================================================
// PDF: helpers de maquetacion (paginado automatico, sin dependencias de DOM)
// ===========================================================================
const PAGE_W = 595.28, PAGE_H = 841.89; // A4
const L = 44, R = PAGE_W - 44;
const BOTTOM = 46;
const FUEGO = rgb(244 / 255, 80 / 255, 30 / 255);
const INK = rgb(28 / 255, 24 / 255, 20 / 255);
const GREY = rgb(115 / 255, 102 / 255, 88 / 255);
const LINE = rgb(0.9, 0.87, 0.83);

type Ctx = { doc: PDFDocument; font: PDFFont; bold: PDFFont; page: PDFPage; y: number };

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: FUEGO });
  ctx.y = PAGE_H - 40;
}
function ensure(ctx: Ctx, need: number) {
  if (ctx.y - need < BOTTOM) newPage(ctx);
}
function sectionTitle(ctx: Ctx, t: string, subtitle?: string) {
  ensure(ctx, 40);
  ctx.page.drawLine({ start: { x: L, y: ctx.y + 12 }, end: { x: R, y: ctx.y + 12 }, thickness: 1, color: FUEGO });
  ctx.page.drawText(t, { x: L, y: ctx.y, size: 12.5, font: ctx.bold, color: INK });
  if (subtitle) {
    const w = ctx.font.widthOfTextAtSize(subtitle, 9);
    ctx.page.drawText(subtitle, { x: Math.max(L, R - w), y: ctx.y + 1, size: 9, font: ctx.font, color: GREY });
  }
  ctx.y -= 20;
}
function wrapText(font: PDFFont, text: string, maxWidth: number, size: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function drawParagraph(ctx: Ctx, text: string, size = 8.5, color = GREY) {
  const lines = wrapText(ctx.font, text, R - L, size);
  ensure(ctx, lines.length * 11 + 4);
  lines.forEach(l => { ctx.page.drawText(l, { x: L, y: ctx.y, size, font: ctx.font, color }); ctx.y -= 11; });
}
function drawKpiGrid(ctx: Ctx, items: Array<{ label: string; value: string }>, cols = 3) {
  const gap = 20;
  const colW = (R - L - gap * (cols - 1)) / cols;
  const rows = Math.ceil(items.length / cols);
  ensure(ctx, rows * 32 + 8);
  const topY = ctx.y;
  items.forEach((k, i) => {
    const col = i % cols; const row = Math.floor(i / cols);
    const x = L + col * (colW + gap);
    const y = topY - row * 32;
    ctx.page.drawText(k.label.toUpperCase(), { x, y, size: 7.5, font: ctx.bold, color: GREY });
    ctx.page.drawText(k.value, { x, y: y - 14, size: 13, font: ctx.bold, color: INK });
  });
  ctx.y = topY - rows * 32 - 8;
}
function drawColumns(ctx: Ctx, cols: Array<{ title: string; rows: Array<[string, string]> }>) {
  const n = cols.length;
  const gap = 18;
  const colW = (R - L - gap * (n - 1)) / n;
  const maxRows = Math.max(1, ...cols.map(c => c.rows.length));
  const need = 16 + maxRows * 13 + 10;
  ensure(ctx, need);
  const topY = ctx.y;
  cols.forEach((col, i) => {
    const x = L + i * (colW + gap);
    let y = topY;
    ctx.page.drawText(col.title.toUpperCase(), { x, y, size: 7.5, font: ctx.bold, color: GREY });
    y -= 14;
    if (col.rows.length === 0) {
      ctx.page.drawText('Sin datos', { x, y, size: 9, font: ctx.font, color: GREY });
      y -= 13;
    }
    col.rows.forEach(([label, value]) => {
      const lbl = label.length > 24 ? `${label.slice(0, 22)}...` : label;
      ctx.page.drawText(lbl, { x, y, size: 9, font: ctx.font, color: INK });
      const vw = ctx.font.widthOfTextAtSize(value, 9);
      ctx.page.drawText(value, { x: x + colW - vw, y, size: 9, font: ctx.font, color: INK });
      y -= 13;
    });
  });
  ctx.y = topY - need;
}
function drawTable(
  ctx: Ctx, headers: string[], rows: string[][], widths: number[], aligns: Array<'left' | 'right'>,
  totalsRow?: string[],
) {
  ensure(ctx, 26);
  let x = L;
  headers.forEach((h, i) => {
    const w = widths[i];
    if (aligns[i] === 'right') {
      const tw = ctx.bold.widthOfTextAtSize(h, 7.5);
      ctx.page.drawText(h.toUpperCase(), { x: x + w - tw, y: ctx.y, size: 7.5, font: ctx.bold, color: GREY });
    } else {
      ctx.page.drawText(h.toUpperCase(), { x, y: ctx.y, size: 7.5, font: ctx.bold, color: GREY });
    }
    x += w;
  });
  ctx.y -= 8;
  ctx.page.drawLine({ start: { x: L, y: ctx.y }, end: { x: R, y: ctx.y }, thickness: 0.75, color: LINE });
  ctx.y -= 13;

  const drawRow = (cells: string[], bold = false) => {
    ensure(ctx, 15);
    let x = L;
    cells.forEach((c, i) => {
      const w = widths[i];
      const f = bold ? ctx.bold : ctx.font;
      if (aligns[i] === 'right') {
        const tw = f.widthOfTextAtSize(c, 9);
        ctx.page.drawText(c, { x: x + w - tw, y: ctx.y, size: 9, font: f, color: INK });
      } else {
        const txt = c.length > 34 ? `${c.slice(0, 32)}...` : c;
        ctx.page.drawText(txt, { x, y: ctx.y, size: 9, font: f, color: INK });
      }
      x += w;
    });
    ctx.y -= 15;
  };

  if (rows.length === 0) {
    ctx.page.drawText('Sin datos en este periodo', { x: L, y: ctx.y, size: 9, font: ctx.font, color: GREY });
    ctx.y -= 15;
  }
  rows.forEach(r => drawRow(r));
  if (totalsRow) {
    ensure(ctx, 20);
    ctx.page.drawLine({ start: { x: L, y: ctx.y + 9 }, end: { x: R, y: ctx.y + 9 }, thickness: 0.75, color: LINE });
    drawRow(totalsRow, true);
  }
  ctx.y -= 8;
}

// ===========================================================================
// Construccion del PDF completo
// ===========================================================================
interface DatosInforme {
  salon: string; tipoLabel: string; periodoLabel: string; generado: string;
  kpis: Array<{ label: string; value: string }>;
  ocupacion: { porProf: Array<[string, string]>; porFranja: Array<[string, string]>; porDia: Array<[string, string]> };
  noShows: { subtitle: string; porProf: Array<[string, string]>; porServicio: Array<[string, string]> };
  tiempos: { subtitle: string; espera: Array<[string, string]>; reposo: Array<[string, string]> };
  ingresos: { porProf: Array<[string, string]>; porServicio: Array<[string, string]>; porCliente: Array<[string, string]> };
  servicios: { ranking: Array<[string, string]>; combos: Array<[string, string]> };
  fidelizacion: { kpis: Array<{ label: string; value: string }>; frase: string };
  comisiones: {
    subtitle: string;
    headers: string[]; rows: string[][]; widths: number[]; aligns: Array<'left' | 'right'>; totals: string[];
    aviso: string;
  };
}

async function construirInformePdf(d: DatosInforme): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: 0 };
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: FUEGO });
  ctx.y = PAGE_H - 44;

  ctx.page.drawText('mecha.', { x: L, y: ctx.y, size: 21, font: bold, color: INK });
  ctx.page.drawText(d.tipoLabel, { x: L, y: ctx.y - 15, size: 10, font, color: GREY });
  const rightLine = (text: string, ty: number, f: PDFFont, color = GREY) => {
    const w = f.widthOfTextAtSize(text, 9.5);
    ctx.page.drawText(text, { x: R - w, y: ty, size: 9.5, font: f, color });
  };
  rightLine(d.salon, ctx.y, bold, INK);
  rightLine(d.periodoLabel, ctx.y - 13, font);
  rightLine(`Generado el ${d.generado}`, ctx.y - 26, font);
  ctx.y -= 46;
  ctx.page.drawLine({ start: { x: L, y: ctx.y }, end: { x: R, y: ctx.y }, thickness: 1.5, color: FUEGO });
  ctx.y -= 22;

  sectionTitle(ctx, 'Resumen');
  drawKpiGrid(ctx, d.kpis, 3);

  sectionTitle(ctx, 'Distribucion de citas', `${d.kpis[0]?.value ?? ''} citas en el periodo`);
  drawColumns(ctx, [
    { title: 'Por profesional', rows: d.ocupacion.porProf },
    { title: 'Por franja horaria', rows: d.ocupacion.porFranja },
    { title: 'Por dia', rows: d.ocupacion.porDia },
  ]);

  sectionTitle(ctx, 'No-shows', d.noShows.subtitle);
  drawColumns(ctx, [
    { title: 'Por profesional', rows: d.noShows.porProf },
    { title: 'Por servicio', rows: d.noShows.porServicio },
  ]);

  sectionTitle(ctx, 'Tiempos productivos', d.tiempos.subtitle);
  drawColumns(ctx, [
    { title: 'Espera media entre citas', rows: d.tiempos.espera },
    { title: 'Reposo aprovechado', rows: d.tiempos.reposo },
  ]);

  sectionTitle(ctx, 'Ingresos');
  drawColumns(ctx, [
    { title: 'Por profesional', rows: d.ingresos.porProf },
    { title: 'Por servicio (top 10)', rows: d.ingresos.porServicio },
    { title: 'Por cliente (top 10)', rows: d.ingresos.porCliente },
  ]);

  sectionTitle(ctx, 'Servicios');
  drawColumns(ctx, [
    { title: 'Ranking (top 10)', rows: d.servicios.ranking },
    { title: 'Combinaciones frecuentes', rows: d.servicios.combos },
  ]);

  sectionTitle(ctx, 'Fidelizacion de clientes', '13 meses de historial');
  drawKpiGrid(ctx, d.fidelizacion.kpis, 3);
  drawParagraph(ctx, d.fidelizacion.frase);
  ctx.y -= 4;

  sectionTitle(ctx, 'Comisiones', d.comisiones.subtitle);
  drawTable(ctx, d.comisiones.headers, d.comisiones.rows, d.comisiones.widths, d.comisiones.aligns, d.comisiones.totals);
  drawParagraph(ctx, d.comisiones.aviso, 8);

  ensure(ctx, 20);
  ctx.page.drawText(
    'Informe generado automaticamente por Mecha a partir de los mismos calculos que ves en la app.',
    { x: L, y: BOTTOM - 14, size: 7.5, font, color: GREY },
  );

  return doc.save();
}

function emailHtml(o: { titulo: string; salon: string; periodoLabel: string; cta: string }): string {
  return `<div style='max-width:520px;margin:0 auto;padding:28px 22px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1814;'>`
    + `<div style='font-size:20px;font-weight:800;color:#f4501e;'>mecha.</div>`
    + `<div style='background:#fffdfb;border:1px solid rgba(40,30,24,0.10);border-radius:14px;padding:24px;margin-top:16px;'>`
    + `<h1 style='font-size:18px;margin:0 0 10px;'>${o.titulo}</h1>`
    + `<p style='font-size:14px;line-height:1.6;color:#5c5249;margin:0 0 20px;'>Aqui tienes el informe completo de ${o.salon} del periodo <strong>${o.periodoLabel}</strong>, en el PDF adjunto.</p>`
    + `<a href='${o.cta}' style='display:inline-block;background:#f4501e;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:10px;'>Ver informe en la app</a>`
    + `</div></div>`;
}

// ===========================================================================
// Handler
// ===========================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Mismo candado que avisar-fin-prueba: la plataforma ya valido la firma del JWT
  // (verify_jwt on), aqui solo comprobamos que el rol del token sea service_role
  // (el cron manda esa clave), sin depender de comparar el string exacto.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let esServiceRole = false;
  try {
    const p = bearer.split('.');
    if (p.length === 3) esServiceRole = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch { esServiceRole = false; }
  if (!esServiceRole) return json({ error: 'unauthorized' }, 401);

  let body: { tipo?: string; test_email?: string } = {};
  try { body = await req.json(); } catch { /* body vacio: error abajo */ }
  const tipo = body.tipo;
  if (tipo !== 'semanal' && tipo !== 'mensual') return json({ error: 'tipo_invalido' }, 400);
  // Modo prueba: manda solo al destinatario indicado (con sus datos reales de
  // negocio) y NO deja rastro en el log de envios, para no bloquear el envio real
  // programado de ese mismo periodo. Solo lo dispara alguien con la service_role key.
  const testEmail = (body.test_email || '').trim().toLowerCase() || null;

  if (!SMTP_USER || !SMTP_PASS) return json({ error: 'smtp_no_configurado' }, 500);

  const { data: rangoData, error: rangoErr } = await admin.rpc('informe_rango_periodo', { p_tipo: tipo });
  const rango = (Array.isArray(rangoData) ? rangoData[0] : rangoData) as Rango | undefined;
  if (rangoErr || !rango) return json({ error: rangoErr?.message ?? 'sin_rango' }, 500);

  const { data: destData, error: destErr } = await admin.rpc('informe_periodico_destinatarios');
  if (destErr) return json({ error: destErr.message }, 500);
  const destinatarios = (destData ?? []) as Destinatario[];
  if (destinatarios.length === 0) return json({ ok: true, enviados: 0 });

  const periodoDesdeDate = madridDateKey(rango.desde);
  let pendientes: Destinatario[];
  if (testEmail) {
    pendientes = destinatarios.filter(dst => dst.email.toLowerCase() === testEmail);
    if (pendientes.length === 0) return json({ error: 'test_email_no_es_owner' }, 404);
  } else {
    const { data: yaEnviados } = await admin
      .from('informes_periodicos_enviados')
      .select('negocio_id')
      .eq('tipo', tipo)
      .eq('periodo_desde', periodoDesdeDate);
    const enviadosSet = new Set((yaEnviados ?? []).map((r: { negocio_id: string }) => r.negocio_id));
    pendientes = destinatarios.filter(dst => !enviadosSet.has(dst.negocio_id));
    if (pendientes.length === 0) return json({ ok: true, enviados: 0, ya_enviado: true });
  }

  const tipoLabel = tipo === 'semanal' ? 'Informe semanal' : 'Informe mensual';
  const periodoLabel = tipo === 'semanal' ? `${fmtDateEs(rango.desde)} - ${fmtDateEs(rango.hasta)}` : fmtMonthEs(rango.desde);
  const generado = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date());
  const cta = `${APP_URL}/app/informes`;
  const trecemesesAtras = new Date();
  trecemesesAtras.setMonth(trecemesesAtras.getMonth() - MESES_HISTORICO);

  const client = new SMTPClient({ connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } });

  let enviados = 0; let fallidos = 0;
  for (const dest of pendientes) {
    try {
      const [citasRes, cobrosRes, gastosRes, srvRes, profRes, cltRes, histRes] = await Promise.all([
        admin.from('citas').select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
          .eq('negocio_id', dest.negocio_id).gte('inicio', rango.desde).lte('inicio', rango.hasta),
        admin.from('cobros').select('total_cents, propina_cents, profesional_id')
          .eq('negocio_id', dest.negocio_id).eq('estado', 'completado')
          .gte('cobrado_at', rango.desde).lte('cobrado_at', rango.hasta),
        admin.from('gastos').select('importe_cents')
          .eq('negocio_id', dest.negocio_id).gte('fecha', rango.desde).lte('fecha', rango.hasta),
        admin.from('servicios').select('id, nombre, precio').eq('negocio_id', dest.negocio_id),
        admin.from('profesionales').select('id, nombre, activo, comision_pct').eq('negocio_id', dest.negocio_id),
        admin.from('clientes').select('id, nombre').eq('negocio_id', dest.negocio_id),
        admin.from('citas').select('cliente_id, inicio, servicio_id')
          .eq('negocio_id', dest.negocio_id).eq('estado', 'completada').not('cliente_id', 'is', null)
          .gte('inicio', trecemesesAtras.toISOString()).order('inicio', { ascending: true }).limit(TOPE_HISTORICO),
      ]);

      const citas = (citasRes.data ?? []) as CitaRow[];
      const cobros = cobrosRes.data ?? [];
      const gastos = gastosRes.data ?? [];
      const servicios = srvRes.data ?? [];
      const profesionales = profRes.data ?? [];
      const clientes = cltRes.data ?? [];
      const historico = histRes.data ?? [];

      const srvMap = new Map(servicios.map((s: { id: string; nombre: string; precio: number }) => [s.id, s]));
      const profMap = new Map(profesionales.map((p: { id: string; nombre: string }) => [p.id, p]));
      const cltMap = new Map(clientes.map((c: { id: string; nombre: string }) => [c.id, c]));
      const profsActivos = profesionales.filter((p: { activo: boolean }) => p.activo);

      const activas = citas.filter(c => ESTADOS_ACTIVOS.has(c.estado));
      const noShows = citas.filter(c => c.estado === 'no_presentada');
      const totalCitas = citas.length;
      const tasaNoShow = totalCitas > 0 ? (noShows.length / totalCitas) * 100 : 0;

      // -- Ingresos --
      const totalIngresos = activas.reduce((s, c) => s + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
      const totalCobrado = cobros.reduce((s: number, c: { total_cents: number | null }) => s + (c.total_cents || 0), 0) / 100;
      const hayCobros = cobros.length > 0;
      const totalGastos = gastos.reduce((s: number, g: { importe_cents: number | null }) => s + (g.importe_cents || 0), 0) / 100;
      const ingresosReal = hayCobros ? totalCobrado : totalIngresos;

      // -- Ocupacion --
      const profCount: Record<string, number> = {};
      const franjaCount = [0, 0, 0, 0, 0];
      const diaCount = [0, 0, 0, 0, 0, 0, 0];
      activas.forEach(c => {
        if (c.profesional_id) profCount[c.profesional_id] = (profCount[c.profesional_id] || 0) + 1;
        const { hour, day } = madridHourAndDay(c.inicio);
        franjaCount[franjaIndex(hour)]++;
        diaCount[day]++;
      });
      const ocupacionPorProf = [...profsActivos]
        .map((p: { id: string; nombre: string }) => ({ nombre: p.nombre, citas: profCount[p.id] || 0 }))
        .sort((a, b) => b.citas - a.citas);
      const ocupacionGlobal = profsActivos.length > 0 ? activas.length / profsActivos.length : 0;

      // -- No-shows --
      const nsPorProf: Record<string, number> = {};
      const nsPorServicio: Record<string, number> = {};
      noShows.forEach(c => {
        if (c.profesional_id) nsPorProf[c.profesional_id] = (nsPorProf[c.profesional_id] || 0) + 1;
        if (c.servicio_id) nsPorServicio[c.servicio_id] = (nsPorServicio[c.servicio_id] || 0) + 1;
      });

      // -- Espera media entre citas (por dia y profesional) --
      const esperaPorProf: Record<string, number[]> = {};
      const byProf: Record<string, CitaRow[]> = {};
      activas.forEach(c => { if (c.profesional_id) (byProf[c.profesional_id] ||= []).push(c); });
      Object.entries(byProf).forEach(([profId, pCitas]) => {
        const byDay: Record<string, CitaRow[]> = {};
        pCitas.forEach(c => { const day = madridDateKey(c.inicio); (byDay[day] ||= []).push(c); });
        Object.values(byDay).forEach(dayCitas => {
          const s = [...dayCitas].sort((a, b) => a.inicio.localeCompare(b.inicio));
          for (let i = 1; i < s.length; i++) {
            const gap = (new Date(s[i].inicio).getTime() - new Date(s[i - 1].fin).getTime()) / 60000;
            if (gap > 0 && gap < 180) (esperaPorProf[profId] ||= []).push(gap);
          }
        });
      });
      const allGaps = Object.values(esperaPorProf).flat();
      const esperaGlobal = allGaps.length > 0 ? allGaps.reduce((a, b) => a + b, 0) / allGaps.length : 0;

      // -- Reposo aprovechado (fase activa/reposo, ver skill hairy-agenda-rules) --
      const reposoPorProf: Record<string, { totalMin: number; usedMin: number }> = {};
      let reposoGlobalTotal = 0; let reposoGlobalUsado = 0;
      Object.entries(byProf).forEach(([profId, profCitas]) => {
        let totalMin = 0; let usedMin = 0;
        profCitas.forEach(c => {
          if (!c.fin_activa || !c.fin_espera) return;
          const restStart = new Date(c.fin_activa).getTime();
          const restEnd = new Date(c.fin_espera).getTime();
          if (restEnd <= restStart) return;
          const esAnidada = profCitas.some(host => {
            if (host.id === c.id || !host.fin_activa || !host.fin_espera) return false;
            const hRS = new Date(host.fin_activa).getTime();
            const hRE = new Date(host.fin_espera).getTime();
            return new Date(c.inicio).getTime() >= hRS && new Date(c.inicio).getTime() < hRE;
          });
          if (esAnidada) return;
          totalMin += (restEnd - restStart) / 60000;
          profCitas.forEach(other => {
            if (other.id === c.id) return;
            const oS = new Date(other.inicio).getTime();
            const oF = new Date(other.fin).getTime();
            const ov = Math.max(0, Math.min(oF, restEnd) - Math.max(oS, restStart));
            usedMin += ov / 60000;
          });
        });
        if (totalMin > 0) {
          reposoPorProf[profId] = { totalMin, usedMin: Math.min(usedMin, totalMin) };
          reposoGlobalTotal += totalMin;
          reposoGlobalUsado += Math.min(usedMin, totalMin);
        }
      });
      const reposoGlobalPct = reposoGlobalTotal > 0 ? (reposoGlobalUsado / reposoGlobalTotal) * 100 : 0;

      // -- Ingresos por profesional / servicio / cliente --
      const ingPorProf: Record<string, number> = {};
      const ingPorServicio: Record<string, number> = {};
      const ingPorCliente: Record<string, number> = {};
      activas.forEach(c => {
        const precio = srvMap.get(c.servicio_id ?? '')?.precio || 0;
        if (c.profesional_id) ingPorProf[c.profesional_id] = (ingPorProf[c.profesional_id] || 0) + precio;
        if (c.servicio_id) ingPorServicio[c.servicio_id] = (ingPorServicio[c.servicio_id] || 0) + precio;
        if (c.cliente_id) ingPorCliente[c.cliente_id] = (ingPorCliente[c.cliente_id] || 0) + precio;
      });

      // -- Servicios: ranking + combinaciones el mismo dia --
      const conteoServicio: Record<string, number> = {};
      activas.forEach(c => { if (c.servicio_id) conteoServicio[c.servicio_id] = (conteoServicio[c.servicio_id] || 0) + 1; });
      const rankingServicios = Object.entries(conteoServicio)
        .map(([id, count]) => ({ nombre: srvMap.get(id)?.nombre || id, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10);

      const byClienteDay: Record<string, string[]> = {};
      activas.forEach(c => {
        if (!c.cliente_id || !c.servicio_id) return;
        const key = `${c.cliente_id}|${madridDateKey(c.inicio)}`;
        (byClienteDay[key] ||= []).push(c.servicio_id);
      });
      const combosCount: Record<string, number> = {};
      Object.values(byClienteDay).forEach(srvIds => {
        if (srvIds.length < 2) return;
        const names = srvIds.map(id => srvMap.get(id)?.nombre || id).sort();
        const key = names.join(' + ');
        combosCount[key] = (combosCount[key] || 0) + 1;
      });
      const topCombos = Object.entries(combosCount).sort(([, a], [, b]) => b - a).slice(0, 5);

      // -- Clientes activos en el periodo --
      const clientesActivosSet = new Set(activas.map(c => c.cliente_id).filter(Boolean));

      // -- Fidelizacion: mismo motor que la app, sobre 13 meses de historico --
      const visitasHistoricas: VisitaHistorica[] = historico
        .filter((h: { cliente_id: string | null }) => h.cliente_id)
        .map((h: { cliente_id: string | null; inicio: string; servicio_id: string | null }) => ({
          clienteId: h.cliente_id as string, fecha: new Date(h.inicio), servicioId: h.servicio_id ?? null,
        }))
        .filter((v: VisitaHistorica) => !isNaN(v.fecha.getTime()));
      const baseFidelizadaSerie = serieBaseFidelizada(visitasHistoricas, { meses: 12, hasta: new Date() });
      const baseFidelizadaHoy = baseFidelizadaSerie.length > 0 ? baseFidelizadaSerie[baseFidelizadaSerie.length - 1].valor : 0;
      const embudo = embudoFidelizacion(visitasHistoricas, { desde: new Date(rango.desde), hasta: new Date(rango.hasta) });
      const frecuencia = frecuenciaRetorno(visitasHistoricas);
      const cohortes = cohortesRetencion(visitasHistoricas, { meses: 12, hasta: new Date(), offsets: 6 });
      const fraseCohortes = frasesCohortes(cohortes);
      const inactivos60 = (() => {
        const now = new Date();
        let n = 0;
        const porCliente: Record<string, number> = {};
        activas.forEach(c => { if (c.cliente_id) porCliente[c.cliente_id] = Math.max(porCliente[c.cliente_id] ?? 0, new Date(c.inicio).getTime()); });
        Object.values(porCliente).forEach(t => { if ((now.getTime() - t) / 86400000 > 60) n++; });
        return n;
      })();

      // -- Comisiones: mismo motor que la app (modelo "configurado": % de ficha, con
      // COMISION_PCT_POR_DEFECTO como respaldo si el profesional no tiene el suyo). --
      const facturacionPorProf = [...profsActivos].map((p: { id: string; nombre: string; comision_pct: number | null }) => {
        const profCobros = cobros.filter((c: { profesional_id: string | null }) => c.profesional_id === p.id);
        const real = profCobros.length > 0;
        const ingresosProf = real
          ? profCobros.reduce((s: number, c: { total_cents: number | null; propina_cents: number | null }) => s + ((c.total_cents || 0) - (c.propina_cents || 0)), 0) / 100
          : activas.filter(c => c.profesional_id === p.id).reduce((s, c) => s + (srvMap.get(c.servicio_id ?? '')?.precio || 0), 0);
        return {
          nombre: p.nombre,
          pctConfigurado: typeof p.comision_pct === 'number' ? p.comision_pct : null,
          ingresos: ingresosProf,
          citas: activas.filter(c => c.profesional_id === p.id).length,
          real,
        };
      }).sort((a, b) => b.ingresos - a.ingresos);

      const lineasComision = facturacionPorProf.map(p => ({
        nombre: p.nombre, facturacion: p.ingresos, porcentaje: p.pctConfigurado ?? COMISION_PCT_POR_DEFECTO,
      }));
      const comisionCalculo = calcularComisiones(lineasComision, {
        modelo: 'plano', ivaIncluido: true, propinasComisionables: false,
        calcularCosteEmpresa: true, gastosFijosSalon: totalGastos,
      });

      // ---------------------------------------------------------------------
      // Ensamblar los datos del PDF
      // ---------------------------------------------------------------------
      const salon = dest.nombre_negocio || 'tu salon';
      const kpis = [
        { label: 'Citas totales', value: String(totalCitas) },
        { label: hayCobros ? 'Cobrado (real)' : 'Ingresos (estim.)', value: fmtEur(ingresosReal) },
        { label: 'Citas / profesional', value: (Math.round(ocupacionGlobal * 10) / 10).toString() },
        { label: 'No-shows', value: `${noShows.length} (${fmtPct(tasaNoShow)})` },
        { label: 'Espera media', value: `${Math.round(esperaGlobal)} min` },
        { label: 'Reposo aprovechado', value: fmtPct(reposoGlobalPct) },
        { label: 'Clientes activos', value: String(clientesActivosSet.size) },
        { label: 'Vuelven cada', value: frecuencia.global.intervalos > 0 ? `${Math.round(frecuencia.global.medianaDias)} dias` : 'Sin datos' },
        ...(gastos.length > 0 ? [{ label: 'Margen (cobrado - gastos)', value: fmtEur(ingresosReal - totalGastos) }] : []),
      ];

      const comRows = facturacionPorProf.map((p, i) => {
        const l = comisionCalculo.lineas[i];
        return [
          p.nombre, String(p.citas), fmtEur(l?.baseSinIva ?? 0), fmtEur(l?.comision ?? 0),
          `${Math.round(l?.porcentajeEfectivo ?? 0)}%`, fmtEur(l?.costeEmpresa ?? 0), p.real ? 'Real' : 'Estimado',
        ];
      });

      const datos: DatosInforme = {
        salon, tipoLabel, periodoLabel, generado, kpis,
        ocupacion: {
          porProf: ocupacionPorProf.map(p => [p.nombre, String(p.citas)]),
          porFranja: FRANJAS.map((f, i) => [f, String(franjaCount[i])]),
          porDia: [1, 2, 3, 4, 5, 6, 0].map(dw => [DIAS_SEMANA[dw], String(diaCount[dw])]),
        },
        noShows: {
          subtitle: `${noShows.length} de ${totalCitas} citas (${fmtPct(tasaNoShow)})`,
          porProf: Object.entries(nsPorProf).sort(([, a], [, b]) => b - a).map(([id, c]) => [profMap.get(id)?.nombre || id, String(c)]),
          porServicio: Object.entries(nsPorServicio).sort(([, a], [, b]) => b - a).map(([id, c]) => [srvMap.get(id)?.nombre || id, String(c)]),
        },
        tiempos: {
          subtitle: `${Math.round(reposoGlobalPct)}% de reposo aprovechado en global`,
          espera: [...profsActivos].map((p: { id: string; nombre: string }) => {
            const gaps = esperaPorProf[p.id] || [];
            const avg = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
            return [p.nombre, `${avg} min`] as [string, string];
          }),
          reposo: [...profsActivos].flatMap((p: { id: string; nombre: string }) => {
            const r = reposoPorProf[p.id];
            if (!r) return [];
            const pct = r.totalMin > 0 ? (r.usedMin / r.totalMin) * 100 : 0;
            return [[p.nombre, `${Math.round(pct)}%`] as [string, string]];
          }),
        },
        ingresos: {
          porProf: Object.entries(ingPorProf).sort(([, a], [, b]) => b - a).map(([id, amt]) => [profMap.get(id)?.nombre || id, fmtEur(amt)]),
          porServicio: Object.entries(ingPorServicio).sort(([, a], [, b]) => b - a).slice(0, 10).map(([id, amt]) => [srvMap.get(id)?.nombre || id, fmtEur(amt)]),
          porCliente: Object.entries(ingPorCliente).sort(([, a], [, b]) => b - a).slice(0, 10).map(([id, amt]) => [cltMap.get(id)?.nombre || id, fmtEur(amt)]),
        },
        servicios: {
          ranking: rankingServicios.map(s => [s.nombre, String(s.count)]),
          combos: topCombos.map(([combo, count]) => [combo, `${count}x`]),
        },
        fidelizacion: {
          kpis: [
            { label: 'Base fidelizada hoy', value: String(baseFidelizadaHoy) },
            { label: 'Vuelven cada', value: frecuencia.global.intervalos > 0 ? `${Math.round(frecuencia.global.medianaDias)} dias` : 'Sin datos' },
            { label: 'Estrenaron el salon', value: String(embudo.nuevos) },
            { label: 'Volvieron 2a vez', value: `${embudo.volvieron} (${Math.round(embudo.pctVuelven)}%)` },
            { label: 'Ya son del salon (3+)', value: `${embudo.fieles} (${Math.round(embudo.pctFieles)}%)` },
            { label: 'En riesgo (60+ dias)', value: String(inactivos60) },
          ],
          frase: fraseCohortes,
        },
        comisiones: {
          subtitle: 'porcentaje configurado de cada profesional (o 30% si no tiene uno propio)',
          headers: ['Profesional', 'Citas', 'Base s/IVA', 'Comision', '%', 'Coste empresa', 'Origen'],
          rows: comRows,
          widths: [128, 42, 78, 72, 38, 84, 60],
          aligns: ['left', 'right', 'right', 'right', 'right', 'right', 'left'],
          totals: [
            'Total', String(facturacionPorProf.reduce((s, p) => s + p.citas, 0)),
            fmtEur(comisionCalculo.totales.baseSinIva), fmtEur(comisionCalculo.totales.comisiones), '',
            fmtEur(comisionCalculo.totales.costeEmpresa), '',
          ],
          aviso: `Comision sobre la base sin IVA (el IVA es de Hacienda, no del salon). El coste de empresa anade la cuota patronal del ${CUOTA_PATRONAL_PCT}%. ${AVISO_LEGAL}`,
        },
      };

      const pdfBytes = await construirInformePdf(datos);

      await client.send({
        from: `Mecha <${SMTP_FROM}>`,
        to: dest.email,
        subject: `${tipoLabel} de ${salon} - ${periodoLabel}`,
        html: emailHtml({ titulo: tipoLabel, salon, periodoLabel, cta }),
        attachments: [{ filename: `${tipo === 'semanal' ? 'informe-semanal' : 'informe-mensual'}-${periodoDesdeDate}.pdf`, content: toB64(pdfBytes), encoding: 'base64', contentType: 'application/pdf' }],
      });

      if (!testEmail) {
        await admin.from('informes_periodicos_enviados')
          .upsert({ negocio_id: dest.negocio_id, tipo, periodo_desde: periodoDesdeDate }, { onConflict: 'negocio_id,tipo,periodo_desde', ignoreDuplicates: true });
      }
      enviados++;
    } catch (e) {
      console.error('informe periodico fallo', dest.negocio_id, (e as Error)?.message ?? e, (e as Error)?.stack ?? '');
      fallidos++;
    }
  }
  try { await client.close(); } catch { /* ignore */ }

  return json({ ok: true, enviados, fallidos });
});
