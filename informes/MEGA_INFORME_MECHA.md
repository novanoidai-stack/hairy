# 🔥 MEGA INFORME MECHA — La foto real, sin maquillaje

> ## ⚠️ ANTES DE CADA SESIÓN: `git pull`
> Este repo se toca desde **varios ordenadores** (Carlos, Alexandro) y **producción
> despliega desde `master`**. Antes de empezar a trabajar o de tocar nada, **siempre**:
> ```bash
> git pull origin master
> ```
> Y al terminar una tanda, `git push origin master`. Así nadie pisa el trabajo de otro
> ni despliega sobre una base desactualizada. (Si hay cambios sin commitear, `git stash`
> antes del pull.) Lo mismo aplica a la BD: el **historial remoto de Supabase manda**;
> no asumir que una migración del repo está aplicada sin comprobarlo.

> **Fecha:** 10 de junio de 2026
> **Autores:** Carlos + Claude
> **Sustituye a:** `INFORME_MAESTRO_MECHA.md` (8 jun) — quedó obsoleto en 48 horas: 9 de sus 14 tareas "pendientes" ya están hechas (§2).
> **Método:** lectura directa del código a fecha de hoy + **pruebas en vivo** (demo real navegada en viewport móvil 375px) + **auditoría de la base de datos de producción** (advisors de Supabase + SQL directo). Donde se afirma algo, hay evidencia: archivo, línea, captura o consulta.
> **Qué tiene este informe que no tenía el anterior:** auditoría de seguridad real (con 2 vulnerabilidades críticas encontradas **y ya corregidas hoy**, §4), auditoría móvil con evidencia visual (§5), contraste contra los documentos del socio (dossier de requisitos + módulos M-CJ y capa IA, §6), y la especificación exacta de la "base lista para Alexandro" (§7).

---

## 0. Cómo leer esto

| Sección | Qué responde |
|---|---|
| §1 | ¿Dónde está Mecha HOY de verdad? (resumen ejecutivo) |
| §2 | Lo que el informe del día 8 daba por pendiente y ya está hecho |
| §3 | Lo que sigue faltando de verdad (gaps confirmados) |
| §4 | Seguridad: lo que encontramos, lo que ya se corrigió, lo que queda |
| §5 | Móvil: qué está roto exactamente, pantalla a pantalla |
| §6 | Contraste contra los documentos del socio (¿cumplimos lo innegociable?) |
| §7 | La base para Alexandro: qué existe, qué falta, contrato exacto |
| §8 | Pagos: diseño propuesto (señal online + QR en el local) |
| §9 | Riesgos que nadie está mirando (legal, SEO, abuso) |
| §10 | Roadmap a producción, priorizado y con criterio |
| §11 | Decisiones pendientes para Jose |

---

## Adenda — Capa IA "Chispa" Sesion 1 (5 jul 2026, Carlos + Claude)

Nucleo generativo de la capa de IA transversal (plan `informes/PLAN-IA-CHISPA.md`, Sesion 1 HECHA):

- **Protocolo de bloques tipados.** El edge `agenda-asistente` pasa de `{ texto, accion_propuesta }` a
  `{ bloques: Bloque[] }` con tipos `texto | accion | enlace` (union extensible para grafica/listas
  futuras) en `lib/chispaBloques.ts`. Mantiene `texto`/`accion_propuesta` planos en la respuesta para
  no romper clientes ya desplegados durante el rebuild de Vercel (cutover sin ventana rota).
- **Renderer unico** `components/chispa/BloqueRenderer.web.tsx`: `enlace` = chip que navega con
  `router.push` validado contra una allowlist de rutas (`CHISPA_RUTAS`, el LLM elige clave, el edge
  valida); `accion` = tarjeta propone->confirma (PR-12, el LLM nunca ejecuta); `texto` = burbuja.
- **Persona unificada "Chispa".** Mascota compartida `components/chispa/ChispaMascota.web.tsx` (la usan
  onboarding y el asistente); el asistente de agenda se renombra a Chispa (se identifica como IA, tokens
  fuego, sin emojis). Burbuja/pestana **global** via `components/chispa/ChispaLauncher` montada en
  `app/_layout.tsx` (gateada por `asistenteAgendaActivo`, fuera de rutas publicas/login), disponible en
  TODA la app y no solo en Agenda (PR02). Se quito el montaje local de `AgendaCalendar.web.tsx`; el
  refresco de la agenda tras una accion va por `useCalendarRefresh`.
- **Demo encendida con guardrails.** `asistenteAgendaActivo=true` en `demo_salon_001`. En modo demo el
  confirm es **simulado** (no se ejecuta ninguna escritura real: se ve el flujo entero sin ensuciar el
  tenant compartido) + rate-limit de 15 mensajes por sesion. Verificado en `/demo.html?share=1`: Chispa
  responde texto + enlace que navega a Clientes + accion confirmable, y confirmar en demo deja 0 citas
  nuevas en BD. Re-siembra: si la demo se ensucia por otras interacciones, re-sembrar `demo_salon_001`.
- **Higiene de repo.** `dist/` ignorado; copia vieja `project/uploads/Hairy/` eliminada (+ exclude en
  `tsconfig`); worktree obsoleto `condescending-murdock-9b0f9d` podado tras **capturar su fix RLS no
  mergeado** (`categorias-servicio` demo_block a RESTRICTIVE; la BD de produccion ya lo tenia aplicado,
  solo faltaba el archivo en `master`); refs de `filter-branch` y una entrada de stash basura limpiadas.
- **Multi-sesion.** La Sesion 2 (RBAC de tools + consentimiento `consiente_ia` + regla dura de salud)
  corrio en paralelo y su codigo ya convive en el edge (`permisos.ts`, `whitelist.ts`, `resumen_informes`,
  filtrado por consentimiento). Su verificacion formal (gating de informes, exclusion por consentimiento,
  auditoria del payload al LLM) y los advisors quedan como cierre de la Sesion 2. `npm run build:web` y
  `npx tsc --noEmit` limpios.

---

## Adenda — Tanda 24 jun 2026 (Carlos + Claude)

> **En árbol de trabajo, SIN commitear** (rama `master`, pendiente OK de Carlos). Verificado
> por DOM dentro del iframe de `/demo.html?share=1` a 375px (el `preview_screenshot` se cuelga
> por el rAF de DemoSpotlight). `tsc` y `npm run build:web` limpios, sin errores de consola.

**¿Hay POS? Sí.** Aclaración de estado (no cambió esta tanda): la pantalla **Caja ES el POS
operativo**. POS-0 (botón **Cobrar** desde la cita → `cobros`+`cobro_lineas`, método/propina/
descuento, descuenta señal, `origen:'pos'`, marca `citas.cobrada`) y POS-1 (pantalla Caja: cobro
de pendientes vía `crear_cobro_desde_cita`, **arqueo del día**, **fichajes**, **estimado vs
cobrado** en Informes, CSV) siguen **COMPLETO**. Falta **POS-2** = cobro electrónico real en el
local (Stripe Terminal/datáfono integrado/QR de mostrador) — hoy efectivo/datáfono son **etiqueta**,
el dinero se mueve fuera; el cobro online existe solo para la **señal** al reservar (Alexandro). Y
**POS-3** = fiscalidad (VeriFactu, ticket/factura legal) — fiscalista. Hasta P3: "recibo/comprobante",
nunca "factura".

**Barrido móvil del software (sección 2 del HANDOFF-2026-06-23):**
- **Informes** (`app/(tabs)/informes.web.tsx`): contenido compactado en móvil (contenedor de scroll
  `14px 14px 96px` con clearance de tab bar, valor KPI 22→18, `SectionHeader`/`SectionBody`/
  `BarHorizontal` y gaps de sección reducidos).
- **Equipo** (`app/(tabs)/equipo.web.tsx`): listado y panel de detalle con `padding-bottom: 88px`
  (el último card ya no queda bajo la tab bar).
- **Caja** (`app/(tabs)/caja.web.tsx`): **arreglado el scroll en móvil** — usaba `minHeight:100vh`
  sin dueño de scroll → reestructurada a flex column + contenedor `overflowY:auto` con
  `padding-bottom:96px`, + `useResponsive`.
- **Agenda** (`components/agenda/AgendaCalendar.web.tsx`): (1) **filtros Día/Semana/Mes plegables en
  móvil** (`toolbarCollapsed` arranca colapsado <768 + chip "Filtros/Ocultar" ya visible en móvil);
  (2) **mini-calendario** endurecido contra overflow (`maxHeight:calc(100dvh-32px)`+scroll; no se
  reprodujo el "corte" a 375/360); (3) **"Ver todos" los profesionales** (opción en el selector +
  barra dedicada; el grid ya scrollea en horizontal con varias columnas a 160px; el auto-revert a un
  prof ahora solo corre en la 1ª carga); (4) **servicio deseleccionable** (toggle off — era el "color
  de raíz" pegado); (5) **cita anónima "Sin cliente"** (chip opt-in; la validación permite `cliente_id`
  nulo, el insert ya hacía `|| null`).

**Pendiente:** re-sembrar el tenant demo `demo_salon_001` (agenda con pocas citas). Cobro anónimo no
verificado E2E con guardado real (para no ensuciar la demo compartida; la columna `cliente_id` es
nullable y ya hay citas "Sin cliente"). Pulir display de cita anónima en el timeline (hoy "—").

**"Mi jornada" — panel personal por profesional (NUEVO, Carlos):** vista por rol para que el empleado
deje de ver la Caja del salón y tenga su propio seguimiento. Spec en
`docs/superpowers/specs/2026-06-24-mi-jornada-panel-profesional-design.md`.
- **Página nueva** `app/(tabs)/mi-jornada.web.tsx` en el nav principal (Sidebar + bottom-tab) para
  todos los roles: fichaje propio (mudado desde Caja), selector Hoy/Semana/Mes, y métricas propias
  (citas completadas con lista, tintes/color, horas trabajadas, cobrado, propinas, ticket medio, y
  comisión opcional).
- **RPC** `mi_jornada_resumen(p_desde,p_hasta)` `security definer` (`migrations/mi-jornada-resumen-rpc.sql`,
  aplicada): resuelve `auth.uid()` → `profesionales.profile_id`, agrega la actividad y **gatea el
  dinero/comisión en el servidor** según `negocio_config` (no solo en UI). Revocada a `anon`. Advisors
  sin nuevos hallazgos (solo el patrón ya conocido de funciones definer ejecutables por authenticated).
  Verificado por impersonación SQL: empleado con flag OFF → sin importes (`total:null`), con ON → `8800`.
- **Vínculo cuenta↔ficha** en Equipo (`equipo.web.tsx`): selector "Cuenta de acceso" en la ficha
  (vincula `profile_id` o **invita** reusando la edge function `crear-acceso-empleado`) + badge
  **"Sin cuenta"**. El alta de empleados ya existía (Config → Accesos y roles). 2 badges verificados en demo.
- **Config** (`configuracion.web.tsx` → Comisiones): toggles `mi_jornada_mostrar_importes` (ON) y
  `mi_jornada_mostrar_comision` (OFF) en `negocio_config.config` (claves snake_case que lee la RPC).
- **Caja** (`caja.web.tsx`) queda **solo para gestores** (Sidebar `cap:'config.ver'`); se le quitó el
  fichaje personal y conserva "Jornada del equipo" (supervisión + CSV). El **bottom-tab móvil**
  (`_layout.tsx`) ahora **gatea por rol** (el empleado ya no ve Caja/Equipo/Informes/Ajustes).
- **Demo:** `demo_salon_001` no tiene cuentas de empleado; se vinculó la ficha "Maria Garcia" a
  `demo.publico` + fichaje y cobros de hoy para poder enseñarlo. Idempotente y checkeado en
  `migrations/demo-mi-jornada-seed.sql` (incluir al re-sembrar).
- **Ojo (corrección):** `cobros.profesional_id` en el remoto es **uuid** (la migración vieja
  `pos-caja-modelo-datos.sql` decía `text`). El historial remoto manda.
- Verificado en navegador (demo iframe 375px y desktop): Mi jornada de Maria carga sin errores de
  consola, selector de periodo refetchea, lista de citas con badge "Color". Filtros de la agenda
  **confirmados colapsables en móvil** (Filtros ⇄ Ocultar). `tsc` 0 errores, `build:web` OK.

---

## Adenda — Tanda 19 jun 2026 (Carlos + Claude)

Desplegado a `master` (producción) en esta sesión:

- **Quick wins:** servicio puntual REAL en la web (botón en la cita + sección en
  Configuración; la migración previa apuntaba a una tabla `services` inexistente y
  nunca se aplicó → arreglado, `es_puntual` en `servicios`). Slider de tiempos
  activo/reposo fluido en móvil (`touch-action:none` + captura de puntero). Tildes
  del correo de recuperación (requiere redeploy del edge `send-reset` por Alexandro).
  `especificaciones.html` actualizada (servicio puntual + estado real de señal Stripe
  y WhatsApp). Fix de tipos en `clientes.web.tsx`.
- **Demo / tutoriales:** tour **cinemático** (título con gradiente + explicación sobre
  la zona oscura del spotlight, sin tarjeta; móvil = banda inferior tipo subtítulo, no
  tapa el centro; controles fijos). **Dos tutoriales con "play"** (Recorrido /
  Configuración, lanzables por separado). El tutorial de config ya muestra título +
  explicación (antes solo título).
- **Compartir:** modal rediseñado liderando con la recompensa (−40% para ti / −15%
  para quien entra), menos texto; el botón ya sugiere el descuento.
- **Portales móvil:** arreglado el grid de valoración del portal de reseña que se
  recortaba en móvil (el de reserva ya estaba bien).
- **POS-0 (caja operativa, NO fiscal) — Carlos:** modelo de datos `cobros` +
  `cobro_lineas` + `fichajes` + `citas.cobrada/cobro_id` con RLS multi-tenant (advisors
  limpios). Botón **Cobrar** en la cita → modal (servicio, descuento, propina, total,
  método como etiqueta efectivo/datáfono/bizum) que registra el cobro y marca la cita
  "Cobrada". Nomenclatura "comprobante · no es factura".
- **POS-1 (Caja) — Carlos:** arreglada la pantalla **Caja** (estaba ROTA: consultaba
  columnas inexistentes —`fecha`, `cita_servicios`, `clientes.apellidos`— y un RPC que no
  existía, y mostraba importes 100× mal tratando euros como céntimos). Ahora lista las
  citas de hoy pendientes con el esquema real, cobra vía RPC `crear_cobro_desde_cita`
  (security definer, comprueba negocio, descuenta señal, solo `authenticated`) y muestra
  el **arqueo del día** (cobrado hoy total + efectivo/datáfono + propinas). Verificado E2E.
- **POS-1 (fichajes + informes) — Carlos:** **fichaje** de jornada en la pantalla Caja
  (entrada/salida del usuario + registro del día, tabla `fichajes` con RLS) e
  **interruptor "estimado vs cobrado"** en Informes: cuando hay cobros del periodo, el
  KPI muestra "Ingresos (estim.)" + "Cobrado (real)" del libro de `cobros` (el hueco
  previsto-vs-cobrado). Verificado E2E. **POS-1 COMPLETO.** Queda POS-2 (cobro
  electrónico/Stripe Terminal) = Alexandro, y POS-3 (fiscalidad/VeriFactu) = fiscalista.

**Pendiente (próxima tanda):**
- **Pulido demo:** enfoque más fino en el tutorial de config (señalar la pestaña del
  menú, no solo el panel) y afinar el velo cinemático en escritorio.
- Sigue pendiente (manual): rotar credenciales Google de `Documentacion/n8n/`, activar
  "Leaked password protection" en Supabase Auth, DNS de `mecha.app` y Meta a producción.

---

## 1. Resumen ejecutivo

### 1.1 La frase
Mecha ya **no tiene el "agujero nº1"** que diagnosticaba el informe anterior: el cliente final **ya puede reservarse solo** por el portal público, con QR, reseñas y lista de espera. El producto ha pasado en dos días de "gestión interna excelente, cara al cliente inexistente" a "gestión interna excelente, cara al cliente v1 funcional". Lo que separa a Mecha de producción ya no es funcionalidad de software: es **(a) dinero** (cero pasarela de pago, cero caja — el módulo con más spec del socio y 0% de código), **(b) el motor de mensajería/IA** (todo lo que envía algo al exterior), **(c) calidad móvil del software** (la web app se rompe en pantallas <768px en agenda e informes), y **(d) madurez operativa** (anti-abuso del portal público, fiscalidad, RGPD real).

### 1.2 Estado por área (corregido a 10 de junio)

| Área | Estado real | Nota |
|---|---|---|
| Agenda / reservas interno | **~95%** | Sin cambios; sigue siendo lo mejor del producto |
| Clientes / CRM | **~95%** ⬆ | + bloqueo de clientes, etiquetas manuales, consentimientos RGPD, fidelización v1 |
| Informes | **~80%** ⬆ | + gráficos de tendencia (C4 hecho) |
| Configuración | **~90%** ⬆ | + sección Reserva online funcional con slug y QR |
| **Portal de reserva pública** | **~75%** ⬆⬆ | ERA 0%. Hecho: flujo completo de 6 pasos, RPCs seguras, QR. Falta: anti-abuso, cancelar/modificar por el cliente, señal real (Stripe) |
| Reseñas | **~70%** ⬆⬆ | ERA 0%. Captura pública + media en portal. Falta: moderación y disparo post-cita (motor) |
| Lista de espera | **~85%** ⬆⬆ | **HECHO**: matching automático completo (motor `procesar_lista_espera()`), outbox de avisos, citas tentativas. OFF por defecto; falta activar workflow n8n (pendiente plantillas Meta). Guía: `docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md` |
| Comisiones | **~80%** ⬆⬆ | **HECHO**: sistema de liquidaciones con persistencia (`comisiones`, RPCs cálculo/generación/consulta), UI en Informes (`LiquidacionesSection`). Modelos avanzados (tramos, por categoría) en BD. |
| Fidelización | **~75%** ⬆⬆ | **HECHO**: sistema de recompensas persistente (`recompensas`, `recompensas_canjeadas`, `niveles_fidelizacion`, `logros`, `logros_desbloqueados`), RPCs (`obtener_recompensas_negocio`, `canjear_recompensa`, `verificar_logros_cliente`), UI en Configuración (`TabRecompensas`). |
| **Pagos / caja** | **0%** | Sin cambios. Ni Stripe en package.json. El doc M-CJ del socio (14 págs) está 0% implementado |
| Recordatorios / mensajería | **~15%** | UI de config lista; cero envío real. **Bloquea el valor de waitlist y reseñas** |
| IA (voz + WhatsApp) | **~20% de base** | No es 0: las RPCs públicas son la mitad del contrato que necesita Alexandro (§7) |
| Responsive móvil del software | **~55%** | Clientes/Ajustes bien; Agenda/Informes rotos en <768px (§5) |
| Seguridad | **Hoy: sólida** | 2 críticas encontradas y corregidas hoy (§4). Quedan medias |

### 1.3 Las tres verdades incómodas

1. **El software cobra protagonismo que la caja no respalda.** La landing promete "cobra el depósito por Stripe" y el portal dice "te indicaremos cómo abonar la señal"… y no existe ni una línea de integración de pago. El módulo de caja es además el de mayor responsabilidad fiscal (VeriFactu, tickets inmutables) según el propio socio. Es el gap más caro de cerrar y nadie lo tiene asignado con fecha.
2. **Hasta hoy, cualquier persona del mundo podía vaciar dos tablas de la base de datos de producción sin login** (§4.1). Está corregido, pero la lección es: cada migración nueva necesita pasar el linter de Supabase antes de mergear. La velocidad de estos días (9 features en 2 días) es admirable y peligrosa a la vez.
3. **El producto de verdad es la web y la web se rompe en el móvil justo donde más duele**: la agenda (la pantalla que el peluquero mira 50 veces al día) y los informes (la pantalla que el dueño enseña). Booksy y Fresha son mobile-first; nuestra primera impresión en un móvil es una cabecera con iconos montados encima del título (§5.2).

---

## 2. Corrección al informe del día 8 (qué se hizo ya)

El informe maestro asignaba a Carlos 14 tareas (C1–C14). Estado real hoy, verificado en git y código:

| Tarea | Informe día 8 | Realidad 10 jun | Evidencia |
|---|---|---|---|
| C1 Reserva online pública ⭐ | "pendiente, L (8–12 d)" | ✅ **HECHA** | `app/r/[slug].web.tsx` (595 líneas), `migrations/portal-reserva-publica.sql`, commit `1a677a9` |
| C2 Lista de espera | pendiente | ✅ HECHA (v1 interna) | `app/(tabs)/lista-espera.web.tsx`, `migrations/lista-espera.sql`, commit `1057d46` |
| C3 Reseñas | pendiente | ✅ HECHA (captura + media en portal) | `app/resena/[slug].web.tsx`, `migrations/resenas.sql`, commits `95d142e`, `d02e9a7` |
| C4 Gráficos de tendencia | pendiente | ✅ HECHA | commit `d02e9a7` |
| C5 Bloquear clientes | pendiente | ✅ HECHA | `migrations/bloquear-clientes.sql`, commit `cf23d3a` |
| C6 Etiquetas manuales | pendiente | ✅ HECHA | `migrations/etiquetas-clientes.sql`, commit `d02e9a7` |
| C7 Consentimientos RGPD | pendiente | ✅ HECHA | commit `a495cf6` |
| C10 QR del portal | pendiente | ✅ HECHA | en `configuracion.web.tsx` (sección Reserva online), commit `1057d46` |
| C11 Fidelización (tarjeta) | pendiente | ✅ HECHA (v1) | commit `a495cf6` |
| C8 Buffer entre citas | pendiente | ❌ pendiente | — |
| C9 Recursos / salas | pendiente | ❌ pendiente | — |
| C12 Multi-location UI | pendiente | ❌ pendiente | — |
| C13 Paridad web↔nativo | continuo | ❌ pendiente (y ha crecido: las 4 pantallas nuevas no tienen versión nativa real) | `app/r/[slug].tsx` = 19 líneas stub |
| C14 Consolidar design tokens | pendiente | ❌ pendiente (y ha crecido: `app/r/[slug].web.tsx:12` redefine `const T = {...}` otra vez) | — |

**Lección operativa:** los informes estáticos caducan en días. Este informe incluye método (linter de seguridad, prueba móvil) para re-auditar en 30 minutos, no solo conclusiones.

---

## 3. Gaps reales confirmados hoy

**Dinero (el bloque entero):**
- Stripe / pasarela ❌ (no está ni en `package.json`)
- Caja M-CJ completa ❌: ticket fiscal correlativo, cuenta familiar, tickets pendientes, pago dividido, propinas, cierre de caja — **0% del doc del socio de 14 páginas**. Nota: las tablas `grupos_familiares` y `grupo_familiar_miembros` **ya existen en la BD** con RLS — alguien empezó el modelo y no hay UI.
- Cobro de señal en el portal ❌: `crear_cita_publica` deja la cita `pendiente` con `deposito_requerido=true`… y ahí muere el flujo. No hay webhook ni enlace de pago (§8).

**Motor de mensajería (bloquea 3 features ya construidas):**
- Recordatorios reales ❌, aviso automático de waitlist ❌, petición de reseña post-cita ❌, confirmación de reserva por WhatsApp/email ❌. La cita del portal se crea y **el cliente no recibe nada** (solo pantalla de confirmación).

**Portal público (v1 entregada, v1.5 necesaria):**
- Anti-abuso ❌: sin captcha, sin límite por teléfono/IP. Cualquiera puede llenar la agenda entera de un salón con reservas falsas en un bucle de 200 llamadas a la RPC (§9.3).
- Cancelar/modificar cita por el cliente ❌ (el dossier lo marca como criterio de lanzamiento: "cancelar o modificar sin llamar al salón").
- Auto-apuntarse a lista de espera desde el portal cuando no hay huecos ❌ (hoy la lista es solo interna).
- Zona horaria hardcodeada `Europe/Madrid` (`portal-reserva-publica.sql:120`) — ok v1, recordar al escalar.

**Operativa:**
- Buffer configurable ❌ · Recursos/salas ❌ · Multi-location UI ❌ (BD preparada).
- Vista mes móvil y semana móvil rotas (§5).

**IA (de Alexandro, pero con deuda de base nuestra — §7):**
- Identificar cliente por teléfono (RPC) ❌ · modificar/cancelar cita vía API ❌ · canal parametrizable (hoy `'web'` fijo) ❌ · autoría IA en historial ❌ · credencial de servicio para n8n (no anon) ❌.

---

## 4. Seguridad — auditoría de la BD de producción (10 jun)

### 4.1 Críticas — encontradas y **CORREGIDAS HOY** ✅

Aplicado en remoto (migración `security_hardening_exec_sql_addons`) y versionado en `migrations/security-hardening-exec-sql-addons.sql`:

1. **`public.exec_sql(text)` — puerta trasera de SQL arbitrario.** Función de desarrollo (`BEGIN EXECUTE sql; END;`) ejecutable por `anon` vía `/rest/v1/rpc/exec_sql`. Cualquiera con la anon key (que está en el JS público de la web) podía ejecutar SQL contra producción. Solo la usaba un script del snapshot viejo (`project/uploads/`). **Eliminada.** Verificado: ahora devuelve 404.
2. **`cita_addons` y `service_addons` abiertas al mundo.** El rol `anon` tenía TODOS los privilegios (incluido `TRUNCATE`) y la única política era `USING (true)`: lectura/escritura/borrado **cross-tenant sin login**. **Corregido**: revocado todo a `anon`, revocado `TRUNCATE/REFERENCES/TRIGGER` a `authenticated`, y políticas sustituidas por el patrón multi-tenant del proyecto (`negocio_id` del perfil). Verificado: anon → 401; la app y el portal siguen funcionando (probado en vivo).

### 4.2 Medias — pendientes (orden de ataque recomendado)

3. **Bucket `cliente-fotos` público y listable.** Las fotos antes/después de clientas de TODOS los salones se pueden listar y ver sin login. Es dato personal (RGPD) y la landing promete "alojada cifrada bajo RGPD". → Pasar el bucket a privado + signed URLs (toca `FotosClienteSection`; medio día).
4. **`Documentacion/` no está en `.gitignore`** y contiene `client_secret_*.json` de Google OAuth y un service account JSON de GCP (`Documentacion/n8n/`). Hoy está untracked, pero un `git add .` descuidado los publica. → Añadir `Documentacion/` a `.gitignore` ya, y **rotar esas credenciales** (llevan meses en un portátil; el service account da acceso a GCP).
5. **Leaked password protection desactivada** en Supabase Auth (un clic en el dashboard).
6. **`staff_set_demo_visits` ejecutable por `anon`** — defiende dentro con `is_staff()`, pero el grant sobra (revocar a anon).
7. **Funciones con `search_path` mutable**: `set_updated_at`, `my_negocio_id`, `generar_negocio_id`, `demo_visit_limit` → añadir `set search_path = public` (las nuevas del portal ya lo hacen bien).

### 4.3 Buenas noticias verificadas
- **Las 31 tablas tienen RLS activado.** El patrón multi-tenant por `negocio_id` es consistente.
- El portal público **no** expone SELECT directo: todo pasa por funciones `security definer` con validación de slug + `portal_activo` — diseño correcto.
- `.env` y `web/app/` correctamente ignorados en git.

---

## 5. Móvil — qué está roto exactamente (probado en vivo, viewport 375×812)

Método: demo real navegada con la cuenta `demo.publico` en un viewport de iPhone. No es opinión: son capturas.

### 5.1 Landing (`web/index.html`) — **mejor de lo que crees**
- Hero, nav con hamburguesa, badges, tabla comparativa y demo-gate **se adaptan bien** a 375px. El trabajo del commit `e73e79e` (tap targets) se nota.
- Pendiente menor: `.diff-vis` y `.integ-box` desbordan ~11px (6 elementos); cabecera con cookie-banner ocupa media pantalla en la primera visita.
- Veredicto: **pulido fino, no reconstrucción.**

### 5.2 Software (web app) — **aquí está lo "pésimo", concentrado en 4 puntos**

| # | Pantalla | Qué pasa en <768px | Gravedad |
|---|---|---|---|
| M1 | **Agenda (cabecera)** | La campana de notificaciones se pinta **encima** del título ("Ag🔔nd"); "Cerrar salón" y "Nueva cita" parten en 2 líneas y se amontonan | 🔴 Primera impresión rota |
| M2 | **Agenda (vista semana)** | Chips de día recortados (el badge naranja tapa el número), títulos de cita truncados a 1 letra ("11:00 A"), columnas ilegibles | 🔴 Inutilizable |
| M3 | **Informes** | La cuadrícula de KPIs mantiene 2 columnas fijas: la columna derecha queda **cortada por el borde** (Ingresos, No-shows, Reposo… medio fuera de pantalla) con scroll horizontal | 🔴 La pantalla "de enseñar" no se puede enseñar |
| M4 | **Tab bar inferior** | El logo flotante de marca se superpone a la pestaña "Agenda": ilegible y medio intapable | 🟠 |
| M5 | Buscador de clientes | El placeholder choca con el contador "5 resultados" dentro del input | 🟡 |
| M6 | Agenda (vista día) | 2 columnas de profesional visibles de 3, sin indicador de scroll horizontal | 🟡 |

- **Clientes y Ajustes están BIEN en móvil** — la lista, filtros y menú funcionan. El patrón responsive existe (`useResponsive`, 28–32 usos por pantalla); el problema es que la cabecera de agenda, la grilla semana y la grilla de KPIs no lo aplican.
- `lista-espera.web.tsx` tiene **0 usos** de `isMobile` — nueva pantalla nacida sin responsive: el patrón de deuda se repite si no se corta.
- **Portal de reserva** (`app/r/[slug].web.tsx`): mobile-first de verdad (max-width 600, columnas fluidas). Es la pantalla que abrirán desde el QR y está bien. ✅

### 5.3 Estimación de arreglo
M1+M4: 1 día. M3: 1 día (colapsar KPIs a 1 columna con `isMobile`, ya hay hook). M2: 2–3 días (la semana móvil merece su propio layout: lista vertical por día, no grilla comprimida). M5+M6: horas. **Total: ~1 semana para que el software sea presentable en móvil.**

---

## 6. Contraste contra los documentos del socio

Fuente: `Documentacion/dossier_requisitos_innegociables.html` + docs modulares 5 (caja) y 6 (capa IA).

### 6.1 Los 6 bloques innegociables del dossier

| Bloque | Estado | Detalle |
|---|---|---|
| 1. Agenda inteligente multi-profesional | 🟢 ~95% | Fases activa/reposo, paralelos, anti doble-reserva: hecho y mejor que la spec. Falta: duración por profesional (la tabla `duraciones_profesional` existe en BD — ¿hay UI?) |
| 2. Ficha de cliente con historial real | 🟢 ~95% | Ficha técnica color, alergias, fotos, notas: hecho. Falta: alertas de cumpleaños |
| 3. Sistema anti no-show | 🟡 ~40% | Política y UI de config: sí. Recordatorios reales: NO. Depósito real: NO. La lista de espera (parte del bloque según el dossier): v1 sin aviso automático. **El bloque de mayor ROI según el socio está a medias** |
| 4. Reserva omnicanal sin fricción | 🟡 ~50% | Online directa sin login: ✅ (cumple "menos de 3 pasos"… son 5 pasos, revisar). WhatsApp/IA: ❌ (Alexandro). Instagram: ❌. Confirmación inmediata por canal del cliente: ❌ (no se envía nada) |
| 5. Equipo y rentabilidad | 🟢 ~85% | Roles, turnos, comisiones, métricas: hecho |
| 6. Informes operativos | 🟢 ~80% | Real y profundo + tendencias. El dossier pide "visual, no Excel": cumplido |

### 6.2 Criterios de "suficiente para lanzar" del dossier (los 8)

| Criterio | ¿Hoy? |
|---|---|
| Profesional: crear cita en <30s | ✅ |
| Profesional: agenda del día de un vistazo | ✅ (en desktop; en móvil M1/M2) |
| Profesional: historial de cliente en <3 clics | ✅ |
| Profesional: facturación de la semana sin cálculo manual | ✅ |
| Profesional: disponibilidad confiable | ✅ |
| Cliente: reservar sin cuenta al primer intento | ✅ (desde el 8 jun) |
| Cliente: confirmación inmediata por su canal habitual | ❌ (motor de envío) |
| Cliente: cancelar/modificar sin llamar | ❌ |
| Cliente: recordatorio sin pedirlo | ❌ |

**Traducción: 6 de 9. Los 3 que faltan dependen del motor de mensajería + 1 RPC nuestra (cancelar). Eso ES el lanzamiento.**

### 6.3 Lo que el socio dice que NO hagamos aún (y vamos bien)
Inventario, app nativa del cliente final, contabilidad, marketplace: ninguno empezado. ✅ Disciplina correcta. (Ojo: C13 "paridad nativa" debe leerse con esta lente — el dossier pide web/PWA primero para el cliente; la app nativa es para el equipo del salón.)

---

## 7. La base para Alexandro (n8n + Retell) — contrato exacto

El doc modular 6 define qué debe poder hacer el agente. Mapeo contra lo que existe:

### 7.1 Lo que YA puede usar n8n/Retell hoy (sin tocar nada)
- `portal_info(slug)` → catálogo de servicios + profesionales. ✅
- `disponibilidad_publica(slug, servicio, fecha, [profesional])` → huecos reales. ✅ **Esto es oro: la lógica de disponibilidad ya está encapsulada en el servidor.**
- `crear_cita_publica(...)` → crea cita validando solapes/horario/antelación. ✅
- `resenas_publicas(slug)` → media de valoraciones. ✅

### 7.2 Lo que FALTA para cumplir el doc 6 (trabajo nuestro, no de Alexandro)

| # | Pieza | Para qué capacidad del doc 6 | Esfuerzo |
|---|---|---|---|
| A1 | RPC `identificar_cliente(slug, telefono)` → nombre, profesional habitual, última visita (datos mínimos, RN-IA-006) | "Hola María, ¿tu corte con Lucía?" (RN-IA-010/011) | S (1 d) |
| A2 | RPC `citas_de_cliente(slug, telefono)` + `cancelar_cita_publica` + `modificar_cita_publica` (aplicando política de cancelación) | Modificación/cancelación (crítticas en MVP) — **y la web la necesita igual** (§6.2) | M (2–3 d) |
| A3 | Parámetro `p_canal` en `crear_cita_publica` (`whatsapp` / `agente_voz` / `asistente_ia` — los valores ya existen en `CITA_CANAL`) + `p_autor` para el historial (RN-IA-003: autoría IA visible) | Trazabilidad de qué hizo la IA | S (medio día) |
| A4 | **Credencial de servicio**: los agentes NO deben usar la anon key. Crear un rol/clave `service_agent` (o edge function proxy con API key) con rate limit | Seguridad del canal IA | M (1–2 d, decidir con Alexandro) |
| A5 | Tabla `conversaciones_ia` (canal, telefono, resumen, cita_id, timestamps) | RN-IA-007 (RGPD) + el panel "qué hizo la IA" | S–M (1–2 d) |
| A6 | Webhook saliente al crearse/cancelarse cita (Database Webhooks de Supabase → n8n) | Dispara confirmaciones, avisos de waitlist, petición de reseña — **una sola pieza alimenta 3 features** | S (1 d) |

**Con A1–A6 (≈1 semana), Alexandro conecta n8n/Retell sin pedirnos nada más.** Sin A4 y A6, su trabajo nace cojo: lo digo porque el objetivo era "que él solo tenga que conectar".

### 7.3 Lista de espera v2 — **HECHO** ✅ (1 jul 2026)

**Estado**: Motor server-side completo, listo para activar. OFF por defecto en todos los salones (config `listaEsperaMatchingActivo: false`).

**Especificación completa**: `docs/superpowers/specs/2026-06-21-lista-espera-matching-design.md`

**Arquitectura implementada** (migración `lista-espera-matching.sql`):

1. **Motor `procesar_lista_espera()`**: función `security definer` (solo `service_role`) que procesa:
   - Nuevas cancelaciones → crea ofertas
   - Ofertas vencidas → avanza al siguiente candidato
   - Ofertas confirmadas → resuelve + avisa a los demás

2. **Tablas nuevas**:
   - `lista_espera_ofertas`: un registro por hueco liberado, con estado (`activa`/`resuelta`/`agotada`), candidato actual, ventana de expiración, bloqueo máximo, lista de `avisados`
   - `lista_espera_avisos`: outbox para mensajes WhatsApp (`template`: `aviso_lista_espera` / `aviso_hueco_caducado`)

3. **Flags en `citas`**:
   - `es_oferta_espera`: marca citas tentativas creadas por el motor (el escaneo de cancelaciones las ignora)
   - `lista_espera_revisada`: marca cancelaciones ya procesadas

4. **RPCs**:
   - `lista_espera_avisos_pendientes()`: drena el outbox para n8n
   - `marcar_lista_espera_aviso_enviado(id)`: marca aviso como enviado
   - `confirmar_cita_oferta(cita_id, telefono)`: aceptación desde el portal (anónima, gated por par cita+teléfono)

**Configuración** (`negocio_config.config`):

| Clave | Default | Qué hace |
|---|---|---|
| `listaEsperaMatchingActivo` | **false** | Toggle maestro |
| `listaEsperaVentanaMin` | 30 | Minutos para responder |
| `listaEsperaMaxBloqueoHoras` | 2 | Tope total de bloqueo del hueco |
| `listaEsperaAntelacionMinHoras` | 4 | Antelación mínima para ofrecer |
| `listaEsperaDesbloqueoDesde` | 'primer_aviso' | Desde cuándo cuenta el tope |
| `listaEsperaOfertaPideSenal` | false | La oferta exige señal |
| `listaEsperaAvisarCaducado` | false | Avisar a los no agraciados |

**Pendiente** (Alexandro):
- Activar workflow n8n dedicado "Mecha — Lista de espera" (Schedule 2 min → `procesar_lista_espera` → drenar avisos → enviar WhatsApp → marcar enviado)
- Validar plantillas de Meta (`aviso_lista_espera`, `aviso_hueco_caducado`)

**UI existente**: `app/(tabs)/lista-espera.web.tsx` (gestión manual de candidatos, filtros por estado, marcar avisado/resuelto).

---

### 7.4 Comisiones y liquidaciones — **HECHO** ✅ (1 jul 2026)

**Sistema completo de liquidaciones mensuales con persistencia y modelos avanzados.**

**Modelo de datos** (migraciones `comisiones-liquidaciones.sql` + `comisiones-rpcs.sql`):

1. **`comisiones`**: tabla de liquidaciones por profesional y periodo
   - `negocio_id`, `profesional_id` (uuid), `periodo_inicio/fin`
   - `base_calculo_cents`: base sobre la que se calcula la comisión
   - `porcentaje_aplicado`, `comision_base` ('neto'/'bruto'), `incluir_addons`, `incluir_propinas`
   - `importe_comision_cents`: resultado
   - `estado`: 'pendiente'/'pagada'/'anulada'
   - `detalles`: JSONB con desglose
   - `pagada_en`: fecha de pago

2. **`comisiones_tramos`**: modelos de comisión por tramos de facturación
   - `nivel`, `umbral_min_cents`, `umbral_max_cents`, `porcentaje`

3. **`comisiones_por_categoria`**: porcentajes diferentes por categoría de servicio
   - `categoria_id`, `porcentaje`

**RPCs implementadas** (solo `authenticated`, RLS por `negocio_id`):

- `calcular_comisiones_periodo(p_profesional_id, p_desde, p_hasta)`: calcula sin persistir
  - Lee config de `negocio_config` → porcentaje defecto, base tipo, addons, propinas
  - Aplica porcentaje individual del profesional si existe
  - Devuelve JSON con base, porcentaje, comisión, desglose

- `generar_liquidacion(p_profesional_id, p_periodo_inicio, p_periodo_fin)`: persiste
  - Verifica que no exista ya para el periodo
  - Inserta en `comisiones` con snapshot de config
  - Devuelve `liquidacion_id`, importe, cálculo

- `obtener_liquidaciones(p_negocio_id?, p_profesional_id?, p_estado?)`: lista
  - Devuelve array con detalles + pagada_en

- `marcar_liquidacion_pagada(p_liquidacion_id)`: marca como pagada (solo gestores)
- `anular_liquidacion(p_liquidacion_id)`: anula (permite regenerar)

**UI implementada** (`components/informes/LiquidacionesSection.tsx`):

- Selector de mes (últimos 6 meses)
- Toggle "Todas" / "Por profesional"
- Lista de liquidaciones con estado (pendiente/pagada/anulada)
- Modal de detalle con:
  - Base de cálculo, porcentaje aplicado, comisión final
  - Configuración aplicada (neto/bruto, addons, propinas)
  - Resumen de actividad (nº cobros)
  - Estado y fechas (creada, pagada)
- Acciones: generar todas, marcar como pagada, exportar CSV

**Configuración existente**: `app/(tabs)/configuracion.web.tsx` → "Comisiones" (porcentaje defecto, base tipo, addons, propinas) + `app/(tabs)/equipo.web.tsx` (porcentaje individual por profesional).

**Pendiente**: integrar modelos de tramos y por categoría en el cálculo (RPC soporta el modelo; UI de configuración de tramos pendiente).

---

### 7.5 Fidelización y recompensas — **HECHO** ✅ (1 jul 2026)

**Sistema de recompensas con persistencia, niveles y logros desbloqueables.**

**Modelo de datos** (migración `recompensas.sql`):

1. **`recompensas`**: premios canjeables por clientes
   - `nombre`, `descripcion`, `tipo` ('descuento_pct'/'descuento_eur'/'producto'/'servicio'), `valor`
   - `umbral_visitas`: número de visitas necesario para canjear
   - `expira_meses`: caducidad (null = no expira)

2. **`recompensas_canjeadas`**: historial de canjes
   - `cliente_id`, `recompensa_id`, `cita_id` (asociada)
   - `estado`: 'canjeado'/'usado'/'expirado'/'cancelado'

3. **`niveles_fidelizacion`**: categorías de cliente (Nuevo, Habitual, VIP...)
   - `nombre`, `orden`, `color`, `icono`
   - `umbral_visitas` OR `umbral_gastado_cents` (cumple uno u otro)

4. **`logros`**: badges desbloqueables
   - `tipo`: 'primera_visita'/'visitas_multiple'/'gastado_total'/'sin_noshow'/'servicio_fav'/'antiguedad'/'custom'
   - `condicion`: JSONB con parámetros (ej: `{"visitas": 10}`)

5. **`logros_desbloqueados`**: registro de logros desbloqueados por cliente

**RPCs implementadas**:

- `obtener_recompensas_negocio(p_solo_activas?)`: lista recompensas del negocio
- `canjear_recompensa(p_recompensa_id, p_cliente_id, p_cita_id?)`: registra canje
  - Verifica umbral de visitas
  - Inserta en `recompensas_canjeadas`
- `obtener_nivel_cliente(p_cliente_id)`: calcula nivel según métricas
- `verificar_logros_cliente(p_cliente_id)`: desbloquea logros automáticamente según métricas
- `obtener_logros_desbloqueados(p_cliente_id)`: lista logros de un cliente

**UI implementada** (`app/(tabs)/configuracion-recompensas.web.tsx` → "Recompensas"):

- **Sección de Recompensas**: listado, búsqueda, crear/editar (nombre, tipo, valor, umbral, expiración), activar/desactivar
- **Sección de Niveles**: listado con drag & drop de orden, color, umbrales (visitas o gastado)
- **Sección de Logros**: listado, crear/editar (nombre, tipo, condición JSON), activar/desactivar

**Integración pendiente**:
- Mostrar nivel del cliente en su ficha (`clientes.web.tsx`)
- Mostrar logros desbloqueados en la ficha del cliente
- Sugerir recompensa canjeable al completar una cita

---

## 8. Pagos — diseño propuesto (decisión para Jose, ejecución Alexandro, UI Carlos)

Lo que pediste: pagar desde la web y desde el local con QR, sincronizado. Propuesta concreta para discutir:

> **Actualización 18/jun/2026 — POS / Caja:** Jose pidió un **POS** (el profesional cobra desde
> el software, como el modo gestor de novanoidai). Su duda —"¿no doble-contaremos citas y dinero
> entre el POS y los informes?"— está respondida en detalle en
> **`ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md`**. Resumen: hoy los "ingresos" son **estimación**
> (precio de catálogo × citas completadas, `informes.web.tsx:646`), **no caja real**; el POS y
> las citas son **dos capas distintas** (demanda vs dinero) que se **enlazan** por `cita_id`, con
> el dinero saliendo de **un solo libro de cobros** y la señal **descontada** (no sumada).
> Recomendación: opción de **capas enlazadas** con interruptor "estimado vs cobrado" por negocio
> (no doble-cuenta por construcción). Fases POS-0/POS-1 (caja operativa **no fiscal**) son de
> Carlos; el cobro electrónico y la facturación fiscal (VeriFactu = P3) son de Alexandro/fiscalista.

### Fase P1 — Señal anti no-show (2 semanas de Alexandro, desbloquea la promesa de la landing)
- Stripe Checkout (no Elements: menos PCI, más rápido): `crear_cita_publica` con `deposito_requerido` → edge function crea sesión de Checkout → redirect → **webhook `checkout.session.completed`** marca `deposito_pagado=true` y `estado='confirmada'`. El campo y los estados **ya existen** en la tabla `citas`.
- Si no paga en 15 min, la cita `pendiente` expira y libera el hueco (cron de Supabase).
- UI Carlos: paso de pago en el portal + badge "señal pagada" en agenda y ficha.

### Fase P2 — Cobro en el local con QR (1 semana sobre P1)
- Al marcar cita `completada` → botón "Cobrar" → genera **ticket interno + enlace de pago Stripe** → se muestra **QR en pantalla** (el cliente lo escanea y paga en su móvil) o se envía por WhatsApp. El prepago de P1 se descuenta automáticamente (regla RN-CJ-010 del doc del socio).
- Sin TPV físico en v1 (decisión: ¿Stripe Terminal después?).

### Fase P3 — Caja M-CJ completa (el doc de 14 páginas: VeriFactu, numeración correlativa, cuenta familiar, pendientes, propinas, cierre)
- **No improvisar esto.** Requiere fiscalista (lo dice el propio doc) y es un proyecto de 4–6 semanas. Las tablas `grupos_familiares` ya existen — retomarlas aquí.
- ⚠️ Hasta P3, **no afirmar "ticket fiscal"** en ningún sitio: un ticket no fiscal emitido como fiscal es problema con Hacienda, no un bug.

---

## 9. Riesgos que nadie está mirando

1. **SEO con reseñas inventadas (riesgo de penalización real).** `web/index.html:73-143` lleva structured data `Product` con `aggregateRating: 4.9, reviewCount: 124` y dos `Review` con autores ficticios. Google penaliza el rich-snippet abuse y puede degradar TODO el dominio. Además es publicidad engañosa (consumidores). → Quitar el bloque `aggregateRating/review` YA; dejar FAQ/SoftwareApplication. Cuando haya reseñas reales del producto (no del salón), volver a ponerlas. [Carlos, 10 min]
2. **Marketing por delante del producto.** La landing afirma en indicativo: "cobra el depósito por Stripe", "IA atiende por WhatsApp 24/7", "no-shows al 1,2%". Para la demo comercial vale; para cobrar a un salón real es incumplimiento. → Política: cada claim en indicativo debe estar en producción o pasarse a "(muy pronto)". Revisión de copy 1 h.
3. **Abuso del portal público.** `crear_cita_publica` no tiene captcha ni límites. Un competidor malicioso llena la agenda de un salón en 1 minuto. → v1.5: límite por teléfono (máx. 2 citas activas), límite por IP en edge function proxy, Cloudflare Turnstile en el paso 5. [Carlos+Alexandro, 2 d]
4. **RGPD operativo.** Hay consentimientos (C7 ✅), pero: bucket de fotos público (§4.2-3), sin proceso de borrado/exportación de datos del cliente final, y las conversaciones IA futuras necesitan A5. La landing promete "derecho al olvido en 30 días" — hoy no hay botón que lo ejecute.
5. **Bus factor = 1.** Todo el código vivo lo ha escrito una persona en 3 semanas. Sin tests (0 archivos de test en el repo), sin CI. Mínimo: GitHub Actions con typecheck + lint + linter de Supabase en cada PR. [1 d]
6. **La cuenta demo compartida** escribe en un tenant compartido (`demo_block_*` solo bloquea DELETE/UPDATE en algunas tablas). Dos visitantes simultáneos se ven las citas de prueba el uno al otro. Aceptable como decisión, pero documentarla; y el contador "3 visitas" castiga al prospecto que vuelve (¿de verdad queremos eso? — decisión para Jose).

---

## 10. Roadmap a producción (priorizado, con dueño)

### Sprint 1 — "Presentable y seguro" (esta semana, Carlos)
1. ~~Seguridad crítica BD~~ ✅ **hecho hoy** (exec_sql + addons).
2. Móvil M1–M6 del software (§5.3) — ~1 semana. **El mayor ROI visual disponible.**
3. Quitar reseñas falsas del structured data + revisión de claims (§9.1, §9.2) — 1 h.
4. `.gitignore` Documentacion/ + rotar credenciales Google (§4.2-4) — 1 h.
5. Bucket fotos a privado + signed URLs (§4.2-3) — medio día.

### Sprint 2 — "Base IA + cerrar el círculo del cliente" (semana 2, Carlos; desbloquea a Alexandro)
6. A1–A6 del contrato IA (§7.2) — RPCs de identificar/cancelar/modificar, canal+autoría, webhook saliente, tabla conversaciones. ~1 semana.
7. Cancelar/modificar cita desde el portal (reusa A2) — cumple el criterio del dossier.
8. Matching de lista de espera (§7.3.1) + notificación in-app.

### Sprint 3 — "Dinero" (semanas 3–4, Alexandro con UI de Carlos)
9. Stripe P1 (señal) → 10. P2 (QR en local).
11. En paralelo Carlos: anti-abuso del portal (§9.3), C8 buffer, alertas de cumpleaños (gap del dossier barato).

### Sprint 4 — "Escala" (mes 2)
12. Motor de recordatorios completo (Alexandro, la UI fase 4 ya existe) → activa los 3 criterios de lanzamiento restantes del dossier.
13. Caja M-CJ con fiscalista (P3). 14. Multi-location UI (C12). 15. CI + tests de las RPCs públicas (las funciones SQL son perfectamente testeables).

### Qué NO hacer (disciplina del dossier)
Inventario · app nativa del cliente final · marketplace · precios dinámicos · contabilidad. Y **no más features nuevas de cara al cliente hasta cerrar Sprint 1**: cada pantalla nueva sin responsive ni linter añade deuda de la que ya hemos pagado intereses hoy.

---

## 11. Decisiones pendientes para Jose

1. **¿Señal obligatoria en v1 del portal?** Recomendación: opcional por servicio (ya modelado así: `prepago_requerido` por servicio), activar tras P1.
2. **Pricing.** El structured data de la landing dice 0€/49€ — ¿es oficial? Definirlo antes de P1 (afecta a qué cobra Stripe).
3. **Demo: ¿mantener el límite de 3 visitas?** Castiga al prospecto interesado que vuelve. Alternativa: ilimitada con marca de agua "DEMO" + datos que se resetean cada noche.
4. **Caja fiscal: ¿cuándo contratamos la revisión del fiscalista?** P3 no puede empezar sin ella (lo dice el doc del socio).
5. **¿Quién aprueba los claims de la landing?** Proponer la regla del §9.2.
6. **Marketplace sí/no** — sigue abierta del informe anterior; no urge, pero condiciona el dominio público y el SEO local por salón (los portales `/r/slug` son indexables: ¿queremos eso ya?).

---

## Anexo A — Evidencia de la auditoría de hoy

- **BD producción:** advisors de Supabase (security) + consultas a `pg_policies`, `information_schema.table_privileges`, `pg_proc` — 10 jun 2026. Resultados clave en §4. Migración correctiva aplicada y verificada (portal_info 200 / exec_sql 404 / service_addons anon 401).
- **Móvil:** demo navegada en vivo (viewport 375×812, cuenta demo.publico) — agenda día/semana, clientes, informes, ajustes, login, landing, demo-gate. Hallazgos M1–M6 en §5.
- **Documentos del socio:** dossier innegociables (HTML), doc modular 5 caja (PDF 14 págs), doc modular 6 capa IA (PDF 17 págs) — leídos íntegros; mapeo en §6–§8.
- **Código:** árbol completo de `app/`, `web/`, `lib/`, `migrations/`, `supabase/functions/` + git log hasta `a495cf6` (9 jun).

## Anexo B — Mapa de archivos nuevos desde el informe anterior

- Portal: `app/r/[slug].web.tsx` · `lib/reservaPublica.ts` · `migrations/portal-reserva-publica.sql`
- Reseñas: `app/resena/[slug].web.tsx` · `migrations/resenas.sql`
- Lista de espera: `app/(tabs)/lista-espera.web.tsx` · `migrations/lista-espera.sql`
- CRM: `migrations/bloquear-clientes.sql` · `migrations/etiquetas-clientes.sql`
- Seguridad: `migrations/security-hardening-exec-sql-addons.sql` (hoy)

---

*Informe generado el 10 de junio de 2026 a partir de código, base de datos y pruebas en vivo. Caduca: re-auditar con el método del Anexo A tras cada sprint.*

---

## ADENDO — Sesión de arreglos del 10 de junio (tarde)

Tras el informe, se ejecutó la primera tanda de correcciones. Estado:

### A. Bug de la demo compartida — ARREGLADO ✅
**Síntoma:** cada cuenta veía una demo distinta. **Causas reales (3):**
1. El registro DENTRO de la app (`app/login.tsx`) creaba a cada cuenta su propio `negocio_id` (`nombre_codigopostal`), saltándose el diseño de tenant demo compartido — así nacieron las cuentas de prueba `prueba_46980`, `nose_03801`, `fewf_02801`. Además chocaba con el trigger `handle_new_user` (clave duplicada). → Ahora el registro pasa la metadata y el trigger crea SIEMPRE el perfil en `demo_salon_001` (igual que la web).
2. `demo.html` reutilizaba la sesión personal si existía (el iframe mostraba TU negocio, no la demo).
3. En modo compartir, `signInDemo()` PISABA la sesión personal del visitante (mismo localStorage).

**Diseño nuevo:** el iframe de la demo carga `/app?demo=1`; dentro, la app usa una **sesión aislada** (`storageKey: 'mecha-demo-auth'`, `lib/supabase.ts`) y entra sola con la cuenta demo compartida. Todo el mundo ve la misma demo, esté o no logueado, y su sesión personal no se toca. Abrir `/app?demo=1` directamente (sin iframe) NO activa el modo demo.

### B. Landing — ARREGLADO ✅
- Eliminada la sección "Cómo funciona la tecnología que revoluciona tu salón" (bloque GEO de ~60 líneas con cita y estadísticas inventadas).
- Eliminado el `aggregateRating`/`review` falso del JSON-LD (riesgo de penalización Google). Verificado: los 4 bloques JSON-LD restantes parsean OK.
- **Scroll bloqueado en móvil:** el chat del teléfono 3D (`.wa-body`, `overflow-y:auto` + `overscroll-behavior:contain`) atrapaba el dedo. Ahora en CUALQUIER pantalla táctil (`@media (hover:none),(pointer:coarse)`) el teléfono es solo animación: sin pointer-events y chat sin scroll táctil.
- El FAB de cookies tapaba la pestaña "Agenda" de la tab bar en la demo móvil → desactivado en `demo.html` (`MECHA_COOKIES_NO_FAB`).

### C. Software móvil (M1–M6) — ARREGLADO ✅ (pendiente del deploy)
- M1 cabecera agenda: fila compacta; fecha larga y pills solo en escritorio; botones que no parten en 2 líneas ("Cita", iconos para Hoy/Cerrar).
- M2 vista semana: lista vertical en móvil (antes 7 columnas de ~45px ilegibles); días vacíos = una línea, no un bloque de 220px.
- M3 informes: el código fuente ya era responsive — lo roto era el BUILD VIEJO desplegado (anterior a los commits del día 9). Recompilado.
- M4 = FAB cookies (ver B). M5 buscador clientes: contador fuera del input en móvil. M6: el paneo horizontal nativo de columnas funciona; se deja.
- NUEVO: la **lista de espera era inalcanzable en móvil** (solo vivía en el sidebar de escritorio) → botón en la barra de filtros de la agenda.

### D. Verificación C1–C11 — hecho, con arreglos
- Portal (C1) ✅ · Reseñas (C3) ✅ · Bloqueo en servidor con mensaje neutro (C5) ✅ · Etiquetas/consentimientos/fidelización ✅.
- QR (C10): prefijo mostrado corregido (`/app/r/`, antes omitía `/app`) y añadido botón **Descargar QR** (reserva y valoración).
- **Cómo funciona el QR:** Ajustes → Reserva online → eliges tu enlace (slug) → se genera en local (librería `qrcode-generator`, SVG, sin servicios externos) apuntando a `https://tudominio/app/r/<slug>`; botones Copiar / Abrir / Descargar. Segundo QR para `/app/resena/<slug>` (valoraciones).

### E. Seguridad ronda 2 — APLICADA EN PRODUCCIÓN ✅
(migraciones `security_round2_antiabuso_portal` y `cliente_fotos_bucket_privado`)
- **Anti-abuso de reservas anónimas:** máx. 3 citas futuras activas por teléfono; máx. 30 reservas web/hora por negocio; validación de longitudes. Verificado en vivo.
- **Anti-spam de reseñas:** máx. 3/día por IP y 30/día por negocio (vía `request_ip()`, no invocable desde fuera); comentario ≤1000.
- **Bucket `cliente-fotos` PRIVADO** + políticas por carpeta de negocio. Antes: cualquiera podía VER las fotos de clientas de todos los salones, y cualquier autenticado podía BORRAR las de otros salones. La app ahora pinta con URLs firmadas (1 h).
- `staff_set_demo_visits` revocada a anon; `search_path` fijado en las 4 funciones que lo tenían mutable.
- **Pendiente manual (1 clic, dashboard):** Auth → activar "Leaked password protection".


### F. Segunda pasada (12 jun, tarde) — flujo de demo + móvil profundo ✅
- **"Ver demo → login → me devuelve fuera":** la cuenta demo compartida agotaba sus 3 visitas y bloqueaba la demo para todos. `demo.publico@mecha.app` queda exenta del contador (migración `demo_viewer_exento_de_visitas`); el límite de 3 visitas sigue para los prospectos. Flujo verificado: login → demo con tutorial, "Demo activa".
- **Móvil, pantalla por pantalla (verificado en build):** Horarios (el título se aplastaba a una palabra por línea y las horas se salían — ahora apila), Servicios (los NOMBRES de los servicios eran invisibles, columna a ancho 0 — ahora dos líneas por servicio), Comisiones (tabla con nombres legibles, columna Rol oculta en móvil), Informes (CSV/«Descargar PDF» quedaban cortados fuera — ahora envuelven), átomo `Section` (cabeceras con action ancha ya no aplastan el título — arregla todas las secciones de Ajustes de golpe), StatBox/bloqueos a rejillas auto-fit. Verificados también en móvil: agenda día/semana, nueva cita (bottom sheet), ficha de cliente, equipo, lista de espera (accesible vía botón "Espera"), portal y QR con su "Descargar QR".

### G. Tercera pasada (13 jun) — landing premium + login SSO + móvil del software ✅ (commit `4f3b97b`, preview de Vercel verde)
Tanda nacida de feedback directo del socio ("menos texto, más visual, que el producto respire; arreglar el login y el móvil del software"). Verificado a 375px sirviendo `web/` con `serve-web.mjs` y la demo en `/demo.html?share=1` (mediciones de overflow por DOM en el iframe — el screenshot del iframe cuelga por el bundle, ver nota de método).

- **Landing más corta y premium** (`web/index.html`, de ~1540 a ~1045 líneas): hero a una frase clara, fuera el strip de logos inventados, métricas a 4 tarjetas (sin los 2 paneles de gráfica), "lo que hace tu salón" → roadmap de 4 pasos, fuera la fila IA "cerebro" y la sección de fichajes Elevascore, comparativa de 13 filas → **6 limpias**, chat del móvil de 14 a 8 mensajes, badge del hero recortado. Las **especificaciones completas** salen a página aparte **`web/especificaciones.html`** (enlazada con un banner). Terminología visible unificada a "señal" ("depósito" solo en JSON-LD por SEO).
- **Login/SSO — fallo gordo arreglado:** el SSO de Google aterriza en la **Site URL (la landing)** con el `access_token` en el hash, NO en `acceso.html`, así que el usuario se quedaba en la landing "sin sesión" y tenía que volver a pulsar. Ahora la landing detecta el callback y, al haber sesión, redirige a `demo.html` (si había intención de demo) o a `acceso.html` (que enruta por plan). La intro se suprime en el callback. Además el **menú hamburguesa** ocultaba "Iniciar sesión" aun con sesión: arreglado (`syncMobileMenu`).
- **Móvil del software — cajas que se salían y scroll horizontal:** causa raíz = faltaba `box-sizing:border-box` (un `<input>` crudo con `width:100%`+padding desbordaba). **Reset global** en `components/WebScrollbarStyles.tsx` → arregla todos los inputs de golpe. `FieldRow` (SettingsAtoms) rellena ancho en móvil. **Equipo:** "Horario base" pasa de rejilla de 7 columnas con scroll a **lista vertical por día**; tarjetas de profesional compactadas. **Informes:** tabla de comisiones (forzaba 540px) y selector de % ahora **caben sin scroll horizontal**. Verificado: config/equipo/informes/clientes a 375 sin desbordes ni scrollers internos.
- **"Volver a la web" en móvil:** el software no tenía salida en móvil (el `exitToWeb` vivía solo en el `Sidebar`, oculto). Añadido botón al final del menú de Ajustes.
- **Tab bar móvil** afinada (58px, iconos outline/relleno según foco).

**Nota de método (para re-auditar):** el screenshot del iframe de la demo cuelga el preview (bundle 4.8MB + animaciones en vivo). Verificar overflow midiendo `scrollWidth` vs `clientWidth` sobre `appFrame.contentDocument` con eval; navegar el iframe a una pantalla con `appFrame.src='/app/<ruta>?demo=1'` (sigue contando como demo por ir embebido).

### Estado de Pagos (área Alexandro) — actualizado
La Fase P1 (§8) ya no está a 0%: Alexandro tiene en `master` el **modelo de datos de señal** (tabla `pagos` agnóstica de pasarela, RLS multi-tenant — commit `e70a12b`) y la **RPC `requerir_senal_cita`** que calcula y crea la señal pendiente del encadenado (commit `fd3a494`). Falta la pasarela en sí (Checkout/redirect + webhook `checkout.session.completed`) y la UI del paso de pago en el portal (Carlos). La caja fiscal M-CJ (P3) sigue intacta y requiere fiscalista.

---

## ADENDO — Sesión de arreglos del 14 de junio (tarde) · Nav móvil, especificaciones y bug de demo ✅

Se ha ejecutado la tanda final de arreglos sobre la landing, las especificaciones y la demo. Estado:

### A. Rediseño total del menú de navegación móvil de la landing — ARREGLADO ✅
- Se eliminó el overlay a pantalla completa por un panel lateral deslizante premium que sale desde la derecha (`web/assets/mecha.js`, `web/assets/mecha.css`).
- La hamburguesa se transforma en "X" (cierre), y el panel cierra también por scrim (tocando fuera), tocando cualquier enlace, o con la tecla Esc.
- Enlaces de navegación estructurados en lista con chevron y entrada elegante, pie con login y llamada a la acción (demo/registro).
- **Corrección de overflow preexistente**: Se detectó que la visualización del teléfono (`.phone-glow` en `web/assets/mecha-sections.css`) causaba un desborde lateral de 31px en dispositivos móviles, lo que descolocaba los elementos fixed. Se aplicó `overflow-x: clip` en `.demo` para cortar el desborde a 375px y asegurar 0px de overflow total en la landing.

### B. Página de especificaciones completas — ARREGLADO ✅
- Reescrita `web/especificaciones.html` para incorporar un sistema de acordeones (`<details>`) donde cada una de las 73 especificaciones detalla "Qué hace" y "Para qué sirve" al pulsar.
- Se estructuraron todas las características reales del software organizadas por bloques (agenda, clientes, equipo, informes, configuración de slots, cancelaciones, no-shows, reposo, comisiones, plantillas, etc.).
- Siguiendo la regla "sin claims falsos" del `CLAUDE.md`, las funcionalidades sin soporte de código actual (fichajes, control de inventario) o en desarrollo (IA avanzada, mensajería automática y señales de reserva) se movieron de forma transparente a una sección especial de "En camino · se activa al darte de alta" con su respectiva etiqueta distintiva.

### C. Corrección de bugs en la demo interactiva — ARREGLADO ✅
- **Cita del tour vacía**: Se modificó `components/agenda/AgendaCalendar.web.tsx` para que, en caso de que el tenant demo no cuente con una cita que posea reposo + fórmula (p. ej. lunes a primera hora con la base limpia), la app sintetice dinámicamente en memoria una cita de ejemplo (activa 40' -> reposo 35' -> activa 20') y le inyecte una fórmula técnica de color ("Mechas completas" para Ana Ruiz, coloración Wella Koleston). Esto garantiza que el tour nunca muestre campos vacíos en el paso de explicación.
- **Ficha de cliente sobredimensionada**: Se corrigió el trigger de la demo en `app/(tabs)/clientes.web.tsx` para que en móviles no fuerce la anchura expandida de escritorio, permitiendo que la ficha del cliente entre encajada en su layout mobile nativo con scroll vertical fluido.
- **Cierres inaccesibles por scroll**: Al hacer scroll automático del tour móvil hacia la fórmula/secuencia de la cita o datos de la ficha, los botones de cierre quedaban fuera de pantalla. Se convirtieron en cabeceras pegajosas (`position: sticky; top: 0; z-index: 50`) tanto para la cabecera de detalle de cita, la nueva cita y el botón "Volver al listado" en la ficha del cliente, quedando siempre accesibles en el viewport móvil de 375px.

Verificado todo con typecheck limpio (`npx tsc --noEmit`) y build web exitoso (`npm run build:web`). Pruebas mediante DOM query en el iframe (`/demo.html?share=1`) confirman 0px de desborde y persistencia de todos los elementos interactivos a 375px.

---

## ADENDO — Sesión del 15 de junio · Red de referidos multinivel + situación actual vs objetivo

Tanda centrada en (1) auditar y reconstruir el sistema de referidos antes de pasarle el enlace a Jose, (2) cerrar fallos de la demo en móvil y de coherencia del tour, y (3) dejar por escrito en el informe maestro la **distancia entre dónde estamos y el producto que queremos** (la parte de escalabilidad / self-service que condiciona todo lo demás).

### A. Sistema de referidos — estaba ROTO y se ha reconstruido seguro y multinivel ✅

**Hallazgo (auditoría directa de la BD de producción `vtrggiogjrhqtwbhbgia`):** el "programa de referidos" que se veía en la demo era **una fachada que daba error**. Nada de su backend existía:

| El frontend (`web/demo.html`) usaba | Estado real en prod (15 jun) |
|---|---|
| Tabla `recomendaciones` | ❌ No existía (`to_regclass` = null) |
| RPC `get_my_referrals()` | ❌ No existía |
| `profiles.referido_por` / `codigo_referido` / `descuento_referido_aplicado` | ❌ No existían (profiles tenía 15 columnas, ninguna de referido) |
| Planes `trial`/`none`/`plan_type` que filtraba el tracker | ❌ Los planes reales son `free` y `full` |

La migración `migrations/referidos-y-recomendaciones.sql` **nunca se aplicó** y, además, era **insegura y rota**: creaba `recomendaciones` con políticas `USING(true)` de SELECT y UPDATE para `public` (fuga de TODOS los emails vía anon key + escritura libre — prohibido por `CLAUDE.md §4`), y referenciaba columnas inexistentes (`business_name`, `plan_type`, `metrics`) y una función `is_admin()` que no existe. Si Jose hubiese pulsado "Activar programa de referidos", le habría saltado un error. Bonus: `getProfile()` (`web/assets/auth.js`) seleccionaba `codigo_referido`/`descuento_referido_aplicado` inexistentes → el SELECT fallaba y **devolvía `null` para todos** (bug latente que afectaba al gate de la demo).

**Reconstrucción (aplicada a prod, `migrations/referidos-arbol-multinivel.sql`):** árbol genealógico **multinivel real**, contra el schema real, seguro:
- **Modelo de datos:** `profiles.codigo_referido` (código opaco único, 7 chars, alfabeto sin caracteres ambiguos), `referido_por` (uuid → padre, forma el árbol), `referido_en`, `descuento_pct` (descuento elegible que calcula el motor) y `descuento_referido_aplicado` (lo activa el equipo/Alexandro en facturación). Backfill: los 11 perfiles existentes ya tienen código único.
- **Recompensa multinivel y decreciente, atada a quien PAGA (plan `full`), no a registros gratis** (evita el farming de altas): Nivel 1 (directo) +10 puntos, Nivel 2 +4, Nivel 3 +2, nivel 4+ 0. Bono de bienvenida +15 a quien entra con un código. **Tope global por salón: −40%** (protege el margen: un descuento compuesto sin tope arruina la unit-economics, justo lo que advierte `INFORME_VIABILIDAD_IA_SELFSERVICE.md §3`).
- **Seguridad:** sin tabla de emails pública; el árbol se sirve por RPCs `security definer` con datos mínimos (sin emails de terceros); las columnas sensibles las **congela un trigger** salvo en contexto interno; atribución vía RPC `claim_referral` con anti-autoreferencia y anti-ciclo; helpers internos revocados a `anon`/`authenticated`; advisors de seguridad pasados (las 4 RPCs cerradas a `anon`). El motor **no mueve dinero**: solo calcula elegibilidad; la aplicación real del descuento en Stripe sigue siendo el gate de Alexandro.
- **Verificado en vivo:** prueba transaccional con ROLLBACK sobre prod — cadena A←B←C con C pagando da A=4%, B=25% (10 directo + 15 bienvenida), C=15%, exactamente lo diseñado.
- **Frontend reescrito (`web/demo.html`):** fuera el formulario que insertaba en `recomendaciones` y el **email en base64 dentro de la URL** (PII). Ahora: enlace con **código opaco** (`?ref=CODIGO`), dos estados (con sesión → tu enlace + tu árbol con niveles y descuento ganado; anónimo → CTA "crear cuenta para obtener tu enlace"). Atribución vía `claim_referral` en `acceso.html` (cubre alta por email y SSO de Google). Verificado en preview: el modal abre sin errores, genera `?ref=ABC2345` y alterna ambos estados.

**Pendiente (follow-up, NO bloquea a Jose):** el panel de **staff** de referidos en `web/admin.html` sigue apuntando al modelo viejo (`recomendaciones`, "30%/15%"). Hay que reescribirlo al árbol nuevo (listar perfiles con `descuento_pct > 0` y togglear `staff_set_referral_applied`). Es interno; no rompe el resto del admin.

### B. Demo en móvil y coherencia del tour ✅
- **Paso de "Avisos" (tapado por ruido en móvil):** el panel de notificaciones era un dropdown de 320px anclado a la campana; en 375px **se salía de pantalla** y quedaba como una cajita flotante sobre la cabecera. Ahora en móvil es una **hoja superior a todo el ancho** bajo la cabecera (`components/agenda/AgendaCalendar.web.tsx`). Verificado en vivo: `top=58, ancho=351` en viewport 375, **sin desbordes** (antes se cortaba). El spotlight lo recorta limpio y no choca con la tarjeta del tour (que va abajo).
- **Claims falsos del tour (regla "sin claims falsos"):** dos pasos afirmaban en presente funciones que NO existen aún y que `especificaciones.html` ya había movido a "En camino": "Integrado con **Elevascore**, 100% legal" (fichajes) y "la IA… **cobra el depósito**". Reescritos: el de IA como capacidad que **se conecta al activar la cuenta** (honesto), y el de fichajes sustituido por **equipo/comisiones**, que SÍ es real y vive en esa misma pantalla.

### C. SITUACIÓN ACTUAL vs OBJETIVO — el verdadero techo es la escalabilidad

> Esta sección responde a la pregunta estratégica de fondo: hoy podemos vender Mecha, pero **no podemos escalarlo sin trabajo manual por cada cliente**. El detalle técnico de viabilidad está en `informes/INFORME_VIABILIDAD_IA_SELFSERVICE.md`; aquí queda la foto actual-vs-objetivo y por qué importa.

**Dónde estamos (modelo actual — "alta-touch"):**
- El software (agenda, clientes, informes, portal de reserva) ya es **autoservicio**: un salón podría usarlo solo.
- Pero la **capa de IA** (voz por teléfono + WhatsApp) es **artesanal**: comprar el número (+34) en la consola de Twilio/Telnyx, configurar WhatsApp en Meta Developers, y clonar/ajustar workflows de n8n — todo **a mano, por cliente**, por Carlos/Alexandro.
- Consecuencia: **no podemos** (a) subir la app a la App Store/Play como producto de compra directa, ni (b) poner un botón de pago en la web que dé acceso instantáneo a TODO, porque tras el pago aún hay tareas manuales de aprovisionamiento. Cada cliente nuevo es horas de trabajo nuestro.

**Dónde queremos estar (objetivo — "zero-touch / self-service"):**
- El cliente paga la suscripción en la web (Stripe) y **el backend auto-aprovisiona** lo que se pueda y **guía al usuario** para conectar lo que la ley no permite automatizar:
  - **Agente de voz (Retell):** 100% vía API — `POST /create-agent` con los datos que el salón ya rellenó. ✅ viable.
  - **Número +34:** límite regulatorio de la CNMC (titular real verificado). Solución self-service: el salón sube CIF/DNI en Ajustes → backend lo manda a **Twilio Hosted Regulatory Bundles** → webhook de aprobación (24-72h) → compra automática del número. 
  - **WhatsApp:** **Embedded Signup** de Meta (el patrón de Shopify/Booksy): el salón verifica su número en un popup de Meta y nos llega el WABA ID por webhook; el resto lo automatiza el backend.
  - **n8n:** **un único workflow maestro multi-tenant** (no uno por cliente): n8n pregunta a nuestra BD "¿de qué negocio es este número receptor y qué parámetros tiene?" y actúa en caliente. Cero workflows nuevos por alta.
- **App Store sin comisión del 30%:** publicar la app como herramienta de gestión "lectora" (sin compras dentro); el alta, la tarjeta (Stripe) y la configuración de IA viven **solo en el panel web**. Nos libra del 30% de Apple y simplifica la aprobación.
- **Blindaje financiero (innegociable):** tarjeta válida ANTES de activar la IA; planes con **bolsa de minutos** (no IA ilimitada); límites anti-DoS por origen. La IA de voz tiene coste variable real (~0,53-0,85 $/llamada de 5 min): sin estos topes, un abuso nos arruina.

**Por qué importa (el cambio de naturaleza del negocio):**
Hoy, escalar = más horas nuestras por cada cliente (no escala). Con el modelo self-service, escalar = **mantenimiento y monitorización** de una plataforma que se auto-configura. Pasamos de "montar cada salón a mano" a "vigilar que todo funcione y dar soporte". Eso es lo que convierte a Mecha de un servicio a un **producto SaaS de verdad**, multiplica el valor del software y es la condición para subirlo a las tiendas y cobrar en la web. **Es el siguiente gran objetivo de producto**, ya en investigación por Alexandro (automatización del aprovisionamiento). Roadmap técnico por fases en `INFORME_VIABILIDAD_IA_SELFSERVICE.md §5`.

**Decisiones para Jose (añadidas):**
7. **Modelo de referido:** ¿validamos el árbol multinivel con tope −40% y recompensa por 3 niveles (10/4/2 + 15 bienvenida)? Afecta a margen y, si los descuentos se acumulan mucho, conviene cerrarlo con pricing definido (decisión §11.2 sigue abierta).
8. **Prioridad self-service:** ¿cuándo arrancamos el aprovisionamiento zero-touch (Stripe webhook → plan, Twilio Bundles, Meta Embedded Signup)? Es lo que desbloquea App Store y cobro en web.

---

## ADENDO — Sesión del 15 de junio (tarde) · Referidos en el software, cuenta editable y anti-fraude

Tanda de cierre del bloque de referidos, llevándolo del modal de la demo al **software real** y blindándolo. Todo aplicado en prod, desplegado y verificado en vivo (DOM sobre el iframe del software, método del Anexo A).

### A. UX del modal de compartir (demo)
- **Ahorro destacado:** el descuento se muestra **grande y en verde** (`−X%`, 36px con glow) + "X con plan activo" en verde. Antes el número del ahorro pasaba desapercibido.
- **Reiniciar tutorial:** ahora cierra el panel que abriera un paso anterior y reposiciona el software al paso 1 (antes solo reiniciaba el texto y la ventana del paso previo se quedaba abierta).
- **Botones** "Compartir demo" y "Quiero acceso completo" más llamativos (glow/latido, respeta `prefers-reduced-motion`); badges sin emoji (icono SVG, regla "sin emojis en UI").

### B. El cliente YA ve su descuento dentro del software ✅ (gap cerrado)
- Nueva pestaña **Ajustes → Cuenta → "Invita y gana"** (`app/(tabs)/configuracion.web.tsx`, `TabReferidos`): su código, su enlace (`/demo.html?share=1&ref=CODE`), el **descuento en verde** y el **árbol por niveles** (puntos de color por profundidad). Reusa los RPCs `get_my_referral_stats` / `get_my_referrals`. Verificado renderizando en el software real.

### C. Cuenta editable — un solo sistema, no dos ✅
- `TabCuenta` deja **editar nombre/apellidos/teléfono** (update del perfil propio, RLS "users can update own profile") y **cambiar la contraseña** (Supabase Auth `updateUser`). En la **demo compartida los campos van deshabilitados** (no se toca la cuenta `demo.publico`). Verificado: 5 inputs deshabilitados + aviso en demo.
- **Decisión de arquitectura (respondida):** es **una sola base de datos**; la misma fila `profiles` vale para software y web. Editar en cualquiera de los dos se refleja en todo — no hay dos editores que sincronizar. El sitio canónico de edición es el software; la landing se queda con alta + restablecer contraseña.
- De paso se retiró un **claim falso** de la pantalla de cuenta ("Plan Studio-Pro / Activo / al corriente de pago", inventado) → sección honesta "Plan y plazas".

### D. Anti-fraude de multicuentas ✅ (`migrations/antifraude-signup-signals.sql`)
- Se registra **server-side y una sola vez** la IP/UA/huella de dispositivo del alta (`record_signup_signal`, llamado en `acceso.html` tras autenticar; cubre email y SSO). Las columnas `signup_ip/ua/fingerprint` las **congela el guard** para que el cliente no las falsee.
- Panel nuevo en `web/admin.html` que lista **racimos de cuentas con el mismo origen** (`staff_signup_clusters`, solo staff) para revisar antes de aplicar descuentos.
- **Blindaje de fondo (recordatorio):** la recompensa solo cuenta a referidos que **PAGAN** (plan `full`), no a registros gratis → farmear cuentas gratis da 0€; y el descuento lo **aplica un humano** (staff) tras revisar. Anti-autoref + anti-ciclo + tope −40% siguen vigentes.
- Advisors revisados: las RPCs cerradas a `anon`; el lint `0029` (security-definer ejecutable por *authenticated*) es **esperado** (son RPCs pensadas para el usuario logueado, con guard interno `auth.uid()`/`is_staff()`).

### Estado del sistema de referidos (completo)
Backend del árbol (multinivel, seguro) + atribución por código + vista del cliente en el software + panel de staff (aplicar descuento) + anti-fraude. **Pendiente de producto, no de código:** cerrar el **pricing** (decisión §11.2) antes de activar descuentos reales en facturación (eso lo aplica Alexandro en Stripe; el motor solo calcula elegibilidad).

---

## ADENDO — Sesión del 18 de junio · POS / Caja: diseño y coherencia con los informes

Jose pidió incorporar un **POS** a Mecha (cobro desde el software, referencia: el modo gestor de
novanoidai `web_vercel/web`) y planteó la duda de fondo: **¿doble-contaremos citas y dinero** si
las estadísticas salen hoy de las citas y además metemos un POS que cobra?

**Trabajo de esta sesión (solo diseño + documentación, sin código de POS todavía):**

- **Informe nuevo dedicado:** `informes/ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md`. Contiene el
  análisis completo, el precedente de novanoidai, el modelo de datos propuesto y el plan por fases.
- **Hallazgo que reencuadra la pregunta:** los "ingresos" actuales de Mecha **no son caja real**,
  son **facturación estimada** (precio de catálogo × citas completadas — `informes.web.tsx:646`,
  tooltip en `:213`). El campo `citas.precio_cobrado` existe en BD pero los informes **no lo usan**.
- **Precedente verificado (novanoidai, en producción):** `transacciones_pos` (cobro individual,
  con `cita_id`, método, idempotencia) + `caja_registros` con columna `origen` (trigger consolida
  el POS) + citas usadas **solo como estimación**. Su código evita el doble conteo de forma
  explícita (`caja/page.tsx:394-395`: la agregación POS "NO se suma a registros").
- **Resolución propuesta (recomendada):** **dos capas que se enlazan** — `citas` = verdad
  operativa (ocupación, no-shows, canal, retención); **cobros/caja** = verdad financiera
  (facturación real, método, propinas, arqueo). Se enlazan por `cita_id`; la señal online
  (`pagos`) se **descuenta**, no se suma; **interruptor por negocio** decide si "ingresos" = real
  (POS) o estimado (citas). **No doble-cuenta por construcción**, y el hueco "previsto vs cobrado"
  pasa a ser un KPI de control valioso.
- **Disciplina fiscal (reafirmada):** caja **operativa** (método, propina, descuento, arqueo, IVA
  estimado) se puede hacer ya; **facturación fiscal** (VeriFactu, numeración correlativa = P3)
  **requiere fiscalista** y no se improvisa. Hasta P3, nunca decir "factura/ticket fiscal":
  decimos "recibo/comprobante de cobro".
- **Reparto:** la **caja operativa** (POS-0 botón "Cobrar" + método como etiqueta; POS-1 arqueo +
  informes con interruptor estimado/real) es **íntegramente de Carlos** (no mueve dinero
  electrónico). El **cobro electrónico** (online/QR/Stripe Terminal) y la **fiscalidad** son de
  **Alexandro/fiscalista**.

**Estado:** **diseñado, pendiente de decisión de Jose** (ver §11 del informe nuevo: confirmar la
opción (c), arrancar por POS-0/POS-1, nomenclatura no-fiscal, cuándo entra el fiscalista, producto
sí/no en el POS, y reetiquetar ya "ingresos" → "ingresos estimados"). No bloquea a Alexandro.


---

## Adenda 20 jun 2026 — pulido UI (landing/login/agenda/reseñas) + rehacer demo (Carlos)

Sesión de frontend desplegada a `master` por fases (producción despliega de `master`). Todo
verificado por DOM en el preview (los screenshots se cuelgan por la animación de canvas; el
spotlight in-app y las partículas dependen de `requestAnimationFrame`, pausado en el preview, así
que su render visual no es pixel-verificable ahí, pero la lógica de estado/targeting sí se validó).

- **Fase 1 — bugs rápidos** (`dda65b7d`): "Caja" añadido al `NAV_ITEMS` del Sidebar de escritorio
  (`components/layout/Sidebar.tsx`; la pantalla existía pero era inaccesible en escritorio); scroll
  de Reseñas arreglado (`app/(tabs)/resenas.web.tsx`: `minHeight:100vh` sin overflow → `height:100vh`
  + `overflowY:auto`, patrón de informes).
- **Fase 2 — login** (`4126f815`, `web/acceso.html`): fuera TODAS las partículas (`#embers`) y el
  lecho rocoso (`#rocksCanvas`) + su script (código muerto); dos fondos LISOS ceniza (aside `#1c1814`,
  main `#16171d`); `.bg` plano que sobrescribe las brasas de la landing; eliminada la línea divisoria
  vertical; "Conectando con Google" deja solo el loader sobre ceniza (sin franjas, sin fondo radial);
  "atrás" del navegador vuelve al login (no a la landing) en las pantallas de transición vía
  `pushState`+`popstate`.
- **Fase 3 — landing** (`a22e5751`, `web/index.html`): CTA "Habla con nosotros…" → **"¿Quieres el
  acceso ya?"** (corta "Acceso ya"); fondo detrás de las partículas en CENIZA (`.bg #0c0d12` +
  vignettes frías, efecto agua/espacio); partículas y lecho rocoso desaturados a grises ceniza;
  FPS: cap de render ~36fps con delta, lecho ~18fps, dpr capado a 1.5, menos partículas.
- **Fase 4 — agenda** (`1577762c`, `components/agenda/AgendaCalendar.web.tsx`): rejilla del día
  pasa de blanco "bloc de notas" a crema de marca (`#fffdfb` + zebra/cabecera melocotón + líneas de
  hora cálidas); **KPIs y mini-calendario ahora se colapsan de forma independiente** (botón propio
  con chevron; antes solo existía ocultar el rail entero). Verificado: KPIs y celdas del mini-cal
  aparecen/desaparecen al toggle.
- **Fase 5 — demo/tutorial** (`661ab136`, `web/demo.html` + `app/(tabs)/configuracion.web.tsx`):
  rediseño cinemático (C7). Tour en 3 regiones independientes: **controles Atrás/Siguiente FIJOS
  abajo-centro** (verificado: posición constante en todos los pasos), **sin contador** "Paso X de N",
  **título de fase fijo arriba-centro** (campo `ph`; se mantiene entre sub-pasos de la misma fase),
  **texto cinemático grande con reveal izq→der** colocado en la zona oscura por lado (`side`/guidePos;
  móvil = banda inferior; paso 1 y pasos sin spotlight usan banda con scrim para no tapar lo
  iluminado). Tutorial 2 (configuración): el spotlight enfoca la **primera sub-sección concreta** de
  la pestaña (no el panel entero) y la **pestaña activa se resalta** por encima del velo (z-index
  1001 + fondo blanco + glow).

**Pendiente de validación visual de Jose/Carlos en navegador real** (no verificable en el preview):
(a) el **lado** del texto cinemático por paso en el tour general — está puesto por `side`/guidePos,
fácil de ajustar paso a paso si alguno cae sobre la zona iluminada; (b) el aspecto final de las
**partículas ceniza** de la landing; (c) el spotlight de la **sub-sección** del tutorial 2 (hoy
enfoca la primera sección de cada pestaña — se puede afinar a sub-secciones más concretas, p. ej.
"lunes y martes" en Horarios, añadiendo refs por sub-sección si se quiere granularidad mayor).

---

## Adenda 21 jun 2026 (2ª tanda) — correcciones del feedback de Jose (Carlos)

Tras revisar lo desplegado, Jose pidió correcciones; todas HECHAS y desplegadas a `master` por fases.

- **Landing** (`a216d4cf`): las partículas vuelven a **fuego** (rojo/naranja/oro, chispas) — el
  gris ceniza era una sobre-interpretación. Se mantiene el fondo ceniza oscuro y la optimización
  de FPS. Lecho rocoso y resplandor de base, otra vez cálidos.
- **Login** (`a216d4cf`): el fondo liso quedaba plano y sin marca → ahora **degradado de marca**
  (brasa fuego sobre oscuro cálido) con profundidad; el panel del formulario es transparente para
  no generar franjas en el estado de carga. Sin partículas ni lecho.
- **Demo/tour** (`e087f4e2`):
  - Texto cinemático con **diseño** (relleno en degradado blanco→melocotón→fuego, no blanco plano)
    y **reveal lento izquierda→derecha** (1.7s, borde suave) — antes aparecía de golpe.
  - El texto/título **ya no tapa lo enfocado**: `DemoSpotlight` ahora envía su hueco a `demo.html`
    (postMessage) y `positionTour` coloca el texto en la mayor zona oscura (lado izq/der o banda) y
    baja el título de fase si el hueco invade arriba. Pasos sin spotlight: scrim contenido/redondeado
    (no franja). Tutorial 2 (config): enfoca la **cabecera concreta** de la sección (no toda) y la
    pestaña activa sigue resaltada.
  - **Modal Compartir** rehecho **horizontal** (2 columnas: recompensas+enlace | cómo funciona/árbol)
    para no tener que scrollear en vertical.
- **Agenda** (`2e9c2cb7`): la rejilla "dorada apagada" ahora **resalta**: lienzo blanco ELEVADO
  (sombra) con cabecera cálida definida, sobre el lienzo crema de la app. **Profesionales** también
  se colapsa (coherente con Resumen/Calendario). La **X de Nueva cita** es sticky también en
  escritorio (antes se ocultaba al scrollear).
- **Caja** (`966306ab`): el fichaje ya no dice "tú" sin más → muestra el **nombre del empleado**
  ('Tu fichaje · Nombre') y, en la lista, el nombre de cada miembro. **Visibilidad por rol**:
  propietario/dirección ven la jornada de TODO el equipo; el resto solo la suya. **Registros del día
  descargables** (cobros y fichajes en CSV), estilo modo gestor de novanoidai, para propietario/dir.
- **Informes** (`e79bebb0`): nueva sección **"Caja diaria" (cobrado real)** con desglose por día
  (total/efectivo/datáfono/propinas + nº de cobros) y **CSV descargable**, junto a la comparación ya
  existente Ingresos (estim.) vs Cobrado (real).

**Pendiente de validación visual de Jose** (no verificable en el preview por rAF pausado):
partículas de fuego sobre fondo ceniza de la landing; degradado del login; y el tour en navegador
real (lado del texto por paso ahora es automático según el hueco que reporta el spotlight, pero
conviene confirmarlo y, si algún paso canta, está el campo `side` por paso como override).
**Posible mejora futura (caja/fichajes):** registros descargables por rango de fechas (no solo el
día) y por empleado; hoy la descarga de cobros/fichajes es del día en curso (Caja) y la caja diaria
del periodo (Informes).

---

## Adenda 21 jun 2026 (3ª tanda) — rendimiento + caja por rol/IVA (Carlos)

- **Landing — rendimiento** (`13f448aa`): el lecho de brasas recreaba decenas de gradientes por
  frame (lo más caro). Ahora se **pre-renderiza una sola vez a un canvas offscreen** y cada frame
  solo se bliteа con un breathing global muy ligero → gran subida de FPS sin perder calidad. Las
  chispas siguen siendo fuego (rojo/naranja) sobre fondo ceniza.
- **Caja por ROL** (`02e40e0f`): si el usuario NO es propietario/dirección (owner/admin), la
  pantalla Caja muestra **solo el fichaje** (entrada/salida + su jornada); nada de dinero. El
  propietario/dirección ve todo: arqueo (con **IVA estimado 21%**, operativo no fiscal), cobros,
  citas pendientes, registros CSV.
- **Informes — caja** (`02e40e0f`): la sección Caja diaria añade resumen del periodo (efectivo,
  tarjeta/datáfono, propinas, IVA estim.), columna IVA y fila TOTAL en tabla y CSV.

**Nomenclatura fiscal:** el IVA mostrado es **estimado/operativo** (21% incluido), NO fiscal
(VeriFactu/numeración correlativa siguen siendo P3 con fiscalista). No usar "factura/ticket fiscal".
**Pendiente de validación de Jose:** FPS de la landing en navegador real; y la vista de Caja con
una cuenta de rol no-propietario (profesional/recepción) para confirmar que solo ve el fichaje.

---

## Pendiente — feedback en vivo de la demo (21-22 jun) → ver `informes/HANDOFF-2026-06-22.md`

Jose revisó la demo en vivo y dio feedback NUEVO (no implementado todavía, documentado como tareas
B1–B8 con causa raíz y criterios en `informes/HANDOFF-2026-06-22.md`):
- **Tour**: reveal del texto en orden de escritura (palabra a palabra); bug del salto izq→der entre
  pasos (no revelar hasta posición final); título de fase con contraste (chip oscuro) y bien
  posicionado; texto con elementos de diseño (subrayar palabras clave, acentos); pasos fullscreen con
  texto sobre el fondo CLARO de la app (no scrim oscuro); tutorial 2 (config) títulos en zona oscura
  + resolver que "para en Fórmulas".
- **Modal Recomienda Mecha**: recompensas −40%/−15% protagonistas, "cómo funciona" debajo, y
  diferenciar el enlace que GANA % (referido) del que solo enseña la demo.
- **Caja propietario**: jornada de todo el equipo (incluido el propietario) con horas trabajadas
  calculadas (entrada/salida) y descansos, todo descargable en CSV (confirmar modelo de "descanso").

---

## Adenda 25 de junio de 2026 — Consentimientos RGPD & Corrección de Compilación (IA)

Se implementó el flujo completo de registro de consentimientos RGPD y se resolvieron todos los errores latentes de compilación de TypeScript en el proyecto.

- **Base de Datos (Migración C7 RGPD)**:
  - Se creó el archivo de migración [consentimientos-gdpr.sql](file:///c:/Users/carli/OneDrive/Escritorio/novanoidai/Hairy/migrations/consentimientos-gdpr.sql) para añadir las columnas `consentimiento_datos` y `consentimiento_at` a la tabla `citas`, y `firma_svg`, `ip_registro` y `user_agent` a la tabla `consentimientos_cliente`.
  - Se actualizó el RPC `crear_cita_publica` para registrar automáticamente el consentimiento y recolectar de forma segura en el backend los metadatos de conexión del cliente (`request_ip()` y `user-agent` desde cabeceras HTTP de PostgREST) sin exponer la ID interna del salón al navegador web (RLS).
- **Frontend y Firma del Portal**:
  - Se actualizó `lib/reservaPublica.ts` y `app/r/[slug].web.tsx` para pasar el consentimiento del usuario (`consentimientoDatos`) atómicamente a la llamada del RPC.
  - Se removió el bloque anterior que intentaba escribir en la tabla `consentimientos_cliente` desde el frontend, eliminando la dependencia del negocio ID y previniendo fallos de seguridad RLS.
- **Limpieza de Tipos & Compilación**:
  - Se resolvió el error de `fireGradient` no definido en `RetrasoPropuestaModal.web.tsx` agregando la clave a `DESIGN_TOKENS` en `lib/designTokens.ts`.
  - Se corrigió el error de incompatibilidad de tipos `NodeJS.Timeout` en `components/ui/Pickers.tsx` forzando el contexto del navegador con `window.setTimeout` y `window.clearTimeout`.
  - Se actualizó y validó el entorno a Node `v24.14.0` vía `nvm`, superando la restricción de versión de Metro/Expo.
  - Se comprobó que `npx tsc --noEmit` y `npm run build:web` compilan y exportan la aplicación web a `web/app` con un 100% de éxito.

---

## Adenda 29 jun 2026 — Onboarding "Pon en marcha tu salón" en Avisos (Carlos + Claude)

Checklist guiado para que un salón nuevo configure lo esencial y quede operativo. Desplegado a
master (commit `6fcc796a8`). Spec: `docs/superpowers/specs/2026-06-26-onboarding-checklist-design.md`.

- **Dónde:** panel de **Avisos** de la agenda → tarjeta `OnboardingCard` que abre `OnboardingPanel`
  (`components/onboarding/`, web). La campana enciende su punto si hay onboarding pendiente.
- **Pasos graduados por necesidad objetiva** (`lib/onboarding.ts`): núcleo 1-5 (servicios, equipo,
  horario de cada profesional, horario del salón, datos del negocio) = **operativo** → la tarjeta
  desaparece sola; recomendados 6-8 (reserva online, fotos, recordatorios WhatsApp) con "Omitir";
  opcionales 9-10 (señal, comisiones) solo mencionados.
- **Estado derivado del dato, sin flags ni migración** (`lib/hooks/useOnboardingStatus.ts`): cada
  paso se marca hecho leyendo las tablas reales (el dueño ya tiene RLS de lectura). Un paso se reabre
  solo si se borra el dato. "Configurar →" hace deep-link a la pestaña exacta de Ajustes (`?tab=`).
- **Solo gestores en su negocio propio; nunca en la demo** ni para prospectos free (demo_salon_001).
  "Ahora no" oculta solo en la sesión; en localStorage solo se guardan los recomendados omitidos.
- **Rematado (2ª tanda, 29 jun):** `?focus=horarios` ya abre en Equipo la ficha del primer
  profesional activo (su editor de horario); Ajustes › General tiene "Abrir guía de puesta en
  marcha" que navega a la agenda con `?onboarding=1` y reabre el panel.
- **Diferido:** paridad nativa. La agenda **nativa** (`AgendaCalendar.tsx`) no tiene panel de
  avisos que hospede la tarjeta, así que sería una superficie nueva, no un port directo; el
  producto vivo es la web. Los componentes son `.web` aislados, no rompen el build nativo.
- `npx tsc --noEmit` y `npm run build:web` en verde tras ambas tandas.

---

## Adenda 1 jul 2026 — Inventario v0 (Carlos + Claude)

**Estado: COMPLETO (código listo, pendiente aplicar migraciones en Supabase)**

MVP de inventario para peluquerías implementado según especificación de la auditoría estratégica
(`informes/AUDITORIA_ESTRATEGICA_MECHA_2026-07-01.md`, Sesión 2 → Tarea 4).

**Backend (SQL listo en `migrations/`):**
- `inventario-v0.sql`: Schema básico (213 líneas)
  - `productos` (catálogo: nombre, descripción, categoría, precio, IVA, stock mínimo, código barras, imagen, proveedor)
  - `inventario` (stock actual por negocio: unidades, ubicación, última modificación)
  - `movimientos_inventario` (historial de entradas/salidas/ajustes con contexto)
  - Vista `productos_con_stock` (productos + stock actual + indicador `stock_bajo`)
  - RLS multi-tenant `negocio_id` en las 3 tablas
- `inventario-rpcs.sql`: 9 RPCs `security definer` (687 líneas)
  - `obtener_inventario(p_solo_activos, p_categoria)` → lista productos con stock
  - `obtener_producto(p_producto_id)` → detalle individual
  - `crear_producto(...)` → alta en catálogo + stock inicial
  - `actualizar_producto(...)` → editar campos
  - `registrar_movimiento_inventario(...)` → entrada/salida/ajuste
  - `obtener_movimientos_inventario(...)` → historial paginado
  - `productos_stock_bajo()` → alertas
  - `eliminar_producto(...)` → soft delete (marcar inactivo)
  - `obtener_categorias_productos()` → categorías únicas

**Frontend (UI lista en `app/(tabs)/`):**
- `inventario.web.tsx`: Pantalla completa (1186 líneas, React Native Web)
  - Lista de productos en grid responsive (tarjetas con stock, precio, alertas)
  - Filtros: búsqueda por nombre/código, filtro por categoría
  - Badge "Stock bajo" en header con contador de alertas
  - Modal "Nuevo producto": nombre, descripción, categoría, precio, stock mínimo, unidades iniciales
  - Modal "Ajustar stock": tipo (entrada/salida/ajuste), unidades, motivo, notas, preview stock resultante
  - Modal "Historial": timeline de movimientos con tipo, fecha, unidades, motivo, autor
  - Acciones por producto: ajustar stock, ver historial, eliminar (soft delete)
  - Empty state con CTA "Crear primer producto"
- `inventario.tsx`: Redirect nativo (placeholder)
- Integrado en navegación:
  - Sidebar (`components/layout/Sidebar.tsx`): icono `cube`
  - MobileTabBar (`components/layout/MobileTabBar.tsx`): icono `cube`

**Características v0 (cumple especificación):**
- ✅ CRUD básico de productos
- ✅ Registro de movimientos (entrada/salida/ajuste)
- ✅ Historial de movimientos por producto
- ✅ Alertas de stock bajo (umbral configurable por producto)
- ✅ Búsqueda y filtrado
- ✅ Responsive (móvil + escritorio)
- ❌ NO incluido en v0 (para futuro): integración automática con cobros, predicción de demanda, proveedores, multi-almacén

**Pendiente:**
- Aplicar las migraciones `inventario-v0.sql` e `inventario-rpcs.sql` en Supabase (requiere acceso al proyecto; el CLI no está instalado localmente)
- QA E2E con datos reales tras aplicar migraciones
- Paridad nativa (diferido como el resto de la app)

**Archivos clave:**
- `migrations/inventario-v0.sql` — schema
- `migrations/inventario-rpcs.sql` — RPCs
- `app/(tabs)/inventario.web.tsx` — UI
- `informes/AUDITORIA_ESTRATEGICA_MECHA_2026-07-01.md` — especificación

---

## Adenda 1 jul 2026 — Backlog de producto: ideas emergentes vs Booksy/Fresha (Carlos + Claude)

**Contexto:** sesión de ideación centrada en explotar el diferencial real de Mecha (verticalización
peluquería + capa de IA WhatsApp/voz) en vez de copiar funciones genéricas que ya tienen
Booksy/Fresha/Treatwell. Carlos decide reparto y alcance el 1 jul.

### Reparto decidido

| Feature | Dueño | Nota |
|---|---|---|
| Pasaporte de color con IA | **Alexandro** | Usa historial de fórmulas (`formula_producto`, `formula_tono`, `resultado_satisfactorio`) para que el agente sugiera la fórmula antes de la cita. Reduce el riesgo de mal tinte (miedo #1 al cambiar de peluquero); ata a la clienta al salón porque su historial vive ahí, no en la cabeza del profesional. |
| Recompra de producto por WhatsApp | **Alexandro** | Cruza "vendió producto para casa hace X semanas" con el ciclo típico de agotamiento → el agente WhatsApp ya existente dispara un mensaje de recompra con enlace de pago (Stripe señal ya integrado). Cierra el círculo Inventario→Portal→Pagos desplegado hoy (ver adenda Inventario v0 arriba). |
| Alerta de fuga de clientas | **Carlos** | Cruza niveles de fidelización + frecuencia histórica ("María no viene desde hace 47 días, su media es 32") → aviso al salón o WhatsApp automático con oferta. Se apoya en fidelización/recompensas ya desplegado (§ arriba). |
| Objetivos/bonus gamificados por profesional | **Carlos** | Visible en "Mi jornada", ligado al ranking de equipo ya construido (commit `2898baa47`). Ayuda a retención de talento. |
| Intercambio de turnos entre compañeros | **Carlos** | Con aprobación del gestor; hoy esa fricción operativa se resuelve por WhatsApp informal fuera del sistema. |
| Reserva de grupo (varias personas, 1 cita) | **Carlos** | Portal público — típico en bodas/eventos, ausente en Booksy/Fresha para peluquerías pequeñas. |
| **Multi-idioma (software + landing)** | **Carlos** | Alcance nuevo añadido el 1 jul. Cubre tanto la app de gestión (Expo/react-native-web) como la landing pública (HTML estático) — hoy todo 100% en español, lo que limita vender fuera de España o a turistas. Prioridad en los idiomas más comunes, con arquitectura preparada para ampliar a más adelante (no hardcodear a un nº fijo de idiomas). |
| Comparativa de coste vs Booksy/Fresha | **Carlos** | Landing/venta — dato concreto que cierra ventas: ellos cobran comisión por reserva, Mecha no. |
| Gancho viral con referidos multinivel | **Carlos** | El árbol de referidos multinivel ya existe (15 jun, `admin.html` migrado); usarlo como gancho: "trae otro salón, gana meses gratis". |

### Descartado / diferido (no entra en esta tanda)

- **Tarjetas regalo (gift cards):** aplazadas — motivo dado: el cobro vía Stripe no está lo bastante
  montado para este flujo todavía. *Nota: hoy Stripe ya cubre la señal P1 online (`crear-checkout-senal`
  / `stripe-webhook`, §8), pero no existe un catálogo de venta de productos/gift cards — revisar cuándo
  se retoma este punto.*
- **Marketplace:** se mantiene fuera por disciplina del dossier — ya estaba en "No hacer aún" (junto con
  contabilidad y precios dinámicos, ver cabecera del CLAUDE.md). La versión "light y ya cableada" que sí
  se hace es la recompra de producto por WhatsApp de arriba: mismo beneficio (venta de producto) sin la
  complejidad de un marketplace multi-salón real.

### Próximo paso

El bloque de Carlos son 6 features + un roll-out de internacionalización completo (software + landing) —
alcance grande para una sola tanda. Pendiente secuenciar en sesiones de trabajo, con el mismo patrón que
la Sesión 1 / Sesión 2 del 1 jul (`informes/PROMPT-SESION-1.md`, `informes/PROMPT-SESION-2-COMPLETO.md`).
- `informes/PROMPT-SESION-2-COMPLETO.md` — prompt de referencia

> **Nota comparativa/referidos (2 jul):** al empezar a ejecutar el bloque se comprobó que dos ítems ya
> estaban construidos: la **comparativa de coste vs Booksy/Fresha** vive en `web/index.html` (sección
> "vs") + `web/carta-comercial.html` (dossier con calculadora de ROI), y el **gancho viral de referidos**
> está completo (árbol multinivel real con % de descuento decreciente — no "meses gratis" —, modal viral
> en `web/demo.html` y pestaña "Invita y gana" en Configuración del software). Ambos quedan como HECHO.

---

## Adenda 2 jul 2026 — Alerta de fuga de clientas (Carlos + Claude) — HECHO ✅

Primer ítem construido del backlog de arriba. Detecta clientas que se retrasan respecto a su patrón
habitual de visitas, lo pone delante del dueño, y deja el motor/outbox preparados (OFF) para que
Alexandro conecte el WhatsApp automático más adelante — mismo molde que lista de espera.

**Diseño:** `docs/superpowers/specs/2026-07-02-alerta-fuga-clientas-design.md` ·
**Plan:** `docs/superpowers/plans/2026-07-02-alerta-fuga-clientas.md`

**Backend (`migrations/alerta-fuga-clientas.sql`, aplicado y verificado en Supabase):**
- Rellena las columnas ya existentes pero muertas `clientes.total_visitas` / `ultima_visita` /
  `frecuencia_dias` (existían en el schema y se mostraban en la ficha, pero nada las escribía).
- `procesar_alertas_fuga()` (`service_role`, cron-pull ~1-2/día): recalcula agregados (media de los
  huecos entre las últimas 6 citas completadas, mínimo 3 visitas), detecta riesgo
  (`dias_desde_ultima > frecuencia * 1.4`, sin cita futura, no bloqueada) y gestiona el outbox
  `fuga_clientas_avisos` (inserta nuevas, descarta las que ya volvieron). Todo gateado por
  `negocio_config.config.fugaClientasActivo` (default **false**); el recálculo de agregados corre siempre.
- Adjunta como oferta la recompensa activa de mayor umbral que la clienta ya cumple, si hay.
- `clientes_en_riesgo_fuga()` (`authenticated`, gateada por `auth.uid()`): lectura para el frontend.
- Verificado E2E con datos sintéticos en transacción revertida: clienta con ritmo de 30 días y 60 sin
  volver → flagged correctamente. Advisors de seguridad sin fallos nuevos.

**Frontend:**
- **Clientes** (`app/(tabs)/clientes.web.tsx`): nuevo chip/filtro "Fuga" con contador; en la fila, píldora
  "Fuga · Nd" con tooltip (días de retraso, media, oferta sugerida). Deep-link `?filtro=fuga`.
- **Avisos de agenda** (`components/agenda/AgendaCalendar.web.tsx`): tarjeta "N clientas en riesgo de
  fuga" en el panel de la campana, solo para gestores en su negocio propio (nunca demo), que enlaza al
  filtro de Clientes.

**Pendiente (Alexandro):** workflow n8n que llame a `procesar_alertas_fuga()` a diario, drene
`fuga_clientas_avisos` y envíe el WhatsApp con la oferta. Plantilla Meta nueva a validar.

---

## Adenda 2 jul 2026 (2ª tanda) — Backlog de Carlos: 4 features + i18n — HECHO ✅

Continuación autónoma del backlog. Todo aplicado en Supabase y desplegado a `master`. Lo que toca
WhatsApp/n8n queda abierto para Alexandro (mismo criterio de reparto).

**1. Objetivos / bonus gamificados por profesional** (`migrations/objetivos-profesional.sql`,
`app/(tabs)/mi-jornada.web.tsx`). El gestor fija objetivos mensuales por profesional (dinero, servicios,
horas o % de reposo aprovechado) con bonus opcional, desde la vista **Equipo** de Mi jornada. El
profesional ve su progreso con barras en su vista personal. Mismas métricas que `equipo_jornada_ranking`
(helper `objetivo_valor_actual`), mismo gate de dinero. RPCs: `guardar_objetivo_profesional`,
`eliminar_objetivo_profesional`, `objetivos_negocio_progreso`, `mis_objetivos_progreso`.

**2. Intercambio de turnos entre compañeros** (`migrations/turnos-intercambio.sql`, sección en
`mi-jornada.web.tsx`). Flujo pedir → acepta compañero → aprueba gestor (rechazable/cancelable en cada
paso), como bitácora compartida que sustituye el WhatsApp informal. Tabla `turnos_intercambio` + RPCs
`solicitar/responder_companero/responder_gestor/cancelar/listar`. NO reasigna citas automáticamente
(los horarios son plantilla semanal; el cambio se coordina con la operativa real).

**3. Reserva de grupo en el portal** (`migrations/reserva-grupo.sql`, `components/portal/PortalGrupoModal`,
`app/r/[slug].web.tsx`, `lib/reservaPublica.ts`). Chip "¿Venís en grupo?" en el paso de servicio →
modal con N asistentes (máx 6), cada uno su servicio y profesional, todos a la misma hora. Usa las
columnas `citas.grupo_id`/`orden_en_grupo` ya existentes; interseca disponibilidad para ofrecer solo
horas comunes. RPC `crear_cita_publica_grupo` (anon, sin depósito online en v0 → nace `confirmada`,
mismo anti-abuso que `crear_cita_publica`).

**4. Multi-idioma (software + landing)** — MVP con arquitectura extensible, 7 idiomas (es/en/fr/de/it/pt/ca):
- **Landing** (`web/assets/landing-i18n.js` + `data-i18n` en `web/index.html`): switcher en la nav,
  detección por navegador + persistencia en localStorage. Traducidos nav + CTAs principales; ampliar =
  añadir claves al diccionario. Verificado en preview (nav es→en al pulsar).
- **Software** (`lib/appI18n.ts` + `lib/hooks/useAppLang.ts`): misma API que `portalI18n` (`makeAppT`),
  mini-store global sin Context. Selector en Configuración → Cuenta. Traducidos nav (Sidebar +
  MobileTabBar) y textos comunes; el resto del software sigue en español y se amplía sin tocar
  componentes. Los mensajes automáticos a clientas siguen usando el idioma del portal del salón.

**Nota:** comparativa vs Booksy/Fresha y gancho de referidos del backlog ya existían (ver nota arriba),
así que quedan cubiertos los 6 items de Carlos + el roll-out de i18n. Pendientes del backlog global:
gift cards (diferido, falta catálogo de venta Stripe) y los items de Alexandro (pasaporte de color IA,
recompra por WhatsApp). tsc y build:web en verde.

---

## Adenda 3 jul 2026 — Tips de producto en pantallas de carga (Carlos + Claude) — HECHO ✅

Idea surgida en el brainstorm del onboarding cinematográfico con IA (spec aparte, mismo día); esta
pieza es independiente. Spec completo en
`docs/superpowers/specs/2026-07-03-loading-tips-design.md`.

Bajo el spinner de las pantallas de carga se muestra ahora un consejo real de uso de Mecha (pool de 19
tips, uno fijo por carga, sin repetir el último mostrado), en las tres superficies con loader
propio: `PageLoader` de la app de gestión (`components/ui/DesignComponents.tsx`, llega gratis a las 6
pantallas que ya lo usan: clientes, reseñas, portal de reseña, inventario, configuración, mi perfil),
el login (`web/acceso.html`) y el arranque de la demo pública (`web/demo.html`). Si un loader lleva más
de 7s sin resolver, el tip se sustituye por un aviso de conexión en vez de seguir "vendiendo" producto.
Contenido en dos fuentes hermanas sin build compartido: `lib/loadingTips.ts` (app) y
`web/assets/loading-tips.js` (web estática) — mantener ambas en sync a mano si se edita la lista.

Verificado: `tsc --noEmit` y `build:web` limpios; tip visible y sin overflow a 375px en `acceso.html` y
`demo.html`; `clientes.web.tsx` carga sin errores de consola dentro del iframe de la demo. Desplegado a
`master` (commit `f3002ff77`).

---

## Adenda 3 jul 2026 — Asistente de onboarding cinematográfico con IA (Carlos + Claude) — HECHO

Sustituye (complementa) el checklist manual de Avisos: la primera vez que un gestor entra a su negocio
propio ya operativo-elegible, un asistente a pantalla completa (sin aspecto de chat, "fotogramas" que se
suceden) le va guiando por lenguaje natural para crear servicios, equipo, horario del salón, datos del
negocio, reserva online y notificaciones — con IA que interpreta la respuesta libre via function-calling
forzado (no orquesta el flujo, solo redacta/interpreta por tema; el cliente controla la secuencia y
ejecuta las escrituras reales). Spec: `docs/superpowers/specs/2026-07-03-onboarding-ia-cinematico-design.md`.
Plan: `docs/superpowers/plans/2026-07-03-onboarding-ia-cinematico.md`.

- **Edge Function `onboarding-agent`** (desplegada, `verify_jwt: true`): proxy sin acceso a datos de
  negocio, solo verifica owner/admin y llama a OpenRouter (mismo patrón que `agenda-asistente`).
- **`lib/onboardingAgent.ts`**: orden fijo de temas, fallbacks estáticos (funciona SIEMPRE aunque la IA
  falle/tarde: campos simples deterministas, presets de horario sin IA, botones sí/no sin IA para
  reserva online/notificaciones), y `ejecutarAccion` que escribe con `supabase-js` bajo el mismo RLS que
  ya usan Ajustes/Equipo — sin RPCs ni migraciones nuevas.
- **`components/onboarding/OnboardingAgentOverlay.web.tsx`** (+ stub nativo): overlay cinematográfico
  montado en `app/_layout.tsx`. Solo dos acciones piden confirmación explícita (invitar por email,
  activar reserva online); el resto se ejecuta sin fricción. Disparo automático una sola vez
  (`localStorage`, clave `mecha-onboarding-agent:<negocio_id>`); si se salta o cierra a medias, el
  checklist manual de Avisos sigue recogiendo lo pendiente sin cambios.

**Pendiente (manual, usuario):**
1. ~~Rotar la clave de OpenRouter usada para pruebas~~ — HECHO (3 jul, confirmado por Carlos).
2. ~~Confirmar el secreto `OPENROUTER_API_KEY` en Supabase Dashboard~~ — HECHO (3 jul, clave nueva ya
   puesta en Edge Functions → Secrets del proyecto `vtrggiogjrhqtwbhbgia`).
3. Verificación manual end-to-end en navegador con una cuenta de negocio propio recién operativo-elegible
   (creación de servicios/equipo/horario reales, incluida la confirmación de invitación por email) — no
   ejecutada por el agente para no crear datos ni enviar emails reales sin supervisión directa. **Único
   pendiente real que queda.**

Advisors de seguridad de Supabase revisados: sin hallazgos nuevos (la función no toca tablas ni RLS).
`tsc --noEmit` y `build:web` en verde en las 5 tareas de código del plan.

---

## Adenda — Capa IA "Chispa" Sesion 2: Seguridad (RBAC + consentimiento + regla de salud) — HECHA (5 jul)

Endurecimiento de seguridad del edge `agenda-asistente` (correctness-critical, "no fugas"). Se apoya
sobre la Sesion 1 (bloques + Chispa global, en curso en paralelo) pero es independiente de su UI.

- **RBAC de tools:** el set de tools que se DECLARA al LLM se filtra por rol canonico derivado del JWT
  (`profiles.role` -> `roleOf`/`can`, espejo de `lib/permissions.ts` en
  `supabase/functions/agenda-asistente/permisos.ts`). Un Profesional no ve `resumen_informes` (nueva
  tool de informes, gateada por `informes.ver`) ni `cambiar_config` (solo propietario); las escrituras
  solo se declaran con scope != none. Fail-closed: tool desconocida nunca se declara. Test:
  `permisos.test.ts`.
- **Consentimiento por cliente:** columna `clientes.consiente_ia` (migracion
  `migrations/ia-consentimiento-clientes.sql`, aplicada via MCP; opt-out, default true, base
  legal contrato para datos operativos; **pendiente externo: visto bueno DPO/abogado**). Si es false,
  el cliente es invisible para la IA (filtro `.eq('consiente_ia', true)` en `buscar_cliente`,
  resolucion de `crear_cita`, y filtro por nombre de `listar_citas`; en `listar_citas` se anula el
  `cliente_id` de los no consintientes). Toggle en la ficha de clienta (Consentimientos).
- **Regla dura de salud:** lista BLANCA de campos (`whitelist.ts`, `proyectarClienteIA`): al LLM solo
  viajan `id, nombre, telefono, total_visitas, ultima_visita, primera_visita, ticket_medio,
  frecuencia_dias`. `alergias`, `sensibilidades_cuero` y `notas` NUNCA. Segunda red fail-closed:
  `assertSinCamposProhibidos` sobre cada resultado de tool antes de serializar. Test `whitelist.test.ts`
  falla si un campo de salud entra al payload.
- **Auditoria:** cada conversacion se registra en `conversaciones_ia` (RPC `registrar_conversacion_ia`),
  incluida la ruta de agotamiento de pasos.
- **Verificado:** (a) RBAC Profesional sin informes -> deterministico en `permisos.test.ts`;
  (b) clienta con `consiente_ia=false` no aparece — probado a nivel de datos (query vacia) y E2E en vivo
  contra el edge desplegado (Ana Ruiz oculta, control CARLOS visible); (c) sin campos de salud en el
  payload — `whitelist.test.ts` + reproduccion del resultado real de `buscar_cliente` con salud
  centinela plantada (cero fugas) + comportamiento en vivo (Chispa redirige a la ficha, no revela
  alergias). Edge redesplegado (CLI, byte-perfect). Advisors de seguridad: sin hallazgos nuevos.
  `tsc --noEmit` y `build:web` en verde.
