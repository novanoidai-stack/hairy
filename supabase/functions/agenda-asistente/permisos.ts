// RBAC de la capa de IA (Sesion 2). Espejo MINIMO de lib/permissions.ts para el
// edge (Deno no puede importar la lib de RN). FUENTE DE VERDAD: lib/permissions.ts
// (RN-EQ-040..043). Mantener sincronizado si cambian roles/capacidades.
//
// El set de TOOLS que se declara al LLM se filtra por rol: lo que un rol no
// puede hacer NI SE DECLARA (p. ej. un Profesional no ve la tool de informes).
// Es defensa en profundidad sobre los chequeos runtime que ya existen y sobre
// las RLS del usuario en las escrituras.

export type Role = 'propietario' | 'direccion' | 'recepcion' | 'profesional';

// Valor tal cual vive en profiles.role -> rol canonico.
const VALUE_TO_ROLE: Record<string, Role> = {
  owner: 'propietario',
  admin: 'direccion',
  employee: 'profesional',
  recepcion: 'recepcion',
  propietario: 'propietario',
  direccion: 'direccion',
  profesional: 'profesional',
};

export function roleOf(roleValue: string | null | undefined): Role {
  if (!roleValue) return 'profesional';
  return VALUE_TO_ROLE[roleValue] ?? 'profesional';
}

// Capacidades que necesita la capa de IA (subconjunto de lib/permissions.ts).
export type Capability =
  | 'agenda.ver_propia'
  | 'agenda.ver_todas'
  | 'clientes.ver'
  | 'informes.ver'
  | 'presupuestos.crear' // crear_presupuesto
  | 'bandeja.escribir' // enviar_mensaje_bandeja (registro; envio real = Alexandro)
  | 'servicios.editar' // editar_servicio (catalogo)
  | 'horarios.editar' // editar_horario (turnos de equipo)
  | 'config.cambiar'; // cambiar_config: solo propietario (como en el edge actual)

const PROFESIONAL: Capability[] = ['agenda.ver_propia', 'clientes.ver'];
// Recepcion opera la agenda de todos y la comunicacion (presupuestos/bandeja).
const RECEPCION: Capability[] = [...PROFESIONAL, 'agenda.ver_todas', 'presupuestos.crear', 'bandeja.escribir'];
// Direccion suma la vision de negocio y la gestion del catalogo/turnos.
const DIRECCION: Capability[] = [...RECEPCION, 'informes.ver', 'servicios.editar', 'horarios.editar'];
const PROPIETARIO: Capability[] = [...DIRECCION, 'config.cambiar'];

const ROLE_CAPS: Record<Role, ReadonlySet<Capability>> = {
  profesional: new Set(PROFESIONAL),
  recepcion: new Set(RECEPCION),
  direccion: new Set(DIRECCION),
  propietario: new Set(PROPIETARIO),
};

export function can(role: Role, cap: Capability): boolean {
  return ROLE_CAPS[role].has(cap);
}

// ¿Esta tool es una ESCRITURA (agenda, gestion o config)? El edge la usa para
// enrutar la construccion de propuestas (propone->confirma) en vez de ejecutar.
export function esEscritura(name: string): boolean {
  return name === 'cambiar_config' || name in ESCRITURA_GESTION || ESCRITURA_AGENDA.has(name);
}

// Alcance de escritura del asistente (identico a asistenteWriteScope de la lib).
export type WriteScope = 'all' | 'self' | 'none';

// Tools de escritura de AGENDA (requieren scope != none).
const ESCRITURA_AGENDA = new Set([
  'crear_cita',
  'reagendar_cita',
  'cancelar_cita',
  'bloquear_hueco',
  'liberar_hueco',
  // Batch de confirmacion: opera sobre citas -> mismo gating de agenda (scope).
  'confirmar_citas',
]);

// Tools de escritura de GESTION (Sesion 3): cada una requiere su capacidad
// concreta (independiente del scope de agenda).
const ESCRITURA_GESTION: Record<string, Capability> = {
  editar_servicio: 'servicios.editar',
  editar_horario: 'horarios.editar',
  crear_presupuesto: 'presupuestos.crear',
  enviar_mensaje_bandeja: 'bandeja.escribir',
};

// Capacidad requerida por cada tool de LECTURA/NAVEGACION. null = cualquier rol.
const LECTURA_CAP: Record<string, Capability | null> = {
  info_catalogo: null,
  buscar_cliente: 'clientes.ver',
  listar_citas: 'agenda.ver_propia',
  consultar_disponibilidad: 'agenda.ver_propia',
  resumen_informes: 'informes.ver',
  sugerir_enlace: null, // navegacion (no lee datos): cualquier rol
};

// Predicado central del gating: ¿se declara esta tool al LLM para este rol/scope?
// Fail-closed: una tool desconocida NUNCA se declara.
export function toolPermitida(name: string, role: Role, scope: WriteScope): boolean {
  if (name === 'cambiar_config') return can(role, 'config.cambiar');
  if (name in ESCRITURA_GESTION) return can(role, ESCRITURA_GESTION[name]);
  if (ESCRITURA_AGENDA.has(name)) {
    if (scope === 'none') return false;
    // El scope 'self'/'all' ya exige agenda operable; ademas la RLS del usuario
    // valida la escritura al confirmar. Aqui basta con scope != none.
    return true;
  }
  if (name in LECTURA_CAP) {
    const cap = LECTURA_CAP[name];
    return cap === null || can(role, cap);
  }
  return false;
}
