// Planes de suscripcion y que incluye cada uno. FUENTE UNICA DE VERDAD.
//
// Eje distinto al de roles (lib/permissions.ts): el ROL dice que puede hacer una
// persona dentro del salon; el PLAN dice que ha contratado el salon. Para usar
// una funcion hacen falta las dos cosas.
//
// Lo que se anuncia en la seccion #precios de web/index.html y en el prompt de
// supabase/functions/chispa-landing DEBE cuadrar con esta tabla. Si se cambia
// aqui, cambiar tambien alli (y al reves).

export type Plan = 'free' | 'esencial' | 'estudio';

// Valor tal cual vive en profiles.plan -> plan canonico.
// 'full' es el valor historico de las cuentas con acceso completo: se trata como
// 'estudio' para que ninguna cuenta existente pierda nada al introducir planes.
const VALOR_A_PLAN: Record<string, Plan> = {
  free: 'free',
  esencial: 'esencial',
  estudio: 'estudio',
  full: 'estudio',
};

export function planDe(profile: { plan?: string | null } | null | undefined): Plan {
  const v = (profile?.plan || '').toLowerCase();
  return VALOR_A_PLAN[v] ?? 'free';
}

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Gratis',
  esencial: 'Esencial',
  estudio: 'Estudio',
};

// Funciones que dependen del plan contratado.
export type FuncionPlan =
  // --- Nucleo (Esencial en adelante) ---
  | 'agenda'              // agenda completa con reposos y servicios encadenados
  | 'clientes'            // fichas, fichas de color, fotos
  | 'portal_reserva'      // portal publico de reserva propio
  | 'recordatorios'       // avisos automaticos al cliente por WhatsApp
  | 'caja'                // cobros y cierre de caja
  | 'informes'            // informes del negocio
  | 'equipo'              // equipo, horarios y comisiones
  | 'presupuestos'
  | 'inventario'
  | 'resenas'
  // --- Solo Estudio ---
  | 'ia_chispa'           // el asistente Chispa dentro del software
  | 'ia_voz'              // la IA contesta el telefono del salon y da cita hablando
  | 'senales'             // cobro de senal/deposito con Stripe (anti no-show)
  | 'campanas'            // campanas de marketing
  | 'lista_espera'        // lista de espera con avisos automaticos
  | 'verifactu';          // facturacion homologada + fichaje legal

// El plan gratuito solo sirve para mirar la demo compartida: no habilita nada.
const FREE: FuncionPlan[] = [];

const ESENCIAL: FuncionPlan[] = [
  'agenda',
  'clientes',
  'portal_reserva',
  'recordatorios',
  'caja',
  'informes',
  'equipo',
  'presupuestos',
  'inventario',
  'resenas',
];

const ESTUDIO: FuncionPlan[] = [
  ...ESENCIAL,
  'ia_chispa',
  'ia_voz',
  'senales',
  'campanas',
  'lista_espera',
  'verifactu',
];

export const PLAN_FUNCIONES: Record<Plan, ReadonlySet<FuncionPlan>> = {
  free: new Set(FREE),
  esencial: new Set(ESENCIAL),
  estudio: new Set(ESTUDIO),
};

// ¿El plan de este perfil incluye esta funcion?
export function incluyePlan(
  profile: { plan?: string | null } | null | undefined,
  funcion: FuncionPlan,
): boolean {
  return PLAN_FUNCIONES[planDe(profile)].has(funcion);
}

// Plan minimo que incluye una funcion (para decir "esto es del plan Estudio").
export function planMinimoPara(funcion: FuncionPlan): Plan {
  if (PLAN_FUNCIONES.esencial.has(funcion)) return 'esencial';
  if (PLAN_FUNCIONES.estudio.has(funcion)) return 'estudio';
  return 'estudio';
}

// Texto corto para el aviso de "esto no entra en tu plan".
export const FUNCION_LABEL: Record<FuncionPlan, string> = {
  agenda: 'la agenda',
  clientes: 'las fichas de cliente',
  portal_reserva: 'el portal de reserva online',
  recordatorios: 'los recordatorios automáticos',
  caja: 'la caja',
  informes: 'los informes',
  equipo: 'la gestión de equipo',
  presupuestos: 'los presupuestos',
  inventario: 'el inventario',
  resenas: 'las reseñas',
  ia_chispa: 'Chispa, el asistente de IA',
  ia_voz: 'la IA que contesta el teléfono',
  senales: 'el cobro de señales',
  campanas: 'las campañas de marketing',
  lista_espera: 'la lista de espera inteligente',
  verifactu: 'la facturación VeriFactu',
};

// Planes asignables desde el panel de staff, de menor a mayor.
export const PLANES_ASIGNABLES: readonly Plan[] = ['free', 'esencial', 'estudio'];
