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
