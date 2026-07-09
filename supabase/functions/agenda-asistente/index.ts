// Edge Function: agenda-asistente
// LLM con tool-use para consultar/proponer operaciones de agenda.
// Lecturas se ejecutan aquí (server-side, service key).
// Escrituras NO se ejecutan: devuelven accion_propuesta al panel.

import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';
// Seguridad de la capa IA (Sesion 2): RBAC de tools + regla dura de salud.
import { can, roleOf, toolPermitida, esEscritura, type Role } from './permisos.ts';
import { assertSinCamposProhibidos, proyectarClienteIA } from './whitelist.ts';

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
// Claude Sonnet via OpenRouter (OpenAI-compatible).
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
});
// Slug de OpenRouter para Claude Sonnet (confirmar contra la lista de modelos de OpenRouter).
const MODEL = 'anthropic/claude-sonnet-4.6';

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
  | { tipo: 'progreso'; paso: number; total: number; etiqueta?: string };

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
    description: 'Propone confirmar EN BLOQUE las citas pendientes de un dia (p.ej. "confirmame las citas de manana"). Pasa la fecha ya resuelta a YYYY-MM-DD.',
    parameters: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'Dia a confirmar en YYYY-MM-DD (resuelve "manana", "el lunes"...)' },
        profesional: { type: 'string', description: 'Opcional: limitar a un profesional (nombre parcial)' },
      },
      required: ['fecha'],
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

// AUTO-CONOCIMIENTO DE CHISPA (Sesion S01, plan V3). Proyeccion COMPACTA de las
// superficies de IA de cara al usuario. Canonico: lib/ia/manifiestoIA.ts
// (SUPERFICIES_IA, derivadas de lib/iaCatalogo.ts). El edge (Deno) no puede
// importar @/, por eso se mantiene aqui esta copia compacta en sync a mano.
// Permite a Chispa responder "que se hacer" y "donde esta X funcion de IA".
const AUTOCONOCIMIENTO_IA = `AUTO-CONOCIMIENTO (que sabe hacer Chispa y donde). Si el usuario pregunta que puedes hacer, que sabes hacer, en que le ayudas o donde esta/como se usa una funcion de IA, responde SOLO desde esta lista (no inventes funciones que no esten aqui) y, para cada funcion relevante, ofrece un chip con sugerir_enlace hacia su pantalla. Sé conciso: agrupa y ofrece los enlaces, no sueltes un parrafo largo.
- Panel Chispa (este chat, pestana con estrella): asistente conversacional por voz o texto; crea citas, servicios y presupuestos, consulta datos y organiza la agenda con formularios visuales.
- Voz de Chispa (este panel): lee sus respuestas en voz alta.
- Configuracion guiada del salon [solo gestor] (destino configuracion): "configurame el salon" paso a paso, con formularios pre-rellenados.
- Organizador de agenda (destino agenda, boton "Organizar mi agenda"): detecta retrasos, huecos muertos y solapes y propone arreglos de un clic.
- Coaching de huecos (destino mi-jornada, "Analizar mi dia"): como aprovechar los huecos libres del dia.
- Sugerencia de producto en Caja (destino caja): al cobrar, propone un producto complementario segun el servicio.
- Presupuestos desde lenguaje natural (destino presupuestos, "Crear presupuesto rapido") y aviso de presupuestos sin respuesta.
- Riesgo de no-show y de fuga de clientas, y preguntas/respuestas sobre una clienta (destino clientes, en su ficha).
- Informe narrado del periodo con graficas (destino informes, "Analizar periodo").
- Borrador de respuesta a resenas y resumen de temas recurrentes (destino resenas).
- Triaje y borrador de respuesta de mensajes (destino bandeja).
- Migracion Magica [solo gestor] (destino configuracion): importa datos desde Booksy/Fresha (CSV) o desde fotos de precios/albaranes.`;

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
SI NO RECONOCES LA INTENCION: no digas "no te he entendido"; ofrece las acciones mas probables (con sugerir_enlace o proponiendo lo mas util) como un menu accionable.`;

function buildSystemPrompt(hoyISO: string, scope: 'all' | 'self' | 'none', puedeInformes: boolean): string {
  const scopeMsg =
    scope === 'none'
      ? 'Este usuario SOLO puede consultar la agenda. Si pide operar (crear/mover/cancelar/bloquear), explica amablemente que no tiene permiso.'
      : scope === 'self'
      ? 'Este usuario (profesional) solo puede operar SU PROPIA agenda. No proponga escrituras sobre citas de otros profesionales.'
      : 'Este usuario puede consultar y operar la agenda de cualquier profesional del salon.';

  return [
    'Eres Chispa, la asistente de IA del software de gestion del salon (Mecha): gestionas la agenda Y guias al usuario sobre como usar y configurar el software. Operas en espanol, con tono breve, calido y profesional. Si te preguntan que eres, di con naturalidad que eres una IA que ayuda con la gestion del salon.',
    PROCEDIMIENTO_UNIVERSAL,
    `Hoy es ${hoyISO} (zona Europe/Madrid). Resuelve referencias relativas ("manana", "las 5", "el lunes") a fecha/hora concreta en hora LOCAL de Madrid, en formato YYYY-MM-DDTHH:mm SIN sufijo de zona (no pongas Z ni offset).`,
    'No uses emojis en tus respuestas.',
    'ACTUA CON MINIMA INFO (REGLA ESTRICTA): para crear_cita, crear_servicio, editar_servicio, crear_presupuesto y cambiar_config, llama a la tool EN CUANTO identifiques la intencion, aunque falten datos: deja vacios/sin poner los campos que no sepas (NO los adivines ni los dejes de mandar por duda). Esta prohibido responder en texto plano pidiendo un dato que una de estas tools podria pedir por ti con un formulario: si dudas entre preguntar en texto o llamar a la tool con ese campo vacio, SIEMPRE llama a la tool. El sistema completara automaticamente lo que falte con un formulario o unas opciones para elegir, y al enviarlo se te reenviara la respuesta para que termines la propuesta. Esto incluye la AMBIGUEDAD: si el nombre de un servicio/profesional no es exacto o podria referirse a mas de uno (p.ej. "el corte" cuando hay "Corte caballero" y "Corte señora"), NO preguntes tu en texto cual es: llama a la tool igual con ese nombre tal cual lo dijo el usuario (aunque sepas por info_catalogo que hay varias coincidencias); el sistema le presentara las opciones exactas para elegir de un toque. Ejemplos: "sube las horas del recordatorio" sin decir el numero -> llama a cambiar_config con cambios:[{clave:"notifRecordatorioHoras"}] SIN poner "valor"; "activa la senal de 10 euros en el corte" (ambiguo) -> llama a editar_servicio con servicio:"corte", senal_activa:"activar", senal_importe:"10" IGUAL, sin preguntar antes cual de los dos es; "hazme un presupuesto con un tratamiento de keratina" (concepto que NO esta en el catalogo, sin precio) -> llama a crear_presupuesto con lineas:[{concepto:"tratamiento de keratina"}] SIN poner "precio", en vez de responder en texto pidiendolo tu. Si el usuario ya dio TODOS los datos sin ambiguedad en su misma frase, no hace falta nada mas: la tool devolvera directamente la tarjeta de confirmacion, sin formulario de por medio.',
    'AUTO-CONOCIMIENTO: si el usuario pregunta que sabes hacer, en que le puedes ayudar, o donde esta / como se usa una funcion de IA, responde desde la lista AUTO-CONOCIMIENTO del final: enumera de forma breve las funciones relevantes y ofrece un chip con sugerir_enlace a cada pantalla. No inventes funciones que no esten en esa lista.',
    'GUIA DE CONFIGURACION: si el usuario pregunta como o donde configurar/personalizar algo, o que se puede ajustar de una funcion, responde con el MAPA DE CONFIGURACION del final: da la RUTA exacta (Configuracion > Pestana > Seccion) y enumera que se puede ajustar ahi. Cinete ESTRICTAMENTE al mapa: no inventes ajustes, opciones, valores de ejemplo ni rutas que no esten escritos en el (por ejemplo, no anadas "cada 15/30 min" ni "SMS/email" si el mapa no lo dice). Si te preguntan por algo que no esta en el mapa, dilo con franqueza en vez de suponer.',
    'CAMBIAR CONFIGURACION (solo PROPIETARIO): si el propietario pide cambiar uno o VARIOS ajustes relacionados en la misma frase (por ejemplo "activa los recordatorios con 48h de antelacion" junta notifRecordatorioActiva + notifRecordatorioHoras, o "pon la antelacion minima en 4h" es solo uno), usa la tool cambiar_config con la lista "cambios" (una entrada clave+valor por ajuste, CLAVE exacta de la lista AJUSTES EDITABLES del final). Se propone y el usuario confirma; tu no lo aplicas. Si el usuario NO es propietario, no cambies nada: solo guialo a donde esta el ajuste.',
    'Para consultar la agenda usa las tools de lectura (info_catalogo, buscar_cliente, listar_citas, consultar_disponibilidad, citas_hoy).',
    'Para responder sobre UNA clienta (su historial, cuanto gasta, cada cuanto viene, su etiquetas o su riesgo de no-show) usa ficha_cliente. REGLA DURA DE SALUD: nunca pidas, muestres ni deduzcas datos de salud, alergias, medicacion o notas medicas. Si ficha_cliente devuelve tiene_notas_salud=true, di UNICAMENTE que "hay notas en su ficha, revisalas alli" y ofrece un enlace a Clientes con sugerir_enlace; jamas inventes el contenido. Si la ficha no aparece (encontrado=false), di con naturalidad que no la encuentras: puede que no exista o que no haya dado su consentimiento para que la IA use sus datos.',
    'Menciona el riesgo de no-show de una clienta solo si es relevante (p.ej. el usuario pregunta si es fiable, o hay una cita suya sin confirmar), y siempre en tono neutro y sin juzgar: es una senal operativa, no una etiqueta sobre la persona.',
    'Si el usuario quiere recuperar a una clienta que lleva tiempo sin venir, puedes proponer recuperar_cliente (deja el registro para que el equipo le mande la propuesta de vuelta; tu no envias nada).',
    'Para el progreso de objetivos/metas usa metas_progreso (del equipo si eres direccion/propietario, o los tuyos si eres profesional); si no hay ninguno fijado, dilo con naturalidad y sugiere fijarlo en Equipo.',
    'Para proponer operaciones de agenda usa las tools de escritura (crear_cita, reagendar_cita, cancelar_cita, bloquear_hueco, liberar_hueco).',
    'Tambien puedes proponer acciones de GESTION cuando tengas la tool disponible: confirmar_citas (confirmar en bloque las citas pendientes de un dia, p.ej. "confirmame las citas de manana"), crear_servicio (dar de alta un servicio nuevo en el catalogo), editar_servicio (cambiar precio/nombre/duracion/activar/senal-deposito de un servicio del catalogo YA existente), editar_horario (fijar el turno de un profesional un dia), crear_presupuesto (borrador con precios REALES del catalogo, nunca inventes precios), enviar_mensaje_bandeja (guardar un borrador en el hilo de la Bandeja del cliente; NO envia el WhatsApp real, eso lo hace el equipo), cambiar_idioma_portal (idioma del portal PUBLICO de reserva online: es/en; distinto del idioma de la interfaz del software, ese no lo puedes cambiar) y anadir_cierre_negocio (marcar un dia completo como festivo/cierre de TODO el salon). Si una tool no esta disponible para el rol de este usuario, no la menciones como algo que puedas hacer: guia a la pantalla correspondiente.',
    'Todas estas acciones son PROPUESTAS: se muestran en una tarjeta y el usuario confirma; tu nunca las aplicas.',
    puedeInformes
      ? 'Para datos agregados de informes o facturacion (citas por estado, ingresos cobrados en un rango) usa resumen_informes; para dinero cobrado de verdad (efectivo/datafono/propinas) usa resumen_caja; para ocupacion del salon usa ocupacion. Cuando el usuario pida un resumen de un periodo ("resumeme el mes", "como va la semana") o la evolucion de una metrica, ANADE ademas mostrar_grafica (dia a dia) y, si tiene sentido comparar con el periodo anterior, mostrar_comparativa; luego ofrece sugerir_enlace hacia informes para el detalle completo. Nunca inventes cifras: usa solo las que devuelven estas tools, y si el rango tiene pocos datos dilo con franqueza en vez de sonar mas seguro de lo que permiten los datos.'
      : 'NO tienes acceso a informes, caja agregada, ocupacion ni graficas de negocio con el rol de este usuario. Si te preguntan por ingresos totales, facturacion, cuanto se ha ganado, estadisticas o informes del negocio, explica con naturalidad que no tienes acceso a esos datos con su rol y que lo consulten con direccion o el propietario. NUNCA inventes cifras.',
    'Cuando sea util, usa sugerir_enlace para ofrecer un chip que lleve a la pantalla relevante (p.ej. tras hablar de una clienta, ofrecer ir a Clientes). Es opcional y no modifica nada; no abuses (a lo sumo uno o dos por respuesta).',
    'ANTES de proponer una escritura: resuelve nombres a entidades reales con buscar_cliente e info_catalogo.',
    'Si hay ambiguedad (varios clientes con ese nombre, servicio no encontrado), PREGUNTA al usuario en vez de proponer con datos inciertos.',
    'Las propuestas de escritura NO se ejecutan automaticamente: el sistema mostrara una tarjeta de confirmacion al usuario.',
    'EXPERTO COLORISTA (VISION): Si recibes una imagen adjunta de cabello (type: image_url), asume el rol de Maestro Colorista de marcas premium (LOréal, Wella). Analiza de forma proactiva la base, la altura de tono y el estado del cabello. Si el usuario te pide un objetivo (ej. "quiero esto"), formula una receta exacta (gramos, volumenes, matiz, tecnica). Acto seguido, llama automaticamente a crear_presupuesto para presupuestar los servicios necesarios.',
    'MODO TETRIS (REORDENADOR): Si te piden "optimiza la agenda" o "junta mis citas", consulta la disponibilidad del dia, detecta huecos ineficientes (ej. 30 min sueltos entre dos citas de 1h) e invoca la tool optimizar_agenda proponiendo adelantar o atrasar citas (movimientos en array). Esto generara un bloque visual diff para el profesional.',
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
const TIPOS_SUPERFICIE = new Set(['enlace', 'accion', 'grafica', 'comparativa', 'formulario', 'opciones', 'progreso']);

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

// Garantiza una superficie util. Si ya hay alguna (accion/enlace/grafica/...),
// deja los bloques intactos; si solo hay texto (o esta vacio), adjunta las
// acciones rapidas para que el usuario nunca se quede sin siguiente paso.
function garantizarSuperficie(bloques: Bloque[], scope: 'all' | 'self' | 'none', puedeInformes: boolean): Bloque[] {
  if (bloques.some((b) => TIPOS_SUPERFICIE.has(b.tipo))) return bloques;
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

    // --- Ejecutar agente ---
    const resultado = await runAgente(negocioId, role, user.id, realScope, effort, mensajes, userClient);
    return json(resultado);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Bucle del agente
// ---------------------------------------------------------------------------
async function runAgente(
  negocioId: string,
  role: string,
  userId: string,
  scope: 'all' | 'self' | 'none',
  _effort: string,
  mensajes: { role: 'user' | 'assistant'; content: string | any[] }[],
  userClient: typeof svc,
): Promise<{ bloques: Bloque[]; texto: string; accion_propuesta?: AccionPropuesta }> {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD

  // RBAC (Sesion 2): rol canonico derivado del JWT (via profiles). Determina que
  // tools se DECLARAN al LLM. Lo que un rol no puede hacer, ni se declara.
  const rolCanon = roleOf(role);
  const puedeInformes = can(rolCanon, 'informes.ver');

  // OpenAI-compatible (OpenRouter): el system va como primer mensaje.
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt(hoy, scope, puedeInformes) },
    ...mensajes.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Solo se exponen al LLM las tools permitidas para este rol/scope (fail-closed).
  const tools = TOOLS
    .filter((t) => toolPermitida(t.name, rolCanon, scope))
    .map((t) => ({ type: 'function' as const, function: t }));

  // Serializa el resultado de una tool de lectura hacia el LLM aplicando la
  // regla dura de salud: si algun campo prohibido se colara, falla cerrado.
  const serializarLectura = async (name: string, input: Record<string, string>): Promise<string> => {
    const r = await ejecutarLectura({ name, input }, negocioId, scope, userId, rolCanon, userClient);
    assertSinCamposProhibidos(r);
    return JSON.stringify(r);
  };

  const parseArgs = (tc: { function: { arguments: string } }): Record<string, string> => {
    try {
      return JSON.parse(tc.function.arguments || '{}');
    } catch {
      return {};
    }
  };

  // Bloques sin efecto de escritura acumulados durante el razonamiento (enlace,
  // grafica, comparativa): se adjuntan a la respuesta final junto al texto y la
  // accion (si la hay).
  const bloquesExtra: Bloque[] = [];
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
      model: MODEL,
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

      // Proyeccion final: lista blanca de operativos + agregados NO sensibles.
      const base = proyectarClienteIA(row);
      return {
        encontrado: true,
        cliente: base,
        ultimas_citas: ultimasCitas,
        gasto_acumulado: gastoAcumulado,
        etiquetas,
        tiene_notas_salud: tieneNotasSalud,
        riesgo_no_show: riesgo,
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
        .select('id, inicio, fin, fin_activa, fin_espera, estado, profesional_id, servicio_id, cliente_id')
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
      return {
        rango: { desde, hasta },
        citas_total: (citas ?? []).length,
        citas_por_estado: porEstado,
        ingresos_cobrados_eur: Math.round(totalCents) / 100,
        nota: 'Ingresos aproximados: suma de cobros con fecha de cobro dentro del rango.',
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
      return {
        rango: { desde, hasta },
        total_eur: eur(filas.reduce((s, r) => s + (r.total_cents ?? 0), 0)),
        efectivo_eur: eur(filas.reduce((s, r) => s + (r.efectivo_cents ?? 0), 0)),
        datafono_eur: eur(filas.reduce((s, r) => s + (r.datafono_cents ?? 0), 0)),
        propinas_eur: eur(filas.reduce((s, r) => s + (r.propina_cents ?? 0), 0)),
        num_cobros: filas.length,
        nota: 'Dinero realmente cobrado (libro de caja); no incluye citas del rango aun no cobradas.',
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

async function construirPropuesta(
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

    // --- GESTION (Sesion 3) ---
    case 'confirmar_citas': {
      const fecha = (inp.fecha ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Necesito la fecha del dia a confirmar (YYYY-MM-DD).' };

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
        .eq('negocio_id', negocioId).eq('estado', 'pendiente')
        .gte('inicio', `${fecha}T00:00:00`).lte('inicio', `${fecha}T23:59:59`)
        .order('inicio');
      if (profId) q = q.eq('profesional_id', profId);
      const { data: citas } = await q;
      if (!citas || citas.length === 0) return { error: `No hay citas pendientes por confirmar el ${fecha}.` };

      const servIds = [...new Set(citas.map((c: { servicio_id: string | null }) => c.servicio_id).filter(Boolean))] as string[];
      const cliIds = [...new Set(citas.map((c: { cliente_id: string | null }) => c.cliente_id).filter(Boolean))] as string[];
      const [servRes, cliRes] = await Promise.all([
        servIds.length ? svc.from('servicios').select('id, nombre').in('id', servIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
        // Nombres solo de clientes que consienten IA (regla de consentimiento).
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
        tipo: 'confirmar_citas',
        negocio_id: negocioId,
        citas: lista,
        resumen: `Confirmar ${lista.length} cita${lista.length === 1 ? '' : 's'} del ${fecha}`,
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
