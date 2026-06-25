// Edge Function: agenda-asistente
// LLM con tool-use para consultar/proponer operaciones de agenda.
// Lecturas se ejecutan aquí (server-side, service key).
// Escrituras NO se ejecutan: devuelven accion_propuesta al panel.

import OpenAI from 'npm:openai@4';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  | { tipo: 'liberar_hueco'; bloqueo_id: string; resumen: string };

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
];

const ESCRITURA = new Set(['crear_cita', 'reagendar_cita', 'cancelar_cita', 'bloquear_hueco', 'liberar_hueco']);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
function buildSystemPrompt(hoyISO: string, scope: 'all' | 'self' | 'none'): string {
  const scopeMsg =
    scope === 'none'
      ? 'Este usuario SOLO puede consultar la agenda. Si pide operar (crear/mover/cancelar/bloquear), explica amablemente que no tiene permiso.'
      : scope === 'self'
      ? 'Este usuario (profesional) solo puede operar SU PROPIA agenda. No proponga escrituras sobre citas de otros profesionales.'
      : 'Este usuario puede consultar y operar la agenda de cualquier profesional del salon.';

  return [
    'Eres el asistente de agenda de un salon de peluqueria. Operas en espanol, con tono breve y profesional.',
    `Hoy es ${hoyISO} (zona Europe/Madrid). Resuelve referencias relativas ("manana", "las 5", "el lunes") a fecha/hora concreta en hora LOCAL de Madrid, en formato YYYY-MM-DDTHH:mm SIN sufijo de zona (no pongas Z ni offset).`,
    'No uses emojis en tus respuestas.',
    'Para consultar la agenda usa las tools de lectura (info_catalogo, buscar_cliente, listar_citas, consultar_disponibilidad).',
    'Para proponer operaciones usa las tools de escritura (crear_cita, reagendar_cita, cancelar_cita, bloquear_hueco, liberar_hueco).',
    'ANTES de proponer una escritura: resuelve nombres a entidades reales con buscar_cliente e info_catalogo.',
    'Si hay ambiguedad (varios clientes con ese nombre, servicio no encontrado), PREGUNTA al usuario en vez de proponer con datos inciertos.',
    'Las propuestas de escritura NO se ejecutan automaticamente: el sistema mostrara una tarjeta de confirmacion al usuario.',
    scopeMsg,
  ].join('\n');
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
    const resultado = await runAgente(negocioId, role, user.id, realScope, effort, mensajes);
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
  _role: string,
  userId: string,
  scope: 'all' | 'self' | 'none',
  _effort: string,
  mensajes: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ texto: string; accion_propuesta?: AccionPropuesta }> {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD

  // OpenAI-compatible (OpenRouter): el system va como primer mensaje.
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt(hoy, scope) },
    ...mensajes.map((m) => ({ role: m.role, content: m.content })),
  ];

  const tools = TOOLS.map((t) => ({ type: 'function' as const, function: t }));

  const parseArgs = (tc: { function: { arguments: string } }): Record<string, string> => {
    try {
      return JSON.parse(tc.function.arguments || '{}');
    } catch {
      return {};
    }
  };

  for (let i = 0; i < 6; i++) {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const msg = resp.choices[0]?.message;
    if (!msg) return { texto: 'No he recibido respuesta del modelo.' };
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];

    // Sin tool calls: respuesta final de texto
    if (toolCalls.length === 0) {
      await registrarConv(negocioId, userId, messages);
      return { texto: msg.content ?? '' };
    }

    // ¿Hay alguna tool de escritura?
    const writeCall = toolCalls.find((tc) => ESCRITURA.has(tc.function.name));
    if (writeCall) {
      if (scope === 'none') {
        await registrarConv(negocioId, userId, messages);
        return { texto: 'No tienes permiso para modificar la agenda; solo puedo consultarla por ti.' };
      }

      const propuesta = await construirPropuesta(
        { name: writeCall.function.name, input: parseArgs(writeCall) },
        negocioId,
        scope,
        userId,
      );

      if (!('error' in propuesta)) {
        await registrarConv(negocioId, userId, messages);
        return {
          texto: msg.content || 'Revisa la accion propuesta y confirma:',
          accion_propuesta: propuesta,
        };
      }

      // OpenAI exige responder a TODAS las tool calls del turno antes de continuar.
      for (const tc of toolCalls) {
        let content: string;
        if (tc.id === writeCall.id) {
          content = propuesta.error;
        } else if (ESCRITURA.has(tc.function.name)) {
          content = 'Procesa una sola operacion a la vez.';
        } else {
          content = JSON.stringify(
            await ejecutarLectura({ name: tc.function.name, input: parseArgs(tc) }, negocioId, scope, userId),
          );
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content });
      }
      continue;
    }

    // Solo lecturas: ejecutar y reinyectar resultados
    for (const tc of toolCalls) {
      const r = await ejecutarLectura({ name: tc.function.name, input: parseArgs(tc) }, negocioId, scope, userId);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(r) });
    }
  }

  return { texto: 'No he podido completar la peticion en el numero de pasos permitido. ¿Puedes reformularla?' };
}

// ---------------------------------------------------------------------------
// Ejecutar tools de LECTURA
// ---------------------------------------------------------------------------
async function ejecutarLectura(
  t: { name: string; input: Record<string, string> },
  negocioId: string,
  scope: 'all' | 'self' | 'none',
  userId: string,
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
      const { data } = await svc
        .from('clientes')
        .select('id, nombre, telefono')
        .eq('negocio_id', negocioId)
        .or(`nombre.ilike.%${inp.texto}%,telefono.ilike.%${inp.texto}%`)
        .limit(8);
      return data;
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
        const { data: clientes } = await svc
          .from('clientes')
          .select('id')
          .eq('negocio_id', negocioId)
          .ilike('nombre', `%${inp.cliente}%`);
        const ids = new Set((clientes ?? []).map((c: { id: string }) => c.id));
        resultado = resultado.filter((c: { cliente_id: string | null }) => c.cliente_id && ids.has(c.cliente_id));
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

    default:
      return { error: 'tool desconocida' };
  }
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
        const { data: clientes } = await svc
          .from('clientes')
          .select('id, nombre')
          .eq('negocio_id', negocioId)
          .or(`nombre.ilike.%${inp.cliente}%,telefono.ilike.%${inp.cliente}%`)
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
