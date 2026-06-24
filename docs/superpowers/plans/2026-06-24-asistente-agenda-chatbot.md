# Asistente de Agenda (chatbot interno) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-06-24-asistente-agenda-chatbot-design.md`.
> **Cargar antes de tocar agenda:** skills `hairy-agenda-rules` y `hairy-design-system`.

**Goal:** Un chatbot interno en la pantalla de Agenda que permite consultar y operar (crear/reagendar/cancelar/bloquear, siempre con confirmación) la agenda en lenguaje natural.

**Architecture:** Panel flotante (web) → Edge Function `agenda-asistente` (LLM `claude-sonnet-4-6` con tool use). Las lecturas se ejecutan en la función scoped por `negocio_id`/rol; las escrituras NO las ejecuta el LLM: devuelve una `accion_propuesta` que el panel pinta y, al confirmar, ejecuta vía `lib/agendaOps.ts` con la sesión Supabase del usuario (RLS + `can()`).

**Tech Stack:** Expo/React Native + react-native-web (`.web.tsx`), Supabase (Postgres + Edge Functions Deno con `npm:`/`jsr:`), Anthropic Messages API (`npm:@anthropic-ai/sdk`).

**Verificación (sin framework de tests):** cada tarea se cierra con `npx tsc --noEmit` (ignorar errores de `supabase/functions`, son Deno) y, donde aplique, `npm run build:web`; la verificación funcional es E2E sobre el tenant `demo`. Tras cada `git pull`: `npm install`.

---

## File Structure

- **Create** `supabase/functions/agenda-asistente/index.ts` — Edge Function: auth, bucle LLM, tools de lectura (ejecutadas) y de escritura (propuestas).
- **Create** `lib/agendaOps.ts` — módulo compartido de operaciones de agenda (crear/reagendar/cancelar/bloquear/liberar) + validadores de solape, replicando la lógica de `AgendaCalendar.web.tsx`. Lo consume el panel al confirmar.
- **Create** `components/agenda/AsistenteAgenda.web.tsx` — panel flotante de chat + tarjetas de acción propuesta + handler de confirmación.
- **Create** `components/agenda/AsistenteAgenda.tsx` — stub nativo (no-op) para que expo-router resuelva en nativo.
- **Modify** `lib/permissions.ts` — añadir capacidad `agenda.gestionar_propia`.
- **Modify** `app/(tabs)/configuracion.web.tsx` — toggles de Config (`asistenteAgendaActivo`, `asistenteProfesionalEscribe`, `asistenteEffort`).
- **Modify** `components/agenda/AgendaCalendar.web.tsx` (o el contenedor de la pantalla Agenda) — montar `<AsistenteAgenda>` gateado por el toggle.

No hay migración nueva: las lecturas consultan tablas directamente con la service key dentro de la función; el log reutiliza la RPC existente `registrar_conversacion_ia` (tabla `conversaciones_ia`).

---

## Task 1: Capacidad de permiso para que el Profesional opere lo suyo

**Files:**
- Modify: `lib/permissions.ts`

- [ ] **Step 1: Añadir la capacidad al tipo y a los sets de rol**

En `lib/permissions.ts`, añadir `'agenda.gestionar_propia'` al union `Capability` (junto a las otras `agenda.*`). NO la añadas a ningún set de rol por defecto: el gating del Profesional se hace por el toggle de salón en runtime (Task 6), no por rol. Recepción/Dirección/Propietario ya tienen `agenda.gestionar_todas`, que cubre operar cualquier agenda.

```ts
export type Capability =
  | 'agenda.ver_propia'
  | 'agenda.ver_todas'
  | 'agenda.gestionar_todas'
  | 'agenda.gestionar_propia'   // NUEVO: operar SOLO la agenda propia (gateado por toggle de salón)
  | 'clientes.ver'
  // ... resto sin cambios
```

- [ ] **Step 2: Helper de alcance de escritura**

Añadir al final de `lib/permissions.ts` una función pura que, dado el perfil y el flag de salón, devuelve el alcance de escritura del asistente. Es la única fuente de verdad para Task 4 (Edge) y Task 5 (panel).

```ts
// Alcance de escritura del asistente de agenda.
// 'all'  = opera a cualquier profesional (Recepción/Dirección/Propietario).
// 'self' = opera solo su propia agenda (Profesional, si el salón lo permite).
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
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos en `lib/permissions.ts`).

- [ ] **Step 4: Commit**

```bash
git add lib/permissions.ts
git commit -m "feat(permisos): capacidad agenda.gestionar_propia + asistenteWriteScope"
```

---

## Task 2: Módulo compartido `lib/agendaOps.ts` (operaciones + validación)

> Este módulo es la "vía autenticada" que ejecuta el panel al confirmar. Replica la lógica que hoy vive inline en `AgendaCalendar.web.tsx`. **Lee y reutiliza** esas secciones (no inventes lógica nueva de fases/encadenados):
> - Validación de solape contra `bloqueos_profesional` + `citas`: `AgendaCalendar.web.tsx:3179-3220`.
> - Payload de creación de cita: `AgendaCalendar.web.tsx:3135-3170` (`negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado=CITA_STATUS.CONFIRMADA, canal, creado_por`).
> - Cancelar = `update({estado: CITA_STATUS.CANCELADA}).eq('id', citaId)` (`:402`).
> - Reagendar = `update(payload).eq('id', citaId)` con re-cálculo de fin/fin_activa/fin_espera y chequeo de solape (`:2158-2171`).
> - Bloqueos en tabla `bloqueos_profesional` (`negocio_id, profesional_id, inicio, fin, tipo, motivo`).

**Files:**
- Create: `lib/agendaOps.ts`

- [ ] **Step 1: Tipos de acción propuesta (contrato compartido Edge↔panel)**

Crear `lib/agendaOps.ts` con los tipos que también consumirá la Edge Function (Task 4). Mantenerlos en un solo sitio para que no diverjan.

```ts
import { supabase } from '@/lib/supabase';
import { CITA_STATUS } from '@/lib/constants'; // usar el mismo enum que la UI
import { isTimeSlotOccupied } from '@/lib/utils/appointment';

export type AccionPropuesta =
  | { tipo: 'crear_cita'; negocio_id: string; profesional_id: string; profesional_nombre: string;
      servicio_id: string; servicio_nombre: string; cliente_id: string | null; cliente_nombre: string | null;
      inicio: string; fin: string; fin_activa: string; fin_espera: string; resumen: string; solapa: boolean }
  | { tipo: 'reagendar_cita'; cita_id: string; nuevo_inicio: string; nuevo_fin: string;
      nuevo_fin_activa: string; nuevo_fin_espera: string; nuevo_profesional_id?: string; resumen: string; solapa: boolean }
  | { tipo: 'cancelar_cita'; cita_id: string; motivo: string | null; resumen: string }
  | { tipo: 'bloquear_hueco'; negocio_id: string; profesional_id: string; profesional_nombre: string;
      inicio: string; fin: string; motivo: string | null; resumen: string; solapa: boolean }
  | { tipo: 'liberar_hueco'; bloqueo_id: string; resumen: string };

export type EjecucionResultado = { ok: true; mensaje: string } | { ok: false; error: string };
```

- [ ] **Step 2: Ejecutor único `ejecutarAccion`**

Añadir la función que el panel llama al confirmar. Hace el write por la sesión Supabase del usuario (RLS aplica). Replicar el payload/lógica de las líneas citadas arriba; aquí va la orquestación.

```ts
export async function ejecutarAccion(a: AccionPropuesta, userId: string): Promise<EjecucionResultado> {
  try {
    switch (a.tipo) {
      case 'crear_cita': {
        const { error } = await supabase.from('citas').insert({
          negocio_id: a.negocio_id,
          profesional_id: a.profesional_id,
          servicio_id: a.servicio_id,
          cliente_id: a.cliente_id,
          inicio: a.inicio, fin: a.fin, fin_activa: a.fin_activa, fin_espera: a.fin_espera,
          estado: CITA_STATUS.CONFIRMADA,
          canal: 'asistente_ia',
          creado_por: userId,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita creada: ${a.resumen}` };
      }
      case 'reagendar_cita': {
        const payload: Record<string, unknown> = {
          inicio: a.nuevo_inicio, fin: a.nuevo_fin, fin_activa: a.nuevo_fin_activa, fin_espera: a.nuevo_fin_espera,
        };
        if (a.nuevo_profesional_id) payload.profesional_id = a.nuevo_profesional_id;
        const { error } = await supabase.from('citas').update(payload).eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita reagendada: ${a.resumen}` };
      }
      case 'cancelar_cita': {
        const { error } = await supabase.from('citas')
          .update({ estado: CITA_STATUS.CANCELADA }).eq('id', a.cita_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Cita cancelada: ${a.resumen}` };
      }
      case 'bloquear_hueco': {
        const { error } = await supabase.from('bloqueos_profesional').insert({
          negocio_id: a.negocio_id, profesional_id: a.profesional_id,
          inicio: a.inicio, fin: a.fin, tipo: 'manual', motivo: a.motivo,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Hueco bloqueado: ${a.resumen}` };
      }
      case 'liberar_hueco': {
        const { error } = await supabase.from('bloqueos_profesional').delete().eq('id', a.bloqueo_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: 'Hueco liberado.' };
      }
    }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
```

> Nota: `canal: 'asistente_ia'` ya es un valor válido de `citas.canal` (ampliado en `migrations/agentes-ia-base.sql`). Verificar con `hairy-agenda-rules` que crear cita encadenada (grupo) NO entra en v1: el asistente solo crea citas simples; los encadenados se hacen en la UI.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (puede requerir confirmar el path real de `CITA_STATUS` en `lib/constants.ts`; ajustarlo si difiere).

- [ ] **Step 4: Commit**

```bash
git add lib/agendaOps.ts
git commit -m "feat(agenda): lib/agendaOps con ejecutor de acciones del asistente"
```

---

## Task 3: Secret de Anthropic (paso externo del usuario)

**Files:** ninguno (configuración de infraestructura).

- [ ] **Step 1: Poner el secret en Supabase**

El usuario crea `ANTHROPIC_API_KEY` como secret del proyecto (vía Management API, igual que los secrets de Stripe):
`POST https://api.supabase.com/v1/projects/vtrggiogjrhqtwbhbgia/secrets` con `[{ "name": "ANTHROPIC_API_KEY", "value": "sk-ant-..." }]` y el PAT `sbp_...` del CLAUDE.md global.

- [ ] **Step 2: Verificar**

Listar secrets (`GET .../secrets`) y confirmar que `ANTHROPIC_API_KEY` aparece. (No imprime el valor.)

---

## Task 4: Edge Function `agenda-asistente`

> El LLM ejecuta lecturas (server-side) y propone escrituras. La función deriva `negocio_id`/rol del JWT y NUNCA escribe en `citas`/`bloqueos_profesional`.

**Files:**
- Create: `supabase/functions/agenda-asistente/index.ts`

- [ ] **Step 1: Esqueleto, CORS, auth y clientes**

Crear el archivo siguiendo el patrón de `supabase/functions/crear-checkout-senal/index.ts` (CORS, helper `json`, `Deno.serve`). Dos clientes Supabase: uno con la **service key** (lecturas scoped) y otro con el **JWT del usuario** solo para resolver su `profile`.

```ts
import Anthropic from 'npm:@anthropic-ai/sdk@0.65';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'No autenticado' }, 401);

    const { data: profile } = await svc
      .from('profiles').select('negocio_id, role').eq('id', user.id).maybeSingle();
    if (!profile?.negocio_id) return json({ error: 'Sin negocio' }, 403);

    const { mensajes } = await req.json().catch(() => ({ mensajes: [] }));
    const out = await runAgente(profile.negocio_id, profile.role ?? 'employee', user.id, mensajes ?? []);
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
```

- [ ] **Step 2: Definición de tools (lectura + escritura) y system prompt**

Añadir las definiciones de tools (formato Anthropic) y el system prompt. Las tools de escritura se declaran pero su "ejecución" produce la propuesta.

```ts
const TOOLS = [
  { name: 'consultar_disponibilidad', description: 'Huecos libres de un día. Filtra por profesional o servicio si se indica.',
    input_schema: { type: 'object', properties: {
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      profesional: { type: 'string' }, servicio: { type: 'string' } }, required: ['fecha'] } },
  { name: 'listar_citas', description: 'Citas en un rango. Filtra por profesional, cliente o estado.',
    input_schema: { type: 'object', properties: {
      desde: { type: 'string' }, hasta: { type: 'string' },
      profesional: { type: 'string' }, cliente: { type: 'string' }, estado: { type: 'string' } }, required: ['desde'] } },
  { name: 'buscar_cliente', description: 'Busca clientes por nombre o teléfono. Devuelve candidatos para resolver cliente_id.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } },
  { name: 'info_catalogo', description: 'Servicios (con duración) y profesionales activos del salón.',
    input_schema: { type: 'object', properties: {} } },
  // Escritura (propuesta):
  { name: 'crear_cita', description: 'Propone crear una cita simple.',
    input_schema: { type: 'object', properties: {
      cliente: { type: 'string' }, servicio: { type: 'string' },
      profesional: { type: 'string' }, inicio: { type: 'string', description: 'ISO o lenguaje natural ya resuelto a YYYY-MM-DDTHH:mm' } },
      required: ['servicio', 'profesional', 'inicio'] } },
  { name: 'reagendar_cita', description: 'Propone mover una cita (nueva hora y/o profesional).',
    input_schema: { type: 'object', properties: {
      cita_id: { type: 'string' }, nuevo_inicio: { type: 'string' }, nuevo_profesional: { type: 'string' } },
      required: ['cita_id'] } },
  { name: 'cancelar_cita', description: 'Propone cancelar una cita.',
    input_schema: { type: 'object', properties: { cita_id: { type: 'string' }, motivo: { type: 'string' } }, required: ['cita_id'] } },
  { name: 'bloquear_hueco', description: 'Propone bloquear una franja de un profesional.',
    input_schema: { type: 'object', properties: {
      profesional: { type: 'string' }, inicio: { type: 'string' }, fin: { type: 'string' }, motivo: { type: 'string' } },
      required: ['profesional', 'inicio', 'fin'] } },
  { name: 'liberar_hueco', description: 'Propone liberar un bloqueo existente.',
    input_schema: { type: 'object', properties: { bloqueo_id: { type: 'string' } }, required: ['bloqueo_id'] } },
];
const ESCRITURA = new Set(['crear_cita','reagendar_cita','cancelar_cita','bloquear_hueco','liberar_hueco']);

function systemPrompt(hoyISO: string, scope: string) {
  return [
    'Eres el asistente de agenda de un salón de peluquería. Operas en español, con tono breve y profesional.',
    `Hoy es ${hoyISO} (zona Europe/Madrid). Resuelve referencias relativas ("mañana", "las 5") a fechas/horas concretas.`,
    'Para consultar usa las tools de lectura. Para operar usa las tools de escritura: NO confirmas tú; el sistema mostrará una tarjeta de confirmación al usuario.',
    'Antes de proponer una escritura, resuelve nombres a entidades reales con buscar_cliente / info_catalogo. Si hay ambigüedad (varios clientes, servicio inexistente), PREGUNTA en vez de proponer.',
    scope === 'none' ? 'Este usuario solo puede CONSULTAR: no propongas escrituras; si te las piden, explica que no tiene permiso.' :
    scope === 'self' ? 'Este usuario (profesional) solo puede operar SU PROPIA agenda.' :
    'Este usuario puede operar la agenda de cualquier profesional.',
  ].join('\n');
}
```

- [ ] **Step 3: Bucle del agente con ejecución de lecturas y corte en escritura**

`runAgente` llama al modelo en bucle: ejecuta tools de lectura y reinyecta resultados; al primer tool de escritura, construye la `accion_propuesta` (resolviendo nombres→ids y validando solape contra `citas`/`bloqueos_profesional`, replicando la query de `AgendaCalendar.web.tsx:3181-3220`) y corta.

```ts
async function runAgente(negocioId: string, role: string, userId: string, mensajes: any[]) {
  const scope = role === 'owner' || role === 'admin' || role === 'recepcion' ? 'all'
    : (/* flag se consulta abajo */ false) ? 'self' : 'self_or_none';
  // El flag asistenteProfesionalEscribe se lee de negocio_config y se pasa desde el front en `mensajes`
  // o se consulta aquí; para simplicidad se consulta aquí:
  const { data: cfg } = await svc.from('negocio_config').select('config').eq('negocio_id', negocioId).maybeSingle();
  const profEscribe = !!cfg?.config?.asistenteProfesionalEscribe;
  const effort = (cfg?.config?.asistenteEffort as string) || 'medium';
  const realScope = role === 'owner' || role === 'admin' || role === 'recepcion' ? 'all'
    : (profEscribe && role === 'employee') ? 'self' : 'none';

  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
  const conv: any[] = [...mensajes];

  for (let i = 0; i < 6; i++) {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system: [{ type: 'text', text: systemPrompt(hoy, realScope), cache_control: { type: 'ephemeral' } }],
      tools: TOOLS as any,
      messages: conv,
    });
    conv.push({ role: 'assistant', content: resp.content });

    const toolUses = resp.content.filter((b: any) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      await registrarConv(negocioId, userId, conv);
      return { texto };
    }

    // ¿Alguna escritura? -> construir propuesta y cortar.
    const escritura = toolUses.find((t: any) => ESCRITURA.has(t.name));
    if (escritura) {
      if (realScope === 'none') {
        return { texto: 'No tienes permiso para modificar la agenda; solo puedo consultarla.' };
      }
      const propuesta = await construirPropuesta(escritura, negocioId, realScope);
      if ('error' in propuesta) {
        // Reinyecta el error como tool_result para que el LLM repregunte
        conv.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: escritura.id, content: propuesta.error, is_error: true }] });
        continue;
      }
      const texto = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      await registrarConv(negocioId, userId, conv);
      return { texto: texto || 'Revisa la acción y confirma:', accion_propuesta: propuesta };
    }

    // Solo lecturas: ejecutarlas y reinyectar resultados.
    const results = [];
    for (const t of toolUses) {
      const r = await ejecutarLectura(t, negocioId, realScope);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(r) });
    }
    conv.push({ role: 'user', content: results });
  }
  return { texto: 'No he podido completar la petición. ¿Puedes reformularla?' };
}
```

- [ ] **Step 4: `ejecutarLectura`, `construirPropuesta`, `registrarConv`**

Implementar las tres helpers. `ejecutarLectura` hace queries con `svc` scoped por `negocio_id` (y por el `profesional_id` propio si `realScope==='self'` — resolver el `profesional_id` del usuario vía `profiles`/`profesionales`). `construirPropuesta` resuelve nombres→ids (`info_catalogo`/`buscar_cliente`), calcula `fin/fin_activa/fin_espera` desde las duraciones del servicio (`duracion_activa_min`, `duracion_espera_min`, `duracion_activa_extra_min`) y marca `solapa` replicando la query de solape de `AgendaCalendar.web.tsx:3205-3220`. `registrarConv` llama a `svc.rpc('registrar_conversacion_ia', {...})`.

```ts
async function ejecutarLectura(t: any, negocioId: string, scope: string) {
  const inp = t.input ?? {};
  switch (t.name) {
    case 'info_catalogo': {
      const [{ data: servicios }, { data: profes }] = await Promise.all([
        svc.from('servicios').select('id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min').eq('negocio_id', negocioId),
        svc.from('profesionales').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true),
      ]);
      return { servicios, profesionales: profes };
    }
    case 'buscar_cliente':
      return (await svc.from('clientes').select('id, nombre, telefono').eq('negocio_id', negocioId)
        .or(`nombre.ilike.%${inp.texto}%,telefono.ilike.%${inp.texto}%`).limit(8)).data;
    case 'listar_citas': {
      let q = svc.from('citas').select('id, inicio, fin, estado, profesional_id, servicio_id, cliente_id')
        .eq('negocio_id', negocioId).gte('inicio', `${inp.desde}T00:00:00`);
      if (inp.hasta) q = q.lt('inicio', `${inp.hasta}T23:59:59`); else q = q.lt('inicio', `${inp.desde}T23:59:59`);
      if (inp.estado) q = q.eq('estado', inp.estado);
      const { data } = await q;
      return data;
    }
    case 'consultar_disponibilidad': {
      // Devuelve citas+bloqueos del día para que el LLM razone los huecos.
      const dia = inp.fecha;
      const [{ data: citas }, { data: bloqueos }] = await Promise.all([
        svc.from('citas').select('inicio, fin, profesional_id').eq('negocio_id', negocioId)
          .eq('estado', 'confirmada').gte('inicio', `${dia}T00:00:00`).lt('inicio', `${dia}T23:59:59`),
        svc.from('bloqueos_profesional').select('inicio, fin, profesional_id').eq('negocio_id', negocioId)
          .gte('inicio', `${dia}T00:00:00`).lt('inicio', `${dia}T23:59:59`),
      ]);
      return { citas, bloqueos };
    }
    default: return { error: 'tool desconocida' };
  }
}
```

> `construirPropuesta` y `registrarConv`: implementarlas en este mismo paso siguiendo las firmas usadas en `runAgente`. `construirPropuesta` devuelve un `AccionPropuesta` (mismo shape que `lib/agendaOps.ts`) o `{ error }`. Para `crear_cita`: resolver `servicio`→`servicio_id`+duraciones, `profesional`→`profesional_id`, `cliente`→`cliente_id` (si el LLM no lo resolvió, devolver `{ error: 'Cliente ambiguo o no encontrado' }`); calcular `fin_activa = inicio + duracion_activa_min`, `fin_espera = fin_activa + duracion_espera_min`, `fin = fin_espera + duracion_activa_extra_min`; chequear solape. Para `reagendar_cita`: leer la cita, recalcular fines; si `scope==='self'`, validar que `profesional_id` de la cita == el del usuario, si no `{ error: 'Solo puedes operar tu propia agenda' }`. Para `bloquear_hueco`/`liberar_hueco`: análogo con scope.

- [ ] **Step 5: Desplegar y verificar invocación**

Desplegar la función (vía MCP de Supabase `deploy_edge_function` o CLI). Probar con curl autenticado (anon key + Bearer de un usuario del demo) un mensaje de consulta:

Run (ejemplo): `curl -X POST .../functions/v1/agenda-asistente -H "Authorization: Bearer <jwt>" -H 'apikey: <anon>' -d '{"mensajes":[{"role":"user","content":"¿qué servicios ofrecéis?"}]}'`
Expected: `{ "texto": "<catálogo del demo>" }` sin `accion_propuesta`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/agenda-asistente/index.ts
git commit -m "feat(edge): agenda-asistente (LLM tool-use, lecturas server-side, escrituras como propuesta)"
```

---

## Task 5: Panel `AsistenteAgenda.web.tsx`

**Files:**
- Create: `components/agenda/AsistenteAgenda.web.tsx`
- Create: `components/agenda/AsistenteAgenda.tsx` (stub nativo)

> Cargar `hairy-design-system` antes: usar tokens fuego, `useResponsive`, y el patrón de panel/animación existente.

- [ ] **Step 1: Stub nativo**

```tsx
// components/agenda/AsistenteAgenda.tsx
export default function AsistenteAgenda() { return null; }
```

- [ ] **Step 2: Estructura del panel web**

Crear `AsistenteAgenda.web.tsx`: burbuja flotante (bottom-right) que abre un panel lateral de chat. Estado: `mensajes` (historial al estilo Anthropic: `{role, content}`), `cargando`, `propuesta` (la `AccionPropuesta | null` del último turno). Props: `{ negocioId, profile, onAgendaChanged }`.

Al enviar: `POST` a la Edge Function vía `supabase.functions.invoke('agenda-asistente', { body: { mensajes } })`; añade la respuesta del asistente; si trae `accion_propuesta`, guárdala para pintar la tarjeta.

- [ ] **Step 3: Tarjeta de confirmación + ejecución**

Cuando hay `propuesta`, pintar una tarjeta con su `resumen` (y aviso si `solapa`), y botones [Confirmar]/[Cancelar]. Confirmar → `import { ejecutarAccion } from '@/lib/agendaOps'` → `ejecutarAccion(propuesta, userId)` → añadir mensaje de feedback, limpiar `propuesta`, llamar `onAgendaChanged()` para refrescar la agenda.

```tsx
const onConfirmar = async () => {
  if (!propuesta) return;
  const r = await ejecutarAccion(propuesta, profile.id);
  setMensajes((m) => [...m, { role: 'assistant', content: r.ok ? r.mensaje : `No se pudo: ${r.error}` }]);
  setPropuesta(null);
  if (r.ok) onAgendaChanged();
};
```

- [ ] **Step 4: Verificar typecheck + build**

Run: `npx tsc --noEmit` && `npm run build:web`
Expected: PASS / build OK.

- [ ] **Step 5: Commit**

```bash
git add components/agenda/AsistenteAgenda.web.tsx components/agenda/AsistenteAgenda.tsx
git commit -m "feat(agenda): panel del asistente con confirmacion de acciones"
```

---

## Task 6: Config (toggles) + montaje gateado en Agenda

**Files:**
- Modify: `app/(tabs)/configuracion.web.tsx`
- Modify: `components/agenda/AgendaCalendar.web.tsx` (o el contenedor de la pantalla Agenda)

- [ ] **Step 1: Toggles en Config**

En `configuracion.web.tsx`, en la pestaña/sección adecuada (reutilizar el patrón de las claves `notif*` que ya escriben en `negocio_config.config`), añadir:
- `asistenteAgendaActivo` (switch, default false) — "Asistente de agenda (IA)".
- `asistenteProfesionalEscribe` (switch, default false, sub-opción) — "Permitir que cada profesional opere su propia agenda con el asistente".
- `asistenteEffort` (select low/medium/high, default 'medium', avanzado/opcional).

Persisten en `negocio_config.config` igual que el resto de toggles.

- [ ] **Step 2: Montar el panel gateado**

En la pantalla de Agenda, leer `config.asistenteAgendaActivo` (ya se carga `negocio_config` en `AgendaCalendar.web.tsx:238`) y, si está activo, renderizar `<AsistenteAgenda negocioId={negocioId} profile={profile} onAgendaChanged={recargar} />`. `onAgendaChanged` = la función que recarga citas/bloqueos de la pantalla.

- [ ] **Step 3: Verificar typecheck + build**

Run: `npx tsc --noEmit` && `npm run build:web`
Expected: PASS / build OK.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/configuracion.web.tsx components/agenda/AgendaCalendar.web.tsx
git commit -m "feat(config): toggles del asistente + montaje gateado en Agenda"
```

---

## Task 7: Verificación E2E sobre el demo

**Files:** ninguno (verificación manual guiada).

- [ ] **Step 1: Preparar**

`npm run build:web` && `node scripts/serve-web.mjs`. Entrar al software con una cuenta del demo (rol con `agenda.gestionar_todas`). Activar `asistenteAgendaActivo` en Config.

- [ ] **Step 2: Consultas**

En el panel: "¿qué huecos hay mañana por la tarde?" y "¿cuántas citas tiene <profesional> hoy?". Expected: respuestas coherentes con la agenda del demo, sin tarjeta de confirmación.

- [ ] **Step 3: Escrituras con confirmación**

"crea una cita de <servicio> con <profesional> mañana a las 11 para <cliente>" → aparece tarjeta → Confirmar → la cita aparece en la agenda. Repetir con "muéveme la cita de las 11 a las 12", "cancela esa cita", "bloquéame de 14:00 a 15:00". Expected: cada una pide confirmación y, al confirmar, se refleja en la agenda.

- [ ] **Step 4: Permisos**

Con `asistenteProfesionalEscribe=false`, entrar como Profesional: el asistente consulta pero rechaza operar. Con el toggle ON, opera solo su propia agenda (intentar mover la cita de otro → rechazo).

- [ ] **Step 5: Limpiar**

Borrar los datos de prueba creados en el demo y dejar el tenant como estaba.

---

## Self-Review (cobertura del spec)

- §3 Arquitectura/flujo → Tasks 2, 4, 5. ✓
- §4 Tools (lectura/escritura) → Task 4 Step 2/4. ✓
- §5 Config (3 claves) → Task 6. ✓
- §6 Permisos (gestionar_propia + scope) → Task 1 + Task 4 Step 3-4 + Task 5. ✓
- §7 Errores/seguridad (repregunta, solape, confirmación, log) → Task 4 (propuesta+error reinyectado, `registrar_conversacion_ia`), Task 5 (confirmación). ✓
- §9 Setup externo (ANTHROPIC_API_KEY) → Task 3. ✓

**Pendiente a resolver durante implementación (no bloqueante):** confirmar el path/exports reales de `CITA_STATUS` (`lib/constants.ts`) y de la pantalla contenedora de Agenda donde montar el panel; cargar `hairy-agenda-rules` para validar el cálculo de `fin_activa/fin_espera/fin` por servicio.
