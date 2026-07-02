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
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
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
  analytics_config?: { enabled: boolean; measurementId: string; consentGiven: boolean };
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
  consentimientoDatos?: boolean;
  captchaToken?: string; // Token de reCAPTCHA v3
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
    p_consentimiento_datos: args.consentimientoDatos ?? true,
    p_captcha_token: args.captchaToken ?? null, // CAPTCHA v3 token
  });
  if (error) throw error;
  return data as CrearCitaResult;
}

// Reserva de grupo: cada asistente su servicio + profesional, todos misma hora de inicio.
// Escenarios típicos: bodas, madres+hijas, grupo de amigas. Máximo 6 asistentes.
export interface AsistenteGrupo {
  nombre: string;
  servicioId: string;
  profesionalId: string;
  notas?: string;
}
export interface CrearGrupoArgs {
  slug: string;
  inicioISO: string;
  reservanteNombre: string;
  reservanteTelefono: string;
  reservanteEmail?: string;
  asistentes: AsistenteGrupo[];
  consentimientoDatos?: boolean;
  captchaToken?: string;
}
export interface CrearGrupoResult {
  grupo_id: string;
  cliente_id: string;
  total: number;
  citas: { cita_id: string; orden: number; nombre: string }[];
  inicio: string;
}
export async function crearGrupoPublico(args: CrearGrupoArgs): Promise<CrearGrupoResult> {
  const { data, error } = await supabase.rpc('crear_cita_publica_grupo', {
    p_slug: args.slug,
    p_inicio: args.inicioISO,
    p_reservante_nombre: args.reservanteNombre,
    p_reservante_telefono: args.reservanteTelefono,
    p_reservante_email: args.reservanteEmail ?? null,
    p_asistentes: args.asistentes.map((a) => ({
      nombre: a.nombre,
      servicio_id: a.servicioId,
      profesional_id: a.profesionalId,
      notas: a.notas ?? null,
    })),
    p_consentimiento_datos: args.consentimientoDatos ?? true,
    p_captcha_token: args.captchaToken ?? null,
  });
  if (error) throw error;
  return data as CrearGrupoResult;
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
  captchaToken?: string; // Token de reCAPTCHA v3
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

// --- Gestion de la cita por el cliente (ver / cancelar / modificar) ---
// Las RPC exigen el par (cita_id + telefono del titular) como prueba de propiedad, asi que
// funcionan desde el portal anonimo con el cita_id del enlace de confirmacion, sin abrir
// SELECT a nadie. Alimentan la pagina /app/cita/[id].

export interface CitaPublica {
  ok: boolean;
  motivo?: 'portal' | 'no_encontrada';
  cita_id: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada' | 'no_show';
  servicio_id: string | null;
  servicio: string;
  categoria_nombre: string;
  categoria_color: string;
  profesional_id: string | null;
  profesional: string;
  inicio: string;
  fin: string;
  salon: string;
  slug: string;
  es_oferta_espera: boolean;
  deposito_requerido: boolean;
  deposito_pagado: boolean;
  cancelable: boolean;
  cancelacion_horas: number;
  fuera_de_plazo: boolean;
}

// Datos de una cita gated por (cita_id + telefono). ok=false si el par no casa.
export async function getCitaPublica(slug: string, citaId: string, telefono: string): Promise<CitaPublica> {
  const { data, error } = await supabase.rpc('cita_publica', {
    p_slug: slug,
    p_cita_id: citaId,
    p_telefono: telefono,
  });
  if (error) throw error;
  return data as CitaPublica;
}

export interface ConfirmarOfertaResult {
  ok: boolean;
  cita_id?: string;
  needs_payment?: boolean; // la oferta pide senal -> redirigir a /app/pago/{pago_token}
  pago_token?: string;     // token opaco del enlace de pago (cuando needs_payment)
  error?: 'oferta_no_disponible' | 'telefono_no_coincide';
}

// Confirma una cita ofrecida por la lista de espera (gated por par cita+telefono).
// Si pide senal, devuelve needs_payment=true (la pagina redirige a la pasarela).
export async function confirmarCitaOferta(citaId: string, telefono: string): Promise<ConfirmarOfertaResult> {
  const { data, error } = await supabase.rpc('confirmar_cita_oferta', {
    p_cita_id: citaId,
    p_telefono: telefono,
  });
  if (error) throw error;
  return data as ConfirmarOfertaResult;
}

export interface CancelarCitaResult {
  ok: boolean;
  cita_id: string;
  estado: 'cancelada';
  fuera_de_plazo: boolean; // true si se cancela dentro de la ventana de cancelacion del servicio
  cancelacion_horas: number;
}

// Cancela la cita del titular. Lanza si el (cita_id, telefono) no casan o ya paso / no es cancelable.
export async function cancelarCitaPublica(args: {
  slug: string;
  citaId: string;
  telefono: string;
  motivo?: string;
}): Promise<CancelarCitaResult> {
  const { data, error } = await supabase.rpc('cancelar_cita_publica', {
    p_slug: args.slug,
    p_cita_id: args.citaId,
    p_telefono: args.telefono,
    p_motivo: args.motivo ?? null,
    p_canal: 'web',
  });
  if (error) throw error;
  return data as CancelarCitaResult;
}

export interface ModificarCitaResult {
  ok: boolean;
  cita_id: string;
  inicio: string;
  fin: string;
  profesional_id: string;
}

// Reagenda la cita del titular. El servidor revalida antelacion / horario / solape / bloqueo.
export async function modificarCitaPublica(args: {
  slug: string;
  citaId: string;
  telefono: string;
  nuevoInicioISO: string;
  nuevoProfesionalId?: string | null;
}): Promise<ModificarCitaResult> {
  const { data, error } = await supabase.rpc('modificar_cita_publica', {
    p_slug: args.slug,
    p_cita_id: args.citaId,
    p_telefono: args.telefono,
    p_nuevo_inicio: args.nuevoInicioISO,
    p_nuevo_profesional_id: args.nuevoProfesionalId ?? null,
    p_canal: 'web',
  });
  if (error) throw error;
  return data as ModificarCitaResult;
}
