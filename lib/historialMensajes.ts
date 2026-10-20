// lib/historialMensajes.ts
// Historial de todo lo que el salon ha mandado a sus clientas: WhatsApp
// automaticos de cita, campanas y avisos de lista de espera. Lo junta la RPC
// historial_mensajes (solo owner/admin, el salon sale de la sesion). Los
// automaticos no guardan su texto: aqui se resumen a partir de la cita.

import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { reportarError } from '@/lib/reportarError';

export type TipoMensaje = 'confirmacion' | 'recordatorio' | 'resena' | 'senal' | 'campana' | 'lista_espera';
export type EstadoMensaje = 'enviado' | 'entregado' | 'leido' | 'fallido';

export interface MensajeHistorial {
  id: string;
  tipo: TipoMensaje;
  canal: 'whatsapp' | 'email';
  fecha: string;
  nombre: string | null;
  contacto: string | null;
  estado: EstadoMensaje;
  error_code: number | null;
  error_titulo: string | null;
  cita_inicio: string | null;
  servicio: string | null;
  profesional: string | null;
  campana: string | null;
  texto: string | null;
  hueco_fecha: string | null;
  hueco_hora: string | null;
  // Solo si la agenda la puede abrir (ni borrada ni cancelada).
  cita_id: string | null;
}

export interface PaginaHistorial {
  total: number;
  conteos: Partial<Record<TipoMensaje, number>>;
  items: MensajeHistorial[];
}

export const HISTORIAL_PAGINA = 50;

export async function cargarHistorialMensajes(
  tipo: TipoMensaje | null, buscar: string, offset: number,
): Promise<PaginaHistorial> {
  const { data, error } = await supabase.rpc('historial_mensajes', {
    p_tipo: tipo, p_buscar: buscar.trim() || null, p_limite: HISTORIAL_PAGINA, p_offset: offset,
  });
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    throw error;
  }
  const d = (data ?? {}) as Partial<PaginaHistorial>;
  return { total: Number(d.total ?? 0), conteos: d.conteos ?? {}, items: d.items ?? [] };
}

export const TIPO_MENSAJE_META: Record<TipoMensaje, { label: string; plural: string }> = {
  confirmacion: { label: 'Confirmación', plural: 'Confirmaciones' },
  recordatorio: { label: 'Recordatorio', plural: 'Recordatorios' },
  resena: { label: 'Petición de reseña', plural: 'Reseñas' },
  senal: { label: 'Enlace de señal', plural: 'Señales' },
  campana: { label: 'Campaña', plural: 'Campañas' },
  lista_espera: { label: 'Aviso de hueco', plural: 'Lista de espera' },
};

export const ESTADO_MENSAJE_META: Record<EstadoMensaje, { label: string; color: string }> = {
  enviado: { label: 'Enviado', color: '#736658' },
  entregado: { label: 'Entregado', color: '#0891b2' },
  leido: { label: 'Leído', color: '#0f9d6b' },
  fallido: { label: 'No llegó', color: '#e23b34' },
};

// Codigos de error de la API de WhatsApp que se repiten, dichos para el salon.
const ERRORES_WHATSAPP: Record<number, string> = {
  131026: 'el número no tiene WhatsApp o no existe',
  131042: 'problema de facturación de la cuenta de WhatsApp',
  131047: 'pasaron más de 24 h desde su último mensaje',
  131049: 'WhatsApp lo frenó para no saturar a la clienta',
  131050: 'la clienta ha bloqueado los mensajes de empresas',
  130429: 'se alcanzó el límite de envíos',
  132001: 'la plantilla del mensaje no estaba disponible',
};

export function motivoFallo(m: MensajeHistorial): string | null {
  if (m.estado !== 'fallido') return null;
  if (m.error_code != null && ERRORES_WHATSAPP[m.error_code]) return ERRORES_WHATSAPP[m.error_code];
  return 'no se pudo entregar';
}

const fmtCita = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

/** De que iba el mensaje, en una linea. */
export function resumenMensaje(m: MensajeHistorial): string {
  if (m.tipo === 'campana') return m.texto ?? '';
  if (m.tipo === 'lista_espera') {
    const cuando = [m.hueco_fecha, m.hueco_hora].filter(Boolean).join(' a las ');
    return ['Hueco libre', m.servicio, cuando].filter(Boolean).join(' · ');
  }
  const que = {
    confirmacion: 'Confirmación',
    recordatorio: 'Recordatorio',
    resena: 'Petición de reseña',
    senal: 'Enlace para pagar la señal',
  }[m.tipo];
  // La cita se borro despues del envio: el mensaje salio, pero ya no hay de que.
  if (!m.cita_inicio) return `${que} de una cita que ya no existe`;
  const detalle = [m.servicio, m.profesional ? `con ${m.profesional}` : null].filter(Boolean).join(' ');
  return `${que} de la cita del ${fmtCita.format(new Date(m.cita_inicio))}${detalle ? ` · ${detalle}` : ''}`;
}

/** Enlace a la agenda en el dia de la cita con su ficha abierta (mismo deep-link
 *  que usa la pagina de Citas). Null si el mensaje no va ligado a una cita viva. */
export function rutaCita(m: MensajeHistorial): string | null {
  if (!m.cita_id || !m.cita_inicio) return null;
  return `/(tabs)?fecha=${format(parseISO(m.cita_inicio), 'yyyy-MM-dd')}&cita=${m.cita_id}`;
}
