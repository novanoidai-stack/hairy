# Asistente de Onboarding Cinematográfico con IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La primera vez que un gestor entra a su negocio propio ya operativo-elegible, un asistente de IA a pantalla completa (cinematográfico, sin aspecto de chat) le va guiando por lenguaje natural para crear sus servicios, su equipo, sus horarios y el resto de configuración inicial — con acciones reales sobre la base de datos.

**Architecture:** Una Edge Function (`onboarding-agent`) actúa de intérprete puntual por tema (no orquesta todo el flujo): el **cliente** controla la secuencia fija de temas y ejecuta las escrituras reales vía `supabase-js` (mismo RLS que ya usan Ajustes/Equipo); la IA (Claude via OpenRouter, reutilizando el mismo patrón que `agenda-asistente`) solo (a) redacta la pregunta de cada tema de forma natural (con tip de precio opcional) y (b) interpreta la respuesta libre del propietario y la traduce a argumentos estructurados mediante function-calling forzado (`tool_choice` fijo a la tool del tema). Cada llamada tiene timeout de 6s con caída a un formulario simple si falla — la IA es una capa de valor añadido, nunca un bloqueante.

**Tech Stack:** Supabase Edge Functions (Deno) + `npm:openai@4` apuntando a OpenRouter (mismo patrón que `supabase/functions/agenda-asistente`), React Native Web (Expo Router), TypeScript, `supabase-js` en cliente.

## Global Constraints

- Código en inglés, comentarios en español, sin emojis en UI (CLAUDE.md).
- Sin `any` evitable en TypeScript nuevo; `fetch` nativo donde aplique.
- Mobile-first: usar `useResponsive()` en toda pantalla nueva.
- **Este repo no tiene framework de tests (sin Jest/Vitest en `package.json`).** La verificación es manual: `npm run build:web` + `node scripts/serve-web.mjs` + navegador, más `npx tsc --noEmit` para tipos, siguiendo el mismo patrón que los specs previos de este repo (`docs/superpowers/specs/2026-06-26-onboarding-checklist-design.md` §11). Cada tarea de este plan sustituye el ciclo "test unitario" por un paso de verificación manual concreto y exacto. Para la Edge Function, se verifica con `curl` contra el endpoint desplegado (determinista, sin necesitar LLM real para los casos de auth).
- Nunca commitear la clave de OpenRouter. Vive como secreto de la Edge Function (`supabase secrets set OPENROUTER_API_KEY=...`), nunca en el repo ni en el cliente.
- El asistente es **web-only** para v1 (paridad nativa fuera de alcance, ver spec §7).
- Spec de referencia: `docs/superpowers/specs/2026-07-03-onboarding-ia-cinematico-design.md`.

---

### Task 1: Edge Function `onboarding-agent`

**Files:**
- Create: `supabase/functions/onboarding-agent/index.ts`

**Interfaces:**
- Consumes: nada de otras tareas (es la primera pieza, autocontenida).
- Produces: contrato HTTP que consume la Tarea 2 (`lib/onboardingAgent.ts`):
  - Request body: `{ modo: 'enriquecer_pregunta' | 'interpretar_respuesta'; tema: TemaId; texto?: string; estado: Record<TemaId, boolean>; perfil: { codigoPostal?: string; nombreNegocio?: string }; contexto?: Record<string, string> }`
  - Response 200: `{ pregunta?: { titulo: string; subtitulo?: string; placeholder_ejemplo?: string }; accion?: { tipo: string; args: Record<string, unknown> } }`
  - Response error: `{ error: string }` con status 401/403/500.
  - `TemaId = 'datos_negocio' | 'servicios' | 'equipo' | 'horario_salon' | 'reserva_online' | 'notificaciones'` (fotos_servicios no llama a `interpretar_respuesta`, solo a `enriquecer_pregunta`).

- [ ] **Step 1: Crear la Edge Function con auth, prompt y las dos tools por modo**

```typescript
// supabase/functions/onboarding-agent/index.ts
// Edge Function: onboarding-agent
// Interprete puntual del asistente de onboarding con IA. NO orquesta el flujo
// completo (eso lo hace el cliente, tema a tema) y NO escribe en la base de
// datos: solo redacta la pregunta de un tema o interpreta la respuesta libre
// del propietario y la traduce a argumentos estructurados via function-calling
// forzado. El cliente (sesion ya autenticada) ejecuta la escritura real.
// Mismo patron de auth/CORS/cliente-OpenRouter que supabase/functions/agenda-asistente.

import OpenAI from 'npm:openai@4';
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
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: Deno.env.get('OPENROUTER_API_KEY') ?? '',
});
// Mismo slug ya probado en supabase/functions/agenda-asistente (confirmado
// disponible en la cuenta de OpenRouter del proyecto). Constante centralizada
// para poder afinar coste/latencia mas adelante sin tocar el resto del fichero.
const MODEL = 'anthropic/claude-sonnet-4.6';

type TemaId = 'datos_negocio' | 'servicios' | 'equipo' | 'horario_salon' | 'reserva_online' | 'notificaciones';

// Una tool de escritura por tema: define exactamente los argumentos que el
// propietario necesita rellenar. tool_choice se fuerza a la del tema actual,
// asi la respuesta del modelo SIEMPRE tiene esta forma (nada de texto libre
// que parsear).
const TEMA_TOOLS: Record<TemaId, { name: string; description: string; parameters: Record<string, unknown> }> = {
  datos_negocio: {
    name: 'completar_datos_negocio',
    description: 'Extrae nombre, direccion y telefono del negocio de la respuesta libre del propietario.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        direccion: { type: 'string' },
        telefono: { type: 'string' },
      },
      required: ['nombre', 'direccion', 'telefono'],
    },
  },
  servicios: {
    name: 'crear_servicio',
    description: 'Extrae nombre, precio (euros) y duracion (minutos) de un servicio de peluqueria de la respuesta libre.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        precio: { type: 'number' },
        duracion_min: { type: 'number' },
      },
      required: ['nombre', 'precio', 'duracion_min'],
    },
  },
  equipo: {
    name: 'crear_profesional',
    description: 'Extrae nombre y categoria de un profesional del equipo, y si el propietario quiere invitarle ya por email.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        categoria: { type: 'string', enum: ['auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'] },
        quiere_invitar: { type: 'boolean', description: 'true si el propietario dio o pidio dar de alta un email de acceso para esta persona' },
        email: { type: 'string', description: 'Email si quiere_invitar es true; cadena vacia si no.' },
      },
      required: ['nombre', 'categoria', 'quiere_invitar', 'email'],
    },
  },
  horario_salon: {
    name: 'fijar_horario_salon',
    description: 'Traduce el horario semanal descrito en lenguaje natural a los 7 dias (0=lunes...6=domingo).',
    parameters: {
      type: 'object',
      properties: {
        dias: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              dia_semana: { type: 'number' },
              abierto: { type: 'boolean' },
              apertura: { type: 'string', description: 'HH:MM, solo si abierto=true' },
              cierre: { type: 'string', description: 'HH:MM, solo si abierto=true' },
            },
            required: ['dia_semana', 'abierto'],
          },
        },
      },
      required: ['dias'],
    },
  },
  reserva_online: {
    name: 'activar_reserva_online',
    description: 'Interpreta si el propietario quiere activar ya la reserva online publica.',
    parameters: {
      type: 'object',
      properties: { activar: { type: 'boolean' } },
      required: ['activar'],
    },
  },
  notificaciones: {
    name: 'activar_notificaciones',
    description: 'Interpreta si el propietario quiere activar los recordatorios automaticos por WhatsApp.',
    parameters: {
      type: 'object',
      properties: { activar: { type: 'boolean' } },
      required: ['activar'],
    },
  },
};

const ENUNCIAR_TOOL = {
  name: 'enunciar_pregunta',
  description: 'Redacta la pregunta que se muestra en pantalla para el tema actual.',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Pregunta o afirmacion breve, tono editorial (no burbuja de chat), maximo 12 palabras.' },
      subtitulo: { type: 'string', description: 'Opcional: una linea de contexto o dato de utilidad (ver reglas de precio abajo).' },
      placeholder_ejemplo: { type: 'string', description: 'Ejemplo de como responder, formato: "p. ej. ...".' },
    },
    required: ['titulo'],
  },
};

const REGLAS_PRECIO = 'Si el tema es "servicios" y hay codigo postal, puedes anadir en "subtitulo" una estimacion de precio de mercado ORIENTATIVA para ese tipo de servicio en esa zona, SIEMPRE con la coletilla "(estimacion de la IA, no un dato verificado)" al final. Nunca la des como cifra oficial. Si no tienes codigo postal, omite el subtitulo de precio.';
const REGLAS_TONO = 'Espanol, sin emojis, tono cercano pero profesional, frases cortas. No inventes datos de mercado fuera de la regla de precio de arriba.';

function buildSystemPrompt(modo: string, tema: TemaId, estado: Record<string, boolean>, perfil: { codigoPostal?: string; nombreNegocio?: string }): string {
  const pendientes = Object.entries(estado).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'ninguno';
  const base = [
    'Eres el asistente de puesta en marcha del software de gestion de peluquerias Mecha.',
    REGLAS_TONO,
    `Codigo postal del negocio: ${perfil.codigoPostal || 'desconocido'}. Nombre del negocio: ${perfil.nombreNegocio || 'desconocido'}.`,
    `Temas ya completados antes de esta sesion: ${Object.entries(estado).filter(([, v]) => v).map(([k]) => k).join(', ') || 'ninguno'}. Pendientes: ${pendientes}.`,
    `Tema actual: ${tema}.`,
  ];
  if (modo === 'enriquecer_pregunta') {
    base.push(REGLAS_PRECIO, 'Llama SIEMPRE a la tool enunciar_pregunta con la pregunta de este tema.');
  } else {
    base.push('El propietario ha respondido en lenguaje natural. Llama SIEMPRE a la tool del tema actual con los datos que puedas extraer. Si falta un dato imprescindible, pon tu mejor estimacion razonable a partir del texto (nunca inventes un email; si no dio email, quiere_invitar=false y email="").');
  }
  return base.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'not_authenticated' }, 401);

    const { data: profile } = await svc.from('profiles').select('negocio_id, role').eq('id', user.id).maybeSingle();
    if (!profile?.negocio_id || !['owner', 'admin'].includes(profile.role ?? '')) {
      return json({ error: 'not_authorized' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const modo = body?.modo === 'interpretar_respuesta' ? 'interpretar_respuesta' : 'enriquecer_pregunta';
    const tema = body?.tema as TemaId;
    if (!TEMA_TOOLS[tema]) return json({ error: 'invalid_tema' }, 400);
    const estado = (body?.estado ?? {}) as Record<string, boolean>;
    const perfil = (body?.perfil ?? {}) as { codigoPostal?: string; nombreNegocio?: string };
    const texto = typeof body?.texto === 'string' ? body.texto : '';

    const tool = modo === 'enriquecer_pregunta' ? ENUNCIAR_TOOL : TEMA_TOOLS[tema];
    const messages: any[] = [
      { role: 'system', content: buildSystemPrompt(modo, tema, estado, perfil) },
    ];
    if (modo === 'interpretar_respuesta') messages.push({ role: 'user', content: texto });
    else messages.push({ role: 'user', content: 'Redacta la pregunta de este tema.' });

    const resp = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages,
      tools: [{ type: 'function', function: tool }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    });

    const call = resp.choices[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: 'no_tool_call' }, 502);
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args queda {} */ }

    if (modo === 'enriquecer_pregunta') {
      return json({ pregunta: { titulo: String(args.titulo ?? ''), subtitulo: args.subtitulo ? String(args.subtitulo) : undefined, placeholder_ejemplo: args.placeholder_ejemplo ? String(args.placeholder_ejemplo) : undefined } });
    }
    return json({ accion: { tipo: tool.name, args } });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
```

- [ ] **Step 2: Desplegar la Edge Function**

```bash
# Requiere Supabase CLI vinculado al proyecto (o usar la MCP de Supabase / dashboard si no hay CLI local).
supabase functions deploy onboarding-agent
supabase secrets set OPENROUTER_API_KEY=<clave real, no versionar>
```

Nota: la clave de pruebas la compartio el usuario en la sesion de brainstorming (fuera de git, por chat). No pegarla nunca en este repo ni en ningun archivo versionado: usar `supabase secrets set` directamente en la terminal o el dashboard. Antes de produccion real, rotarla en el dashboard de OpenRouter y volver a ejecutar `supabase secrets set` con la nueva.

- [ ] **Step 3: Verificar el rechazo de peticiones no autenticadas (determinista, sin LLM)**

```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/onboarding-agent" \
  -H "Content-Type: application/json" \
  -d '{"modo":"enriquecer_pregunta","tema":"servicios","estado":{},"perfil":{}}'
```

Expected: `HTTP/1.1 401` y body `{"error":"not_authenticated"}` (sin cabecera Authorization valida).

- [ ] **Step 4: Verificar una llamada real autenticada**

Con un token JWT valido de una cuenta owner/admin de negocio propio (obtenido desde el navegador: `(await supabase.auth.getSession()).data.session.access_token` en la consola de devtools tras iniciar sesion):

```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/onboarding-agent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{"modo":"enriquecer_pregunta","tema":"servicios","estado":{"servicios":false},"perfil":{"codigoPostal":"28004","nombreNegocio":"Salon Prueba"}}'
```

Expected: `200` con body `{"pregunta":{"titulo":"...","subtitulo":"...","placeholder_ejemplo":"..."}}`. Repetir con `"modo":"interpretar_respuesta","texto":"corte de caballero a 15 euros, media hora"` y comprobar `{"accion":{"tipo":"crear_servicio","args":{"nombre":"...","precio":15,"duracion_min":30}}}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/onboarding-agent/index.ts
git commit -m "feat(onboarding): edge function del asistente de onboarding con IA"
```

---

### Task 2: Librería cliente del agente (`lib/onboardingAgent.ts`)

**Files:**
- Create: `lib/onboardingAgent.ts`

**Interfaces:**
- Consumes: `supabase` de `@/lib/supabase`; `mensajeDeError` de `@/lib/errores`; nada de la Tarea 1 salvo el contrato HTTP ya fijado.
- Produces (consumido por la Tarea 4, `OnboardingAgentOverlay.web.tsx`):
  - `export type TemaId = 'datos_negocio' | 'servicios' | 'equipo' | 'horario_salon' | 'reserva_online' | 'fotos_servicios' | 'notificaciones';`
  - `export const TEMA_ORDEN: TemaId[]`
  - `export const TEMA_FALLBACK: Record<TemaId, { titulo: string; placeholder_ejemplo?: string; modoInput: 'texto' | 'foto' | 'botones' }>` (`'botones'` para `reserva_online`/`notificaciones`: preguntas si/no que se resuelven con dos botones, sin llamar nunca a la IA — mas simple y barato que interpretar texto libre para un booleano).
  - `export const TEMA_DESTINO_MANUAL: Record<TemaId, string>` — texto fijo de "donde configurarlo despues", se muestra siempre junto a "Saltar este paso" (criterio de aceptacion 5 del spec).
  - `export const HORARIO_PRESETS: { label: string; dias: {...}[] }[]` — atajos deterministicos (sin IA) para el tema `horario_salon`, visibles siempre junto al campo de texto libre.
  - `export const TEMA_CAMPOS_SIMPLES: Partial<Record<TemaId, { key: string; label: string; tipo: 'texto' | 'numero' }[]>>` — formulario minimo determinista al que cae `datos_negocio`/`servicios`/`equipo` si `interpretarRespuesta` falla o tarda (requisito de robustez, spec seccion 6).
  - `export async function pedirPregunta(negocioId, tema, estado, perfil): Promise<{ titulo: string; subtitulo?: string; placeholder_ejemplo?: string }>` — nunca lanza; con timeout interno, cae al fallback estatico.
  - `export async function interpretarRespuesta(negocioId, tema, texto, estado, perfil): Promise<{ tipo: string; args: Record<string, any> } | null>` — null si falla/timeout (el llamador debe caer al formulario simple).
  - `export interface ResultadoAccion { ok: boolean; resumen: string }`
  - `export async function ejecutarAccion(tipo: string, args: Record<string, any>, ctx: { negocioId: string; profesionalesCreados: { id: string; nombre: string }[]; datosNegocioSesion?: { nombre: string; direccion: string; telefono: string } }): Promise<ResultadoAccion>` — `ctx` se pasa por referencia; la funcion empuja a `ctx.profesionalesCreados` cuando crea un profesional (para que `fijar_horario_salon` sepa a quien aplicar el horario despues) y LEE `ctx.datosNegocioSesion` si existe (el llamador, `OnboardingAgentOverlay.web.tsx`, lo rellena tras `completar_datos_negocio`).
  - `export function slugifyNombre(s: string): string`

- [ ] **Step 1: Escribir los tipos, el orden de temas y los fallbacks estáticos**

```typescript
// lib/onboardingAgent.ts
// Cliente del asistente de onboarding con IA: orquesta la secuencia FIJA de
// temas (el modelo solo redacta/interpreta, nunca decide el orden), llama a la
// Edge Function con timeout defensivo, y ejecuta las escrituras reales via
// supabase-js bajo el mismo RLS que ya usan Ajustes/Equipo. Si la IA falla o
// tarda, todo tiene un fallback deterministico: el asistente nunca se bloquea.

import { supabase } from '@/lib/supabase';
import { mensajeDeError } from '@/lib/errores';

export type TemaId =
  | 'datos_negocio'
  | 'servicios'
  | 'equipo'
  | 'horario_salon'
  | 'reserva_online'
  | 'fotos_servicios'
  | 'notificaciones';

// Orden fijo: lo decide el cliente, no el modelo. horarios_profesional del
// checklist no es un tema aparte: se aplica solo al fijar horario_salon.
export const TEMA_ORDEN: TemaId[] = [
  'datos_negocio', 'servicios', 'equipo', 'horario_salon', 'reserva_online', 'fotos_servicios', 'notificaciones',
];

export const TEMA_TITULO_SECCION: Record<TemaId, string> = {
  datos_negocio: 'Los datos de tu negocio',
  servicios: 'Tus servicios',
  equipo: 'Tu equipo',
  horario_salon: 'El horario del salon',
  reserva_online: 'La reserva online',
  fotos_servicios: 'Fotos de tus servicios',
  notificaciones: 'Recordatorios por WhatsApp',
};

// Pregunta de reserva por si la IA no responde a tiempo (funciona SIEMPRE).
// reserva_online/notificaciones son 'botones': un si/no no necesita IA para
// interpretarse, asi que ni siquiera se llama al modelo para esos dos temas.
export const TEMA_FALLBACK: Record<TemaId, { titulo: string; placeholder_ejemplo?: string; modoInput: 'texto' | 'foto' | 'botones' }> = {
  datos_negocio: { titulo: 'Cuentanos el nombre, direccion y telefono de tu negocio', placeholder_ejemplo: 'p. ej. "Salon Ana, Calle Mayor 12, 600111222"', modoInput: 'texto' },
  servicios: { titulo: 'Que servicio ofreces primero?', placeholder_ejemplo: 'p. ej. "Corte de caballero, 15 euros, 30 min"', modoInput: 'texto' },
  equipo: { titulo: 'Quien es el primer profesional de tu equipo?', placeholder_ejemplo: 'p. ej. "Marta, oficial, marta@email.com"', modoInput: 'texto' },
  horario_salon: { titulo: 'Que dias y horas abre tu salon?', placeholder_ejemplo: 'p. ej. "Lunes a viernes de 9 a 20, sabado de 9 a 14, domingo cerrado"', modoInput: 'texto' },
  reserva_online: { titulo: 'Activamos ya la reserva online publica?', modoInput: 'botones' },
  fotos_servicios: { titulo: 'Sube una foto de alguno de tus servicios', modoInput: 'foto' },
  notificaciones: { titulo: 'Activamos los recordatorios automaticos por WhatsApp?', modoInput: 'botones' },
};

// Donde configurarlo despues si se salta el paso. Se muestra SIEMPRE junto al
// boton "Saltar este paso" (no solo tras pulsarlo) — criterio de aceptacion 5
// del spec. Mismos destinos que ya usa el checklist manual (lib/onboarding.ts).
export const TEMA_DESTINO_MANUAL: Record<TemaId, string> = {
  datos_negocio: 'Mas tarde en: Ajustes -> General',
  servicios: 'Mas tarde en: Ajustes -> Servicios',
  equipo: 'Mas tarde en: Equipo',
  horario_salon: 'Mas tarde en: Ajustes -> Horarios',
  reserva_online: 'Mas tarde en: Ajustes -> Reserva online',
  fotos_servicios: 'Mas tarde en: Ajustes -> Servicios',
  notificaciones: 'Mas tarde en: Ajustes -> Notificaciones',
};

// Atajos deterministicos (SIN IA) para horario_salon: visibles siempre junto
// al campo de texto libre, no solo como fallback de fallo.
export const HORARIO_PRESETS: { label: string; dias: { dia_semana: number; abierto: boolean; apertura?: string; cierre?: string }[] }[] = [
  {
    label: 'Lunes a viernes 9-20, sabado 9-14',
    dias: [
      { dia_semana: 0, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 1, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 2, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 3, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 4, abierto: true, apertura: '09:00', cierre: '20:00' },
      { dia_semana: 5, abierto: true, apertura: '09:00', cierre: '14:00' },
      { dia_semana: 6, abierto: false },
    ],
  },
  {
    label: 'Martes a sabado 10-20',
    dias: [
      { dia_semana: 0, abierto: false },
      { dia_semana: 1, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 2, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 3, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 4, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 5, abierto: true, apertura: '10:00', cierre: '20:00' },
      { dia_semana: 6, abierto: false },
    ],
  },
];

// Formulario minimo determinista al que cae el fotograma de pregunta si
// interpretarRespuesta devuelve null (fallo/timeout) en un tema de texto
// libre. Requisito de robustez del spec (seccion 6): "cae a un input simple
// y predecible (nombre/precio/duracion en campos normales)". Solo se define
// para los temas cuya interpretacion puede fallar; horario_salon usa los
// presets de arriba en su lugar, y los 'botones' no llaman nunca a la IA.
export const TEMA_CAMPOS_SIMPLES: Partial<Record<TemaId, { key: string; label: string; tipo: 'texto' | 'numero' }[]>> = {
  datos_negocio: [
    { key: 'nombre', label: 'Nombre del negocio', tipo: 'texto' },
    { key: 'direccion', label: 'Direccion', tipo: 'texto' },
    { key: 'telefono', label: 'Telefono', tipo: 'texto' },
  ],
  servicios: [
    { key: 'nombre', label: 'Nombre del servicio', tipo: 'texto' },
    { key: 'precio', label: 'Precio (EUR)', tipo: 'numero' },
    { key: 'duracion_min', label: 'Duracion (min)', tipo: 'numero' },
  ],
  equipo: [
    { key: 'nombre', label: 'Nombre del profesional', tipo: 'texto' },
  ],
};

export interface ResultadoAccion {
  ok: boolean;
  resumen: string;
}

function slugifyNombreImpl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
export const slugifyNombre = slugifyNombreImpl;

// Carrera contra un timeout: nunca deja al asistente colgado si OpenRouter
// tarda o falla (requisito de robustez del spec, seccion 6).
async function conTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}
```

- [ ] **Step 2: Añadir `pedirPregunta` e `interpretarRespuesta` (llaman a la Edge Function con fallback)**

```typescript
// (continuar en lib/onboardingAgent.ts)

interface PerfilAgente {
  codigoPostal?: string;
  nombreNegocio?: string;
}

export async function pedirPregunta(
  tema: TemaId,
  estado: Record<TemaId, boolean>,
  perfil: PerfilAgente,
): Promise<{ titulo: string; subtitulo?: string; placeholder_ejemplo?: string }> {
  const fallback = TEMA_FALLBACK[tema];
  if (tema === 'fotos_servicios') return fallback; // no hace falta la IA para este tema
  const call = supabase.functions.invoke('onboarding-agent', {
    body: { modo: 'enriquecer_pregunta', tema, estado, perfil },
  }).then(({ data, error }) => {
    if (error || !data?.pregunta?.titulo) return null;
    return data.pregunta as { titulo: string; subtitulo?: string; placeholder_ejemplo?: string };
  });
  const result = await conTimeout(call, 6000);
  return result ?? fallback;
}

export async function interpretarRespuesta(
  tema: TemaId,
  texto: string,
  estado: Record<TemaId, boolean>,
  perfil: PerfilAgente,
): Promise<{ tipo: string; args: Record<string, any> } | null> {
  const call = supabase.functions.invoke('onboarding-agent', {
    body: { modo: 'interpretar_respuesta', tema, texto, estado, perfil },
  }).then(({ data, error }) => {
    if (error || !data?.accion?.tipo) return null;
    return data.accion as { tipo: string; args: Record<string, any> };
  });
  return conTimeout(call, 6000);
}
```

- [ ] **Step 3: Añadir `ejecutarAccion` (las escrituras reales)**

```typescript
// (continuar en lib/onboardingAgent.ts)

interface ContextoEjecucion {
  negocioId: string;
  profesionalesCreados: { id: string; nombre: string }[];
  datosNegocioSesion?: { nombre: string; direccion: string; telefono: string };
}

export async function ejecutarAccion(
  tipo: string,
  args: Record<string, any>,
  ctx: ContextoEjecucion,
): Promise<ResultadoAccion> {
  try {
    switch (tipo) {
      case 'completar_datos_negocio': {
        const nombre = String(args.nombre ?? '').trim();
        const direccion = String(args.direccion ?? '').trim();
        const telefono = String(args.telefono ?? '').trim();
        if (!nombre || !direccion || !telefono) return { ok: false, resumen: 'Falta nombre, direccion o telefono.' };
        const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
        const config = { ...(cfgRow?.config ?? {}), nombre, direccion, telefono };
        const { error } = await supabase.from('negocio_config').upsert(
          { negocio_id: ctx.negocioId, config, updated_at: new Date().toISOString() },
          { onConflict: 'negocio_id' },
        );
        if (error) throw error;
        return { ok: true, resumen: `${nombre} · ${direccion} · ${telefono}` };
      }

      case 'crear_servicio': {
        const nombre = String(args.nombre ?? '').trim();
        const precio = Number(args.precio);
        const duracion_min = Number(args.duracion_min);
        if (!nombre || !(precio > 0) || !(duracion_min > 0)) {
          return { ok: false, resumen: 'Necesito nombre, precio y duracion validos.' };
        }
        const { error } = await supabase.from('servicios').insert({
          negocio_id: ctx.negocioId,
          nombre,
          precio,
          duracion_activa_min: duracion_min,
          activo: true,
        });
        if (error) throw error;
        return { ok: true, resumen: `${nombre} · ${precio.toFixed(2)} € · ${duracion_min} min` };
      }

      case 'crear_profesional': {
        const nombre = String(args.nombre ?? '').trim();
        const categoriasValidas = ['auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion'];
        const categoria = categoriasValidas.includes(args.categoria) ? args.categoria : 'oficial';
        if (!nombre) return { ok: false, resumen: 'Necesito el nombre del profesional.' };
        const { data: inserted, error } = await supabase.from('profesionales').insert({
          negocio_id: ctx.negocioId,
          nombre,
          categoria,
          color: '#f4501e',
          activo: true,
        }).select('id').single();
        if (error) throw error;
        ctx.profesionalesCreados.push({ id: inserted.id, nombre });
        return { ok: true, resumen: `${nombre} · ${categoria.replace('_', ' ')}` };
      }

      // Invitar por email es la parte RIESGOSA de crear_profesional: la UI la
      // ejecuta como una segunda accion aparte, solo tras confirmacion
      // explicita, reutilizando la Edge Function ya existente crear-acceso-empleado.
      case 'invitar_profesional_email': {
        const email = String(args.email ?? '').trim().toLowerCase();
        const nombre = String(args.profesional_nombre ?? '').trim();
        const profesionalId = String(args.profesional_id ?? '');
        if (!email || !nombre) return { ok: false, resumen: 'Falta email o nombre para invitar.' };
        const { data, error } = await supabase.functions.invoke('crear-acceso-empleado', {
          body: { email, nombre, rol: 'employee' },
        });
        if (error || (data && (data as any).error)) {
          const code = (data && (data as any).error) || 'error';
          return { ok: false, resumen: code === 'email_exists' ? 'Ya existe una cuenta con ese email.' : 'No se pudo invitar por email.' };
        }
        const userId = (data as any).user_id as string | undefined;
        if (userId && profesionalId) {
          await supabase.from('profesionales').update({ profile_id: userId, email }).eq('id', profesionalId);
        }
        return { ok: true, resumen: `Invitacion enviada a ${email}` };
      }

      case 'fijar_horario_salon': {
        const dias = Array.isArray(args.dias) ? args.dias : [];
        if (dias.length !== 7) return { ok: false, resumen: 'No he entendido el horario completo de la semana.' };
        const rows = dias.map((d: any) => ({
          negocio_id: ctx.negocioId,
          dia_semana: Number(d.dia_semana),
          abierto: !!d.abierto,
          apertura: d.abierto ? (d.apertura || null) : null,
          cierre: d.abierto ? (d.cierre || null) : null,
          pausa_inicio: null,
          pausa_fin: null,
        }));
        const { error } = await supabase.from('negocio_horarios').upsert(rows, { onConflict: 'negocio_id,dia_semana' });
        if (error) throw error;
        // Aplica el mismo horario a cada profesional creado en ESTA sesion
        // (decision de diseno del spec: no se pregunta dos veces). Un unico
        // turno por dia abierto; quien quiera turnos partidos lo ajusta luego
        // en Equipo, igual que hoy.
        const abiertos = rows.filter((r) => r.abierto && r.apertura && r.cierre);
        if (ctx.profesionalesCreados.length > 0 && abiertos.length > 0) {
          const horarioRows = ctx.profesionalesCreados.flatMap((p) =>
            abiertos.map((d) => ({ profesional_id: p.id, dia_semana: d.dia_semana, turno: 1, hora_inicio: d.apertura, hora_fin: d.cierre })),
          );
          await supabase.from('horarios_profesional').insert(horarioRows);
        }
        return { ok: true, resumen: `${abiertos.length} dia(s) abierto(s) a la semana` };
      }

      case 'activar_reserva_online': {
        if (args.activar !== true) return { ok: true, resumen: 'Reserva online sin activar por ahora.' };
        const datos = ctx.datosNegocioSesion;
        if (!datos) {
          const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
          const cfg = (cfgRow?.config ?? {}) as any;
          if (!cfg.nombre) return { ok: false, resumen: 'Completa antes los datos del negocio.' };
          ctx.datosNegocioSesion = { nombre: cfg.nombre, direccion: cfg.direccion ?? '', telefono: cfg.telefono ?? '' };
        }
        const d = ctx.datosNegocioSesion!;
        const slug = slugifyNombre(d.nombre);
        const { error } = await supabase.from('negocio_portal').upsert({
          negocio_id: ctx.negocioId,
          slug,
          nombre_publico: d.nombre,
          direccion: d.direccion || null,
          telefono: d.telefono || null,
          portal_activo: true,
          idioma: 'es',
          mostrar_precios: 'catalogo',
          captcha_activo: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'negocio_id' });
        if (error) throw error;
        return { ok: true, resumen: `Reserva online activada: /r/${slug}` };
      }

      case 'activar_notificaciones': {
        if (args.activar !== true) return { ok: true, resumen: 'Recordatorios sin activar por ahora.' };
        const { data: cfgRow } = await supabase.from('negocio_config').select('config').eq('negocio_id', ctx.negocioId).maybeSingle();
        const config = { ...(cfgRow?.config ?? {}), notifRecordatorioActiva: true };
        const { error } = await supabase.from('negocio_config').upsert(
          { negocio_id: ctx.negocioId, config, updated_at: new Date().toISOString() },
          { onConflict: 'negocio_id' },
        );
        if (error) throw error;
        return { ok: true, resumen: 'Recordatorios por WhatsApp activados' };
      }

      default:
        return { ok: false, resumen: `Accion desconocida: ${tipo}` };
    }
  } catch (e) {
    return { ok: false, resumen: mensajeDeError(e, 'No se pudo guardar.') };
  }
}
```

- [ ] **Step 4: Verificación manual (sin servidor, solo lógica pura)**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos en `lib/onboardingAgent.ts` (ignorar preexistentes de `supabase/functions/**`, que son Deno).

La verificación funcional real de `ejecutarAccion` (que cada escritura llega de verdad a `servicios`/`profesionales`/`horarios_profesional`/`negocio_horarios`/`negocio_config`/`negocio_portal`) se hace en la Tarea 4, al probar el flujo completo en el navegador — aquí basta con que compile y con revisar a mano que cada `case` mapea 1:1 a las mismas columnas que ya escriben hoy Ajustes/Equipo.

- [ ] **Step 5: Commit**

```bash
git add lib/onboardingAgent.ts
git commit -m "feat(onboarding): cliente del agente de onboarding (interpretacion IA + ejecucion real)"
```

---

### Task 3: Componente nativo stub

**Files:**
- Create: `components/onboarding/OnboardingAgentOverlay.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `export function OnboardingAgentOverlay(): JSX.Element | null` — usado por la Tarea 5. En nativo (`Platform.OS !== 'web'`) siempre `null`: la paridad nativa queda fuera de alcance (spec §7), y Metro resuelve este fichero SOLO al compilar para nativo (la version rica vive en `OnboardingAgentOverlay.web.tsx`, Tarea 4, y Metro la usa al compilar para web) porque el import en `app/_layout.tsx` no lleva sufijo de plataforma.

- [ ] **Step 1: Escribir el stub**

```typescript
// components/onboarding/OnboardingAgentOverlay.tsx
// Paridad nativa fuera de alcance (spec 2026-07-03, seccion 7): el asistente
// de onboarding con IA es web-only por ahora. La version real vive en
// OnboardingAgentOverlay.web.tsx; Metro elige el fichero correcto segun
// plataforma porque app/_layout.tsx importa sin sufijo de plataforma.
export function OnboardingAgentOverlay() {
  return null;
}
```

- [ ] **Step 2: Verificación**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingAgentOverlay.tsx
git commit -m "feat(onboarding): stub nativo del overlay de onboarding con IA"
```

---

### Task 4: Overlay web cinematográfico

**Files:**
- Create: `components/onboarding/OnboardingAgentOverlay.web.tsx`

**Interfaces:**
- Consumes: `TEMA_ORDEN, TEMA_FALLBACK, TEMA_TITULO_SECCION, TEMA_DESTINO_MANUAL, HORARIO_PRESETS, TEMA_CAMPOS_SIMPLES, pedirPregunta, interpretarRespuesta, ejecutarAccion, ResultadoAccion` de `@/lib/onboardingAgent`; `DESIGN_TOKENS` de `@/lib/designTokens`; `useResponsive` de `@/lib/hooks/useResponsive`; `useOnboardingStatus` de `@/lib/hooks/useOnboardingStatus`; `supabase` de `@/lib/supabase`.
- Produces: `export function OnboardingAgentOverlay(): JSX.Element | null` — props: ninguna (lee todo de hooks internos, igual que `OnboardingCard`/`OnboardingPanel` hacen con su propio negocioId).

- [ ] **Step 1: Estructura del componente — estado, elegibilidad y fotograma "bienvenida"**

```tsx
// components/onboarding/OnboardingAgentOverlay.web.tsx
// Asistente de onboarding con IA: pantalla completa, "fotogramas" (no chat)
// que sustituyen al anterior, uno por tema, con un unico bloque de
// interaccion centrado. La IA solo redacta/interpreta; el ORDEN y la
// EJECUCION las controla este componente (ver lib/onboardingAgent.ts).
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase, IS_DEMO_MODE } from '@/lib/supabase';
import { getUserProfile } from '@/lib/auth';
import { DESIGN_TOKENS as T } from '@/lib/designTokens';
import { useResponsive } from '@/lib/hooks/useResponsive';
import { useOnboardingStatus } from '@/lib/hooks/useOnboardingStatus';
import {
  TEMA_ORDEN, TEMA_FALLBACK, TEMA_TITULO_SECCION, TEMA_DESTINO_MANUAL, HORARIO_PRESETS, TEMA_CAMPOS_SIMPLES,
  pedirPregunta, interpretarRespuesta, ejecutarAccion,
  type TemaId,
} from '@/lib/onboardingAgent';

type Fase = 'cerrado' | 'bienvenida' | 'pregunta' | 'ejecutando' | 'recibo' | 'confirmar_riesgo' | 'cerrando';

const FLAG_PREFIX = 'mecha-onboarding-agent:';

export function OnboardingAgentOverlay() {
  const { isMobile } = useResponsive();
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [elegible, setElegible] = useState(false);
  const [fase, setFase] = useState<Fase>('cerrado');
  const [temaIdx, setTemaIdx] = useState(0);
  const [pregunta, setPregunta] = useState<{ titulo: string; subtitulo?: string; placeholder_ejemplo?: string }>({ titulo: '' });
  const [respuesta, setRespuesta] = useState('');
  const [recibo, setRecibo] = useState<{ ok: boolean; resumen: string } | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<{ tipo: string; args: Record<string, any> } | null>(null);
  const [cargandoPregunta, setCargandoPregunta] = useState(false);
  const [perfil, setPerfil] = useState<{ codigoPostal?: string; nombreNegocio?: string }>({});
  // Se activa si interpretarRespuesta devuelve null (fallo/timeout): el
  // fotograma cae a un formulario simple y determinista para ese tema
  // (requisito de robustez, spec seccion 6). Se resetea al cambiar de tema.
  const [fallbackActivo, setFallbackActivo] = useState(false);
  const [camposSimples, setCamposSimples] = useState<Record<string, string>>({});
  // Mensaje breve si interpretarRespuesta falla en un tema SIN formulario
  // simple definido (hoy solo horario_salon, que ya tiene los presets siempre
  // visibles como alternativa sin IA).
  const [errorTexto, setErrorTexto] = useState('');
  // Cuando crear_profesional viene con quiere_invitar=true: el ALTA del
  // profesional se ejecuta sin friccion de inmediato (no es una accion
  // riesgosa); el ENVIO DEL EMAIL queda en cola para pedir confirmacion
  // explicita justo despues de mostrar el recibo del alta (spec, decision 5:
  // solo el email real y activar el portal publico piden confirmar).
  const [invitacionPendiente, setInvitacionPendiente] = useState<{ profesionalId: string; nombre: string; email: string } | null>(null);

  // Contexto de ejecucion persistido durante toda la sesion del asistente
  // (profesionales creados para aplicar el horario, datos de negocio para
  // reutilizar en la activacion del portal).
  const ctxRef = useRef({ negocioId: '', profesionalesCreados: [] as { id: string; nombre: string }[], datosNegocioSesion: undefined as { nombre: string; direccion: string; telefono: string } | undefined });

  const status = useOnboardingStatus(elegible ? negocioId : null, elegible);

  // Elegibilidad: mismo criterio exacto que el checklist manual (AgendaCalendar.web.tsx).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancel = false;
    (async () => {
      const profile = await getUserProfile();
      if (cancel || !profile) return;
      const esGestor = profile.role === 'owner' || profile.role === 'admin';
      const ok = esGestor && !IS_DEMO_MODE && profile.negocio_id !== 'demo_salon_001';
      setNegocioId(profile.negocio_id ?? null);
      setPerfil({ codigoPostal: profile.codigo_postal, nombreNegocio: profile.nombre_negocio });
      setElegible(ok);
      ctxRef.current.negocioId = profile.negocio_id ?? '';
    })();
    return () => { cancel = true; };
  }, []);

  // Disparo automatico, una sola vez: en cuanto sabemos que esta elegible, el
  // nucleo no esta completo, y no se ha mostrado antes en este navegador.
  useEffect(() => {
    if (!elegible || !negocioId || !status.ready || fase !== 'cerrado') return;
    if (status.coreDone) return;
    const key = `${FLAG_PREFIX}${negocioId}`;
    if (typeof window === 'undefined' || window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, JSON.stringify({ shown: true }));
    setFase('bienvenida');
  }, [elegible, negocioId, status.ready, status.coreDone, fase]);

  if (Platform.OS !== 'web' || fase === 'cerrado') return null;

  const cerrar = () => setFase('cerrando');

  if (fase === 'cerrando') return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#ffffff' }} className="m-overlay-enter">
      {fase === 'bienvenida' && <FotogramaBienvenida isMobile={isMobile} onEmpezar={() => avanzarATema(0)} onSaltar={cerrar} />}
      {(fase === 'pregunta' || fase === 'ejecutando') && (
        <FotogramaPregunta
          key={`pregunta-${temaIdx}`}
          isMobile={isMobile}
          seccion={TEMA_TITULO_SECCION[TEMA_ORDEN[temaIdx]]}
          destinoManual={TEMA_DESTINO_MANUAL[TEMA_ORDEN[temaIdx]]}
          progreso={(temaIdx + 1) / TEMA_ORDEN.length}
          pregunta={pregunta}
          cargando={cargandoPregunta}
          ejecutando={fase === 'ejecutando'}
          modoInput={TEMA_FALLBACK[TEMA_ORDEN[temaIdx]].modoInput}
          valor={respuesta}
          onCambiar={setRespuesta}
          onEnviar={() => enviarRespuesta()}
          onSaltar={() => avanzarATema(temaIdx + 1)}
          onCerrar={cerrar}
          onBoton={(activar) => responderDirecto(TEMA_ORDEN[temaIdx] === 'reserva_online' ? 'activar_reserva_online' : 'activar_notificaciones', { activar })}
          presets={TEMA_ORDEN[temaIdx] === 'horario_salon' ? HORARIO_PRESETS : undefined}
          onPreset={(dias) => responderDirecto('fijar_horario_salon', { dias })}
          fallbackActivo={fallbackActivo}
          camposSimplesDef={TEMA_CAMPOS_SIMPLES[TEMA_ORDEN[temaIdx]]}
          camposSimples={camposSimples}
          onCambiarCampoSimple={(key, v) => setCamposSimples((prev) => ({ ...prev, [key]: v }))}
          onEnviarCamposSimples={() => enviarCamposSimples()}
          errorTexto={errorTexto}
        />
      )}
      {fase === 'confirmar_riesgo' && accionPendiente && (
        <FotogramaConfirmarRiesgo
          isMobile={isMobile}
          accion={accionPendiente}
          onConfirmar={() => ejecutarYMostrarRecibo(accionPendiente)}
          onCancelar={() => avanzarATema(temaIdx + 1)}
        />
      )}
      {fase === 'recibo' && recibo && (
        <FotogramaRecibo
          isMobile={isMobile}
          recibo={recibo}
          esUltimoTema={temaIdx >= TEMA_ORDEN.length - 1}
          permiteAnadirOtro={TEMA_ORDEN[temaIdx] === 'servicios' || TEMA_ORDEN[temaIdx] === 'equipo'}
          onAnadirOtro={() => { setRespuesta(''); void cargarPregunta(temaIdx); }}
          onContinuar={() => continuarDesdeRecibo()}
        />
      )}
    </div>
  );

  // ---- logica interna ----
  async function cargarPregunta(idx: number) {
    // Limpia estado transitorio de la pregunta anterior (fallback, campos
    // simples, error): tanto al avanzar de tema como al "+ Anadir otro" del
    // mismo tema deben empezar limpios.
    setFallbackActivo(false);
    setCamposSimples({});
    setErrorTexto('');
    setCargandoPregunta(true);
    setFase('pregunta');
    const tema = TEMA_ORDEN[idx];
    const p = await pedirPregunta(tema, status.done, perfil);
    setPregunta(p);
    setCargandoPregunta(false);
  }

  function avanzarATema(idx: number) {
    if (idx >= TEMA_ORDEN.length) { cerrar(); return; }
    setTemaIdx(idx);
    setRespuesta('');
    void cargarPregunta(idx); // cargarPregunta ya limpia fallback/campos simples/error
  }

  async function enviarRespuesta() {
    const tema = TEMA_ORDEN[temaIdx];
    if (tema === 'fotos_servicios') return; // este tema no interpreta texto, solo sube archivo (ver FotogramaPregunta)
    if (!respuesta.trim()) return;
    setFase('ejecutando');
    const accion = await interpretarRespuesta(tema, respuesta, status.done, perfil);
    if (!accion) {
      // Robustez (spec seccion 6): la IA no respondio a tiempo o fallo. Si el
      // tema tiene un formulario simple determinista, caemos a el en vez de
      // repetir el mismo campo de texto libre. Si no lo tiene (no debería
      // ocurrir para los temas de texto de este plan), solo dejamos reintentar.
      setFase('pregunta');
      if (TEMA_CAMPOS_SIMPLES[tema]) {
        setFallbackActivo(true);
      } else {
        setErrorTexto('No he entendido el horario. Prueba uno de los atajos de abajo, o reformula (ej. "lunes a viernes de 9 a 20").');
      }
      return;
    }
    // Solo activar_reserva_online es riesgosa DE ENTRADA (portal publico).
    // crear_profesional con quiere_invitar=true NO se retrasa: el alta del
    // profesional va sin friccion; el email queda a confirmar despues (ver
    // ejecutarYMostrarRecibo + continuarDesdeRecibo).
    const esReserva = accion.tipo === 'activar_reserva_online' && accion.args?.activar === true;
    if (esReserva) {
      setAccionPendiente(accion);
      setFase('confirmar_riesgo');
      return;
    }
    await ejecutarYMostrarRecibo(accion);
  }

  // Para 'botones' (si/no) y los presets de horario: construye la accion
  // directamente en el cliente, SIN llamar a la IA (mas simple, mas barato y
  // mas fiable que interpretar texto libre para un booleano o un horario
  // predefinido). La reserva online sigue pidiendo confirmacion si se activa.
  function responderDirecto(tipo: string, args: Record<string, any>) {
    if (tipo === 'activar_reserva_online' && args.activar === true) {
      setAccionPendiente({ tipo, args });
      setFase('confirmar_riesgo');
      return;
    }
    void ejecutarYMostrarRecibo({ tipo, args });
  }

  // Tras el recibo: si queda una invitacion por email pendiente de confirmar
  // (se encolo en ejecutarYMostrarRecibo al crear el profesional), pasa a
  // pedirla ahora; si no, avanza al siguiente tema.
  function continuarDesdeRecibo() {
    if (invitacionPendiente) {
      setAccionPendiente({
        tipo: 'invitar_profesional_email',
        args: { profesional_id: invitacionPendiente.profesionalId, profesional_nombre: invitacionPendiente.nombre, email: invitacionPendiente.email },
      });
      setInvitacionPendiente(null);
      setFase('confirmar_riesgo');
      return;
    }
    avanzarATema(temaIdx + 1);
  }

  // Envia el formulario simple determinista (fallback de fallo de IA) para
  // datos_negocio/servicios/equipo. Mapea 1:1 a la misma tool que usaria la
  // interpretacion normal, para que ejecutarAccion no necesite un camino aparte.
  function enviarCamposSimples() {
    const tema = TEMA_ORDEN[temaIdx];
    const tipoPorTema: Partial<Record<TemaId, string>> = {
      datos_negocio: 'completar_datos_negocio', servicios: 'crear_servicio', equipo: 'crear_profesional',
    };
    const tipo = tipoPorTema[tema];
    if (!tipo) return;
    const args: Record<string, any> = { ...camposSimples };
    if (tema === 'servicios') { args.precio = Number(camposSimples.precio); args.duracion_min = Number(camposSimples.duracion_min); }
    if (tema === 'equipo') { args.categoria = 'oficial'; args.quiere_invitar = false; args.email = ''; }
    void ejecutarYMostrarRecibo({ tipo, args });
  }

  async function ejecutarYMostrarRecibo(accion: { tipo: string; args: Record<string, any> }) {
    setFase('ejecutando');
    const resultado = await ejecutarAccion(accion.tipo, accion.args, ctxRef.current);
    if (accion.tipo === 'completar_datos_negocio' && resultado.ok) {
      ctxRef.current.datosNegocioSesion = { nombre: accion.args.nombre, direccion: accion.args.direccion, telefono: accion.args.telefono };
    }
    // El alta del profesional va sin friccion; si pidio invitacion por email,
    // se encola para confirmarla justo despues de ver este recibo (ver
    // continuarDesdeRecibo) en vez de retrasar la creacion.
    if (accion.tipo === 'crear_profesional' && resultado.ok && accion.args?.quiere_invitar === true) {
      const nuevoId = ctxRef.current.profesionalesCreados[ctxRef.current.profesionalesCreados.length - 1]?.id;
      setInvitacionPendiente({ profesionalId: nuevoId, nombre: accion.args.nombre, email: accion.args.email });
    }
    setRecibo(resultado);
    setFase('recibo');
    status.refresh();
  }
}
```

- [ ] **Step 2: Sub-componentes de cada fotograma (bienvenida, pregunta, confirmar riesgo, recibo)**

```tsx
// (continuar en components/onboarding/OnboardingAgentOverlay.web.tsx, debajo del componente principal)

function FotogramaBienvenida({ isMobile, onEmpezar, onSaltar }: { isMobile: boolean; onEmpezar: () => void; onSaltar: () => void }) {
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: isMobile ? 24 : 32, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)' }} />
      <div style={{ fontFamily: "'Bricolage Grotesque','Inter',sans-serif", fontSize: isMobile ? 26 : 32, fontWeight: 800, color: T.text, lineHeight: 1.25, maxWidth: 480 }}>
        Vamos a poner en marcha tu salon
      </div>
      <div style={{ fontSize: 14, color: T.textSecondary, maxWidth: 420 }}>
        Te voy a hacer unas pocas preguntas y voy dejando todo configurado de verdad, a tu ritmo. Puedes saltar cualquier paso.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onEmpezar} className="m-btn-primary" style={{ padding: '12px 24px', background: T.primary, border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Empezar</button>
        <button onClick={onSaltar} style={{ padding: '12px 20px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 12, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Prefiero hacerlo yo, manual</button>
      </div>
    </div>
  );
}

function FotogramaPregunta({
  isMobile, seccion, destinoManual, progreso, pregunta, cargando, ejecutando, modoInput, valor, onCambiar, onEnviar, onSaltar, onCerrar,
  onBoton, presets, onPreset, fallbackActivo, camposSimplesDef, camposSimples, onCambiarCampoSimple, onEnviarCamposSimples, errorTexto,
}: {
  isMobile: boolean; seccion: string; destinoManual: string; progreso: number;
  pregunta: { titulo: string; subtitulo?: string; placeholder_ejemplo?: string };
  cargando: boolean; ejecutando: boolean; modoInput: 'texto' | 'foto' | 'botones';
  valor: string; onCambiar: (v: string) => void; onEnviar: () => void; onSaltar: () => void; onCerrar: () => void;
  onBoton: (activar: boolean) => void;
  presets?: { label: string; dias: any[] }[]; onPreset: (dias: any[]) => void;
  fallbackActivo: boolean;
  camposSimplesDef?: { key: string; label: string; tipo: 'texto' | 'numero' }[];
  camposSimples: Record<string, string>; onCambiarCampoSimple: (key: string, v: string) => void; onEnviarCamposSimples: () => void;
  errorTexto: string;
}) {
  const mostrarCamposSimples = fallbackActivo && !!camposSimplesDef;
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: isMobile ? 20 : 32, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(40,30,24,0.06)' }}>
        <div style={{ width: `${Math.round(progreso * 100)}%`, height: '100%', background: T.primary, transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      <button onClick={onCerrar} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: T.textTertiary, fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textTertiary, fontWeight: 700 }}>{seccion}</div>
      {cargando ? (
        <div style={{ fontSize: 15, color: T.textSecondary }}>Un momento...</div>
      ) : mostrarCamposSimples ? (
        <>
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: isMobile ? 19 : 22, fontWeight: 600, color: T.text, textAlign: 'center', maxWidth: 420 }}>
            No he entendido bien la respuesta. Rellenalo asi, campo a campo:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: isMobile ? '100%' : 280 }}>
            {camposSimplesDef!.map((c) => (
              <input
                key={c.key}
                className="m-input"
                value={camposSimples[c.key] ?? ''}
                onChange={(e) => onCambiarCampoSimple(c.key, e.target.value)}
                placeholder={c.label}
                type={c.tipo === 'numero' ? 'number' : 'text'}
                disabled={ejecutando}
                style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, background: T.bgCard, outline: 'none' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onEnviarCamposSimples} disabled={ejecutando} className="m-btn-primary" style={{ padding: '10px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {ejecutando ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Saltar este paso
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: isMobile ? 21 : 26, lineHeight: 1.3, fontWeight: 600, color: T.text, textAlign: 'center', maxWidth: 460, letterSpacing: -0.5 }}>
            {pregunta.titulo}
          </div>
          {modoInput === 'texto' && (
            <div style={{ width: isMobile ? '100%' : 320 }}>
              <input
                className="m-input"
                value={valor}
                onChange={(e) => onCambiar(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !ejecutando) onEnviar(); }}
                placeholder={pregunta.placeholder_ejemplo || ''}
                disabled={ejecutando}
                style={{ width: '100%', textAlign: 'center', border: 'none', borderBottom: '2px solid rgba(40,30,24,0.15)', borderRadius: 0, padding: '10px 4px', fontSize: 15, background: 'transparent', outline: 'none' }}
              />
            </div>
          )}
          {modoInput === 'texto' && presets && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
              {presets.map((p) => (
                <button key={p.label} onClick={() => onPreset(p.dias)} disabled={ejecutando} className="m-chip" style={{ padding: '7px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 999, color: T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {errorTexto && (
            <div style={{ fontSize: 11.5, color: T.danger, textAlign: 'center', maxWidth: 380 }}>{errorTexto}</div>
          )}
          {modoInput === 'foto' && <SubidaFotoInline disabled={ejecutando} />}
          {modoInput === 'botones' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onBoton(true)} disabled={ejecutando} className="m-btn-primary" style={{ padding: '11px 22px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Si, activar</button>
              <button onClick={() => onBoton(false)} disabled={ejecutando} style={{ padding: '11px 18px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ahora no</button>
            </div>
          )}
          {pregunta.subtitulo && (
            <div style={{ fontSize: 11.5, color: T.textSecondary, background: T.primarySoft, borderRadius: 999, padding: '8px 14px', maxWidth: 380, textAlign: 'center' }}>
              {pregunta.subtitulo}
            </div>
          )}
          {modoInput === 'texto' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onEnviar} disabled={ejecutando || !valor.trim()} className="m-btn-primary" style={{ padding: '10px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: ejecutando ? 'not-allowed' : 'pointer', opacity: ejecutando ? 0.6 : 1 }}>
                {ejecutando ? 'Guardando...' : 'Continuar'}
              </button>
              <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Saltar este paso
              </button>
            </div>
          )}
          {modoInput !== 'texto' && (
            <button onClick={onSaltar} disabled={ejecutando} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Saltar este paso
            </button>
          )}
          <div style={{ fontSize: 11, color: T.textTertiary }}>{destinoManual}</div>
        </>
      )}
    </div>
  );
}

// Placeholder minimo de subida de foto: el tema fotos_servicios es opcional y
// no bloquea el nucleo (spec, decision 2). Sube directo al bucket publico
// servicio-fotos, igual que hace hoy Ajustes > Servicios.
function SubidaFotoInline({ disabled }: { disabled: boolean }) {
  const [subiendo, setSubiendo] = useState(false);
  const [subida, setSubida] = useState(false);
  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setSubiendo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user ? await supabase.from('profiles').select('negocio_id').eq('id', user.id).maybeSingle() : { data: null };
      const negocioId = profile?.negocio_id;
      const { data: servicios } = negocioId ? await supabase.from('servicios').select('id').eq('negocio_id', negocioId).limit(1) : { data: null };
      const servicioId = servicios?.[0]?.id;
      if (!negocioId || !servicioId) { setSubiendo(false); return; }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${negocioId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('servicio-fotos').upload(path, file, { contentType: file.type });
      if (!up.error) {
        const { data: pub } = supabase.storage.from('servicio-fotos').getPublicUrl(path);
        await supabase.from('servicios').update({ foto_url: pub.publicUrl }).eq('id', servicioId);
        setSubida(true);
      }
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <label style={{ padding: '12px 20px', background: T.bgCard, border: `1.5px dashed ${T.borderHi}`, borderRadius: 12, fontSize: 13, color: T.textSecondary, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {subida ? 'Foto subida' : subiendo ? 'Subiendo...' : 'Elegir foto'}
      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={disabled || subiendo} onChange={(e) => onFile(e.target.files)} />
    </label>
  );
}

function FotogramaConfirmarRiesgo({ isMobile, accion, onConfirmar, onCancelar }: {
  isMobile: boolean; accion: { tipo: string; args: Record<string, any> }; onConfirmar: () => void; onCancelar: () => void;
}) {
  const esInvitacion = accion.tipo === 'invitar_profesional_email';
  const titulo = esInvitacion ? `Invitar a ${accion.args.profesional_nombre} por email` : 'Activar la reserva online publica';
  const detalle = esInvitacion ? `Se enviara un correo real a ${accion.args.email}.` : 'Tu salon sera visible y reservable publicamente ahora mismo.';
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: isMobile ? 20 : 32, textAlign: 'center' }}>
      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: T.text, maxWidth: 400 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: T.textSecondary, maxWidth: 360 }}>{detalle}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onConfirmar} className="m-btn-primary" style={{ padding: '11px 22px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Si, adelante</button>
        <button onClick={onCancelar} style={{ padding: '11px 18px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ahora no</button>
      </div>
    </div>
  );
}

function FotogramaRecibo({ isMobile, recibo, esUltimoTema, permiteAnadirOtro, onAnadirOtro, onContinuar }: {
  isMobile: boolean; recibo: { ok: boolean; resumen: string }; esUltimoTema: boolean; permiteAnadirOtro: boolean;
  onAnadirOtro: () => void; onContinuar: () => void;
}) {
  return (
    <div className="m-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: isMobile ? 20 : 32, textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: recibo.ok ? T.successSoft : T.dangerSoft, display: 'grid', placeItems: 'center', fontSize: 20, color: recibo.ok ? T.success : T.danger }}>
        {recibo.ok ? '✓' : '!'}
      </div>
      <div style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: T.text, maxWidth: 420 }}>{recibo.resumen}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {permiteAnadirOtro && recibo.ok && (
          <button onClick={onAnadirOtro} style={{ padding: '11px 18px', background: T.primarySoft, border: `1px solid ${T.primaryGlow}`, borderRadius: 10, color: T.primaryHi, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Anadir otro</button>
        )}
        <button onClick={onContinuar} className="m-btn-primary" style={{ padding: '11px 20px', background: T.primary, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {esUltimoTema ? 'Terminar' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificación de tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos en `components/onboarding/OnboardingAgentOverlay.web.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/onboarding/OnboardingAgentOverlay.web.tsx
git commit -m "feat(onboarding): overlay cinematografico del asistente de onboarding con IA"
```

---

### Task 5: Montaje global y disparo

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `OnboardingAgentOverlay` de `@/components/onboarding/OnboardingAgentOverlay` (Tareas 3 y 4, importado SIN sufijo de plataforma para que Metro resuelva `.web.tsx` en web y `.tsx` en nativo).
- Produces: nada (punto de montaje final).

- [ ] **Step 1: Importar y montar el overlay junto a `PrivacyConsentModal`**

En `app/_layout.tsx`, añadir el import junto a los demás (línea 15) y el montaje en `ThemedRoot` (línea 64):

```tsx
// Añadir tras la linea: import { PrivacyConsentModal } from '@/components/PrivacyConsentModal';
import { OnboardingAgentOverlay } from '@/components/onboarding/OnboardingAgentOverlay';
```

```tsx
// ThemedRoot pasa de:
function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { c, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <WebScrollbarStyles />
      <MotionStyles />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <PrivacyConsentModal />
      {children}
    </GestureHandlerRootView>
  );
}

// a:
function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { c, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <WebScrollbarStyles />
      <MotionStyles />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <PrivacyConsentModal />
      <OnboardingAgentOverlay />
      {children}
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 2: Compilar y arrancar el espejo local**

```bash
npm run build:web
node scripts/serve-web.mjs
```

Expected: build sin errores; servidor sirviendo en `http://localhost:8080`.

- [ ] **Step 3: Verificación manual end-to-end**

1. Crear (o usar) una cuenta con negocio propio recien asignado (no demo, `negocio_id !== 'demo_salon_001'`, rol owner/admin, y con el núcleo del checklist incompleto — cuenta nueva sin servicios/equipo).
2. Entrar en `http://localhost:8080/app` con esa cuenta. **Expected:** el software queda tapado por la pantalla de bienvenida cinematográfica ("Vamos a poner en marcha tu salon").
3. Pulsar "Empezar". **Expected:** aparece el primer fotograma de pregunta (datos del negocio), con barra de progreso fina arriba y, debajo del botón "Saltar este paso", el texto de dónde configurarlo más tarde (`TEMA_DESTINO_MANUAL`).
4. Escribir una respuesta en lenguaje natural para datos del negocio y para servicios, pulsando Continuar (o Enter). **Expected:** cada tema ejecuta la escritura real (comprobar en Ajustes que `negocio_config.config` y `servicios` tienen los datos) y muestra el fotograma de "recibo" antes de pasar al siguiente tema; en Servicios, usar "+ Añadir otro" para confirmar el bucle de alta múltiple.
5. En el tema equipo, escribir una respuesta que incluya un email (p. ej. "Marta, oficial, marta@test.com"). **Expected:** aparece el fotograma de confirmación antes de invitar (no se manda el email hasta pulsar "Si, adelante"); tras confirmar, comprobar en Equipo que el profesional existe y tiene `profile_id` asignado.
6. En el tema horario del salón, probar primero un preset ("Lunes a viernes 9-20, sabado 9-14"). **Expected:** guarda directo sin llamar a la IA y, en Equipo, el profesional creado en el paso 5 ya tiene horario para esos días (tabla `horarios_profesional`).
7. En el tema reserva online y en notificaciones, comprobar que se muestran dos botones ("Si, activar" / "Ahora no") en vez de un campo de texto. Pulsar "Si, activar" en reserva online. **Expected:** aparece el fotograma de confirmación (activar portal público es una de las dos acciones de riesgo) antes de escribir en `negocio_portal`; en notificaciones, "Si, activar" escribe directo sin confirmación.
8. Pulsar "Saltar este paso" en cualquier tema. **Expected:** avanza al siguiente tema sin escribir nada en la base de datos.
9. Recargar la página tras completar o saltar todo. **Expected:** el asistente NO vuelve a aparecer (flag en `localStorage`, clave `mecha-onboarding-agent:<negocio_id>`); si quedó algo pendiente, la campana de Avisos sigue mostrando el checklist manual con lo que falte.
10. Simular un fallo de la Edge Function: en DevTools > Network, bloquear la petición a `onboarding-agent` (o pausarla más de 6s). **Expected (pregunta):** tras ~6s el fotograma de pregunta sigue mostrando el texto de fallback estático (`TEMA_FALLBACK`) en vez de quedarse cargando. **Expected (respuesta, en un tema de texto libre como servicios):** al enviar una respuesta con la petición bloqueada, tras ~6s el fotograma cae al formulario simple de campos sueltos (`TEMA_CAMPOS_SIMPLES`) en vez de quedarse cargando o mostrar solo un error.
11. Entrar con la demo (`http://localhost:8080/demo.html?share=1`) o con una cuenta `employee`. **Expected:** el asistente NO aparece nunca.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(onboarding): montar el asistente de onboarding con IA en el layout raiz"
```

---

### Task 6: Despliegue final y limpieza

**Files:** ninguno nuevo (operaciones de despliegue/configuración).

- [ ] **Step 1: Confirmar que la Edge Function está desplegada con el secreto correcto**

```bash
supabase secrets list
```

Expected: `OPENROUTER_API_KEY` presente (sin mostrar el valor).

- [ ] **Step 2: Pasar los advisors de seguridad de Supabase (regla del proyecto tras cualquier cambio)**

Usar la herramienta MCP de Supabase `get_advisors` (tipo `security`) sobre el proyecto `vtrggiogjrhqtwbhbgia`. Como esta tarea no añade tablas, RLS ni funciones SQL nuevas (solo una Edge Function que no toca la base de datos), no debería introducir advisories nuevos — confirmar que la lista no cambia respecto a antes de esta tanda.

- [ ] **Step 3: Anotar en el informe maestro el pendiente de rotar la clave de OpenRouter**

Añadir una línea a los pendientes de `informes/MEGA_INFORME_MECHA.md` (sección de pendientes prioritarios, siguiendo el formato ya usado): "Rotar la clave de OpenRouter de pruebas del asistente de onboarding antes de tráfico real de producción."

- [ ] **Step 4: Commit final**

```bash
git add informes/MEGA_INFORME_MECHA.md
git commit -m "docs: anotar pendiente de rotar clave OpenRouter de pruebas (onboarding IA)"
```
