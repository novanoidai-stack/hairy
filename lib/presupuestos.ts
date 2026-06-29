// Presupuestos: tipos, helpers de dinero y operaciones de datos compartidas
// (web + nativo). La generación de PDF vive aparte en `presupuestoPdf` (solo web).
import { supabase } from './supabase';

export type PresupuestoEstado =
  | 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'caducado' | 'cobrado';

export interface PresupuestoLinea {
  id?: string;
  concepto_id?: string | null;
  nombre: string;
  precio_cents: number;
  cantidad: number;
  orden?: number;
}

export interface Presupuesto {
  id: string;
  negocio_id: string;
  numero: number | null;
  estado: PresupuestoEstado;
  cliente_id: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  profesional_id: string | null;
  titulo: string | null;
  notas: string | null;
  total_cents: number;
  valido_hasta: string | null;
  cita_id: string | null;
  cobro_id: string | null;
  token: string;
  pdf_path: string | null;
  whatsapp_solicitado: boolean;
  enviado_email_at: string | null;
  enviado_whatsapp_at: string | null;
  aceptado_at: string | null;
  created_at: string;
  lineas?: PresupuestoLinea[];
}

export interface Concepto {
  id: string;
  nombre: string;
  precio_cents: number;
  activo: boolean;
}

// Metadatos de estado para pintar chips de forma consistente con la marca.
export const ESTADO_META: Record<PresupuestoEstado, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: '#736658', bg: 'rgba(115,102,88,0.12)' },
  enviado: { label: 'Enviado', color: '#e08a00', bg: 'rgba(224,138,0,0.14)' },
  aceptado: { label: 'Aceptado', color: '#0f9d6b', bg: 'rgba(15,157,107,0.14)' },
  rechazado: { label: 'Rechazado', color: '#e23b34', bg: 'rgba(226,59,52,0.12)' },
  caducado: { label: 'Caducado', color: '#8a7d70', bg: 'rgba(138,125,112,0.12)' },
  cobrado: { label: 'Cobrado', color: '#f4501e', bg: 'rgba(244,80,30,0.12)' },
};

// ── Dinero (siempre en céntimos internamente) ──
export const eur = (cents: number): string => `${((cents || 0) / 100).toFixed(2)} €`;
export const parseEurToCents = (s: string): number =>
  Math.max(0, Math.round((parseFloat((s || '0').replace(',', '.')) || 0) * 100));
export const lineasTotalCents = (lineas: PresupuestoLinea[]): number =>
  lineas.reduce((s, l) => s + (l.precio_cents || 0) * Math.max(1, l.cantidad || 1), 0);

// ── Operaciones de datos ──

export async function cargarConceptos(negocioId: string): Promise<Concepto[]> {
  const { data, error } = await supabase
    .from('presupuesto_conceptos')
    .select('id, nombre, precio_cents, activo')
    .eq('negocio_id', negocioId)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return (data || []) as Concepto[];
}

// Guarda un concepto nuevo (o actualiza su precio) para reusarlo en el futuro.
export async function guardarConcepto(negocioId: string, nombre: string, precioCents: number): Promise<void> {
  const limpio = nombre.trim();
  if (!limpio) return;
  await supabase
    .from('presupuesto_conceptos')
    .upsert({ negocio_id: negocioId, nombre: limpio, precio_cents: precioCents }, { onConflict: 'negocio_id,nombre' });
}

// Crea o actualiza un presupuesto + sus líneas. Devuelve el presupuesto guardado.
export async function guardarPresupuesto(params: {
  id?: string;
  negocioId: string;
  estado?: PresupuestoEstado;
  clienteId?: string | null;
  contactoNombre?: string | null;
  contactoTelefono?: string | null;
  contactoEmail?: string | null;
  profesionalId?: string | null;
  titulo?: string | null;
  notas?: string | null;
  validoHasta?: string | null;
  citaId?: string | null;
  lineas: PresupuestoLinea[];
}): Promise<Presupuesto> {
  const totalCents = lineasTotalCents(params.lineas);
  const cabecera = {
    negocio_id: params.negocioId,
    cliente_id: params.clienteId ?? null,
    contacto_nombre: params.contactoNombre ?? null,
    contacto_telefono: params.contactoTelefono ?? null,
    contacto_email: params.contactoEmail ?? null,
    profesional_id: params.profesionalId ?? null,
    titulo: params.titulo ?? null,
    notas: params.notas ?? null,
    valido_hasta: params.validoHasta ?? null,
    cita_id: params.citaId ?? null,
    total_cents: totalCents,
    ...(params.estado ? { estado: params.estado } : {}),
    modificado_at: new Date().toISOString(),
  };

  let presupuestoId = params.id;
  if (presupuestoId) {
    const { error } = await supabase.from('presupuestos').update(cabecera).eq('id', presupuestoId);
    if (error) throw error;
    // Reemplazamos las líneas (más simple y robusto que diffear).
    await supabase.from('presupuesto_lineas').delete().eq('presupuesto_id', presupuestoId);
  } else {
    const { data, error } = await supabase.from('presupuestos').insert(cabecera).select('id').single();
    if (error) throw error;
    presupuestoId = data!.id as string;
  }

  if (params.lineas.length > 0) {
    const filas = params.lineas.map((l, i) => ({
      presupuesto_id: presupuestoId,
      concepto_id: l.concepto_id ?? null,
      nombre: l.nombre.trim(),
      precio_cents: l.precio_cents,
      cantidad: Math.max(1, l.cantidad || 1),
      orden: i,
    }));
    const { error } = await supabase.from('presupuesto_lineas').insert(filas);
    if (error) throw error;
  }

  const { data: full, error: e2 } = await supabase
    .from('presupuestos')
    .select('*')
    .eq('id', presupuestoId)
    .single();
  if (e2) throw e2;
  return full as Presupuesto;
}

// Sube el PDF al bucket privado y guarda la ruta en el presupuesto.
export async function subirPresupuestoPdf(negocioId: string, presupuestoId: string, blob: Blob): Promise<string> {
  const path = `${negocioId}/${presupuestoId}.pdf`;
  const { error } = await supabase.storage
    .from('presupuestos')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  await supabase.from('presupuestos').update({ pdf_path: path }).eq('id', presupuestoId);
  return path;
}

// Dispara el correo branded con el PDF adjunto (edge function `enviar-presupuesto`).
export async function enviarPresupuestoPorCorreo(presupuestoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('enviar-presupuesto', {
    body: { presupuesto_id: presupuestoId },
  });
  if (error) throw error;
  if (data && (data as any).sent === false) {
    throw new Error((data as any).error || 'No se pudo enviar el correo.');
  }
}
