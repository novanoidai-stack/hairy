# Plan maestro — Capa de IA "Chispa" de Mecha (+ funciones extra)

> Fecha: 2026-07-04 (v2, ampliado con diferenciadores investigados y extras no-IA) · Sesion: Carlos + Claude
> Estado: diseno cerrado, dividido en 15 sesiones con prompt copy-paste cada una (al final del doc).
> Fuentes hermanas: `informes/DIFERENCIADORES-IA-MECHA.md` (investigacion de mercado con fuentes) ·
> `informes/MEGA_INFORME_MECHA.md` (estado del producto) · skills `hairy-agenda-rules`, `hairy-domain-data`.

**Objetivo:** convertir la IA de Mecha en un asistente **transversal, omnisciente y conversacional**
("Chispa") que vive en toda la app, responde con **UI viva** (no texto plano), **actua** sobre el
negocio con confirmacion, entiende y habla por **voz**, respeta el **rol** de cada cuenta y trata los
**datos sensibles** de forma legal. Mas: los 4 diferenciadores de mercado confirmados y los huecos
funcionales no-IA que mas duelen en el dia a dia.

**Arquitectura (resumen):** un unico agente Chispa detras de una edge function que devuelve una
**lista de bloques tipados** (texto, grafica, accion, enlace, listas...). El front tiene un
**renderer** que mapea cada bloque a un componente reutilizando lo que ya existe (graficas de
Informes, tarjetas de Agenda). Las **escrituras nunca las ejecuta el LLM**: propone -> el usuario
confirma -> se ejecuta con la sesion Supabase del usuario (RLS + `can()`). Las **tools** expuestas al
LLM se filtran por **rol**. Voz: entrada Web Speech (fallback STT server-side), salida TTS ElevenLabs.
Datos de salud: **fuera del LLM, sin excepcion**.

**Stack:** Expo ~54 + expo-router 6 + react-native-web · Supabase (proyecto `vtrggiogjrhqtwbhbgia`,
multi-tenant `negocio_id`) · edge functions Deno · LLM via OpenRouter/Anthropic · TTS ElevenLabs ·
STT Web Speech API · WhatsApp/n8n (Alexandro).

---

## Global Constraints (aplican a TODAS las sesiones)

- **PR02 — IA transversal:** no hay "pantalla de IA". Chispa es una capa accesible desde cualquier
  pantalla; sus efectos aparecen integrados en las pantallas normales.
- **PR-12 — IA propone, el profesional dispone:** toda escritura es una propuesta con `Confirmar`.
  El LLM nunca ejecuta escrituras ni tiene `service_role` de escritura.
- **Transparencia:** Chispa se identifica SIEMPRE como IA.
- **Regla dura de salud:** datos de salud/alergias/medicacion (categoria especial RGPD art. 9)
  **NUNCA** se envian al LLM ni salen a terceros. Se quedan en la ficha local. Chispa como mucho dice
  "hay notas de salud, miralas en la ficha".
- **Consentimiento:** flag por cliente `consiente_ia`. Si `false`, el cliente queda excluido del
  contexto de la IA y filtrado en queries/RLS: para la IA "no tiene datos".
- **RBAC:** el edge deriva `negocio_id` + rol del JWT y solo expone al LLM las tools permitidas por
  `can()`. Lecturas acotadas a `negocio_id` (y `profesional_id` propio si el rol es Profesional).
  Escrituras por RLS + `can()` (defensa en profundidad).
- **Multi-tenant estricto:** todo SELECT `.eq('negocio_id', ...)`; todo INSERT incluye `negocio_id`.
- **Seguridad:** tras cualquier migracion, pasar los advisors de Supabase (security). Toda RPC
  publica nueva necesita `grant execute ... to anon` explicito. Nada de `USING (true)` de escritura.
- **Secrets:** claves (ElevenLabs, etc.) SOLO en Supabase secrets. Nunca en el repo, nunca en git.
- **Sin claims falsos:** nada de cifras/reviews inventadas en landing ni structured data.
- **Codigo en ingles, comentarios en espanol, sin emojis en codigo/UI.** Tokens fuego (`#f4501e`,
  profundo `#c0260a`, cremas `#f6f1ea`/`#fffdfb`). Movil primero (`useResponsive`). Sin `any`.
- **Antes de construir, verificar si ya existe** (leccion del 4 jul: el asistente y los retrasos ya
  estaban construidos y "no se veian" por un toggle). Grep + git log antes de escribir nada.
- **Verificacion:** cada pieza se valida en la demo (`/demo.html?share=1`, iframe `?demo=1`) antes de
  darla por hecha + `npm run build:web` + `npx tsc --noEmit`.
- **Protocolo de cierre de cada sesion:** commit y push a `master` (produccion despliega de ahi),
  actualizar `informes/MEGA_INFORME_MECHA.md` (o adenda) y marcar la sesion como HECHA en este plan;
  si hubo migracion, advisors; WhatsApp/n8n real siempre queda abierto para Alexandro.

---

## Estado actual (lo que YA existe — no reconstruir)

- **Asistente conversacional de agenda:** `components/agenda/AsistenteAgenda.web.tsx` + edge
  `agenda-asistente` (LLM tool-use; lecturas server-side; escrituras como `accion_propuesta`). Montado
  en `AgendaCalendar.web.tsx:2198`, **gateado por `asistenteAgendaActivo` (default false)** -> por eso
  "no se ve". Acciones: crear/reagendar/cancelar/bloquear/liberar cita + cambiar config. Persona
  generica (aun no es Chispa). Solo sabe de agenda.
- **Resolucion de retrasos en cascada:** `lib/retrasos.ts` (motor puro) + `RetrasoPropuestaModal.web.tsx`.
  Boton "Marcar retraso" y disparador por profesional. Desplaza `inicio/fin/fin_activa/fin_espera` el
  mismo delta (respeta activa/reposo). Aplica + aviso WhatsApp. **Solo "empuja en cascada"**, sin
  alternativas.
- **Chispa de onboarding:** `components/onboarding/OnboardingAgentOverlay.web.tsx` + edge
  `onboarding-agent` + `lib/onboardingAgent.ts`.
- **Motor de notificaciones WhatsApp** (n8n) con plantilla `aviso_retraso`; tabla+RPC
  `conversaciones_ia`; permisos en `lib/permissions.ts` (`can()`, `agenda.gestionar_propia`,
  `asistenteWriteScope`); ejecutor `lib/agendaOps.ts`; importador `components/config/TabImportarCitas.tsx`.
- Specs previas: `docs/superpowers/specs/2026-06-24-asistente-agenda-chatbot-design.md`,
  `docs/superpowers/specs/2026-06-18-retrasos-encadenados-design.md`.

## Contexto competitivo (verificado 4 jul — detalle y fuentes en DIFERENCIADORES-IA-MECHA.md)

Fresha: IA solo add-on de pago. Booksy: optimizacion de huecos + chatbot. GlossGenius/Mangomint/
Vagaro: sin IA nativa real. El plan Chispa ya nos pone en cabeza; las sesiones 11-13 nos hacen
inalcanzables (gaps de mercado confirmados).

---

## Arquitectura transversal (lo nuevo que atraviesa todo)

1. **Respuestas generativas (UI viva).** El edge devuelve `{ bloques: Bloque[] }`: `texto` (markdown),
   `accion` (tarjeta propone->confirma), `grafica`/`comparativa` (reusa Informes), `enlace` (chip que
   navega con `router.push`), `lista_clientes`/`lista_citas`. Renderer unico `bloque.tipo -> componente`.
2. **Capa de accion universal.** Todo lo operable en Mecha como bloque `accion` con `Confirmar`:
   config, horarios, servicios, **confirmar citas pendientes**, crear presupuesto, mandar mensaje por
   bandeja. Ejecutor general (crece desde `lib/agendaOps.ts`). Mensaje/WhatsApp real = Alexandro.
3. **RBAC (tools por rol).** Server-side via `can()`. Sin acceso a Informes -> sin tool de informes.
4. **Voz.** Entrada `SpeechRecognition` (es-ES) con **fallback STT server-side** (Whisper/ElevenLabs
   Scribe — Safari/iPad va mal con Web Speech). Salida ElevenLabs TTS via edge proxy (key en secrets),
   A/B contra `speechSynthesis`. **Retell = telefono (IA-VZ) = Alexandro** (numero Zadarma).
5. **Consentimiento + datos sensibles.** Operativos (nombre, telefono, historial, gasto) -> la IA puede,
   base legal contrato + aviso. Salud -> fuera del LLM (regla dura). Opt-in explicito separado solo
   si algun dia se quiere procesar salud (v2 con DPA + DPO). Rechazo -> `consiente_ia=false`.

---

## Catalogo IA por pagina (completo)

Leyenda: **[YA]** existe · **[AMPL]** ampliar · **[NEW]** nuevo · **·C** Carlos · **·A** Alexandro ·
**(S#)** sesion donde cae.

- **0. Chispa transversal:** barra/burbuja global [AMPL·C](S1) · briefing del dia [NEW·C+A](S6) ·
  modal conversacional omnisciente [AMPL·A](S1/S6) · centro de sugerencias proactivas [NEW·C+A](S6).
- **1. Agenda:** asistente conversacional [YA](S1 enciende) · retraso en cascada [YA] · retraso con
  alternativas (mover 1 cita a otro hueco / aprovechar reposo / pedir venir mas tarde) [AMPL·C](S4) ·
  optimizador de huecos [NEW·C+A](S6) · anti-solape inteligente al arrastrar [NEW·C+A](S4) · relleno
  de tiempos muertos productivos [NEW·C+A](S4) · aviso de no-show inminente [NEW·C+A](S7) ·
  **confirmar citas pendientes** (voz/texto) [NEW·C+A](S3) · **duracion real aprendida por clienta**
  [NEW·C](S4) · origen IA vs manual visible [YA].
- **2. Clientes:** Q&A de ficha [NEW·A](S7) · riesgo de no-show [NEW·C+A](S7) · sugeridor de ficha
  tecnica de color [NEW·A](S12) · alerta de fuga + recuperacion [AMPL·C+A](S7) · notas/resumen post
  cita [NEW·A](S12 dictado) · **dictado manos-libres de formulas** [NEW·C](S12) · **traductor de
  formulas entre marcas** [NEW·C+A](S12) · **try-on de color** [NEW·C](S13).
- **3. Caja:** "cuanto llevo hoy/semana" [NEW·A](S6) · asistente de arqueo [NEW·C+A](S6) · deteccion
  de anomalias [NEW·A](S6) · upsell sugerido en el cobro [NEW·A](S9). (Fiscal: NO improvisar.)
- **4. Informes:** informe narrado [NEW·A](S6) · metas [NEW·A](S6) · prediccion ocupacion/ingresos
  [NEW·A](S6) · comparativas [NEW·A](S6) · alertas proactivas de caida de reservas [NEW·A](S6) ·
  hueco muerto cronico -> promo sugerida [NEW·A](S6).
- **5. Equipo:** optimizador de turnos [NEW·A](S9) · resumen comisiones/liquidacion NL [NEW·A](S9) ·
  cobertura/sobrecarga [NEW·A](S9) · asignacion por categoria minima [NEW·A](S9).
- **6. Lista de espera:** matching automatico hueco<->espera + aviso [NEW·C+A](S8) · priorizacion
  inteligente [NEW·A](S8).
- **7. Resenas:** borrador de respuesta con tono del salon [NEW·A](S9) · sentimiento + alerta
  negativa [NEW·A](S9) · temas recurrentes [NEW·A](S9).
- **8. Bandeja:** borrador de respuesta / auto-FAQ [NEW·A](S9) · triage [NEW·A](S9) · convertir
  mensaje -> cita/presupuesto [NEW·C+A](S9).
- **9. Presupuestos:** presupuesto desde descripcion NL [NEW·C+A](S9) · upsell/paquete [NEW·A](S9) ·
  seguimiento ("5 dias sin respuesta, reenvio?") [NEW·C+A](S9).
- **10. Inventario:** prediccion reposicion + stock bajo [NEW·A](S9) · consumo por servicio
  [NEW·A](S9) · pedido sugerido [NEW·A](S9) · **factura de proveedor (foto) -> entrada de stock**
  [NEW·C](S11).
- **11. Mi Jornada:** "tu dia" personal [NEW·C+A](S9) · coaching suave [NEW·A](S9).
- **12. Portal/cliente:** agente chat/voz que reserva [YA·A] · "mejor hora para ti" [NEW·A](S9) ·
  **"quiero este corte" (busqueda visual)** [NEW·C](S13) · consentimiento en la reserva [AMPL·C](S10).
- **13. Config + Onboarding:** Chispa cambia config [YA](S1) · "optimiza mi configuracion" [NEW·A](S6)
  · unificar persona onboarding<->Chispa [AMPL·C](S1) · **catalogo desde foto de lista de precios**
  [NEW·C](S11) · **migracion magica desde Booksy/Fresha** [NEW·C](S11).
- **14. Landing/preventa:** **Chispa vendedora en la landing** (RAG sobre manuales +
  especificaciones) [NEW·C](S11) · CTA "cambiate desde Booksy/Fresha en 10 minutos" [NEW·C](S11).
- **15. Marketing:** antes/despues -> post Instagram con consentimiento [NEW·C](S13) · recompra
  predictiva por servicio ("raices a las 6 semanas") [NEW·A + prediccion·C](S9, motor Alexandro).
- **16. Legal transversal** (S2 + S10).
- **Procesos internos:** re-siembra automatica del tenant demo (cron + datos realistas) [NEW·C](S1).

## Funciones extra NO-IA que faltan (barrido por pagina, 4 jul)

> Hipotesis de gaps segun el conocimiento del repo; cada sesion VERIFICA antes de construir.

- **Agenda:** **citas recurrentes** ("cada 3 semanas") — clasico de salon, alto valor (S15) ·
  multi-seleccion / duplicar cita (S15) · busqueda rapida global tipo Cmd+K (S15).
- **Clientes:** **cumpleanos** (felicitacion + descuento automatico via motor WhatsApp existente)
  (S15) · fusionar clientas duplicadas (S15) · exportar datos de una clienta (portabilidad RGPD) (S15).
- **Caja/negocio:** **bonos/paquetes prepagados** (10 sesiones) — muy usado en salones (S14) ·
  **tarjetas regalo** (estaban "diferidas": decision de Jose antes de construir) (S14) · **propinas**
  (S14) · **modulo de gastos simple** (alquiler, suministros, compras) — sin el no hay P&L real y la
  analitica de la S6 cojea (S14).
- **Equipo:** planificador de vacaciones/ausencias (encima de bloqueos existentes) (S15) · objetivos
  por profesional (enlaza con metas S6) (S14 o S6).
- **Configuracion:** **festivos/cierres del salon completo** (hoy los bloqueos son por profesional)
  (S15) · exportacion completa de datos del negocio (RGPD/portabilidad, tambien argumento de venta
  anti lock-in) (S15).
- **Portal:** multi-idioma del portal publico (i18n MVP ya existe en la app; zonas turisticas) (S15).
- **General:** PWA/offline basico para el POS (ya identificado en memoria POS) — fuera de este plan,
  anotar en MEGA_INFORME.

## Fallas de coherencia detectadas (se cierran en la sesion indicada)

1. Asistente IA apagado en la demo -> el diferenciador es invisible para prospectos. **S1** (encender
   con guardrails: rate-limit, acciones destructivas limitadas en demo, re-siembra automatica).
2. `lib/agendaOps.ts` no inserta en `citas_historial` (la spec §7 lo exige). Verificar trigger; si no
   existe, anadir auditoria en el ejecutor general. **S3**.
3. `reagendar_cita` via asistente no marca aviso al cliente (el flujo de retrasos si). Verificar que
   el motor n8n cron-pull lo detecta; si no, marcar flag. **S3**.
4. `cambiar_config` read-merge-write pisable entre sesiones concurrentes -> merge por clave o RPC
   atomica. **S3**.
5. Restos del filter-branch: commits duplicados, stash `filter-branch: rewrite`, worktree
   `.claude/worktrees/condescending-murdock-9b0f9d`, copia vieja del arbol en `project/uploads/Hairy/`,
   `dist/` sin ignorar. **S1** (higiene al arrancar).
6. Web Speech STT mal en Safari/iPad -> fallback server-side. **S5**.
7. Demo compartida + IA con escritura -> guardrails + re-siembra. **S1**.

---

## Division en sesiones (15) — modelo + esfuerzo

| # | Sesion | Modelo | Esfuerzo | Depende | Estado |
|---|--------|--------|----------|---------|--------|
| 1 | Nucleo generativo + Chispa unificada + encendido demo + higiene repo | Opus 4.8 | alto | — | **HECHA (5 jul)** |
| 2 | Seguridad: RBAC + consentimiento + regla de salud | Opus 4.8 | maximo | 1 | **HECHA (5 jul)** |
| 3 | Capa de accion universal + confirmar citas pendientes + fallas 2-4 | Opus 4.8 | alto | 1,2 | **HECHA (5 jul)** |
| 4 | Retraso con alternativas + duracion real aprendida + anti-solape | Opus 4.8 | alto | 1,3 | **HECHA (6 jul)** |
| 5 | Voz: micro (STT + fallback) + TTS ElevenLabs + A/B | Sonnet 5 | alto | 1 | **HECHA (6 jul)** |
| 6 | Omnisciencia/analitica (briefing, informes, caja, metas, alertas) | Sonnet 5 | medio-alto | 1,2 | **HECHA (6 jul)** — briefing (Alexandro) + analitica conversacional (ver registro abajo) |
| 7 | Q&A profundo de cliente + riesgo no-show + fuga | Opus 4.8 | medio | 1,2 | **HECHA (6 jul)** |
| 8 | Lista de espera: matching + aviso + priorizacion | Opus 4.8 (SQL) / Sonnet 5 (UI) | medio | 1,3 | **HECHA (6 jul, S8-A SQL)** — S8-B (UI/edge) pendiente |
| 9 | Superficies por pagina (resenas, bandeja, presupuestos, inventario, equipo, mi jornada, upsell, recompra) | Sonnet 5 | medio | 1,2,3 | pendiente |
| 10 | Consentimiento cliente-facing + cierre legal | Opus 4.8 | medio | 2 | pendiente |
| 11 | Ventas: migracion magica Booksy/Fresha + catalogo desde foto + facturas->stock + Chispa landing | Opus 4.8 | alto | 1 | pendiente |
| 12 | Vertical color: dictado manos-libres de formulas + traductor entre marcas | Opus 4.8 | alto | 5 | pendiente |
| 13 | Vision: try-on de color + antes/despues Instagram + "quiero este corte" | Sonnet 5 | medio | 1,10 | pendiente |
| 14 | Negocio no-IA: bonos/paquetes + tarjetas regalo (decision Jose) + propinas + modulo de gastos | Opus 4.8 | medio-alto | — | pendiente |
| 15 | Operativa no-IA: citas recurrentes + cumpleanos + festivos salon + fusionar duplicadas + export RGPD + multi-idioma portal | Opus 4.8 (recurrentes) / Sonnet 5 (resto) | medio | — | pendiente |

**Registro Sesion 1 (5 jul, HECHA):** protocolo de bloques tipados (`lib/chispaBloques.ts` +
edge devuelve `{ bloques: Bloque[] }` con `texto|accion|enlace`, union extensible, y ademas
`texto`/`accion_propuesta` planos para compatibilidad con clientes ya desplegados durante el rebuild);
renderer unico `components/chispa/BloqueRenderer.web.tsx` (`enlace` navega con `router.push` validado
contra allowlist `CHISPA_RUTAS`; `accion` reutiliza la tarjeta propone->confirma). Persona unificada:
mascota compartida `components/chispa/ChispaMascota.web.tsx` (onboarding y asistente usan la misma) y
el asistente pasa a llamarse **Chispa**; burbuja/pestana GLOBAL via `components/chispa/ChispaLauncher`
montada en `app/_layout.tsx` (gateada por `asistenteAgendaActivo`, fuera de rutas publicas/login),
ya no solo en Agenda (se quito el montaje de `AgendaCalendar.web.tsx`; refresco por `useCalendarRefresh`).
Demo `demo_salon_001` encendida (`asistenteAgendaActivo=true`) con guardrails: **confirmacion simulada**
(en demo NO se ejecuta ninguna escritura real, se muestra el flujo completo) + rate-limit 15 msgs/sesion.
Higiene: `dist/` ignorado, `project/uploads/` eliminado (+ exclude tsconfig), worktree obsoleto
`condescending-murdock-9b0f9d` podado tras capturar su fix RLS no mergeado (`categorias-servicio` a
RESTRICTIVE, la BD ya lo tenia), refs de filter-branch y stash basura limpiados. Verificado en
`/demo.html?share=1`: Chispa responde con texto + enlace que navega a Clientes + accion confirmable,
y el confirm en demo no escribe (0 citas nuevas). `npm run build:web` + `npx tsc --noEmit` limpios.
NOTA multi-sesion: la Sesion 2 (RBAC + consentimiento + regla de salud) corrio en paralelo y su codigo
convive ya en el edge (`permisos.ts`/`whitelist.ts`/`resumen_informes`/consiente_ia); su verificacion
formal y advisors siguen siendo tarea de la Sesion 2 (no marcada HECHA aqui). Re-siembra demo: si se
ensucia, re-sembrar el tenant `demo_salon_001` (las escrituras de Chispa en demo son simuladas, no
tocan datos, pero otras interacciones de la demo si).

**Registro Sesion 3 (5 jul, HECHA):** ejecutor GENERAL `lib/chispaOps.ts` (evoluciona
`lib/agendaOps.ts`, que ahora solo re-exporta) con las acciones nuevas ademas de las existentes:
`confirmar_citas` (batch pendientes->confirmadas, resetea `confirmacion_enviada` para que el motor
de avisos mande la confirmacion), `editar_servicio` (precio/nombre/duracion/activo del catalogo),
`editar_horario` (fija el turno de un profesional un dia, reemplazo por turno unico),
`crear_presupuesto` (reutiliza el backend de Presupuestos, borrador) y `enviar_mensaje_bandeja`
(guarda el borrador en el hilo de la Bandeja; el envio real WhatsApp queda **stubbed** para Alexandro:
NO dispara ningun envio). Todas con validacion server-side de args en el edge (`agenda-asistente`:
tools declaradas + `construirPropuesta`) y tarjeta accion propone->confirma. RBAC ampliado
(`permisos.ts`: caps `presupuestos.crear`/`bandeja.escribir` en recepcion+, `servicios.editar`/
`horarios.editar` en direccion+, `config.cambiar` solo propietario; `confirmar_citas` sigue el scope
de agenda; `esEscritura()` enruta; 8 tests deno verdes). Tool + accion batch "confirmame las citas de
manana" con la lista de citas afectadas renderizada en la tarjeta (`BloqueRenderer` pinta el array
`citas` de la accion `confirmar_citas`).
**Fallas de coherencia cerradas:** (#2 auditoria) `citas_historial` estaba **rota y vacia** (0 filas):
sus policies exigian `negocio_id = auth.uid()` con la columna en uuid + FK a `profiles(id)`, pero el
flujo manual (y la IA) insertan el `negocio_id` de negocio (text) -> el insert fallaba en RLS de forma
silenciosa y el historial de la ficha salia siempre vacio. Reparado en migracion
`chispa-acciones-historial-config.sql`: se dropea el FK, la columna pasa a text y las policies se
rescopan al negocio del usuario via `profiles` (SELECT+INSERT business-scoped, insert bloqueado en demo).
Ahora el ejecutor deja rastro (motivo "... por Chispa (IA)") en crear/reagendar/cancelar/confirmar, y
el flujo MANUAL tambien empieza a grabar (bug latente cerrado de paso). Verificado con RLS real: un
owner inserta y lee su auditoria (antes 0). (#3 aviso al reagendar) el ejecutor de `reagendar_cita`
resetea `confirmacion_enviada`/`recordatorio_enviado` para que el motor n8n (cron-pull sobre
`confirmacion_enviada=false`) reenvie la confirmacion con la nueva fecha (igual que
`modificar_cita_publica` del portal). (#4 cambiar_config atomico) RPC `set_negocio_config_key`
(security definer, solo owner, no demo) que mezcla una sola clave con `||` en un unico UPDATE bajo lock
de fila; el ejecutor la llama en vez del read-merge-write que pisaba sesiones concurrentes.
Verificado en `/demo.html?share=1`: "confirmame las citas pendientes del 26 de mayo" -> tarjeta
"Confirmar 2 citas del 2026-05-26" con la lista (hora · servicio · cliente) -> Confirmar -> demo
simulada (guardrail: 0 escrituras reales); "sube el precio del Corte caballero a 15" -> tarjeta
"precio 18€ -> 15€" -> demo simulada (catalogo intacto). `npm run build:web` + `npx tsc --noEmit` +
`deno check`/`deno test` (12+2 tests) limpios; advisors sin regresiones nuevas (solo el WARN esperado
de RPC security-definer ejecutable por authenticated, con guardas internas). Edge desplegado
(`agenda-asistente`). Mensajeria real WhatsApp de `enviar_mensaje_bandeja` queda abierta para Alexandro.

**Registro Sesion 4 (6 jul, HECHA):** el motor puro `lib/retrasos.ts` pasa de "solo cascada" a
ofrecer ESTRATEGIAS comparables. Nuevas funciones puras (todas en `lib/retrasos.ts`, 9 tests deno en
`lib/retrasos.test.ts`, verdes): `calcularEstrategiasRetraso(citas, citaId, min, opts)` devuelve el
array de estrategias APLICABLES ordenadas por menor disrupcion (menos citas movidas, luego menor
retraso de cierre), con la primera marcada `recomendada`. Cada `EstrategiaRetraso` lleva su propuesta
comparable (`citasMovidas`, `retrasoCierreMin`, `updates` puros, `avisos`): (a) **cascada** (envuelve
el motor existente), (b) **aprovechar_reposo** — encaja la primera cita afectada en el reposo de otra
(tiempo muerto productivo) usando un modelo de fases en ms donde solo cuenta el solape activa-activa
(activa-sobre-reposo es valido), (c) **mover_hueco** — la saca al hueco valido mas cercano del dia (se
deduplica si coincide con el reposo), (d) **pedir_retraso_siguiente** — cascada enmarcada como aviso
proactivo a los clientes. Regla dura respetada: las 4 marcas (`inicio/fin/fin_activa/fin_espera`) se
mueven coherentes y ninguna estrategia propone un solape activa-activa (test dedicado). Ademas:
`duracionRealAprendida(historial, servicioId, catalogoMin)` (mediana del historial clienta+servicio,
snap a slot, null si pocas muestras o diferencia despreciable) y `mejorAlternativaSlot(...)` (hueco
valido mas cercano, busqueda bidireccional) para el anti-solape al arrastrar.
UI (Carlos): nuevo `components/agenda/RetrasoEstrategiasModal.web.tsx` (+ stub nativo `.tsx`) que pinta
las 2-3 estrategias como tarjetas propone->confirma (lenguaje de bloques de Chispa: radio, chips
"Mueve N citas"/"Cierra +Xm"/"Avisa a N", badge Recomendada) y deja elegir; reemplaza al modal de solo
cascada en `DetalleCitaModal` (el `RetrasoPropuestaModal` viejo queda sin uso). Anti-solape inteligente
en el drag&drop de `AgendaCalendar.web.tsx`: al soltar en conflicto, en vez de solo el toast de error,
propone el hueco valido mas cercano ("Ahi no cabe -> ¿mover a HH:MM?") y lo aplica con auditoria.
Duracion real aprendida: en `NewCitaModal`, al elegir clienta+servicio se consulta su historial y, si
difiere del catalogo, aparece un chip "Con esta clienta suele durar ~X min · usar" (sugerencia, no
imposicion; ajusta `duracionActivaCustom`). El flujo "profesional llega tarde" se deja en cascada (sin
cambios). `npx tsc --noEmit` limpio (se anadio `**/*.test.ts` al exclude de tsconfig: son tests deno) +
`npm run build:web` OK + `deno test lib/retrasos.test.ts` 9/9.
**Verificado en vivo** (`/demo.html?share=1`, tenant `demo_salon_001`, escenario sembrado y luego
BORRADO): tinte Color raiz 10:00-11:00 (reposo 10:20-10:50) con Barba 11:00 y Corte 11:15 detras ->
"Marcar retraso" +15 -> el modal ofrece 3 estrategias (reposo recomendada: mueve 1 cita, cierra a su
hora; cascada: mueve 2, +15m; pedir venir mas tarde: avisa a 2). Aplicada la de **reposo**: en BD la
Barba queda 10:45-11:00 (dentro del reposo desplazado 10:35-11:05, sin solape activa-activa), el tinte
+15 coherente en las 4 marcas, el Corte intacto, `retraso_aviso_pendiente=true` solo en la Barba.
Aplicada la **cascada** (prueba separada): tinte 10:15, Barba 11:15-11:30, Corte 11:30-11:55, sin
solapes. Ambas coherentes. NOTA: marcar un retraso en la demo SI escribe (no es el path simulado de
Chispa); si se ensucia, re-sembrar. Aviso WhatsApp real de `aviso_retraso` sigue dependiendo de la
plantilla Meta (Alexandro).

**Registro Sesion 5 (6 jul, HECHA):** entrada y salida de voz para Chispa, todo en un unico hook
`lib/hooks/useChispaVoz.web.ts` (maquina de estados `inactivo|escuchando|transcribiendo|hablando`)
conectado a `ChispaPanel.web.tsx`; el contrato de bloques de las Sesiones 1-4 no cambia. **Entrada:**
boton de microfono junto al input; usa `SpeechRecognition`/`webkitSpeechRecognition` nativo (es-ES) si
el navegador lo soporta, y si no (Safari/iPad — cierra la falla de coherencia #6) graba con
`MediaRecorder` y transcribe server-side con el edge nuevo **`chispa-stt`** (ElevenLabs Scribe). El
texto reconocido se envia solo (manos libres); PR-12 intacta, nada se ejecuta sin la tarjeta Confirmar.
**Salida:** toggle "altavoz" en la cabecera; con el activo, cada respuesta (solo los bloques `texto`)
se reproduce via el edge nuevo **`chispa-tts`** (ElevenLabs TTS, voz `EXAVITQu4vr4xnSDxMaL`, modelo
`eleven_multilingual_v2`), con cache en memoria por texto exacto y boton de stop. **Degradacion:** si
`ELEVENLABS_API_KEY` no esta en Supabase secrets el edge responde 501 y el hook apaga el motor IA para
el resto de la sesion cayendo a `speechSynthesis`; cualquier OTRO fallo (probado en vivo: cuota de
creditos agotada, 502) degrada solo esa respuesta puntual sin dejar a Chispa muda, reintentando
ElevenLabs en el siguiente turno. **A/B:** `?vozab=1` en la URL muestra un selector ElevenLabs vs
navegador (no visible para clientas, solo para decidir internamente el plan de pago). Eleccion de STT
documentada en el propio archivo del edge: ElevenLabs Scribe en vez de Whisper/OpenRouter para
reutilizar el MISMO secret que el TTS. Ambos edges exigen usuario autenticado (`verify_jwt` + `getUser`)
y acotan coste (`chispa-tts` recorta a 700 caracteres, `chispa-stt` limita a 8MB). Accesibilidad: nunca
escucha sin el gesto del boton; estado siempre visible bajo el input.
**Verificado en vivo:** el prerrequisito externo YA estaba cumplido (key rotada en Supabase secrets);
un fetch autenticado a `chispa-tts` devolvio audio/mpeg real (200, 34KB). En `/demo.html?share=1`,
activar el altavoz + preguntar por los servicios disparo el POST a `chispa-tts` (502 por cuota de
ElevenLabs agotada en ese momento) y el panel degrado sin error de consola; el microfono uso
`webkitSpeechRecognition` nativo y volvio a inactivo tras fallar por falta de acceso real al microfono
del entorno de prueba, sin crashear; el selector A/B aparecio con `?vozab=1`. `npx tsc --noEmit` +
`npm run build:web` limpios, sin `any`. **Nota de higiene (no corregida aqui, ver MEGA_INFORME):**
`scripts/elevenlabs-voice.py` y `scripts/generate-mecha-voice.py` tienen una key de ElevenLabs antigua
hardcodeada en texto plano, versionada en git; pendiente purgarla.

**Registro Sesion 6 (5 jul, PARCIAL — hecho por Alexandro, auditado 5 jul):** entrego SOLO la
sub-pieza "briefing proactivo / centro de sugerencias" (fila 0 del catalogo), no la sesion completa.
Construido: RPC deterministas `agenda_briefing`/`agenda_briefing_operativa` (senales_sin_pagar +
bandeja_sin_responder, scoped por rol/negocio) + reuso de `clientes_en_riesgo_fuga` + hook
`useOnboardingStatus` -> `lib/briefing.ts` (fusion+rankeo) -> `components/agenda/BriefingAgenda.web.tsx`
montado dentro de `ChispaPanel.web.tsx`. Ademas RPC `marcar_cita_no_show` (enabler nuevo: antes
ninguna accion marcaba una cita como no-show; hoy existe en prod pero **sin ningun boton que la
llame** — ver Sesion 7). Su propio doc (`docs/superpowers/specs/2026-07-04-copiloto-fase3-briefing-
proactivo-design.md`) documenta el recorte explicito: `citas_en_riesgo` eliminado (no hay estado
no_show real, se solapa con senales_sin_pagar), `huecos_rellenables` aplazado a v1.1, "analitica
conversacional/insights" declarada FUERA de alcance ("fase posterior") — es decir, la parte que en
este plan es el grueso de la Sesion 6.
**Gap detectado en la auditoria (no en su spec, en su codigo):** su propio diseno (§7) especifica un
toggle `briefingProactivoActivo` en Configuracion (default ON, para poder apagarlo) — **no existe en
ningun archivo del repo**, solo en el markdown. Hoy el briefing esta siempre activo sin forma de
desactivarlo. Pendiente para quien cierre la Sesion 6.
**LO QUE FALTA de la Sesion 6** (no reconstruir el briefing, ya esta hecho): tools de lectura agregada
(`resumen_caja`, `resumen_informes`, `ocupacion`, `metas_progreso`, `citas_hoy`), bloques nuevos del
protocolo `'grafica'`/`'comparativa'`, informe narrado, metas, prediccion, comparativas, alertas de
caida de reservas, hueco muerto cronico -> promo, y anadir el toggle que falta.

**Registro Sesion 6 — cierre de la analitica (6 jul, HECHA — reemplaza el PARCIAL):**
- **Gap del toggle cerrado:** `briefingProactivoActivo` (default ON) anadido a `ConfigState`/`DEFAULT_CONFIG`
  y como `FieldRow` en `app/(tabs)/configuracion.web.tsx` (seccion "Asistente de agenda (IA)", mismo
  patron que `asistenteAgendaActivo`). `ChispaLauncher.web.tsx` lo lee de `negocio_config` con default
  ON si la clave falta (`cfg.briefingProactivoActivo !== false`, para no apagar el briefing ya vivo en
  salones existentes) y lo pasa a `ChispaPanel` (`briefingActivo`), que gatea el render de `BriefingAgenda`.
- **Bloques nuevos del protocolo:** `'grafica'` (serie temporal) y `'comparativa'` (actual vs anterior
  con delta %) en `lib/chispaBloques.ts` (+ espejo en el edge). Renderer: nuevos casos en
  `components/chispa/BloqueRenderer.web.tsx` reutilizando el grafico SVG **extraido** a
  `components/charts/LineChartMini.web.tsx` (mismo algoritmo que el `LineChart` local de
  `informes.web.tsx`, que ahora tambien lo consume — deuda de duplicacion cerrada de paso).
- **Tools de lectura agregada** en el edge `agenda-asistente`, todas gateadas por rol via el RBAC de la
  Sesion 2 (`permisos.ts` `LECTURA_CAP` + 3 tests nuevos en `permisos.test.ts`, 11/11 verdes):
  `resumen_caja(rango)` (libro de cobros, mismo calculo que el arqueo de `caja.web.tsx`),
  `ocupacion(rango)` (citas/profesional activo, def. de `informes.web.tsx`), `citas_hoy(fecha)`
  (agenda del dia + proxima cita; scope self para profesional), `metas_progreso()` (reutiliza las RPC
  `objetivos_negocio_progreso`/`mis_objetivos_progreso` ya desplegadas — via `userClient` con el JWT,
  no el service key, porque dependen de `auth.uid()`). Todas: `informes.ver` salvo `citas_hoy`
  (`agenda.ver_propia`) y `metas_progreso` (cualquier rol, el handler decide propio/equipo).
- **Tools generadoras de bloques visuales:** `mostrar_grafica(metrica, desde, hasta)` y
  `mostrar_comparativa(metrica, periodo)` (patron identico a `sugerir_enlace`: efecto lateral que
  acumula un bloque en `bloquesExtra`, el acumulador `enlaces` se generalizo). Los numeros SIEMPRE se
  calculan server-side con las mismas tablas/filtros que Caja/Informes; el LLM solo elige metrica/rango,
  nunca fabrica cifras. La comparativa usa ventanas MOVILES (ultimos N dias vs los N anteriores) para no
  comparar un periodo parcial contra uno completo.
- **Alertas proactivas:** la caida de reservas queda cubierta de forma conversacional por
  `mostrar_comparativa` (el system prompt guia a Chispa a comparar y avisar si baja); no se creo una
  superficie paralela de alertas en el briefing porque el detector determinista de "hueco muerto
  cronico"/"caida vs media" pide su propio RPC SQL con fases activa/reposo — se anota como v1.1 del
  briefing (misma forma `BriefingSignal`), no bloqueante. Nota honesta respetada: NO se presenta P&L
  (gastos = Sesion 14); las notas de cada tool avisan de que son cifras aproximadas/parciales.
- **Verificado en vivo** (`/demo.html?share=1`, tenant `demo_salon_001`, usuario owner): el briefing
  renderiza al abrir Chispa; "cuanto llevo esta semana" -> **grafica** "Ingresos por dia … Total 160,00 €"
  (contrastado con SQL real: 160 € / 3 cobros ultimos 7 dias, cuadra), **comparativa** "Ultimos 7 dias
  160,00 € +51% / 7 dias anteriores 106,00 €" y **enlace** a Informes. El toggle "Briefing proactivo"
  aparece en Configuracion > Agenda. `npx tsc --noEmit` + `npm run build:web` limpios (sin `any`);
  `deno check` + `deno test` (11 tests) verdes. Edge desplegado (`agenda-asistente` v19, via CLI supabase).
  El rol Profesional sin `informes.ver` no recibe caja/ocupacion/graficas (cubierto por los tests RBAC;
  la verificacion viva se limito a owner porque el tenant demo solo tiene cuentas owner). El path
  toggle-OFF es un condicional trivial typechequeado; no se persistio un OFF en el tenant demo compartido
  para no afectar a otros visitantes.
- **INCIDENTE (recuperado):** un primer deploy del edge via MCP subio por error un placeholder en vez del
  `index.ts` real (roto ~2 min); corregido de inmediato redeployando los 3 archivos reales con el CLI
  `supabase functions deploy` (v19, sha `86a4c93`). Sin errores de arranque en logs tras el fix.

**Registro Sesion 7 (6 jul, HECHA):** Q&A profundo de clienta + riesgo de no-show + fuga, tocando la
regla dura de salud. **SQL** (`migrations/sesion7-riesgo-noshow-y-ficha.sql`, aplicada + advisors OK,
solo el WARN esperado de security-definer ejecutable por authenticated con guardas internas):
- `marcar_cita_no_show` **cerrada de circuito**: ademas de poner `estado='no_show'` (existia de la S6
  parcial de Alexandro, sin UI que la llamara) ahora **incrementa `clientes.noshows_count`** y sella
  `modificado_por/at`, para que la pildora de riesgo de la ficha y el score dejen de salir siempre vacios.
- `clientes_riesgo_no_show()` (tabla, negocio del caller via `auth.uid()`; SOLO devuelve medio/alto para
  no etiquetar a la mayoria fiable) + `riesgo_no_show_cliente(id)` (jsonb de UNA clienta, incluye bajo)
  + `citas_riesgo_no_show(desde,hasta)` (citas sin confirmar de clientas de riesgo, para el aviso
  "no-show inminente"). Score DETERMINISTA: `no_shows*35 + cancelaciones_tardias*15 + (clienta nueva ?10)`,
  nivel alto>=50 / medio>=20 / bajo. Cancelacion tardia = cancelada cuyo ultimo cambio cae en +-24h del
  inicio. **Verificado con datos reales de demo** (mark+medir+revert): 1 no-show de Ana Ruiz -> score 35
  -> nivel medio, cuadra. + `registrar_aviso_fuga(cliente,recompensa?)` (security definer, idempotente,
  guardrail demo) porque `fuga_clientas_avisos` no tiene policy de INSERT: deja el registro 'pendiente'
  que recoge el motor de Alexandro (envio real WhatsApp = suyo).
- **Wire-up del boton "No se presentó"** en el `DetalleCitaModal` de `AgendaCalendar.web.tsx` (visible solo
  cuando la cita ya paso y sigue confirmada/completada) -> llama la RPC -> refresca. Sin esto, hoy 0 citas
  se habian marcado nunca como no_show y el score no tenia datos que contar.
- **Edge `agenda-asistente`** (desplegado v-nueva via CLI supabase, 3 archivos reales): tool de lectura
  `ficha_cliente(texto|id)` con **lista blanca dura**: devuelve operativos (ultimas citas, servicio, gasto
  acumulado real de cobros, frecuencia, ticket, etiquetas NO reservadas) + `riesgo_no_show` + el booleano
  `tiene_notas_salud` **SIN el contenido** (alergias/notas/sensibilidades se leen solo para derivar el flag
  y se descartan; nunca viajan). `assertSinCamposProhibidos` sigue corriendo sobre el retorno. `consiente_ia=false`
  -> `encontrado:false` (invisible). Tool de escritura `recuperar_cliente` (propone->confirma -> `registrar_aviso_fuga`).
  RBAC (permisos.ts): `ficha_cliente`=`clientes.ver` (todos), `recuperar_cliente`=`bandeja.escribir` (recepcion+);
  2 tests nuevos (13/13). System prompt: guia de salud ("si tiene_notas_salud, di que hay notas en su ficha y
  enlaza; jamas inventes el contenido") + tono neutro del riesgo.
- **UI cliente:** componente reutilizable `components/clientes/RiesgoNoShowIndicator.web.tsx` (neutro, no rojo
  de alarma, solo medio/alto, tooltip "solo visible para el equipo"), montado en la ficha de Clientes
  (reemplaza las viejas pildoras No-show/Incidencias basadas solo en noshows_count por el score mas rico) y en
  el header del `DetalleCitaModal` (compact). Alerta de **fuga conectada a Chispa** via `recuperar_cliente`
  (ejecutor en `lib/chispaOps.ts`; en demo la escritura es simulada por el guardrail de `ChispaPanel`).
  **No-show inminente** integrado como senal mas del briefing (`lib/briefing.ts` `cargarNoShowInminente` ->
  `BriefingAgenda`), citas sin confirmar de MANANA de clientas de riesgo.
- **Verificado en vivo** (`/demo.html?share=1`, owner): "cuentame de Ana Ruiz" y "¿tiene alguna alergia?" ->
  el payload del edge (inspeccionado en network, 200) devuelve enlace a la ficha y **nunca** el texto de su nota
  de salud ("...sin amoniaco" no aparece en ninguna respuesta); Sofia Torres con `consiente_ia=false` -> Chispa
  no la conoce (encontrado:false). El RPC `citas_riesgo_no_show` se dispara al abrir Chispa (briefing). `npx tsc
  --noEmit` + `npm run build:web` limpios (sin `any`); `deno check` + `deno test` (13 permisos + 6 whitelist) verdes.
  Demo re-verificada intacta (0 no_show, 0 noshows>0, 0 consent-false, 0 fuga_avisos). Envio real de la propuesta
  de vuelta y plantilla WhatsApp del recordatorio de no-show inminente quedan abiertos para Alexandro.

**Registro Sesion 8-A (6 jul, HECHA):** matching SQL de lista de espera para Chispa. **SQL** (`migrations/sesion8-matching-lista-espera-ia.sql`,
aplicada en remoto 2026-07-06, advisors OK sin regresiones nuevas):
- `matching_lista_espera(p_cita_id)` (security definer, revocada a anon/public): encuentra la mejor candidata
  de lista de espera compatible con el hueco liberado (cancelación). Criterios: servicio, profesional (si exige),
  franja horaria (manana/tarde/cualquiera), fechas desde/hasta. **Priorización:** `prioridad desc, created_at asc`
  (antigüedad en lista). Devuelve metadatos completos: fidelidad (nº citas históricas), gasto acumulado,
  nombres de servicio/profesional. **Multi-tenant estricto:** deriva `negocio_id` de `auth.uid()` y verifica que
  la cita pertenece al mismo negocio. Si no hay candidatas, devuelve `candidata: null`.
- `avisar_lista_espera_candidata(p_lista_espera_id, p_cita_origen_id)` (security definer, revocada a anon/public):
  crea la cita tentativa (oferta) con `es_oferta_espera=true, canal='ia'`, marca la lista como `avisado`,
  encola el aviso en `lista_espera_avisos` (template `aviso_lista_espera`) para el motor n8n de Alexandro.
  Find-or-create de cliente por teléfono. Reutiliza `_lista_espera_ventana_texto` del motor existente.
- **Permisos:** grant a `authenticated` (staff) + `service_role` (motor n8n); revocados a `anon`/`public`.
- **Verificado en remoto:** RPCs existen con definición correcta, permisos correctos (authenticated + service_role,
  sin anon). Las tablas `lista_espera_avisos` y `lista_espera_ofertas` muestran WARN INFO de "RLS enabled no policy"
  en advisors, lo cual es esperado (son outbox solo para service_role, no necesitan policies públicas).
- **S8-B pendiente:** UI/edge/integración con Chispa (flujo cancelación -> propone "avisar a X" -> confirmar -> flag motor).

**Guia de modelo:** Opus 4.8 donde equivocarse es caro (arquitectura, seguridad/RGPD, dominio agenda,
SQL, dinero, parsing de migracion); Sonnet 5 en integraciones acotadas, lectura/analitica y
superficies repetitivas; Haiku 4.5 solo para retoques mecanicos. Esfuerzo alto solo en Opus criticas
(1,2,4,11,12); medio en el resto. Fast mode util en las Opus largas. Orden: 1->2->3 en cadena; desde
la 4 se puede paralelizar; 14 y 15 son independientes (cuidado con conflictos git multi-sesion:
stash/pull/pop rutinario).

## Prerrequisitos externos (usuario)

- **Rotar** las API keys pegadas por chat (ElevenLabs, Retell) y guardar en Supabase secrets
  (`ELEVENLABS_API_KEY`). Necesario para S5/S12.
- **DPO/abogado:** visto bueno del modelo de consentimiento antes de clientes reales (S2/S10/S13).
- **Jose:** decision sobre tarjetas regalo (estaban diferidas) antes de S14.

## Reparto Carlos / Alexandro

- **Carlos:** renderer de bloques, UI de Chispa, unificacion de persona, ejecutor general (cliente),
  retrasos con alternativas, consentimiento UI, superficies por pagina, voz in-app (micro + TTS proxy),
  migracion magica, dictado de formulas, try-on/vision, extras no-IA.
- **Alexandro:** contrato de bloques y tools en el edge (o pactado con Carlos), gating por rol,
  tools de lectura/analitica, envios reales WhatsApp/mensajes, recompra, agente telefonico
  (Retell/Zadarma), pagos.

---
---

# PROMPTS POR SESION (copy-paste)

> Uso: abre una sesion nueva de Claude Code en el repo Hairy con el MODELO indicado, pega el prompt.
> El CLAUDE.md del repo y la memoria se cargan solos; el prompt ancla el resto del contexto.

## Prompt Sesion 1 — Nucleo generativo + Chispa unificada (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 1.
Carga las skills hairy-design-system y hairy-agenda-rules antes de tocar UI.

YA EXISTE (no reconstruir; verifica con grep/git log antes de escribir nada):
- components/agenda/AsistenteAgenda.web.tsx + edge supabase/functions/agenda-asistente (LLM tool-use,
  lecturas server-side, escrituras como accion_propuesta) montado en AgendaCalendar.web.tsx (~linea 2198),
  gateado por asistenteAgendaActivo (default false en negocio_config).
- lib/agendaOps.ts (ejecutor), components/onboarding/OnboardingAgentOverlay.web.tsx (persona Chispa).

CONSTRUYE:
1) Protocolo de BLOQUES TIPADOS: el edge pasa de devolver {texto, accion_propuesta} a
   { bloques: Bloque[] } con tipos 'texto' | 'accion' | 'enlace' (grafica/listas llegan en sesiones
   posteriores; deja el union type extensible). Manten compatibilidad o migra el panel a la vez.
2) Renderer unico en components/chispa/BloqueRenderer.web.tsx: bloque.tipo -> componente. 'enlace'
   navega con router.push (chip). 'accion' reutiliza la tarjeta propone->confirma existente.
3) Unifica la persona: el asistente de agenda pasa a llamarse Chispa (misma voz/estetica que el
   onboarding, tokens fuego #f4501e/#c0260a, sin emojis). Burbuja/pestana accesible global (no solo
   Agenda), gateada por el toggle existente. Movil primero (useResponsive).
4) Enciende asistenteAgendaActivo en el tenant demo_salon_001 CON guardrails: rate-limit por sesion,
   acciones destructivas limitadas en demo; deja documentado como re-sembrar la demo.
5) Higiene de repo: gitignore de dist/, elimina la copia vieja project/uploads/Hairy/ (verifica antes
   que no la referencia nada), limpia el worktree .claude/worktrees/condescending-murdock-9b0f9d si
   esta obsoleto, revisa el stash filter-branch.

REGLAS: PR-12 (IA propone, profesional dispone: el LLM nunca ejecuta escrituras), PR02 (sin pantalla
de IA aparte), Chispa se identifica como IA, multi-tenant negocio_id en todo, sin any, comentarios en
espanol sin emojis, secrets solo en Supabase.

VERIFICA: npm run build:web && npx tsc --noEmit (ignora errores de supabase/functions, son Deno);
node scripts/serve-web.mjs y en http://localhost:8080/demo.html?share=1 comprueba que Chispa responde
con bloques (texto + un enlace que navega + una accion confirmable). Si el screenshot da timeout,
verifica por DOM (memoria: verificar-ui-en-demo-iframe).

CIERRE: commit(s) feat:/fix: + push a master; actualiza informes/MEGA_INFORME_MECHA.md y marca la
Sesion 1 como HECHA en informes/PLAN-IA-CHISPA.md. Si otra sesion empujo a master, stash/pull/pop.
```

## Prompt Sesion 2 — Seguridad: RBAC + consentimiento + salud (Opus 4.8, esfuerzo MAXIMO)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 2
(seguridad de la capa IA). Requiere la Sesion 1 hecha (bloques + Chispa global). Carga la skill
hairy-domain-data. Esta sesion es correctness-critical: no puede haber fugas.

CONSTRUYE:
1) RBAC de tools: en supabase/functions/agenda-asistente, el set de tools expuestas al LLM se filtra
   por rol derivado del JWT (lookup a profiles + logica equivalente a can() de lib/permissions.ts).
   Un Profesional sin agenda.ver_todas solo ve su profesional_id; sin acceso a informes, la tool de
   informes NI SE DECLARA al LLM. Escrituras siempre via accion propuesta + RLS del usuario.
2) Consentimiento: columna/flag consiente_ia en la tabla de clientes (migracion en migrations/ +
   aplicar via MCP). Si false: el cliente se excluye de TODO contexto ensamblado para el LLM y de los
   resultados de tools (filtro en las queries del edge). UI: toggle en la ficha de clienta.
3) REGLA DURA DE SALUD: en el ensamblado de contexto del edge, lista blanca de campos (nunca lista
   negra): SOLO nombre, telefono, historial de citas, servicios, gasto. Cualquier campo de
   salud/alergias/notas medicas JAMAS viaja al LLM. Anade un test/asercion que falle si un campo no
   permitido entra al payload.
4) Auditoria: toda conversacion registra en conversaciones_ia (RPC registrar_conversacion_ia existente).

REGLAS: tras la migracion pasa los advisors de Supabase (security) y corrige lo que salga. RPC nueva
sin grant a anon salvo necesidad explicita. Multi-tenant negocio_id. Sin any.

VERIFICA (las 3 obligatorias): (a) con un usuario rol Profesional, Chispa rechaza/ignora preguntas de
informes; (b) una clienta con consiente_ia=false no aparece en ninguna respuesta de Chispa; (c)
inspecciona el payload real enviado al LLM (log temporal) y confirma que no viaja ningun campo de
salud. Valida en demo (/demo.html?share=1).

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 2 HECHA en el plan. El visto bueno
DPO/abogado del modelo de consentimiento queda anotado como pendiente externo del usuario.
```

## Prompt Sesion 3 — Accion universal + confirmar citas pendientes (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 3.
Requiere Sesiones 1 y 2. Carga hairy-agenda-rules y hairy-domain-data.

CONSTRUYE:
1) Ejecutor GENERAL de acciones: evoluciona lib/agendaOps.ts a lib/chispaOps.ts (o modulo que lo
   englobe) con acciones nuevas ademas de las existentes: confirmar_citas (batch: propuesta->
   confirmadas), editar_horario, editar_servicio, crear_presupuesto (backend de presupuestos ya
   existe), enviar_mensaje_bandeja (crea el borrador/registro; el envio real WhatsApp es de Alexandro
   — dejalo claramente stubbed/flag). Todas con validacion server-side de args en el edge y tarjeta
   accion propone->confirma.
2) "Confirmame las citas de manana": tool + accion batch con lista de citas afectadas en la tarjeta.
3) CIERRA LAS FALLAS DETECTADAS (seccion "Fallas de coherencia" del plan):
   (a) auditoria: verifica si algun trigger escribe en citas_historial cuando la IA ejecuta; si no,
   el ejecutor inserta el rastro (igual que el flujo manual);
   (b) reagendar_cita via IA: verifica si el motor n8n cron-pull detecta el reagendado y avisa al
   cliente; si no, marca el flag de aviso correspondiente;
   (c) cambiar_config: sustituye el read-merge-write por merge por clave o RPC atomica.

REGLAS: PR-12 estricto (LLM nunca ejecuta), RLS + can() en toda escritura, multi-tenant, sin any.

VERIFICA en demo: "confirmame las citas de manana" -> tarjeta con la lista -> Confirmar -> estados
pasan a confirmada y la agenda se refresca; "sube el precio del corte a 15" -> tarjeta -> aplicado en
el catalogo; el historial de la cita muestra el rastro de la accion IA.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 3 HECHA en el plan.
```

## Prompt Sesion 4 — Retrasos con alternativas + duracion real (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 4.
Requiere Sesiones 1 y 3. CARGA OBLIGATORIAMENTE la skill hairy-agenda-rules (fases activa/reposo/
transicion, tiempos muertos productivos, cadenas multiprofesional) y lee
docs/superpowers/specs/2026-06-18-retrasos-encadenados-design.md.

YA EXISTE: lib/retrasos.ts (motor puro de cascada: calcularCascada, proponerRetrasoPorCita,
proponerRetrasoProfesional, construirUpdatesRetraso — desplaza inicio/fin/fin_activa/fin_espera el
mismo delta) + components/agenda/RetrasoPropuestaModal.web.tsx + disparadores en AgendaCalendar.web.tsx.
Hoy la unica estrategia es "empujar todo en cascada".

CONSTRUYE (funciones PURAS y testeadas en lib/retrasos.ts, como las existentes):
1) Estrategias alternativas de resolucion de retraso, cada una con su propuesta comparable:
   (a) mover UNA cita afectada a otro hueco libre del mismo dia (mismo profesional u otro compatible);
   (b) encajar la espera en el REPOSO de otra cita (tiempos muertos productivos — respetando que
   activa-sobre-activa es solape real y activa-sobre-reposo es valido);
   (c) proponer "pedir al siguiente cliente venir X min mas tarde" (genera el aviso, motor WhatsApp).
2) UI: el modal de retraso pasa a ofrecer 2-3 estrategias comparadas (cuantas citas se mueven, cuanto
   se retrasa el cierre) y el usuario elige; integra tambien la eleccion como bloques de Chispa.
3) Duracion real aprendida por clienta: funcion que, del historial de citas de esa clienta+servicio,
   calcula la duracion real tipica; al crear cita, si difiere del catalogo, proponer la real
   (sugerencia visible, no imposicion). Sin migracion si es derivable de citas.
4) Anti-solape inteligente al arrastrar: al soltar una cita sobre conflicto, ofrecer la mejor
   alternativa valida en vez de solo bloquear.

REGLAS: jamas romper fases activa/reposo (los 4 timestamps se mueven coherentes), estados de cita de
STATUS_META/CITA_STATUS (no inventar), multi-tenant, sin any.

VERIFICA en demo: marca un retraso de 15 min en una cita con citas detras -> se ofrecen >=2
estrategias -> aplica cada una en pruebas separadas -> la agenda queda coherente (fases intactas,
sin solapes activa-activa). tsc + build.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 4 HECHA en el plan.
```

## Prompt Sesion 5 — Voz: STT + TTS ElevenLabs (Sonnet 5, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 5.
Requiere Sesion 1 (Chispa global con bloques).

PRERREQUISITO EXTERNO: el usuario debe haber puesto la key ROTADA de ElevenLabs en Supabase secrets
como ELEVENLABS_API_KEY. Si no esta, construye todo con la parte TTS detras de un flag y dejalo listo
para enchufar; NUNCA pidas ni aceptes la key por chat ni la escribas en el repo.

CONSTRUYE:
1) Boton de microfono en el panel de Chispa: SpeechRecognition (Web Speech, lang es-ES) -> texto al
   input -> flujo normal. Deteccion de soporte: si el navegador no lo soporta (Safari/iPad), fallback
   a grabacion + STT server-side (edge function que llama a ElevenLabs Scribe o Whisper via
   OpenRouter; decide por calidad/coste y documenta la eleccion).
2) TTS: edge function chispa-tts que recibe texto y devuelve audio (ElevenLabs, key en secrets, voz
   es natural del plan free). El panel reproduce la respuesta de Chispa con un toggle de "voz" y
   boton de stop. Cachea audios repetidos si es trivial.
3) A/B: modo comparacion (query param o toggle dev) entre ElevenLabs y speechSynthesis del navegador
   para que el usuario decida si paga plan superior.
4) Accesibilidad: estados visibles de escuchando/procesando/hablando; nunca auto-escuchar sin gesto.

REGLAS: transparencia (es IA), sin claims falsos, sin any, movil primero, comentarios en espanol.

VERIFICA en demo (Chrome): hablar por micro -> transcribe -> Chispa responde -> se oye la voz; en un
navegador sin Web Speech el fallback funciona o degrada con aviso claro. Revisa consola y network.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 5 HECHA en el plan.
```

## Prompt Sesion 6 — Omnisciencia/analitica (Sonnet 5, esfuerzo medio-alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 6.
Requiere Sesiones 1 y 2 (bloques + RBAC). Carga hairy-domain-data.

YA EXISTE — NO RECONSTRUIR (auditado 5 jul, hecho por Alexandro, PARCIAL): el "briefing proactivo"
(senales_sin_pagar + bandeja_sin_responder + clientes_a_recuperar + pasos de setup) via RPC
agenda_briefing/agenda_briefing_operativa + lib/briefing.ts + components/agenda/BriefingAgenda.web.tsx,
montado dentro de ChispaPanel.web.tsx. Lee su spec completa en docs/superpowers/specs/2026-07-04-
copiloto-fase3-briefing-proactivo-design.md antes de tocar nada de esto. Su propio diseno declaro
"analitica conversacional/insights" FUERA de alcance ("fase posterior") — ESO es lo que construyes tu
ahora. No dupliques el briefing; amplialo solo si hace falta integrarlo con lo nuevo.

GAP a cerrar primero (detectado en auditoria, no estaba en su alcance original): su spec (§7) exige un
toggle `briefingProactivoActivo` en Configuracion (default ON) para poder apagar el briefing por
salon — NO existe en ningun archivo, solo en el markdown. Anadelo en app/(tabs)/configuracion.web.tsx
(mismo patron que asistenteAgendaActivo) y gatea BriefingAgenda con el.

CONSTRUYE (esto SI es nuevo):
1) Tools de lectura agregada en el edge (todas gateadas por rol via el RBAC de la Sesion 2):
   resumen_caja(rango), resumen_informes(rango), ocupacion(rango), metas_progreso(), citas_hoy().
   Reutiliza las queries/RPCs que ya usan caja.web.tsx e informes.web.tsx (no dupliques logica: si
   hay que extraer, extrae a lib/ compartido).
2) Bloques nuevos del protocolo: 'grafica' y 'comparativa' (reusa los componentes de graficas de
   informes.web.tsx). "Resumeme el mes" -> texto + grafica + enlace a Informes.
3) Alertas proactivas: caida de reservas de la semana proxima vs media -> aviso con acciones
   sugeridas; deteccion de "hueco muerto cronico" (patron semanal vacio) -> sugerir promo (la accion
   de crear promo puede ser solo un enlace si no existe el mecanismo). Si tiene sentido, estas
   alertas se pueden sumar como senales mas al briefing ya existente (misma forma BriefingSignal de
   lib/briefing.ts) en vez de crear una superficie paralela.
NOTA HONESTA: gastos hoy = comisiones + coste inventario; NO presentar P&L completo (el modulo de
gastos llega en la Sesion 14). Nada de predicciones infladas: si los datos son pocos, dilo.

VERIFICA en demo: el toggle apaga/enciende el briefing existente; "cuanto llevo esta semana" -> cifra
correcta contrastada con la pantalla de Caja; "resumeme el mes" -> bloques con grafica; con rol
Profesional no hay datos globales.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 6 HECHA (reemplazando el PARCIAL) en el plan.
```

## Prompt Sesion 7 — Q&A de cliente + riesgo no-show (Opus 4.8, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 7.
Requiere Sesiones 1 y 2. Carga hairy-domain-data. OJO: aqui se toca la regla dura de salud.

YA EXISTE (5 jul, de la Sesion 6 parcial de Alexandro): RPC `marcar_cita_no_show(p_cita_id)` en prod
(security definer, revocada a anon/public, exige rol owner/admin/recepcion/direccion, solo citas
pasadas en estado confirmada/completada). Auditado: **no la llama ninguna UI todavia** — es un
enabler puro. Tu tarea incluye ANADIR el disparador (boton "no se presento" en la cita pasada, agenda
o ficha de clienta) que la invoca; sin eso el resto de esta sesion (riesgo de no-show) no tiene datos
reales que contar (hoy 0 citas se han marcado nunca como no_show).

CONSTRUYE:
1) Wire-up de marcar_cita_no_show: boton en la cita (una vez pasada su hora, estado confirmada/
   completada) "no se presento" -> llama la RPC -> refresca. Sin esto, saltate a 2 con un aviso claro
   de que el score de riesgo estara vacio hasta que se empiece a marcar.
2) Tool ficha_cliente(nombre|telefono|id) en el edge: devuelve SOLO lista blanca de campos (ultimas
   citas, servicios, gasto acumulado, frecuencia, etiquetas no sensibles). Si la clienta tiene notas
   de salud, la tool devuelve un booleano tiene_notas_salud=true SIN contenido; Chispa responde "hay
   notas en su ficha, miralas alli" con bloque 'enlace' a la ficha. consiente_ia=false -> la tool
   responde como si no existiera.
3) Riesgo de no-show: score derivado del historial (no-shows marcados con la RPC de arriba,
   cancelaciones tardias, antiguedad). Indicador discreto en ficha y en la cita (sin estigmatizar:
   tono neutro, solo visible para staff). Chispa lo usa para el aviso de "no-show inminente" (cita de
   riesgo sin confirmar manana -> sugerir recordatorio).
4) Alerta de fuga + recuperacion: la UI de fuga ya existe (cd7d810cc); conectala a Chispa: bloque
   accion "enviar propuesta de vuelta" (el envio real = Alexandro, deja el registro/borrador).

VERIFICA en demo: "cuentame de [clienta demo]" -> historial/gasto SIN ningun dato de salud (revisa el
payload al LLM); clienta con consiente_ia=false -> Chispa no la conoce; indicador de riesgo visible y
no ofensivo.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 7 HECHA en el plan.
```

## Prompt Sesion 8 — Lista de espera: matching + aviso (Opus 4.8 SQL / UI Sonnet, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 8.
Requiere Sesiones 1 y 3. Contexto: la lista de espera v1 existe (app/(tabs)/lista-espera.web.tsx) y
el motor de envio WhatsApp (n8n cron-pull) tambien; falta el MATCHING (pendiente #4 del CLAUDE.md).

CONSTRUYE:
1) Matching SQL (migracion + RPC security definer, correctness-critical): al liberarse/crearse un
   hueco (cancelacion, reagendado), encontrar candidatas de la lista de espera compatibles
   (servicio, profesional si lo exige, franja horaria pedida). Priorizacion: antiguedad en lista +
   fidelidad/valor (documenta el criterio elegido). Multi-tenant estricto.
2) Flujo: cancelacion de cita -> Chispa/panel propone "avisar a X (1a de la lista)" como bloque
   accion -> confirmar -> flag para el motor de envio (plantilla de lista de espera; si no existe la
   plantilla, deja el flag y documenta para Alexandro).
3) UI en lista-espera.web.tsx: ver matches sugeridos y estado del aviso.
Tras la migracion: advisors de Supabase y corrige lo que salga.

VERIFICA en demo: cancela una cita con lista de espera compatible -> propuesta con la candidata
correcta segun prioridad -> confirmar -> el registro queda marcado para envio.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 8 HECHA en el plan.
```

## Prompt Sesion 9 — Superficies por pagina (Sonnet 5, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 9.
Requiere Sesiones 1, 2 y 3 (renderer + RBAC + ejecutor general). Es una sesion de superficies:
reutiliza SIEMPRE el renderer de bloques y el ejecutor; no inventes infra nueva. Puedes trocearla si
se hace larga (commit por superficie).

CONSTRUYE (verifica antes en cada pantalla que no exista ya):
1) Resenas: boton "sugerir respuesta" en cada resena -> borrador con el tono del salon (editable
   antes de publicar); deteccion de sentimiento + alerta de negativa; resumen de temas recurrentes.
2) Bandeja: borrador de respuesta sugerido en el hilo; triage (etiqueta urgente/consulta/spam);
   accion "convertir en cita" y "convertir en presupuesto" (propone->confirma con el ejecutor).
3) Presupuestos: "crear presupuesto desde descripcion" (NL -> lineas+precios del catalogo real, sin
   inventar precios); sugerencia de upsell; recordatorio de seguimiento a los N dias sin respuesta.
4) Inventario: aviso de stock bajo + prediccion simple de reposicion por consumo historico; pedido
   sugerido (bloque accion que genera lista, no compra nada).
5) Equipo: resumen NL de comisiones/liquidacion del periodo (reutiliza el calculo existente de
   comisiones); deteccion de sobrecarga/huecos de cobertura.
6) Mi Jornada: "tu dia" (proxima clienta con sus ultimas notas NO sensibles, comision prevista,
   huecos propios). Todo scoped al profesional_id propio.
7) Upsell en el cobro (caja): sugerencia discreta basada en historial de la clienta.
8) Recompra predictiva: calculo de recurrencia por clienta+servicio (media de intervalos) ->
   candidatas a "toca retinte"; accion = registro para el motor de Alexandro.
Envios reales (WhatsApp/publicar resena) = Alexandro: deja borradores/flags, nunca envies tu.

VERIFICA en demo cada superficie (build + iframe pantalla a pantalla). Respeta rol en todas.

CIERRE: commits por superficie + push a master; MEGA_INFORME + marca Sesion 9 HECHA en el plan.
```

## Prompt Sesion 10 — Consentimiento cliente-facing + cierre legal (Opus 4.8, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md y ejecuta la SESION 10.
Requiere Sesion 2 (flag consiente_ia ya existe). Contexto legal del plan: reservar cubre datos
operativos (contrato + aviso privacidad); procesar SALUD con IA queda FUERA (regla dura); el opt-in
de IA debe ser explicito, separado y desmarcado por defecto (no valido escondido en los terminos).

CONSTRUYE:
1) Portal publico (/app/r/[slug]): en el flujo de reserva, aviso claro de que el salon usa asistencia
   de IA para gestion + casilla separada OPCIONAL de consentimiento IA (desmarcada por defecto; no
   bloquea la reserva). El estado va a consiente_ia de la clienta (RPC publica con anti-abuso, misma
   disciplina que crear_cita_publica; grant a anon explicito; advisors despues).
2) Pagina de autogestion (/app/cita/[id]): permitir ver y cambiar ese consentimiento.
3) Software (staff): en la ficha de clienta, estado del consentimiento visible y editable con
   registro de cuando/como se dio (auditoria minima: fecha + origen).
4) Textos legales: actualiza la politica de privacidad de web/ con el tratamiento IA (lenguaje claro,
   sin tecnicismos vacios); recuerda el gate de privacidad staff existente (memoria
   gate-politica-privacidad-jul3) y manten coherencia con el.
5) Genera informes/CHECKLIST-DPO-IA.md: lista de puntos para que el DPO/abogado valide (base legal
   por dato, flujo de consentimiento, proveedor LLM y ubicacion, retencion, derechos ARCO).
NADA de datos de salud en ningun flujo IA. Esto NO es asesoria legal: el visto bueno profesional es
prerrequisito para produccion y queda como pendiente externo.

VERIFICA: flujo de reserva en /app/r/demo con la casilla (desmarcada por defecto, reserva funciona
igual sin marcarla); cambiar el consentimiento en /app/cita/[id]; con consiente_ia=false Chispa no ve
a la clienta (regresion de la Sesion 2).

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 10 HECHA en el plan.
```

## Prompt Sesion 11 — Ventas: migracion magica + catalogo foto + Chispa landing (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 11) y
informes/DIFERENCIADORES-IA-MECHA.md (seccion A.1 y B). Gap de mercado confirmado: nadie migra desde
Booksy/Fresha con IA. Parsing correctness-critical: datos de un negocio real, no se puede corromper.

YA EXISTE: components/config/TabImportarCitas.tsx (importador manual). Usalo de base/inspiracion.

CONSTRUYE:
1) MIGRACION MAGICA: flujo en Configuracion (y enlace desde onboarding): el usuario sube CSV/Excel
   exportado de Booksy o Fresha, O una foto/PDF de su agenda o listado. Edge function
   migracion-magica: LLM con vision + structured output (JSON schema estricto) mapea a entidades
   Mecha (clientas, servicios con duracion/precio, citas futuras). SIEMPRE preview completo editable
   -> el usuario confirma -> insercion batch via la sesion del usuario (RLS). Reglas: telefonos solo
   digitos (regla del repo), duplicados detectados por telefono, NADA se inserta sin confirmar,
   validacion de tipos servidor. Maneja los formatos de export conocidos de Booksy y Fresha (columnas
   tipicas) y el caso generico.
2) CATALOGO DESDE FOTO: mismo motor, caso "foto de la lista de precios" -> servicios propuestos con
   precio/duracion -> preview -> confirmar.
3) FACTURA PROVEEDOR -> STOCK: foto de albaran -> lineas de entrada de inventario (inventario v0
   existe) -> preview -> confirmar.
4) CHISPA EN LA LANDING (web/ estatica): widget de chat en index.html que responde preguntas de
   prospectos con RAG sobre los manuales existentes y especificaciones.html (edge function publica
   con rate-limit por IP y anti-abuso, misma disciplina que las RPC publicas; se identifica como IA;
   sin claims falsos ni cifras inventadas; escala a "reserva una llamada" -> reservar.html).
5) CTA en la landing: "Cambiate desde Booksy o Fresha en 10 minutos" enlazando al flujo (respeta el
   estilo de landing: menos texto, mas visual — memoria landing-copy-style).

VERIFICA: CSV de prueba estilo Booksy y estilo Fresha -> preview correcto -> importa en demo; foto de
una lista de precios -> catalogo propuesto; el chat de la landing responde 3 preguntas reales del
manual y rechaza salirse de tema. Advisors tras cualquier migracion SQL.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 11 HECHA en el plan.
```

## Prompt Sesion 12 — Vertical color: dictado de formulas + traductor (Opus 4.8, esfuerzo alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 12) y
informes/DIFERENCIADORES-IA-MECHA.md (A.2 y A.4). Requiere Sesion 5 (voz). Gap de mercado confirmado:
nadie une voz + IA + ficha tecnica durante el servicio. Carga hairy-domain-data (ficha tecnica de
color, Modular 2: formulas, tonos, tiempos de exposicion).

CONSTRUYE:
1) DICTADO MANOS-LIBRES: boton grande "dictar formula" en la ficha tecnica de color de la clienta
   (pantalla Clientes) y accesible desde la cita en curso. La profesional habla ("40 gramos de 7.1
   con 20 volumenes, 35 minutos, raices primero") -> STT (infra Sesion 5) -> LLM parsea a estructura
   de formula (producto/tono/gramos/oxidante/tiempos/notas) con JSON schema -> preview editable ->
   confirmar -> guardado en la ficha. UX manos sucias: botones enormes, feedback sonoro/visual claro,
   reintento facil. Tolerante a jerga real de peluqueria (7.1, "veinte volumenes", nombres de marcas).
2) TRADUCTOR ENTRE MARCAS: en la ficha de formula, accion "traducir a otra marca" (Wella <->
   Schwarzkopf <-> L'Oreal etc.): el LLM propone equivalencia con AVISO claro de "orientativo,
   verifica con tu carta de color" (sin claims de exactitud). Guardable como formula alternativa.
3) Notas post-servicio por voz: mismo motor, campo notas de la cita.
REGLA DURA: las formulas de color NO son datos de salud, pero si la profesional dicta algo de
alergias/salud, ese contenido NO se guarda via LLM en campos IA-visibles: detectalo y redirige a "las
notas de salud van en su ficha, a mano" (el campo de salud queda fuera del flujo IA, Sesion 2).

VERIFICA en demo: dicta 3 formulas reales variadas -> estructura correcta -> guardadas en la ficha;
traduccion propone equivalencia con el disclaimer; una frase con mencion de alergia NO acaba guardada
por el flujo IA.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 12 HECHA en el plan.
```

## Prompt Sesion 13 — Vision: try-on + Instagram + "quiero este corte" (Sonnet 5, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 13) y
informes/DIFERENCIADORES-IA-MECHA.md (A.3, C.9, C.10). Requiere Sesiones 1 y 10 (consentimiento).
Contexto: las fotos de clientas viven en el bucket PRIVADO cliente-fotos con createSignedUrls (regla
del repo: jamas getPublicUrl).

CONSTRUYE:
1) TRY-ON DE COLOR (v1 foto estatica): en la consulta (ficha de clienta o cita), subir/elegir foto ->
   edge function que llama a una API de hair try-on (evalua LightX vs Segmind: coste, calidad,
   privacidad — LightX borra inputs en 24h, documenta la eleccion; key en Supabase secrets, pide al
   usuario crearla como secret ANTES, nunca por chat) -> muestra 3-6 tonos -> el elegido se guarda en
   la ficha tecnica + enlace directo a reservar el servicio de color. Consentimiento: solo con
   consiente_ia=true y aviso claro de que la foto se procesa por un tercero.
2) ANTES/DESPUES -> INSTAGRAM: en la ficha/cita con fotos antes+despues, accion "crear post":
   composicion (collage simple client-side) + caption generada con el tono del salon -> descargar/
   copiar (NO publicar automaticamente). Solo con consentimiento de la clienta registrado.
3) "QUIERO ESTE CORTE": en recepcion/cita, subir foto de referencia -> LLM vision la mapea a
   servicios del catalogo real + duracion estimada -> propuesta de cita (propone->confirma). Sin
   inventar servicios que no existan.

VERIFICA en demo: try-on con una foto de prueba (no real) -> tonos renderizados -> guardado en ficha;
post generado descargable; foto de un corte -> servicios correctos del catalogo demo. Sin
consentimiento -> los flujos de foto se bloquean con explicacion.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 13 HECHA en el plan.
```

## Prompt Sesion 14 — Negocio no-IA: bonos, gift cards, propinas, gastos (Opus 4.8, esfuerzo medio-alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 14). Independiente de
las sesiones IA. Carga hairy-domain-data (Modular 5: caja, tickets, arqueo; cuenta familiar; "a
deber"). AVISO: tocas dinero — correctness-critical, verifica el motor de cobro unificado existente
(memoria pos-caja-estrategia: POS-0/1 + walk-in completos) antes de anadir nada.

DECISION PREVIA: tarjetas regalo estaban "diferidas" en el backlog — pregunta al usuario si Jose ya
dio el OK antes de construir esa parte; si no, salta gift cards y haz el resto.

CONSTRUYE (verifica primero que no exista):
1) BONOS/PAQUETES PREPAGADOS: entidad bono (N sesiones de servicio X, precio, caducidad opcional)
   -> venta por Caja (cobro normal), consumo al cobrar una cita (descuenta sesion en vez de dinero),
   saldo visible en ficha de clienta y en el cobro. Migracion + RLS multi-tenant + advisors.
2) PROPINAS: campo propina en el cobro (imported/manual), separado de la base imponible en el ticket
   (SIN logica fiscal nueva: solo registro separado), reparto al profesional visible en Mi Jornada y
   en comisiones/liquidaciones como concepto aparte.
3) MODULO DE GASTOS SIMPLE: tabla gastos (concepto, categoria fija simple: alquiler/suministros/
   producto/otros, importe, fecha, recurrente s/n) + CRUD en Caja o Informes + integracion en
   Informes para margen aproximado (etiquetalo "aproximado"; NADA de pretension contable/fiscal).
4) (Solo con OK de Jose) TARJETAS REGALO: importe prepagado con codigo, venta en Caja, redencion como
   metodo de pago parcial/total, saldo consultable. Codigos no adivinables, sin exponer a anon.

VERIFICA en demo: vender un bono -> cobrar una cita consumiendo sesion -> saldo baja; propina
registrada y visible en liquidacion; gasto creado aparece en el margen de Informes. tsc + build +
advisors tras migraciones.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 14 HECHA en el plan.
```

## Prompt Sesion 15 — Operativa no-IA: recurrentes, cumpleanos, festivos... (Opus/Sonnet, esfuerzo medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA.md (Sesion 15). Independiente de
las sesiones IA. Carga hairy-agenda-rules para el punto 1 (citas recurrentes tocan el dominio mas
delicado: usa Opus 4.8 o maximo cuidado).

CONSTRUYE (verifica primero que no exista cada una):
1) CITAS RECURRENTES: al crear cita, opcion "repetir cada N semanas, M veces" -> genera la serie
   validando solapes/horarios cada instancia (las conflictivas se proponen en el hueco valido mas
   cercano, preview antes de crear). Editar/cancelar: "solo esta" o "esta y siguientes". Sin RRULE
   complejo: N semanas fijas es suficiente (YAGNI).
2) CUMPLEANOS: campo fecha_nacimiento opcional en clienta (si no existe) + flag para el motor
   WhatsApp (felicitacion + descuento opcional configurable); el envio real = Alexandro, deja el
   flag/plantilla documentada.
3) FESTIVOS/CIERRES DE SALON: cierres de dia completo a nivel negocio (hoy los bloqueos son por
   profesional): entidad cierres_negocio -> la agenda pinta el dia como cerrado y el portal publico
   no ofrece huecos ese dia (verifica disponibilidad_publica).
4) FUSIONAR CLIENTAS DUPLICADAS: deteccion por telefono/nombre similar + flujo de fusion (elegir
   registro maestro, mover citas/cobros/consentimientos, borrar duplicado). Transaccional via RPC.
5) EXPORT RGPD: exportar los datos de una clienta (JSON/CSV) desde su ficha (derecho de
   portabilidad); y export completo del negocio desde Configuracion (anti lock-in, argumento de venta).
6) MULTI-IDIOMA DEL PORTAL: reutiliza lib/appI18n.ts para /app/r/[slug] (recuerda la trampa: la demo
   publica va SIEMPRE forzada a 'es' — memoria demo-nav-idioma-fix-jul3).

VERIFICA en demo: serie recurrente creada con conflictos resueltos; dia festivo cerrado en agenda y
sin huecos en /app/r/demo; fusion de duplicadas conserva el historial; export descarga. Advisors tras
migraciones.

CIERRE: commit + push a master; MEGA_INFORME + marca Sesion 15 HECHA en el plan.
```
