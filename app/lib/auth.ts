import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  nombre: string;
  role: 'owner' | 'employee' | 'admin';
  negocio_id: string;
  phone: string;
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

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function isOwner(profile: UserProfile | null): boolean {
  return profile?.role === 'owner' || profile?.role === 'admin';
}
