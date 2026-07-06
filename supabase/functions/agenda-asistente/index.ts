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
  // --- Acciones de gestion (Sesion 3) ---
  | { tipo: 'confirmar_citas'; negocio_id: string; citas: { id: string; label: string }[]; resumen: string }
  | {
      tipo: 'editar_servicio';
      negocio_id: string; servicio_id: string; servicio_nombre: string;
      cambios: { precio?: number; nombre?: string; duracion_activa_min?: number; activo?: boolean };
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
    };

// ---------------------------------------------------------------------------
// Bloques tipados (deben coincidir con lib/chispaBloques.ts en el cliente).
// El union se deja extensible: listas, etc. pueden llegar en sesiones futuras.
// ---------------------------------------------------------------------------
type ChispaUnidad = 'eur' | 'citas' | 'pct';

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
    };

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
    description: 'Propone crear una cita. Antes de invocarla resuelve cliente y profesional con las tools de lectura.',
    parameters: {
      type: 'object' as const,
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio' },
        profesional: { type: 'string', description: 'Nombre del profesional' },
        inicio: { type: 'string', description: 'ISO 8601 YYYY-MM-DDTHH:mm o lenguaje natural resuelto' },
        cliente: { type: 'string', description: 'Nombre o telefono del cliente (opcional para walk-in)' },
      },
      required: ['servicio', 'profesional', 'inicio'],
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
    description: 'Propone cambiar un ajuste de la configuracion del salon (SOLO propietario). Usa la CLAVE exacta de la lista AJUSTES EDITABLES del system prompt.',
    parameters: {
      type: 'object' as const,
      properties: {
        clave: { type: 'string', description: 'Clave exacta del ajuste (de la lista AJUSTES EDITABLES)' },
        valor: { type: 'string', description: 'Nuevo valor: activar/desactivar, un numero, una hora HH:MM, o una opcion del enum' },
      },
      required: ['clave', 'valor'],
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
    description: 'Propone cambiar datos de un servicio del catalogo: precio (en euros), nombre, duracion activa (min) o activarlo/desactivarlo. Indica solo lo que cambia.',
    parameters: {
      type: 'object' as const,
      properties: {
        servicio: { type: 'string', description: 'Nombre del servicio a editar' },
        precio: { type: 'string', description: 'Nuevo precio en euros (ej. "15" o "15.50")' },
        nombre: { type: 'string', description: 'Nuevo nombre del servicio' },
        duracion_activa_min: { type: 'string', description: 'Nueva duracion activa en minutos' },
        activo: { type: 'string', description: 'activar o desactivar' },
      },
      required: ['servicio'],
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
- Horarios: "Horario semanal" del salon por dias y franjas (con plantillas tipo "L-V con pausa"); "Slots y vista del calendario" (granularidad de los huecos, vista por defecto dia/semana/mes, primer dia de la semana).

GRUPO OPERATIVA
- Servicios: catalogo de servicios (crear/editar/activar, precio, duraciones, precios y duraciones por profesional, variantes).
- Agenda: "Reservas y antelacion" (antelacion minima y maxima, permitir reservas el mismo dia, solapamiento de citas); "Confirmacion de citas" (automatica o manual, tiempo maximo sin confirmar, avisar al equipo); "Cierre de citas" (completar manual o automatico); "No-show y retrasos" (tiempo para marcar no-show, gracia de retraso, contador en la cita, recolocacion por retraso); "Tiempos muertos y reposo" (margen de seguridad, alerta de reposos simultaneos, aprovechar reposo en otra cliente); "Asistente de agenda (IA)" (activarlo, permitir que el profesional opere su propia agenda, nivel basico/normal/alto); "Bloqueos y descansos" (se crean en la pantalla de Equipo).
- Comisiones: "Comisiones por defecto" (porcentaje base, base de calculo bruto o sin IVA, incluir add-ons y propinas, periodo de liquidacion); "Mi jornada" (que importes y comision ve cada profesional de si mismo); "Bonus y excepciones" (bonus por venta de producto, por objetivo mensual, comision doble en servicios estrella).
- Plantillas: "Alergias frecuentes" (etiquetas rapidas al registrar alergias de un cliente), "Formulas guardadas" (presets de color/quimica para reutilizar en fichas tecnicas) y "Plantillas de notas e historial". NO sirve para editar el texto de los mensajes de WhatsApp.

GRUPO COMUNICACION
- Notificaciones: "Avisos automaticos al cliente" (activar/desactivar Confirmacion de cita, Recordatorio previo, Peticion de resena, Enlace de pago de senal, Aviso de retraso). OJO: el TEXTO de estos mensajes NO se puede editar; son plantillas fijas aprobadas por Meta y solo se rellenan los datos de cada cita. "Horario sin envios (no molestar)" (activar y franja horaria); "Lista de espera (avisos de hueco)" (ofrecer huecos automaticamente, ventana de respuesta, tiempo maximo de reserva del hueco, desde cuando cuenta el tope, antelacion minima del hueco, si la oferta pide senal, avisar si el hueco caduca); "Canal de envio" (hoy solo WhatsApp; SMS/email proximamente).
- Politicas (proximamente): cancelacion y penalizacion, deposito/senal, limite de no-shows.
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
};

const CONFIG_EDITABLE_TEXT = 'AJUSTES EDITABLES (solo propietario). Para cambiar uno, usa la tool cambiar_config con la CLAVE exacta de esta lista:\n' +
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

function buildSystemPrompt(hoyISO: string, scope: 'all' | 'self' | 'none', puedeInformes: boolean): string {
  const scopeMsg =
    scope === 'none'
      ? 'Este usuario SOLO puede consultar la agenda. Si pide operar (crear/mover/cancelar/bloquear), explica amablemente que no tiene permiso.'
      : scope === 'self'
      ? 'Este usuario (profesional) solo puede operar SU PROPIA agenda. No proponga escrituras sobre citas de otros profesionales.'
      : 'Este usuario puede consultar y operar la agenda de cualquier profesional del salon.';

  return [
    'Eres Chispa, la asistente de IA del software de gestion del salon (Mecha): gestionas la agenda Y guias al usuario sobre como usar y configurar el software. Operas en espanol, con tono breve, calido y profesional. Si te preguntan que eres, di con naturalidad que eres una IA que ayuda con la gestion del salon.',
    `Hoy es ${hoyISO} (zona Europe/Madrid). Resuelve referencias relativas ("manana", "las 5", "el lunes") a fecha/hora concreta en hora LOCAL de Madrid, en formato YYYY-MM-DDTHH:mm SIN sufijo de zona (no pongas Z ni offset).`,
    'No uses emojis en tus respuestas.',
    'GUIA DE CONFIGURACION: si el usuario pregunta como o donde configurar/personalizar algo, o que se puede ajustar de una funcion, responde con el MAPA DE CONFIGURACION del final: da la RUTA exacta (Configuracion > Pestana > Seccion) y enumera que se puede ajustar ahi. Cinete ESTRICTAMENTE al mapa: no inventes ajustes, opciones, valores de ejemplo ni rutas que no esten escritos en el (por ejemplo, no anadas "cada 15/30 min" ni "SMS/email" si el mapa no lo dice). Si te preguntan por algo que no esta en el mapa, dilo con franqueza en vez de suponer.',
    'CAMBIAR CONFIGURACION (solo PROPIETARIO): si el propietario pide cambiar un ajuste (por ejemplo "activa los recordatorios" o "pon la antelacion minima en 4h"), usa la tool cambiar_config con la CLAVE exacta de la lista AJUSTES EDITABLES del final. Se propone y el usuario confirma; tu no lo aplicas. Si el usuario NO es propietario, no cambies nada: solo guialo a donde esta el ajuste.',
    'Para consultar la agenda usa las tools de lectura (info_catalogo, buscar_cliente, listar_citas, consultar_disponibilidad, citas_hoy).',
    'Para el progreso de objetivos/metas usa metas_progreso (del equipo si eres direccion/propietario, o los tuyos si eres profesional); si no hay ninguno fijado, dilo con naturalidad y sugiere fijarlo en Equipo.',
    'Para proponer operaciones de agenda usa las tools de escritura (crear_cita, reagendar_cita, cancelar_cita, bloquear_hueco, liberar_hueco).',
    'Tambien puedes proponer acciones de GESTION cuando tengas la tool disponible: confirmar_citas (confirmar en bloque las citas pendientes de un dia, p.ej. "confirmame las citas de manana"), editar_servicio (cambiar precio/nombre/duracion/activar de un servicio del catalogo), editar_horario (fijar el turno de un profesional un dia), crear_presupuesto (borrador con precios REALES del catalogo, nunca inventes precios) y enviar_mensaje_bandeja (guardar un borrador en el hilo de la Bandeja del cliente; NO envia el WhatsApp real, eso lo hace el equipo). Si una tool no esta disponible para el rol de este usuario, no la menciones como algo que puedas hacer: guia a la pantalla correspondiente.',
    'Todas estas acciones son PROPUESTAS: se muestran en una tarjeta y el usuario confirma; tu nunca las aplicas.',
    puedeInformes
      ? 'Para datos agregados de informes o facturacion (citas por estado, ingresos cobrados en un rango) usa resumen_informes; para dinero cobrado de verdad (efectivo/datafono/propinas) usa resumen_caja; para ocupacion del salon usa ocupacion. Cuando el usuario pida un resumen de un periodo ("resumeme el mes", "como va la semana") o la evolucion de una metrica, ANADE ademas mostrar_grafica (dia a dia) y, si tiene sentido comparar con el periodo anterior, mostrar_comparativa; luego ofrece sugerir_enlace hacia informes para el detalle completo. Nunca inventes cifras: usa solo las que devuelven estas tools, y si el rango tiene pocos datos dilo con franqueza en vez de sonar mas seguro de lo que permiten los datos.'
      : 'NO tienes acceso a informes, caja agregada, ocupacion ni graficas de negocio con el rol de este usuario. Si te preguntan por ingresos totales, facturacion, cuanto se ha ganado, estadisticas o informes del negocio, explica con naturalidad que no tienes acceso a esos datos con su rol y que lo consulten con direccion o el propietario. NUNCA inventes cifras.',
    'Cuando sea util, usa sugerir_enlace para ofrecer un chip que lleve a la pantalla relevante (p.ej. tras hablar de una clienta, ofrecer ir a Clientes). Es opcional y no modifica nada; no abuses (a lo sumo uno o dos por respuesta).',
    'ANTES de proponer una escritura: resuelve nombres a entidades reales con buscar_cliente e info_catalogo.',
    'Si hay ambiguedad (varios clientes con ese nombre, servicio no encontrado), PREGUNTA al usuario en vez de proponer con datos inciertos.',
    'Las propuestas de escritura NO se ejecutan automaticamente: el sistema mostrara una tarjeta de confirmacion al usuario.',
    scopeMsg,
  ].join('\n') + '\n\n' + MAPA_CONFIG + '\n\n' + CONFIG_EDITABLE_TEXT;
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
  mensajes: { role: 'user' | 'assistant'; content: string }[],
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
    const out: { bloques: Bloque[]; texto: string; accion_propuesta?: AccionPropuesta } = { bloques, texto: texto || '' };
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
// Construye la propuesta de cambio de configuracion (valida clave + valor, lee el valor actual).
async function construirPropuestaConfig(
  inp: Record<string, string>,
  negocioId: string,
): Promise<AccionPropuesta | { error: string }> {
  const clave = (inp.clave ?? '').trim();
  const meta = CONFIG_EDITABLE[clave];
  if (!meta) return { error: `"${clave}" no es un ajuste que pueda cambiar. Dime en palabras que quieres cambiar y te digo si se puede.` };

  const c = coerceConfigValor(meta, inp.valor ?? '');
  if (!c.ok) return { error: c.error };

  const { data: cfgRow } = await svc.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
  const actual = ((cfgRow?.config ?? {}) as Record<string, unknown>)[clave];
  const fmt = (val: unknown): string =>
    meta.tipo === 'bool' ? (val ? 'activado' : 'desactivado') : (val === undefined || val === null ? '(sin definir)' : String(val));

  return {
    tipo: 'cambiar_config',
    negocio_id: negocioId,
    clave,
    label: meta.label,
    valor: c.valor,
    valor_actual: (actual ?? null) as boolean | number | string | null,
    resumen: `Cambiar "${meta.label}": ${fmt(actual)} -> ${fmt(c.valor)}`,
  };
}

async function construirPropuesta(
  t: { name: string; input: Record<string, string> },
  negocioId: string,
  scope: 'all' | 'self',
  userId: string,
): Promise<AccionPropuesta | { error: string }> {
  const inp = (t.input ?? {}) as Record<string, string>;

  switch (t.name) {
    case 'crear_cita': {
      // 1. Resolver servicio
      const { data: servicios } = await svc
        .from('servicios')
        .select('id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min')
        .eq('negocio_id', negocioId)
        .ilike('nombre', `%${inp.servicio}%`);

      if (!servicios || servicios.length === 0)
        return { error: `Servicio "${inp.servicio}" no encontrado. ¿Puedes precisar el nombre?` };
      if (servicios.length > 1)
        return { error: `Varios servicios coinciden con "${inp.servicio}": ${servicios.map((s: { nombre: string }) => s.nombre).join(', ')}. ¿Cual quieres?` };

      const servicio = servicios[0];

      // 2. Resolver profesional
      const { data: profes } = await svc
        .from('profesionales')
        .select('id, nombre')
        .eq('negocio_id', negocioId)
        .eq('activo', true)
        .ilike('nombre', `%${inp.profesional}%`);

      if (!profes || profes.length === 0)
        return { error: `Profesional "${inp.profesional}" no encontrado.` };
      if (profes.length > 1)
        return { error: `Varios profesionales coinciden con "${inp.profesional}": ${profes.map((p: { nombre: string }) => p.nombre).join(', ')}. ¿Cual quieres?` };

      const profesional = profes[0];

      // 3. Scope self: validar que es el profesional del caller
      if (scope === 'self') {
        const miProfId = await resolverProfesionalDelUsuario(negocioId, userId);
        if (miProfId !== profesional.id)
          return { error: 'Solo puedes operar tu propia agenda. Este profesional no es tu cuenta.' };
      }

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

      // 5. Calcular fines
      const inicio = parseInstante(inp.inicio);
      if (isNaN(inicio.getTime())) return { error: `Hora de inicio no valida: "${inp.inicio}"` };

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
      const { data: servicios } = await svc
        .from('servicios').select('id, nombre, precio, duracion_activa_min, activo')
        .eq('negocio_id', negocioId).ilike('nombre', `%${inp.servicio}%`);
      if (!servicios || servicios.length === 0) return { error: `Servicio "${inp.servicio}" no encontrado.` };
      if (servicios.length > 1) return { error: `Varios servicios coinciden con "${inp.servicio}": ${servicios.map((s: { nombre: string }) => s.nombre).join(', ')}. ¿Cual?` };
      const s = servicios[0];

      const cambios: { precio?: number; nombre?: string; duracion_activa_min?: number; activo?: boolean } = {};
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
      if (Object.keys(cambios).length === 0) return { error: 'Dime que cambiar del servicio (precio, nombre, duracion o activar/desactivar).' };

      return {
        tipo: 'editar_servicio',
        negocio_id: negocioId,
        servicio_id: s.id,
        servicio_nombre: s.nombre,
        cambios,
        resumen: `${s.nombre}: ${partes.join(', ')}`,
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
        if (euros == null) return { error: `No tengo precio para "${nombre}" y no esta en el catalogo. Dime su precio.` };
        const cantidad = Math.max(1, parseInt(String(l.cantidad ?? '1').replace(/[^0-9]/g, ''), 10) || 1);
        lineas.push({ nombre, precio_cents: Math.round(euros * 100), cantidad });
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
