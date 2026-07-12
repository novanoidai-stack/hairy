# Rework de Chispa (KISS) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estrechar el chatbot de Chispa a lo fiable (biblioteca de lectura + 4 acciones en bloque + memoria) con dos modelos por tarea, y a la vez elevar la IA intra-página (Titular→Visual→Acción), quitando la salida hablada (TTS).

**Architecture:** Un único edge `agenda-asistente` con ruteo por `tarea` (`lectura`→modelo barato / `accion`→Haiku / `auto`→clasifica) y por `superficie` (qué tools de escritura se ofrecen). Las lecturas (la "biblioteca") se comparten; el recorte quita ~20 tools de escritura/orquestación del chat. El cliente pasa `tarea`/`superficie` desde cada superficie. La voz pierde el TTS y conserva el micro (STT).

**Tech Stack:** Deno edge functions (OpenAI SDK vía OpenRouter), Supabase (service key server-side, RLS en cliente), Expo Router + react-native-web, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-12-chispa-rework-kiss-design.md` (léelo entero antes de empezar).

## Global Constraints

- Código en inglés, comentarios en español. Sin emojis en código/UI.
- Sin `any` nuevo en TypeScript (el edge es Deno; no añadir `any`).
- Toda consulta y política filtra por `negocio_id` (multi-tenant).
- **Salud NUNCA al LLM** (regla dura): `ficha_cliente` devuelve `tiene_notas_salud` sin contenido.
- **Cifras siempre server-side** (el LLM nunca inventa números; los bloques `kpi/barras/grafica/tabla` los calcula el edge).
- **Demo** (`demo_salon_001`): sin persistencia de memoria cross-visitante; idioma forzado `es`; sesión aislada. No romper.
- Visual: tokens de `lib/designTokens.ts`, marca fuego `#f4501e`/`#c0260a`, patrón glass/fuego. Nada de estilos sueltos nuevos (deuda C14). Cargar skills `hairy-design-system` + `dataviz` antes de tocar visual.
- Nuevo secret Supabase: `OPENROUTER_MODEL_LECTURA=google/gemini-2.0-flash-001`. `OPENROUTER_MODEL` (Haiku) se mantiene para escritura.
- El edge lo invocan usuarios autenticados: **no** se tocan grants a `anon`. Tras cualquier cambio de BD, pasar advisors de seguridad de Supabase.
- Comprobar: `npx tsc --noEmit` (ignorar errores Deno de `supabase/functions/`). Build web: `npm run build:web`. Espejo local: `node scripts/serve-web.mjs` (`http://localhost:8080`); demo sin gastar visitas: `/demo.html?share=1`.
- Deploy del edge: `mcp deploy_edge_function` o Supabase CLI (`supabase functions deploy agenda-asistente`). Verificar versión tras desplegar (histórico de deploy-gaps).
- Commits: `feat:`/`fix:`/`refactor:`/`chore:`. Rama de trabajo: `feat/chispa-rework-kiss`.

---

## Fase 1 — Edge: ruteo, dos modelos, recorte de tools, retraso, memoria

### Task 1: Parseo de `tarea`/`superficie` + selección de modelo

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (`:40` MODEL, `:1282` parse body, `:1490` model call)

**Interfaces:**
- Produces: `type Tarea = 'lectura' | 'accion' | 'auto'`; `type Superficie = 'chat' | 'agenda' | 'presupuestos' | 'clientes' | string`; `MODEL_LECTURA` const; `elegirModelo(tarea: Tarea): string`.

- [ ] **Step 1: Añadir constante de modelo de lectura** junto a `MODEL` (`:40`):

```ts
// Modelo barato para LECTURA/analisis (biblioteca del salon). ~10x mas barato que Haiku.
// Configurable por secret sin tocar codigo. Las ESCRITURAS siguen en MODEL (Haiku).
const MODEL_LECTURA = Deno.env.get('OPENROUTER_MODEL_LECTURA') ?? 'google/gemini-2.0-flash-001';
```

- [ ] **Step 2: Parsear `tarea`/`superficie` del body** (tras `:1282` `const body = await req.json()...`):

```ts
const tareaRaw = String((body as { tarea?: unknown }).tarea ?? 'auto');
const tarea: 'lectura' | 'accion' | 'auto' =
  tareaRaw === 'lectura' || tareaRaw === 'accion' ? tareaRaw : 'auto';
const superficie = String((body as { superficie?: unknown }).superficie ?? 'chat');
```

- [ ] **Step 3: Parametrizar el modelo en la llamada** (`:1490` `openai.chat.completions.create`). Sustituir `model: MODEL` por una variable `modeloEnUso` decidida más abajo (Task 5 fija su valor para `auto`; por ahora):

```ts
// 'lectura' -> barato; 'accion' -> Haiku; 'auto' se resuelve en Task 5 (clasificador).
let modeloEnUso = tarea === 'lectura' ? MODEL_LECTURA : MODEL;
```
Y en el `create({ ... })`: `model: modeloEnUso,`.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` (ignora errores Deno). Esperado: sin errores nuevos de TS en el resto del árbol.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/agenda-asistente/index.ts
git commit -m "feat(chispa): ruteo por tarea + modelo de lectura barato en el edge"
```

---

### Task 2: `seleccionarTools` + `SUPERFICIE_ACCIONES` (gating por superficie)

**Files:**
- Modify: `supabase/functions/agenda-asistente/permisos.ts`
- Test: `supabase/functions/agenda-asistente/permisos.test.ts`

**Interfaces:**
- Produces: `SUPERFICIE_ACCIONES: Record<string, string[]>`; `accionPermitidaEnSuperficie(name: string, superficie: string): boolean`; helper `esLectura(name: string): boolean` (true si la tool NO es escritura).

- [ ] **Step 1: Escribir el test** en `permisos.test.ts` (Deno test; sigue el estilo del archivo):

```ts
Deno.test('SUPERFICIE_ACCIONES: chat solo ofrece las 4 acciones en bloque', () => {
  assert(accionPermitidaEnSuperficie('confirmar_citas', 'chat'));
  assert(accionPermitidaEnSuperficie('gestionar_retraso', 'chat'));
  assert(!accionPermitidaEnSuperficie('crear_presupuesto', 'chat'));
  assert(!accionPermitidaEnSuperficie('optimizar_agenda', 'chat'));
});
Deno.test('SUPERFICIE_ACCIONES: presupuestos conserva su tool acotada', () => {
  assert(accionPermitidaEnSuperficie('crear_presupuesto', 'presupuestos'));
  assert(!accionPermitidaEnSuperficie('confirmar_citas', 'presupuestos'));
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar** — `deno test supabase/functions/agenda-asistente/permisos.test.ts`. Esperado: FAIL (`accionPermitidaEnSuperficie is not defined`).

- [ ] **Step 3: Implementar** en `permisos.ts`:

```ts
// Gating por SUPERFICIE (defensa extra sobre el gating por rol): que tools de
// ESCRITURA se ofrecen en cada superficie del cliente. Las LECTURAS se comparten
// (no aparecen aqui). El chat solo agiliza acciones en bloque; cada pantalla
// conserva su tool concreta.
export const SUPERFICIE_ACCIONES: Record<string, string[]> = {
  chat: ['confirmar_citas', 'reenviar_confirmacion', 'avisar_lista_espera', 'gestionar_retraso'],
  agenda: ['optimizar_agenda', 'gestionar_retraso'],
  presupuestos: ['crear_presupuesto'],
  clientes: ['recuperar_cliente'],
};

export function accionPermitidaEnSuperficie(name: string, superficie: string): boolean {
  return (SUPERFICIE_ACCIONES[superficie] ?? []).includes(name);
}

// Una tool es de LECTURA si no es escritura de agenda/gestion ni cambiar_config.
export function esLectura(name: string): boolean {
  return !esEscritura(name);
}
```

- [ ] **Step 4: Ejecutar el test y verlo pasar** — `deno test supabase/functions/agenda-asistente/permisos.test.ts`. Esperado: PASS.

- [ ] **Step 5: Cablear la selección en `index.ts`** (`:1353`). Sustituir el filtro de TOOLS por uno que, además del rol, respete tarea+superficie:

```ts
// LECTURA: solo tools de lectura. ACCION/AUTO: lecturas + las acciones de la superficie.
...TOOLS
  .filter((t) => toolPermitida(t.name, rolCanon, scope))
  .filter((t) => {
    if (esLectura(t.name)) return true;               // biblioteca: siempre
    if (tarea === 'lectura') return false;            // en lectura, ninguna escritura
    return accionPermitidaEnSuperficie(t.name, superficie); // escritura acotada a superficie
  })
  .map((t) => ({ type: 'function' as const, function: t })),
```
Importar `accionPermitidaEnSuperficie`, `esLectura` arriba (`:9-10`).

- [ ] **Step 6: Reforzar el gate runtime** (`:1517`): añadir junto al `toolPermitida` que una escritura fuera de su superficie se rechace:

```ts
if (esEscritura(name) && tarea !== 'lectura' && !accionPermitidaEnSuperficie(name, superficie)) {
  // el modelo pidio una accion no ofrecida en esta superficie: no ejecutar
  return 'Esa accion no esta disponible aqui.';
}
```

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add supabase/functions/agenda-asistente/permisos.ts supabase/functions/agenda-asistente/permisos.test.ts supabase/functions/agenda-asistente/index.ts
git commit -m "feat(chispa): gating por superficie (SUPERFICIE_ACCIONES) + seleccion de tools"
```

---

### Task 3: Borrar las tools cortadas del chat

> **REPRIORIZADO (decisión en ejecución):** el corte FUNCIONAL ya lo hace el filtro de
> declaración de Task 2 — ninguna tool cortada está en ningún `SUPERFICIE_ACCIONES`, así que
> el modelo NUNCA la ve (el chat ya es estrecho). El borrado FÍSICO del código muerto (defs +
> handlers + ramas de `AccionPropuesta` + `construirPropuesta`/`construirPropuestaConfig`) es
> pura limpieza KISS, es el edit más grande y delicado del edge (switch de ~660 líneas), y NO
> es requisito funcional. Por eso se hace **al final, con cuidado/incremental** (ideal: subagente),
> DESPUÉS de las tareas de más valor (retraso, memoria, prompt, voz, intra-página).
>
> **Resolución `crear_cita` / bandeja:** `bandeja.web.tsx` convierte un hilo en cita/presupuesto
> usando `crear_cita`/`crear_presupuesto`. Como "cortarlas todas" era **del chatbot**, se conservan
> acotadas a la superficie `bandeja` (añadido a `SUPERFICIE_ACCIONES`). Se cortan del todo, en cambio,
> `reagendar_cita`/`cancelar_cita`/`bloquear_hueco`/`liberar_hueco` (ninguna superficie los usa).
>
> **Dependencias que deja esto:** (a) Task 10 debe hacer que `bandeja` envíe `tarea:'accion',
> superficie:'bandeja'` en su `invoke` (hoy manda `{mensajes}` → default 'chat' → perdería sus tools;
> cubierto por el orden de despliegue cliente→edge). (b) Task 7 (prompt) debe **quitar del system
> prompt las referencias/capacidades de las tools cortadas**, o Chispa "mentirá" diciendo que sabe
> hacer cosas que ya no ofrece (fallo de auto-conocimiento conocido).

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (defs en TOOLS + handlers en el dispatch ~`:1400-1900`)
- Modify: `supabase/functions/agenda-asistente/permisos.ts` (`ESCRITURA_AGENDA`, `ESCRITURA_GESTION`)

**Interfaces:**
- Consumes: `esLectura`/`accionPermitidaEnSuperficie` (Task 2).

- [ ] **Step 1: Auditar dependencias intra-página antes de borrar.** Ejecutar y leer resultados:

```bash
grep -rn "crear_presupuesto\|recuperar_cliente\|optimizar_agenda" app/ components/ lib/
```
Confirmar que esas 3 tools se conservan (viven en `SUPERFICIE_ACCIONES`). El resto de la lista de abajo NO debe aparecer usada por ninguna superficie intra-página; si aparece, PARAR y anotarlo.

- [ ] **Step 2: Borrar definiciones y handlers** de estas tools (def en el array `TOOLS` + su `if (name === ...)` en el dispatch + su rama en el `type AccionPropuesta`): `crear_cita`, `reagendar_cita`, `cancelar_cita`, `bloquear_hueco`, `liberar_hueco`, `cambiar_config`, `cambiar_idioma_portal`, `anadir_cierre_negocio`, `crear_servicio`, `editar_servicio`, `editar_horario`, `bulk_editar_horarios`, `bulk_editar_comisiones`, `enviar_mensaje_bandeja`, `proponer_macro`, `aprobar_macro`, `resumen_gestion`.

> Conservar: `crear_presupuesto`, `recuperar_cliente`, `optimizar_agenda` (acotadas por superficie), todas las lecturas, `confirmar_citas`, `reenviar_confirmacion`, `avisar_lista_espera`, `guardar_recuerdo`.

- [ ] **Step 3: Limpiar `permisos.ts`** — quitar de `ESCRITURA_AGENDA` (`crear_cita`, `reagendar_cita`, `cancelar_cita`, `bloquear_hueco`, `liberar_hueco`) y de `ESCRITURA_GESTION` (`editar_servicio`, `crear_servicio`, `editar_horario`, `enviar_mensaje_bandeja`, `cambiar_idioma_portal`, `anadir_cierre_negocio`, `bulk_editar_horarios`, `bulk_editar_comisiones`, `proponer_macro`). Quitar `resumen_gestion` de `LECTURA_CAP`. Dejar `crear_presupuesto`, `recuperar_cliente` en `ESCRITURA_GESTION`; `optimizar_agenda` sigue su gating actual.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`. Resolver cualquier referencia colgante a tipos/handlers borrados (p.ej. ramas del `switch` de `AccionPropuesta`).

- [ ] **Step 5: Tests de permisos** — `deno test supabase/functions/agenda-asistente/permisos.test.ts` (ajustar los que referencien tools borradas). Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/agenda-asistente/
git commit -m "refactor(chispa): recortar el chat a la biblioteca + 4 acciones en bloque"
```

---

### Task 4: Nueva tool `gestionar_retraso`

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (def TOOLS + handler + rama `AccionPropuesta`)
- Modify: `supabase/functions/agenda-asistente/permisos.ts` (añadir a `ESCRITURA_AGENDA`)
- Reference (lógica pura, ya testeada): `lib/retrasos.ts` (`calcularEstrategiasRetraso`), `lib/retrasos.test.ts`

**Interfaces:**
- Produces: `AccionPropuesta` variante `optimizar_agenda`-compatible (reutiliza `movimientos`) o una nueva `gestionar_retraso` con `movimientos` + `avisos`. El cliente la aplica con el mismo camino que `optimizar_agenda`/`RetrasoEstrategiasModal`.

- [ ] **Step 1: Declarar la tool** en `TOOLS`:

```ts
{
  name: 'gestionar_retraso',
  description: 'Propone como absorber un retraso del dia: dado un profesional (o una cita) y los minutos de retraso, calcula la mejor estrategia (empujar en cascada, mover a un hueco, aprovechar un reposo o pedir a la siguiente venir mas tarde) y propone los movimientos. No ejecuta: el usuario confirma. Usala para "vengo con 20 min de retraso" o "la de las 5 llega tarde".',
  parameters: {
    type: 'object' as const,
    properties: {
      profesional: { type: 'string', description: 'Nombre parcial del profesional (opcional si se da cita_id)' },
      cita_id: { type: 'string', description: 'UUID de la cita que se retrasa (opcional; si no, retraso a nivel profesional desde ahora)' },
      minutos: { type: 'string', description: 'Minutos de retraso (ej. "20")' },
      fecha: { type: 'string', description: 'YYYY-MM-DD (por defecto hoy)' },
    },
    required: ['minutos'],
  },
},
```

- [ ] **Step 2: Añadir a `ESCRITURA_AGENDA`** en `permisos.ts` (opera sobre citas → mismo scope de agenda): `'gestionar_retraso',`.

- [ ] **Step 3: Implementar el handler** (en el dispatch, junto a `optimizar_agenda`). Lee las citas del profesional ese día (svc + `.eq('negocio_id')`), mapea a `CitaRetraso`, llama a la lógica pura y devuelve la estrategia recomendada como propuesta:

```ts
if (name === 'gestionar_retraso') {
  const minutos = parseInt(String(inp.minutos ?? ''), 10);
  if (!Number.isFinite(minutos) || minutos <= 0) return 'Indica cuantos minutos de retraso.';
  const fecha = String(inp.fecha ?? hoy);
  // Resolver profesional (por nombre) y traer sus citas del dia -> mapear a CitaRetraso.
  // Reutilizar el patron de consultar_disponibilidad para cargar citas del dia.
  // Con cita_id -> proponerRetrasoPorCita; sin el -> retraso a nivel profesional.
  // Calcular con calcularEstrategiasRetraso(citas, citaId, minutos) y tomar la recomendada.
  // Empujar a bloquesExtra una accion { tipo:'gestionar_retraso', movimientos, avisos, resumen }.
  // (Ver lib/retrasos.ts: EstrategiaRetraso.updates -> movimientos; .avisos -> avisos.)
  return 'Propuesta de retraso preparada.';
}
```
Importar `calcularEstrategiasRetraso` de `../../../lib/retrasos.ts` (mismo patrón que `CATALOGO_IA` en `:11`).

- [ ] **Step 4: Añadir la rama de tipo** a `AccionPropuesta` (espejo del cliente): `{ tipo: 'gestionar_retraso'; negocio_id: string; fecha: string; movimientos: {...}[]; avisos: {...}[]; resumen: string }`.

- [ ] **Step 5: Verificar la lógica pura** (ya cubierta): `deno test lib/retrasos.test.ts`. Esperado: PASS (no se toca la lógica, solo se consume).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/agenda-asistente/ 
git commit -m "feat(chispa): tool gestionar_retraso (reutiliza lib/retrasos)"
```

---

### Task 5: Clasificador Paso-0 para el chat (`tarea:'auto'`)

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (antes del `create` de `:1490`)

**Interfaces:**
- Consumes: `MODEL_LECTURA`, `openai`, `tarea`, `modeloEnUso` (Task 1).

- [ ] **Step 1: Implementar el clasificador** (solo cuando `tarea === 'auto'`, antes de la llamada principal). Una llamada barata sin tools:

```ts
// Chat ambiguo: clasificar lectura|accion|charla con el modelo barato (sin tools,
// 1 palabra) para elegir modelo + set de tools. Ante duda -> 'accion' (Haiku, fiable).
let tareaEfectiva: 'lectura' | 'accion' = tarea === 'accion' ? 'accion' : 'lectura';
if (tarea === 'auto') {
  const ultimo = mensajes[mensajes.length - 1]?.content ?? '';
  try {
    const cls = await openai.chat.completions.create({
      model: MODEL_LECTURA,
      messages: [
        { role: 'system', content: 'Clasifica el mensaje en una palabra: "accion" si pide confirmar/reenviar/avisar/gestionar un retraso; "lectura" si pide datos, cifras, listados o analisis; "charla" para saludos o ayuda. Responde solo la palabra.' },
        { role: 'user', content: String(ultimo) },
      ],
      max_tokens: 3,
    });
    const etiqueta = (cls.choices[0]?.message?.content ?? '').toLowerCase();
    tareaEfectiva = etiqueta.includes('accion') ? 'accion' : 'lectura';
  } catch { tareaEfectiva = 'accion'; } // fallback seguro
}
modeloEnUso = tareaEfectiva === 'accion' ? MODEL : MODEL_LECTURA;
```
Usar `tareaEfectiva` (en vez de `tarea`) en el filtro de tools de Task 2 (Step 5/6) y donde se decidía por `'lectura'`.

- [ ] **Step 2: Verificación manual (tras desplegar, Task 8)**: "que citas tengo manana" → logs muestran `MODEL_LECTURA`; "confirma las de manana" → `MODEL` (Haiku) y tarjeta de confirmación.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agenda-asistente/index.ts
git commit -m "feat(chispa): clasificador previo lectura/accion para el chat"
```

---

### Task 6: Memoria — última visita + historial corto

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (handlers `buscar_cliente` y `ficha_cliente`)

- [ ] **Step 1: Enriquecer `buscar_cliente`**: en cada candidato, añadir `ultima_visita` (fecha de su última cita completada) y `total_visitas`. Consulta agregada por `cliente_id` sobre `citas` (svc + `.eq('negocio_id')`), sin datos de salud.

- [ ] **Step 2: Confirmar `ficha_cliente`**: ya trae historial + `memoria_ia` (`:1867-1902`) + `tiene_notas_salud`. Asegurar que el historial incluye las últimas ~5 citas con fecha/servicio/estado, para responder "la clienta que vino hace X".

- [ ] **Step 3: Verificación manual (tras desplegar)**: en el chat, "¿te acuerdas de la clienta que vino hace unos meses con mechas?" → usa historial, responde con nombre + fecha; nunca inventa salud.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agenda-asistente/index.ts
git commit -m "feat(chispa): memoria util - ultima visita + historial en buscar/ficha cliente"
```

---

### Task 7: System prompt — trocear + contrato Titular→Visual→Acción

**Files:**
- Modify: `supabase/functions/agenda-asistente/index.ts` (`buildSystemPrompt` `:1122`)

- [ ] **Step 1: Trocear el prompt por tarea.** `buildSystemPrompt` recibe `tareaEfectiva`/`superficie` y solo incluye las secciones relevantes (p.ej. no cargar el catálogo de config: esas tools ya no existen). Firma nueva: `buildSystemPrompt(hoyISO, scope, puedeInformes, hechosMemoria, tareaEfectiva, superficie)`.

- [ ] **Step 2: Añadir el contrato de formato para `lectura`** con worked-example (la regla general no basta — lección S3 V2):

```
CUANDO SEA UN ANALISIS O CONSULTA DE DATOS, responde en este orden y SIN muro de texto:
1) Un TITULAR de una frase con el hallazgo (bloque texto corto, en negrita el dato clave).
2) El MEJOR bloque visual con cifras reales (kpi / barras / grafica / tabla / comparativa).
3) Si procede, UNA accion de 1 clic (enlace o accion de la superficie).
Ejemplo -> Usuario: "como va la semana". Respondes: texto "**Vas +12%** en ingresos frente a la semana pasada." + comparativa(ingresos, semana) + enlace(informes).
```

- [ ] **Step 3: Verificación manual (tras desplegar)**: una consulta de análisis desde el chat y desde una tarjeta intra-página devuelve titular + visual (no párrafos).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agenda-asistente/index.ts
git commit -m "feat(chispa): system prompt troceado por tarea + contrato Titular-Visual-Accion"
```

---

### Task 8: Desplegar el edge + secret + advisors

> **ORDEN DE DESPLIEGUE (gotcha detectado en ejecución):** el filtro de tools por
> `superficie` del edge asume que el cliente envía la `superficie` correcta. Si el edge
> nuevo se despliega ANTES de que el cliente (Fase 2, Tasks 9-10) esté en producción, las
> pantallas de acción (presupuestos/clientes) enviarían `superficie:'chat'` por defecto y
> perderían su tool de escritura. Los cambios de cliente son retro-compatibles con el edge
> viejo (ignora `tarea`/`superficie`). Por tanto: **primero mergear/publicar el cliente
> (Fase 2), y solo después desplegar el edge.** (Nota: Task 2 omitió el hard-block runtime
> por superficie por redundante — el filtro de declaración basta y evita falsos bloqueos.)

- [ ] **Step 1: Fijar el secret** `OPENROUTER_MODEL_LECTURA=google/gemini-2.0-flash-001` en Supabase (dashboard o CLI `supabase secrets set`).
- [ ] **Step 2: Desplegar** `agenda-asistente` (MCP `deploy_edge_function` o `supabase functions deploy agenda-asistente`).
- [ ] **Step 3: Verificar versión** desplegada (`list_edge_functions` → versión incrementada, status ACTIVE).
- [ ] **Step 4: Advisors de seguridad** de Supabase (get_advisors security) → sin nuevos hallazgos.
- [ ] **Step 5: Humo E2E** con las verificaciones manuales de Tasks 5/6/7 en `/demo.html?share=1` y en una cuenta real.

---

## Fase 2 — Cliente: cablear el ruteo

### Task 9: `invocarChispa` + `useAyudaIA` aceptan `tarea`/`superficie`

**Files:**
- Modify: `lib/hooks/useChispaSugerencia.ts` (`invocarChispa`)
- Modify: `lib/hooks/useAyudaIA.ts`

**Interfaces:**
- Produces: `invocarChispa(prompt, contexto?, opts?: { tarea?: 'lectura'|'accion'|'auto'; superficie?: string })`; `useAyudaIA().analizar(prompt, contexto?, opts?)` con default `tarea:'lectura'`.

- [ ] **Step 1: Extender `invocarChispa`** para pasar `tarea`/`superficie` en el body (`supabase.functions.invoke('agenda-asistente', { body: { mensajes, contexto, tarea, superficie } })`).
- [ ] **Step 2: Extender `useAyudaIA.analizar`** con `opts` opcional; default `tarea:'lectura'` (las tarjetas de análisis son lectura). Guardar `opts` en `ultima.current` para que `reintentar()` repita igual.
- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Esperado: sin errores.
- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useChispaSugerencia.ts lib/hooks/useAyudaIA.ts
git commit -m "feat(chispa): el cliente pasa tarea/superficie al edge"
```

---

### Task 10: `ChispaPanel` (`auto`/`chat`) + superficies de acción

**Files:**
- Modify: `components/chispa/ChispaPanel.web.tsx`
- Modify: superficies de acción que llaman con escritura: `app/(tabs)/presupuestos.web.tsx` (`presupuestos`), `app/(tabs)/clientes.web.tsx` (`clientes`), `components/agenda/OrganizarAgendaPanel.web.tsx` y `RetrasoEstrategiasModal`/`AgendaCalendar` (`agenda`).

- [ ] **Step 1: `ChispaPanel`** envía `tarea:'auto'`, `superficie:'chat'` en sus llamadas a `invocarChispa`.
- [ ] **Step 2:** Las superficies de acción pasan `{ tarea:'accion', superficie:'<su superficie>' }` en su `analizar(...)`.
- [ ] **Step 3: Verificar (preview)**: cargar `/demo.html?share=1`; abrir el chat y una acción intra-página; confirmar en Network que el body lleva `tarea`/`superficie` correctos.
- [ ] **Step 4: Commit**

```bash
git add components/chispa/ChispaPanel.web.tsx app/(tabs)/presupuestos.web.tsx app/(tabs)/clientes.web.tsx components/agenda/
git commit -m "feat(chispa): panel usa auto/chat; superficies de accion declaran su superficie"
```

---

## Fase 3 — Voz: quitar la salida hablada (TTS), conservar el micro

### Task 11: Eliminar el TTS de `useChispaVoz`

**Files:**
- Modify: `lib/hooks/useChispaVoz.web.ts`

- [ ] **Step 1: Eliminar** `hablar`, `hablarNavegador`, `precalentar`, `cacheAudioTts`, `detenerHabla`, y el estado TTS (`motorVoz`, `setMotorVoz`, `ttsDisponible`, `vozDegradada`, `configVozId`). Conservar TODO el bloque de ESCUCHA (`iniciarEscucha`, `finalizarEscucha`, `detenerEscucha`, `transcribirServidor`, medidor de nivel, `transcripcionParcial`, `nivelAudio`).
- [ ] **Step 2: Ajustar el `return`** del hook para no exponer lo eliminado. Ajustar `EstadoVoz` (quitar `'hablando'`).
- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Resolver consumidores rotos (los arregla Task 12).
- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useChispaVoz.web.ts
git commit -m "refactor(voz): quitar TTS de useChispaVoz, conservar el micro (STT)"
```

---

### Task 12: Quitar `TabVoz`, disparos de habla y dejar de invocar `chispa-tts`

**Files:**
- Modify: `components/chispa/ChispaPanel.web.tsx` (quitar llamadas a `hablar(...)` al recibir respuesta; revisar toggle "conversación")
- Modify: `app/(tabs)/configuracion.web.tsx` (quitar la pestaña/entrada "Voz" o reducirla al toggle de wake word)
- Delete/reduce: `components/config/TabVoz.web.tsx`
- Modify: `supabase/functions/chispa-tts/` (dejar de invocar; opcional borrar el edge)

- [ ] **Step 1:** En `ChispaPanel`, quitar cualquier `hablar(...)`/lógica de auto-hablar. Si el toggle "Conversación por voz" pierde sentido sin TTS, simplificarlo a "dictado" o retirarlo (según §8b del spec).
- [ ] **Step 2:** En `configuracion.web.tsx`, retirar la sección de voz o reducirla al toggle de "Hola Mecha" (wake word). Borrar `TabVoz.web.tsx` si queda sin uso; si se conserva el wake word, dejar solo esa parte.
- [ ] **Step 3:** Confirmar que ya nadie llama a `functions/v1/chispa-tts` (`grep -rn "chispa-tts" app/ components/ lib/`). Dejar el edge inerte o borrarlo.
- [ ] **Step 4: Typecheck + build** — `npx tsc --noEmit && npm run build:web`.
- [ ] **Step 5: Verificar (preview)**: `/demo.html?share=1` → el micro dicta y "Hola Mecha" siguen; Chispa responde en texto y **no** habla; Configuración ya no muestra A/B de voz.
- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(voz): retirar salida hablada (TabVoz, chispa-tts, disparos de habla)"
```

---

## Fase 4 — Elevar la IA intra-página (Titular→Visual→Acción)

### Task 13: Scaffold de prompt por página `lib/chispaPrompts.ts`

**Files:**
- Modify: `lib/chispaPrompts.ts` (añadir `buildPromptPagina`)
- Test: `lib/chispaPrompts.test.ts` (crear)

**Interfaces:**
- Produces: `buildPromptPagina(cfg: { pagina: string; objetivo: string; accionEsperada?: string }): string` — arma la intención con el recordatorio del contrato (el contrato de formato duro vive en el system prompt del edge, Task 7; aquí va el objetivo concreto de la página).

- [ ] **Step 1: Test** en `lib/chispaPrompts.test.ts`:

```ts
import { buildPromptPagina } from './chispaPrompts';
test('buildPromptPagina incluye pagina, objetivo y accion esperada', () => {
  const p = buildPromptPagina({ pagina: 'clientes', objetivo: 'detecta fuga', accionEsperada: 'recuperar' });
  expect(p).toContain('clientes');
  expect(p).toContain('detecta fuga');
  expect(p.toLowerCase()).toContain('recuperar');
});
```

- [ ] **Step 2: Ejecutar y ver fallar** — `npx jest lib/chispaPrompts.test.ts` (o el runner del repo). Esperado: FAIL.
- [ ] **Step 3: Implementar** `buildPromptPagina` (string builder puro, comentarios en español).
- [ ] **Step 4: Ver pasar** — Esperado: PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/chispaPrompts.ts lib/chispaPrompts.test.ts
git commit -m "feat(chispa): scaffold de prompt por pagina (Titular-Visual-Accion)"
```

---

### Task 14: `TarjetaAyudaIA` — tratar el primer texto como titular

**Files:**
- Modify: `components/chispa/TarjetaAyudaIA.web.tsx`

- [ ] **Step 1:** En el render de `estado.tipo === 'listo'`, si el primer bloque es `texto`, pintarlo como **titular** (mayor peso/tamaño, color `T.text`) separado del resto de bloques. Usar tokens; sin estilos sueltos.
- [ ] **Step 2: Verificar (preview)** en una página (p.ej. informes): el resultado abre con un titular claro, luego el visual.
- [ ] **Step 3: Commit**

```bash
git add components/chispa/TarjetaAyudaIA.web.tsx
git commit -m "feat(chispa): titular destacado en la tarjeta de IA por pagina"
```

---

### Task 15: `BloqueRenderer` — craft de `kpi`/`barras`/`tabla`

**Files:**
- Modify: `components/chispa/BloqueRenderer.web.tsx`

- [ ] **Step 0: Cargar skills** `hairy-design-system` + `dataviz` antes de tocar visual.
- [ ] **Step 1:** `kpi`: icono opcional + sparkline opcional + color semántico del delta ya presente; mejorar jerarquía y `nota`. `barras`/`tabla`: cabecera más clara, alineación numérica (`tabular-nums` ya usada), estados vacíos por bloque. Mantener glass/fuego y tokens.
- [ ] **Step 2: Verificar (preview)** con `/testdatos` (arnés de bloques, ver memoria S19) y en informes/caja: los bloques se leen mejor, sin regresión.
- [ ] **Step 3: Commit**

```bash
git add components/chispa/BloqueRenderer.web.tsx
git commit -m "feat(chispa): craft de bloques kpi/barras/tabla"
```

---

### Task 16: Cablear las 11 páginas (contexto + acción esperada)

**Files:**
- Modify (una por una): `app/(tabs)/informes.web.tsx`, `caja.web.tsx`, `clientes.web.tsx`, `mi-jornada.web.tsx`, `resenas.web.tsx`, `equipo.web.tsx`, `inventario.web.tsx`, `presupuestos.web.tsx`, `bandeja.web.tsx`, `configuracion.web.tsx`, `components/agenda/AgendaCalendar.web.tsx`.

- [ ] **Step 1 (por página):** Sustituir el prompt suelto por `buildPromptPagina({...})` y pasar en `contexto` las cifras deterministas que la página ya calcula (patrón de `inventario`/`equipo`). Declarar la `accionEsperada` de cada página (clientes→recuperar, caja→upsell, agenda→organizar/retraso, informes→enlace, inventario→reponer, resenas→responder).
- [ ] **Step 2 (por página):** Verificar en preview que el análisis devuelve titular + visual + acción y que el estado vacío/error se ve bien.
- [ ] **Step 3:** Commit por página o por grupo pequeño:

```bash
git add app/(tabs)/<pagina>.web.tsx
git commit -m "feat(chispa): elevar IA intra-pagina en <pagina> (contexto + accion)"
```

---

## Cierre

- [ ] **Typecheck + build final**: `npx tsc --noEmit && npm run build:web`.
- [ ] **Verificación E2E** (spec §12): chat (lectura barata / acción Haiku / retraso), memoria de clienta antigua, voz sin TTS + micro OK, intra-página con Titular→Visual→Acción, demo intacta, coste en logs (Flash lecturas / Haiku escrituras).
- [ ] **Actualizar** `informes/MEGA_INFORME_MECHA.md` (+ memoria del proyecto) con el rework.
- [ ] **Merge** `feat/chispa-rework-kiss` → `master` (producción) tras verificación.

## Self-review (cobertura del spec)

- §4 ruteo dos modelos → Tasks 1, 5. §5 clasificador chat → Task 5. §6 recorte + SUPERFICIE_ACCIONES → Tasks 2, 3. `gestionar_retraso` → Task 4. §7 memoria → Task 6. §8 elevar intra-página → Tasks 7 (contrato edge), 13, 14, 15, 16. §8b voz TTS fuera → Tasks 11, 12. §9 cambios por archivo → cubiertos. §10 seguridad (advisors, sin anon) → Task 8. §12 verificación → Cierre.
