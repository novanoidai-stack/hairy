// Edge Function: agenda-asistente
// LLM con tool-use para consultar/proponer operaciones de agenda.
// Lecturas se ejecutan aquí (server-side, service key).
// Escrituras NO se ejecutan: devuelven accion_propuesta al panel.

import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';
// Seguridad de la capa IA (Sesion 2): RBAC de tools + regla dura de salud.
import { can, roleOf, toolPermitida, esEscritura, accionPermitidaEnSuperficie, esLectura, type Role } from './permisos.ts';
import { assertSinCamposProhibidos, proyectarClienteIA } from './whitelist.ts';
import { CATALOGO_IA } from '../../../lib/iaCatalogo.ts';

// ---------------------------------------------------------------------------
// CORS + helper
// ---------------------------------------------------------------------------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Clientes globales (se inicializan una vez en cold start)
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
// Claude (Anthropic) via OpenRouter (OpenAI-compatible).
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
});
// Modelo: Haiku 4.5 (~3x mas barato que Sonnet 4.6, misma familia Anthropic para no
// degradar el tool-calling). Cambiar aqui si se quiere subir a Sonnet para intenciones
// complejas. Se puede sobrescribir por config del negocio via OPENROUTER_MODEL (secret).
const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-haiku-4.5';
// Modelo barato para LECTURA/analisis (la "biblioteca del salon"): ~10x mas barato
// que Haiku. Las ESCRITURAS siguen en MODEL (Haiku). Configurable por secret sin
// tocar codigo (rework KISS: dos modelos por tarea).
const MODEL_LECTURA = Deno.env.get('OPENROUTER_MODEL_LECTURA') ?? 'google/gemini-2.0-flash-001';
// Tenant demo compartido entre visitantes: NO se persiste memoria cross-visitante (constraint #8).
const DEMO_NEGOCIO_ID = 'demo_salon_001';

// ---------------------------------------------------------------------------
// Tipos de accion (deben coincidir con lib/agendaOps.ts)
// ---------------------------------------------------------------------------
type AccionPropuesta =
  | {
      tipo: 'crear_cita';
      negocio_id: string; profesional_id: string; profesional_nombre: string;
      servicio_id: string; servicio_nombre: string;
      cliente_id: string | null; cliente_nombre: string | null;
      inicio: string; fin: string; fin_activa: string; fin_espera: string;
      resumen: string; solapa: boolean;
    }
  | {
      tipo: 'reagendar_cita';
      cita_id: string; nuevo_inicio: string; nuevo_fin: string;
      nuevo_fin_activa: string; nuevo_fin_espera: string;
      nuevo_profesional_id?: string; resumen: string; solapa: boolean;
    }
  | { tipo: 'cancelar_cita'; cita_id: string; motivo: string | null; resumen: string }
  | {
      tipo: 'bloquear_hueco';
      negocio_id: string; profesional_id: string; profesional_nombre: string;
      inicio: string; fin: string; motivo: string | null; resumen: string; solapa: boolean;
    }
  | { tipo: 'liberar_hueco'; bloqueo_id: string; resumen: string }
  | {
      tipo: 'cambiar_config';
      negocio_id: string; clave: string; label: string;
      valor: boolean | number | string; valor_actual: boolean | number | string | null;
      resumen: string;
    }
  // --- Catalogo curado de config (Sesion 3 V2) ---
  | {
      tipo: 'cambiar_config_multiple';
      negocio_id: string;
      cambios: { clave: string; label: string; valor: boolean | number | string; valor_actual: boolean | number | string | null }[];
      resumen: string;
    }
  | { tipo: 'cambiar_idioma_portal'; negocio_id: string; idioma: string; idioma_actual: string | null; resumen: string }
  | { tipo: 'crear_cierre_negocio'; negocio_id: string; fecha: string; motivo: string | null; resumen: string }
  // --- Acciones de gestion (Sesion 3) ---
  | { tipo: 'confirmar_citas'; negocio_id: string; citas: { id: string; label: string }[]; resumen: string }
  // Reenviar el recordatorio a las citas que el CLIENTE aun no ha confirmado
  // (resetea confirmacion_enviada/recordatorio_enviado -> el motor n8n reavisa).
  | { tipo: 'reenviar_confirmacion'; negocio_id: string; citas: { id: string; label: string }[]; resumen: string }
  | {
      tipo: 'editar_servicio';
      negocio_id: string; servicio_id: string; servicio_nombre: string;
      cambios: {
        precio?: number; nombre?: string; duracion_activa_min?: number; activo?: boolean;
        prepago_requerido?: boolean; prepago_cantidad_fija?: number;
      };
      resumen: string;
    }
  | {
      // S22: Macros
      tipo: 'aprobar_macro';
      negocio_id: string; macro_id: string; nombre: string; descripcion: string;
      resumen: string;
    }
  | {
      // Crea un servicio nuevo (Sesion 3 V2: "actua con minima info").
      tipo: 'crear_servicio';
      negocio_id: string; nombre: string; precio: number; duracion_activa_min: number;
      resumen: string;
    }
  | {
      tipo: 'editar_horario';
      negocio_id: string; profesional_id: string; profesional_nombre: string;
      dia_semana: number; hora_inicio: string; hora_fin: string; resumen: string;
    }
  | {
      tipo: 'crear_presupuesto';
      negocio_id: string; cliente_id: string | null; cliente_nombre: string | null;
      titulo: string | null; lineas: { nombre: string; precio_cents: number; cantidad: number }[];
      total_cents: number; resumen: string;
    }
  | {
      tipo: 'enviar_mensaje_bandeja';
      negocio_id: string; conversacion_id: string; contacto_nombre: string | null;
      cuerpo: string; resumen: string;
    }
  // --- Recuperacion de fuga (Sesion 7) ---
  | {
      tipo: 'recuperar_cliente';
      negocio_id: string; cliente_id: string; cliente_nombre: string | null;
      dias_sin_venir: number; resumen: string;
    }
  | {
      tipo: 'avisar_lista_espera_match';
      negocio_id: string;
      lista_espera_id: string;
      cita_origen_id: string;
      cliente_nombre: string;
      servicio_nombre: string;
      profesional_nombre: string;
      inicio: string;
      fidelidad_citas: number;
      resumen: string;
    }
  | {
      tipo: 'optimizar_agenda';
      negocio_id: string;
      fecha: string;
      movimientos: { cita_id: string; nuevo_inicio: string; nuevo_fin: string; cliente_nombre: string }[];
      resumen: string;
    }
  | {
      tipo: 'bulk_editar_horarios';
      negocio_id: string;
      dia: string;
      dia_semana: number;
      hora_inicio: string;
      hora_fin: string;
      profesionales: { id: string; nombre: string }[];
      resumen: string;
    }
  | {
      tipo: 'bulk_editar_comisiones';
      negocio_id: string;
      comision_pct: number;
      profesionales: { id: string; nombre: string }[];
      resumen: string;
    };

// ---------------------------------------------------------------------------
// Bloques tipados (deben coincidir con lib/chispaBloques.ts en el cliente).
// El union se deja extensible: listas, etc. pueden llegar en sesiones futuras.
// ---------------------------------------------------------------------------
type ChispaUnidad = 'eur' | 'citas' | 'pct';

// Bloques de entrada (Sesion 1 V2 del plan): formulario/opciones/progreso.
// Desde la Sesion 3 V2 este edge SI los emite: cuando construirPropuesta /
// construirPropuestaConfig detectan que falta o es ambiguo un dato requerido,
// devuelven un 'formulario'/'opciones' PRE-RELLENADO en vez de un texto
// pidiendolo (ver PropuestaResultado / 'pedirInfo' mas abajo).
type CampoFormularioTipo = 'texto' | 'numero' | 'euro' | 'tel' | 'hora' | 'fecha' | 'select';
type CampoFormulario = {
  key: string;
  label: string;
  tipo: CampoFormularioTipo;
  opciones?: { valor: string; label: string }[];
  valor?: string | number;
  requerido?: boolean;
};

type Bloque =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'enlace'; ruta: string; label: string; descripcion?: string }
  | { tipo: 'accion'; accion: AccionPropuesta }
  | { tipo: 'grafica'; titulo: string; unidad: ChispaUnidad; serie: { fecha: string; valor: number }[] }
  | {
      tipo: 'comparativa';
      titulo: string;
      unidad: ChispaUnidad;
      actual: { label: string; valor: number };
      anterior: { label: string; valor: number };
    }
  | { tipo: 'formulario'; id: string; titulo: string; campos: CampoFormulario[]; enviarLabel?: string }
  | {
      tipo: 'opciones';
      id: string;
      titulo?: string;
      opciones: { valor: string; label: string; descripcion?: string }[];
      multiple?: boolean;
    }
  | { tipo: 'progreso'; paso: number; total: number; etiqueta?: string }
  | { tipo: 'timeline'; titulo: string; eventos: { id: string; fecha: string; titulo: string; descripcion: string; icono?: string; color?: string }[] }
  // S19 (libreria de datos): cifras SIEMPRE server-side. El edge ya SI las emite
  // (S21 panel de gestion). Espejo de lib/chispaBloques.ts en el cliente.
  | {
      tipo: 'kpi';
      titulo?: string;
      tarjetas: { label: string; valor: number; unidad: ChispaUnidad; deltaPct?: number; nota?: string }[];
    }
  | { tipo: 'barras'; titulo: string; unidad: ChispaUnidad; datos: { etiqueta: string; valor: number }[] }
  | {
      tipo: 'tabla';
      titulo?: string;
      columnas: { key: string; label: string; alinear?: 'izq' | 'der'; unidad?: ChispaUnidad }[];
      filas: Record<string, string | number>[];
      total?: Record<string, string | number>;
    };

// S19: Descriptor neutral de un resultado de datos para emitir directamente kpi/barras/tabla
export type DatoRespuesta =
  | { clase: 'cifra'; titulo?: string; label: string; valor: number; unidad: ChispaUnidad; deltaPct?: number; nota?: string }
  | { clase: 'cifras'; titulo?: string; tarjetas: { label: string; valor: number; unidad: ChispaUnidad; deltaPct?: number; nota?: string }[] }
  | { clase: 'reparto'; titulo: string; unidad: ChispaUnidad; datos: { etiqueta: string; valor: number }[] }
  | { clase: 'evolucion'; titulo: string; unidad: ChispaUnidad; serie: { fecha: string; valor: number }[] }
  | { clase: 'comparativa'; titulo: string; unidad: ChispaUnidad; actual: { label: string; valor: number }; anterior: { label: string; valor: number } }
  | { clase: 'listado'; titulo?: string; columnas: { key: string; label: string; alinear?: 'izq' | 'der'; unidad?: ChispaUnidad }[]; filas: Record<string, string | number>[]; total?: Record<string, string | number> }
  | { clase: 'cronologia'; titulo: string; eventos: { id: string; fecha: string; titulo: string; descripcion: string; icono?: string; color?: string }[] };

// Convierte un descriptor de datos en el mejor bloque visual (espejo de lib/chispaFormato.ts).
export function elegirFormatoDato(d: DatoRespuesta): Bloque {
  switch (d.clase) {
    case 'cifra':
      return { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: d.label, valor: d.valor, unidad: d.unidad, deltaPct: d.deltaPct, nota: d.nota }] };
    case 'cifras':
      return { tipo: 'kpi', titulo: d.titulo, tarjetas: d.tarjetas };
    case 'reparto': {
      if (d.datos.length <= 1) {
        const uno = d.datos[0];
        return uno
          ? { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: uno.etiqueta, valor: uno.valor, unidad: d.unidad }] }
          : { tipo: 'texto', texto: `${d.titulo}: sin datos en el periodo.` };
      }
      return { tipo: 'barras', titulo: d.titulo, unidad: d.unidad, datos: d.datos };
    }
    case 'evolucion': {
      if (d.serie.length <= 1) {
        const p = d.serie[0];
        return p
          ? { tipo: 'kpi', titulo: d.titulo, tarjetas: [{ label: d.titulo, valor: p.valor, unidad: d.unidad }] }
          : { tipo: 'texto', texto: `${d.titulo}: sin datos en el periodo.` };
      }
      return { tipo: 'grafica', titulo: d.titulo, unidad: d.unidad, serie: d.serie };
    }
    case 'comparativa':
      return { tipo: 'comparativa', titulo: d.titulo, unidad: d.unidad, actual: d.actual, anterior: d.anterior };
    case 'listado':
      return { tipo: 'tabla', titulo: d.titulo, columnas: d.columnas, filas: d.filas, total: d.total };
    case 'cronologia':
      return { tipo: 'timeline', titulo: d.titulo, eventos: d.eventos };
  }
}


// Allowlist de rutas para bloques 'enlace' (espejo de CHISPA_RUTAS del cliente).
// El LLM elige una CLAVE; el edge valida y adjunta la ruta/label real.
const RUTAS: Record<string, { ruta: string; label: string }> = {
  agenda: { ruta: '/(tabs)', label: 'Ir a la agenda' },
  clientes: { ruta: '/(tabs)/clientes', label: 'Ver clientes' },
  caja: { ruta: '/(tabs)/caja', label: 'Ir a Caja' },
  informes: { ruta: '/(tabs)/informes', label: 'Ver informes' },
  equipo: { ruta: '/(tabs)/equipo', label: 'Ir a Equipo' },
  configuracion: { ruta: '/(tabs)/configuracion', label: 'Abrir Configuracion' },
  'lista-espera': { ruta: '/(tabs)/lista-espera', label: 'Ver lista de espera' },
  presupuestos: { ruta: '/(tabs)/presupuestos', label: 'Ver presupuestos' },
  resenas: { ruta: '/(tabs)/resenas', label: 'Ver resenas' },
  bandeja: { ruta: '/(tabs)/bandeja', label: 'Abrir bandeja' },
  inventario: { ruta: '/(tabs)/inventario', label: 'Ver inventario' },
  'mi-jornada': { ruta: '/(tabs)/mi-jornada', label: 'Ver Mi Jornada' },
};

// ---------------------------------------------------------------------------
// Definicion de tools
// ---------------------------------------------------------------------------
const TOOLS = [
  // --- LECTURA ---
  {
    name: 'info_catalogo',
    description: 'Servicios (con duraciones y precio) y profesionales activos del salon.',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'buscar_cliente',
    description: 'Busca clientes por nombre o telefono. Devuelve candidatos para resolver cliente_id.',
    parameters: {
      type: 'object' as const,
      properties: { texto: { type: 'string', description: 'Nombre o telefono parcial' } },
      required: ['texto'],
    },
  },
  // --- S11: Busqueda temporal y recuerdos ---
  {
    name: 'buscar_recuerdos',
    description: 'Audita el registro universal (eventos_negocio) para responder sobre el PASADO. DEBES usarla, no respondas de memoria, cuando pregunten "¿que paso hace X tiempo?", "¿que hicimos en marzo?" o cuando pregunten por que aparecio o cuando se ejecuto una funcion de IA (ej. "¿por que me salio este upsell?", "¿cuando se analizo mi dia?", "¿que me recomendo la IA?"): las ejecuciones de los helpers visuales se guardan aqui con su motivo y resultado. Si no indican fechas, deja desde/hasta vacios (por defecto busca los ultimos 30 dias).',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hace 30 dias)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hoy)' },
        entidad_o_tema: { type: 'string', description: 'Nombre de cliente, profesional, o tema a buscar (opcional)' }
      },
    },
  },
  {
    name: 'ficha_cliente',
    description: 'Ficha 360 de UNA clienta: ultimas citas (fecha/servicio/estado/importe), gasto acumulado, frecuencia, ticket medio, etiquetas no sensibles y riesgo de no-show. Usala cuando el usuario pida "cuentame de X", "que sabes de X", "ficha de X". Devuelve tiene_notas_salud=true SIN contenido si hay notas de salud: en ese caso NUNCA inventes ni deduzcas la salud, di que hay notas en su ficha para revisarlas alli. Si la clienta no aparece puede que no exista o que no haya dado su consentimiento para la IA.',
    parameters: {
      type: 'object' as const,
      properties: {
        texto: { type: 'string', description: 'Nombre o telefono de la clienta' },
        id: { type: 'string', description: 'UUID de la clienta si ya lo tienes (opcional)' },
      },
    },
  },
  {
    name: 'listar_clientes',
    description: 'Lista y SEGMENTA la cartera de clientes del salon (para "que clientes tengo", "ensename mis clientes", "clientes VIP", "quien lleva tiempo sin venir", "clientes en riesgo", "los nuevos"). Devuelve un panel con KPIs (total de la cartera, listados, sin consentimiento IA) y una tabla (nombre, ultima visita, visitas, gasto, riesgo). NO trae datos de salud. Para cumpleanos usa consultar_cumpleanos. Para UNA clienta concreta usa ficha_cliente.',
    parameters: {
      type: 'object' as const,
      properties: {
        segmento: { type: 'string', description: 'todos | vip | recurrentes | nuevos | en_riesgo | fuga | inactivos (por defecto todos)' },
        orden: { type: 'string', description: 'reciente | gasto | frecuencia | alfabetico (por defecto reciente)' },
        limite: { type: 'string', description: 'Cuantos mostrar (por defecto 20, maximo 50)' },
      },
    },
  },
  {
    name: 'listar_citas',
    description: 'Citas en un rango de fechas. Filtra por profesional, cliente o estado.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusivo)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusivo, default = desde)' },
        profesional: { type: 'string', description: 'Nombre parcial del profesional' },
        cliente: { type: 'string', description: 'Nombre parcial del cliente' },
        estado: { type: 'string', description: 'confirmada | cancelada | ...' },
      },
      required: ['desde'],
    },
  },
  {
    name: 'consultar_disponibilidad',
    description: 'Citas y bloqueos de un dia. Permite al LLM razonar sobre huecos libres.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        profesional: { type: 'string', description: 'Nombre parcial del profesional (opcional)' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'resumen_informes',
    description: 'Resumen agregado de informes del salon en un rango de fechas: numero de citas por estado e ingresos cobrados (aproximado). Solo disponible para direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusivo)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusivo, default = desde)' },
      },
      required: ['desde'],
    },
  },
  // --- Omnisciencia/analitica (Sesion 6): lecturas agregadas adicionales ---
  {
    name: 'resumen_caja',
    description: 'Dinero REALMENTE cobrado (libro de caja) en un rango de fechas: total, desglose por efectivo/datafono y propinas, y numero de cobros. Usalo para "cuanto llevo hoy/esta semana/este mes". Solo disponible para direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusivo)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusivo, default = desde)' },
      },
      required: ['desde'],
    },
  },
  {
    name: 'ocupacion',
    description: 'Ocupacion del salon en un rango de fechas: citas totales, profesionales activos, promedio de citas por profesional y desglose por profesional. Solo disponible para direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusivo)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusivo, default = desde)' },
      },
      required: ['desde'],
    },
  },
  {
    name: 'metas_progreso',
    description: 'Progreso de los objetivos mensuales (Equipo > Objetivos): si el usuario es direccion/propietario, los del equipo completo; si es profesional, los suyos propios. Si nadie ha fijado objetivos, lo indica.',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'citas_hoy',
    description: 'Resumen de la agenda de hoy (o de la fecha indicada): total de citas, desglose por estado y la proxima cita (hora, servicio, profesional). Si el usuario es profesional, solo su propia agenda.',
    parameters: {
      type: 'object' as const,
      properties: { fecha: { type: 'string', description: 'YYYY-MM-DD, por defecto hoy' } },
    },
  },
  {
    name: 'mostrar_grafica',
    description: 'Anade a la respuesta una GRAFICA real con datos calculados (nunca inventados) de ingresos o numero de citas, dia a dia, en un rango. Usala cuando el usuario pida ver la evolucion/tendencia de una metrica o un resumen visual de un periodo (p.ej. "resumeme el mes", "como va la semana"). Solo disponible para direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        metrica: { type: 'string', description: 'ingresos | citas' },
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (rango razonable, maximo ~3 meses)' },
      },
      required: ['metrica', 'desde', 'hasta'],
    },
  },
  {
    name: 'mostrar_comparativa',
    description: 'Anade a la respuesta una COMPARATIVA real entre el periodo actual y el periodo anterior equivalente (ultimos 7 dias vs los 7 anteriores, o ultimos 30 dias vs los 30 anteriores) de ingresos o numero de citas. Solo disponible para direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        metrica: { type: 'string', description: 'ingresos | citas' },
        periodo: { type: 'string', description: 'semana | mes' },
      },
      required: ['metrica', 'periodo'],
    },
  },
  // --- GESTION DE ALTO NIVEL (Sesion 21): panel accionable que orquesta varias areas ---
  {
    name: 'resumen_gestion',
    description: 'Panel de gestion de alto nivel para direccion/propietario: encadena lecturas de varias areas (agenda, caja, clientes, escaneo proactivo) y devuelve un resumen VISUAL con acciones de un clic. Usala cuando el usuario quiera "llevar el salon" de un vistazo: "analiza mi salon" / "como esta todo" / "dame el panorama" / "vision general" -> foco panorama; "cierra el dia" / "haz el cierre" / "como ha ido hoy" -> foco cierre_dia; "prepara la semana" / "como viene la semana" -> foco preparar_semana; "revisa lo urgente" / "que tengo pendiente" / "que es lo mas importante" -> foco urgente. No ejecuta nada: cada accion del panel se propone y el usuario confirma. Solo direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        foco: { type: 'string', description: 'panorama | cierre_dia | preparar_semana | urgente' },
      },
      required: ['foco'],
    },
  },
  // --- MACROS EN VIVO (S22) ---
  {
    name: 'proponer_macro',
    description: 'Propone crear una macro (tool declarativa) que encadena multiples tools existentes para resolver peticiones complejas o recurrentes. Usala si ves que una misma operacion de varios pasos se repite, o si el usuario pide automatizar/definir un reporte que usa varias tools de lectura. Se guardara en estado "revision" y no se activara hasta que el propietario la apruebe. Nunca inventes nombres de tools que no existen; solo puedes usar las de lectura/orquestacion.',
    parameters: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre tecnico en snake_case (ej. auditoria_matutina)' },
        descripcion: { type: 'string', description: 'Descripcion clara de que hace la macro' },
        pasos: {
          type: 'array',
          description: 'Llamadas a tools existentes a ejecutar en secuencia.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre de la tool existente' },
              args_mapping: { type: 'object', description: 'Argumentos para esta tool, tal como los pide su definicion original' }
            },
            required: ['name']
          }
        }
      },
      required: ['nombre', 'descripcion', 'pasos']
    }
  },
  // --- ESCRITURA (el LLM las invoca; la funcion NO las ejecuta) ---
  {
    name: 'crear_cita',
    description: 'Propone crear una cita. Antes de invocarla resuelve cliente y profesional con las tools de lectura. Llama a esta tool aunque falte el servicio, el profesional o la hora: deja esos campos vacios y el sistema los pedira con un formulario/opciones (no preguntes tu estos datos en texto).',
    parameters: {
      type: 'object' as const,
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio (vacio si no se ha dicho)' },
        profesional: { type: 'string', description: 'Nombre del profesional (vacio si no se ha dicho)' },
        inicio: { type: 'string', description: 'ISO 8601 YYYY-MM-DDTHH:mm o lenguaje natural resuelto (vacio si no se ha dicho)' },
        cliente: { type: 'string', description: 'Nombre o telefono del cliente (opcional para walk-in)' },
      },
    },
  },
  {
    name: 'reagendar_cita',
    description: 'Propone mover una cita existente a otra hora y/o profesional.',
    parameters: {
      type: 'object' as const,
      properties: {
        cita_id: { type: 'string', description: 'UUID de la cita' },
        nuevo_inicio: { type: 'string', description: 'Nueva hora de inicio ISO 8601' },
        nuevo_profesional: { type: 'string', description: 'Nuevo profesional (opcional)' },
      },
      required: ['cita_id', 'nuevo_inicio'],
    },
  },
  {
    name: 'cancelar_cita',
    description: 'Propone cancelar una cita.',
    parameters: {
      type: 'object' as const,
      properties: {
        cita_id: { type: 'string', description: 'UUID de la cita' },
        motivo: { type: 'string' },
      },
      required: ['cita_id'],
    },
  },
  {
    name: 'bloquear_hueco',
    description: 'Propone bloquear una franja de tiempo de un profesional.',
    parameters: {
      type: 'object' as const,
      properties: {
        profesional: { type: 'string', description: 'Nombre del profesional' },
        inicio: { type: 'string', description: 'ISO 8601' },
        fin: { type: 'string', description: 'ISO 8601' },
        motivo: { type: 'string' },
      },
      required: ['profesional', 'inicio', 'fin'],
    },
  },
  {
    name: 'liberar_hueco',
    description: 'Propone eliminar un bloqueo existente.',
    parameters: {
      type: 'object' as const,
      properties: { bloqueo_id: { type: 'string', description: 'UUID del bloqueo' } },
      required: ['bloqueo_id'],
    },
  },
  {
    name: 'cambiar_config',
    description: 'Propone cambiar uno o VARIOS ajustes de la configuracion del salon (SOLO propietario). Usa la CLAVE exacta de la lista AJUSTES EDITABLES del system prompt. Si el usuario pide cambiar varios ajustes RELACIONADOS en la misma frase (p.ej. "activa el recordatorio con 48h de antelacion" = notifRecordatorioActiva + notifRecordatorioHoras), pasalos TODOS juntos en el mismo array "cambios" para que se confirmen de una vez. Si falta el valor de algun ajuste, llama a la tool igual: el sistema pedira lo que falte con un formulario.',
    parameters: {
      type: 'object' as const,
      properties: {
        cambios: {
          type: 'array',
          description: 'Lista de ajustes a cambiar',
          items: {
            type: 'object',
            properties: {
              clave: { type: 'string', description: 'Clave exacta del ajuste (de la lista AJUSTES EDITABLES)' },
              valor: { type: 'string', description: 'Nuevo valor: activar/desactivar, un numero, una hora HH:MM, o una opcion del enum. Dejalo vacio si no lo sabes.' },
            },
            required: ['clave'],
          },
        },
      },
      required: ['cambios'],
    },
  },
  {
    name: 'crear_servicio',
    description: 'Propone crear un servicio NUEVO en el catalogo (nombre, precio en euros, duracion en minutos). Llama a esta tool en cuanto el usuario pida crear un servicio, aunque no te haya dado todos los datos todavia: deja vacio lo que no sepas y el sistema lo pedira con un formulario. No la uses para editar uno que ya existe (usa editar_servicio).',
    parameters: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del servicio nuevo' },
        precio: { type: 'string', description: 'Precio en euros (ej. "15" o "15.50")' },
        duracion_activa_min: { type: 'string', description: 'Duracion activa en minutos' },
      },
    },
  },
  // --- GESTION (Sesion 3): la funcion NO ejecuta; devuelve accion_propuesta ---
  {
    name: 'confirmar_citas',
    description: 'Propone confirmar EN BLOQUE las citas pendientes. Si no se pasa fecha, se proponen todas las pendientes desde hoy. Permite excluir clientes específicos.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'Dia a confirmar en YYYY-MM-DD (opcional; si se omite, se confirman todas las pendientes desde hoy)' },
        profesional: { type: 'string', description: 'Opcional: limitar a un profesional (nombre parcial)' },
        excluir_clientes: {
          type: 'array',
          description: 'Nombres de clientes a excluir de la confirmacion (opcional, ej. ["Juan Carlos", "Nuria"])',
          items: { type: 'string' }
        }
      },
    },
  },
  {
    name: 'reenviar_confirmacion',
    description: 'Propone REENVIAR el recordatorio a las citas que el salon ya confirmo pero que el CLIENTE aun no ha confirmado (distinto de confirmar_citas, que confirma las PENDIENTES del equipo). Por defecto las de las proximas 48h. Resetea el aviso para que el cliente reciba de nuevo la confirmacion; el envio real de WhatsApp lo hace el motor del salon.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'Dia concreto YYYY-MM-DD (opcional; por defecto las proximas 48h)' },
        profesional: { type: 'string', description: 'Opcional: limitar a un profesional (nombre parcial)' },
      },
    },
  },
  {
    name: 'editar_servicio',
    description: 'Propone cambiar datos de un servicio del catalogo: precio (en euros), nombre, duracion activa (min), activarlo/desactivarlo, o su senal/deposito (activarla y su cantidad fija en euros). Indica solo lo que cambia. Llama a esta tool aunque no sepas el nombre exacto del servicio o no indiques ningun cambio todavia: el sistema te dejara elegir el servicio y/o pedira que cambiar con un formulario.',
    parameters: {
      type: 'object' as const,
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio a editar (puede ir vacio si no lo sabes)' },
        precio: { type: 'string', description: 'Nuevo precio en euros (ej. "15" o "15.50")' },
        nombre: { type: 'string', description: 'Nuevo nombre del servicio' },
        duracion_activa_min: { type: 'string', description: 'Nueva duracion activa en minutos' },
        activo: { type: 'string', description: 'activar o desactivar' },
        senal_activa: { type: 'string', description: 'activar o desactivar la senal/deposito de este servicio' },
        senal_importe: { type: 'string', description: 'Cantidad fija de la senal en euros (ej. "10")' },
      },
    },
  },
  {
    name: 'editar_horario',
    description: 'Propone fijar el turno de un profesional en un dia de la semana (reemplaza lo que hubiera ese dia por un unico turno inicio-fin). Para turnos partidos, avisa de que se hara en la pantalla Equipo.',
    parameters: {
      type: 'object' as const,
      properties: {
        profesional: { type: 'string', description: 'Nombre del profesional' },
        dia: { type: 'string', description: 'Dia de la semana: lunes..domingo' },
        hora_inicio: { type: 'string', description: 'Hora de entrada HH:MM' },
        hora_fin: { type: 'string', description: 'Hora de salida HH:MM' },
      },
      required: ['profesional', 'dia', 'hora_inicio', 'hora_fin'],
    },
  },
  {
    name: 'crear_presupuesto',
    description: 'Propone crear un presupuesto (borrador) a partir de una descripcion. Usa los precios REALES del catalogo (info_catalogo); no inventes precios. Si un concepto no esta en el catalogo, pide el precio.',
    parameters: {
      type: 'object' as const,
      properties: {
        cliente: { type: 'string', description: 'Nombre o telefono del cliente (opcional)' },
        titulo: { type: 'string', description: 'Titulo del presupuesto (opcional)' },
        lineas: {
          type: 'array',
          description: 'Lineas del presupuesto',
          items: {
            type: 'object',
            properties: {
              concepto: { type: 'string', description: 'Nombre del concepto/servicio' },
              precio: { type: 'string', description: 'Precio unitario en euros (si no se da, se toma del catalogo por nombre)' },
              cantidad: { type: 'string', description: 'Cantidad (default 1)' },
            },
            required: ['concepto'],
          },
        },
      },
      required: ['lineas'],
    },
  },
  {
    name: 'enviar_mensaje_bandeja',
    description: 'Propone GUARDAR un mensaje del salon en el hilo de la Bandeja de un cliente (registro). OJO: no envia el WhatsApp real (eso lo gestiona el equipo); solo deja el borrador registrado. Requiere que ya exista un hilo con ese cliente en la Bandeja.',
    parameters: {
      type: 'object' as const,
      properties: {
        cliente: { type: 'string', description: 'Nombre o telefono del cliente' },
        cuerpo: { type: 'string', description: 'Texto del mensaje' },
      },
      required: ['cliente', 'cuerpo'],
    },
  },
  {
    name: 'recuperar_cliente',
    description: 'Propone lanzar una PROPUESTA DE VUELTA a una clienta que lleva tiempo sin venir (en riesgo de fuga). Deja el registro/borrador para el equipo; el envio real por WhatsApp lo gestiona el equipo, tu no lo mandas. Usalo cuando el usuario quiera recuperar/reenganchar a una clienta concreta.',
    parameters: {
      type: 'object' as const,
      properties: {
        cliente: { type: 'string', description: 'Nombre o telefono de la clienta a recuperar' },
      },
      required: ['cliente'],
    },
  },
  {
    name: 'cambiar_idioma_portal',
    description: 'Propone cambiar el idioma del PORTAL PUBLICO de reserva online (lo que ven las clientes en /r/tu-salon). NO es el idioma de la interfaz del software (ese no lo puede cambiar Chispa). Llama a esta tool aunque no sepas el idioma exacto: el sistema ofrecera las opciones disponibles.',
    parameters: {
      type: 'object' as const,
      properties: {
        idioma: { type: 'string', description: 'Idioma del portal: es (espanol) o en (ingles)' },
      },
    },
  },
  {
    name: 'anadir_cierre_negocio',
    description: 'Propone marcar un dia completo como festivo/cierre de TODO el salon (vacaciones, festivo local, dia suelto): la agenda lo pinta cerrado y el portal no ofrece huecos ese dia. Llama a esta tool aunque no sepas la fecha exacta todavia: el sistema la pedira con un formulario.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'Fecha del cierre en YYYY-MM-DD (resuelve "el 25 de diciembre", "el proximo lunes"...)' },
        motivo: { type: 'string', description: 'Motivo opcional (ej. "Festivo local", "Vacaciones")' },
      },
    },
  },
  // --- LISTA DE ESPERA (Sesion 8-B) ---
  {
    name: 'avisar_lista_espera',
    description: 'Tras cancelar una cita, busca la mejor candidata en la lista de espera y propone avisarle por WhatsApp (la IA no envia nada, solo deja el registro). Chispa puede sugerirlo automaticamente tras una cancelacion si el usuario lo menciona. Devuelve la candidata con su prioridad, fidelidad y datos del hueco.',
    parameters: {
      type: 'object' as const,
      properties: { cita_id: { type: 'string', description: 'UUID de la cita que se acaba de cancelar' } },
      required: ['cita_id'],
    },
  },
  // --- MODO TETRIS (OPTIMIZACION DE AGENDA) ---
  {
    name: 'optimizar_agenda',
    description: 'Propone reorganizar en bloque varias citas de un dia para compactar huecos muertos (Modo Tetris). El profesional revisara y confirmara los movimientos propuestos. Antes debes leer la disponibilidad y decidir que citas encajan.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        movimientos: {
          type: 'array',
          description: 'Lista de citas a desplazar para eliminar los huecos muertos.',
          items: {
            type: 'object',
            properties: {
              cita_id: { type: 'string' },
              nuevo_inicio: { type: 'string', description: 'ISO 8601' },
              nuevo_fin: { type: 'string', description: 'ISO 8601' },
              cliente_nombre: { type: 'string' },
            },
            required: ['cita_id', 'nuevo_inicio', 'nuevo_fin', 'cliente_nombre'],
          },
        },
      },
      required: ['fecha', 'movimientos'],
    },
  },
  // --- NAVEGACION (no escribe nada; anade un chip que lleva a otra pantalla) ---
  {
    name: 'sugerir_enlace',
    description: 'Anade un chip de navegacion a otra pantalla del software cuando sea util (p.ej. tras hablar de clientes, ofrecer ir a Clientes). No modifica nada. Usa una CLAVE de destino exacta de la lista.',
    parameters: {
      type: 'object' as const,
      properties: {
        destino: {
          type: 'string',
          description: 'Clave del destino: ' + Object.keys(RUTAS).join(', '),
        },
        descripcion: { type: 'string', description: 'Texto breve opcional que acompana al chip' },
      },
      required: ['destino'],
    },
  },
  {
    name: 'guardar_recuerdo',
    description: 'Guarda un hecho aprendido sobre el negocio, el usuario, o un CLIENTE específico en la memoria a largo plazo. Úsalo cuando detectes una preferencia explícita (ej. "Suelo cerrar los lunes", "A María le gusta el café"). Sé conciso.',
    parameters: {
      type: 'object' as const,
      properties: {
        clave: { type: 'string', description: 'Identificador breve del hecho (ej. "cierre_habitual", "horario_preferido")' },
        valor: { type: 'string', description: 'El hecho a recordar en texto plano' },
        cliente_id: { type: 'string', description: 'ID del cliente si el hecho es sobre un cliente específico (opcional)' },
        confianza: { type: 'number', description: 'Nivel de confianza del hecho de 0.0 a 1.0 (default 1.0)' },
      },
      required: ['clave', 'valor'],
    },
  },
  {
    name: 'consultar_estado_pagos',
    description: 'Consulta el estado de facturacion, cobros y senales/depositos de las citas de una fecha. Úsalo para saber si un cliente ha pagado la señal de una cita, o si todas las citas de hoy han sido cobradas.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD de la consulta (por defecto hoy)' },
        profesional: { type: 'string', description: 'Nombre parcial del profesional (opcional)' }
      }
    }
  },
  {
    name: 'bulk_editar_horarios',
    description: 'Propone establecer en bloque el horario de uno o varios profesionales para un dia de la semana (ej. poner el mismo turno a todo el equipo el sabado, o copiar el horario de un profesional a otros).',
    parameters: {
      type: 'object' as const,
      properties: {
        profesionales: {
          type: 'array',
          description: 'Nombres de los profesionales a modificar. Usa ["todos"] para todo el equipo.',
          items: { type: 'string' }
        },
        dia: { type: 'string', description: 'Dia de la semana: lunes..domingo' },
        hora_inicio: { type: 'string', description: 'Hora de entrada HH:MM' },
        hora_fin: { type: 'string', description: 'Hora de salida HH:MM' }
      },
      required: ['profesionales', 'dia', 'hora_inicio', 'hora_fin']
    }
  },
  {
    name: 'bulk_editar_comisiones',
    description: 'Propone actualizar el porcentaje de comision por defecto de uno o varios profesionales.',
    parameters: {
      type: 'object' as const,
      properties: {
        profesionales: {
          type: 'array',
          description: 'Nombres de los profesionales a modificar. Usa ["todos"] para todo el equipo.',
          items: { type: 'string' }
        },
        comision_pct: { type: 'number', description: 'Nuevo porcentaje de comision (ej. 15.5)' }
      },
      required: ['profesionales', 'comision_pct']
    }
  },
  {
    name: 'consultar_fichajes',
    description: 'Consulta los fichajes de entrada (clock-in) y salida (clock-out) de los profesionales para una fecha.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD del dia a consultar (opcional; si se omite, se usa hoy)' }
      }
    }
  },
  {
    name: 'consultar_inventario',
    description: 'Consulta el inventario y stock de productos del salon. Permite buscar por nombre y filtrar alertas de stock bajo.',
    parameters: {
      type: 'object' as const,
      properties: {
        bajo_stock_only: { type: 'string', description: 'Opcional: "si" para mostrar solo productos que esten por debajo de su stock minimo' },
        texto: { type: 'string', description: 'Opcional: termino de busqueda para filtrar productos por nombre' }
      }
    }
  },
  {
    name: 'consultar_resenas',
    description: 'Consulta las reseñas de clientes recibidas en un rango de fechas. Permite filtrar solo reseñas negativas (puntuacion menor a 4).',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional; si se omite, se usa igual que desde)' },
        solo_negativas: { type: 'string', description: 'Opcional: "si" para filtrar solo resenas con puntuacion menor a 4 estrellas' }
      },
      required: ['desde']
    }
  },
  // --- LECTURA de negocio ampliada (V3, cobertura de tablas): todo son consultas
  // puras (svc + .eq('negocio_id')); ninguna escribe. Gating en permisos.ts. ---
  {
    name: 'consultar_campanas',
    description: 'Estado de las campanas de marketing (WhatsApp/correo): cuantas se han creado, en que estado estan (borrador/encolada/enviada) y cuantos destinatarios se han enviado o han fallado. Usala para "como van las campanas", "cuantos mensajes he mandado", "que campanas tengo". Solo direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto ultimos 90 dias)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hoy)' },
      },
    },
  },
  {
    name: 'consultar_cumpleanos',
    description: 'Proximos cumpleanos de clientas y si ya se les felicito. Usala para "quien cumple anos", "cumpleanos de esta semana/mes", "hemos felicitado a alguien". Devuelve nombre, fecha, descuento del detalle y estado del aviso (pendiente/enviado).',
    parameters: {
      type: 'object' as const,
      properties: {
        solo_pendientes: { type: 'string', description: 'Opcional: "si" para mostrar solo los que aun no se han felicitado' },
      },
    },
  },
  {
    name: 'consultar_lista_espera',
    description: 'Quien esta en la lista de espera de un hueco: clientas apuntadas, el servicio/profesional que quieren, su franja preferida, la prioridad y si ya se les aviso. Usala para "quien espera hueco", "mira la lista de espera", "a quien puedo avisar si se libera algo". Distinto de avisar_lista_espera (que propone el aviso tras una cancelacion): esta solo consulta.',
    parameters: {
      type: 'object' as const,
      properties: {
        estado: { type: 'string', description: 'Opcional: filtrar por estado (por defecto solo las activas/en espera)' },
        profesional: { type: 'string', description: 'Opcional: nombre parcial del profesional deseado' },
      },
    },
  },
  {
    name: 'consultar_intercambios_turno',
    description: 'Solicitudes de intercambio de turnos entre profesionales y su estado (pendiente de companero, pendiente de gestor, aceptado, rechazado). Usala para "hay cambios de turno pendientes", "quien ha pedido cambiar un turno", "que intercambios tengo que aprobar". Solo direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        estado: { type: 'string', description: 'Opcional: filtrar por estado (por defecto los que estan pendientes de resolver)' },
      },
    },
  },
  {
    name: 'consultar_comisiones_liquidadas',
    description: 'Comisiones calculadas y su estado de pago por profesional en un periodo: base de calculo, porcentaje aplicado, importe y si estan pendientes o pagadas. Usala para "cuanto debo en comisiones", "que comisiones ha generado X", "comisiones de este mes". Solo direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto ultimos 90 dias segun periodo_inicio)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hoy)' },
        profesional: { type: 'string', description: 'Opcional: nombre parcial del profesional' },
        solo_pendientes: { type: 'string', description: 'Opcional: "si" para mostrar solo las comisiones aun no pagadas' },
      },
    },
  },
  {
    name: 'consultar_logros',
    description: 'Programa de logros/gamificacion de clientas (Fidelizacion): que logros existen y cuantas clientas los han desbloqueado (dato agregado, sin nombres). Usala para "que logros tengo configurados", "cuantas clientas han conseguido X logro". No revela clientas concretas.',
    parameters: { type: 'object' as const, properties: {} },
  },
  {
    name: 'consultar_fidelizacion',
    description: 'Programa de fidelizacion del salon: niveles (con sus umbrales de visitas/gasto), recompensas disponibles y cuantas se han canjeado (agregado por estado). Usala para "como va la fidelizacion", "que recompensas tengo", "cuantos canjes ha habido". No revela clientas concretas.',
    parameters: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional; acota los canjes; por defecto ultimos 90 dias)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hoy)' },
      },
    },
  },
  {
    name: 'consultar_movimientos_inventario',
    description: 'Historial de entradas y salidas de stock (movimientos_inventario): que productos han entrado o salido, cuantas unidades, el motivo y cuando. Usala para "que movimientos de stock ha habido", "por que ha bajado el stock de X", "entradas de esta semana". Complementa a consultar_inventario (que da el stock actual).',
    parameters: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Opcional: nombre parcial del producto' },
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto ultimos 30 dias)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional; por defecto hoy)' },
      },
    },
  },
  {
    name: 'consultar_hallazgos',
    description: 'Alertas e insights generados por la vigilancia proactiva de la IA (hallazgos_ia): retrasos, citas sin confirmar, fallos de configuracion, clientas en fuga, etc., con su severidad y estado. Usala para "que ha detectado la IA", "que alertas tengo", "que es lo mas urgente". Solo direccion/propietario.',
    parameters: {
      type: 'object' as const,
      properties: {
        solo_pendientes: { type: 'string', description: 'Opcional: "si" (por defecto) para mostrar solo hallazgos abiertos; "no" para incluir los resueltos' },
        severidad: { type: 'string', description: 'Opcional: filtrar por severidad. Valores exactos: urgente | alta | media | baja (para "lo urgente" usa exactamente "urgente").' },
      },
    },
  },
];

// La deteccion de tools de escritura vive en permisos.ts (esEscritura): cubre
// agenda + gestion (Sesion 3) + config. Aqui no se duplica el set.

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const MAPA_CONFIG = `MAPA DE CONFIGURACION DEL SOFTWARE (ruta siempre: Configuracion > [Pestana] > [Seccion]). Guia al usuario con la ruta exacta y lo que puede ajustar; NO inventes ajustes que no esten aqui.

GRUPO NEGOCIO
- General: "Datos del negocio" (nombre del salon, moneda, zona horaria); "Identidad visual" (logo, tema claro/oscuro).
- Horarios: "Horario semanal" del salon por dias y franjas (con plantillas tipo "L-V con pausa"); "Slots y vista del calendario" (granularidad de los huecos, vista por defecto dia/semana/mes, primer dia de la semana); "Festivos y cierres del salon" (dias completos cerrados: festivo, vacaciones, dia suelto).

GRUPO OPERATIVA
- Servicios: catalogo de servicios (crear/editar/activar, precio, duraciones, precios y duraciones por profesional, variantes).
- Agenda: "Reservas y antelacion" (antelacion minima y maxima, permitir reservas el mismo dia, solapamiento de citas); "Confirmacion de citas" (automatica o manual, tiempo maximo sin confirmar, avisar al equipo); "Cierre de citas" (completar manual o automatico); "No-show y retrasos" (tiempo para marcar no-show, gracia de retraso, contador en la cita, recolocacion por retraso); "Tiempos muertos y reposo" (margen de seguridad, alerta de reposos simultaneos, aprovechar reposo en otra cliente); "Asistente de agenda (IA)" (activarlo, permitir que el profesional opere su propia agenda, nivel basico/normal/alto); "Bloqueos y descansos" (se crean en la pantalla de Equipo).
- Comisiones: "Comisiones por defecto" (porcentaje base, base de calculo bruto o sin IVA, incluir add-ons y propinas, periodo de liquidacion); "Mi jornada" (que importes y comision ve cada profesional de si mismo); "Bonus y excepciones" (bonus por venta de producto, por objetivo mensual, comision doble en servicios estrella).
- Plantillas: "Alergias frecuentes" (etiquetas rapidas al registrar alergias de un cliente), "Formulas guardadas" (presets de color/quimica para reutilizar en fichas tecnicas) y "Plantillas de notas e historial". NO sirve para editar el texto de los mensajes de WhatsApp.

GRUPO COMUNICACION
- Notificaciones: "Avisos automaticos al cliente" (activar/desactivar Confirmacion de cita, Recordatorio previo, Peticion de resena, Enlace de pago de senal, Aviso de retraso). OJO: el TEXTO de estos mensajes NO se puede editar; son plantillas fijas aprobadas por Meta y solo se rellenan los datos de cada cita. "Horario sin envios (no molestar)" (activar y franja horaria); "Lista de espera (avisos de hueco)" (ofrecer huecos automaticamente, ventana de respuesta, tiempo maximo de reserva del hueco, desde cuando cuenta el tope, antelacion minima del hueco, si la oferta pide senal, avisar si el hueco caduca); "Canal de envio" (hoy solo WhatsApp; SMS/email proximamente).
- Politicas: "Deposito dinamico por riesgo del cliente" (activar, multiplicador para clientes con no-shows, exencion VIP) YA disponible. Cancelacion y penalizacion por cancelacion tardia: proximamente (fase 4, junto con el modulo de pagos).
- Reserva online: "Portal publico" (activar, enlace de reserva, enlace de valoracion, idioma); "Datos publicos" (nombre, direccion, telefono, web); "Visibilidad" (mostrar precios, servicios visibles).
- Voz: "Voz de Chispa" (elegir con que voz neural lee Chispa sus respuestas por los altavoces, entre varias voces de distintos tonos y generos, con un boton para escuchar cada una). SI se puede cambiar la voz desde aqui; se aplica a todos los dispositivos del salon.

GRUPO CUENTA
- Invita y gana: programa de referidos y tu red de salones invitados.
- Accesos y roles: dar de alta CUENTAS de acceso (login) para el equipo y asignarles un rol (Propietario, Direccion, Recepcion, Profesional) con sus permisos. OJO: los PROFESIONALES que aparecen en la agenda y sus horarios se gestionan en la pantalla EQUIPO (fuera de Configuracion); crear una cuenta aqui no la anade sola a la agenda como profesional.
- Cuenta: tus datos (nombre, telefono), acceso y seguridad (email y contrasena), el negocio al que perteneces, plan y plazas.
- Soporte: contacto con el equipo de Mecha.`;

// Ajustes de negocio_config que el asistente puede CAMBIAR (solo propietario).
// Operativos; se excluyen identidad/cuenta/contrasena por seguridad.
type ConfigMeta = { label: string; tipo: 'bool' | 'num' | 'enum' | 'hora'; valores?: string[]; min?: number; max?: number };
const CONFIG_EDITABLE: Record<string, ConfigMeta> = {
  notifConfirmacionActiva: { label: 'Confirmacion de cita (aviso al cliente)', tipo: 'bool' },
  notifRecordatorioActiva: { label: 'Recordatorio previo', tipo: 'bool' },
  notifRecordatorioHoras: { label: 'Horas de antelacion del recordatorio', tipo: 'num', min: 1, max: 168 },
  notifResenaActiva: { label: 'Peticion de resena', tipo: 'bool' },
  notifSenalActiva: { label: 'Enlace de pago de senal', tipo: 'bool' },
  notifRetrasoActiva: { label: 'Aviso de retraso', tipo: 'bool' },
  notifNoMolestar: { label: 'Horario sin envios (no molestar)', tipo: 'bool' },
  notifNoMolestarInicio: { label: 'Inicio del horario sin envios', tipo: 'hora' },
  notifNoMolestarFin: { label: 'Fin del horario sin envios', tipo: 'hora' },
  antelacionGlobal: { label: 'Antelacion minima para reservar (min)', tipo: 'num', min: 0, max: 10080 },
  antelacionMax: { label: 'Antelacion maxima para reservar', tipo: 'num', min: 0 },
  permitirMismoDia: { label: 'Permitir reservas el mismo dia', tipo: 'bool' },
  solapamiento: { label: 'Solapamiento de citas', tipo: 'enum', valores: ['nunca', 'reposo', 'siempre'] },
  confirmacionModo: { label: 'Modo de confirmacion', tipo: 'enum', valores: ['auto', 'manual'] },
  confirmacionTimeout: { label: 'Tiempo maximo sin confirmar (min)', tipo: 'num', min: 0 },
  confirmacionNotificar: { label: 'Avisar al equipo en pendientes nuevas', tipo: 'bool' },
  noShowGrace: { label: 'Tiempo para marcar no-show (min)', tipo: 'num', min: 0 },
  retrasoGrace: { label: 'Tiempo de gracia para retraso (min)', tipo: 'num', min: 0 },
  contadorRetraso: { label: 'Mostrar contador de retraso en la cita', tipo: 'bool' },
  recolocarRetraso: { label: 'Recolocacion por retraso', tipo: 'bool' },
  completarManual: { label: 'Marcar citas completadas manualmente', tipo: 'bool' },
  reposoMargen: { label: 'Margen de seguridad para reposo (min)', tipo: 'num', min: 0 },
  alertaReposo: { label: 'Alertar en exceso de reposos simultaneos', tipo: 'bool' },
  alertaReposoUmbral: { label: 'Umbral de reposos simultaneos', tipo: 'num', min: 1 },
  aprovecharReposo: { label: 'Permitir aprovechar reposo en otra cliente', tipo: 'bool' },
  asistenteAgendaActivo: { label: 'Asistente de agenda (IA)', tipo: 'bool' },
  asistenteProfesionalEscribe: { label: 'Permitir que el profesional opere su propia agenda', tipo: 'bool' },
  asistenteEffort: { label: 'Nivel del asistente', tipo: 'enum', valores: ['low', 'medium', 'high'] },
  listaEsperaMatchingActivo: { label: 'Ofrecer huecos automaticamente (lista de espera)', tipo: 'bool' },
  listaEsperaVentanaMin: { label: 'Ventana de respuesta de la oferta (min)', tipo: 'num', min: 1 },
  listaEsperaMaxBloqueoHoras: { label: 'Tiempo maximo de reserva del hueco (horas)', tipo: 'num', min: 1 },
  listaEsperaAntelacionMinHoras: { label: 'Antelacion minima del hueco (horas)', tipo: 'num', min: 0 },
  listaEsperaDesbloqueoDesde: { label: 'Desde cuando cuenta el tope', tipo: 'enum', valores: ['primer_aviso', 'ultimo_aviso'] },
  listaEsperaOfertaPideSenal: { label: 'La oferta de hueco pide senal', tipo: 'bool' },
  listaEsperaAvisarCaducado: { label: 'Avisar si el hueco caduca', tipo: 'bool' },
  comisionBase: { label: 'Porcentaje base de comision', tipo: 'num', min: 0, max: 100 },
  comisionBaseImporte: { label: 'Base de calculo de comision', tipo: 'enum', valores: ['bruto', 'neto'] },
  comisionAddons: { label: 'Incluir add-ons en la comision', tipo: 'bool' },
  comisionPropinas: { label: 'Incluir propinas en la comision', tipo: 'bool' },
  comisionPeriodo: { label: 'Periodo de liquidacion', tipo: 'enum', valores: ['semanal', 'quincenal', 'mensual'] },
  slotInterval: { label: 'Granularidad de los huecos (min)', tipo: 'num', min: 5, max: 60 },
  defaultView: { label: 'Vista por defecto del calendario', tipo: 'enum', valores: ['dia', 'semana', 'mes'] },
  startOfWeek: { label: 'Primer dia de la semana', tipo: 'enum', valores: ['lun', 'dom'] },
  // Deposito dinamico por riesgo (Sesion 3 V2): ya vivia en negocio_config.config
  // (Configuracion > Politicas) pero Chispa no podia tocarlo todavia.
  depositoDinamicoActivo: { label: 'Deposito dinamico segun riesgo del cliente', tipo: 'bool' },
  depositoFactorRiesgo: { label: 'Multiplicador de senal para clientes con no-shows', tipo: 'num', min: 1, max: 5 },
  depositoVipExento: { label: 'Clientes VIP exentos de senal', tipo: 'bool' },
};

const CONFIG_EDITABLE_TEXT = 'AJUSTES EDITABLES (solo propietario). Para cambiar uno o varios, usa la tool cambiar_config con la(s) CLAVE(s) exacta(s) de esta lista:\n' +
  Object.entries(CONFIG_EDITABLE).map(([k, m]) => {
    const t = m.tipo === 'enum' ? `opciones: ${(m.valores || []).join('/')}` : m.tipo === 'bool' ? 'activar/desactivar' : m.tipo === 'hora' ? 'HH:MM' : 'numero';
    return `- ${k}: ${m.label} (${t})`;
  }).join('\n');

function coerceConfigValor(meta: ConfigMeta, valorRaw: string): { ok: true; valor: boolean | number | string } | { ok: false; error: string } {
  const v = String(valorRaw).trim().toLowerCase();
  if (meta.tipo === 'bool') {
    if (['true', 'si', 'sí', 'activar', 'activado', 'activa', 'on', '1'].includes(v)) return { ok: true, valor: true };
    if (['false', 'no', 'desactivar', 'desactivado', 'desactiva', 'off', '0'].includes(v)) return { ok: true, valor: false };
    return { ok: false, error: `Para "${meta.label}" indica activar o desactivar.` };
  }
  if (meta.tipo === 'num') {
    const n = Number(String(valorRaw).replace(',', '.').replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return { ok: false, error: `"${valorRaw}" no es un numero valido para "${meta.label}".` };
    if (meta.min != null && n < meta.min) return { ok: false, error: `El minimo de "${meta.label}" es ${meta.min}.` };
    if (meta.max != null && n > meta.max) return { ok: false, error: `El maximo de "${meta.label}" es ${meta.max}.` };
    return { ok: true, valor: n };
  }
  if (meta.tipo === 'enum') {
    const match = (meta.valores || []).find((x) => x.toLowerCase() === v);
    if (!match) return { ok: false, error: `Valor no valido para "${meta.label}". Opciones: ${(meta.valores || []).join(', ')}.` };
    return { ok: true, valor: match };
  }
  const m = String(valorRaw).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { ok: false, error: `Indica la hora en formato HH:MM para "${meta.label}".` };
  return { ok: true, valor: `${m[1].padStart(2, '0')}:${m[2]}` };
}

// Convierte un dia de la semana en lenguaje natural a numero (0=domingo..6=sabado,
// convencion Postgres extract(dow)). Devuelve null si no lo reconoce.
function parseDiaSemana(raw: string): number | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (/^[0-6]$/.test(v)) return Number(v);
  const map: Record<string, number> = {
    domingo: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    miercoles: 3, 'miércoles': 3, mie: 3, 'mié': 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    sabado: 6, 'sábado': 6, sab: 6, 'sáb': 6,
  };
  return v in map ? map[v] : null;
}

// Normaliza "9", "9:00", "09:5" a HH:MM valido, o null.
function normalizaHora(raw: string): string | null {
  const v = String(raw ?? '').trim();
  const m = v.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// --- S12: Catálogo inyectado dinámicamente (con pantalla para agrupar por página) ---
// Inyeccion COMPACTA (presupuesto de tokens): titulo + pantalla + descripcion.
// El "uso"/categoria detallados viven en el Hub IA y los manuales, no aqui.
const AUTOCONOCIMIENTO_IA = `AUTO-CONOCIMIENTO ECOSISTEMA IA:
Todas las IAs y helpers visuales de Mecha, con la pantalla donde viven (para listar "las IA de esta pagina"):
${CATALOGO_IA.map((f: { titulo: string; descripcion: string; ubicacion: string }) => `- ${f.titulo} [${f.ubicacion}]: ${f.descripcion}`).join('\n')}

CONSCIENCIA DEL ECOSISTEMA (S12): Tienes a tu disposicion el catalogo anterior.
- Si preguntan "que funciones de IA hay en esta pantalla / en Clientes / en la Agenda", enumera solo
  las cuyo campo pantalla coincide, con un chip sugerir_enlace a cada una.
- Si preguntan "por que aparecio esta sugerencia" / "que me recomendo la IA" / "cuando se ejecuto/analizo X",
  DEBES llamar PRIMERO a buscar_recuerdos para auditar la ejecucion real en el registro (no expliques solo
  desde el catalogo): luego explica su resultado y su MOTIVO (el porque) leidos del evento. Si no das fechas
  la tool busca los ultimos 30 dias. No inventes: si no hay evento, dilo con franqueza.
- No inventes funciones que no esten aqui. Para cada funcion relevante, ofrece un chip con sugerir_enlace.`;

// Marco de razonamiento universal (Sesion S02, plan V3). Gobierna COMO afronta
// Chispa cualquier peticion: una taxonomia de intencion, un procedimiento fijo
// por turno y la doctrina "casi nunca texto plano". Espejo legible por humanos:
// informes/plan-ia-chispa-v3/RAZONAMIENTO-UNIVERSAL.md. Va como PRIMERA
// instruccion del prompt para que rija sobre todas las demas.
const PROCEDIMIENTO_UNIVERSAL = `PROCEDIMIENTO UNIVERSAL (rige SIEMPRE, sobre todo lo demas). Ante cualquier mensaje sigue estos pasos y da SIEMPRE una salida util y visual, nunca un parrafo seco ni un "no te he entendido":
1) CLASIFICA la intencion en una de: accion (crear/mover/cancelar/cambiar algo) | consulta/analitica (datos, cifras, historial) | config (donde/como ajustar algo) | navegacion (llevame a una pantalla) | memoria/recuerdo (que hablamos, que paso hace tiempo) | charla/ayuda (que sabes hacer, saludos).
2) COMPRUEBA si tienes datos suficientes. Si falta algo, NO preguntes en texto ni de uno en uno: llama a la tool y deja que el sistema pida SOLO lo que falta con UN formulario/opciones pre-rellenado (regla de minima info).
3) ELIGE la mejor superficie de salida y usala: accion de un clic (tarjeta de propuesta) · grafica/comparativa (para cifras y evolucion) · opciones (para elegir) · enlace/navegacion (sugerir_enlace) · formulario (para recoger datos). El texto llano es el ULTIMO recurso.
4) PROPON, no ejecutes: tu nunca aplicas escrituras ni decides el orden; el usuario confirma en la tarjeta.
CASI NUNCA TEXTO PLANO: una cifra -> grafica/comparativa; una lista para elegir -> opciones; un dato que falta -> formulario; "ve a X"/"esto se configura en X" -> enlace con la ruta; una operacion -> tarjeta de accion. Ofrece SIEMPRE el siguiente paso accionable; no dejes al usuario con "¿y ahora que?".
SI NO RECONOCES LA INTENCION: no digas "no te he entendido"; ofrece las acciones mas probables (con sugerir_enlace o proponiendo lo mas util) como un menu accionable.
RESTRICCIONES (GUARDRAILS): Tienes estrictamente PROHIBIDO hablar de temas medicos o de SALUD. Si el usuario pregunta por salud, aborta con sugerir_enlace a soporte.`;

export function buildSystemPrompt(hoyISO: string, scope: 'all' | 'self' | 'none', puedeInformes: boolean, hechosMemoria: string = ''): string {
  const scopeMsg =
    scope === 'none'
      ? 'Este usuario SOLO puede consultar la agenda. Si pide operar (crear/mover/cancelar/bloquear), explica amablemente que no tiene permiso.'
      : scope === 'self'
      ? 'Este usuario (profesional) solo puede operar SU PROPIA agenda. No proponga escrituras sobre citas de otros profesionales.'
      : 'Este usuario puede consultar y operar la agenda de cualquier profesional del salon.';

  return [
    'Eres Chispa, la asistente de IA del software de gestion del salon (Mecha): gestionas la agenda Y guias al usuario sobre como usar y configurar el software. Operas en espanol, con tono breve, calido y profesional. Si te preguntan que eres, di con naturalidad que eres una IA que ayuda con la gestion del salon.',
    PROCEDIMIENTO_UNIVERSAL,
    hechosMemoria ? `HECHOS Y PREFERENCIAS APRENDIDAS (Memoria a largo plazo):\n${hechosMemoria}\nTen en cuenta obligatoriamente esta informacion al razonar y responder.` : '',
    'REGLA DE VOZ: Usa una ortografía impecable, con todas las tildes, signos de puntuación de apertura (¿, ¡) y comas necesarias, para que el sistema de voz Text-to-Speech te lea con naturalidad. Evita abreviaturas no pronunciables.',
    `Hoy es ${hoyISO} (zona Europe/Madrid). Resuelve referencias relativas ("manana", "las 5", "el lunes") a fecha/hora concreta en hora LOCAL de Madrid, en formato YYYY-MM-DDTHH:mm SIN sufijo de zona (no pongas Z ni offset).`,
    'No uses emojis en tus respuestas.',
    'ACTUA CON MINIMA INFO (REGLA ESTRICTA): para crear_cita, crear_servicio, editar_servicio, crear_presupuesto y cambiar_config, llama a la tool EN CUANTO identifiques la intencion, aunque falten datos: deja vacios/sin poner los campos que no sepas (NO los adivines ni los dejes de mandar por duda). Esta prohibido responder en texto plano pidiendo un dato que una de estas tools podria pedir por ti con un formulario: si dudas entre preguntar en texto o llamar a la tool con ese campo vacio, SIEMPRE llama a la tool. El sistema completara automaticamente lo que falte con un formulario o unas opciones para elegir, y al enviarlo se te reenviara la respuesta para que termines la propuesta. Esto incluye la AMBIGUEDAD: si el nombre de un servicio/profesional no es exacto o podria referirse a mas de uno (p.ej. "el corte" cuando hay "Corte caballero" y "Corte señora"), NO preguntes tu en texto cual es: llama a la tool igual con ese nombre tal cual lo dijo el usuario (aunque sepas por info_catalogo que hay varias coincidencias); el sistema le presentara las opciones exactas para elegir de un toque. Ejemplos: "sube las horas del recordatorio" sin decir el numero -> llama a cambiar_config con cambios:[{clave:"notifRecordatorioHoras"}] SIN poner "valor"; "activa la senal de 10 euros en el corte" (ambiguo) -> llama a editar_servicio con servicio:"corte", senal_activa:"activar", senal_importe:"10" IGUAL, sin preguntar antes cual de los dos es; "hazme un presupuesto con un tratamiento de keratina" (concepto que NO esta en el catalogo, sin precio) -> llama a crear_presupuesto con lineas:[{concepto:"tratamiento de keratina"}] SIN poner "precio", en vez de responder en texto pidiendolo tu. Si el usuario ya dio TODOS los datos sin ambiguedad en su misma frase, no hace falta nada mas: la tool devolvera directamente la tarjeta de confirmacion, sin formulario de por medio.',
    'AUTO-CONOCIMIENTO: si el usuario pregunta que sabes hacer, en que le puedes ayudar, o donde esta / como se usa una funcion de IA, responde desde la lista AUTO-CONOCIMIENTO del final: enumera de forma breve las funciones relevantes y ofrece un chip con sugerir_enlace a cada pantalla. No inventes funciones que no esten en esa lista.',
    'GUIA DE CONFIGURACION: si el usuario pregunta como o donde configurar/personalizar algo, o que se puede ajustar de una funcion, responde con el MAPA DE CONFIGURACION del final: da la RUTA exacta (Configuracion > Pestana > Seccion) y enumera que se puede ajustar ahi. Cinete ESTRICTAMENTE al mapa: no inventes ajustes, opciones, valores de ejemplo ni rutas que no esten escritos en el (por ejemplo, no anadas "cada 15/30 min" ni "SMS/email" si el mapa no lo dice). Si te preguntan por algo que no esta en el mapa, dilo con franqueza en vez de suponer.',
    'CAMBIAR CONFIGURACION (solo PROPIETARIO): si el propietario pide cambiar uno o VARIOS ajustes relacionados en la misma frase (por ejemplo "activa los recordatorios con 48h de antelacion" junta notifRecordatorioActiva + notifRecordatorioHoras, o "pon la antelacion minima en 4h" es solo uno), usa la tool cambiar_config con la lista "cambios" (una entrada clave+valor por ajuste, CLAVE exacta de la lista AJUSTES EDITABLES del final). Se propone y el usuario confirma; tu no lo aplicas. Si el usuario NO es propietario, no cambies nada: solo guialo a donde esta el ajuste.',
    'COMPOSICION DE TOOLS Y MACROS (S22): Si una peticion compleja no puede resolverse con una sola tool, desglosala y ejecuta secuencialmente multiples tools (ej: consultar caja y luego ocupacion). Si identificas que esta peticion multi-paso es util y recurrente, usa la tool "proponer_macro" para crear una automatizacion parametrizable que el propietario podra aprobar. Las macros aprobadas se inyectaran como tools dinamicas (identificadas con [MACRO DE CHISPA] en la descripcion); puedes llamarlas directamente como cualquier otra tool.',
    'Para consultar la agenda usa las tools de lectura (info_catalogo, buscar_cliente, listar_citas, consultar_disponibilidad, citas_hoy).',
    'CARTERA DE CLIENTES (lista y segmentos): si te preguntan "que clientes tengo", "cuantos clientes hay", "ensename mis clientes", "mis clientes VIP", "quien lleva tiempo sin venir", "clientes en riesgo", "los nuevos" o piden la lista/segmento, usa la tool listar_clientes con el segmento adecuado (todos|vip|recurrentes|nuevos|en_riesgo|fuga|inactivos) y el orden si lo piden (gasto|frecuencia|reciente|alfabetico). Devuelve KPIs + tabla; resume en 1 frase SIN inventar nombres ni cifras. NO deflectes con un menu ni preguntes cual quieren. Para UNA clienta concreta usa ficha_cliente; para cumpleanos, consultar_cumpleanos.',
    'Para responder sobre UNA clienta (su historial, cuanto gasta, cada cuanto viene, su etiquetas o su riesgo de no-show) usa ficha_cliente. REGLA DURA DE SALUD: nunca pidas, muestres ni deduzcas datos de salud, alergias, medicacion o notas medicas. Si ficha_cliente devuelve tiene_notas_salud=true, di UNICAMENTE que "hay notas en su ficha, revisalas alli" y ofrece un enlace a Clientes con sugerir_enlace; jamas inventes el contenido. Los datos de salud del cliente están completamente fuera del alcance del LLM (lo ves negro y no debes consultarlo). Si la ficha no aparece (encontrado=false), di con naturalidad que no la encuentras: puede que no exista o que no haya dado su consentimiento para que la IA use sus datos.',
    'Menciona el riesgo de no-show de una clienta solo si es relevante (p.ej. el usuario pregunta si es fiable, o hay una cita suya sin confirmar), y siempre en tono neutro y sin juzgar: es una senal operativa, no una etiqueta sobre la persona.',
    'Si el usuario quiere recuperar a una clienta que lleva tiempo sin venir, puedes proponer recuperar_cliente (deja el registro para que el equipo le mande la propuesta de vuelta; tu no envias nada).',
    'Para el progreso de objetivos/metas usa metas_progreso (del equipo si eres direccion/propietario, o los tuyos si eres profesional); si no hay ninguno fijado, dilo con naturalidad y sugiere fijarlo en Equipo.',
    'Para proponer operaciones de agenda usa las tools de escritura (crear_cita, reagendar_cita, cancelar_cita, bloquear_hueco, liberar_hueco).',
    'Tambien puedes proponer acciones de GESTION cuando tengas la tool disponible: confirmar_citas (confirmar en bloque las citas, opcionalmente filtrando excluidos con excluir_clientes), bulk_editar_horarios (fijar en bloque turnos de uno o varios profesionales), bulk_editar_comisiones (actualizar porcentaje de comision base de profesionales), crear_servicio (dar de alta un servicio nuevo en el catalogo), editar_servicio (cambiar precio/nombre/duracion/activar/senal-deposito de un servicio del catalogo YA existente), editar_horario (fijar el turno de un profesional un dia), crear_presupuesto (borrador con precios REALES del catalogo, nunca inventes precios), enviar_mensaje_bandeja (guardar un borrador en el hilo de la Bandeja del cliente; NO envia el WhatsApp real, eso lo hace el equipo), cambiar_idioma_portal (idioma del portal PUBLICO de reserva online: es/en; distinto del idioma de la interfaz del software, ese no lo puedes cambiar) y anadir_cierre_negocio (marcar un dia completo como festivo/cierre de TODO el salon). Si una tool no esta disponible para el rol de este usuario, no la menciones como algo que puedas hacer: guia a la pantalla correspondiente.',
    'GESTION EN BLOQUE Y CAMBIOS DE EQUIPO (V3+): Si el usuario te pide cambiar el horario de un profesional o aplicarlo a varios, o cambiar las comisiones de su equipo, utiliza bulk_editar_horarios o bulk_editar_comisiones en lugar de proponer cambios individuales. Si te dicen "copia el horario de X a Y", consulta primero la disponibilidad de X y luego llama a bulk_editar_horarios con el horario de X.',
    'ESTADO DE PAGOS, SEÑALES Y CAJA (V3+): Para verificar si un cliente ha pagado la señal/depósito de su cita o si hemos cobrado a todos los clientes hoy/ayer, utiliza siempre consultar_estado_pagos. Te devolverá el estado del cobro ("cobrada") y del depósito ("deposito_pagado") de cada cita de la fecha.',
    'CONTROL DE INVENTARIO Y STOCK (V3+): Si te preguntan si queda stock de un producto, si hay alertas de stock bajo, o por el precio de algún artículo, utiliza consultar_inventario.',
    'FICHAS Y ASISTENCIA DEL PERSONAL (V3+): Si te preguntan quién ha fichado hoy, a qué hora entró o salió el personal, utiliza consultar_fichajes.',
    'SEGUIMIENTO DE RESEÑAS (V3+): Si te preguntan por las opiniones de los clientes, la puntuación media del salón, o reseñas negativas de los últimos días, utiliza consultar_resenas.',
    'MÁS CONSULTAS DE NEGOCIO (V3+, todas de solo lectura): usa consultar_campanas para el estado de las campañas de marketing (cuántas se han enviado, fallidas); consultar_cumpleanos para próximos cumpleaños de clientas y si se han felicitado; consultar_lista_espera para ver quién espera un hueco (distinto de avisar_lista_espera, que propone el aviso tras una cancelación); consultar_intercambios_turno para solicitudes de cambio de turno pendientes de aprobar; consultar_comisiones_liquidadas para las comisiones calculadas/pagadas por profesional en un periodo; consultar_logros para el programa de gamificación (cuántas clientas han desbloqueado cada logro, sin nombres); consultar_fidelizacion para niveles, recompensas y canjes del programa de fidelización (datos agregados, sin nombres); consultar_movimientos_inventario para el historial de entradas/salidas de stock; y consultar_hallazgos para las alertas que ha detectado la vigilancia proactiva de la IA. Muchas de estas requieren rol de dirección/propietario: si no está disponible para el rol del usuario, no la menciones y guíalo a la pantalla correspondiente.',
    'AVISOS Y VIGILANCIA (no des por resuelto lo que no has comprobado): cuando el usuario pregunte por sus avisos/hallazgos o te pida "revisa la agenda", "revisa lo pendiente" o "comprueba", basa la respuesta SOLO en una tool de lectura llamada en ESE momento (consultar_hallazgos para la vigilancia; citas_hoy/listar_citas/consultar_estado_pagos para la agenda). NUNCA afirmes que un aviso "ya esta resuelto", "es viejo" o "es de hace dias y ya no aplica" sin haberlo verificado ahora con la tool: si no lo has comprobado, compruebalo o di con franqueza que no lo has revisado, en vez de tranquilizar al usuario con una suposicion. La FECHA de creacion de un hallazgo NO implica que este obsoleto: sigue abierto mientras su condicion se cumpla.',
    'DOS SENTIDOS DE "CITA SIN CONFIRMAR" (no los mezcles): (a) cita PENDIENTE = falta que el EQUIPO/salon la confirme -> eso es lo que resuelve confirmar_citas. (b) cita ya CONFIRMADA por el salon pero que el CLIENTE aun no ha confirmado -> para esas usa reenviar_confirmacion (reenvia el recordatorio para que el cliente confirme; el envio real lo hace el motor del salon). El hallazgo "Citas sin confirmar" de la vigilancia se refiere al sentido (b). Si confirmar_citas no encuentra pendientes pero la vigilancia sigue marcando "Citas sin confirmar", EXPLICA esta diferencia y ofrece reenviar_confirmacion, en vez de decir que hay una contradiccion o que ya esta todo resuelto.',
    'NOTAS INTERNAS (regla dura): si ficha_cliente devuelve num_notas_internas mayor que 0, puedes decir que la clienta tiene notas internas del equipo y ofrecer un enlace a Clientes para revisarlas; NUNCA inventes ni deduzcas su contenido (pueden contener datos sensibles), igual que con las notas de salud.',
    'ENTRENAMIENTO CASOS DE USO (V3+):',
    '- Caso Confirmación Masiva con Exclusiones: Si el usuario te dice "Hay 40 citas sin confirmar. Confírmamelas todas excepto Juan y Nuria", llama a confirmar_citas(excluir_clientes: ["Juan", "Nuria"]).',
    '- Caso Copiar Horario: Si te dicen "copia el horario de los sabados de Maria a Ana", llama a consultar_disponibilidad(fecha: "proximo_sabado", profesional: "Maria") para deducir el horario, y luego llama a bulk_editar_horarios(profesionales: ["Ana"], dia: "sabado", hora_inicio: "HH:MM", hora_fin: "HH:MM").',
    'Cuando el usuario te comente explícitamente una preferencia o hecho operativo sobre el negocio, un profesional o UNA CLIENTA (ej. "A María le gusta el café", "Suele llegar 10 minutos tarde"), utiliza la tool guardar_recuerdo para persistirlo (pasando el cliente_id si aplica). NUNCA guardes datos médicos o de salud.',
    'Todas estas acciones son PROPUESTAS (excepto guardar_recuerdo que es interna): se muestran en una tarjeta y el usuario confirma; tu nunca las aplicas.',
    puedeInformes
      ? 'GESTION DE ALTO NIVEL (llevar el salon): cuando el usuario quiera una vision de direccion de un vistazo o cerrar/organizar el dia o la semana ("analiza mi salon", "como esta todo", "dame el panorama", "vision general" -> foco panorama; "cierra el dia", "haz el cierre", "como ha ido hoy", "prepara la semana", "revisa lo urgente", "que tengo pendiente", "que es lo mas importante"), llama a resumen_gestion con el foco adecuado (panorama | cierre_dia | preparar_semana | urgente). Devuelve un panel visual con KPIs y un menu de acciones de un clic; tras invocarla resume en 1-2 frases lo esencial SIN repetir las cifras que ya salen en las tarjetas, e invita a pulsar una de las acciones. No inventes numeros: los pone la propia tool.'
      : '',
    puedeInformes
      ? 'Para datos agregados de informes o facturacion (citas por estado, ingresos cobrados en un rango) usa resumen_informes; para dinero cobrado de verdad (efectivo/datafono/propinas) usa resumen_caja; para ocupacion del salon usa ocupacion. Cuando el usuario pida un resumen de un periodo ("resumeme el mes", "como va la semana") o la evolucion de una metrica, ANADE ademas mostrar_grafica (dia a dia) y, si tiene sentido comparar con el periodo anterior, mostrar_comparativa; luego ofrece sugerir_enlace hacia informes para el detalle completo. Nunca inventes cifras: usa solo las que devuelven estas tools, y si el rango tiene pocos datos dilo con franqueza en vez de sonar mas seguro de lo que permiten los datos.'
      : 'NO tienes acceso a informes, caja agregada, ocupacion ni graficas de negocio con el rol de este usuario. Si te preguntan por ingresos totales, facturacion, cuanto se ha ganado, estadisticas o informes del negocio, explica con naturalidad que no tienes acceso a esos datos con su rol y que lo consulten con direccion o el propietario. NUNCA inventes cifras.',
    'Cuando sea util, usa sugerir_enlace para ofrecer un chip que lleve a la pantalla relevante (p.ej. tras hablar de una clienta, ofrecer ir a Clientes). Es opcional y no modifica nada; no abuses (a lo sumo uno o dos por respuesta).',
    'ANTES de proponer una escritura: resuelve nombres a entidades reales con buscar_cliente e info_catalogo.',
    'Si hay ambiguedad (varios clientes con ese nombre, servicio no encontrado), PREGUNTA al usuario en vez de proponer con datos inciertos.',
    'Las propuestas de escritura NO se ejecutan automaticamente: el sistema mostrara una tarjeta de confirmacion al usuario.',
    'EXPERTO COLORISTA (VISION): Si recibes una imagen adjunta de cabello (type: image_url), asume el rol de Maestro Colorista de marcas premium (LOréal, Wella). Analiza de forma proactiva la base, la altura de tono y el estado del cabello. Si el usuario te pide un objetivo (ej. "quiero esto"), formula una receta exacta (gramos, volumenes, matiz, tecnica). Acto seguido, llama automaticamente a crear_presupuesto para presupuestar los servicios necesarios.',
    'MODO TETRIS (REORDENADOR): Si te piden CUALQUIER cosa relacionada con reordenar/mejorar el dia -- "optimiza la agenda", "junta mis citas", "analiza mi agenda", "compacta los huecos", "evita retrasos", "reorganiza el dia", "cuadra mejor las citas" -- invoca SIEMPRE la tool optimizar_agenda (previa consulta de la agenda del dia con citas_hoy/listar_citas si te falta el detalle). Devuelve un bloque visual diff con los movimientos propuestos. NUNCA respondas este tipo de peticion con un parrafo de analisis: la propuesta la genera la tool, no tu.',
    'ANTI-INVENCION DE AGENDA (REGLA DURA): jamas afirmes horas concretas, huecos, duraciones ni el estado (confirmada/completada/pendiente/no-show) de una cita "de memoria" ni deducidos. Esos datos SOLO pueden venir de una tool de lectura (citas_hoy, listar_citas, consultar_disponibilidad, consultar_estado_pagos). Si no has llamado a la tool, no tienes esos datos: llamala antes de hablar. Si el usuario pide un analisis de huecos/retrasos, no narres un diagnostico inventado -> usa optimizar_agenda. Prefiere mostrar la tabla/diff real de la tool a describir la agenda con palabras.',
    'PREDICCION FINANCIERA: Si te piden predicciones (ej. "¿que pasa si subo el precio del corte 2 euros?"), realiza un calculo estimativo usando sentido comun de retencion vs precio. Usa mostrar_grafica inyectando fechas futuras de los proximos 3 meses para dibujar la estimacion al alza en formato visual, y explica paso a paso la estimacion de elasticidad (asume una perdida leve de clientes, pero mayor ticket medio).',
    scopeMsg,
  ].join('\n') + '\n\n' + AUTOCONOCIMIENTO_IA + '\n\n' + MAPA_CONFIG + '\n\n' + CONFIG_EDITABLE_TEXT;
}

// ---------------------------------------------------------------------------
// Red de seguridad del razonamiento (Sesion S02, plan V3).
// Convierte la doctrina "casi nunca texto plano" en una GARANTIA determinista:
// ninguna respuesta final puede quedar en texto seco ni en un cuelgue vacio. Si
// la respuesta no trae una superficie util, se le adjunta un bloque 'opciones'
// de acciones rapidas segun el rol; cada opcion, al pulsarse, se reenvia como el
// siguiente turno y produce una superficie real. Es tambien el fallback de
// intencion no reconocida (un menu accionable, no "no te he entendido").
// Doc: informes/plan-ia-chispa-v3/RAZONAMIENTO-UNIVERSAL.md
// ---------------------------------------------------------------------------
// Tipos de bloque que cuentan como "superficie util" (no texto seco).
const TIPOS_SUPERFICIE = new Set(['enlace', 'accion', 'grafica', 'comparativa', 'formulario', 'opciones', 'progreso', 'kpi', 'barras', 'tabla', 'timeline']);

// Acciones rapidas por rol: el label, al pulsarse, vuelve como turno del usuario
// y el agente lo resuelve con una superficie (agenda de hoy, auto-conocimiento,
// crear cita -> formulario de minima info, resumen de caja -> datos/comparativa).
function accionesRapidas(scope: 'all' | 'self' | 'none', puedeInformes: boolean): Bloque {
  const opciones: { valor: string; label: string }[] = [
    { valor: 'agenda_hoy', label: 'Ver la agenda de hoy' },
    { valor: 'que_sabes', label: '¿Que sabes hacer?' },
  ];
  if (scope !== 'none') opciones.push({ valor: 'crear_cita', label: 'Crear una cita' });
  if (puedeInformes) opciones.push({ valor: 'caja_hoy', label: 'Ver cuanto llevo hoy' });
  return {
    tipo: 'opciones',
    id: `acciones-rapidas-${Date.now()}`,
    titulo: '¿Te ayudo con algo de esto?',
    opciones,
  };
}

// Umbral: por debajo de esta longitud de texto la respuesta se considera un
// "cuelgue" (saludo, acuse, "no te he entendido") y SI merece el menu de
// rescate. Por encima ya es una respuesta util por si misma y NO se le pega el
// menu generico (evita la sensacion robotica de repetir las mismas 4 opciones
// en cada turno, feedback de Carlos 11 jul).
const LONGITUD_RESPUESTA_UTIL = 160;

// Garantiza que el usuario nunca se quede sin siguiente paso, SIN spamear.
// - Si ya hay una superficie util (accion/enlace/grafica/...), no toca nada.
// - Si hay una respuesta de texto sustancial (la respuesta ES el resultado),
//   tampoco pega el menu: el texto ya vale por si mismo.
// - Solo cuando la respuesta esta vacia o es un texto corto/seco (un cuelgue de
//   verdad) adjunta las acciones rapidas por rol.
function garantizarSuperficie(bloques: Bloque[], scope: 'all' | 'self' | 'none', puedeInformes: boolean): Bloque[] {
  if (bloques.some((b) => TIPOS_SUPERFICIE.has(b.tipo))) return bloques;
  const textoTotal = bloques
    .filter((b) => b.tipo === 'texto')
    .reduce((n, b) => n + (typeof (b as { texto?: unknown }).texto === 'string' ? (b as { texto: string }).texto.length : 0), 0);
  if (textoTotal >= LONGITUD_RESPUESTA_UTIL) return bloques;
  return [...bloques, accionesRapidas(scope, puedeInformes)];
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // --- Auth: resolver usuario ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    // --- Perfil del usuario (service key para evitar RLS) ---
    const { data: profile } = await svc
      .from('profiles')
      .select('negocio_id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.negocio_id) return json({ error: 'Sin negocio asignado' }, 403);

    const negocioId: string = profile.negocio_id;
    const role: string = profile.role ?? 'employee';

    // --- Config del negocio ---
    const { data: cfgRow } = await svc
      .from('negocio_config')
      .select('config')
      .eq('negocio_id', negocioId)
      .maybeSingle();
    const cfg = (cfgRow?.config ?? {}) as Record<string, unknown>;
    const profEscribe = cfg.asistenteProfesionalEscribe === true;
    const effort = (cfg.asistenteEffort as string) || 'medium';

    // --- Scope de escritura ---
    const realScope: 'all' | 'self' | 'none' =
      role === 'owner' || role === 'admin' || role === 'recepcion'
        ? 'all'
        : profEscribe && role === 'employee'
        ? 'self'
        : 'none';

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const mensajes = Array.isArray(body?.mensajes) ? body.mensajes : [];
    // Ruteo del rework KISS: 'lectura' (modelo barato) | 'accion' (Haiku) |
    // 'auto' (chat: clasifica lectura/accion mas abajo). 'superficie' acota que
    // tools de ESCRITURA se ofrecen (chat, presupuestos, clientes, agenda...).
    const tareaRaw = String((body as { tarea?: unknown })?.tarea ?? 'auto');
    const tarea: 'lectura' | 'accion' | 'auto' =
      tareaRaw === 'lectura' || tareaRaw === 'accion' ? tareaRaw : 'auto';
    const superficie = String((body as { superficie?: unknown })?.superficie ?? 'chat');

    // --- Ejecutar agente ---
    const resultado = await runAgente(negocioId, role, user.id, realScope, effort, mensajes, userClient, tarea, superficie);
    return json(resultado);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Bucle del agente
// ---------------------------------------------------------------------------
export async function runAgente(
  negocioId: string,
  role: string,
  userId: string,
  scope: 'all' | 'self' | 'none',
  _effort: string,
  mensajes: { role: 'user' | 'assistant'; content: string | any[] }[],
  userClient: typeof svc,
  tarea: 'lectura' | 'accion' | 'auto' = 'auto',
  superficie: string = 'chat',
): Promise<{ bloques: Bloque[]; texto: string; accion_propuesta?: AccionPropuesta }> {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD

  // RBAC (Sesion 2): rol canonico derivado del JWT (via profiles). Determina que
  // tools se DECLARAN al LLM. Lo que un rol no puede hacer, ni se declara.
  const rolCanon = roleOf(role);
  const puedeInformes = can(rolCanon, 'informes.ver');

  // Ruteo por tarea (rework KISS): 'lectura' -> modelo barato; el resto -> Haiku.
  // El chat ('auto') se afina con un clasificador (ver mas abajo) que puede
  // reasignar tareaEfectiva/modeloEnUso a 'accion'/Haiku cuando detecta escritura.
  let tareaEfectiva: 'lectura' | 'accion' = tarea === 'lectura' ? 'lectura' : 'accion';
  let modeloEnUso = tareaEfectiva === 'lectura' ? MODEL_LECTURA : MODEL;

  // S09: Recuperar hechos de memoria a largo plazo
  const { data: hechos } = await svc
    .from('chispa_memoria')
    .select('clave, valor')
    .eq('negocio_id', negocioId)
    .eq('tipo', 'hecho')
    .order('actualizado_en', { ascending: false })
    .limit(50);
  
  const memoriaTexto = (hechos ?? [])
    .map((h: { clave: string; valor: unknown }) => `- ${h.clave}: ${typeof h.valor === 'string' ? h.valor : JSON.stringify(h.valor)}`)
    .join('\n');

  // OpenAI-compatible (OpenRouter): el system va como primer mensaje.
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt(hoy, scope, puedeInformes, memoriaTexto) },
    ...mensajes.map((m) => ({ role: m.role, content: m.content })),
  ];

  // S22: Recuperar macros (tools declarativas) aprobadas
  const { data: macrosRows } = await svc
    .from('chispa_macros')
    .select('nombre, descripcion, parametros, pasos')
    .eq('negocio_id', negocioId)
    .eq('estado', 'aprobado');
    
  const dynamicTools = (macrosRows ?? []).map((m: any) => ({
    type: 'function' as const,
    function: {
      name: m.nombre,
      description: m.descripcion + ' [MACRO DE CHISPA]',
      parameters: {
        type: 'object' as const,
        properties: (m.parametros ?? []).reduce((acc: any, p: any) => ({ ...acc, [p.name]: { type: p.type || 'string', description: p.description || '' } }), {}),
        required: (m.parametros ?? []).filter((p: any) => p.required).map((p: any) => p.name),
      }
    }
  }));

  // Solo se exponen al LLM las tools permitidas para este rol/scope (fail-closed).
  const tools = [
    ...TOOLS
      .filter((t) => toolPermitida(t.name, rolCanon, scope))
      .filter((t) => {
        // Biblioteca (lectura): siempre. En 'lectura' no se ofrece ninguna
        // escritura. En 'accion'/'auto', solo las escrituras de la superficie.
        if (esLectura(t.name)) return true;
        if (tareaEfectiva === 'lectura') return false;
        return accionPermitidaEnSuperficie(t.name, superficie);
      })
      .map((t) => ({ type: 'function' as const, function: t })),
    ...dynamicTools
  ];

  // Bloques sin efecto de escritura acumulados durante el razonamiento (enlace,
  // grafica, comparativa, kpi, barras, tabla): se adjuntan a la respuesta final.
  const bloquesExtra: Bloque[] = [];

  // Serializa el resultado de una tool de lectura hacia el LLM aplicando la
  // regla dura de salud: si algun campo prohibido se colara, falla cerrado.
  // S19: Si el resultado contiene un 'dato_respuesta', lo intercepta, inyecta el 
  // bloque visual determinista en bloquesExtra y le pasa el JSON raw al LLM.
  const serializarLectura = async (name: string, input: Record<string, string>): Promise<string> => {
    const r = await ejecutarLectura({ name, input }, negocioId, scope, userId, rolCanon, userClient);
    assertSinCamposProhibidos(r);
    
    const rObj = r as Record<string, unknown>;
    if (rObj && typeof rObj === 'object' && rObj.dato_respuesta) {
      const dr = rObj.dato_respuesta as DatoRespuesta;
      bloquesExtra.push(elegirFormatoDato(dr));
    }
    
    return JSON.stringify(r);
  };

  const parseArgs = (tc: { function: { arguments: string } }): Record<string, string> => {
    try {
      return JSON.parse(tc.function.arguments || '{}');
    } catch {
      return {};
    }
  };

  const verto = new Set<string>(); // evita enlaces duplicados por ruta
  // Procesa una tool de navegacion: valida el destino y acumula un bloque enlace.
  // Devuelve el texto de respuesta que se reinyecta al LLM.
  const procesarEnlace = (inp: Record<string, string>): string => {
    const meta = RUTAS[(inp.destino ?? '').trim()];
    if (!meta) return `Destino no valido. Usa uno de: ${Object.keys(RUTAS).join(', ')}.`;
    if (!verto.has(meta.ruta)) {
      verto.add(meta.ruta);
      bloquesExtra.push({ tipo: 'enlace', ruta: meta.ruta, label: meta.label, descripcion: inp.descripcion });
    }
    return 'Enlace anadido a la respuesta.';
  };

  // Despacha una tool call que NO es de escritura. 'sugerir_enlace'/'mostrar_grafica'/
  // 'mostrar_comparativa' tienen efecto lateral (anaden un bloque a bloquesExtra con
  // datos calculados aqui mismo, nunca por el LLM); el resto son lecturas puras que
  // se serializan de vuelta al modelo.
  const procesarToolNoEscritura = async (tc: { function: { name: string; arguments: string } }): Promise<string> => {
    const name = tc.function.name;
    const inp = parseArgs(tc);
    if (name === 'sugerir_enlace') return procesarEnlace(inp);
    if (name === 'mostrar_grafica') return await procesarGrafica(inp, negocioId, bloquesExtra);
    if (name === 'mostrar_comparativa') return await procesarComparativa(inp, negocioId, bloquesExtra);
    if (name === 'resumen_gestion') return await procesarResumenGestion(inp, negocioId, hoy, bloquesExtra);
    if (name === 'listar_clientes') return await procesarListarClientes(inp, negocioId, bloquesExtra);
    if (name === 'buscar_recuerdos') return await procesarRecuerdos(inp, negocioId, bloquesExtra, puedeInformes ? null : userId);
    if (name === 'guardar_recuerdo') {
      const clave = (inp.clave ?? '').trim();
      const valor = (inp.valor ?? '').trim();
      const clienteId = (inp.cliente_id ?? '').trim();
      const confianza = Number(inp.confianza) || 1.0;
      if (!clave || !valor) return 'Faltan clave o valor para guardar el recuerdo.';

      // Demo: tenant compartido; no se persiste memoria cross-visitante (#8).
      if (negocioId === DEMO_NEGOCIO_ID) {
        return 'Anotado durante esta sesion (en la demo no se guarda de forma permanente).';
      }

      const claveFinal = clienteId ? `cliente:${clienteId}:${clave}` : clave;

      // upsert: reafirmar un hecho ya conocido actualiza su valor/confianza en
      // vez de fallar por la UNIQUE (negocio_id, tipo, clave, usuario_id).
      // valor es jsonb: se guarda el string tal cual (sin doble-serializar).
      const { error } = await svc.from('chispa_memoria').upsert({
        negocio_id: negocioId,
        usuario_id: userId || '',
        tipo: 'hecho',
        clave: claveFinal,
        valor,
        confianza,
        origen: 'agenda-asistente'
      }, { onConflict: 'negocio_id,tipo,clave,usuario_id' });
      if (error) return `Error al guardar recuerdo: ${error.message}`;
      return 'Hecho guardado correctamente en la memoria a largo plazo.';
    }
    
    const macro = macrosRows?.find((m: any) => m.nombre === name);
    if (macro) {
      const resultados: any = {};
      for (const paso of macro.pasos) {
        const stepName = paso.name;
        const mappedArgs: any = {};
        if (paso.args_mapping) {
          for (const [k, v] of Object.entries(paso.args_mapping)) {
             mappedArgs[k] = inp[v as string] !== undefined ? inp[v as string] : v; 
          }
        }
        const stepRes = await serializarLectura(stepName, mappedArgs);
        try {
          resultados[stepName] = JSON.parse(stepRes);
        } catch {
          resultados[stepName] = stepRes;
        }
      }
      return JSON.stringify({ macro_ejecutada: macro.nombre, resultados });
    }

    return await serializarLectura(name, inp);
  };

  // Ensambla la respuesta final: texto (si hay) + bloquesExtra + accion (si hay).
  // Ademas de bloques, devuelve texto/accion_propuesta de forma plana para
  // compatibilidad con clientes ya desplegados (que aun no leen bloques);
  // asi el cambio del edge no rompe la web en produccion durante el rebuild.
  const finalizar = (texto: string, accion?: AccionPropuesta): { bloques: Bloque[]; texto: string; accion_propuesta?: AccionPropuesta } => {
    const bloques: Bloque[] = [];
    if (texto && texto.trim()) bloques.push({ tipo: 'texto', texto });
    bloques.push(...bloquesExtra);
    if (accion) bloques.push({ tipo: 'accion', accion });
    if (bloques.length === 0) bloques.push({ tipo: 'texto', texto: 'Hecho.' });
    // Red de seguridad (S02): nunca texto seco ni cuelgue -> superficie garantizada.
    const bloquesFinal = garantizarSuperficie(bloques, scope, puedeInformes);
    const out: { bloques: Bloque[]; texto: string; accion_propuesta?: AccionPropuesta } = { bloques: bloquesFinal, texto: texto || '' };
    if (accion) out.accion_propuesta = accion;
    return out;
  };

  for (let i = 0; i < 6; i++) {
    // Log temporal para auditar el payload REAL enviado al LLM (regla dura de
    // salud). Solo se activa con el secret CHISPA_DEBUG_PAYLOAD=1; en produccion
    // no imprime nada. Sirve para la verificacion (c) de la Sesion 2.
    if (Deno.env.get('CHISPA_DEBUG_PAYLOAD') === '1') {
      console.log('[CHISPA_DEBUG_PAYLOAD]', JSON.stringify(messages));
    }
    const resp = await openai.chat.completions.create({
      model: modeloEnUso,
      max_tokens: 1024,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const msg = resp.choices[0]?.message;
    if (!msg) return finalizar('No he recibido respuesta del modelo.');
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];

    // Sin tool calls: respuesta final de texto (+ bloquesExtra acumulados)
    if (toolCalls.length === 0) {
      await registrarConv(negocioId, userId, messages);
      return finalizar(msg.content ?? '');
    }

    // ¿Hay alguna tool de escritura (agenda, gestion o config)?
    const writeCall = toolCalls.find((tc) => esEscritura(tc.function.name));
    if (writeCall) {
      const name = writeCall.function.name;

      // Defensa en profundidad: aunque las tools ya se filtran por rol al
      // declararlas, revalidamos que esta escritura esta permitida (rol+scope).
      if (!toolPermitida(name, rolCanon, scope)) {
        await registrarConv(negocioId, userId, messages);
        return finalizar(
          name === 'cambiar_config'
            ? 'Solo el propietario puede cambiar la configuracion del salon. Puedo indicarte donde esta el ajuste para que lo cambies tu.'
            : 'No tienes permiso para esa accion con tu rol. Puedo darte la informacion, pero no aplicarla.',
        );
      }

      const propuesta = name === 'cambiar_config'
        ? await construirPropuestaConfig(parseArgs(writeCall), negocioId)
        : await construirPropuesta(
            { name, input: parseArgs(writeCall) },
            negocioId,
            scope as 'all' | 'self',
            userId,
          );

      // "Actua con minima info" (Sesion 3 V2): falta o es ambiguo un dato
      // requerido. En vez de un error de texto que el LLM convertiria en una
      // pregunta libre, se corta aqui y se devuelve el formulario/opciones
      // directamente (pre-rellenado con lo que ya se sabia).
      if ('pedirInfo' in propuesta) {
        await registrarConv(negocioId, userId, messages);
        const bloques: Bloque[] = [];
        if (msg.content && msg.content.trim()) bloques.push({ tipo: 'texto', texto: msg.content });
        bloques.push(...bloquesExtra, propuesta.pedirInfo);
        return { bloques, texto: msg.content || '' };
      }

      if (!('error' in propuesta)) {
        await registrarConv(negocioId, userId, messages);
        return finalizar(msg.content || 'Revisa la accion propuesta y confirma:', propuesta);
      }

      // OpenAI exige responder a TODAS las tool calls del turno antes de continuar.
      for (const tc of toolCalls) {
        let content: string;
        if (tc.id === writeCall.id) {
          content = propuesta.error;
        } else if (esEscritura(tc.function.name)) {
          content = 'Procesa una sola operacion a la vez.';
        } else {
          content = await procesarToolNoEscritura(tc);
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content });
      }
      continue;
    }

    // Solo lecturas y/o bloques (enlace/grafica/comparativa): ejecutar y reinyectar resultados
    for (const tc of toolCalls) {
      const content = await procesarToolNoEscritura(tc);
      messages.push({ role: 'tool', tool_call_id: tc.id, content });
    }
  }

  await registrarConv(negocioId, userId, messages);
  return finalizar('No he podido completar la peticion en el numero de pasos permitido. ¿Puedes reformularla?');
}

// Sanitiza el texto libre (proveniente del LLM) que se interpola en un filtro
// PostgREST .or(): elimina los caracteres con significado en la sintaxis del
// filtro (coma, parentesis, comodin, escape) para cerrar la inyeccion de
// condiciones. El aislamiento multi-tenant y el consentimiento van en .eq()
// aparte (no evadibles por aqui); esto es defensa en profundidad.
function sanitizarFiltro(s: string): string {
  return String(s ?? '').replace(/[(),%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Ejecutar tools de LECTURA
// ---------------------------------------------------------------------------
async function ejecutarLectura(
  t: { name: string; input: Record<string, string> },
  negocioId: string,
  scope: 'all' | 'self' | 'none',
  userId: string,
  role: Role,
  userClient: typeof svc,
): Promise<unknown> {
  const inp = (t.input ?? {}) as Record<string, string>;

  switch (t.name) {
    case 'info_catalogo': {
      const [{ data: servicios }, { data: profes }] = await Promise.all([
        svc
          .from('servicios')
          .select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min')
          .eq('negocio_id', negocioId),
        svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('activo', true),
      ]);
      return { servicios, profesionales: profes };
    }

    case 'consultar_estado_pagos': {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(inp.fecha ?? '')
        ? inp.fecha
        : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

      let profIdFiltro: string | null = null;
      if (scope === 'self') profIdFiltro = await resolverProfesionalDelUsuario(negocioId, userId);

      let q = svc
        .from('citas')
        .select('id, inicio, estado, profesional_id, servicio_id, cliente_id, deposito_requerido, deposito_pagado, deposito_importe, cobrada, importe_final')
        .eq('negocio_id', negocioId)
        .gte('inicio', `${fecha}T00:00:00`)
        .lte('inicio', `${fecha}T23:59:59`)
        .order('inicio', { ascending: true });

      if (profIdFiltro) q = q.eq('profesional_id', profIdFiltro);
      const { data: citas } = await q;
      if (!citas) return [];

      // Resolver servicios, profesionales y clientes
      const servIds = [...new Set(citas.map((c) => c.servicio_id).filter(Boolean))] as string[];
      const profIds = [...new Set(citas.map((c) => c.profesional_id).filter(Boolean))] as string[];
      const cliIds = [...new Set(citas.map((c) => c.cliente_id).filter(Boolean))] as string[];

      const [servRes, profRes, cliRes] = await Promise.all([
        servIds.length ? svc.from('servicios').select('id, nombre').in('id', servIds) : Promise.resolve({ data: [] }),
        profIds.length ? svc.from('profesionales').select('id, nombre').in('id', profIds) : Promise.resolve({ data: [] }),
        cliIds.length ? svc.from('clientes').select('id, nombre').eq('consiente_ia', true).in('id', cliIds) : Promise.resolve({ data: [] }),
      ]);

      const servMap = new Map((servRes.data ?? []).map((s: any) => [s.id, s.nombre]));
      const profMap = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nombre]));
      const cliMap = new Map((cliRes.data ?? []).map((c: any) => [c.id, c.nombre]));

      return citas.map((c: any) => {
        const hora = new Date(c.inicio).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
        const cliName = c.cliente_id ? (cliMap.get(c.cliente_id) ?? 'Cliente (Sin consentimiento IA)') : 'Walk-in / Anónimo';
        return {
          id: c.id,
          hora,
          cliente: cliName,
          servicio: c.servicio_id ? (servMap.get(c.servicio_id) ?? 'Servicio') : 'Servicio',
          profesional: c.profesional_id ? (profMap.get(c.profesional_id) ?? 'Equipo') : 'Equipo',
          estado: c.estado,
          deposito_requerido: !!c.deposito_requerido,
          deposito_pagado: !!c.deposito_pagado,
          deposito_importe: c.deposito_importe ? Number(c.deposito_importe) : 0,
          cobrada: !!c.cobrada,
          importe_final: c.importe_final ? Number(c.importe_final) : 0,
        };
      });
    }

    case 'consultar_fichajes': {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(inp.fecha ?? '')
        ? inp.fecha
        : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

      const { data: fichajes } = await svc
        .from('fichajes')
        .select('id, profesional_id, tipo, marcado_at, nota')
        .eq('negocio_id', negocioId)
        .gte('marcado_at', `${fecha}T00:00:00Z`)
        .lte('marcado_at', `${fecha}T23:59:59Z`)
        .order('marcado_at', { ascending: true });
      
      if (!fichajes || fichajes.length === 0) return { fecha, mensaje: 'No hay fichajes registrados para este dia.' };

      const profIds = [...new Set(fichajes.map((f: any) => f.profesional_id).filter(Boolean))] as string[];
      const { data: profes } = profIds.length
        ? await svc.from('profesionales').select('id, nombre').in('id', profIds)
        : { data: [] };
      const profMap = new Map((profes ?? []).map((p: any) => [p.id, p.nombre]));

      return fichajes.map((f: any) => {
        const hora = new Date(f.marcado_at).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
        return {
          id: f.id,
          hora,
          profesional: f.profesional_id ? (profMap.get(f.profesional_id) ?? 'Equipo') : 'Equipo',
          tipo: f.tipo === 'entrada' ? 'Entrada (Clock-in)' : 'Salida (Clock-out)',
          nota: f.nota || null,
        };
      });
    }

    case 'consultar_inventario': {
      let q = svc
        .from('productos')
        .select('id, nombre, descripcion, categoria, precio_cents, stock_minimo, activo')
        .eq('negocio_id', negocioId)
        .eq('activo', true);

      if (inp.texto) {
        q = q.ilike('nombre', `%${sanitizarFiltro(inp.texto)}%`);
      }

      const { data: productos } = await q;
      if (!productos || productos.length === 0) return { mensaje: 'No se encontraron productos en el catalogo.' };

      const prodIds = productos.map((p: any) => p.id);
      const { data: stock } = await svc
        .from('inventario')
        .select('producto_id, unidades, ubicacion')
        .eq('negocio_id', negocioId)
        .in('producto_id', prodIds);

      const stockMap = new Map((stock ?? []).map((s: any) => [s.producto_id, s]));

      const listado = productos.map((p: any) => {
        const itemStock = stockMap.get(p.id);
        const unidades = itemStock ? itemStock.unidades : 0;
        const bajoStock = p.stock_minimo != null && unidades < p.stock_minimo;
        return {
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria,
          precio_eur: Math.round(p.precio_cents) / 100,
          stock: unidades,
          stock_minimo: p.stock_minimo,
          ubicacion: itemStock ? itemStock.ubicacion : null,
          alerta_bajo_stock: bajoStock,
        };
      });

      if (inp.bajo_stock_only === 'true' || inp.bajo_stock_only === 'si' || inp.bajo_stock_only === 'sí') {
        return listado.filter((item: any) => item.alerta_bajo_stock);
      }

      return listado;
    }

    case 'consultar_resenas': {
      const desde = inp.desde;
      const hasta = inp.hasta ?? inp.desde;

      let q = svc
        .from('resenas')
        .select('id, autor_nombre, comentario, puntuacion, created_at, fuente')
        .eq('negocio_id', negocioId)
        .gte('created_at', `${desde}T00:00:00Z`)
        .lte('created_at', `${hasta}T23:59:59Z`)
        .order('created_at', { ascending: false });

      if (inp.solo_negativas === 'true' || inp.solo_negativas === 'si' || inp.solo_negativas === 'sí') {
        q = q.lt('puntuacion', 4);
      }

      const { data: resenas } = await q;
      if (!resenas || resenas.length === 0) return { desde, hasta, mensaje: 'No se recibieron resenas en este rango.' };

      const total = resenas.length;
      const suma = resenas.reduce((s: number, r: any) => s + (r.puntuacion ?? 0), 0);
      const media = total > 0 ? Number((suma / total).toFixed(1)) : 0;

      return {
        rango: { desde, hasta },
        total_recibidas: total,
        nota_media: media,
        resenas: resenas.map((r: any) => ({
          id: r.id,
          autor: r.autor_nombre,
          comentario: r.comentario,
          puntuacion: r.puntuacion,
          fuente: r.fuente || 'web',
          fecha: new Date(r.created_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
        })),
      };
    }

    case 'buscar_cliente': {
      // Consentimiento IA: los clientes con consiente_ia=false son INVISIBLES
      // para la IA (como si no existieran). Lista blanca de campos (regla dura de
      // salud): solo operativos, nunca alergias/notas/sensibilidades.
      const { data } = await svc
        .from('clientes')
        .select('id, nombre, telefono, total_visitas, ultima_visita, primera_visita, ticket_medio, frecuencia_dias')
        .eq('negocio_id', negocioId)
        .eq('consiente_ia', true)
        .or(`nombre.ilike.%${sanitizarFiltro(inp.texto)}%,telefono.ilike.%${sanitizarFiltro(inp.texto)}%`)
        .limit(8);
      return (data ?? []).map((row) => proyectarClienteIA(row as Record<string, unknown>));
    }

    case 'ficha_cliente': {
      // Ficha 360 para la IA (Sesion 7). Regla dura de salud: lista blanca de
      // campos operativos + un booleano tiene_notas_salud SIN contenido. Un cliente
      // con consiente_ia=false es INVISIBLE (se responde como si no existiera).
      const idInp = String(inp.id ?? '').trim();
      // Se seleccionan tambien alergias/notas/sensibilidades SOLO para derivar el
      // booleano de salud aqui dentro; esos campos NUNCA se devuelven ni viajan al LLM.
      let q = svc
        .from('clientes')
        .select('id, nombre, telefono, total_visitas, ultima_visita, primera_visita, ticket_medio, frecuencia_dias, etiquetas, alergias, notas, sensibilidades_cuero')
        .eq('negocio_id', negocioId)
        .eq('consiente_ia', true)
        .limit(1);
      q = /^[0-9a-f-]{36}$/i.test(idInp)
        ? q.eq('id', idInp)
        : q.or(`nombre.ilike.%${sanitizarFiltro(inp.texto)}%,telefono.ilike.%${sanitizarFiltro(inp.texto)}%`);
      const { data: filas } = await q;
      const row = (filas ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return { encontrado: false };

      const clienteId = String(row.id);
      // Booleano de salud: se calcula aqui y el contenido se descarta de inmediato.
      const tieneNotasSalud =
        String(row.alergias ?? '').trim().length > 0 ||
        String(row.notas ?? '').trim().length > 0 ||
        String(row.sensibilidades_cuero ?? '').trim().length > 0;

      // Etiquetas no sensibles: se retiran las reservadas de seguimiento de resenas.
      const TAGS_RESERVADAS = new Set(['Reseñó salón', 'Reseñó Mecha']);
      const etiquetas = Array.isArray(row.etiquetas)
        ? (row.etiquetas as string[]).filter((t) => !TAGS_RESERVADAS.has(t))
        : [];

      // Ultimas citas (fecha/servicio/estado/importe) + gasto acumulado real.
      const { data: cits } = await svc
        .from('citas')
        .select('inicio, estado, servicio_id, importe_final, cobrada')
        .eq('negocio_id', negocioId)
        .eq('cliente_id', clienteId)
        .order('inicio', { ascending: false })
        .limit(8);
      const svcIds = [...new Set((cits ?? []).map((c: { servicio_id: string | null }) => c.servicio_id).filter(Boolean))] as string[];
      const svcMap = new Map<string, string>();
      if (svcIds.length) {
        const { data: servs } = await svc.from('servicios').select('id, nombre').eq('negocio_id', negocioId).in('id', svcIds);
        for (const s of (servs ?? []) as { id: string; nombre: string }[]) svcMap.set(s.id, s.nombre);
      }
      const ultimasCitas = (cits ?? []).map((c: { inicio: string; estado: string; servicio_id: string | null; importe_final: number | null }) => ({
        fecha: c.inicio,
        servicio: c.servicio_id ? (svcMap.get(c.servicio_id) ?? null) : null,
        estado: c.estado,
        importe: c.importe_final ?? null,
      }));
      const gastoAcumulado = (cits ?? []).reduce(
        (s: number, c: { importe_final: number | null; cobrada: boolean | null }) => s + (c.cobrada && c.importe_final ? Number(c.importe_final) : 0),
        0,
      );

      // Riesgo de no-show: se calcula con la RPC (una sola fuente de verdad), via el
      // JWT del usuario (SECURITY DEFINER scoped a su negocio).
      let riesgo: unknown = { nivel: 'bajo', score: 0 };
      const { data: rk } = await userClient.rpc('riesgo_no_show_cliente', { p_cliente_id: clienteId });
      if (rk) riesgo = rk;

      // S10: Memoria semántica del cliente (excluye salud)
      const { data: hechosCliente } = await svc
        .from('chispa_memoria')
        .select('clave, valor')
        .eq('negocio_id', negocioId)
        .eq('tipo', 'hecho')
        .like('clave', `cliente:${clienteId}:%`)
        .order('actualizado_en', { ascending: false })
        .limit(20);
        
      const memoria_ia = (hechosCliente ?? []).map(h => {
        const keyParts = h.clave.split(':');
        const nombreClave = keyParts.length > 2 ? keyParts.slice(2).join(':') : h.clave;
        return `${nombreClave}: ${typeof h.valor === 'string' ? h.valor : JSON.stringify(h.valor)}`;
      });

      // Notas internas operativas (notas_internas_cliente): son texto LIBRE que
      // podria contener datos de salud (art. 9 RGPD), asi que NUNCA se vuelca su
      // contenido al LLM. Igual que la salud, solo se expone un CONTADOR sin texto
      // para que Chispa pueda avisar de que existen y remitir a la ficha.
      const { count: numNotasInternas } = await svc
        .from('notas_internas_cliente')
        .select('id', { count: 'exact', head: true })
        .eq('negocio_id', negocioId)
        .eq('cliente_id', clienteId);

      // Proyeccion final: lista blanca de operativos + agregados NO sensibles.
      const base = proyectarClienteIA(row);
      return {
        encontrado: true,
        cliente: base,
        ultimas_citas: ultimasCitas,
        gasto_acumulado: gastoAcumulado,
        etiquetas,
        tiene_notas_salud: tieneNotasSalud,
        num_notas_internas: numNotasInternas ?? 0,
        riesgo_no_show: riesgo,
        memoria_ia,
      };
    }

    case 'listar_citas': {
      // Si scope===self, filtrar solo al profesional del caller
      let profIdFiltro: string | null = null;
      if (scope === 'self') {
        profIdFiltro = await resolverProfesionalDelUsuario(negocioId, userId);
      }

      let q = svc
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id, deposito_requerido, deposito_pagado, deposito_importe, cobrada, importe_final')
        .eq('negocio_id', negocioId)
        .gte('inicio', `${inp.desde}T00:00:00`);

      const hasta = inp.hasta ?? inp.desde;
      q = q.lte('inicio', `${hasta}T23:59:59`);

      if (inp.estado) q = q.eq('estado', inp.estado);
      if (profIdFiltro) q = q.eq('profesional_id', profIdFiltro);

      // Filtro por nombre de profesional (aproximado via subquery no disponible facil; hacemos post-filter)
      const { data: citas } = await q;
      if (!citas) return [];

      let resultado = citas;

      if (inp.profesional && !profIdFiltro) {
        const { data: profes } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .ilike('nombre', `%${inp.profesional}%`);
        const ids = new Set((profes ?? []).map((p: { id: string }) => p.id));
        resultado = resultado.filter((c: { profesional_id: string }) => ids.has(c.profesional_id));
      }

      if (inp.cliente) {
        // El filtro por nombre solo casa clientes que consienten IA.
        const { data: clientes } = await svc
          .from('clientes')
          .select('id')
          .eq('negocio_id', negocioId)
          .eq('consiente_ia', true)
          .ilike('nombre', `%${inp.cliente}%`);
        const ids = new Set((clientes ?? []).map((c: { id: string }) => c.id));
        resultado = resultado.filter((c: { cliente_id: string | null }) => c.cliente_id && ids.has(c.cliente_id));
      }

      // Consentimiento IA: se ocultan las identidades de clientes que NO
      // consienten. La cita permanece (para razonar sobre ocupacion/huecos)
      // pero sin su cliente_id, para no revelar quien es.
      const idsEnCitas = [
        ...new Set(resultado.map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean)),
      ] as string[];
      if (idsEnCitas.length > 0) {
        const { data: noConsienten } = await svc
          .from('clientes')
          .select('id')
          .eq('negocio_id', negocioId)
          .eq('consiente_ia', false)
          .in('id', idsEnCitas);
        const ocultar = new Set((noConsienten ?? []).map((c: { id: string }) => c.id));
        if (ocultar.size > 0) {
          resultado = resultado.map((c) =>
            c.cliente_id && ocultar.has(c.cliente_id) ? { ...c, cliente_id: null } : c
          );
        }
      }

      return resultado;
    }

    case 'consultar_disponibilidad': {
      const dia = inp.fecha;
      let profIdFiltro: string | null = null;
      if (scope === 'self') {
        profIdFiltro = await resolverProfesionalDelUsuario(negocioId, userId);
      }

      const citasQ = svc
        .from('citas')
        .select('inicio, fin, fin_activa, fin_espera, profesional_id')
        .eq('negocio_id', negocioId)
        .eq('estado', 'confirmada')
        .gte('inicio', `${dia}T00:00:00`)
        .lt('inicio', `${dia}T23:59:59`);

      const bloqueosQ = svc
        .from('bloqueos_profesional')
        .select('id, inicio, fin, profesional_id, motivo, tipo')
        .eq('negocio_id', negocioId)
        .gte('inicio', `${dia}T00:00:00`)
        .lt('inicio', `${dia}T23:59:59`);

      const [{ data: citas }, { data: bloqueos }] = await Promise.all([
        profIdFiltro ? citasQ.eq('profesional_id', profIdFiltro) : citasQ,
        profIdFiltro ? bloqueosQ.eq('profesional_id', profIdFiltro) : bloqueosQ,
      ]);

      // Filtro por nombre de profesional si se indico y no es self-scope
      if (inp.profesional && !profIdFiltro) {
        const { data: profes } = await svc
          .from('profesionales')
          .select('id')
          .eq('negocio_id', negocioId)
          .ilike('nombre', `%${inp.profesional}%`);
        const ids = new Set((profes ?? []).map((p: { id: string }) => p.id));
        return {
          citas: (citas ?? []).filter((c: { profesional_id: string }) => ids.has(c.profesional_id)),
          bloqueos: (bloqueos ?? []).filter((b: { profesional_id: string }) => ids.has(b.profesional_id)),
        };
      }

      return { citas, bloqueos };
    }

    case 'resumen_informes': {
      // Solo llega aqui si el rol tiene informes.ver (gating en toolPermitida).
      // Datos AGREGADOS del negocio: nada de PII de clientes ni salud.
      const desde = inp.desde;
      const hasta = inp.hasta ?? inp.desde;
      const [{ data: citas }, { data: cobros }] = await Promise.all([
        svc
          .from('citas')
          .select('estado')
          .eq('negocio_id', negocioId)
          .gte('inicio', `${desde}T00:00:00`)
          .lte('inicio', `${hasta}T23:59:59`),
        svc
          .from('cobros')
          .select('total_cents')
          .eq('negocio_id', negocioId)
          .gte('cobrado_at', `${desde}T00:00:00`)
          .lte('cobrado_at', `${hasta}T23:59:59`),
      ]);
      const porEstado: Record<string, number> = {};
      for (const c of (citas ?? []) as { estado: string | null }[]) {
        const e = c.estado || 'sin_estado';
        porEstado[e] = (porEstado[e] ?? 0) + 1;
      }
      const totalCents = ((cobros ?? []) as { total_cents: number | null }[]).reduce(
        (s, r) => s + (r.total_cents ?? 0),
        0,
      );
      const totalEur = Math.round(totalCents) / 100;
      return {
        rango: { desde, hasta },
        citas_total: (citas ?? []).length,
        citas_por_estado: porEstado,
        ingresos_cobrados_eur: totalEur,
        nota: 'Ingresos aproximados: suma de cobros con fecha de cobro dentro del rango.',
        dato_respuesta: {
          clase: 'cifras',
          titulo: 'Resumen General',
          tarjetas: [
            { label: 'Citas Totales', valor: (citas ?? []).length, unidad: 'citas' },
            { label: 'Ingresos', valor: totalEur, unidad: 'eur' }
          ]
        }
      };
    }

    case 'resumen_caja': {
      // Solo llega aqui si el rol tiene informes.ver. Mismo libro de caja y
      // misma logica que el arqueo de caja.web.tsx, parametrizado por rango.
      const desde = inp.desde;
      const hasta = inp.hasta ?? inp.desde;
      const { data: cobros } = await svc
        .from('cobros')
        .select('total_cents, efectivo_cents, datafono_cents, propina_cents')
        .eq('negocio_id', negocioId)
        .eq('estado', 'completado')
        .gte('cobrado_at', `${desde}T00:00:00`)
        .lte('cobrado_at', `${hasta}T23:59:59`);
      const filas = (cobros ?? []) as {
        total_cents: number | null; efectivo_cents: number | null;
        datafono_cents: number | null; propina_cents: number | null;
      }[];
      const eur = (n: number) => Math.round(n) / 100;
      const total = eur(filas.reduce((s, r) => s + (r.total_cents ?? 0), 0));
      const efectivo = eur(filas.reduce((s, r) => s + (r.efectivo_cents ?? 0), 0));
      const datafono = eur(filas.reduce((s, r) => s + (r.datafono_cents ?? 0), 0));
      const propinas = eur(filas.reduce((s, r) => s + (r.propina_cents ?? 0), 0));
      return {
        rango: { desde, hasta },
        total_eur: total,
        efectivo_eur: efectivo,
        datafono_eur: datafono,
        propinas_eur: propinas,
        num_cobros: filas.length,
        nota: 'Dinero realmente cobrado (libro de caja); no incluye citas del rango aun no cobradas.',
        dato_respuesta: {
          clase: 'cifras',
          titulo: 'Arqueo de Caja',
          tarjetas: [
            { label: 'Total', valor: total, unidad: 'eur' },
            { label: 'Efectivo', valor: efectivo, unidad: 'eur' },
            { label: 'Datáfono', valor: datafono, unidad: 'eur' },
            { label: 'Propinas', valor: propinas, unidad: 'eur' }
          ]
        }
      };
    }

    case 'ocupacion': {
      // Misma definicion que ocupacionGlobal/ocupacionData de informes.web.tsx:
      // citas confirmadas/completadas por profesional activo (no % de horario).
      const desde = inp.desde;
      const hasta = inp.hasta ?? inp.desde;
      const [{ data: citas }, { data: profes }] = await Promise.all([
        svc
          .from('citas')
          .select('profesional_id')
          .eq('negocio_id', negocioId)
          .in('estado', ['confirmada', 'completada'])
          .gte('inicio', `${desde}T00:00:00`)
          .lte('inicio', `${hasta}T23:59:59`),
        svc.from('profesionales').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true),
      ]);
      const porProfCount = new Map<string, number>();
      for (const c of (citas ?? []) as { profesional_id: string | null }[]) {
        if (!c.profesional_id) continue;
        porProfCount.set(c.profesional_id, (porProfCount.get(c.profesional_id) ?? 0) + 1);
      }
      const totalCitasOcup = (citas ?? []).length;
      const listaProfes = (profes ?? []) as { id: string; nombre: string }[];
      const porProfesional = listaProfes
        .map((p) => ({ nombre: p.nombre, citas: porProfCount.get(p.id) ?? 0 }))
        .sort((a, b) => b.citas - a.citas);
      return {
        rango: { desde, hasta },
        citas_totales: totalCitasOcup,
        profesionales_activos: listaProfes.length,
        promedio_citas_por_profesional: listaProfes.length > 0 ? Math.round((totalCitasOcup / listaProfes.length) * 10) / 10 : 0,
        por_profesional: porProfesional,
        nota: 'Ocupacion aproximada: citas por profesional activo, no porcentaje de horario disponible.',
        dato_respuesta: {
          clase: 'reparto',
          titulo: 'Citas por Profesional',
          unidad: 'citas',
          datos: porProfesional.map(p => ({ etiqueta: p.nombre, valor: p.citas }))
        }
      };
    }

    case 'metas_progreso': {
      // Objetivos gamificados existentes (Equipo > Objetivos): reutiliza las RPC
      // ya desplegadas (objetivos-profesional.sql), no se duplica el calculo.
      // Dependen de auth.uid(): SIEMPRE via userClient (con el JWT del usuario),
      // nunca con el service key (svc), o el RPC no reconoceria al llamante.
      if (role === 'propietario' || role === 'direccion') {
        const { data, error } = await userClient.rpc('objetivos_negocio_progreso');
        if (error) return { ambito: 'equipo', objetivos: [], nota: 'No se pudieron leer los objetivos del equipo.' };
        const objetivos = ((data as { objetivos?: unknown[] } | null)?.objetivos ?? []) as unknown[];
        return {
          ambito: 'equipo',
          objetivos,
          nota: objetivos.length === 0 ? 'Nadie ha fijado objetivos todavia (Equipo > Objetivos del equipo).' : undefined,
        };
      }
      const { data, error } = await userClient.rpc('mis_objetivos_progreso');
      if (error) return { ambito: 'propio', objetivos: [], nota: 'No se pudieron leer tus objetivos.' };
      const objetivos = ((data as { objetivos?: unknown[] } | null)?.objetivos ?? []) as unknown[];
      return {
        ambito: 'propio',
        objetivos,
        nota: objetivos.length === 0 ? 'No tienes objetivos fijados todavia; te los puede fijar direccion en Equipo.' : undefined,
      };
    }

    case 'citas_hoy': {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(inp.fecha ?? '')
        ? inp.fecha
        : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

      let profIdFiltro: string | null = null;
      if (scope === 'self') profIdFiltro = await resolverProfesionalDelUsuario(negocioId, userId);

      let q = svc
        .from('citas')
        .select('id, inicio, estado, profesional_id, servicio_id')
        .eq('negocio_id', negocioId)
        .gte('inicio', `${fecha}T00:00:00`)
        .lte('inicio', `${fecha}T23:59:59`)
        .order('inicio', { ascending: true });
      if (profIdFiltro) q = q.eq('profesional_id', profIdFiltro);
      const { data: citasHoyData } = await q;
      const lista = (citasHoyData ?? []) as {
        id: string; inicio: string; estado: string; profesional_id: string | null; servicio_id: string | null;
      }[];

      const servIds = [...new Set(lista.map((c) => c.servicio_id).filter(Boolean))] as string[];
      const profIds = [...new Set(lista.map((c) => c.profesional_id).filter(Boolean))] as string[];
      const [servRes, profRes] = await Promise.all([
        servIds.length
          ? svc.from('servicios').select('id, nombre').in('id', servIds)
          : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
        profIds.length
          ? svc.from('profesionales').select('id, nombre').in('id', profIds)
          : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      ]);
      const servMap = new Map((servRes.data ?? []).map((s: { id: string; nombre: string }) => [s.id, s.nombre]));
      const profMap = new Map((profRes.data ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]));

      const porEstadoHoy: Record<string, number> = {};
      for (const c of lista) porEstadoHoy[c.estado || 'sin_estado'] = (porEstadoHoy[c.estado || 'sin_estado'] ?? 0) + 1;

      const ahora = Date.now();
      const proxima = lista
        .filter((c) => new Date(c.inicio).getTime() >= ahora && c.estado !== 'cancelada')
        .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];

      const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

      return {
        fecha,
        total: lista.length,
        por_estado: porEstadoHoy,
        proxima: proxima
          ? {
              hora: horaDe(proxima.inicio),
              servicio: proxima.servicio_id ? servMap.get(proxima.servicio_id) ?? null : null,
              profesional: proxima.profesional_id ? profMap.get(proxima.profesional_id) ?? null : null,
            }
          : null,
        citas: lista.map((c) => ({
          hora: horaDe(c.inicio),
          servicio: c.servicio_id ? servMap.get(c.servicio_id) ?? null : null,
          profesional: c.profesional_id ? profMap.get(c.profesional_id) ?? null : null,
          estado: c.estado,
        })),
        dato_respuesta: {
          clase: 'listado',
          titulo: `Citas del ${fecha}`,
          columnas: [
            { key: 'hora', label: 'Hora', alinear: 'izq' },
            { key: 'servicio', label: 'Servicio', alinear: 'izq' },
            { key: 'prof', label: 'Profesional', alinear: 'izq' },
            { key: 'estado', label: 'Estado', alinear: 'der' }
          ],
          filas: lista.map((c) => ({
            hora: horaDe(c.inicio),
            servicio: (c.servicio_id ? servMap.get(c.servicio_id) : null) || '-',
            prof: (c.profesional_id ? profMap.get(c.profesional_id) : null) || '-',
            estado: c.estado || '-'
          }))
        }
      };
    }

    case 'consultar_campanas': {
      const hoyStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(inp.desde ?? '')
        ? inp.desde
        : new Date(Date.now() - 90 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(inp.hasta ?? '') ? inp.hasta : hoyStr;

      const { data: camps } = await svc
        .from('campanas')
        .select('id, nombre, canal, estado, total_destinatarios, created_at, encolada_en')
        .eq('negocio_id', negocioId)
        .gte('created_at', `${desde}T00:00:00Z`)
        .lte('created_at', `${hasta}T23:59:59Z`)
        .order('created_at', { ascending: false });
      if (!camps || camps.length === 0) return { rango: { desde, hasta }, mensaje: 'No hay campanas en este rango.' };

      const campIds = camps.map((c: { id: string }) => c.id);
      const { data: dests } = await svc
        .from('campana_destinatarios')
        .select('campana_id, estado')
        .eq('negocio_id', negocioId)
        .in('campana_id', campIds);
      const enviadosPorCamp = new Map<string, number>();
      const fallidosPorCamp = new Map<string, number>();
      for (const d of (dests ?? []) as { campana_id: string; estado: string }[]) {
        // estados canonicos (migrations/sesion20-campanas.sql): pendiente|enviado|descartado|error.
        if (d.estado === 'enviado') enviadosPorCamp.set(d.campana_id, (enviadosPorCamp.get(d.campana_id) ?? 0) + 1);
        else if (d.estado === 'error') fallidosPorCamp.set(d.campana_id, (fallidosPorCamp.get(d.campana_id) ?? 0) + 1);
      }
      const filas = camps.map((c: { id: string; nombre: string; canal: string; estado: string; total_destinatarios: number | null; created_at: string }) => ({
        nombre: c.nombre,
        canal: c.canal,
        estado: c.estado,
        destinatarios: c.total_destinatarios ?? 0,
        enviados: enviadosPorCamp.get(c.id) ?? 0,
        fallidos: fallidosPorCamp.get(c.id) ?? 0,
        fecha: new Date(c.created_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
      }));
      return {
        rango: { desde, hasta },
        total_campanas: filas.length,
        campanas: filas,
        dato_respuesta: {
          clase: 'listado',
          titulo: 'Campanas de marketing',
          columnas: [
            { key: 'nombre', label: 'Campana', alinear: 'izq' },
            { key: 'canal', label: 'Canal', alinear: 'izq' },
            { key: 'estado', label: 'Estado', alinear: 'izq' },
            { key: 'enviados', label: 'Enviados', alinear: 'der' },
          ],
          filas: filas.map((f) => ({ nombre: f.nombre, canal: f.canal, estado: f.estado, enviados: String(f.enviados) })),
        },
      };
    }

    case 'consultar_cumpleanos': {
      let q = svc
        .from('cumpleanos_avisos')
        .select('id, nombre, anio, descuento_pct, estado, sent_at, created_at')
        .eq('negocio_id', negocioId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (inp.solo_pendientes === 'si' || inp.solo_pendientes === 'sí' || inp.solo_pendientes === 'true') {
        q = q.neq('estado', 'enviado');
      }
      const { data: rows } = await q;
      if (!rows || rows.length === 0) return { mensaje: 'No hay cumpleanos registrados por ahora.' };
      return {
        total: rows.length,
        cumpleanos: rows.map((r: { nombre: string; anio: number | null; descuento_pct: number | null; estado: string; sent_at: string | null }) => ({
          nombre: r.nombre,
          anio: r.anio,
          descuento_pct: r.descuento_pct ?? 0,
          estado: r.estado,
          felicitado: !!r.sent_at,
        })),
      };
    }

    case 'consultar_lista_espera': {
      let q = svc
        .from('lista_espera')
        .select('id, nombre, telefono, servicio_id, profesional_id, desde, hasta, franja, nota, estado, prioridad, created_at, avisado_at')
        .eq('negocio_id', negocioId)
        .order('prioridad', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);
      // estados canonicos (migrations/lista-espera.sql): esperando|avisado|resuelta|cancelada.
      // Por defecto solo las que siguen en juego (no resueltas ni canceladas).
      if (inp.estado) q = q.eq('estado', String(inp.estado).trim());
      else q = q.in('estado', ['esperando', 'avisado']);
      const { data: rows } = await q;
      if (!rows || rows.length === 0) return { mensaje: 'La lista de espera esta vacia.' };

      const servIds = [...new Set(rows.map((r: { servicio_id: string | null }) => r.servicio_id).filter(Boolean))] as string[];
      const profIds = [...new Set(rows.map((r: { profesional_id: string | null }) => r.profesional_id).filter(Boolean))] as string[];
      const [servRes, profRes] = await Promise.all([
        servIds.length ? svc.from('servicios').select('id, nombre').in('id', servIds) : Promise.resolve({ data: [] }),
        profIds.length ? svc.from('profesionales').select('id, nombre').in('id', profIds) : Promise.resolve({ data: [] }),
      ]);
      const servMap = new Map((servRes.data ?? []).map((s: { id: string; nombre: string }) => [s.id, s.nombre]));
      const profMap = new Map((profRes.data ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]));

      let lista = rows.map((r: { nombre: string; telefono: string | null; servicio_id: string | null; profesional_id: string | null; desde: string | null; hasta: string | null; franja: string | null; nota: string | null; estado: string; prioridad: number | null; avisado_at: string | null }) => ({
        cliente: r.nombre,
        telefono: r.telefono,
        servicio: r.servicio_id ? (servMap.get(r.servicio_id) ?? null) : null,
        profesional: r.profesional_id ? (profMap.get(r.profesional_id) ?? 'Cualquiera') : 'Cualquiera',
        desde: r.desde,
        hasta: r.hasta,
        franja: r.franja,
        nota: r.nota,
        estado: r.estado,
        prioridad: r.prioridad ?? 0,
        avisada: !!r.avisado_at,
      }));
      if (inp.profesional) {
        const needle = String(inp.profesional).toLowerCase();
        lista = lista.filter((x) => (x.profesional ?? '').toLowerCase().includes(needle));
      }
      return {
        total: lista.length,
        lista_espera: lista,
        dato_respuesta: {
          clase: 'listado',
          titulo: 'Lista de espera',
          columnas: [
            { key: 'cliente', label: 'Cliente', alinear: 'izq' },
            { key: 'servicio', label: 'Servicio', alinear: 'izq' },
            { key: 'prof', label: 'Profesional', alinear: 'izq' },
            { key: 'franja', label: 'Franja', alinear: 'izq' },
          ],
          filas: lista.map((x) => ({ cliente: x.cliente || '-', servicio: x.servicio || '-', prof: x.profesional || '-', franja: x.franja || '-' })),
        },
      };
    }

    case 'consultar_intercambios_turno': {
      let q = svc
        .from('turnos_intercambio')
        .select('id, solicitante_id, companero_id, fecha_solicitante, fecha_companero, motivo, estado, created_at')
        .eq('negocio_id', negocioId)
        .order('created_at', { ascending: false })
        .limit(50);
      // estados canonicos (migrations/turnos-intercambio.sql): pendiente_companero|
      // pendiente_gestor|aprobado|rechazado|cancelado. Por defecto los pendientes de resolver.
      if (inp.estado) q = q.eq('estado', String(inp.estado).trim());
      else q = q.in('estado', ['pendiente_companero', 'pendiente_gestor']);
      const { data: rows } = await q;
      if (!rows || rows.length === 0) return { mensaje: 'No hay intercambios de turno pendientes.' };

      const profIds = [...new Set(rows.flatMap((r: { solicitante_id: string | null; companero_id: string | null }) => [r.solicitante_id, r.companero_id]).filter(Boolean))] as string[];
      const { data: profs } = profIds.length
        ? await svc.from('profesionales').select('id, nombre').in('id', profIds)
        : { data: [] };
      const profMap = new Map((profs ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]));

      return {
        total: rows.length,
        intercambios: rows.map((r: { solicitante_id: string | null; companero_id: string | null; fecha_solicitante: string | null; fecha_companero: string | null; motivo: string | null; estado: string }) => ({
          solicita: r.solicitante_id ? (profMap.get(r.solicitante_id) ?? 'Profesional') : 'Profesional',
          companero: r.companero_id ? (profMap.get(r.companero_id) ?? 'Profesional') : 'Profesional',
          fecha_solicitante: r.fecha_solicitante,
          fecha_companero: r.fecha_companero,
          motivo: r.motivo,
          estado: r.estado,
        })),
      };
    }

    case 'consultar_comisiones_liquidadas': {
      const hoyStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(inp.desde ?? '')
        ? inp.desde
        : new Date(Date.now() - 90 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(inp.hasta ?? '') ? inp.hasta : hoyStr;

      let q = svc
        .from('comisiones')
        .select('profesional_id, periodo_inicio, periodo_fin, base_calculo_cents, porcentaje_aplicado, importe_comision_cents, estado, pagada_en')
        .eq('negocio_id', negocioId)
        .gte('periodo_inicio', `${desde}T00:00:00Z`)
        .lte('periodo_inicio', `${hasta}T23:59:59Z`)
        .order('periodo_inicio', { ascending: false })
        .limit(100);
      // estados canonicos (migrations/comisiones-liquidaciones.sql): pendiente|pagada|anulada.
      if (inp.solo_pendientes === 'si' || inp.solo_pendientes === 'sí' || inp.solo_pendientes === 'true') {
        q = q.eq('estado', 'pendiente');
      }
      const { data: rows } = await q;
      if (!rows || rows.length === 0) return { rango: { desde, hasta }, mensaje: 'No hay comisiones calculadas en este rango.' };

      const profIds = [...new Set(rows.map((r: { profesional_id: string | null }) => r.profesional_id).filter(Boolean))] as string[];
      const { data: profs } = profIds.length
        ? await svc.from('profesionales').select('id, nombre').in('id', profIds)
        : { data: [] };
      const profMap = new Map((profs ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]));

      let filas = rows.map((r: { profesional_id: string | null; base_calculo_cents: number | null; porcentaje_aplicado: number | null; importe_comision_cents: number | null; estado: string; pagada_en: string | null }) => ({
        profesional: r.profesional_id ? (profMap.get(r.profesional_id) ?? 'Profesional') : 'Profesional',
        base_eur: Math.round(r.base_calculo_cents ?? 0) / 100,
        porcentaje: r.porcentaje_aplicado ?? 0,
        importe_eur: Math.round(r.importe_comision_cents ?? 0) / 100,
        estado: r.estado,
        pagada: r.estado === 'pagada',
      }));
      if (inp.profesional) {
        const needle = String(inp.profesional).toLowerCase();
        filas = filas.filter((x) => x.profesional.toLowerCase().includes(needle));
      }
      const totalPendiente = filas.filter((x) => x.estado === 'pendiente').reduce((s, x) => s + x.importe_eur, 0);
      return {
        rango: { desde, hasta },
        total_comisiones: filas.length,
        total_pendiente_eur: Math.round(totalPendiente * 100) / 100,
        comisiones: filas,
        dato_respuesta: {
          clase: 'listado',
          titulo: 'Comisiones',
          columnas: [
            { key: 'prof', label: 'Profesional', alinear: 'izq' },
            { key: 'importe', label: 'Comision', alinear: 'der' },
            { key: 'estado', label: 'Estado', alinear: 'der' },
          ],
          filas: filas.map((x) => ({ prof: x.profesional, importe: `${x.importe_eur.toFixed(2)} EUR`, estado: x.estado })),
        },
      };
    }

    case 'consultar_logros': {
      const { data: logros } = await svc
        .from('logros')
        .select('id, nombre, descripcion, tipo, activo')
        .eq('negocio_id', negocioId)
        .order('orden', { ascending: true });
      if (!logros || logros.length === 0) return { mensaje: 'No hay logros configurados en el programa de gamificacion.' };

      const { data: desbloqueos } = await svc
        .from('logros_desbloqueados')
        .select('logro_id')
        .eq('negocio_id', negocioId);
      const conteo = new Map<string, number>();
      for (const d of (desbloqueos ?? []) as { logro_id: string }[]) conteo.set(d.logro_id, (conteo.get(d.logro_id) ?? 0) + 1);

      return {
        total_logros: logros.length,
        logros: logros.map((l: { id: string; nombre: string; descripcion: string | null; tipo: string | null; activo: boolean }) => ({
          nombre: l.nombre,
          descripcion: l.descripcion,
          tipo: l.tipo,
          activo: l.activo,
          veces_desbloqueado: conteo.get(l.id) ?? 0,
        })),
      };
    }

    case 'consultar_fidelizacion': {
      const hoyStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(inp.desde ?? '')
        ? inp.desde
        : new Date(Date.now() - 90 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(inp.hasta ?? '') ? inp.hasta : hoyStr;

      const [{ data: niveles }, { data: recompensas }, { data: canjes }] = await Promise.all([
        svc.from('niveles_fidelizacion').select('nombre, orden, umbral_visitas, umbral_gastado_cents, activo').eq('negocio_id', negocioId).eq('activo', true).order('orden', { ascending: true }),
        svc.from('recompensas').select('nombre, tipo, valor, umbral_visitas, activo').eq('negocio_id', negocioId).eq('activo', true).order('umbral_visitas', { ascending: true }),
        svc.from('recompensas_canjeadas').select('estado').eq('negocio_id', negocioId).gte('canjeado_en', `${desde}T00:00:00Z`).lte('canjeado_en', `${hasta}T23:59:59Z`),
      ]);

      const canjesPorEstado: Record<string, number> = {};
      for (const c of (canjes ?? []) as { estado: string | null }[]) {
        const k = c.estado || 'sin_estado';
        canjesPorEstado[k] = (canjesPorEstado[k] ?? 0) + 1;
      }
      return {
        rango_canjes: { desde, hasta },
        niveles: (niveles ?? []).map((n: { nombre: string; umbral_visitas: number | null; umbral_gastado_cents: number | null }) => ({
          nombre: n.nombre,
          umbral_visitas: n.umbral_visitas,
          umbral_gastado_eur: n.umbral_gastado_cents != null ? Math.round(n.umbral_gastado_cents) / 100 : null,
        })),
        recompensas: (recompensas ?? []).map((r: { nombre: string; tipo: string | null; valor: string | null; umbral_visitas: number | null }) => ({
          nombre: r.nombre,
          tipo: r.tipo,
          valor: r.valor,
          umbral_visitas: r.umbral_visitas,
        })),
        canjes_total: (canjes ?? []).length,
        canjes_por_estado: canjesPorEstado,
      };
    }

    case 'consultar_movimientos_inventario': {
      const hoyStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(inp.desde ?? '')
        ? inp.desde
        : new Date(Date.now() - 30 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const hasta = /^\d{4}-\d{2}-\d{2}$/.test(inp.hasta ?? '') ? inp.hasta : hoyStr;

      let prodIdFiltro: string[] | null = null;
      if (inp.producto) {
        const { data: prods } = await svc
          .from('productos')
          .select('id')
          .eq('negocio_id', negocioId)
          .ilike('nombre', `%${sanitizarFiltro(inp.producto)}%`);
        prodIdFiltro = (prods ?? []).map((p: { id: string }) => p.id);
        if (prodIdFiltro.length === 0) return { mensaje: 'No se encontro ningun producto con ese nombre.' };
      }

      let q = svc
        .from('movimientos_inventario')
        .select('producto_id, tipo, unidades, motivo, created_at')
        .eq('negocio_id', negocioId)
        .gte('created_at', `${desde}T00:00:00Z`)
        .lte('created_at', `${hasta}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(80);
      if (prodIdFiltro) q = q.in('producto_id', prodIdFiltro);
      const { data: movs } = await q;
      if (!movs || movs.length === 0) return { rango: { desde, hasta }, mensaje: 'No hay movimientos de inventario en este rango.' };

      const prodIds = [...new Set(movs.map((m: { producto_id: string | null }) => m.producto_id).filter(Boolean))] as string[];
      const { data: prods } = prodIds.length
        ? await svc.from('productos').select('id, nombre').in('id', prodIds)
        : { data: [] };
      const prodMap = new Map((prods ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre]));

      const filas = movs.map((m: { producto_id: string | null; tipo: string; unidades: number | null; motivo: string | null; created_at: string }) => ({
        producto: m.producto_id ? (prodMap.get(m.producto_id) ?? 'Producto') : 'Producto',
        tipo: m.tipo,
        unidades: m.unidades ?? 0,
        motivo: m.motivo,
        fecha: new Date(m.created_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
      }));
      return {
        rango: { desde, hasta },
        total: filas.length,
        movimientos: filas,
        dato_respuesta: {
          clase: 'listado',
          titulo: 'Movimientos de inventario',
          columnas: [
            { key: 'producto', label: 'Producto', alinear: 'izq' },
            { key: 'tipo', label: 'Tipo', alinear: 'izq' },
            { key: 'unidades', label: 'Unidades', alinear: 'der' },
            { key: 'fecha', label: 'Fecha', alinear: 'der' },
          ],
          filas: filas.map((f) => ({ producto: f.producto, tipo: f.tipo, unidades: String(f.unidades), fecha: f.fecha })),
        },
      };
    }

    case 'consultar_hallazgos': {
      const incluirResueltos = inp.solo_pendientes === 'no' || inp.solo_pendientes === 'false';
      let q = svc
        .from('hallazgos_ia')
        .select('tipo, familia, severidad, entidad, resumen, estado, creado_en')
        .eq('negocio_id', negocioId)
        .order('creado_en', { ascending: false })
        .limit(50);
      // estados canonicos (migrations/sesion13-...): nuevo|visto|resuelto|descartado.
      if (!incluirResueltos) q = q.in('estado', ['nuevo', 'visto']);
      if (inp.severidad) q = q.eq('severidad', String(inp.severidad).trim());
      const { data: rows } = await q;
      if (!rows || rows.length === 0) return { mensaje: 'La IA no ha detectado hallazgos pendientes. Todo en orden.' };

      const filas = rows.map((r: { tipo: string | null; familia: string | null; severidad: string | null; entidad: string | null; resumen: string | null; estado: string; creado_en: string }) => ({
        severidad: r.severidad ?? 'media',
        familia: r.familia ?? r.tipo,
        resumen: r.resumen,
        estado: r.estado,
        fecha: new Date(r.creado_en).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
      }));
      return {
        total: filas.length,
        hallazgos: filas,
        dato_respuesta: {
          clase: 'listado',
          titulo: 'Hallazgos de la vigilancia IA',
          columnas: [
            { key: 'severidad', label: 'Severidad', alinear: 'izq' },
            { key: 'resumen', label: 'Hallazgo', alinear: 'izq' },
            { key: 'estado', label: 'Estado', alinear: 'der' },
          ],
          filas: filas.map((f) => ({ severidad: f.severidad, resumen: f.resumen || '-', estado: f.estado })),
        },
      };
    }

    default:
      return { error: 'tool desconocida' };
  }
}

// ---------------------------------------------------------------------------
// Bloques 'grafica'/'comparativa' (Sesion 6): los datos SIEMPRE se calculan
// aqui con las mismas tablas/filtros que caja.web.tsx e informes.web.tsx; el
// LLM solo elige metrica/rango, nunca fabrica los numeros que se muestran.
// ---------------------------------------------------------------------------

// Lista de dias YYYY-MM-DD entre desde y hasta, ambos inclusive.
function enumerarDias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  if (isNaN(d.getTime()) || isNaN(fin.getTime()) || d > fin) return out;
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

// Ingresos reales (libro de cobros) agrupados por dia de cobro.
async function serieIngresosDiarios(negocioId: string, desde: string, hasta: string, dias: string[]): Promise<{ fecha: string; valor: number }[]> {
  const { data } = await svc
    .from('cobros')
    .select('total_cents, cobrado_at')
    .eq('negocio_id', negocioId)
    .eq('estado', 'completado')
    .gte('cobrado_at', `${desde}T00:00:00`)
    .lte('cobrado_at', `${hasta}T23:59:59`);
  const porDia = new Map<string, number>(dias.map((d) => [d, 0]));
  for (const r of (data ?? []) as { total_cents: number | null; cobrado_at: string }[]) {
    const key = r.cobrado_at.slice(0, 10);
    if (porDia.has(key)) porDia.set(key, (porDia.get(key) ?? 0) + (r.total_cents ?? 0));
  }
  return dias.map((d) => ({ fecha: d, valor: Math.round(porDia.get(d) ?? 0) / 100 }));
}

// Citas confirmadas/completadas agrupadas por dia de inicio (misma definicion que 'ocupacion').
async function serieCitasDiarias(negocioId: string, desde: string, hasta: string, dias: string[]): Promise<{ fecha: string; valor: number }[]> {
  const { data } = await svc
    .from('citas')
    .select('inicio')
    .eq('negocio_id', negocioId)
    .in('estado', ['confirmada', 'completada'])
    .gte('inicio', `${desde}T00:00:00`)
    .lte('inicio', `${hasta}T23:59:59`);
  const porDia = new Map<string, number>(dias.map((d) => [d, 0]));
  for (const r of (data ?? []) as { inicio: string }[]) {
    const key = r.inicio.slice(0, 10);
    if (porDia.has(key)) porDia.set(key, (porDia.get(key) ?? 0) + 1);
  }
  return dias.map((d) => ({ fecha: d, valor: porDia.get(d) ?? 0 }));
}

// Procesa la tool 'mostrar_grafica': valida args, calcula la serie real y anade
// el bloque a bloquesExtra. Devuelve el texto que se reinyecta al LLM.
async function procesarGrafica(inp: Record<string, string>, negocioId: string, bloques: Bloque[]): Promise<string> {
  const metrica = (inp.metrica ?? '').trim().toLowerCase();
  if (metrica !== 'ingresos' && metrica !== 'citas') return 'Metrica no valida para la grafica (usa ingresos o citas).';
  const desde = inp.desde;
  const hasta = inp.hasta;
  if (!desde || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return 'Necesito fechas desde/hasta validas (YYYY-MM-DD) para la grafica.';
  }
  const dias = enumerarDias(desde, hasta);
  if (dias.length === 0) return 'El rango de fechas no es valido para una grafica.';
  if (dias.length > 92) return 'Ese rango es demasiado amplio para una grafica (maximo unos 3 meses); acota las fechas.';

  const serie = metrica === 'ingresos'
    ? await serieIngresosDiarios(negocioId, desde, hasta, dias)
    : await serieCitasDiarias(negocioId, desde, hasta, dias);

  bloques.push({
    tipo: 'grafica',
    titulo: metrica === 'ingresos' ? 'Ingresos por dia' : 'Citas por dia',
    unidad: metrica === 'ingresos' ? 'eur' : 'citas',
    serie,
  });
  return 'Grafica anadida a la respuesta con los datos reales del rango.';
}

// S11: Busca en eventos_negocio e inyecta un bloque timeline
// actorScope: null = ve TODO el negocio (roles con informes.ver, direccion/propietario).
// Un string (userId) = acota a los eventos donde el usuario es el actor: asi el
// profesional/recepcion puede preguntar "¿por que me salio este upsell?" (sus propias
// ejecuciones de IA, registradas con actor=usuario_id) SIN ver caja/eventos ajenos.
async function procesarRecuerdos(inp: Record<string, string>, negocioId: string, bloques: Bloque[], actorScope: string | null): Promise<string> {
  const tema = (inp.entidad_o_tema ?? '').trim().toLowerCase();
  // Fechas opcionales: por defecto, ventana de los ultimos 30 dias (S12: el usuario
  // suele preguntar "¿por que aparecio X?" sin dar fechas).
  const iso = (d: Date) => d.toISOString().split('T')[0];
  const valida = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const hasta = valida(inp.hasta) ? inp.hasta : iso(new Date());
  const desde = valida(inp.desde) ? inp.desde : iso(new Date(Date.now() - 30 * 86_400_000));

  // Consultar eventos_negocio (S08) limitando a los 50 mas recientes del rango.
  // S12: tambien traemos motivo (el "por que" del trigger) y resultado para poder
  // explicar una ejecucion concreta de la IA, no solo listarla.
  let q = svc.from('eventos_negocio').select('id, creado_en, tipo, entidad, resumen, motivo, resultado')
             .eq('negocio_id', negocioId)
             .gte('creado_en', `${desde}T00:00:00Z`)
             .lte('creado_en', `${hasta}T23:59:59Z`)
             .order('creado_en', { ascending: false })
             .limit(50);

  if (tema) {
    q = q.or(`resumen.ilike.%${tema}%,entidad.ilike.%${tema}%`);
  }

  // Acotado por actor para roles sin informes.ver (ver comentario de la firma).
  if (actorScope) {
    q = q.eq('actor', actorScope);
  }

  const { data: eventos, error } = await q;
  if (error) return `Error interno al consultar eventos: ${error.message}`;

  if (!eventos || eventos.length === 0) {
    return 'No he encontrado ningun evento ni recuerdo en ese rango de fechas' + (tema ? ` sobre "${tema}"` : '') + '.';
  }

  // Recorta texto largo (el resultado puede ser un JSON de bloques) para no
  // inundar ni el timeline ni el presupuesto de tokens del LLM.
  const corto = (v: unknown, n: number): string => {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const esIA = (e: { tipo?: string; entidad?: string }) =>
    (e.tipo || '').includes('chispa') || (e.tipo || '').includes('ia') || (e.entidad || '').includes('funcion_ia');

  // Formatear a eventos timeline (motivo visible; ejecuciones de IA en color fuego).
  const evs = eventos.map(e => {
    const motivo = corto(e.motivo, 140);
    return {
      id: e.id,
      fecha: new Date(e.creado_en).toISOString().split('T')[0],
      titulo: (e.tipo || 'Evento').replace(/_/g, ' ').toUpperCase(),
      descripcion: (e.resumen || '') + (motivo ? ` — Motivo: ${motivo}` : ''),
      icono: (e.tipo || '').includes('cita') ? '📅' : (e.tipo || '').includes('caja') ? '💶' : '📌',
      color: esIA(e) ? '#f4501e' : undefined,
    };
  });

  bloques.push({
    tipo: 'timeline',
    titulo: `Recuerdos: ${desde} a ${hasta}${tema ? ` (${tema})` : ''}`,
    eventos: evs,
  });

  // Detalle compacto de vuelta al LLM para que explique el resultado y el porque
  // de cada ejecucion (S12), sin volcar el JSON entero.
  const detalle = eventos.slice(0, 12).map(e => {
    const f = new Date(e.creado_en).toISOString().split('T')[0];
    const motivo = corto(e.motivo, 140);
    const res = corto(e.resultado, 160);
    return `- ${f} · ${e.resumen || e.tipo}${motivo ? ` · Motivo: ${motivo}` : ''}${res ? ` · Resultado: ${res}` : ''}`;
  }).join('\n');

  return `Se han encontrado ${evs.length} eventos y se ha inyectado un timeline visual. Detalle para explicar su resultado y su porque (no lo repitas entero, resume lo relevante a lo que preguntaron):\n${detalle}`;
}

// Rangos actual/anterior para la comparativa: ventanas MOVILES (ultimos N dias
// vs los N anteriores), no mes/semana natural, para no comparar un periodo
// actual parcial contra uno anterior completo (comparacion enganosa).
function rangosComparativa(hoyISO: string, periodo: 'semana' | 'mes'): {
  actualDesde: string; actualHasta: string; anteriorDesde: string; anteriorHasta: string;
  labelActual: string; labelAnterior: string;
} {
  const n = periodo === 'semana' ? 7 : 30;
  const hoy = new Date(`${hoyISO}T00:00:00Z`);
  const actualDesdeDate = new Date(hoy.getTime() - (n - 1) * 86_400_000);
  const anteriorHastaDate = new Date(actualDesdeDate.getTime() - 86_400_000);
  const anteriorDesdeDate = new Date(anteriorHastaDate.getTime() - (n - 1) * 86_400_000);
  return {
    actualDesde: actualDesdeDate.toISOString().slice(0, 10),
    actualHasta: hoyISO,
    anteriorDesde: anteriorDesdeDate.toISOString().slice(0, 10),
    anteriorHasta: anteriorHastaDate.toISOString().slice(0, 10),
    labelActual: periodo === 'semana' ? 'Ultimos 7 dias' : 'Ultimos 30 dias',
    labelAnterior: periodo === 'semana' ? '7 dias anteriores' : '30 dias anteriores',
  };
}

async function totalIngresosRango(negocioId: string, desde: string, hasta: string): Promise<number> {
  const { data } = await svc
    .from('cobros')
    .select('total_cents')
    .eq('negocio_id', negocioId)
    .eq('estado', 'completado')
    .gte('cobrado_at', `${desde}T00:00:00`)
    .lte('cobrado_at', `${hasta}T23:59:59`);
  const cents = ((data ?? []) as { total_cents: number | null }[]).reduce((s, r) => s + (r.total_cents ?? 0), 0);
  return Math.round(cents) / 100;
}

async function totalCitasRango(negocioId: string, desde: string, hasta: string): Promise<number> {
  const { count } = await svc
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('negocio_id', negocioId)
    .in('estado', ['confirmada', 'completada'])
    .gte('inicio', `${desde}T00:00:00`)
    .lte('inicio', `${hasta}T23:59:59`);
  return count ?? 0;
}

// Procesa la tool 'mostrar_comparativa': valida args, calcula ambos periodos
// reales y anade el bloque a bloquesExtra.
async function procesarComparativa(inp: Record<string, string>, negocioId: string, bloques: Bloque[]): Promise<string> {
  const metrica = (inp.metrica ?? '').trim().toLowerCase();
  if (metrica !== 'ingresos' && metrica !== 'citas') return 'Metrica no valida para la comparativa (usa ingresos o citas).';
  const periodo = (inp.periodo ?? '').trim().toLowerCase();
  if (periodo !== 'semana' && periodo !== 'mes') return 'Periodo no valido para la comparativa (usa semana o mes).';

  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const r = rangosComparativa(hoy, periodo);

  const [actual, anterior] = metrica === 'ingresos'
    ? await Promise.all([
        totalIngresosRango(negocioId, r.actualDesde, r.actualHasta),
        totalIngresosRango(negocioId, r.anteriorDesde, r.anteriorHasta),
      ])
    : await Promise.all([
        totalCitasRango(negocioId, r.actualDesde, r.actualHasta),
        totalCitasRango(negocioId, r.anteriorDesde, r.anteriorHasta),
      ]);

  bloques.push({
    tipo: 'comparativa',
    titulo: metrica === 'ingresos' ? 'Ingresos: periodo actual vs anterior' : 'Citas: periodo actual vs anterior',
    unidad: metrica === 'ingresos' ? 'eur' : 'citas',
    actual: { label: r.labelActual, valor: actual },
    anterior: { label: r.labelAnterior, valor: anterior },
  });
  return 'Comparativa anadida a la respuesta con los datos reales de ambos periodos.';
}

// ---------------------------------------------------------------------------
// S21 (capstone): resumen de GESTION de alto nivel. Orquesta lecturas de varias
// areas (agenda, caja, escaneo proactivo) y produce un panel accionable: KPIs +
// (tabla/barras) + un menu de acciones de un clic. Cada accion sigue siendo una
// PROPUESTA -> el usuario confirma (las labels del menu vuelven como turno y
// disparan la tarjeta de confirmacion individual, p.ej. confirmar_citas). Nada
// se ejecuta aqui; los envios reales quedan encolados por sus tools (reparto
// Alexandro). Solo direccion/propietario (gate informes.ver en LECTURA_CAP).
// ---------------------------------------------------------------------------
// Suma dias a una fecha YYYY-MM-DD (aritmetica en UTC: no depende de DST).
function diaISO(base: string, offset: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
// Etiqueta corta de dia de la semana (para barras/tabla), en hora de Madrid.
function nombreDiaCorto(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'Europe/Madrid' });
}
// Cuenta citas por estado en un rango [desde, hasta] (fechas YYYY-MM-DD inclusivas).
async function contarCitasRango(negocioId: string, desde: string, hasta: string): Promise<{ total: number; pendientes: number; canceladas: number; porDia: Record<string, number> }> {
  const { data } = await svc
    .from('citas')
    .select('inicio, estado')
    .eq('negocio_id', negocioId)
    .gte('inicio', `${desde}T00:00:00`)
    .lte('inicio', `${hasta}T23:59:59`);
  const filas = (data ?? []) as { inicio: string; estado: string | null }[];
  const porDia: Record<string, number> = {};
  let pendientes = 0;
  let canceladas = 0;
  for (const c of filas) {
    const dia = String(c.inicio).slice(0, 10);
    if (c.estado === 'cancelada') { canceladas++; continue; }
    porDia[dia] = (porDia[dia] ?? 0) + 1;
    if (c.estado === 'pendiente') pendientes++;
  }
  return { total: filas.length - canceladas, pendientes, canceladas, porDia };
}
// Total cobrado (libro de caja) en un dia concreto, en euros.
async function cobradoDia(negocioId: string, dia: string): Promise<number> {
  return await totalIngresosRango(negocioId, dia, dia);
}
// Rango de severidad de un hallazgo para ordenar (menor = mas urgente).
function rangoSeveridad(sev: string | null): number {
  return sev === 'urgente' ? 0 : sev === 'alta' ? 1 : sev === 'media' ? 2 : 3;
}

// --- Cartera de clientes: lista + segmenta (RPC listar_clientes_ia). Empuja un
// panel (KPIs + tabla + acciones) y devuelve al LLM SOLO conteos: la PII (nombres)
// va en el bloque renderizado que ve el equipo, nunca al modelo. Sin datos de salud.
const SEGMENTOS_CLIENTES: Record<string, string> = {
  todos: 'Toda la cartera',
  vip: 'Clientes VIP',
  recurrentes: 'Clientes recurrentes',
  nuevos: 'Clientes nuevos',
  en_riesgo: 'Clientes en riesgo de no-show',
  fuga: 'Clientes en fuga',
  inactivos: 'Clientes inactivos',
};

async function procesarListarClientes(
  inp: Record<string, string>,
  negocioId: string,
  bloques: Bloque[],
): Promise<string> {
  const segRaw = (inp.segmento ?? 'todos').trim().toLowerCase();
  const segmento = SEGMENTOS_CLIENTES[segRaw] ? segRaw : 'todos';
  const ordRaw = (inp.orden ?? 'reciente').trim().toLowerCase();
  const orden = ['reciente', 'gasto', 'frecuencia', 'alfabetico'].includes(ordRaw) ? ordRaw : 'reciente';
  const limite = Math.min(Math.max(parseInt(inp.limite ?? '20', 10) || 20, 1), 50);
  const tituloSeg = SEGMENTOS_CLIENTES[segmento];

  const { data, error } = await svc.rpc('listar_clientes_ia', {
    p_negocio: negocioId, p_segmento: segmento, p_orden: orden, p_limite: limite,
  });
  if (error) return `No pude cargar la cartera de clientes: ${error.message}`;
  const res = (data ?? {}) as {
    total?: number; excluidos_consentimiento?: number;
    items?: { nombre: string; ultima_visita: string | null; total_visitas: number; gasto_eur: number; riesgo: string }[];
  };
  const items = res.items ?? [];
  const total = res.total ?? 0;
  const excluidos = res.excluidos_consentimiento ?? 0;

  const tarjetas: { label: string; valor: number; unidad: ChispaUnidad }[] = [
    { label: 'En la cartera', valor: total, unidad: 'citas' },
    { label: 'Mostrados', valor: items.length, unidad: 'citas' },
  ];
  if (excluidos > 0) tarjetas.push({ label: 'Sin consentimiento IA', valor: excluidos, unidad: 'citas' });
  bloques.push({ tipo: 'kpi', titulo: tituloSeg, tarjetas });

  if (items.length > 0) {
    const sufijoOrden = orden === 'gasto' ? 'por gasto' : orden === 'frecuencia' ? 'por frecuencia' : orden === 'alfabetico' ? 'A-Z' : 'mas recientes';
    bloques.push({
      tipo: 'tabla',
      titulo: `${tituloSeg} (${sufijoOrden})`,
      columnas: [
        { key: 'nombre', label: 'Cliente' },
        { key: 'ultima', label: 'Ultima visita' },
        { key: 'visitas', label: 'Visitas' },
        { key: 'gasto', label: 'Gasto' },
        { key: 'riesgo', label: 'Riesgo' },
      ],
      filas: items.map((c) => ({
        nombre: c.nombre,
        ultima: c.ultima_visita ?? '—',
        visitas: String(c.total_visitas ?? 0),
        gasto: `${(c.gasto_eur ?? 0).toFixed(2)} €`,
        riesgo: c.riesgo === 'alto' ? 'Alto' : c.riesgo === 'medio' ? 'Medio' : 'Bajo',
      })),
    });
  }

  const opciones: { valor: string; label: string; descripcion?: string }[] = [];
  if (segmento === 'fuga' || segmento === 'inactivos') {
    opciones.push({ valor: 'listar_riesgo', label: 'Ver clientes en riesgo de no-show', descripcion: 'Otro segmento util' });
  } else if (segmento !== 'vip') {
    opciones.push({ valor: 'listar_vip', label: 'Ver mis clientes VIP', descripcion: 'Los que mas vienen y mas gastan' });
  }
  opciones.push({ valor: 'ver_clientes', label: 'Abrir la pantalla de Clientes', descripcion: 'La cartera completa con filtros' });
  bloques.push({ tipo: 'opciones', id: `clientes-${segmento}-${Date.now()}`, titulo: 'Que hacemos con ellos?', opciones });

  if (items.length === 0) {
    return `No hay clientes en el segmento "${tituloSeg}" (cartera total: ${total}${excluidos ? `, ${excluidos} sin consentimiento IA no listados` : ''}). Dilo con naturalidad y ofrece ver otro segmento o abrir Clientes.`;
  }
  return `Panel de clientes inyectado (KPIs + tabla${excluidos ? ` + ${excluidos} sin consentimiento IA no listados` : ''}). Segmento "${tituloSeg}", ${items.length} de ${total} en la cartera. La tabla YA se muestra: resume en 1 frase (sin inventar nombres ni cifras, sin repetir la tabla) e invita a pulsar una accion.`;
}

async function procesarResumenGestion(
  inp: Record<string, string>,
  negocioId: string,
  hoy: string,
  bloques: Bloque[],
): Promise<string> {
  const foco = (inp.foco ?? 'cierre_dia').trim().toLowerCase();
  const manana = diaISO(hoy, 1);

  // --- PANORAMA: "analiza mi salon" de un vistazo (caja + agenda + clientes + avisos) ---
  if (foco === 'panorama' || foco === 'analisis' || foco === 'analizar' || foco === 'todo') {
    const hoyCitas = await contarCitasRango(negocioId, hoy, hoy);
    const mananaCitas = await contarCitasRango(negocioId, manana, manana);
    const cobrado = await cobradoDia(negocioId, hoy);
    const pend = hoyCitas.pendientes + mananaCitas.pendientes;

    const [totalCli, nuevosCli, riesgoCli] = await Promise.all([
      svc.from('clientes').select('id', { count: 'exact', head: true }).eq('negocio_id', negocioId),
      svc.from('clientes').select('id', { count: 'exact', head: true }).eq('negocio_id', negocioId).gte('primera_visita', diaISO(hoy, -30)),
      svc.from('clientes').select('id', { count: 'exact', head: true }).eq('negocio_id', negocioId).or('noshows_count.gte.1,perfil_riesgo.in.(medio,alto)'),
    ]);

    const { data: hallData } = await svc
      .from('hallazgos_ia').select('severidad, familia, resumen')
      .eq('negocio_id', negocioId).eq('estado', 'nuevo')
      .order('creado_en', { ascending: false }).limit(20);
    const hallazgos = ((hallData ?? []) as { severidad: string | null; familia: string | null; resumen: string | null }[])
      .sort((a, b) => rangoSeveridad(a.severidad) - rangoSeveridad(b.severidad));

    bloques.push({
      tipo: 'kpi',
      titulo: 'Tu salon de un vistazo',
      tarjetas: [
        { label: 'Cobrado hoy', valor: cobrado, unidad: 'eur' },
        { label: 'Citas hoy', valor: hoyCitas.total, unidad: 'citas' },
        { label: 'Sin confirmar (hoy y manana)', valor: pend, unidad: 'citas' },
      ],
    });
    bloques.push({
      tipo: 'kpi',
      titulo: 'Cartera de clientes',
      tarjetas: [
        { label: 'Clientes', valor: totalCli.count ?? 0, unidad: 'citas' },
        { label: 'Nuevos (30 dias)', valor: nuevosCli.count ?? 0, unidad: 'citas' },
        { label: 'En riesgo', valor: riesgoCli.count ?? 0, unidad: 'citas' },
      ],
    });
    if (hallazgos.length > 0) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Avisos de Chispa',
        columnas: [
          { key: 'severidad', label: 'Prioridad' },
          { key: 'resumen', label: 'Aviso' },
          { key: 'area', label: 'Area' },
        ],
        filas: hallazgos.slice(0, 6).map((h) => ({
          severidad: (h.severidad ?? 'baja').toUpperCase(),
          resumen: h.resumen ?? '',
          area: h.familia ?? '',
        })),
      });
    }

    const opciones: { valor: string; label: string; descripcion?: string }[] = [];
    if (pend > 0) opciones.push({ valor: 'conf', label: `Confirmar las ${pend} citas pendientes`, descripcion: 'Las dejo confirmadas' });
    opciones.push({ valor: 'org', label: 'Organizar la agenda de hoy', descripcion: 'Compactar huecos (propuesta)' });
    opciones.push({ valor: 'cli_riesgo', label: 'Ver clientes en riesgo de fuga', descripcion: 'Para recuperarlos' });
    if (hallazgos.length > 0) opciones.push({ valor: 'avisos', label: 'Revisar todos los avisos', descripcion: 'El detalle del escaneo' });
    bloques.push({ tipo: 'opciones', id: `gestion-panorama-${Date.now()}`, titulo: 'Por donde quieres empezar?', opciones });

    return `Panel 360 del salon inyectado (caja + agenda + clientes + avisos, datos reales). ${cobrado.toFixed(2)}€ hoy, ${hoyCitas.total} citas hoy, ${pend} sin confirmar, ${totalCli.count ?? 0} clientes (${riesgoCli.count ?? 0} en riesgo), ${hallazgos.length} avisos. Resume en 2 frases lo mas importante SIN repetir las cifras de las tarjetas e invita a pulsar una accion.`;
  }

  // --- URGENTE: escaneo proactivo 24/7 (hallazgos_ia, S13) + pendientes proximos ---
  if (foco === 'urgente') {
    const { data: hallData } = await svc
      .from('hallazgos_ia')
      .select('severidad, familia, resumen, accion_sugerida')
      .eq('negocio_id', negocioId)
      .eq('estado', 'nuevo')
      .order('creado_en', { ascending: false })
      .limit(20);
    const hallazgos = ((hallData ?? []) as {
      severidad: string | null; familia: string | null; resumen: string | null;
      accion_sugerida: { tipo?: string; label?: string; payload?: { destino?: string } } | null;
    }[]).sort((a, b) => rangoSeveridad(a.severidad) - rangoSeveridad(b.severidad));

    const hoyCitas = await contarCitasRango(negocioId, hoy, hoy);
    const mananaCitas = await contarCitasRango(negocioId, manana, manana);
    const pendientesProximos = hoyCitas.pendientes + mananaCitas.pendientes;
    const criticos = hallazgos.filter((h) => h.severidad === 'urgente' || h.severidad === 'alta').length;

    bloques.push({
      tipo: 'kpi',
      titulo: 'Lo urgente ahora mismo',
      tarjetas: [
        { label: 'Avisos criticos', valor: criticos, unidad: 'citas' },
        { label: 'Avisos totales', valor: hallazgos.length, unidad: 'citas' },
        { label: 'Sin confirmar (hoy y manana)', valor: pendientesProximos, unidad: 'citas' },
      ],
    });

    if (hallazgos.length > 0) {
      bloques.push({
        tipo: 'tabla',
        titulo: 'Avisos de Chispa',
        columnas: [
          { key: 'severidad', label: 'Prioridad' },
          { key: 'resumen', label: 'Aviso' },
          { key: 'area', label: 'Area' },
        ],
        filas: hallazgos.slice(0, 8).map((h) => ({
          severidad: (h.severidad ?? 'baja').toUpperCase(),
          resumen: h.resumen ?? '',
          area: h.familia ?? '',
        })),
      });
    }

    // Enlaces directos a las areas de los hallazgos con accion "ir_a" (dedup).
    const destinosVistos = new Set<string>();
    for (const h of hallazgos.slice(0, 6)) {
      const dest = h.accion_sugerida?.tipo === 'ir_a' ? h.accion_sugerida?.payload?.destino : undefined;
      if (dest && RUTAS[dest] && !destinosVistos.has(dest)) {
        destinosVistos.add(dest);
        bloques.push({ tipo: 'enlace', ruta: RUTAS[dest].ruta, label: RUTAS[dest].label, descripcion: h.resumen ?? undefined });
      }
    }

    // Menu de acciones de un clic (cada label vuelve como turno -> propone->confirma).
    const opciones: { valor: string; label: string; descripcion?: string }[] = [];
    if (pendientesProximos > 0) {
      opciones.push({ valor: 'conf_manana', label: `Confirmar las ${mananaCitas.pendientes || pendientesProximos} citas pendientes de manana`, descripcion: 'Las reviso y las dejo confirmadas' });
    }
    opciones.push({ valor: 'ver_todo', label: 'Repasar avisos en la pantalla de Avisos', descripcion: 'Ver el detalle completo del escaneo' });
    opciones.push({ valor: 'cierre', label: 'Hacer el cierre del dia', descripcion: 'Balance de hoy y lo que queda' });
    bloques.push({ tipo: 'opciones', id: `gestion-urgente-${Date.now()}`, titulo: 'Por donde empezamos?', opciones });

    return `Panel de lo urgente inyectado (KPIs + tabla de avisos + acciones). Datos reales: ${criticos} avisos criticos, ${hallazgos.length} avisos en total, ${pendientesProximos} citas sin confirmar entre hoy y manana. Resume en 1-2 frases lo mas importante y NO repitas cifras que ya se ven en las tarjetas; invita a pulsar una accion.`;
  }

  // --- PREPARAR SEMANA: proximos 7 dias (hoy incluido) ---
  if (foco === 'preparar_semana' || foco === 'semana') {
    const hasta = diaISO(hoy, 6);
    const semana = await contarCitasRango(negocioId, hoy, hasta);

    bloques.push({
      tipo: 'kpi',
      titulo: 'Tu semana de un vistazo',
      tarjetas: [
        { label: 'Citas esta semana', valor: semana.total, unidad: 'citas' },
        { label: 'Sin confirmar', valor: semana.pendientes, unidad: 'citas' },
      ],
    });

    // Barras: citas por dia (7 dias, incluidos los vacios para ver los huecos).
    const datosDias = Array.from({ length: 7 }, (_, i) => {
      const d = diaISO(hoy, i);
      return { etiqueta: nombreDiaCorto(d), valor: semana.porDia[d] ?? 0 };
    });
    bloques.push({ tipo: 'barras', titulo: 'Citas por dia', unidad: 'citas', datos: datosDias });

    const opciones: { valor: string; label: string; descripcion?: string }[] = [];
    const mananaCitas = await contarCitasRango(negocioId, manana, manana);
    if (mananaCitas.pendientes > 0) {
      opciones.push({ valor: 'conf_manana', label: `Confirmar las ${mananaCitas.pendientes} citas pendientes de manana`, descripcion: 'Empieza por el dia mas cercano' });
    }
    opciones.push({ valor: 'org_manana', label: 'Organizar la agenda de manana', descripcion: 'Compactar huecos muertos (propuesta)' });
    opciones.push({ valor: 'urgente', label: 'Revisar lo urgente', descripcion: 'Avisos del escaneo de Chispa' });
    bloques.push({ tipo: 'opciones', id: `gestion-semana-${Date.now()}`, titulo: 'Preparamos la semana?', opciones });

    return `Panel de la semana inyectado (KPIs + barras por dia + acciones). Datos reales: ${semana.total} citas los proximos 7 dias, ${semana.pendientes} sin confirmar. Resume en 1-2 frases (senala si hay dias flojos o cargados) sin repetir las cifras de las tarjetas; invita a pulsar una accion.`;
  }

  // --- CIERRE DEL DIA (por defecto) ---
  const hoyCitas = await contarCitasRango(negocioId, hoy, hoy);
  const mananaCitas = await contarCitasRango(negocioId, manana, manana);
  const cobrado = await cobradoDia(negocioId, hoy);

  bloques.push({
    tipo: 'kpi',
    titulo: 'Cierre del dia',
    tarjetas: [
      { label: 'Citas hoy', valor: hoyCitas.total, unidad: 'citas' },
      { label: 'Cobrado hoy', valor: cobrado, unidad: 'eur' },
      { label: 'Sin confirmar manana', valor: mananaCitas.pendientes, unidad: 'citas' },
    ],
  });

  const opciones: { valor: string; label: string; descripcion?: string }[] = [];
  if (hoyCitas.pendientes > 0) {
    opciones.push({ valor: 'conf_hoy', label: `Confirmar las ${hoyCitas.pendientes} citas pendientes de hoy`, descripcion: 'Cierra hoy sin cabos sueltos' });
  }
  if (mananaCitas.pendientes > 0) {
    opciones.push({ valor: 'conf_manana', label: `Confirmar las ${mananaCitas.pendientes} citas pendientes de manana`, descripcion: 'Deja manana listo' });
  }
  opciones.push({ valor: 'caja', label: 'Ver el detalle de la caja de hoy', descripcion: 'Efectivo, datafono y propinas' });
  opciones.push({ valor: 'urgente', label: 'Revisar lo urgente antes de cerrar', descripcion: 'Avisos del escaneo de Chispa' });
  bloques.push({ tipo: 'opciones', id: `gestion-cierre-${Date.now()}`, titulo: 'Cerramos el dia?', opciones });

  // Enlace a caja para el arqueo completo.
  bloques.push({ tipo: 'enlace', ruta: RUTAS.caja.ruta, label: RUTAS.caja.label, descripcion: 'Para el arqueo del dia' });

  return `Panel de cierre del dia inyectado (KPIs + acciones). Datos reales: ${hoyCitas.total} citas hoy, ${cobrado.toFixed(2)} euros cobrados, ${mananaCitas.pendientes} sin confirmar manana, ${hoyCitas.pendientes} sin confirmar hoy. Resume en 1-2 frases el balance del dia sin repetir las cifras de las tarjetas; invita a pulsar una accion.`;
}

// ---------------------------------------------------------------------------
// Helpers de tiempo: interpretar la hora del LLM como hora local de Madrid.
// ---------------------------------------------------------------------------
function offsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

// Si la cadena trae zona (Z u offset) se respeta; si es naive se interpreta
// como hora local de Madrid y se convierte al instante UTC correcto (con DST).
function parseInstante(s: string): Date {
  const v = s.trim();
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(v);
  if (tieneZona) return new Date(v);
  const provisional = new Date(v.replace(' ', 'T') + 'Z');
  if (isNaN(provisional.getTime())) return provisional;
  const off = offsetMinutes(provisional, 'Europe/Madrid');
  return new Date(provisional.getTime() - off * 60000);
}

// ---------------------------------------------------------------------------
// Construir propuesta de ESCRITURA (resuelve nombres→ids, calcula fines, marca solapa)
// ---------------------------------------------------------------------------
// Construye el campo de 'formulario' adecuado para UNA clave de CONFIG_EDITABLE
// dentro de un formulario con VARIOS campos (bool/enum se piden con un 'select'
// dentro del propio formulario). Reutilizable para cualquier clave nueva que se
// anada a CONFIG_EDITABLE (catalogo EXTENSIBLE, Sesion 3 V2).
function campoParaClave(clave: string, meta: ConfigMeta, valorPrefill?: string): CampoFormulario {
  if (meta.tipo === 'bool') {
    return {
      key: clave, label: meta.label, tipo: 'select', requerido: true,
      opciones: [{ valor: 'activar', label: 'Activar' }, { valor: 'desactivar', label: 'Desactivar' }],
    };
  }
  if (meta.tipo === 'enum') {
    return { key: clave, label: meta.label, tipo: 'select', requerido: true, opciones: (meta.valores ?? []).map((v) => ({ valor: v, label: v })) };
  }
  if (meta.tipo === 'hora') return { key: clave, label: meta.label, tipo: 'hora', requerido: true, valor: valorPrefill };
  return { key: clave, label: meta.label, tipo: meta.tipo === 'num' ? 'numero' : 'texto', requerido: true, valor: valorPrefill };
}

type CambioConfigRaw = { clave?: string; valor?: string };

// Construye la propuesta de cambio de configuracion. Acepta uno o VARIOS
// cambios a la vez (Sesion 3 V2: "cambios" es un array; ver tool cambiar_config).
// Si falta o es invalido el valor de alguna clave, en vez de un error de texto
// devuelve un 'formulario'/'opciones' (pedirInfo) SOLO con lo que falta,
// pre-rellenado con lo que ya se pudo interpretar.
async function construirPropuestaConfig(
  inpRaw: Record<string, unknown>,
  negocioId: string,
): Promise<AccionPropuesta | { error: string } | { pedirInfo: Bloque }> {
  const cambiosIn: CambioConfigRaw[] = Array.isArray(inpRaw.cambios)
    ? (inpRaw.cambios as CambioConfigRaw[]).filter((c) => c && typeof c === 'object')
    : inpRaw.clave
    ? [{ clave: String(inpRaw.clave), valor: inpRaw.valor != null ? String(inpRaw.valor) : undefined }]
    : [];
  if (cambiosIn.length === 0) return { error: 'Dime que ajuste quieres cambiar.' };

  const metas: { clave: string; meta: ConfigMeta; raw?: string }[] = [];
  for (const c of cambiosIn) {
    const clave = (c.clave ?? '').trim();
    const meta = CONFIG_EDITABLE[clave];
    if (!meta) return { error: `"${clave}" no es un ajuste que pueda cambiar. Dime en palabras que quieres cambiar y te digo si se puede.` };
    metas.push({ clave, meta, raw: c.valor != null ? String(c.valor) : undefined });
  }

  const { data: cfgRow } = await svc.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
  const cfgActual = (cfgRow?.config ?? {}) as Record<string, unknown>;
  const fmt = (meta: ConfigMeta, val: unknown): string =>
    meta.tipo === 'bool' ? (val ? 'activado' : 'desactivado') : (val === undefined || val === null ? '(sin definir)' : String(val));

  const resueltos: { clave: string; meta: ConfigMeta; valor: boolean | number | string; valorActual: boolean | number | string | null }[] = [];
  const faltantes: { clave: string; meta: ConfigMeta; valorPrefill?: string }[] = [];
  for (const { clave, meta, raw } of metas) {
    const actual = (cfgActual[clave] ?? null) as boolean | number | string | null;
    if (raw == null || raw.trim() === '') { faltantes.push({ clave, meta }); continue; }
    const c = coerceConfigValor(meta, raw);
    if (!c.ok) { faltantes.push({ clave, meta, valorPrefill: raw }); continue; }
    resueltos.push({ clave, meta, valor: c.valor, valorActual: actual });
  }

  // Un UNICO ajuste faltante y de eleccion (bool/enum): 'opciones' standalone,
  // se responde de un toque. El resto (varios, o un numero/hora/texto suelto)
  // va en UN 'formulario'.
  if (faltantes.length === 1 && (faltantes[0].meta.tipo === 'bool' || faltantes[0].meta.tipo === 'enum')) {
    const { meta } = faltantes[0];
    return {
      pedirInfo: {
        tipo: 'opciones', id: crypto.randomUUID(), titulo: meta.label,
        opciones: meta.tipo === 'bool'
          ? [{ valor: 'activar', label: 'Activar' }, { valor: 'desactivar', label: 'Desactivar' }]
          : (meta.valores ?? []).map((v) => ({ valor: v, label: v })),
      },
    };
  }
  if (faltantes.length > 0) {
    return {
      pedirInfo: {
        tipo: 'formulario', id: crypto.randomUUID(),
        titulo: faltantes.length === 1 ? faltantes[0].meta.label : 'Completa estos ajustes',
        campos: faltantes.map((f) => campoParaClave(f.clave, f.meta, f.valorPrefill)),
        enviarLabel: 'Guardar',
      },
    };
  }

  if (resueltos.length === 1) {
    const r = resueltos[0];
    return {
      tipo: 'cambiar_config',
      negocio_id: negocioId,
      clave: r.clave,
      label: r.meta.label,
      valor: r.valor,
      valor_actual: r.valorActual,
      resumen: `Cambiar "${r.meta.label}": ${fmt(r.meta, r.valorActual)} -> ${fmt(r.meta, r.valor)}`,
    };
  }
  return {
    tipo: 'cambiar_config_multiple',
    negocio_id: negocioId,
    cambios: resueltos.map((r) => ({ clave: r.clave, label: r.meta.label, valor: r.valor, valor_actual: r.valorActual })),
    resumen: resueltos.map((r) => `"${r.meta.label}": ${fmt(r.meta, r.valorActual)} -> ${fmt(r.meta, r.valor)}`).join('; '),
  };
}

export async function construirPropuesta(
  t: { name: string; input: Record<string, string> },
  negocioId: string,
  scope: 'all' | 'self',
  userId: string,
): Promise<AccionPropuesta | { error: string } | { pedirInfo: Bloque }> {
  const inp = (t.input ?? {}) as Record<string, string>;

  switch (t.name) {
    case 'crear_cita': {
      // 1-3. Resolver servicio/profesional/inicio "con minima info" (Sesion 3
      // V2): si falta o es ambiguo, se pide con UN formulario/opciones (solo lo
      // que falta) en vez de bloquear con un error de texto.
      const { data: serviciosTodos } = await svc
        .from('servicios')
        .select('id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min')
        .eq('negocio_id', negocioId)
        .eq('activo', true);
      const listaServicios = (serviciosTodos ?? []) as {
        id: string; nombre: string; duracion_activa_min: number | null;
        duracion_espera_min: number | null; duracion_activa_extra_min: number | null;
      }[];
      let servicio: (typeof listaServicios)[number] | null = null;
      let opcionesServicio: { valor: string; label: string }[] = [];
      if (!inp.servicio?.trim()) {
        opcionesServicio = listaServicios.map((s) => ({ valor: s.nombre, label: s.nombre }));
      } else {
        const coincidencias = listaServicios.filter((s) => s.nombre.toLowerCase().includes(inp.servicio.toLowerCase()));
        if (coincidencias.length === 1) servicio = coincidencias[0];
        else opcionesServicio = (coincidencias.length > 1 ? coincidencias : listaServicios).map((s) => ({ valor: s.nombre, label: s.nombre }));
      }

      const { data: profesTodos } = await svc
        .from('profesionales').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true);
      const listaProfes = (profesTodos ?? []) as { id: string; nombre: string }[];
      let profesional: { id: string; nombre: string } | null = null;
      let opcionesProfesional: { valor: string; label: string }[] = [];
      if (scope === 'self') {
        // Un profesional solo puede citarse a si mismo: se resuelve directo,
        // sin preguntar (menos info a pedir) y sin exponer nombres de otros.
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        const mio = listaProfes.find((p) => p.id === miProfId);
        if (!mio) return { error: 'Tu cuenta de profesional no esta vinculada a ningun perfil de la agenda. Contacta con direccion.' };
        profesional = mio;
      } else if (!inp.profesional?.trim()) {
        opcionesProfesional = listaProfes.map((p) => ({ valor: p.nombre, label: p.nombre }));
      } else {
        const coincidencias = listaProfes.filter((p) => p.nombre.toLowerCase().includes(inp.profesional.toLowerCase()));
        if (coincidencias.length === 1) profesional = coincidencias[0];
        else opcionesProfesional = (coincidencias.length > 1 ? coincidencias : listaProfes).map((p) => ({ valor: p.nombre, label: p.nombre }));
      }

      const inicioTxt = (inp.inicio ?? '').trim();
      const inicioParseado = inicioTxt ? parseInstante(inicioTxt) : null;
      const inicioValido = !!inicioParseado && !isNaN(inicioParseado.getTime());

      const totalFaltan = [!servicio, !profesional, !inicioValido].filter(Boolean).length;
      if (totalFaltan === 1 && !servicio) {
        return { pedirInfo: { tipo: 'opciones', id: crypto.randomUUID(), titulo: '¿Que servicio?', opciones: opcionesServicio } };
      }
      if (totalFaltan === 1 && !profesional) {
        return { pedirInfo: { tipo: 'opciones', id: crypto.randomUUID(), titulo: '¿Con quien?', opciones: opcionesProfesional } };
      }
      if (totalFaltan > 0) {
        const campos: CampoFormulario[] = [];
        if (!servicio) campos.push({ key: 'servicio', label: 'Servicio', tipo: 'select', requerido: true, opciones: opcionesServicio });
        if (!profesional) campos.push({ key: 'profesional', label: 'Profesional', tipo: 'select', requerido: true, opciones: opcionesProfesional });
        if (!inicioValido) campos.push({ key: 'inicio', label: 'Fecha y hora', tipo: 'texto', requerido: true, valor: inicioTxt || undefined });
        return { pedirInfo: { tipo: 'formulario', id: crypto.randomUUID(), titulo: 'Completa la cita', campos, enviarLabel: 'Continuar' } };
      }
      if (!servicio || !profesional || !inicioParseado) return { error: 'No se pudo resolver la cita.' };
      const inicio = inicioParseado;

      // 4. Resolver cliente (opcional)
      let clienteId: string | null = null;
      let clienteNombre: string | null = null;
      if (inp.cliente) {
        // Consentimiento IA: un cliente con consiente_ia=false es invisible para
        // la IA, asi que no se puede citar por asistente (se cita a mano).
        const { data: clientes } = await svc
          .from('clientes')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('consiente_ia', true)
          .or(`nombre.ilike.%${sanitizarFiltro(inp.cliente)}%,telefono.ilike.%${sanitizarFiltro(inp.cliente)}%`)
          .limit(5);

        if (!clientes || clientes.length === 0)
          return { error: `Cliente "${inp.cliente}" no encontrado. ¿Existe en el sistema?` };
        if (clientes.length > 1)
          return { error: `Varios clientes coinciden con "${inp.cliente}": ${clientes.map((c: { nombre: string }) => c.nombre).join(', ')}. ¿Cual es?` };

        clienteId = clientes[0].id;
        clienteNombre = clientes[0].nombre;
      }

      // 5. Calcular fines (inicio ya resuelto arriba)
      const durActiva: number = servicio.duracion_activa_min ?? 0;
      const durEspera: number = servicio.duracion_espera_min ?? 0;
      const durExtra: number = servicio.duracion_activa_extra_min ?? 0;

      const finActiva = new Date(inicio.getTime() + durActiva * 60_000);
      const finEspera = new Date(finActiva.getTime() + durEspera * 60_000);
      const fin = new Date(finEspera.getTime() + durExtra * 60_000);

      const inicioISO = inicio.toISOString();
      const finActivaISO = finActiva.toISOString();
      const finEsperaISO = finEspera.toISOString();
      const finISO = fin.toISOString();

      // 6. Detectar solapa (replica AgendaCalendar.web.tsx:3205-3220)
      const solapa = await detectarSolapa(profesional.id, inicioISO, finISO, finActivaISO);

      const resumen = `${servicio.nombre} con ${profesional.nombre}${clienteNombre ? ` para ${clienteNombre}` : ''} el ${inicio.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;

      return {
        tipo: 'crear_cita',
        negocio_id: negocioId,
        profesional_id: profesional.id,
        profesional_nombre: profesional.nombre,
        servicio_id: servicio.id,
        servicio_nombre: servicio.nombre,
        cliente_id: clienteId,
        cliente_nombre: clienteNombre,
        inicio: inicioISO,
        fin: finISO,
        fin_activa: finActivaISO,
        fin_espera: finEsperaISO,
        resumen,
        solapa,
      };
    }

    case 'reagendar_cita': {
      // 1. Obtener la cita existente con su servicio
      const { data: citaRow, error: eCita } = await svc
        .from('citas')
        .select('id, profesional_id, servicio_id, inicio')
        .eq('id', inp.cita_id)
        .eq('negocio_id', negocioId)
        .maybeSingle();

      if (eCita || !citaRow)
        return { error: `Cita ${inp.cita_id} no encontrada.` };

      // 2. Scope self: la cita debe ser del profesional del caller
      if (scope === 'self') {
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        if (miProfId !== citaRow.profesional_id)
          return { error: 'Solo puedes operar tu propia agenda.' };
      }

      // 3. Nuevo profesional (si se indica)
      let nuevoProfId: string | undefined;
      let nuevoProfNombre: string | undefined;
      if (inp.nuevo_profesional) {
        const { data: profes } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .ilike('nombre', `%${inp.nuevo_profesional}%`);
        if (!profes || profes.length === 0)
          return { error: `Profesional "${inp.nuevo_profesional}" no encontrado.` };
        if (profes.length > 1)
          return { error: `Varios profesionales coinciden: ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual?` };
        if (scope === 'self') {
          const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
          if (miProfId !== profes[0].id)
            return { error: 'Solo puedes operar tu propia agenda.' };
        }
        nuevoProfId = profes[0].id;
        nuevoProfNombre = profes[0].nombre;
      }

      // 4. Obtener duraciones del servicio
      const { data: servicio } = await svc
        .from('servicios')
        .select('duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, nombre')
        .eq('id', citaRow.servicio_id)
        .maybeSingle();

      const durActiva: number = servicio?.duracion_activa_min ?? 0;
      const durEspera: number = servicio?.duracion_espera_min ?? 0;
      const durExtra: number = servicio?.duracion_activa_extra_min ?? 0;

      // 5. Calcular fines con el nuevo inicio
      const nuevoInicio = parseInstante(inp.nuevo_inicio);
      if (isNaN(nuevoInicio.getTime()))
        return { error: `Hora de inicio no valida: "${inp.nuevo_inicio}"` };

      const nuevoFinActiva = new Date(nuevoInicio.getTime() + durActiva * 60_000);
      const nuevoFinEspera = new Date(nuevoFinActiva.getTime() + durEspera * 60_000);
      const nuevoFin = new Date(nuevoFinEspera.getTime() + durExtra * 60_000);

      const nuevoInicioISO = nuevoInicio.toISOString();
      const nuevoFinActivaISO = nuevoFinActiva.toISOString();
      const nuevoFinEsperaISO = nuevoFinEspera.toISOString();
      const nuevoFinISO = nuevoFin.toISOString();

      const profParaSolapa = nuevoProfId ?? citaRow.profesional_id;
      const solapa = await detectarSolapa(profParaSolapa, nuevoInicioISO, nuevoFinISO, nuevoFinActivaISO, inp.cita_id);

      const resumen = `Cita reagendada a ${nuevoInicio.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}${nuevoProfNombre ? ` con ${nuevoProfNombre}` : ''}`;

      const propuesta: AccionPropuesta = {
        tipo: 'reagendar_cita',
        cita_id: inp.cita_id,
        nuevo_inicio: nuevoInicioISO,
        nuevo_fin: nuevoFinISO,
        nuevo_fin_activa: nuevoFinActivaISO,
        nuevo_fin_espera: nuevoFinEsperaISO,
        resumen,
        solapa,
      };
      if (nuevoProfId) (propuesta as { nuevo_profesional_id?: string }).nuevo_profesional_id = nuevoProfId;
      return propuesta;
    }

    case 'cancelar_cita': {
      // Verificar que la cita es del negocio (y del propio profesional si scope===self)
      const { data: citaRow } = await svc
        .from('citas')
        .select('id, profesional_id')
        .eq('id', inp.cita_id)
        .eq('negocio_id', negocioId)
        .maybeSingle();

      if (!citaRow) return { error: `Cita ${inp.cita_id} no encontrada.` };

      if (scope === 'self') {
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        if (miProfId !== citaRow.profesional_id)
          return { error: 'Solo puedes cancelar citas de tu propia agenda.' };
      }

      return {
        tipo: 'cancelar_cita',
        cita_id: inp.cita_id,
        motivo: inp.motivo ?? null,
        resumen: `Cancelar cita ${inp.cita_id}${inp.motivo ? ` (${inp.motivo})` : ''}`,
      };
    }

    case 'bloquear_hueco': {
      const { data: profes } = await svc
        .from('profesionales')
        .select('id, nombre')
        .eq('negocio_id', negocioId)
        .ilike('nombre', `%${inp.profesional}%`);

      if (!profes || profes.length === 0)
        return { error: `Profesional "${inp.profesional}" no encontrado.` };
      if (profes.length > 1)
        return { error: `Varios profesionales coinciden: ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual?` };

      const profesional = profes[0];

      if (scope === 'self') {
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        if (miProfId !== profesional.id)
          return { error: 'Solo puedes bloquear tu propia agenda.' };
      }

      const inicio = parseInstante(inp.inicio);
      const fin = parseInstante(inp.fin);
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime()))
        return { error: 'Rango de horas no valido.' };

      const solapa = await detectarSolapa(profesional.id, inicio.toISOString(), fin.toISOString(), fin.toISOString());

      return {
        tipo: 'bloquear_hueco',
        negocio_id: negocioId,
        profesional_id: profesional.id,
        profesional_nombre: profesional.nombre,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
        motivo: inp.motivo ?? null,
        resumen: `Bloquear ${profesional.nombre} de ${inicio.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} a ${fin.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}${inp.motivo ? ` (${inp.motivo})` : ''}`,
        solapa,
      };
    }

    case 'liberar_hueco': {
      // Verificar que el bloqueo existe y pertenece al negocio
      const { data: bloqueo } = await svc
        .from('bloqueos_profesional')
        .select('id, profesional_id')
        .eq('id', inp.bloqueo_id)
        .eq('negocio_id', negocioId)
        .maybeSingle();

      if (!bloqueo) return { error: `Bloqueo ${inp.bloqueo_id} no encontrado.` };

      if (scope === 'self') {
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        if (miProfId !== bloqueo.profesional_id)
          return { error: 'Solo puedes liberar bloqueos de tu propia agenda.' };
      }

      return {
        tipo: 'liberar_hueco',
        bloqueo_id: inp.bloqueo_id,
        resumen: `Liberar bloqueo ${inp.bloqueo_id}`,
      };
    }

    case 'proponer_macro': {
      let macroPasos: any = [];
      if (typeof inp.pasos === 'string') {
        try {
          macroPasos = JSON.parse(inp.pasos);
        } catch {
          macroPasos = [];
        }
      } else {
        macroPasos = inp.pasos;
      }
      
      const { data, error } = await svc.from('chispa_macros').insert({
        negocio_id: negocioId,
        nombre: inp.nombre,
        descripcion: inp.descripcion,
        pasos: macroPasos,
        creado_por: 'ai_asistente',
        estado: 'revision'
      }).select('id').single();
      
      if (error) return { error: `Error creando la macro: ${error.message}` };
      
      return {
        tipo: 'aprobar_macro',
        negocio_id: negocioId,
        macro_id: data.id,
        nombre: inp.nombre,
        descripcion: inp.descripcion,
        resumen: `Aprobar macro: ${inp.nombre} (${inp.descripcion})`,
      };
    }


    // --- GESTION (Sesion 3) ---
    case 'confirmar_citas': {
      const fecha = (inp.fecha ?? '').trim();
      let profId: string | null = null;
      if (scope === 'self') {
        profId = await resolverProfesionalDelUsuario(negocioId, userId);
      } else if (inp.profesional) {
        const { data: profes } = await svc
          .from('profesionales').select('id, nombre')
          .eq('negocio_id', negocioId).ilike('nombre', `%${inp.profesional}%`);
        if (!profes || profes.length === 0) return { error: `Profesional "${inp.profesional}" no encontrado.` };
        if (profes.length > 1) return { error: `Varios profesionales coinciden: ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual?` };
        profId = profes[0].id;
      }

      let q = svc
        .from('citas').select('id, inicio, servicio_id, cliente_id')
        .eq('negocio_id', negocioId).eq('estado', 'pendiente');
      
      if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        q = q.gte('inicio', `${fecha}T00:00:00`).lte('inicio', `${fecha}T23:59:59`);
      } else {
        const hoyStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
        q = q.gte('inicio', `${hoyStr}T00:00:00`);
      }
      if (profId) q = q.eq('profesional_id', profId);
      q = q.order('inicio');
      
      const { data: citas } = await q;
      if (!citas || citas.length === 0) return { error: `No hay citas pendientes por confirmar${fecha ? ` el ${fecha}` : ' desde hoy'}.` };

      const servIds = [...new Set(citas.map((c: { servicio_id: string | null }) => c.servicio_id).filter(Boolean))] as string[];
      const cliIds = [...new Set(citas.map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean))] as string[];
      const [servRes, cliRes] = await Promise.all([
        servIds.length ? svc.from('servicios').select('id, nombre').in('id', servIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
        cliIds.length ? svc.from('clientes').select('id, nombre').eq('negocio_id', negocioId).eq('consiente_ia', true).in('id', cliIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      ]);
      const servMap = new Map((servRes.data ?? []).map((s: { id: string; nombre: string }) => [s.id, s.nombre]));
      const cliMap = new Map((cliRes.data ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));

      let lista = citas.map((c: { id: string; inicio: string; servicio_id: string | null; cliente_id: string | null }) => {
        const hora = new Date(c.inicio).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
        const serv = (c.servicio_id && servMap.get(c.servicio_id)) || 'Servicio';
        const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
        return { id: c.id, label: `${hora} · ${serv}${cli ? ` · ${cli}` : ''}`, clienteNombre: cli || '' };
      });

      let excluirNombres: string[] = [];
      if (inp.excluir_clientes) {
        if (Array.isArray(inp.excluir_clientes)) {
          excluirNombres = inp.excluir_clientes;
        } else if (typeof inp.excluir_clientes === 'string') {
          try {
            const parsed = JSON.parse(inp.excluir_clientes);
            if (Array.isArray(parsed)) excluirNombres = parsed;
            else excluirNombres = [inp.excluir_clientes];
          } catch {
            excluirNombres = String(inp.excluir_clientes).split(',').map(s => s.trim());
          }
        }
      }

      const normalizarNombre = (n: string) =>
        n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

      const excluidosNormalizados = excluirNombres.map(n => normalizarNombre(n));

      if (excluidosNormalizados.length > 0) {
        lista = lista.filter(item => {
          const cliNorm = normalizarNombre(item.clienteNombre);
          return !excluidosNormalizados.some(excl => cliNorm.includes(excl));
        });
      }

      if (lista.length === 0) return { error: 'Todas las citas pendientes coinciden con los criterios de exclusion.' };

      return {
        tipo: 'confirmar_citas',
        negocio_id: negocioId,
        citas: lista.map(item => ({ id: item.id, label: item.label })),
        resumen: `Confirmar ${lista.length} cita${lista.length === 1 ? '' : 's'}${fecha ? ` del ${fecha}` : ' pendientes'}`,
      };
    }

    case 'reenviar_confirmacion': {
      // Citas ya confirmadas por el salon pero que el CLIENTE aun no ha confirmado.
      const fecha = (inp.fecha ?? '').trim();
      let profId: string | null = null;
      if (scope === 'self') {
        profId = await resolverProfesionalDelUsuario(negocioId, userId);
      } else if (inp.profesional) {
        const { data: profes } = await svc
          .from('profesionales').select('id, nombre')
          .eq('negocio_id', negocioId).ilike('nombre', `%${inp.profesional}%`);
        if (!profes || profes.length === 0) return { error: `Profesional "${inp.profesional}" no encontrado.` };
        if (profes.length > 1) return { error: `Varios profesionales coinciden: ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual?` };
        profId = profes[0].id;
      }

      let q = svc
        .from('citas').select('id, inicio, servicio_id, cliente_id')
        .eq('negocio_id', negocioId).eq('estado', 'confirmada').eq('confirmada_cliente', false);
      if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        q = q.gte('inicio', `${fecha}T00:00:00`).lte('inicio', `${fecha}T23:59:59`);
      } else {
        const ahora = new Date();
        const en48h = new Date(ahora.getTime() + 48 * 3600000);
        q = q.gte('inicio', ahora.toISOString()).lte('inicio', en48h.toISOString());
      }
      if (profId) q = q.eq('profesional_id', profId);
      q = q.order('inicio');

      const { data: citas } = await q;
      if (!citas || citas.length === 0) return { error: `No hay citas pendientes de confirmar por el cliente${fecha ? ` el ${fecha}` : ' en las proximas 48h'}.` };

      const servIds = [...new Set(citas.map((c: { servicio_id: string | null }) => c.servicio_id).filter(Boolean))] as string[];
      const cliIds = [...new Set(citas.map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean))] as string[];
      const [servRes, cliRes] = await Promise.all([
        servIds.length ? svc.from('servicios').select('id, nombre').in('id', servIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
        cliIds.length ? svc.from('clientes').select('id, nombre').eq('negocio_id', negocioId).eq('consiente_ia', true).in('id', cliIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
      ]);
      const servMap = new Map((servRes.data ?? []).map((s: { id: string; nombre: string }) => [s.id, s.nombre]));
      const cliMap = new Map((cliRes.data ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]));

      const lista = citas.map((c: { id: string; inicio: string; servicio_id: string | null; cliente_id: string | null }) => {
        const hora = new Date(c.inicio).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
        const serv = (c.servicio_id && servMap.get(c.servicio_id)) || 'Servicio';
        const cli = c.cliente_id ? cliMap.get(c.cliente_id) : null;
        return { id: c.id, label: `${hora} · ${serv}${cli ? ` · ${cli}` : ''}` };
      });

      return {
        tipo: 'reenviar_confirmacion',
        negocio_id: negocioId,
        citas: lista,
        resumen: `Reenviar el recordatorio a ${lista.length} cliente${lista.length === 1 ? '' : 's'} que aun no ${lista.length === 1 ? 'ha' : 'han'} confirmado${fecha ? ` (${fecha})` : ''}`,
      };
    }

    case 'bulk_editar_horarios': {
      const diaSemanaValido = parseDiaSemana(inp.dia);
      if (diaSemanaValido === null) return { error: `Dia de la semana no valido: "${inp.dia}".` };
      const inicio = normalizaHora(inp.hora_inicio);
      const fin = normalizaHora(inp.hora_fin);
      if (!inicio || !fin) return { error: 'Horas de inicio o fin no validas (formato HH:MM).' };

      let listaProfes: string[] = [];
      if (inp.profesionales) {
        if (Array.isArray(inp.profesionales)) {
          listaProfes = inp.profesionales;
        } else if (typeof inp.profesionales === 'string') {
          try {
            const parsed = JSON.parse(inp.profesionales);
            if (Array.isArray(parsed)) listaProfes = parsed;
            else listaProfes = [inp.profesionales];
          } catch {
            listaProfes = String(inp.profesionales).split(',').map(s => s.trim());
          }
        }
      }

      if (listaProfes.length === 0) return { error: 'Debes indicar al menos un profesional o "todos".' };

      let targetProfes = [];
      if (listaProfes.map(p => p.toLowerCase()).includes('todos')) {
        const { data } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('activo', true);
        targetProfes = data ?? [];
      } else {
        const { data } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('activo', true);
        const all = data ?? [];
        for (const name of listaProfes) {
          const match = all.filter(p => p.nombre.toLowerCase().includes(name.toLowerCase()));
          targetProfes.push(...match);
        }
        const seen = new Set();
        targetProfes = targetProfes.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      }

      if (targetProfes.length === 0) return { error: 'No se encontraron profesionales activos coincidentes.' };

      return {
        tipo: 'bulk_editar_horarios',
        negocio_id: negocioId,
        dia: inp.dia,
        dia_semana: diaSemanaValido,
        hora_inicio: inicio,
        hora_fin: fin,
        profesionales: targetProfes.map(p => ({ id: p.id, nombre: p.nombre })),
        resumen: `Establecer horario los ${inp.dia}s (${inicio} - ${fin}) para: ${targetProfes.map(p => p.nombre).join(', ')}`,
      };
    }

    case 'bulk_editar_comisiones': {
      const pct = Number(inp.comision_pct);
      if (isNaN(pct) || pct < 0 || pct > 100) return { error: 'Porcentaje de comision no valido (debe ser entre 0 y 100).' };

      let listaProfes: string[] = [];
      if (inp.profesionales) {
        if (Array.isArray(inp.profesionales)) {
          listaProfes = inp.profesionales;
        } else if (typeof inp.profesionales === 'string') {
          try {
            const parsed = JSON.parse(inp.profesionales);
            if (Array.isArray(parsed)) listaProfes = parsed;
            else listaProfes = [inp.profesionales];
          } catch {
            listaProfes = String(inp.profesionales).split(',').map(s => s.trim());
          }
        }
      }

      if (listaProfes.length === 0) return { error: 'Debes indicar al menos un profesional o "todos".' };

      let targetProfes = [];
      if (listaProfes.map(p => p.toLowerCase()).includes('todos')) {
        const { data } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('activo', true);
        targetProfes = data ?? [];
      } else {
        const { data } = await svc
          .from('profesionales')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .eq('activo', true);
        const all = data ?? [];
        for (const name of listaProfes) {
          const match = all.filter(p => p.nombre.toLowerCase().includes(name.toLowerCase()));
          targetProfes.push(...match);
        }
        const seen = new Set();
        targetProfes = targetProfes.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      }

      if (targetProfes.length === 0) return { error: 'No se encontraron profesionales activos coincidentes.' };

      return {
        tipo: 'bulk_editar_comisiones',
        negocio_id: negocioId,
        comision_pct: pct,
        profesionales: targetProfes.map(p => ({ id: p.id, nombre: p.nombre })),
        resumen: `Fijar comision base al ${pct}% para: ${targetProfes.map(p => p.nombre).join(', ')}`,
      };
    }

    case 'editar_servicio': {
      // Resolver servicio "con minima info": si falta/es ambiguo/no se
      // encuentra, se pide con 'opciones' en vez de un error de texto.
      const { data: serviciosTodos } = await svc
        .from('servicios').select('id, nombre, precio, duracion_activa_min, activo, prepago_requerido, prepago_cantidad_fija')
        .eq('negocio_id', negocioId).eq('activo', true);
      const listaServicios = (serviciosTodos ?? []) as {
        id: string; nombre: string; precio: number | null; duracion_activa_min: number | null;
        activo: boolean; prepago_requerido: boolean | null; prepago_cantidad_fija: number | null;
      }[];
      let s: (typeof listaServicios)[number] | null = null;
      let opcionesServicio: { valor: string; label: string }[] = [];
      if (!inp.servicio?.trim()) {
        opcionesServicio = listaServicios.map((x) => ({ valor: x.nombre, label: x.nombre }));
      } else {
        const coincidencias = listaServicios.filter((x) => x.nombre.toLowerCase().includes(inp.servicio.toLowerCase()));
        if (coincidencias.length === 1) s = coincidencias[0];
        else opcionesServicio = (coincidencias.length > 1 ? coincidencias : listaServicios).map((x) => ({ valor: x.nombre, label: x.nombre }));
      }
      if (!s) {
        return { pedirInfo: { tipo: 'opciones', id: crypto.randomUUID(), titulo: '¿Que servicio quieres editar?', opciones: opcionesServicio } };
      }

      const cambios: {
        precio?: number; nombre?: string; duracion_activa_min?: number; activo?: boolean;
        prepago_requerido?: boolean; prepago_cantidad_fija?: number;
      } = {};
      const partes: string[] = [];
      if (inp.precio != null && String(inp.precio).trim() !== '') {
        const n = Number(String(inp.precio).replace(',', '.').replace(/[^0-9.]/g, ''));
        if (isNaN(n) || n < 0) return { error: `Precio no valido: "${inp.precio}".` };
        cambios.precio = n; partes.push(`precio ${s.precio ?? '-'}€ -> ${n}€`);
      }
      if (inp.nombre != null && String(inp.nombre).trim() !== '') {
        cambios.nombre = String(inp.nombre).trim(); partes.push(`nombre "${s.nombre}" -> "${cambios.nombre}"`);
      }
      if (inp.duracion_activa_min != null && String(inp.duracion_activa_min).trim() !== '') {
        const d = parseInt(String(inp.duracion_activa_min).replace(/[^0-9]/g, ''), 10);
        if (isNaN(d) || d <= 0) return { error: `Duracion no valida: "${inp.duracion_activa_min}".` };
        cambios.duracion_activa_min = d; partes.push(`duracion ${s.duracion_activa_min ?? '-'}min -> ${d}min`);
      }
      if (inp.activo != null && String(inp.activo).trim() !== '') {
        const v = String(inp.activo).trim().toLowerCase();
        const activar = ['activar', 'activado', 'activa', 'si', 'sí', 'true', 'on', '1'].includes(v);
        const desactivar = ['desactivar', 'desactivado', 'desactiva', 'no', 'false', 'off', '0'].includes(v);
        if (!activar && !desactivar) return { error: 'Para "activo" indica activar o desactivar.' };
        cambios.activo = activar; partes.push(activar ? 'activar' : 'desactivar');
      }
      if (inp.senal_activa != null && String(inp.senal_activa).trim() !== '') {
        const v = String(inp.senal_activa).trim().toLowerCase();
        const activar = ['activar', 'activado', 'activa', 'si', 'sí', 'true', 'on', '1'].includes(v);
        const desactivar = ['desactivar', 'desactivado', 'desactiva', 'no', 'false', 'off', '0'].includes(v);
        if (!activar && !desactivar) return { error: 'Para la senal indica activar o desactivar.' };
        cambios.prepago_requerido = activar;
        partes.push(`senal ${s.prepago_requerido ? 'activada' : 'desactivada'} -> ${activar ? 'activada' : 'desactivada'}`);
      }
      if (inp.senal_importe != null && String(inp.senal_importe).trim() !== '') {
        const n = Number(String(inp.senal_importe).replace(',', '.').replace(/[^0-9.]/g, ''));
        if (isNaN(n) || n < 0) return { error: `Importe de senal no valido: "${inp.senal_importe}".` };
        cambios.prepago_cantidad_fija = n;
        if (cambios.prepago_requerido == null) cambios.prepago_requerido = true;
        partes.push(`senal ${s.prepago_cantidad_fija ?? '-'}€ -> ${n}€`);
      }

      if (Object.keys(cambios).length === 0) {
        // Nada que cambiar todavia: formulario de edicion pre-rellenado con
        // los valores actuales (Sesion 3 V2, "actua con minima info").
        return {
          pedirInfo: {
            tipo: 'formulario', id: crypto.randomUUID(), titulo: `Editar ${s.nombre}`, enviarLabel: 'Guardar cambios',
            campos: [
              { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true, valor: s.nombre },
              { key: 'precio', label: 'Precio', tipo: 'euro', requerido: true, valor: s.precio ?? undefined },
              { key: 'duracion_activa_min', label: 'Duracion (min)', tipo: 'numero', requerido: true, valor: s.duracion_activa_min ?? undefined },
            ],
          },
        };
      }

      return {
        tipo: 'editar_servicio',
        negocio_id: negocioId,
        servicio_id: s.id,
        servicio_nombre: s.nombre,
        cambios,
        resumen: `${s.nombre}: ${partes.join(', ')}`,
      };
    }

    case 'crear_servicio': {
      const nombre = String(inp.nombre ?? '').trim();
      const precioRaw = String(inp.precio ?? '').trim();
      const duracionRaw = String(inp.duracion_activa_min ?? '').trim();
      const precioNum = precioRaw ? Number(precioRaw.replace(',', '.').replace(/[^0-9.]/g, '')) : NaN;
      const duracionNum = duracionRaw ? parseInt(duracionRaw.replace(/[^0-9]/g, ''), 10) : NaN;
      const nombreOk = nombre.length > 0;
      const precioOk = !isNaN(precioNum) && precioNum > 0;
      const duracionOk = !isNaN(duracionNum) && duracionNum > 0;

      if (nombreOk && precioOk && duracionOk) {
        return {
          tipo: 'crear_servicio', negocio_id: negocioId, nombre, precio: precioNum, duracion_activa_min: duracionNum,
          resumen: `${nombre} · ${precioNum.toFixed(2)}€ · ${duracionNum} min`,
        };
      }

      const campos: CampoFormulario[] = [];
      if (!nombreOk) campos.push({ key: 'nombre', label: 'Nombre del servicio', tipo: 'texto', requerido: true, valor: nombre || undefined });
      if (!precioOk) campos.push({ key: 'precio', label: 'Precio', tipo: 'euro', requerido: true, valor: precioRaw || undefined });
      if (!duracionOk) campos.push({ key: 'duracion_activa_min', label: 'Duracion (min)', tipo: 'numero', requerido: true, valor: duracionRaw || undefined });
      return { pedirInfo: { tipo: 'formulario', id: crypto.randomUUID(), titulo: 'Nuevo servicio', campos, enviarLabel: 'Crear servicio' } };
    }

    case 'cambiar_idioma_portal': {
      const IDIOMAS_PORTAL = [{ valor: 'es', label: 'Espanol' }, { valor: 'en', label: 'English' }];
      const idioma = String(inp.idioma ?? '').trim().toLowerCase();
      const valido = IDIOMAS_PORTAL.find((o) => o.valor === idioma);
      if (!valido) {
        return { pedirInfo: { tipo: 'opciones', id: crypto.randomUUID(), titulo: 'Idioma del portal de reserva', opciones: IDIOMAS_PORTAL } };
      }
      const { data: portal } = await svc.from('negocio_portal').select('idioma').eq('negocio_id', negocioId).maybeSingle();
      if (!portal) return { error: 'Primero activa el portal de reserva en Configuracion > Reserva online.' };
      const actual = (portal.idioma as string) ?? 'es';
      if (actual === idioma) return { error: `El portal ya esta en ${valido.label}.` };
      return {
        tipo: 'cambiar_idioma_portal', negocio_id: negocioId, idioma, idioma_actual: actual,
        resumen: `Cambiar idioma del portal: ${actual} -> ${idioma}`,
      };
    }

    case 'anadir_cierre_negocio': {
      const fecha = (inp.fecha ?? '').trim();
      const motivo = (inp.motivo ?? '').trim() || null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return {
          pedirInfo: {
            tipo: 'formulario', id: crypto.randomUUID(), titulo: 'Festivo / cierre del salon', enviarLabel: 'Anadir cierre',
            campos: [
              { key: 'fecha', label: 'Fecha', tipo: 'fecha', requerido: true, valor: fecha || undefined },
              { key: 'motivo', label: 'Motivo (opcional)', tipo: 'texto', valor: motivo ?? undefined },
            ],
          },
        };
      }
      return {
        tipo: 'crear_cierre_negocio', negocio_id: negocioId, fecha, motivo,
        resumen: `Marcar el ${fecha} como festivo/cierre${motivo ? ` (${motivo})` : ''}`,
      };
    }

    case 'editar_horario': {
      const { data: profes } = await svc
        .from('profesionales').select('id, nombre')
        .eq('negocio_id', negocioId).eq('activo', true).ilike('nombre', `%${inp.profesional}%`);
      if (!profes || profes.length === 0) return { error: `Profesional "${inp.profesional}" no encontrado.` };
      if (profes.length > 1) return { error: `Varios profesionales coinciden: ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual?` };
      const prof = profes[0];

      const dia = parseDiaSemana(inp.dia);
      if (dia == null) return { error: `No reconozco el dia "${inp.dia}". Usa lunes..domingo.` };
      const hi = normalizaHora(inp.hora_inicio);
      const hf = normalizaHora(inp.hora_fin);
      if (!hi || !hf) return { error: 'Indica horas validas en formato HH:MM.' };
      if (hi >= hf) return { error: 'La hora de entrada debe ser anterior a la de salida.' };

      const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      return {
        tipo: 'editar_horario',
        negocio_id: negocioId,
        profesional_id: prof.id,
        profesional_nombre: prof.nombre,
        dia_semana: dia,
        hora_inicio: hi,
        hora_fin: hf,
        resumen: `${prof.nombre}, ${dias[dia]}: ${hi}-${hf} (reemplaza el turno de ese dia)`,
      };
    }

    case 'crear_presupuesto': {
      const anyInp = inp as unknown as { lineas?: unknown; cliente?: string; titulo?: string };
      const lineasRaw = Array.isArray(anyInp.lineas) ? anyInp.lineas as Record<string, unknown>[] : [];
      if (lineasRaw.length === 0) return { error: 'Dime las lineas del presupuesto (concepto y, si no esta en el catalogo, precio).' };

      // Catalogo para resolver precios por nombre (no inventar precios).
      const { data: servs } = await svc.from('servicios').select('nombre, precio').eq('negocio_id', negocioId);
      const catalogo = new Map((servs ?? []).map((s: { nombre: string; precio: number | null }) => [String(s.nombre).toLowerCase(), Number(s.precio) || 0]));

      const lineas: { nombre: string; precio_cents: number; cantidad: number }[] = [];
      const faltanPrecio: { nombre: string; cantidad: number }[] = [];
      for (const l of lineasRaw) {
        const nombre = String((l.concepto ?? l.nombre ?? '')).trim();
        if (!nombre) continue;
        let euros: number | null = null;
        if (l.precio != null && String(l.precio).trim() !== '') {
          const n = Number(String(l.precio).replace(',', '.').replace(/[^0-9.]/g, ''));
          if (!isNaN(n)) euros = n;
        }
        if (euros == null) {
          const cat = catalogo.get(nombre.toLowerCase());
          if (cat != null) euros = cat;
        }
        const cantidad = Math.max(1, parseInt(String(l.cantidad ?? '1').replace(/[^0-9]/g, ''), 10) || 1);
        if (euros == null) { faltanPrecio.push({ nombre, cantidad }); continue; }
        lineas.push({ nombre, precio_cents: Math.round(euros * 100), cantidad });
      }

      // "Actua con minima info" (Sesion 3 V2): en vez de bloquear con un error
      // de texto pidiendo el precio de UNA linea, se pide con UN formulario
      // (una linea por precio que falte, aunque falten varias a la vez).
      if (faltanPrecio.length > 0) {
        return {
          pedirInfo: {
            tipo: 'formulario', id: crypto.randomUUID(),
            titulo: faltanPrecio.length === 1 ? `Precio de "${faltanPrecio[0].nombre}"` : 'Completa los precios que faltan',
            enviarLabel: 'Continuar',
            campos: faltanPrecio.map((f, i) => ({ key: `precio_${i}`, label: `Precio de "${f.nombre}"`, tipo: 'euro' as const, requerido: true })),
          },
        };
      }
      if (lineas.length === 0) return { error: 'No pude construir ninguna linea valida del presupuesto.' };

      let clienteId: string | null = null;
      let clienteNombre: string | null = null;
      if (anyInp.cliente) {
        const { data: clientes } = await svc
          .from('clientes').select('id, nombre')
          .eq('negocio_id', negocioId).eq('consiente_ia', true)
          .or(`nombre.ilike.%${sanitizarFiltro(String(anyInp.cliente))}%,telefono.ilike.%${sanitizarFiltro(String(anyInp.cliente))}%`)
          .limit(5);
        if (clientes && clientes.length === 1) { clienteId = clientes[0].id; clienteNombre = clientes[0].nombre; }
        else if (clientes && clientes.length > 1) return { error: `Varios clientes coinciden con "${anyInp.cliente}". ¿Cual?` };
        else clienteNombre = String(anyInp.cliente); // sin ficha: presupuesto a contacto libre
      }

      const total = lineas.reduce((sum, l) => sum + l.precio_cents * l.cantidad, 0);
      const titulo = anyInp.titulo ? String(anyInp.titulo) : null;
      const resumen = `Presupuesto${clienteNombre ? ` para ${clienteNombre}` : ''}: ${lineas.map((l) => `${l.cantidad}× ${l.nombre}`).join(', ')} — ${(total / 100).toFixed(2)}€`;
      return {
        tipo: 'crear_presupuesto',
        negocio_id: negocioId,
        cliente_id: clienteId,
        cliente_nombre: clienteNombre,
        titulo,
        lineas,
        total_cents: total,
        resumen,
      };
    }

    case 'enviar_mensaje_bandeja': {
      const cuerpo = String(inp.cuerpo ?? '').trim();
      if (!cuerpo) return { error: 'Dime que mensaje quieres registrar en la Bandeja.' };

      const { data: clientes } = await svc
        .from('clientes').select('id, nombre')
        .eq('negocio_id', negocioId).eq('consiente_ia', true)
        .or(`nombre.ilike.%${sanitizarFiltro(inp.cliente)}%,telefono.ilike.%${sanitizarFiltro(inp.cliente)}%`)
        .limit(5);
      if (!clientes || clientes.length === 0) return { error: `Cliente "${inp.cliente}" no encontrado (o sin consentimiento de IA).` };
      if (clientes.length > 1) return { error: `Varios clientes coinciden con "${inp.cliente}". ¿Cual?` };
      const cli = clientes[0];

      const { data: convs } = await svc
        .from('conversaciones').select('id, contacto_nombre')
        .eq('negocio_id', negocioId).eq('cliente_id', cli.id)
        .order('ultimo_mensaje_at', { ascending: false }).limit(1);
      if (!convs || convs.length === 0) {
        return { error: `No hay un hilo abierto con ${cli.nombre} en la Bandeja. Abrelo desde la Bandeja y vuelve a pedirmelo.` };
      }
      const conv = convs[0];

      return {
        tipo: 'enviar_mensaje_bandeja',
        negocio_id: negocioId,
        conversacion_id: conv.id,
        contacto_nombre: conv.contacto_nombre ?? cli.nombre,
        cuerpo,
        resumen: `Guardar en Bandeja para ${cli.nombre}: "${cuerpo.length > 60 ? cuerpo.slice(0, 57) + '...' : cuerpo}"`,
      };
    }

    case 'recuperar_cliente': {
      const { data: clientes } = await svc
        .from('clientes').select('id, nombre, ultima_visita, frecuencia_dias')
        .eq('negocio_id', negocioId).eq('consiente_ia', true)
        .or(`nombre.ilike.%${sanitizarFiltro(inp.cliente)}%,telefono.ilike.%${sanitizarFiltro(inp.cliente)}%`)
        .limit(5);
      if (!clientes || clientes.length === 0) return { error: `Cliente "${inp.cliente}" no encontrado (o sin consentimiento de IA).` };
      if (clientes.length > 1) return { error: `Varios clientes coinciden con "${inp.cliente}". ¿Cual?` };
      const cli = clientes[0] as { id: string; nombre: string; ultima_visita: string | null; frecuencia_dias: number | null };
      if (!cli.ultima_visita || cli.frecuencia_dias == null) {
        return { error: `Aun no tengo historial suficiente de ${cli.nombre} para preparar una propuesta de vuelta.` };
      }
      const dias = Math.max(0, Math.round((Date.now() - new Date(cli.ultima_visita).getTime()) / 86400000));
      return {
        tipo: 'recuperar_cliente',
        negocio_id: negocioId,
        cliente_id: cli.id,
        cliente_nombre: cli.nombre,
        dias_sin_venir: dias,
        resumen: `Preparar propuesta de vuelta para ${cli.nombre} (${dias} dias sin venir). El envio lo gestiona el equipo.`,
      };
    }

    case 'avisar_lista_espera': {
      // Llamar a la RPC matching_lista_espera (Sesion 8-B) para encontrar la mejor candidata.
      // La RPC devuelve { ok, candidata, cita_origen, mensaje }.
      const { data: match, error: eMatch } = await svc.rpc('matching_lista_espera', { p_cita_id: inp.cita_id });
      if (eMatch || !match) return { error: `No se ha podido buscar candidatas en lista de espera.` };
      const m = match as { ok: boolean; candidata: null | { lista_espera_id: string; nombre: string; servicio_nombre: string; profesional_nombre: string; fidelidad_citas: number; created_at: string }; cita_origen: null | { id: string; inicio: string }; mensaje: string };
      if (!m.ok || !m.candidata || !m.cita_origen) {
        // No hay candidatas: no es error, es una respuesta válida (información)
        return { error: m.mensaje || 'No hay candidatas compatibles en lista de espera para este hueco.' };
      }
      const fechaHora = new Date(m.cita_origen.inicio).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const resumen = `Avisar a ${m.candidata.nombre} (${m.candidata.fidelidad_citas} citas) para ${m.candidata.servicio_nombre} con ${m.candidata.profesional_nombre} el ${fechaHora}`;
      return {
        tipo: 'avisar_lista_espera_match',
        negocio_id: negocioId,
        lista_espera_id: m.candidata.lista_espera_id,
        cita_origen_id: m.cita_origen.id,
        cliente_nombre: m.candidata.nombre,
        servicio_nombre: m.candidata.servicio_nombre,
        profesional_nombre: m.candidata.profesional_nombre,
        inicio: m.cita_origen.inicio,
        fidelidad_citas: m.candidata.fidelidad_citas,
        resumen,
      };
    }

    case 'optimizar_agenda': {
      const arrayMovs = Array.isArray(inp.movimientos) ? inp.movimientos : [];
      if (arrayMovs.length === 0) return { error: 'No has propuesto ningun movimiento de agenda.' };
      return {
        tipo: 'optimizar_agenda',
        negocio_id: negocioId,
        fecha: inp.fecha,
        movimientos: arrayMovs as { cita_id: string; nuevo_inicio: string; nuevo_fin: string; cliente_nombre: string }[],
        resumen: `Optimizar agenda del ${inp.fecha} (${arrayMovs.length} movimientos). Avisaremos por WhatsApp.`,
      };
    }

    default:
      return { error: 'Tool de escritura desconocida.' };
  }
}

// ---------------------------------------------------------------------------
// Detectar solapa (replica AgendaCalendar.web.tsx:3205-3220)
// Devuelve true si hay citas confirmadas del mismo profesional que solapan
// con la fase activa de la nueva cita.
// ---------------------------------------------------------------------------
async function detectarSolapa(
  profesionalId: string,
  inicio: string,
  fin: string,
  finActiva: string,
  excluirCitaId?: string,
): Promise<boolean> {
  let q = svc
    .from('citas')
    .select('id, inicio, fin_activa, fin_espera, fin')
    .eq('profesional_id', profesionalId)
    .eq('estado', 'confirmada')
    .lt('inicio', fin)
    .gt('fin', inicio);

  if (excluirCitaId) q = q.neq('id', excluirCitaId);

  const { data: candidatas } = await q;
  if (!candidatas || candidatas.length === 0) return false;

  const cInicio = new Date(inicio);
  const cFinActiva = new Date(finActiva);

  return candidatas.some((c: {
    inicio: string; fin_activa: string; fin_espera: string | null; fin: string;
  }) => {
    const ci = new Date(c.inicio);
    const cfa = new Date(c.fin_activa);
    const cfe = c.fin_espera ? new Date(c.fin_espera) : null;
    const cf = new Date(c.fin);
    // Solapa activa-activa
    if (ci < cFinActiva && cfa > cInicio) return true;
    // Solapa con la fase activa extra de la candidata
    if (cfe && cf.getTime() > cfe.getTime() && cfe < cFinActiva && cf > cInicio) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Resolver el profesional_id del usuario autenticado
// ---------------------------------------------------------------------------
const _profCache = new Map<string, string | null>();
async function resolverProfesionalDelUsuario(negocioId: string, userId: string): Promise<string | null> {
  const key = `${negocioId}:${userId}`;
  if (_profCache.has(key)) return _profCache.get(key)!;

  const { data } = await svc
    .from('profesionales')
    .select('id')
    .eq('negocio_id', negocioId)
    .eq('profile_id', userId)
    .maybeSingle();

  const result = data?.id ?? null;
  _profCache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Registrar conversacion (defensivo: errores no fallan la respuesta)
// ---------------------------------------------------------------------------
async function registrarConv(
  negocioId: string,
  _userId: string,
  conv: { role: string; content: unknown }[],
): Promise<void> {
  try {
    // registrar_conversacion_ia requiere p_slug (no negocio_id directo)
    const { data: portalRow } = await svc
      .from('negocio_portal')
      .select('slug')
      .eq('negocio_id', negocioId)
      .maybeSingle();

    if (!portalRow?.slug) return; // sin slug no podemos registrar; no es error critico

    const resumen = `Conversacion asistente agenda: ${conv.length} turnos`;
    const transcripcion = conv.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    await svc.rpc('registrar_conversacion_ia', {
      p_slug: portalRow.slug,
      p_canal: 'asistente_ia',
      p_telefono: '',
      p_resumen: resumen,
      p_cita_id: null,
      p_transcripcion: transcripcion,
    });
  } catch (_e) {
    // Silencioso: el log no debe romper la respuesta al usuario
  }
}
