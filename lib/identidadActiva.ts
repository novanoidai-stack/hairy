// Quien esta usando el software AHORA MISMO en este dispositivo.
//
// En el modo de acceso compartido (un salon, un correo) la sesion es siempre la
// del propietario, pero delante de la tablet puede estar cualquiera del equipo.
// Antes de dejar tocar nada, la app pregunta QUIEN ERES y guarda la respuesta
// aqui: eso es la "identidad activa".
//
// COMO SE PROPAGA: getUserProfile() (lib/auth.ts) devuelve el perfil con el ROL
// de la identidad activa en vez del rol de la cuenta. Como TODA la app decide
// con can(profile, ...), con eso solo ya se comporta como esa persona en las
// veinte pantallas, sin tocarlas una por una.
//
// LO QUE ESTO NO ES: un muro de seguridad. La sesion de debajo sigue siendo la
// del propietario y el servidor la ve asi; RLS no puede distinguir a quien
// eligio "Marta" del jefe. Es una barrera de USO, la misma que hace el PIN de
// un TPV. Quien necesite separacion real necesita su propio correo (modo
// 'individual', el de por defecto). Esta escrito tal cual en la pantalla de
// staff que enciende el modo, para que nadie lo venda como lo que no es.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type RolAcceso = 'owner' | 'admin' | 'recepcion' | 'employee';

export interface IdentidadActiva {
  negocioId: string;
  // Ficha de profesional elegida. null = entrada "Soy el propietario", que no
  // tiene por que tener ficha en la agenda.
  profesionalId: string | null;
  nombre: string;
  rol: RolAcceso;
  // Cuando se eligio (epoch ms): sirve para caducar la sesion de mostrador.
  desde: number;
}

export interface EstadoAccesoSalon {
  modo: 'individual' | 'compartido';
  tienePin: boolean;
}

const CLAVE = 'mecha_identidad_activa';

// Caduca sola: si la tablet se queda encendida toda la noche, por la mañana
// vuelve a preguntar quien eres en vez de dar por hecho que sigue el de ayer.
export const CADUCIDAD_MS = 14 * 60 * 60 * 1000; // 14 horas

let cache: IdentidadActiva | null = null;
let cargada = false;
const oyentes = new Set<(i: IdentidadActiva | null) => void>();

function haCaducado(i: IdentidadActiva): boolean {
  return Date.now() - i.desde > CADUCIDAD_MS;
}

function avisar() {
  oyentes.forEach((f) => {
    try { f(cache); } catch { /* un oyente roto no puede tumbar a los demas */ }
  });
}

// Lectura sincrona para quien no puede esperar (getUserProfile). Devuelve null
// hasta que termina la primera carga; por eso la app espera a cargarIdentidad()
// antes de pintar nada en modo compartido.
export function identidadActiva(negocioId?: string): IdentidadActiva | null {
  if (!cache) return null;
  if (haCaducado(cache)) return null;
  if (negocioId && cache.negocioId !== negocioId) return null;
  return cache;
}

export function identidadCargada(): boolean {
  return cargada;
}

export async function cargarIdentidad(): Promise<IdentidadActiva | null> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    const guardada = crudo ? (JSON.parse(crudo) as IdentidadActiva) : null;
    cache = guardada && !haCaducado(guardada) ? guardada : null;
    if (guardada && !cache) await AsyncStorage.removeItem(CLAVE);
  } catch {
    cache = null;
  }
  cargada = true;
  avisar();
  return cache;
}

export async function elegirIdentidad(i: Omit<IdentidadActiva, 'desde'>): Promise<void> {
  cache = { ...i, desde: Date.now() };
  try { await AsyncStorage.setItem(CLAVE, JSON.stringify(cache)); } catch { /* modo privado */ }
  avisar();
}

export async function soltarIdentidad(): Promise<void> {
  cache = null;
  try { await AsyncStorage.removeItem(CLAVE); } catch { /* modo privado */ }
  avisar();
}

export function suscribirIdentidad(f: (i: IdentidadActiva | null) => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

// --- Textos, para que el selector y la app digan lo mismo ---

export const ROL_ACCESO_LABEL: Record<RolAcceso, string> = {
  owner: 'Propietario',
  admin: 'Dirección',
  recepcion: 'Recepción',
  employee: 'Profesional',
};

export const ROL_ACCESO_DESC: Record<RolAcceso, string> = {
  owner: 'Todo el salón: caja, informes, equipo y configuración.',
  admin: 'Agenda completa, equipo, informes y configuración.',
  recepcion: 'Agenda de todo el salón y clientas.',
  employee: 'Su agenda y sus clientas.',
};

// Los roles que piden PIN al elegirlos: son los que abren la caja, los informes
// y la configuracion del salon.
export function pidePin(rol: RolAcceso): boolean {
  return rol === 'owner' || rol === 'admin';
}
