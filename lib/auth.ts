import { supabase } from './supabase';
import { can, roleOf } from './permissions';

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
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return data;
}

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
