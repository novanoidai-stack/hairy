// Cliente del portal de reserva publica (C1).
// Envuelve las 3 RPC security definer creadas en migrations/portal-reserva-publica.sql.
// El portal es anonimo: usa la anon key; no se accede a tablas privadas directamente.

import { supabase } from './supabase';

export interface PortalServicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracion: number; // minutos totales (activa + espera + extra)
  categoria: string | null;
  prepago: boolean;
  foto_url: string | null;
}

export interface PortalProfesional {
  id: string;
  nombre: string;
  color: string;
}

export interface PortalNegocio {
  slug: string;
  nombre: string | null;
  logo_url: string | null;
  direccion: string | null;
  telefono: string | null;
  web: string | null;
  idioma: string;
  mostrar_precios: 'catalogo' | 'tras_seleccion' | 'nunca';
  color_acento: string;
}

export interface PortalInfo {
  negocio: PortalNegocio;
  servicios: PortalServicio[];
  profesionales: PortalProfesional[];
}

export interface SlotDisponible {
  profesional_id: string;
  profesional_nombre: string;
  slot: string; // ISO timestamptz
}

export interface CrearCitaResult {
  cita_id: string;
  cliente_id: string;
  estado: 'pendiente' | 'confirmada';
  deposito_requerido: boolean;
  deposito_importe: number;
  inicio: string;
  fin: string;
}

export interface CrearCitaArgs {
  slug: string;
  servicioId: string;
  profesionalId: string;
  inicioISO: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string;
  notas?: string;
}

// Cabecera + servicios reservables + profesionales del salon. null si el portal no existe / esta apagado.
export async function getPortalInfo(slug: string): Promise<PortalInfo | null> {
  const { data, error } = await supabase.rpc('portal_info', { p_slug: slug });
  if (error) throw error;
  return (data as PortalInfo | null) ?? null;
}

// Huecos libres para un servicio en una fecha ('YYYY-MM-DD'), opcionalmente filtrando por profesional.
export async function getDisponibilidad(
  slug: string,
  servicioId: string,
  fecha: string,
  profesionalId?: string | null,
): Promise<SlotDisponible[]> {
  const { data, error } = await supabase.rpc('disponibilidad_publica', {
    p_slug: slug,
    p_servicio_id: servicioId,
    p_fecha: fecha,
    p_profesional_id: profesionalId ?? null,
  });
  if (error) throw error;
  return (data as SlotDisponible[] | null) ?? [];
}

// Dias (YYYY-MM-DD, zona del salon) con AL MENOS un hueco reservable en el horizonte.
// De un solo viaje: el portal auto-selecciona el primer dia disponible y atenua el resto.
export async function getDiasDisponibles(
  slug: string,
  servicioId: string,
  profesionalId?: string | null,
  dias = 21,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('portal_dias_disponibles', {
    p_slug: slug,
    p_servicio_id: servicioId,
    p_profesional_id: profesionalId ?? null,
    p_dias: dias,
  });
  if (error) throw error;
  // El RPC devuelve filas { dia: 'YYYY-MM-DD' }.
  return ((data as { dia: string }[] | null) ?? []).map(r => r.dia);
}

// Crea la cita (canal='web'). El servidor revalida disponibilidad y antelacion.
export async function crearCitaPublica(args: CrearCitaArgs): Promise<CrearCitaResult> {
  const { data, error } = await supabase.rpc('crear_cita_publica', {
    p_slug: args.slug,
    p_servicio_id: args.servicioId,
    p_profesional_id: args.profesionalId,
    p_inicio: args.inicioISO,
    p_cliente_nombre: args.clienteNombre,
    p_cliente_telefono: args.clienteTelefono,
    p_cliente_email: args.clienteEmail ?? null,
    p_notas: args.notas ?? null,
  });
  if (error) throw error;
  return data as CrearCitaResult;
}

// Agrupa slots por dia local (YYYY-MM-DD en zona del navegador) para pintar el calendario.
export function fechaISOaClave(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Resenas (C3) ---
export interface ResenaItem {
  puntuacion: number;
  comentario: string | null;
  autor: string | null;
  fecha: string;
  verificada?: boolean; // true si la resena esta atada a una cita real (visita verificada)
}
export interface ResenaResumen {
  media: number;
  total: number;
  verificadas?: number; // cuantas de las visibles provienen de una visita verificada
  ultimas: ResenaItem[];
}

// Media, total y ultimas resenas visibles del negocio (por slug). null si el portal no existe.
export async function getResenasPublicas(slug: string): Promise<ResenaResumen | null> {
  const { data, error } = await supabase.rpc('resenas_publicas', { p_slug: slug });
  if (error) throw error;
  return (data as ResenaResumen | null) ?? null;
}

// Crea una resena (anon) para el negocio del slug.
export async function crearResenaPublica(args: {
  slug: string;
  puntuacion: number;
  comentario?: string;
  autorNombre?: string;
  profesionalId?: string | null;
  servicioId?: string | null;
  mechaPuntuacion?: number | null;
  mechaComentario?: string | null;
  salonTrato?: number | null;
  salonProductos?: number | null;
  mechaFacilidad?: number | null;
  mechaDisponibilidad?: number | null;
  mechaPagos?: number | null;
  mechaMejora?: string | null;
}): Promise<{ resena_id: string; ok: boolean }> {
  try {
    const { data, error } = await supabase.rpc('crear_resena_publica', {
      p_slug: args.slug,
      p_puntuacion: args.puntuacion,
      p_comentario: args.comentario ?? null,
      p_autor_nombre: args.autorNombre ?? null,
      p_profesional_id: args.profesionalId ?? null,
      p_servicio_id: args.servicioId ?? null,
      p_mecha_puntuacion: args.mechaPuntuacion ?? null,
      p_mecha_comentario: args.mechaComentario ?? null,
      p_salon_trato_puntuacion: args.salonTrato ?? null,
      p_salon_productos_puntuacion: args.salonProductos ?? null,
      p_mecha_facilidad_puntuacion: args.mechaFacilidad ?? null,
      p_mecha_disponibilidad_puntuacion: args.mechaDisponibilidad ?? null,
      p_mecha_pagos_puntuacion: args.mechaPagos ?? null,
      p_mecha_mejora_comentario: args.mechaMejora ?? null,
    });
    if (error) throw error;
    return data as { resena_id: string; ok: boolean };
  } catch (e: any) {
    // Si falla porque no existe la función con 8 parámetros (p. ej. falta aplicar migración resenas-mecha.sql),
    // intentamos llamar a la versión original con 6 parámetros.
    const isSignatureError = e?.message && (
      e.message.includes('does not exist') || 
      e.message.includes('function') || 
      e.message.includes('parameter')
    );
    if (isSignatureError) {
      const { data, error } = await supabase.rpc('crear_resena_publica', {
        p_slug: args.slug,
        p_puntuacion: args.puntuacion,
        p_comentario: args.comentario ?? null,
        p_autor_nombre: args.autorNombre ?? null,
        p_profesional_id: args.profesionalId ?? null,
        p_servicio_id: args.servicioId ?? null,
      });
      if (error) throw error;
      return data as { resena_id: string; ok: boolean };
    }
    throw e;
  }
}
