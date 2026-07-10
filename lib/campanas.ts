// lib/campanas.ts
// Cliente de la capa de Campañas (S20). Envuelve los RPC security definer que
// hacen la segmentación y el encolado bajo rol gestor + RLS por negocio. El
// ENVÍO REAL (WhatsApp/correo) NO se hace aquí: lo hace el motor de Alexandro
// leyendo campanas_destinatarios_pendientes() y confirmando con
// campana_marcar_enviado(). Este módulo solo define audiencia, mensaje y encola.

import { supabase } from '@/lib/supabase';

export type CampanaCanal = 'whatsapp' | 'email';
export type CampanaEstado = 'borrador' | 'encolada' | 'enviando' | 'enviada' | 'cancelada';

// Criterios de segmento (allowlist fija; el servidor los interpreta sin SQL
// dinámico). Todos opcionales: sin criterios = toda la clientela con contacto.
export interface SegmentoCriterios {
  inactividad_dias?: number;   // dias minimos desde la ultima visita (dormidas)
  min_visitas?: number;
  max_visitas?: number;
  min_ticket?: number;         // ticket medio minimo (EUR)
  etiqueta?: string;           // debe llevar esta etiqueta
}

export interface Campana {
  id: string;
  negocio_id: string;
  nombre: string;
  canal: CampanaCanal;
  mensaje: string;
  segmento: SegmentoCriterios;
  estado: CampanaEstado;
  total_destinatarios: number;
  created_at: string;
  encolada_en: string | null;
}

// Limpia el objeto de criterios: descarta claves vacias / no numericas para no
// mandar ruido al servidor (un '' en un number rompe la comparacion).
export function limpiarSegmento(s: SegmentoCriterios): SegmentoCriterios {
  const out: SegmentoCriterios = {};
  const num = (v: unknown) => (v === '' || v == null ? undefined : Number(v));
  if (num(s.inactividad_dias) != null && !Number.isNaN(num(s.inactividad_dias))) out.inactividad_dias = num(s.inactividad_dias);
  if (num(s.min_visitas) != null && !Number.isNaN(num(s.min_visitas))) out.min_visitas = num(s.min_visitas);
  if (num(s.max_visitas) != null && !Number.isNaN(num(s.max_visitas))) out.max_visitas = num(s.max_visitas);
  if (num(s.min_ticket) != null && !Number.isNaN(num(s.min_ticket))) out.min_ticket = num(s.min_ticket);
  if (s.etiqueta && s.etiqueta.trim()) out.etiqueta = s.etiqueta.trim();
  return out;
}

// Reemplaza los tokens de personalizacion para la vista previa (mismo criterio
// que el servidor en campana_encolar: solo {nombre}).
export function personalizarPreview(mensaje: string, nombre: string): string {
  return mensaje.replace(/\{nombre\}/g, nombre);
}

export async function contarSegmento(canal: CampanaCanal, seg: SegmentoCriterios): Promise<number> {
  const { data, error } = await supabase.rpc('campana_contar', { p_canal: canal, p_segmento: limpiarSegmento(seg) });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function crearYEncolarCampana(
  nombre: string, canal: CampanaCanal, mensaje: string, seg: SegmentoCriterios,
): Promise<Campana> {
  const { data: creada, error: e1 } = await supabase.rpc('campana_crear', {
    p_nombre: nombre, p_canal: canal, p_mensaje: mensaje, p_segmento: limpiarSegmento(seg),
  });
  if (e1) throw e1;
  const id = (creada as Campana).id;
  const { data: encolada, error: e2 } = await supabase.rpc('campana_encolar', { p_id: id });
  if (e2) throw e2;
  return encolada as Campana;
}

export async function cancelarCampana(id: string): Promise<Campana> {
  const { data, error } = await supabase.rpc('campana_cancelar', { p_id: id });
  if (error) throw error;
  return data as Campana;
}

export async function listarCampanas(): Promise<Campana[]> {
  const { data, error } = await supabase
    .from('campanas')
    .select('id, negocio_id, nombre, canal, mensaje, segmento, estado, total_destinatarios, created_at, encolada_en')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Campana[];
}

export const CAMPANA_ESTADO_META: Record<CampanaEstado, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: '#736658' },
  encolada: { label: 'Encolada (envío pendiente)', color: '#e08a00' },
  enviando: { label: 'Enviando', color: '#0891b2' },
  enviada: { label: 'Enviada', color: '#0f9d6b' },
  cancelada: { label: 'Cancelada', color: '#b3a89d' },
};
