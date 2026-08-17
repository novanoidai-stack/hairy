import { supabase } from './supabase';
import { can, roleOf } from './permissions';
import { identidadActiva, suscribirIdentidad } from './identidadActiva';
import { reportarError } from './reportarError';

export interface UserProfile {
  id: string;
  email: string;
  nombre: string;
  apellido?: string;
  nombre_negocio?: string;
  codigo_postal?: string;
  role: 'owner' | 'admin' | 'employee' | 'recepcion';
  negocio_id: string;
  phone: string;
  plan?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  privacy_accepted_at?: string | null;
  privacy_policy_version?: string | null;
  paginas_manual_vistas?: Record<string, string>;
  // Solo en salones con acceso compartido: quien se ha identificado en ESTE
  // dispositivo. `role` ya viene sustituido por el suyo (ver conIdentidadActiva).
  identidad_profesional_id?: string | null;
  identidad_nombre?: string | null;
}

// Cache de sesion/perfil (Sesion 10 V2 — rendimiento por pestaña).
// Motivo medido: cada pestaña + ChispaLauncher + gate de privacidad + hooks
// llamaban a getUserProfile() al montar, y cada uno hacia un auth.getUser() con
// round-trip de red a /auth/v1/user (300-500ms). Se veian decenas de llamadas
// 'user' redundantes por carga. Este cache colapsa la RAFAGA de montaje (ventana
// corta) y comparte la peticion en vuelo, sin arriesgar datos rancios: se
// invalida en cualquier cambio de sesion y tras mutar el propio perfil. No cachea
// resultados nulos ni errores transitorios (para que un fallo de red se reintente).
// El TTL era de 8 s, pensado solo para colapsar la rafaga del montaje inicial.
// Pero getUserProfile() lo llama CADA pantalla al montarse, asi que moverse
// entre pestanas cada pocos segundos volvia a pagar el viaje a /auth/v1/user
// (300-500 ms) una y otra vez, y la navegacion se sentia pastosa. 60 s es
// seguro porque el cache no depende del reloj para lo que importa: se invalida
// al instante en cualquier cambio de sesion, al cambiar de identidad en el
// mostrador y tras editar el propio perfil.
type Cache<T> = { at: number; promise: Promise<T> } | null;
const AUTH_TTL_MS = 60000;
let userCache: Cache<Awaited<ReturnType<typeof rawGetUser>>> = null;
let profileCache: Cache<UserProfile | null> = null;

export function invalidateAuthCache() {
  userCache = null;
  profileCache = null;
}

async function rawGetUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUser() {
  const now = Date.now();
  if (userCache && now - userCache.at < AUTH_TTL_MS) return userCache.promise;
  const promise = rawGetUser();
  userCache = { at: now, promise };
  // No dejar cacheada una peticion fallida o sin usuario: reintenta la siguiente.
  promise.then((u) => { if (!u) userCache = null; }, () => { userCache = null; });
  return promise;
}

// Salon con acceso compartido (un solo correo): delante del dispositivo puede
// estar cualquiera del equipo, asi que manda el rol de la persona que se ha
// identificado, no el de la cuenta con la que se entro (que es la del jefe).
// Se hace AQUI, en el unico sitio por el que pasa todo el mundo, en vez de en
// las veinte pantallas que preguntan "que puede hacer este".
function conIdentidadActiva(profile: UserProfile | null): UserProfile | null {
  if (!profile) return profile;
  const ident = identidadActiva(profile.negocio_id);
  if (!ident) return profile;
  return {
    ...profile,
    role: ident.rol,
    identidad_profesional_id: ident.profesionalId,
    identidad_nombre: ident.nombre,
  };
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const now = Date.now();
  if (profileCache && now - profileCache.at < AUTH_TTL_MS) return profileCache.promise;
  const promise = (async () => {
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      reportarError(error, { origen: 'app', tipo: 'operativo' });
      return null;
    }
    return conIdentidadActiva((data as UserProfile | null) ?? null);
  })();
  profileCache = { at: now, promise };
  promise.then((p) => { if (!p) profileCache = null; }, () => { profileCache = null; });
  return promise;
}

// Cambiar de persona en el mostrador tiene que notarse ya: sin esto, la app
// seguiria 8 segundos con el rol de la anterior (lo que dura el cache).
suscribirIdentidad(() => { invalidateAuthCache(); });

// Cualquier cambio de sesion (login/logout/refresh de token) invalida el cache.
supabase.auth.onAuthStateChange(() => { invalidateAuthCache(); });

// Pertenece la cuenta autenticada al equipo Mecha? (RPC is_staff, security definer)
export async function isStaff(): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_staff');
    return data === true;
  } catch {
    return false;
  }
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function isOwner(profile: UserProfile | null): boolean {
  return roleOf(profile) === 'propietario';
}

export function canAccessInformes(profile: UserProfile | null): boolean {
  return can(profile, 'informes.ver');
}

export function canAccessConfig(profile: UserProfile | null): boolean {
  return can(profile, 'config.ver');
}

// Reexport del sistema de capacidades para uso conveniente desde la UI.
export { can, roleOf, roleLabel, ROLE_LABEL, ASSIGNABLE_ROLES, ROLE_TO_VALUE } from './permissions';
export type { Role, Capability } from './permissions';
