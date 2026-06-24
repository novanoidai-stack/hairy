// Roles de acceso del salon y capacidades.
// Fuente: Documento Modular 3 (Equipo y horarios), seccion 7 (RN-EQ-040..043).
//
// Los roles canonicos se mapean a los valores historicos de profiles.role
// (owner/admin/employee) para no migrar datos ni tocar el alta de cuentas.

export type Role = 'propietario' | 'direccion' | 'recepcion' | 'profesional';

// Valor tal cual vive en profiles.role -> rol canonico.
const VALUE_TO_ROLE: Record<string, Role> = {
  owner: 'propietario',
  admin: 'direccion',
  employee: 'profesional',
  recepcion: 'recepcion',
  // por si en el futuro se guardan los nombres canonicos directamente
  propietario: 'propietario',
  direccion: 'direccion',
  profesional: 'profesional',
};

export function roleOf(profile: { role?: string | null } | null | undefined): Role {
  const v = profile?.role;
  if (!v) return 'profesional';
  return VALUE_TO_ROLE[v] ?? 'profesional';
}

export const ROLE_LABEL: Record<Role, string> = {
  propietario: 'Propietario',
  direccion: 'Direccion',
  recepcion: 'Recepcion',
  profesional: 'Profesional',
};

export function roleLabel(profile: { role?: string | null } | null | undefined): string {
  return ROLE_LABEL[roleOf(profile)];
}

// Capacidades atomicas que la UI puede consultar para mostrar/ocultar y gatear.
export type Capability =
  | 'agenda.ver_propia'
  | 'agenda.ver_todas'
  | 'agenda.gestionar_todas'
  | 'agenda.gestionar_propia'   // operar SOLO la agenda propia (gateado por toggle de salon)
  | 'clientes.ver'
  | 'clientes.editar'
  | 'clientes.notas_internas'
  | 'equipo.ver'
  | 'equipo.gestionar'
  | 'config.ver'
  | 'config.precios_servicios'
  | 'config.comisiones'
  | 'informes.ver'
  | 'roles.gestionar'
  | 'datos.eliminar'
  | 'datos.exportar'
  | 'plan.cambiar';

// Permisos por defecto por rol, acumulativos segun el doc.
// RN-EQ-043: el profesional siempre ve lo suyo (agenda propia, fichas, sus metricas).
const PROFESIONAL: Capability[] = [
  'agenda.ver_propia',
  'clientes.ver',
  'clientes.editar',
];

// Recepcion: lo de profesional + agenda completa de todos y su gestion.
const RECEPCION: Capability[] = [
  ...PROFESIONAL,
  'agenda.ver_todas',
  'agenda.gestionar_todas',
  'equipo.ver',
];

// Direccion: lo de recepcion + configuracion, equipo, informes, precios,
// comisiones, notas internas y gestion de roles.
const DIRECCION: Capability[] = [
  ...RECEPCION,
  'clientes.notas_internas',
  'equipo.gestionar',
  'config.ver',
  'config.precios_servicios',
  'config.comisiones',
  'informes.ver',
  'roles.gestionar',
];

// Propietario: acceso total. RN-EQ-041: capacidades sensibles solo aqui.
const PROPIETARIO: Capability[] = [
  ...DIRECCION,
  'datos.eliminar',
  'datos.exportar',
  'plan.cambiar',
];

export const ROLE_CAPS: Record<Role, ReadonlySet<Capability>> = {
  profesional: new Set(PROFESIONAL),
  recepcion: new Set(RECEPCION),
  direccion: new Set(DIRECCION),
  propietario: new Set(PROPIETARIO),
};

export function can(
  profile: { role?: string | null } | null | undefined,
  cap: Capability,
): boolean {
  return ROLE_CAPS[roleOf(profile)].has(cap);
}

// RN-EQ-041: sensibles reservadas a Propietario, no delegables.
export const SENSITIVE_CAPS: readonly Capability[] = [
  'datos.eliminar',
  'datos.exportar',
  'plan.cambiar',
];

// Roles asignables desde la UI de gestion, de menor a mayor privilegio.
export const ASSIGNABLE_ROLES: readonly Role[] = [
  'profesional',
  'recepcion',
  'direccion',
  'propietario',
];

// El valor que se guarda en profiles.role para cada rol canonico.
export const ROLE_TO_VALUE: Record<Role, string> = {
  propietario: 'owner',
  direccion: 'admin',
  recepcion: 'recepcion',
  profesional: 'employee',
};

// Alcance de escritura del asistente de agenda.
// 'all'  = opera a cualquier profesional (Recepcion/Direccion/Propietario).
// 'self' = opera solo su propia agenda (Profesional, si el salon lo permite).
// 'none' = solo consulta.
export type AsistenteWriteScope = 'all' | 'self' | 'none';

export function asistenteWriteScope(
  profile: { role?: string | null } | null | undefined,
  profesionalEscribeFlag: boolean,
): AsistenteWriteScope {
  if (can(profile, 'agenda.gestionar_todas')) return 'all';
  if (profesionalEscribeFlag && roleOf(profile) === 'profesional') return 'self';
  return 'none';
}
