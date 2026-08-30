// Accesos del equipo: la capa unica entre la UI y el servidor.
//
// En Mecha conviven DOS cosas que la gente confunde y que antes vivian sueltas:
//
//   - La FICHA del profesional (`profesionales`): la columna de la agenda. Sirve
//     para dar citas aunque esa persona no entre nunca al software.
//   - La CUENTA de acceso (`profiles` + auth): el correo con el que se entra.
//
// Se unen por `profesionales.profile_id`. Una ficha sin cuenta es normal (un
// ayudante al que no le das acceso); una cuenta sin ficha casi siempre es un
// error (esa persona entra pero no tiene agenda propia). Y tener perfil NO
// significa poder entrar: el perfil se crea al invitar, asi que hasta que la
// persona no elige su contrasena, la invitacion sigue pendiente.
//
// Todo esto lo resuelve la RPC `equipo_cuentas()` (solo owner/admin) y la edge
// `crear-acceso-empleado` (invitar / reenviar / revocar).

import { supabase } from './supabase';
import { reportarError } from './reportarError';

export type EstadoCuenta = 'activa' | 'pendiente';

export interface CuentaEquipo {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  role: string;
  plan: string | null;
  estado: EstadoCuenta;
  invitada_en: string | null;
  ultimo_acceso: string | null;
  profesional_id: string | null;
  profesional_nombre: string | null;
}

export type RolInvitable = 'admin' | 'recepcion' | 'employee';

interface RespuestaEdge {
  ok?: boolean;
  error?: string;
  // Explicacion larga escrita en el servidor (evaluar_alta_de_acceso). Cuando
  // viene, manda sobre el texto corto de ERROR_ACCESO: la regla y su motivo se
  // escriben una sola vez, en SQL, y aqui solo se relatan.
  detalle?: string | null;
  // Aviso: la invitacion SI salio, pero algo secundario no cuajo (la ficha).
  aviso?: string | null;
  user_id?: string;
  email?: string;
  profesional_id?: string | null;
  plan?: string;
}

// Lo que el servidor contesta a "¿puede este salon dar de alta otra cuenta?".
// Misma funcion que aplica la edge al invitar (public.evaluar_alta_de_acceso),
// asi que la pantalla nunca ofrece un boton que el servidor va a rechazar.
export interface AltaDeAcceso {
  ok: boolean;
  motivo: string | null;
  detalle: string | null;
  plan: string;
  modo: 'individual' | 'compartido';
  cuentas: number;
  maxCuentas: number;
}

export async function consultarAltaDeAcceso(): Promise<AltaDeAcceso> {
  const { data, error } = await supabase.rpc('mi_alta_de_acceso');
  if (error || !data) {
    // Si no se puede preguntar, se asume que SI para no bloquear a nadie por un
    // fallo de red: la puerta de verdad es la edge, que vuelve a comprobarlo.
    reportarError(error ?? 'mi_alta_de_acceso sin datos', { origen: 'app', tipo: 'operativo' });
    return { ok: true, motivo: null, detalle: null, plan: 'free', modo: 'individual', cuentas: 0, maxCuentas: 15 };
  }
  const d = data as Record<string, unknown>;
  return {
    ok: d.ok === true,
    motivo: (d.motivo as string) ?? null,
    detalle: (d.detalle as string) ?? null,
    plan: (d.plan as string) ?? 'free',
    modo: d.modo === 'compartido' ? 'compartido' : 'individual',
    cuentas: Number(d.cuentas ?? 0),
    maxCuentas: Number(d.max_cuentas ?? 15),
  };
}

// Mensajes en cristiano para todo lo que puede devolver el servidor.
export const ERROR_ACCESO: Record<string, string> = {
  invalid_email: 'Ese correo no es válido.',
  missing_nombre: 'Indica el nombre de la persona.',
  invalid_role: 'Ese rol no existe.',
  email_exists: 'Ya hay una cuenta de Mecha con ese correo. Si es de tu equipo, búscala en la lista; si no, usa otro correo.',
  not_authorized: 'No tienes permiso para gestionar accesos.',
  not_authenticated: 'Tu sesión ha caducado. Vuelve a entrar.',
  no_negocio: 'Tu cuenta no tiene un salón asignado.',
  create_failed: 'No se pudo crear la cuenta.',
  profile_failed: 'La cuenta se creó pero no se pudo asociar a tu salón. Avísanos.',
  send_failed: 'No se pudo enviar el correo de invitación. Inténtalo en un minuto.',
  smtp_not_configured: 'El envío de correos no está configurado. Avísanos.',
  demo_no_permitido: 'En la demo compartida no se crean accesos reales.',
  cross_tenant: 'Esa cuenta no es de tu salón.',
  target_not_found: 'No encontramos esa cuenta.',
  missing_target: 'No se indicó a quién.',
  solo_propietario: 'Solo el Propietario puede retirar un acceso.',
  no_puedes_revocarte: 'No puedes retirarte el acceso a ti mismo.',
  no_se_revoca_propietario: 'No se puede retirar el acceso a un Propietario. Cámbiale antes el rol.',
  ficha_no_encontrada: 'No encontramos esa ficha de profesional.',
  ficha_ya_vinculada: 'Esa ficha ya tiene una cuenta vinculada.',
  link_failed: 'No se pudo generar el enlace. Inténtalo de nuevo.',
  delete_failed: 'No se pudo retirar el acceso.',
  // Los cinco motivos por los que un salón no puede dar de alta otra cuenta.
  // Son el respaldo corto: si el servidor manda `detalle`, gana ese.
  modo_compartido: 'Este salón entra con un solo correo, así que no se invitan cuentas. Añade a la persona como ficha en Equipo y aparecerá en el selector de "¿Quién eres?".',
  plan_sin_equipo: 'Dar acceso al equipo entra en los planes Esencial y Estudio.',
  suscripcion_inactiva: 'La suscripción de este salón no está activa.',
  limite_cuentas: 'Este salón ha llegado a su tope de cuentas de acceso.',
  alta_no_permitida: 'Ahora mismo este salón no puede crear cuentas de acceso.',
  sin_negocio: 'Tu cuenta no tiene un salón asignado.',
};

// Avisos: la invitación salió, pero la ficha de la agenda no. La persona podrá
// entrar al software y no tendrá columna para recibir citas, así que hay que
// decirlo en el momento y no dejar una "cuenta fantasma" sin ficha.
export const AVISO_ACCESO: Record<string, string> = {
  ficha_no_creada: 'La invitación salió, pero no se pudo crear su ficha en la agenda. Créala a mano desde «Añadir profesional» para poder darle citas.',
  ficha_no_vinculada: 'La invitación salió, pero no se pudo enlazar con su ficha de la agenda. Ábrela y vuelve a guardarla.',
  ficha_limite: 'La invitación salió, pero no cabe otra ficha en la agenda: ya tienes 15 profesionales activos. Desactiva a alguien y luego crea su ficha.',
};

function mensaje(codigo: string | undefined): string {
  if (!codigo) return 'No se pudo completar la operación.';
  return ERROR_ACCESO[codigo] ?? 'No se pudo completar la operación.';
}

// Texto del aviso que devuelve el servidor, o null si todo fue bien.
export function avisoDeAcceso(data: { aviso?: string | null } | null | undefined): string | null {
  const clave = data?.aviso;
  if (!clave) return null;
  return AVISO_ACCESO[clave] ?? 'La invitación salió, pero su ficha de la agenda quedó pendiente.';
}

export async function cargarCuentasEquipo(): Promise<{ cuentas: CuentaEquipo[]; error: string | null }> {
  const { data, error } = await supabase.rpc('equipo_cuentas');
  if (error) {
    reportarError(error, { origen: 'app', tipo: 'operativo' });
    const clave = (error.message || '').match(/[a-z_]+/)?.[0] ?? '';
    return { cuentas: [], error: mensaje(clave) };
  }
  return { cuentas: (data as CuentaEquipo[]) ?? [], error: null };
}

async function llamarEdge(body: Record<string, unknown>): Promise<{ ok: boolean; error: string | null; data: RespuestaEdge | null }> {
  const { data, error } = await supabase.functions.invoke('crear-acceso-empleado', { body });
  let resp = (data ?? null) as RespuestaEdge | null;
  // En un status no-2xx (p.ej. 409 email_exists), supabase-js deja data=null y el cuerpo
  // JSON con { error: codigo } queda en error.context (un Response). Lo leemos para poder
  // dar el mensaje en cristiano en vez del generico "Edge Function returned a non-2xx status".
  if (error && !resp?.error) {
    try {
      const ctx = (error as unknown as { context?: Response })?.context;
      if (ctx && typeof ctx.json === 'function') resp = await ctx.json() as RespuestaEdge;
    } catch { /* cuerpo no JSON: nos quedamos con el mensaje generico */ }
  }
  if (error || resp?.error) {
    if (error) reportarError(error, { origen: 'app', tipo: 'operativo' });
    // El `detalle` del servidor explica ademas COMO se arregla (cambiar el modo
    // de acceso, contratar un plan...). Se prefiere al texto corto de la tabla.
    let msg = resp?.detalle?.trim() || mensaje(resp?.error);
    if (msg === 'No se pudo completar la operación.' && error) {
      msg = `${msg} Detalles: ${error.message || 'Error de conexión'}`;
    }
    return { ok: false, error: msg, data: resp };
  }
  return { ok: true, error: null, data: resp };
}

// Invita a alguien al software. Si se pasa `profesionalId`, la ficha queda
// vinculada YA en el servidor (no depende de que luego se pulse "Guardar").
// Con `crearFicha` se le crea ademas su columna en la agenda.
export function invitarAcceso(o: {
  email: string;
  nombre: string;
  rol: RolInvitable;
  profesionalId?: string | null;
  crearFicha?: boolean;
}) {
  return llamarEdge({
    accion: 'invitar',
    email: o.email.trim().toLowerCase(),
    nombre: o.nombre.trim(),
    rol: o.rol,
    profesional_id: o.profesionalId || undefined,
    crear_ficha: o.crearFicha === true,
  });
}

// Vuelve a mandar el correo: sirve tanto para quien nunca activo la cuenta como
// para quien ha perdido la contrasena.
export function reenviarInvitacion(targetId: string) {
  return llamarEdge({ accion: 'reenviar', target_id: targetId });
}

// Retira el acceso al software. La ficha del profesional NO se borra: su
// historial de citas sigue siendo del salon.
export function revocarAcceso(targetId: string) {
  return llamarEdge({ accion: 'revocar', target_id: targetId });
}

// ---------------------------------------------------------------------------
// Textos de estado, para que la UI diga lo mismo en todas partes
// ---------------------------------------------------------------------------

export interface EstadoLegible {
  etiqueta: string;
  tono: 'success' | 'warning' | 'neutral';
  detalle: string;
}

export function estadoLegible(c: CuentaEquipo): EstadoLegible {
  if (c.estado === 'activa') {
    return {
      etiqueta: 'Activa',
      tono: 'success',
      detalle: c.ultimo_acceso
        ? `Último acceso: ${formatoFecha(c.ultimo_acceso)}`
        : 'Puede entrar con su correo y contraseña.',
    };
  }
  return {
    etiqueta: 'Invitación pendiente',
    tono: 'warning',
    detalle: c.invitada_en
      ? `Invitada el ${formatoFecha(c.invitada_en)}. Todavía no ha elegido su contraseña.`
      : 'Todavía no ha elegido su contraseña, así que aún no puede entrar.',
  };
}

function formatoFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}
