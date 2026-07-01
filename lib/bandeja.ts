// Bandeja de mensajes: tipos y operaciones de datos (staff + páginas públicas).
// Dos orígenes caen en la misma bandeja: el hilo de un presupuesto y el
// formulario "Contactar con el salón" (/app/contacto/<slug>).
import { supabase } from './supabase';

export type ConversacionOrigen = 'presupuesto' | 'contacto';
export type ConversacionEstado = 'abierta' | 'resuelta';
export type MensajeAutor = 'cliente' | 'salon';
export type MensajeTipo = 'mensaje' | 'rechazo' | 'cambio';

export interface MensajeConversacion {
  id: string;
  conversacion_id: string;
  autor: MensajeAutor;
  tipo: MensajeTipo;
  cuerpo: string;
  enviado_email_at: string | null;
  created_at: string;
}

export interface PresupuestoResumen {
  id: string;
  numero: number | null;
  estado: string;
  total_cents: number;
}

export interface Conversacion {
  id: string;
  negocio_id: string;
  origen: ConversacionOrigen;
  presupuesto_id: string | null;
  cliente_id: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  estado: ConversacionEstado;
  leido_at: string | null;
  created_at: string;
  ultimo_mensaje_at: string;
  presupuestos?: PresupuestoResumen | null;
}

export const TIPO_META: Record<MensajeTipo, { label: string; color: string }> = {
  mensaje: { label: 'Mensaje', color: '#5c5249' },
  rechazo: { label: 'Rechazo', color: '#e23b34' },
  cambio: { label: 'Petición de cambio', color: '#e08a00' },
};

// ── Staff (autenticado, scope por negocio via RLS) ──

export async function cargarConversaciones(
  negocioId: string,
  opts: { soloAbiertas?: boolean } = {}
): Promise<Conversacion[]> {
  let q = supabase
    .from('conversaciones')
    .select('*, presupuestos(id, numero, estado, total_cents)')
    .eq('negocio_id', negocioId)
    .order('ultimo_mensaje_at', { ascending: false });
  if (opts.soloAbiertas) q = q.eq('estado', 'abierta');
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as Conversacion[];
}

export async function contarSinLeer(negocioId: string): Promise<number> {
  const { count, error } = await supabase
    .from('conversaciones')
    .select('id', { count: 'exact', head: true })
    .eq('negocio_id', negocioId)
    .is('leido_at', null);
  if (error) throw error;
  return count || 0;
}

export async function cargarMensajes(conversacionId: string): Promise<MensajeConversacion[]> {
  const { data, error } = await supabase
    .from('mensajes_conversacion')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('created_at');
  if (error) throw error;
  return (data || []) as MensajeConversacion[];
}

export async function marcarLeida(conversacionId: string): Promise<void> {
  await supabase.from('conversaciones').update({ leido_at: new Date().toISOString() }).eq('id', conversacionId);
}

export async function marcarEstado(conversacionId: string, estado: ConversacionEstado): Promise<void> {
  const { error } = await supabase.from('conversaciones').update({ estado }).eq('id', conversacionId);
  if (error) throw error;
}

// Inserta la respuesta del salón y dispara el envío por correo. No revierte el
// insert si falla el correo: el mensaje queda en el hilo y se puede reintentar
// el envío (enviado_email_at se queda null).
export async function responderConversacion(conversacionId: string, cuerpo: string): Promise<void> {
  const limpio = cuerpo.trim();
  if (!limpio) throw new Error('Escribe una respuesta antes de enviarla.');
  const { data, error } = await supabase
    .from('mensajes_conversacion')
    .insert({ conversacion_id: conversacionId, autor: 'salon', tipo: 'mensaje', cuerpo: limpio })
    .select('id')
    .single();
  if (error) throw error;
  const { data: fn, error: fnError } = await supabase.functions.invoke('responder-mensaje-bandeja', {
    body: { mensaje_id: data!.id as string },
  });
  if (fnError) throw fnError;
  if (fn && (fn as { sent?: boolean }).sent === false) {
    throw new Error((fn as { error?: string }).error || 'No se pudo enviar la respuesta por correo.');
  }
}

// ── Páginas públicas (anónimas, vía RPC security definer) ──

export async function presupuestoEnviarMensajePublico(
  token: string,
  tipo: MensajeTipo,
  cuerpo: string
): Promise<{ ok: boolean; motivo?: string; mensaje_id?: string }> {
  const { data, error } = await supabase.rpc('presupuesto_enviar_mensaje_publico', {
    p_token: token, p_tipo: tipo, p_cuerpo: cuerpo,
  });
  if (error) throw error;
  return data as { ok: boolean; motivo?: string; mensaje_id?: string };
}

export async function negocioContactoPublico(slug: string): Promise<{
  ok: boolean; nombre?: string; logo_url?: string | null; color?: string; slug?: string; direccion?: string | null; telefono?: string | null;
}> {
  const { data, error } = await supabase.rpc('negocio_contacto_publico', { p_slug: slug });
  if (error) throw error;
  return data as { ok: boolean; nombre?: string; logo_url?: string | null; color?: string; slug?: string; direccion?: string | null; telefono?: string | null };
}

export async function enviarMensajeContactoPublico(params: {
  slug: string; nombre: string; telefono?: string; email?: string; cuerpo: string;
}): Promise<{ ok: boolean; motivo?: string; mensaje_id?: string }> {
  const { data, error } = await supabase.rpc('enviar_mensaje_contacto_publico', {
    p_slug: params.slug, p_nombre: params.nombre,
    p_telefono: params.telefono || null, p_email: params.email || null, p_cuerpo: params.cuerpo,
  });
  if (error) throw error;
  return data as { ok: boolean; motivo?: string; mensaje_id?: string };
}

// Avisa por correo al salón de un mensaje nuevo. Best-effort: si falla, el
// mensaje ya quedó guardado y visible en la Bandeja de todos modos.
export async function notificarBandeja(mensajeId: string): Promise<void> {
  try {
    await supabase.functions.invoke('notificar-bandeja', { body: { mensaje_id: mensajeId } });
  } catch {
    // silencioso: el mensaje ya esta guardado, solo falla el aviso por correo
  }
}
