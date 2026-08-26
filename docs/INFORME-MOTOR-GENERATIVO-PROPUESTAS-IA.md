# INFORME: MOTOR GENERATIVO DE PROPUESTAS PARA LA AGENDA (Chispa Autónoma)

> **Para la sesión que ejecute esto.** Escrito el 2026-08-26 tras construir el
> organizador Fase 4 (motor determinista + ojos continuos + análisis IA de
> patrones). Este informe describe el salto siguiente: que la IA no solo
> *detecte* y *analice*, sino que **invente, valide y ejecute** soluciones.
> Léelo entero antes de tocar código: contiene el estado real, las reglas de
> oro que NO se pueden romper, y el diseño fase a fase.

---

## 0. LA IDEA (formulada por el dueño, ampliada)

Hoy el organizador tiene tres capas separadas:

1. **Detectores deterministas** (`lib/organizarAgenda.ts`): retraso, solape,
   hueco, fuera_jornada, sin_confirmar, no_show_riesgo, jornada_sin_cubrir,
   config_faltante.
2. **Motor de propuestas determinista** (`lib/organizador/motorPropuestas.ts`):
   por cada cita evalúa miles de movimientos pero de **tipos cerrados** —
   `compactar`, `aprovechar_reposo`, `cambiar_dia`, `cambiar_trabajador`. Si el
   problema no se resuelve con A/B/C/D, el motor calla.
3. **Capa IA de análisis** (`supabase/functions/agenda-optimizador`): detecta
   patrones y sugiere, pero **sus recomendaciones son texto** — no son
   ejecutables, no traen movimientos, no tienen botón "Aplicar".

**Lo que se busca**: un motor donde la IA, ante un problema (de cualquier tipo,
incluidos tipos que nadie programó), **defina ella misma la solución como un
plan de movimientos concreto y ejecutable** — no solo A, B y C sino J, Z, o lo
que invente — con las mismas garantías que el motor determinista:
hard constraints verificados, botón "Aplicar", "Enséñamelo", auditoría,
reversibilidad y la línea roja del consentimiento de la clienta.

---

## 1. ESTADO ACTUAL (qué existe y dónde)

| Pieza | Archivo | Qué hace | Límite actual |
|---|---|---|---|
| Detectores | `lib/organizarAgenda.ts` | 8 tipos de problema, prioridad `PESO_TIPO` | Tipos cerrados en código |
| Motor determinista | `lib/organizador/motorPropuestas.ts` | Slot 15 min, snaps a reposos, otros profs, ±7 días; penalizaciones 90/60/0.5/25 | 4 tipos de movimiento, 1 cita por propuesta |
| Panel UI | `components/agenda/OrganizarAgendaPanel.web.tsx` | Tarjetas Aplicar/Aplicar N/Enséñamelo/Proponer al cliente; latido 75 s; "Análisis de Chispa" | Las tarjetas IA son texto sin acción |
| Escritura | `chispaOps.ejecutarAccion({tipo:'optimizar_agenda'})` | Único camino de escritura + auditoría `citas_historial` | — |
| Enséñamelo | `AgendaCalendar.web.tsx` (`problemaEnfocado`, `data-mecha-zona`) | Resalta zonas, flecha origen→destino | Solo problemas del motor determinista |
| Propuestas a clienta | `lib/propuestasCambio.ts` → RPC `proponer_cambio_cita` | WhatsApp + `reserva_temporal` | Solo adelantos de 1 cita |
| Ojos continuos | `agenda-optimizador` modo `ojo` + triggers `migrations/agenda-ojos-continuos.sql` | Motor determinista + hallazgos en cada cambio (debounce 60 s) | No consulta a la IA |
| Análisis IA | `agenda-optimizador` modo completo | gemini-3.7-flash, prompt de 10 secciones entrenado con datos reales, métricas runtime | JSON `recomendaciones` SIN movimientos |
| Gates de coste | addon `ia_nivel` (402) + `cupo_ia_disponible` 20/h (429) | `shared/cupo.ts` | Solo aplican al modo completo |
| Portal/cadenas | `portal-reserva-encadenada.sql`, sugeridor con prepago | Cadenas grupo_id ≤4 tramos, todo-o-nada | El organizador nunca mueve cadenas |

**Invariantes que YA existen y hay que reutilizar, no reinventar:**
- Fases `inicio ≤ fin_activa ≤ fin_espera ≤ fin` y solape solo activa-activa
  (`lib/retrasos.ts`: `fasesDe`, `chocaActivaActiva`, `hayColision`).
- Estados que bloquean: pendiente/confirmada/completada.
- La única puerta de escritura es `ejecutarAccion` — nada escribe citas directo.
- La línea roja: una cita confirmada jamás se mueve en frío (ver §4).

---

## 2. EL NUEVO CONCEPTO: "PLAN" COMO CIUDADANO DE PRIMERA CLASE

Hoy una estrategia es un enum cerrado. Mañana, la unidad de trabajo es un
**PLAN**: un JSON que la IA genera y el sistema valida y ejecuta.

```typescript
// lib/organizador/planIA.ts (nuevo)
interface PlanIA {
  id: string;                      // para trackear/dedupe/auditar
  origen: 'ia';                    // vs las estrategias 'deterministas' actuales
  tipoProblema: string;            // libre: puede ser 'retraso', 'hueco_vacio'...
                                     // o algo inventado: 'cadena_fragil',
                                     // 'dia_sobrecargado', 'reposo_alineable'...
  titulo: string;                  // "Alinea los 3 reposos de la mañana"
  diagnostico: string;             // POR QUÉ: qué ve la IA que el motor no
  razonamiento: string;            // cómo llegó (para explicabilidad)
  confianza: 'alta' | 'media' | 'baja';
  impactoMin: number;              // minutos de agenda recuperables
  movimientos: MovimientoPlan[];   // LO EJECUTABLE — el corazón
  requiereConsentimiento: boolean; // ver línea roja §4
  zonasEnsename: ZonaProblema[];   // para "Enséñamelo" (origen y destino)
  riesgos: string[];               // qué puede salir mal, dicho por la IA
}

interface MovimientoPlan {
  citaId: string;                  // SIEMPRE una cita existente y verificada
  tipo: string;                    // LIBRE: 'mover', 'mover_y_encadenar',
                                    // 'reasignar', 'dividir_cadena', 'ofrecer_a_espera'...
  fases: { ini: string; finA: string; finE: string; fin: string }; // destino
  profesionalId?: string;          // si reasigna
  requiereConsentimiento: boolean; // por movimiento (¿afecta a la clienta?)
}
```

**Regla de oro nº 1: la IA propone el plan, pero el plan NO se ejecuta tal cual
sale del modelo.** El plan pasa por un **validador determinista** (§3) que
recomprueba cada movimiento contra la MISMA geometría del motor: fases, solapes
activa-activa, tramos de `horarios_profesional` (¡0=domingo!), bloqueos,
`cierres_negocio` (fecha local), comida entre turnos, techo de adelanto,
margen de reacción. Si un movimiento falla, se poda ESE movimiento (y los que
dependan de él), no el plan entero.

---

## 3. PIPELINE COMPLETO (el corazón del diseño)

```
  ┌─────────────┐   cada cambio de agenda (triggers ya vivos)
  │ OJOS (ojo)  │──────────────┐
  └─────────────┘              ▼
                      ┌──────────────────┐
                      │ 1. TRIGGER IA     │  ¿ merece la pena gastar tokens ?
                      │    (heurística)   │  - problema nuevo de peso alto
                      └────────┬─────────┘  - N+ cambios en <10 min
                               │ sí           - latido programado (p.ej. cada 30 min
                               ▼               con el salón abierto)
  ┌────────────────────────────────────────────────────────────────────┐
  │ 2. CONSTRUCTOR DE CONTEXTO  (extender el actual del optimizador)   │
  │    citas + fases + horarios + bloqueos + cierres + cadenas +       │
  │    historial de movimientos + no_shows + patrones 30 d +           │
  │    ESTADO DEL MOTOR (problemas y propuestas A/B/C ya calculadas)   │
  └────────┬───────────────────────────────────────────────────────────┘
           ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │ 3. GENERADOR  (LLM, tool-calling, NO chat libre)                   │
  │    System: el prompt de 10 secciones actual + el SCHEMA del plan   │
  │    Herramientas de CÁLCULO que el modelo PUEDE invocar para no     │
  │    alucinar geometría:                                             │
  │      - fasesDe(cita) / choca(a, b) / cabeEnTramos(fases, prof, dia)│
  │      - huecosLibres(prof, dia, desde, hasta)                       │
  │      - duracionEfectiva(servicio, prof)                            │
  │    El modelo RAZONA con números del sistema, no de su memoria.     │
  └────────┬───────────────────────────────────────────────────────────┘
           ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │ 4. VALIDADOR DETERMINISTA  (Deno puro, reutiliza lib/retrasos.ts)  │
  │    a) ids existen; b) geometría legal; c) sin colisiones SIMULANDO │
  │    el plan completo (¡los movimientos se pisan entre sí!);         │
  │    d) cadenas: o se mueven enteras o nada; e) línea roja: marcar   │
  │    requiereConsentimiento por movimiento; f) score del plan        │
  │    (reutilizar la tabla de penalizaciones 90/60/0.5/25).           │
  └────────┬───────────────────────────────────────────────────────────┘
           ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │ 5. PERSISTENCIA: tabla `planes_ia` (ver §6)                        │
  │    estado: 'propuesto' → 'aplicado' | 'podado' | 'rechazado' |     │
  │    'expirado' (TTL: un plan sobre datos de hace 2 h está caducado) │
  └────────┬───────────────────────────────────────────────────────────┘
           ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │ 6. UI: tarjeta de plan EN EL PANEL (misma tarjeta que A/B/C)       │
  │    [Aplicar] [Enséñamelo] [Proponer a la clienta] [¿Por qué?]      │
  │    Aplicar → valida OTRA VEZ contra estado actual (race) →         │
  │    ejecutarAccion('optimizar_agenda', movimientos)                 │
  └────────────────────────────────────────────────────────────────────┘
```

### 3.1 El paso 3 en detalle: tool-calling, no JSON a ciegas
Hoy pedimos JSON y cruzamos dedos. El salto es dar al modelo **herramientas de
lectura geométrica** (las mismas primitivas de `lib/retrasos.ts` expuestas
como tools). Flujo típico:

1. El modelo ve `retraso:60min` en P1 y dos citas encadenadas (grupo_id) a las
   17:00 que NO puede mover el motor determinista (las cadenas están
   excluidas). El motor calla → problema sin tarjeta.
2. La IA razona: "si adelanto la cita suelta de las 12:00 al reposo de la de
   las 11:00 (invoca `huecosLibres` → 35 min libres), la cadena de las 17:00
   ya no pisa el cierre de jornada (invoca `cabeEnTramos`)". Eso es un plan
   tipo **J** que hoy no existe.
3. Devuelve el plan con 1 movimiento, `requiereConsentimiento: false` (la
   clienta de las 12:00 llega ANTES de su hora... ojo: adelantar a una
   clienta que no está en el salón SÍ requiere consentimiento — el validador
   lo corrige por regla, no por confianza en el modelo).

### 3.2 El paso 4 en detalle: simulación con estado sombra
El validador no comprueba movimientos uno a uno contra el estado real:
**aplica el plan sobre una copia en memoria** (Map de fases efectivas, igual
que hace `detectarHuecos` con su `efectivo.set`) y valida cada movimiento
contra el estado YA MODIFICADO por los anteriores. Esto es lo que permite
planes de 3-4 movimientos encadenados sin que se pisen entre sí. Reglas:
- Si el movimiento k falla, se podan k..n (los anteriores ya encajaron).
- El plan podado se guarda con `estado:'podado'` y una nota de qué se perdió.
- **Tope de movimientos por plan: 5.** Más que eso no es un plan, es una
  reorganización de jornada que nadie va a leer.

---

## 4. LÍNEA ROJA: CONSENTIMIENTO DE LA CLIENTA (innegociable)

Clasificación determinista (NO la decide el modelo):

| Movimiento | ¿Consentimiento? |
|---|---|
| Compactar hueco interno (la clienta ni se entera: misma hora) | No |
| Reasignar a OTRO profesional | **SÍ** |
| Adelantar la cita (viene antes de lo pactado) | **SÍ** → flujo `proponer_cambio_cita` (WhatsApp + `reserva_temporal`) |
| Retrasar la cita | **SÍ**, y además requiere margen de reacción |
| Cambio de día | **SÍ** |
| Mover una cita de una clienta QUE YA ESTÁ EN EL SALÓN | No (se le avisa en persona) — se detecta con `inicio <= ahora < fin` |
| Cualquier cosa sobre cadena (grupo_id) | **SÍ** (máx. valor, máx. riesgo) |

Consecuencia de diseño: un plan puede ser **mixto** — 2 movimientos ejecutables
en caliente + 3 que se convierten en propuestas WhatsApp. La UI lo muestra
como "Aplicar 2 · Proponer 3 a las clientas" en UNA tarjeta. El botón
"Proponer 3" genera 3 `proponer_cambio_cita` con sus reservas temporales, y el
plan queda `estado:'esperando_clientes'` hasta que todas respondan o expiren
(heredar la ventana de 30 min de la lista de espera no; aquí la ventana es el
`margenReaccionMin` del salón).

**Anti-spam de clienta**: una clienta no puede recibir 2 propuestas de cambio
el mismo día ni 3 en 7 días (contar `citas_historial` + `reserva_temporal`).
La IA lo sabrá porque va en el contexto; el validador lo IMPONE.

---

## 5. TIPOS DE PROBLEMA Y SOLUCIÓN "INFINITOS" — PERO CON VOCABULARIO ABIERTO ACOTADO

El dueño pidió "no solo A/B/C sino J, Z". Diseño: el `tipoProblema` y el
`tipo` de movimiento son **strings libres para el modelo**, pero se validan
contra:

1. **Un catálogo semilla** (para analytics y UI): los 8 deterministas +
   `cadena_fragil`, `dia_sobrecargado`, `reposo_alineable`, `doble_reserva_riesgo`,
   `cierre_proximo_desbordado`, `sobrecupo_profesional`, `dia_muerto_recurrente`...
2. **Tipos nuevos**: se aceptan, se guardan, y cada semana un job agrega
   `planes_ia` por tipo → los tipos que se repiten en ≥3 salones se "gradúan"
   y entran al catálogo (y candidatese a detector determinista: si un patrón
   IA se repite, es señal de que debería estar en el motor barato).
3. **Dirección de mejora inversa**: cuando la IA propone algo que el motor
   determinista PODRÍA hacer, ese caso es oro: patrón para extender el motor
   y bajar coste. Documentarlo en la tabla (`graduable_a_determinista: bool`).

### 5.1 Ejemplos concretos de planes tipo J/Z (para el prompt del generador)
- **Alineación de reposos**: reordenar 2-3 citas de la mañana para que los
  reposos queden contiguos y quepa una cita más a mediodía (pico de demanda
  12-13h según datos reales del salón).
- **Rescate de cadena**: una cadena de 3 tramos acaba pisando el cierre →
  adelantar SOLO el primer eslabón (con consentimiento) salva los otros dos.
- **División de jornada**: un profesional tiene 6 h sin citas un martes (día
  flojo real del salón) → plan "ofrece mañana libre parcial" (bloqueo
  sugerido) + mover sus 2 citas al profesional sobrecargado.
- **Firewall de no-show**: 3 clientas de riesgo el viernes a primera hora →
  plan de reordenar las fiables al principio del día para blindar la caja.
- **Anti-bola-de-nieve**: detectar que un servicio real del salón se alarga
  de media X min sobre su duración de catálogo (comparar `fin_activa` real
  vs teórica en completadas) → proponer separación mínima tras ese servicio.

---

## 6. NUEVA TABLA `planes_ia` (migración)

```sql
create table public.planes_ia (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null references public.negocios(id),
  generado_por uuid,                    -- usuario que lo disparó (null = ojos)
  disparador text not null,             -- 'ojo' | 'latido' | 'panel' | 'manual'
  tipo_problema text not null,
  titulo text not null,
  diagnostico text not null,
  razonamiento text not null,
  confianza text not null check (confianza in ('alta','media','baja')),
  impacto_min int not null default 0,
  movimientos jsonb not null,           -- el plan validado (post-poda)
  movimientos_podados jsonb,            -- lo que el validador rechazó y por qué
  requiere_consentimiento boolean not null,
  zonas jsonb,                          -- para Enséñamelo
  riesgos jsonb,
  modelo text, coste_usd numeric, tokens_in int, tokens_out int,
  estado text not null default 'propuesto'
    check (estado in ('propuesto','aplicado','parcial','esperando_clientes',
                      'podado','rechazado','expirado','fallido')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,       -- default now() + 2 h
  aplicado_en timestamptn null,
  resultado text                        -- qué pasó de verdad al aplicarlo
);
```
RLS: staff del negocio (mismo patrón que `chispa_auditoria`). Índice por
`(negocio_id, estado, creado_en desc)`. TTL: un job (o el propio modo ojo)
pasa a `expirado` lo que caducó.

---

## 7. EJECUCIÓN Y "ENSÉÑAMELO"

- **Aplicar**: re-validar contra estado ACTUAL (la agenda pudo moverse desde
  que se generó el plan; si algo cambió, re-podar o rechazar con mensaje
  claro "la agenda cambió, regenero el plan" → re-llamada barata) y ejecutar
  TODOS los movimientos no-consentidos en UNA sola `ejecutarAccion`
  (`optimizar_agenda`) → atomicidad percibida + auditoría + undo existente
  (`lib/agendaUndo.ts`).
- **Enséñamelo**: `zonas` alimenta el mismo mecanismo
  `data-mecha-zona`/`problemaEnfocado`. Para planes multi-movimiento, el
  carrusel inferior ya navega entre problemas: extenderlo a navegar entre
  MOVIMIENTOS del plan (paso 1 → 2 → 3) con flechas origen→destino en la
  rejilla. Esto ya casi existe: reusar `zonaOrigen`/`zona`.
- **¿Por qué?**: tarjeta expandible con `diagnostico` + `razonamiento` +
  `riesgos`. La explicabilidad es lo que hará que un peluquero se fíe de un
  plan inventado por una IA.

---

## 8. AUTOVISADO (los ojos se vuelven selectivos)

Hoy el modo ojo corre determinista puro (gratis). Evolución con coste casi cero:
- El propio modo ojo decide disparar el generador IA con una **heurística
  determinista**: peso del problema nuevo ≥ 3000, o problema que el motor
  determinista NO pudo resolver (retraso sin estrategia, fuera_jornada sin
  hueco, cadenas), o 3+ problemas abiertos simultáneos.
- Rate-limits duros de autoservicio IA: máx 1 generación automática por
  negocio cada 15 min y 12/día (independiente del cupo humano de 20/h, que
  sigue siendo para botones manuales). Un bug de trigger no puede quemar
  la factura.
- Horario de autoservicio: solo con el salón abierto (reutilizar el chequeo
  de `vigilar-agenda`) y nunca 23:00-08:00.

---

## 9. MODELO Y COSTE (decisión objetiva, misma metodología que Fase 4)

- **Generador (tool-calling multi-paso)**: requiere razonamiento fuerte →
  `google/gemini-3.7-flash` (perfil `calidad`). Un plan con 3-6 tool calls
  ≈ 10-20k tokens ≈ **$0.005-0.02 por plan**. Con autoservicio acotado
  (§8): < $1/día por salón activo en el peor caso realista.
- **Fallback en cascada** existente (`construirCascada`): qwen3.7-flash
  cogería los planes simples; si un modelo sin buen tool-calling responde,
  el validador lo depura igualmente — el sistema no depende de la calidad
  del modelo para ser SEGURO, solo para ser ingenioso.
- Auditoría por plan en `planes_ia` (modelo, coste, tokens) — el dueño
  puede ver exactamente qué le cuesta cada "ideas de Chispa".
- NO usar `:batch` (planes que expiran en 2 h no esperan SLA de horas).

---

## 10. UI DEL PANEL (cambios concretos)

1. Nueva sección **"Planes de Chispa"** encima de "Análisis de Chispa":
   tarjetas = planes `propuesto` no expirados, ordenados por
   `impactoMin × confianza`.
2. Tarjeta de plan: título + badge de confianza + impacto + nº movimientos +
   [Aplicar N] [Proponer M a clientas] [Enséñamelo (k pasos)] [¿Por qué?].
3. Estados vivos: aplicando / esperando clientas (con contador de respuestas
   WhatsApp) / expirado (gris, con botón "Regenerar").
4. El cerebro `CerebroIAIcon` en modo `thinking` mientras hay generación en
   curso (ya existe la variante).
5. Nativo móvil: **fuera de alcance de esta fase** (el organizador es
   web-only hoy); pero el diseño de `planIA.ts` como lib pura lo deja listo.

---

## 11. APRENDIZAJE (cerrar el ciclo)

- Cada plan guarda `resultado` tras aplicar: mejora estimada vs real
  (minutos recuperados medidos con `detectarHuecosVacios` antes/después).
- Feedback del dueño: 👍/👎 por plan → tabla `planes_feedback` (o columna).
- El contexto del generador incluye "los 5 planes mejor valorados de este
  salón" y "los 3 rechazados y por qué": personalización real por salón
  sin fine-tuning.
- Promoción a determinista (§5.2): el motor barato se alimenta del caro.

---

## 12. FASES DE ENTREGA (cada una vale por sí sola)

**F1 — Esquelezo ejecutable (la que cambia el juego)**
- `lib/organizador/planIA.ts`: tipos + `validarPlan()` con simulación sombra
  + tests exhaustivos (los mismos estilos que `motorPropuestas.test.ts`:
  cadenas, poda, consentimiento, carreras).
- Extender `agenda-optimizador`: schema de salida = `PlanIA[]` (máx 3 planes),
  aún SOLO bajo demanda del panel.
- UI sección "Planes de Chispa" con Aplicar/Enséñamelo/¿Por qué?.
- Migración `planes_ia`.

**F2 — Planes mixtos con consentimiento**
- Botón "Proponer a la clienta" por movimiento; anti-spam; estado
  `esperando_clientes`; integración con `reserva_temporal` y expiración.

**F3 — Autonomía con ojos**
- Heurística de disparo en modo ojo (§8), rate-limits, autoservicio
  fuera de horario prohibido. Los planes automáticos nacen `confianza:alta`
  + `impactoMin >= 30` solamente (los demás se quedan en análisis).

**F4 — Aprendizaje y graduación**
- Feedback, métricas antes/después, promoción de patrones IA → detectores
  deterministas, catálogo de tipos vivo.

**F5 — Visión (lejos, pero que el diseño ya no lo impida)**
- Modo "piloto automático por franja": la IA reorganiza sola TODO lo que no
  requiere consentimiento y encola propuestas para lo demás, con reporte
  matinal ("anoche ahorré 95 min, 3 clientas tienen propuesta pendiente").
- Pricing por planes ejecutados (addon `completa`), no por análisis.

---

## 13. RIESGOS Y CÓMO SE CIERRAN

| Riesgo | Mitigación |
|---|---|
| La IA alucina geometría (horas imposibles) | Tool-calling con primitivas reales + validador determinista SIEMPRE |
| Plan pisa plan (dos tarjetas sobre las mismas citas) | Marcado de citas comprometidas entre planes activos (mismo `comprometidas` del panel) |
| Carrera: la agenda cambia al aplicar | Re-validación transaccional en el click + re-poda con feedback |
| Coste descontrolado por triggers | Heurística + rate-lims duros por negocio + auditoría por plan |
| Clientas bombardeadas con propuestas | Anti-spam por clienta (§4) impuesto por el validador |
| Confianza del dueño | ¿Por qué? + enséñamelo multi-paso + feedback 👍/👎 + todo auditable |
| Prompt drift (el dominio cambia y el prompt no) | Ya resuelto: constantes interpoladas desde el código (sección 7 del prompt) |

---

## 14. QUÉ NO HACER (errores que ya pagamos)

- NO escribir citas fuera de `ejecutarAccion` (el chatbot aprendió esto a
  golpes; su tool `optimizar_agenda` fue purgada por eso en ago-2026).
- NO confiar en `dia_semana` sin mirar de qué tabla viene (0=lunes en
  `negocio_horarios`, 0=domingo en `horarios_profesional`).
- NO pasar todo el buffer de citas (−60/+120 días) a nada: el bug de
  "oportunidades de otros días" se arregló filtrando por rango en
  `evaluarTodas`; el generador recibe SOLO su rango + 30 d de historia.
- NO usar `toISOString()` para fechas de acción en hora local española
  (mandaba el día anterior en madrugada UTC+1/+2).
- NO desplegar triggers que llamen a una función inexistente sin decir nada
  (nos pasó con los ojos: aplicar migración ≠ deploy de la edge).
- NO crear RPCs con `auth.role()` ni funciones SECURITY DEFINER sin check
  de negocio (reglas del skill de Supabase).
- Cada cambio estructural en React/TS: `npx tsc --noEmit` OBLIGATORIO
  (regla del workspace) y `deno test` para las libs puras.

---

## 15. DEFINICIÓN DE ÉXITO

- Un salón con un problema que el motor determinista no resuelve (p. ej.
  cadena pisando el cierre) ve una tarjeta **ejecutable** de Chispa con
  solución inventada, explicada y reversible → la aplica en 1 click.
- 0 citas movidas jamás sin consentimiento cuando toca a la clienta.
- Coste IA del organizador < 3 €/mes/salón en uso normal.
- El dueño puede responder "¿por qué esta propuesta?" y la respuesta le
  convence a él, no a un ingeniero.

*Fin del informe. La idea original era "que la IA lance J, Z y lo que haga
falta con botón y enséñamelo". Esto la lleva hasta planes multi-movimiento
validados, mixtos con consentimiento, autodisparados por los ojos continuos,
auditados, reversibles y con ciclo de aprendizaje. Ejecutar por fases, F1
primero.*
