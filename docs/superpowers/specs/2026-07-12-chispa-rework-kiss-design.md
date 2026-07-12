# Rework de Chispa (KISS) — diseño

> Fecha: 2026-07-12 · Autor: Carlos + Claude · Estado: propuesta, pendiente de revisión.
> Contexto de producto: `informes/MEGA_INFORME_MECHA.md`. Reglas de agenda: skill `hairy-agenda-rules`.

## 1. Problema

Chispa ha crecido a un edge monolítico (`supabase/functions/agenda-asistente/index.ts`,
~4.400 líneas) con **~40 tools** y un system prompt enorme. **El chatbot y las 11 superficies
de IA intra-página comparten el MISMO edge, el MISMO modelo (`anthropic/claude-haiku-4.5`) y
cargan las 40 tools en cada llamada.** Consecuencias:

- **Tool-calling poco fiable:** demasiadas tools ahogan al modelo; las multi-paso
  (`crear_cita`, `optimizar_agenda`) fallan.
- **Coste innecesario:** una pantalla que solo pide "analiza mis reseñas" paga el catálogo
  completo de tools + un prompt gigante en Haiku.
- **No aporta al salón:** el chatbot intenta hacer de todo y hace poco bien.

## 2. Objetivos y no-objetivos

**Objetivos**
1. Chatbot **estrecho y fiable**: solo (a) agilizar acciones repetidas en bloque
   (confirmar citas, reenviar recordatorios, avisar lista de espera, gestionar retrasos),
   (b) ser la **biblioteca en vivo del salón** (listar/consultar/analizar cualquier cosa,
   dicho bien), y (c) **memoria** (recordar a una clienta que vino hace tiempo).
2. **Dos modelos por tarea**: modelo barato para leer/analizar; Haiku solo para las escrituras.
3. **Elevar la IA intra-página**: no solo fiables + baratas, sino **mejores** — resultados, análisis,
   visualidad y acción (contrato "Titular → Visual → Acción", ver §8). Es la mitad del rework, a la par que el KISS del chat.
4. KISS: recortar, no añadir (aplica al chat; la intra-página se pule, no se infla con features nuevas).

**No-objetivos (YAGNI, este rework NO los toca)**
- No se crean superficies de IA intra-página **nuevas** (backlog aparte).
- No se crea ninguna tabla ni migración de memoria nueva (`chispa_memoria` ya existe).
- No se toca n8n / WhatsApp ni la **ENTRADA** por voz (micro/STT, wake word "Hola Mecha"): se conservan.
  SÍ se elimina la **SALIDA hablada (TTS)** de Chispa — ver §8b. La reserva de cita por voz sigue cortada.
- No se migra a un edge nuevo (Approach A: recortar en sitio).

## 3. Decisiones tomadas (con el socio)

| Decisión | Elección |
|---|---|
| Modelo | **Dos modelos por tarea.** Barato (lectura/análisis), Haiku (escritura). |
| Arquitectura | **A — recortar en sitio, un edge, ruteo por tarea.** |
| Escrituras de cita individual (crear/reagendar/cancelar por chat o voz) | **Cortadas del chatbot (KISS puro).** La creación/edición de citas vive en la agenda (intra-página / UI nativa). Se elimina la reserva de cita nueva por voz. |
| Modelo barato | **`google/gemini-2.0-flash-001`** (~10× más barato que Haiku, buen tool-calling), configurable vía secret `OPENROUTER_MODEL_LECTURA`. `MODEL` (Haiku) se mantiene para escritura. |

## 4. Arquitectura: dos caminos en un edge

Se añaden dos parámetros opcionales al body del request del edge:

- `tarea`: `'lectura' | 'accion' | 'auto'`
  - `'lectura'` → tools de solo lectura, **modelo barato**. (Lo pasan las superficies de análisis intra-página.)
  - `'accion'` → tools de escritura de esa superficie + lecturas, **Haiku**. (Lo pasan las superficies con acción y el chatbot cuando la clasificación detecta intención de escribir.)
  - `'auto'` (default del chatbot) → **clasificación previa** y luego ruteo (ver §5).
- `superficie`: string que **acota qué tools de escritura** se ofrecen (ver §6). Default `'chat'`.

Regla mental única: **leer/analizar → barato; algo que pueda proponer una escritura → Haiku.**

```
Cliente (panel o intra-página)
   │  { mensajes, contexto, tarea, superficie }
   ▼
Edge agenda-asistente
   ├─ tarea='lectura' ─────────────► modelo barato + TOOLS_LECTURA
   ├─ tarea='accion'  ─────────────► Haiku + TOOLS_LECTURA + acciones(superficie)
   └─ tarea='auto' (chat)
         └─ Paso 0: clasificar (barato, sin tools)
               ├─ 'lectura'/'charla' ► modelo barato + TOOLS_LECTURA
               └─ 'accion'           ► Haiku + TOOLS_LECTURA + acciones('chat')
```

Las escrituras siguen siendo **propuestas** (`accion_propuesta`): el edge nunca ejecuta;
el cliente aplica con la sesión del usuario (RLS). Sin cambios en ese contrato.

## 5. Ruteo del chatbot (`tarea='auto'`)

El chatbot no sabe a priori si el usuario quiere leer o escribir ("¿qué citas tengo?" vs
"confirma las de mañana"). Para respetar "dos modelos por tarea" sin mandar todo a Haiku:

- **Paso 0 — clasificador barato**: una llamada al modelo barato, **sin tools**, prompt de
  una frase, que devuelve `lectura | accion | charla`. Coste despreciable (~pocas decenas de tokens).
- Según el resultado se elige modelo + set de tools y se hace la llamada real.

Alternativa considerada y descartada: cargar reads + acciones juntas en un solo modelo (más
simple pero rompe la regla de "Haiku para escritura" y reintroduce el ahogo de tools).

## 6. Recorte de tools (el corazón del rework)

El gating por **rol** (`permisos.ts`) se mantiene. Encima se añade un gating por **superficie**:
un mapa `SUPERFICIE_ACCIONES` decide qué tools de escritura se ofrecen. Las **lecturas se
comparten** por todas las superficies.

**TOOLS_LECTURA (biblioteca del salón — modelo barato, cualquier superficie):**
`info_catalogo, buscar_cliente, ficha_cliente, listar_clientes, listar_citas, citas_hoy,
consultar_disponibilidad, resumen_caja, resumen_informes, ocupacion, metas_progreso,
consultar_estado_pagos, consultar_inventario, consultar_resenas, consultar_cumpleanos,
consultar_lista_espera, consultar_intercambios_turno, consultar_comisiones_liquidadas,
consultar_fichajes, consultar_campanas, consultar_logros, consultar_hallazgos,
consultar_fidelizacion, consultar_movimientos_inventario, buscar_recuerdos, mostrar_grafica,
mostrar_comparativa, sugerir_enlace, guardar_recuerdo` (memoria interna).

**SUPERFICIE_ACCIONES (escritura — Haiku):**
| superficie | tools de escritura ofrecidas |
|---|---|
| `chat` (chatbot) | `confirmar_citas, reenviar_confirmacion, avisar_lista_espera, gestionar_retraso` |
| `agenda` | `optimizar_agenda, gestionar_retraso` |
| `presupuestos` | `crear_presupuesto` |
| `clientes` | `recuperar_cliente` |
| (resto) | ninguna (equivale a solo lectura) |

**CORTADAS por completo (fuera del edge; ya tienen UI nativa / intra-página):**
`crear_cita, reagendar_cita, cancelar_cita, bloquear_hueco, liberar_hueco, cambiar_config,
cambiar_idioma_portal, anadir_cierre_negocio, crear_servicio, editar_servicio, editar_horario,
bulk_editar_horarios, bulk_editar_comisiones, enviar_mensaje_bandeja, proponer_macro,
aprobar_macro, resumen_gestion`.

> **Verificación obligatoria antes de borrar un handler:** auditar las 11 superficies
> intra-página (`grep useAyudaIA`/`invocarChispa`). Una tool que siga usando una superficie
> concreta (candidatas: `crear_presupuesto`, `recuperar_cliente`, `optimizar_agenda`) **se
> conserva pero acotada a esa superficie**, no se ofrece en el chat general. Si ninguna
> superficie la usa, se borra su handler, su entrada en `permisos.ts` y su bloque de descripción.

**Nueva tool `gestionar_retraso`** (Haiku; superficies `chat` y `agenda`):
envoltorio fino sobre `lib/retrasos.ts`. Dado un profesional/cita y unos minutos de retraso,
calcula server-side `calcularEstrategiasRetraso(...)` y devuelve la estrategia recomendada como
`accion_propuesta` (movimientos + avisos), reutilizando el aplicador cliente que ya existe
(`RetrasoEstrategiasModal` / `lib/agendaOps.ts`). No toca BD; propone.

## 7. Memoria ("biblioteca con memoria")

Ya casi todo existe; el trabajo es fiabilidad, no fontanería nueva:
- `chispa_memoria` (hechos) se sigue inyectando en el system prompt (ya se hace, líneas ~1312–1327).
- `buscar_cliente` y `ficha_cliente` devuelven **última visita + historial corto** para que
  *"la clienta que vino hace unos meses"* sea contestable de verdad.
- `guardar_recuerdo` sigue siendo escritura interna (no propone→confirma).
- **Demo:** se mantiene el guardarraíl actual (tenant compartido `demo_salon_001` NO persiste
  memoria cross-visitante; forzar idioma `es`; sesión aislada).

Sin tablas nuevas.

## 8. IA intra-página — elevar resultados, visualidad y acción

Las 11 superficies (`agenda, resenas, mi-jornada, clientes, presupuestos, equipo, inventario,
bandeja, configuracion, informes, caja`) usan `useAyudaIA`/`invocarChispa` con `TarjetaAyudaIA` +
`BloqueRenderer`. Este rework **no solo las abarata/estabiliza: sube el listón de lo que devuelven.**
Es la mitad del trabajo, a la par que el KISS del chat.

**8.1 Ruteo (base).**
- Análisis → `tarea:'lectura'` → modelo barato + solo lecturas (rápido y barato).
- Acción (presupuestos NL, recuperar 1-clic, organizar agenda) → `tarea:'accion'` + su `superficie` → Haiku + su tool.
- Se conservan los estados `idle→cargando→vacío|error|listo` (sin fallos silenciosos).

**8.2 Contrato de salida "Titular → Visual → Acción" (lo nuevo).**
Toda respuesta de análisis intra-página devuelve, en este orden:
1. **Titular accionable** (1 frase): el hallazgo, no un preámbulo. Ej. *"3 clientas VIP llevan +60 días sin venir."*
2. **El mejor visual** de apoyo (`kpi`/`barras`/`grafica`/`tabla`/`comparativa`) con cifras REALES del servidor.
3. **Una acción de 1 clic** cuando exista (chip `enlace` o tarjeta `accion` de la superficie).
Adiós al muro de texto: el texto es el titular; los datos van en bloques. El edge, en `tarea:'lectura'`,
recibe una instrucción de formato con **worked-example** que fuerza esta forma (la regla general no basta — lección S3 V2).

**8.3 Prompts por página (enriquecer + estandarizar).**
- Cada página pasa en `contexto` las cifras que YA tiene calculadas (deterministas) para que el modelo
  analice datos reales sin re-consultar (más barato y fiable). Patrón ya usado en `inventario`/`equipo`; se extiende a todas.
- Un scaffold compartido en `lib/chispaPrompts.ts` arma el prompt: rol de la página + objetivo + contrato 8.2.
  Cada página solo aporta su intención y su `contexto`.

**8.4 Craft del renderer (visualidad).**
- `TarjetaAyudaIA`: el primer bloque de texto se trata como **titular** (más peso/tamaño), separado del resto.
- `BloqueRenderer`: pulir jerarquía — `kpi` con icono + sparkline opcional y color semántico del delta;
  `barras`/`tabla` con mejor cabecera; estados vacíos por bloque; micro-animación de entrada coherente.
- Todo con tokens de `lib/designTokens.ts` y el patrón glass/fuego; **nada de estilos sueltos nuevos** (deuda C14).
  Cargar skills `hairy-design-system` + `dataviz` antes de tocar visual.

**8.5 Acción fiable por página.**
Cada superficie declara la acción que se espera de su análisis (clientes→recuperar, caja→upsell,
agenda→organizar/retraso, informes→enlace al detalle, inventario→reponer, reseñas→responder) para que
el helper termine con la acción correcta, no una genérica.

Reglas duras intactas: salud fuera del LLM; cifras siempre server-side; demo sin persistencia.

## 8b. Voz: quitar la salida hablada (TTS), conservar el micro

Decisión (KISS): **Chispa deja de hablar en voz alta.** Oír una respuesta de analítica/listados
aporta poco (se leen mejor los bloques/tabla) y mantenerlo obliga a un stack de TTS (Kokoro VPS +
ElevenLabs + fallback a `speechSynthesis`) que hoy además está degradado. Se **conserva la ENTRADA
por voz** (dictar / "Hola Mecha"), que sí tiene valor con las manos ocupadas.

> **Por qué sonaba la voz del navegador** (investigación 12-jul): el edge `chispa-tts` está
> desplegado (v17 ACTIVE) pero devuelve `501 tts_no_configurado` porque ni Kokoro (secrets
> `KOKORO_TTS_URL/SECRET`, VPS de Alexandro) ni ElevenLabs (`ELEVENLABS_API_KEY`, rotada) están
> operativos → el cliente degrada a `speechSynthesis`. Las voces Dora/Alex/Santi de Ajustes ya eran
> voces de **Kokoro** (github.com/hexgrad/kokoro, Apache-2.0), solo faltaba enchufarlas. Al quitar el
> TTS, este problema desaparece por completo.

**Se ELIMINA (salida / TTS):**
- `hablar()`, `hablarNavegador()`, `precalentar()`, `cacheAudioTts` y el estado TTS de
  `lib/hooks/useChispaVoz.web.ts` (`motorVoz`, `ttsDisponible`, `vozDegradada`; revisar `vozActiva`).
- La pantalla **Configuración › Voz** (`components/config/TabVoz.web.tsx`): se retira (o se reduce al
  toggle de wake word si se quiere conservar ese ajuste).
- El edge **`chispa-tts`**: se deja de invocar (borrar o dejar inerte).
- Cualquier disparo de habla en `ChispaPanel` al recibir respuesta.

**Se CONSERVA (entrada / STT):**
- `iniciarEscucha`/`finalizarEscucha`/`detenerEscucha`, `transcribirServidor`, el edge `chispa-stt`,
  el medidor de nivel (animación del micro) y el wake word (`useChispaWakeWord`, "Hola Mecha").
- El "modo conversación" (`vozActiva`) pierde su mitad hablada: **simplificar** a dictado → respuesta
  en texto, o retirar el toggle si sin voz de salida no aporta (decidir en el plan).

## 9. Cambios por archivo (resumen)

**Edge (`supabase/functions/agenda-asistente/`)**
- `index.ts`: leer `tarea`/`superficie` del body; helper `seleccionarTools(role, scope, tarea, superficie)`;
  elegir modelo (`MODEL_LECTURA` vs `MODEL`); Paso-0 clasificador para `'auto'`; borrar handlers
  y bloques de descripción de las tools cortadas; añadir handler `gestionar_retraso`; el system
  prompt se trocea (base mínima + añadidos por tarea/superficie) para no cargar el catálogo de
  config cuando no toca.
- `permisos.ts`: quitar de `ESCRITURA_AGENDA`/`ESCRITURA_GESTION`/`LECTURA_CAP` lo cortado;
  añadir `gestionar_retraso` a escritura de agenda; añadir mapa `SUPERFICIE_ACCIONES`.
- Nuevo secret en Supabase: `OPENROUTER_MODEL_LECTURA=google/gemini-2.0-flash-001`.

**Cliente**
- `lib/hooks/useChispaSugerencia.ts` (`invocarChispa`): aceptar `{ tarea?, superficie? }` y pasarlos al body.
- `lib/hooks/useAyudaIA.ts`: default `tarea:'lectura'`; permitir override para las superficies de acción.
- `components/chispa/ChispaPanel.web.tsx`: enviar `tarea:'auto'`, `superficie:'chat'`.
- Superficies de acción (presupuestos/clientes/agenda): pasar su `tarea:'accion'`+`superficie`.
- `lib/chispaBloques.ts` / tipos espejo: sin bloques nuevos (reutiliza `optimizar_agenda`-like para retraso).

**IA intra-página (elevar resultados/visualidad/acción) — ver §8**
- `lib/chispaPrompts.ts`: scaffold de prompt por página (rol + objetivo + contrato Titular→Visual→Acción).
- `components/chispa/TarjetaAyudaIA.web.tsx`: tratar el primer texto como titular; jerarquía visual.
- `components/chispa/BloqueRenderer.web.tsx`: craft de `kpi`/`barras`/`tabla` (icono, sparkline, color de delta, cabeceras, vacíos).
- Las 11 `app/(tabs)/*.web.tsx`: pasar `contexto` con cifras deterministas + declarar su acción esperada.
- Edge `index.ts` (`tarea:'lectura'`): instrucción de formato con worked-example que fuerza el contrato 8.2.

**Voz (quitar salida TTS, conservar micro) — ver §8b**
- `lib/hooks/useChispaVoz.web.ts`: eliminar `hablar`/`hablarNavegador`/`precalentar`/`cacheAudioTts` + estado TTS; conservar el bloque de escucha (STT) y el medidor de nivel.
- `components/config/TabVoz.web.tsx`: retirar (o reducir a wake word).
- `components/chispa/ChispaPanel.web.tsx`: quitar los disparos de habla al recibir respuesta; revisar el toggle de "conversación".
- `supabase/functions/chispa-tts/`: dejar de invocar (borrar o inerte).

## 10. Seguridad

- Gating por rol intacto (`toolPermitida`). El nuevo gating por superficie es **defensa extra**
  (más estrecho), nunca amplía permisos.
- El edge lo invocan usuarios autenticados (panel + intra-página + sesión demo aislada). **No hay
  cambios de grants a `anon`.**
- `gestionar_retraso` NO ejecuta: propone; la escritura la aplica el cliente bajo RLS.
- Tras cualquier cambio: pasar **advisors de seguridad** de Supabase (aunque no haya migración).

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Tool-calling del modelo barato en lecturas | Set de tools pequeño + prompt fuerte; son lecturas (bajo blast radius: peor caso, re-consulta). |
| Una superficie intra-página dependía de una tool cortada | Auditoría obligatoria de las 11 superficies antes de borrar (ver §6). |
| El clasificador Paso-0 se equivoca (manda escritura a barato) | Clasificar es tarea fácil para Flash; si falla, el peor caso es proponer una lectura; el usuario reformula. Fallback: ante duda, `accion` (Haiku). |
| Regresión en la demo | Verificar `/demo.html?share=1` (idioma forzado, sin persistencia de memoria). |
| Coste no baja de verdad | Confirmar en logs que las lecturas usan `MODEL_LECTURA`. |

## 12. Verificación (antes de dar por cerrado)

- `npx tsc --noEmit` (ignorar errores Deno de `supabase/functions`).
- Tests que deben seguir verdes: `lib/retrasos.test.ts`, `lib/chispaOps.test.ts`, `permisos.test.ts`.
- Manual (software real):
  - "¿qué citas tengo mañana?" → responde bien, **modelo barato** en logs.
  - "confírmame las citas de mañana" → tarjeta de confirmación (Haiku).
  - "vengo con 20 min de retraso" → propone estrategia de retraso.
  - Recuerdo de clienta antigua ("¿te acuerdas de …?") → usa historial.
  - Que crear/reagendar/cancelar cita por chat **ya no** ejecuta (cortado).
- Intra-página: 2–3 pantallas de análisis siguen analizando; presupuestos/clientes siguen proponiendo.
- Cost check en logs de OpenRouter/edge: lecturas → Flash, escrituras → Haiku.
- Voz: Chispa **ya no habla** (sin TTS ni fallback de navegador); Configuración ya no muestra A/B de voz.
- Micro: dictar y "Hola Mecha" siguen funcionando; la respuesta de Chispa llega en **texto**.
- Intra-página: cada análisis devuelve **titular + visual + acción** (no muro de texto); spot-check en clientes/informes/caja.

## 13. Fuera de alcance (backlog)

- Superficies de IA intra-página nuevas.
- Extracción a un edge lean independiente (podría hacerse más tarde si el monolito molesta).
- Reintroducir reserva de cita por voz (si algún día se quiere, con un flujo dedicado y fiable).
- Reintroducir voz hablada (TTS) con Kokoro (ya integrado en el historial de git: `chispa-tts` + voces Dora/Alex/Santi) si el mercado lo pide.
