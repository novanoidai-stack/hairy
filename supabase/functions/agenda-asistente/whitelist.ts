// Regla dura de salud (RGPD art. 9) para la capa de IA "Chispa".
//
// Los datos de salud de una clienta (alergias, sensibilidades del cuero
// cabelludo, notas medicas) JAMAS pueden viajar al LLM. Se implementa por
// LISTA BLANCA (pick), no por lista negra (omit): si manana se anade una
// columna nueva a `clientes`, por defecto queda FUERA del alcance de la IA.
//
// Defensa en profundidad:
//  1) proyectarClienteIA(): en el origen, cada fila de cliente se reduce a los
//     campos operativos permitidos ANTES de construir el resultado de una tool.
//  2) assertSinCamposProhibidos(): antes de mandar cualquier objeto al LLM,
//     se recorre y se FALLA CERRADO (throw) si aparece una clave prohibida.
//     Cubre regresiones (p. ej. una query que anada por error un select de
//     alergias). Es la asercion que exige la Sesion 2 del plan.

// Campos operativos permitidos: SOLO nombre, telefono, historial de citas,
// servicios y gasto (mas el id, necesario como handle interno de las tools).
export const CLIENTE_CAMPOS_IA = [
  'id',
  'nombre',
  'telefono',
  'total_visitas',
  'ultima_visita',
  'primera_visita',
  'ticket_medio',
  'frecuencia_dias',
] as const;

export type CampoClienteIA = (typeof CLIENTE_CAMPOS_IA)[number];
export type ClienteIA = Partial<Record<CampoClienteIA, unknown>>;

// Proyecta una fila de cliente a SOLO los campos permitidos (lista blanca).
export function proyectarClienteIA(
  row: Record<string, unknown> | null | undefined,
): ClienteIA {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const k of CLIENTE_CAMPOS_IA) {
    if (k in row && row[k] !== undefined) out[k] = row[k];
  }
  return out as ClienteIA;
}

// Claves que JAMAS pueden aparecer en un payload dirigido al LLM. Si aparecen,
// es un bug de ensamblado: fallamos cerrado. Lista negra SOLO como segunda red
// (la defensa primaria es la lista blanca de arriba).
export const CAMPOS_PROHIBIDOS_IA = [
  'alergias',
  'sensibilidades_cuero',
  'notas', // notas libres de la ficha: pueden contener informacion de salud
  'notas_salud',
  'nota_medica',
  'notas_medicas',
  'medicacion',
  'medicamentos',
  'diagnostico',
  'patologia',
  'patologias',
  'salud',
  'bloqueo_motivo', // motivo de bloqueo del cliente: puede ser sensible
] as const;

const PROHIBIDOS = new Set<string>(CAMPOS_PROHIBIDOS_IA as readonly string[]);

// Recorre recursivamente cualquier estructura (objeto/array) y lanza si alguna
// CLAVE coincide con la lista prohibida. Se aplica sobre el resultado de cada
// tool ANTES de serializarlo hacia el LLM. Compara claves (no cadenas), por lo
// que no da falsos positivos con textos del system prompt que mencionen la
// palabra "alergias".
export function assertSinCamposProhibidos(payload: unknown, ruta = '$'): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      assertSinCamposProhibidos(payload[i], `${ruta}[${i}]`);
    }
    return;
  }
  if (typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (PROHIBIDOS.has(k.toLowerCase())) {
        throw new Error(
          `FUGA DE DATOS DE SALUD: la clave prohibida "${k}" (${ruta}.${k}) no puede viajar al LLM.`,
        );
      }
      assertSinCamposProhibidos(v, `${ruta}.${k}`);
    }
  }
}
