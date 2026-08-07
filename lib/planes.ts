// Planes de suscripcion y que incluye cada uno. FUENTE UNICA DE VERDAD.
//
// Eje distinto al de roles (lib/permissions.ts): el ROL dice que puede hacer una
// persona dentro del salon; el PLAN dice que ha contratado el salon. Para usar
// una funcion hacen falta las dos cosas.
//
// Reestructura del 7 ago 2026: la IA (WhatsApp y voz) dejo de ser exclusiva de
// "Estudio" y paso a ser un ADDON opcional, ortogonal al plan de software
// (campo profiles.ia_nivel). El resto de funciones que antes vivian solo en
// Estudio (senales, campanas, lista de espera, VeriFactu) no son IA: bajaron
// al software de pago, disponible igual en Esencial y Estudio. La distincion
// esencial/estudio ya no gatea nada por si sola -- se conserva el campo por
// compatibilidad con cuentas existentes, pero ambos dan el mismo software.
//
// Lo que se anuncia en la seccion #precios de web/index.html y en el prompt de
// supabase/functions/chispa-landing DEBE cuadrar con este archivo. Si se
// cambia aqui, cambiar tambien alli (y al reves).

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

// Precio mensual sin IVA. El IVA (21%) lo aplica Stripe con una tasa fija, no se
// suma aqui. Mismo aviso que arriba: si cambia, cambia tambien en la seccion
// #precios de web/index.html y en el prompt de chispa-landing.
//
// *** DESINCRONIZADO desde la reestructura del 7 ago 2026 (ver mas abajo):
// esto sigue reflejando el modelo VIEJO (esencial 39/estudio 59, IA solo en
// estudio) porque asi es como cobra hoy crear-checkout-suscripcion. El resto
// de este archivo (SOFTWARE_COMPLETO, IaNivel, ia_nivel) ya implementa el
// modelo NUEVO (software 39 llano + addon de IA aparte 19/29/39), pero el
// checkout de Stripe todavia NO sabe vender el addon por separado. Pendiente
// de reconciliar con quien mantiene crear-checkout-suscripcion antes de que
// esto deje de ser una fuente de verdad partida en dos. ***
export const PLAN_PRECIO_EUR: Record<Plan, number> = {
  free: 0,
  esencial: 39,
  estudio: 59,
};

// Los dos planes que un salon puede contratar por su cuenta, en orden de precio.
export const PLANES_CONTRATABLES: readonly Plan[] = ['esencial', 'estudio'];

// Estado de la suscripcion tal cual vive en profiles.suscripcion_estado.
// 'prueba' = mes gratis sin tarjeta (no existe en Stripe, lo lleva trial_ends_at).
// 'caducada' = se acabo la prueba sin contratar.
export type EstadoSuscripcion =
  | 'prueba' | 'activa' | 'pago_pendiente' | 'impagada'
  | 'cancelada' | 'pausada' | 'caducada';

// ¿Este estado da acceso al producto? Un impago no corta al instante: Stripe
// reintenta varios dias y periodo_fin hace de margen.
export function tieneAcceso(estado: string | null | undefined): boolean {
  return estado === 'prueba' || estado === 'activa' || estado === 'pago_pendiente';
}

// Addon de IA contratado (profiles.ia_nivel), ortogonal al plan de software.
export type IaNivel = 'ninguna' | 'whatsapp' | 'voz' | 'completa';

const VALOR_A_IA: Record<string, IaNivel> = {
  ninguna: 'ninguna',
  whatsapp: 'whatsapp',
  voz: 'voz',
  completa: 'completa',
};

export function iaNivelDe(profile: { ia_nivel?: string | null } | null | undefined): IaNivel {
  const v = (profile?.ia_nivel || '').toLowerCase();
  return VALOR_A_IA[v] ?? 'ninguna';
}

export const IA_NIVEL_LABEL: Record<IaNivel, string> = {
  ninguna: 'Sin IA',
  whatsapp: 'IA por WhatsApp',
  voz: 'IA por voz',
  completa: 'IA completa (WhatsApp + voz)',
};

// Funciones que dependen del plan de software (esencial y estudio dan lo mismo)
// o del addon de IA. Las dos ultimas (ia_*) NO se miran contra PLAN_FUNCIONES:
// incluyePlan() las desvia a IA_FUNCIONES segun ia_nivel.
export type FuncionPlan =
  // --- Software (cualquier plan de pago, esencial o estudio) ---
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
  | 'senales'             // cobro de senal/deposito con Stripe (anti no-show)
  | 'campanas'            // campanas de marketing
  | 'lista_espera'        // lista de espera con avisos automaticos
  | 'verifactu'           // facturacion homologada + fichaje legal
  // --- Addon de IA (profiles.ia_nivel, no el plan) ---
  | 'ia_chispa'           // el asistente Chispa por WhatsApp
  | 'ia_voz';             // la IA contesta el telefono del salon y da cita hablando

const IA_SOLO: ReadonlySet<FuncionPlan> = new Set(['ia_chispa', 'ia_voz']);

// El plan gratuito solo sirve para mirar la demo compartida: no habilita nada.
const FREE: FuncionPlan[] = [];

// Todo lo que no es IA: igual en esencial que en estudio desde la reestructura.
const SOFTWARE_COMPLETO: FuncionPlan[] = [
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
  'senales',
  'campanas',
  'lista_espera',
  'verifactu',
];

export const PLAN_FUNCIONES: Record<Plan, ReadonlySet<FuncionPlan>> = {
  free: new Set(FREE),
  esencial: new Set(SOFTWARE_COMPLETO),
  estudio: new Set(SOFTWARE_COMPLETO),
};

// Que funciones de IA desbloquea cada nivel del addon.
const IA_FUNCIONES: Record<IaNivel, ReadonlySet<FuncionPlan>> = {
  ninguna: new Set([]),
  whatsapp: new Set(['ia_chispa']),
  voz: new Set(['ia_voz']),
  completa: new Set(['ia_chispa', 'ia_voz']),
};

// ¿El plan/addon de este perfil incluye esta funcion? Firma sin cambios a
// proposito: los call sites existentes (usePlan, ChispaLauncher...) no tienen
// que saber que ia_chispa/ia_voz ahora miran ia_nivel en vez de plan.
export function incluyePlan(
  profile: { plan?: string | null; ia_nivel?: string | null } | null | undefined,
  funcion: FuncionPlan,
): boolean {
  if (IA_SOLO.has(funcion)) {
    return IA_FUNCIONES[iaNivelDe(profile)].has(funcion);
  }
  return PLAN_FUNCIONES[planDe(profile)].has(funcion);
}

// Plan minimo que incluye una funcion de SOFTWARE (para "esto es del plan de pago").
// Las funciones de IA no tienen "plan minimo": usar planMinimoParaIA() para esas.
export function planMinimoPara(funcion: FuncionPlan): Plan {
  if (IA_SOLO.has(funcion)) return 'esencial';
  if (PLAN_FUNCIONES.esencial.has(funcion)) return 'esencial';
  return 'estudio';
}

// Nivel de IA minimo que incluye una funcion de IA (para "activa el addon de X").
export function iaNivelMinimoPara(funcion: FuncionPlan): IaNivel {
  if (funcion === 'ia_chispa') return 'whatsapp';
  if (funcion === 'ia_voz') return 'voz';
  return 'completa';
}

export function esFuncionDeIA(funcion: FuncionPlan): boolean {
  return IA_SOLO.has(funcion);
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
  ia_chispa: 'Chispa, el asistente de IA por WhatsApp',
  ia_voz: 'la IA que contesta el teléfono',
  senales: 'el cobro de señales',
  campanas: 'las campañas de marketing',
  lista_espera: 'la lista de espera inteligente',
  verifactu: 'la facturación VeriFactu',
};

// Planes asignables desde el panel de staff, de menor a mayor.
export const PLANES_ASIGNABLES: readonly Plan[] = ['free', 'esencial', 'estudio'];

// Niveles de IA asignables desde el panel de staff.
export const IA_NIVELES_ASIGNABLES: readonly IaNivel[] = ['ninguna', 'whatsapp', 'voz', 'completa'];
