// Cliente del portal de reserva publica (C1).
// Envuelve las 3 RPC security definer creadas en migrations/portal-reserva-publica.sql.
// El portal es anonimo: usa la anon key; no se accede a tablas privadas directamente.

import { supabase } from './supabase';
import { reportarError } from './reportarError';

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
  // Ciudad del salon: la pinta la cabecera del portal. Sin esto el portal decia
  // "Salon de belleza · Madrid" a todo el mundo.
  ciudad: string | null;
  idioma: string;
  mostrar_precios: 'catalogo' | 'tras_seleccion' | 'nunca';
  color_acento: string;
  fondo_portal_url: string | null;
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
  en_reposo: boolean;
  reposo_disponible_min: number | null;
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
  consienteIa?: boolean;
  captchaToken?: string; // Token de Turnstile / CAPTCHA
  canal?: string;
}

// Cabecera + servicios reservables + profesionales del salon. null si el portal no existe / esta apagado.
export async function getPortalInfo(slug: string): Promise<PortalInfo | null> {
  const { data, error } = await supabase.rpc('portal_info', { p_slug: slug });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
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
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return (data as SlotDisponible[] | null) ?? [];
}

// ---------------------------------------------------------------------------
// Reserva de VARIOS servicios en la misma visita (cadena).
//
// El portal deja añadir los servicios que la clienta suele olvidar. A partir de
// ahi todo se calcula con la duracion SUMADA: si no, el portal enseñaria huecos
// que solo caben para el primero y la reserva reventaria al final, despues de
// que la clienta haya metido sus datos.
//
// Las versiones de un solo servicio siguen existiendo tal cual: las usa el
// agente de WhatsApp.
// ---------------------------------------------------------------------------

// Servicio que se propone añadir antes de pasar a la hora.
export interface ServicioSugerido {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  duracion_min: number;
  // El sugerido requiere senal (prepago_requerido en servicios). Añadido
  // ago-2026: sin esto el resumen del portal decia "pago en el salon" cuando
  // un sugerido requeria senal que la cadena si cobraba.
  prepago?: boolean | null;
  // 'manual' = lo configuro el dueño; 'aprendido' = lo dedujo el historial.
  motivo: 'manual' | 'aprendido';
}

// Que suele acompañar a lo que la clienta ya lleva elegido. Maximo 3.
export async function getSugerenciasPortal(
  slug: string,
  servicioIds: string[],
): Promise<ServicioSugerido[]> {
  if (servicioIds.length === 0) return [];
  const { data, error } = await supabase.rpc('sugerencias_portal', {
    p_slug: slug,
    p_servicio_ids: servicioIds,
  });
  if (error) {
    // Que no se caiga la reserva por no poder sugerir: es un extra, no el flujo.
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    return [];
  }
  return (data as ServicioSugerido[] | null) ?? [];
}

export async function getDisponibilidadCadena(
  slug: string,
  servicioIds: string[],
  fecha: string,
  profesionalId?: string | null,
): Promise<SlotDisponible[]> {
  const { data, error } = await supabase.rpc('disponibilidad_publica_cadena', {
    p_slug: slug,
    p_servicio_ids: servicioIds,
    p_fecha: fecha,
    p_profesional_id: profesionalId ?? null,
  });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return (data as SlotDisponible[] | null) ?? [];
}

export async function getDiasDisponiblesCadena(
  slug: string,
  servicioIds: string[],
  profesionalId?: string | null,
  dias = 21,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('portal_dias_disponibles_cadena', {
    p_slug: slug,
    p_servicio_ids: servicioIds,
    p_profesional_id: profesionalId ?? null,
    p_dias: dias,
  });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return ((data as { dia: string }[] | null) ?? []).map((r) => r.dia);
}

export interface CrearCitaCadenaResult extends CrearCitaResult {
  grupo_id: string;
  precio_total: number;
  tramos: { cita_id: string; servicio_id: string; inicio: string; fin: string }[];
}

// Crea la visita entera: una cita por servicio, encadenadas y con `grupo_id`
// comun. Todo o nada: si el ultimo tramo no cabe, no se reserva ninguno.
export async function crearCitaPublicaCadena(
  args: Omit<CrearCitaArgs, 'servicioId'> & { servicioIds: string[] },
): Promise<CrearCitaCadenaResult> {
  const { data, error } = await supabase.rpc('crear_cita_publica_cadena', {
    p_slug: args.slug,
    p_servicio_ids: args.servicioIds,
    p_profesional_id: args.profesionalId,
    p_inicio: args.inicioISO,
    p_nombre: args.clienteNombre,
    p_telefono: args.clienteTelefono,
    p_email: args.clienteEmail ?? null,
    p_notas: args.notas ?? null,
    p_consiente_ia: args.consienteIa ?? false,
    p_captcha_token: args.captchaToken ?? null,
    p_canal: args.canal ?? 'web',
  });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return data as CrearCitaCadenaResult;
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
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return ((data as { dia: string }[] | null) ?? []).map(r => r.dia);
}

// Crea la cita (canal='web'). El servidor revalida disponibilidad y antelacion.
export async function crearCitaPublica(args: CrearCitaArgs): Promise<CrearCitaResult> {
  const { data, error } = await supabase.rpc('crear_cita_publica', {
    p_slug: args.slug,
    p_servicio_id: args.servicioId,
    p_profesional_id: args.profesionalId,
    p_inicio: args.inicioISO,
    p_nombre: args.clienteNombre,
    p_telefono: args.clienteTelefono,
    p_email: args.clienteEmail ?? null,
    p_notas: args.notas ?? null,
    p_consiente_ia: args.consienteIa ?? false,
    p_captcha_token: args.captchaToken ?? null,
    p_canal: args.canal ?? 'web',
  });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
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
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return data as CrearGrupoResult;
}

// Apunta al cliente a la lista de espera. Abierto a cualquiera (crea el cliente si no
// existe); la prioridad la calcula el servidor a partir de su nivel de fidelidad.
export async function unirseListaEsperaPublica(args: {
  slug: string;
  telefono: string;
  nombre: string;
  servicioId?: string | null;
  profesionalId?: string | null;
  franja?: 'manana' | 'tarde' | 'cualquiera';
  desde?: string | null;
  hasta?: string | null;
  consentimientoDatos?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('lista_espera_unirse_publica', {
    p_slug: args.slug,
    p_telefono: args.telefono,
    p_cliente_nombre: args.nombre,
    p_servicio_id: args.servicioId ?? null,
    p_profesional_id: args.profesionalId ?? null,
    p_franja: args.franja ?? 'cualquiera',
    p_desde: args.desde ?? null,
    p_hasta: args.hasta ?? null,
    p_consentimiento_datos: args.consentimientoDatos ?? true,
  });
  if (error) {
    reportarError(error, { origen: 'portal', tipo: 'operativo' });
    throw error;
  }
  return data as { ok: boolean; error?: string };
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
  // Grupo "salon" (ver SCORE_FIELDS en app/(tabs)/resenas.web.tsx). El grupo
  // "mecha" NO viaja al portal publico: es el cliente valorando Mecha como
  // software, no al salon.
  trato?: number | null; // salon_trato_puntuacion
  productos?: number | null; // salon_productos_puntuacion
  profesional?: string | null; // nombre de quien atendio
  profesional_puntuacion?: number | null;
  servicio?: string | null; // nombre del servicio de la cita
}
export interface ResenaResumen {
  media: number;
  total: number;
  verificadas?: number; // cuantas de las visibles provienen de una visita verificada
  distribucion?: Record<string, number>; // reparto real de 5 a 1 estrellas
  ultimas: ResenaItem[];
}

// Media, total y ultimas resenas visibles del negocio (por slug). null si el portal no existe.
export async function getResenasPublicas(slug: string): Promise<ResenaResumen | null> {
  const { data, error } = await supabase.rpc('resenas_publicas', { p_slug: slug });
  if (error) throw error;
  return (data as ResenaResumen | null) ?? null;
}

export interface ResenaProfesional {
  profesional_id: string;
  profesional_nombre: string;
  media: number;
  total: number;
}

// Media y total de valoraciones por profesional (solo los que tienen alguna).
export async function getResenasPorProfesional(slug: string): Promise<ResenaProfesional[]> {
  const { data, error } = await supabase.rpc('resenas_por_profesional', { p_slug: slug });
  if (error) throw error;
  return (data as ResenaProfesional[] | null) ?? [];
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
  profesionalPuntuacion?: number | null;
  profesionalComentario?: string | null;
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
      p_profesional_puntuacion: args.profesionalPuntuacion ?? null,
      p_profesional_comentario: args.profesionalComentario ?? null,
    });
    if (error) throw error;
    return data as { resena_id: string; ok: boolean };
  } catch (e: any) {
    // Aqui habia un plan B que reintentaba con una version de 6 parametros por
    // si la migracion no estaba aplicada. Esa version ya no existe (se solto en
    // migrations/limpiar-sobrecargas-rpc.sql: tres funciones con el mismo nombre
    // y acceso anonimo son tres cosas que auditar y una fuente de 42725). Si
    // esto falla, falla de verdad y hay que verlo.
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
  cliente_id?: string;
  consiente_ia?: boolean;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada' | 'no_presentada';
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

export interface ResponderPropuestaResult {
  ok: boolean;
  // true = el cliente acepto y la cita se adelanto; false = la rechazo.
  aceptada?: boolean;
  // Nuevo inicio (ISO) cuando se acepta. Sirve para confirmarle la nueva hora.
  inicio?: string;
  // Mensaje en español listo para mostrar si la propuesta no se pudo resolver
  // (telefono que no casa, expirada, o la cita subyacente ya se movio).
  error?: string;
  // Estado de la propuesta si fallo (caducada, cancelada...). Informativo.
  estado?: string;
}

// Responde a una propuesta de cambio de hora (citas_propuestas_cambio) hecha por
// el salon desde el organizador. Anon-callable como el resto del portal: la
// prueba de propiedad es el telefono (normalizar_telefono), igual que en
// confirmar_cita_oferta. Si acepta, la RPC adelanta la cita y libera el hueco
// retenido (bloqueos_profesional.tipo='reserva_temporal').
export async function responderPropuestaCambio(args: {
  slug: string;
  propuestaId: string;
  telefono: string;
  acepta: boolean;
}): Promise<ResponderPropuestaResult> {
  const { data, error } = await supabase.rpc('responder_propuesta_cambio', {
    p_slug: args.slug,
    p_propuesta_id: args.propuestaId,
    p_telefono: args.telefono,
    p_acepta: args.acepta,
  });
  if (error) throw error;
  return (data ?? {}) as ResponderPropuestaResult;
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

// Actualiza el consentimiento de IA de un cliente.
// Desde fuera del software hay que traer el telefono de la clienta: es la misma
// prueba de que la cita es tuya que se pide para verla o cancelarla. Sin el, el
// servidor rechaza el cambio (antes bastaba con conocer el UUID).
export async function actualizarConsentimientoIa(args: {
  clienteId: string;
  consentimiento: boolean;
  origen: 'portal' | 'autogestion' | 'staff';
  telefono?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('actualizar_consentimiento_ia', {
    p_cliente_id: args.clienteId,
    p_consentimiento: args.consentimiento,
    p_origen: args.origen,
    p_telefono: args.telefono ?? null,
  });
  if (error) throw error;
}

/**
 * Normaliza y valida teléfonos para reservas y notificaciones por WhatsApp.
 * Valida formato E.164 (+34...) y asegura números móviles válidos (6XX / 7XX en España).
 */
export function normalizarTelefonoE164(tel: string): { e164: string; esValido: boolean; esMovilEspana: boolean } {
  const clean = (tel || '').trim();
  if (!clean) return { e164: '', esValido: false, esMovilEspana: false };
  const digitsOnly = clean.replace(/\D/g, '');

  // Móvil España con prefijo 34 o 0034 (11 dígitos)
  if (/^34[67]\d{8}$/.test(digitsOnly)) {
    return { e164: `+${digitsOnly}`, esValido: true, esMovilEspana: true };
  }
  // Móvil España directo 9 dígitos (6XX o 7XX)
  if (/^[67]\d{8}$/.test(digitsOnly)) {
    return { e164: `+34${digitsOnly}`, esValido: true, esMovilEspana: true };
  }

  // Internacional con signo +
  if (clean.startsWith('+') && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    const esEs = /^34[67]\d{8}$/.test(digitsOnly);
    return { e164: `+${digitsOnly}`, esValido: true, esMovilEspana: esEs };
  }

  // Si tiene longitud suficiente pero sin prefijo internacional
  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    const esMovil = digitsOnly.length === 9 && (digitsOnly.startsWith('6') || digitsOnly.startsWith('7'));
    return { e164: esMovil ? `+34${digitsOnly}` : `+${digitsOnly}`, esValido: true, esMovilEspana: esMovil };
  }

  return { e164: clean, esValido: false, esMovilEspana: false };
}

