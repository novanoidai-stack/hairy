# Asistente de agenda (chatbot interno) — Diseño

> Fecha: 2026-06-24 · Autor: Alexandro · Roadmap: §1.2 "IA en la agenda" (1ª sub-pieza: chatbot interno).
> Estado: diseño aprobado, pendiente de plan de implementación.

## 1. Contexto y objetivo

El roadmap §1.2 ("IA en la agenda") agrupa 4 sub-piezas independientes: anti-solapamientos
inteligentes, reordenador con preview, solución de no-shows y **chatbot interno**. Esta spec
cubre **solo el chatbot interno**; las otras tres se especifican por separado.

El chatbot permite al equipo del salón **consultar y operar la agenda en lenguaje natural** desde
la propia pantalla de Agenda ("¿qué huecos hay mañana por la tarde?", "muéveme la cita de las 5 de
Ana a las 6", "bloquéame de 2 a 3 que como"). Es un diferenciador vertical y reutiliza la base de
agentes IA ya existente (RPCs + patrón LLM-con-tools del agente de WhatsApp).

## 2. Alcance (v1)

**Dentro:**
- **Consultas** sobre la agenda: huecos/disponibilidad, citas de un día/profesional/cliente, quién
  está libre, catálogo (servicios/profesionales).
- **Operaciones de escritura, siempre con confirmación**: crear cita, reagendar/mover cita,
  cancelar cita, bloquear/liberar huecos.
- **Superficie**: panel de chat flotante en la pantalla de Agenda (web).
- **Permisos**: todos los roles, respetando `can()`. Configurable si un Profesional puede operar.
- Español, solo texto.

**Fuera (v1, YAGNI):** informes/analítica, no-shows automáticos, gestión de lista de espera,
reordenador, voz, app nativa. El asistente nunca toca Config, pagos ni borrados masivos.

## 3. Arquitectura y flujo

```
[Panel flotante Agenda (web)]
   │  POST { messages, contexto } (+ JWT del usuario)
   ▼
[Edge Function  agenda-asistente]  (verify_jwt true)
   │  - resuelve negocio_id + rol desde profiles (por el JWT)
   │  - bucle LLM (Anthropic Messages API, claude-sonnet-4-6, tool use)
   │     · tools de LECTURA  → se ejecutan en la función (scoped a negocio/rol) y vuelven al LLM
   │     · tools de ESCRITURA → NO se ejecutan; se devuelve accion_propuesta (resuelta+validada)
   ▼
[Panel]  pinta texto + tarjeta de acción propuesta [Confirmar]/[Cancelar]
   │  al confirmar:
   ▼
[lib/agendaOps.ts]  ejecuta la mutación por la MISMA vía autenticada que la UI (RLS + can())
   │  → refresca agenda → feedback en el chat
```

**Principio de seguridad nuclear:** el LLM **nunca ejecuta** escrituras. Cuando "llama" a una tool
de escritura, la Edge Function **resuelve y valida** los argumentos (nombre→`cliente_id`,
servicio→`servicio_id`, "las 5"→ISO en Europe/Madrid, chequeo de solape con `isTimeSlotOccupied`) y
devuelve una `accion_propuesta` estructurada. El panel la pinta; solo al confirmar el usuario, el
front ejecuta la mutación con su sesión Supabase (RLS + `can()` aplican igual que en una acción
manual). El LLM no tiene poder de escritura ni `service_role` de escritura.

### 3.1 Frontend — `components/agenda/AsistenteAgenda.web.tsx`
- Burbuja flotante en la pantalla de Agenda → panel lateral de chat.
- Estado de conversación en memoria (no se persiste más allá del log; ver §7).
- Renderiza: mensajes del asistente, y **tarjetas de acción propuesta** con resumen legible
  (qué/quién/cuándo/profesional + aviso de solape si lo hay) y botones [Confirmar]/[Cancelar].
- Al confirmar, llama a `lib/agendaOps.ts` y, con el resultado, añade un mensaje de feedback y
  refresca la agenda visible. Mantiene la consistencia visual del resto de la app (tokens fuego,
  `useResponsive`).
- Gateado por el toggle de Config (§5) y por permisos (§6): si el rol no puede escribir, las
  tarjetas de escritura no aparecen / se informan.

### 3.2 Backend — Edge Function `agenda-asistente`
- `verify_jwt true`. Deriva `negocio_id` y `role` del JWT (lookup a `profiles`); si el rol es
  Profesional, además su `profesional_id`.
- Llama a la **Anthropic Messages API** (`claude-sonnet-4-6`, `thinking:{type:"adaptive"}`,
  `output_config:{effort:"medium"}` configurable) con system prompt + definiciones de tools.
- **Prompt caching**: marca el system prompt + definiciones de tools + catálogo del salón con
  `cache_control: ephemeral` para abaratar turnos sucesivos.
- **Tools de lectura**: se ejecutan en la función (queries scoped a `negocio_id`, y al
  `profesional_id` propio si el rol es Profesional) y el resultado vuelve al LLM en bucle hasta una
  respuesta final o una propuesta de escritura.
- **Tools de escritura**: no se ejecutan. Al invocarlas, la función normaliza/valida los argumentos
  y corta el bucle devolviendo `{ tipo:'mensaje', texto, accion_propuesta }`.
- Respuesta al front: `{ tipo:'mensaje', texto }` o `{ ..., accion_propuesta:{...} }`.

> **Decisión de delivery (menor):** se usa la **API nativa de Anthropic** (`npm:@anthropic-ai/sdk`
> en Deno) por mejor tool use, prompt caching y adaptive thinking. Requiere secret
> `ANTHROPIC_API_KEY` en Supabase. Alternativa: reutilizar la credencial OpenRouter del agente WA
> (menos setup, peor soporte de features). Configurable.

### 3.3 Módulo compartido — `lib/agendaOps.ts`
Encapsula las 4 operaciones (crear/reagendar/cancelar/bloquear-liberar) replicando exactamente la
escritura RLS que hoy hace `AgendaCalendar.web.tsx` (tablas `citas` y `bloqueos_profesional`,
estados `CITA_STATUS`, auditoría en `citas_historial`, validación con `isTimeSlotOccupied`). Lo
consume el handler de confirmación del panel. (No se refactoriza la UI existente en esta v1; queda
como oportunidad futura de convergencia.)

## 4. Tools del agente

**Lectura** (ejecutadas server-side):
- `consultar_disponibilidad(fecha, profesional?, servicio?)` → huecos libres.
- `listar_citas(rango, profesional?, cliente?, estado?)` → citas.
- `buscar_cliente(nombre|telefono)` → candidatos (resolver a `cliente_id`).
- `info_catalogo()` → servicios (con `duracion_activa_min`) + profesionales activos.

**Escritura** (solo propuesta, resueltas+validadas por la función):
- `crear_cita(cliente, servicio, profesional, inicio)`
- `reagendar_cita(cita_id, nuevo_inicio?, nuevo_profesional?)`
- `cancelar_cita(cita_id, motivo?)`
- `bloquear_hueco(profesional, inicio, fin, motivo?)`
- `liberar_hueco(bloqueo_id)`

## 5. Configuración (regla: toda función nueva lleva toggle)

En `negocio_config.config`, sub-sección nueva en la pestaña de Configuración:
- `asistenteAgendaActivo` (bool, default **false**) — muestra/oculta el panel por salón.
- `asistenteProfesionalEscribe` (bool, default **false**) — si ON, un Profesional puede operar su
  propia agenda vía chatbot; si OFF, el Profesional solo consulta.
- (Opcional) `asistenteEffort` ('low'|'medium'|'high', default 'medium') — control coste/calidad.

## 6. Permisos

- Panel visible a todos los roles con el toggle activo (todos tienen al menos `agenda.ver_propia`).
- **Lectura**: Profesional → solo su propia agenda (`profesional_id` propio); Recepción/Dirección/
  Propietario → todo (`agenda.ver_todas`).
- **Escritura**: Recepción/Dirección/Propietario (`agenda.gestionar_todas`) operan a cualquiera.
  Profesional → **configurable** (`asistenteProfesionalEscribe`): si ON, opera solo citas/bloqueos
  con su `profesional_id`; si OFF, solo consulta. Se introduce la capacidad
  `agenda.gestionar_propia` en `lib/permissions.ts` para el rol Profesional, gateada por ese toggle.
- La escritura final pasa por RLS + `can()` en el front (defensa en profundidad: aunque el LLM
  propusiera algo fuera de alcance, la mutación se rechazaría).

## 7. Manejo de errores y seguridad

- **Ambigüedad** (varios clientes "María", servicio inexistente) → el asistente **repregunta**
  (mensaje normal, posiblemente con opciones), no propone.
- **Solape** detectado al validar una escritura → la `accion_propuesta` lo marca; la tarjeta avisa
  y el front bloquea/exige override igual que la UI manual.
- **Confirmación obligatoria** en toda escritura; sin auto-ejecución.
- **Aislamiento**: nunca toca Config, pagos, ni borrados masivos; jamás opera fuera de `negocio_id`.
- **Auditoría**: cada conversación se registra en `conversaciones_ia` (RPC `registrar_conversacion_ia`
  ya existente); las escrituras confirmadas dejan rastro en `citas_historial`.
- Errores del LLM/tool → mensaje amable, nada ejecutado.

## 8. Plan de pruebas

- **Edge Function**: dispatch de tools + resolución/validación de args; invariante "las escrituras
  nunca se ejecutan server-side"; bucle LLM con modelo simulado o transcript grabado.
- **agendaOps**: crear/reagendar/cancelar/bloqueo + validación de solape + scoping por permisos
  (un Profesional no puede tocar citas de otro).
- **E2E sobre tenant demo** (`demo`): frases canónicas →
  "¿qué huecos hay mañana por la tarde?", "muéveme la cita de las 5 de Ana a las 6",
  "cancela la de Juan de las 12", "bloquéame de 2 a 3" → verificar propuesta + confirmar + aplicado
  + refresco de agenda.

## 9. Setup externo (usuario)

- Secret `ANTHROPIC_API_KEY` en Supabase (vía Management API, como los secrets de Stripe), salvo que
  se decida reutilizar la credencial OpenRouter.

## 10. Fuera de alcance (recordatorio)

Reordenador con preview, anti-solapamientos inteligentes, no-shows automáticos, lista de espera,
voz, app nativa del cliente. Cada uno con su propia spec.
