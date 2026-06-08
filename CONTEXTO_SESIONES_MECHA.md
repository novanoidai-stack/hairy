# 🧭 CONTEXTO DE SESIÓN — MECHA (lee esto primero)

> **Para qué sirve este archivo:** dárselo a cualquier sesión nueva de Claude (o a un compañero) para que entienda Mecha en 5 minutos, **sin re-explorar el repo y sin rehacer lo que ya existe**, y para que la parte de **Carlos** (frontend/UX) se pueda **ejecutar ya**.
>
> **Documentos hermanos en esta misma carpeta:**
> - `INFORME_MAESTRO_MECHA.md` → estado real detallado por módulo + reparto Carlos/Alexandro (fuente de verdad del estado).
> - `ANALISIS_COMPARATIVO_MECHA.md` → comparativa con Booksy/Fresha. ⚠️ **Está desactualizado: infravalora lo que ya está hecho.** Úsalo solo como inventario de funciones del mercado, no como estado real.
> - **Este archivo** → arranque rápido + **desarrollo ejecutable de la parte de Carlos** (C1–C14, con C1 al detalle).
>
> **Última actualización:** 8 de junio de 2026.

---

## 1. Arranque rápido para una sesión nueva

### 1.1 Qué es Mecha
SaaS de gestión integral para **peluquerías / barberías**, multi-tenant. Rebrand en curso de "Hairy" → **"Mecha"** (identidad fuego, fondo crema cálido). Se diferencia por dos cosas: **verticalización profunda en peluquería** (fichas técnicas de color, tiempos de reposo, perfiles de riesgo) y una **capa de IA** (voz + WhatsApp + gestión inteligente) que lleva Alexandro.

### 1.2 Equipo y roles
- **Jose** — Product Owner, experto del sector.
- **Carlos (+ Claude)** — **Frontend / UX** y **backend ligero** (CRUD/consultas Supabase simples). **Sin IA.**
- **Alexandro** — Backend pesado, pagos/Stripe, **toda la IA**, integraciones externas (OAuth), envío real de mensajes.

### 1.3 Reglas no negociables (aplican a todo el código)
1. **No recrear lo que ya existe.** Verifica en el código antes de planificar (mira §3 y §4). El comparativo miente por defecto a la baja.
2. **Código en inglés, comentarios en español.**
3. **Cero emojis en la UI del producto** (sí se permiten en docs como este).
4. **Multi-tenant siempre por `negocio_id`** en cada consulta a Supabase.
5. **Sin `any` gratuito** en TypeScript; `fetch` nativo.
6. **Patrón de plataforma:** cada pantalla tiene `archivo.tsx` (nativo) y `archivo.web.tsx` (web). Hoy **la web es la superficie rica**; el nativo va por detrás (§2).

### 1.4 Stack real (verificado en `package.json`)
- **App:** Expo `~54` + **expo-router `~6`** (rutas por archivos), React Native `0.81.5`.
- **Web:** **react-native-web `0.21`** — misma base de código; se exporta con `expo export -p web` a `web/app/`.
- **Datos:** **Supabase** (`@supabase/supabase-js 2.104`), proyecto Hairy **`vtrggiogjrhqtwbhbgia`** (distinto del de NovoBarber). Cliente en `lib/supabase.ts`.
- **Fechas:** `date-fns 3.6` (locale `es`). **Animación/gráficos:** `react-native-reanimated`, `react-native-svg`, `react-native-calendars`.
- ⚠️ **NO hay Stripe** y **NO hay librería de charts** (los gráficos de informes son SVG/barras a mano).

### 1.5 Cómo correr
- Dev: `npx expo start` (web: tecla `w`).
- Export web: `npm run build:web` → genera `web/app/`. Local: `npm run web:local`.
- Deploy: **Vercel** (`vercel.json`).

### 1.6 Skills a cargar según la tarea (en `.claude/skills/`)
- `hairy-design-system` → **siempre** antes de tocar UI (tokens, tipografía, patrón `.web.tsx`, anti-deriva).
- `hairy-agenda-rules` → antes de tocar agenda/calendario/citas (estados, fases activa/reposo, encadenados).
- `hairy-domain-data` → al tocar clientes, equipo, servicios, caja o datos Supabase.
- `hairy-ui-craft` → cuando el objetivo sea **elevar/pulir** UI (animaciones, micro-interacciones, evitar el "look IA genérico").
- `react-forms-zod-expert` → para cualquier formulario (reserva, alta de cliente, onboarding).
- `hairy-design-router` → si no sabes qué skills activar.

### 1.7 Migraciones
Carlos autoriza a Claude a **aplicar migraciones Supabase de Hairy** con el conector MCP (no las aplica a mano). Las migraciones viven en `migrations/*.sql`.

---

## 2. Mapa del repo y arquitectura

```
Hairy/
├─ app/                      # PRODUCTO (expo-router)
│  ├─ (tabs)/                # agenda(index), clientes, equipo, informes, configuracion
│  │  └─ *.tsx + *.web.tsx   # nativo + web por pantalla
│  ├─ screens/               # nueva-cita, agenda-detalle, configuracion
│  └─ login*.tsx
├─ components/
│  ├─ agenda/                # AgendaCalendar(.web), AgendaView, AppointmentCard
│  ├─ layout/Sidebar.tsx
│  └─ ui/                    # MechaMark, Pickers, SettingsAtoms, TText, DesignComponents…
├─ lib/                      # auth, supabase, permissions, horarios, constants,
│  │                         # designTokens, theme, motion, syncAlergias, calendarContext
│  ├─ hooks/useResponsive.ts
│  └─ utils/appointment.ts
├─ migrations/*.sql          # roles-permisos, staff-cuentas, solicitudes-y-plan-free,
│                            # cliente-fotos, recurring-blocks, demo-*
├─ web/                      # landing pública + export (index, demo, reservar, legales) + web/app/
└─ project/                  # prototipos HTML originales (handoff de Claude Design)
```

**Desnivel web↔nativo (importante):** las versiones `.web.tsx` son mucho más completas. Ej.: `AgendaCalendar.web.tsx` 6.075 líneas vs `AgendaCalendar.tsx` 813; `clientes.web.tsx` 2.622 vs `clientes.tsx` 976. Al planear "paridad" o features nuevas, asume que **web es la referencia** y el nativo es el que hay que subir.

**`web/reservar.html` NO es la reserva del cliente final:** es una reserva de **llamada comercial** con Mecha. La reserva online del cliente (C1) **no existe todavía** — es el trabajo nº1 de Carlos.

---

## 3. Estado real resumido (detalle en `INFORME_MAESTRO_MECHA.md`)

| Área | Estado | % vs Booksy/Fresha (est.) |
|---|---|---|
| Agenda / reservas internas | Muy completa (drag&drop, encadenados, fases activa/reposo, vista mes) | ~95% |
| Clientes / CRM | Muy completa + vertical único (ficha de color, riesgo, sensibilidades) | ~90% |
| Configuración | Extensísima, con pantallas ya maquetadas para fases futuras | ~85% |
| Sistema de diseño / marca | Rebrand fuego a nivel de tokens (claro + oscuro) | ~85% |
| Equipo y roles | 4 roles + capacidades + horarios/turnos/vacaciones/comisiones | ~75% |
| Informes / analítica | Real (KPIs, ocupación, retención, comisiones, export CSV+PDF) | ~75% |
| **Cara al cliente final** (auto-reserva, recordatorios, reseñas) | **Casi nada** | **~10%** ← foco |
| Pagos | Cero (hay UI de depósitos, sin motor) | 0% |
| Marketing / fidelización | Cero (hay UI de notificaciones, sin motor) | ~5% |
| Inventario / retail | Cero | 0% |

**Conclusión:** el núcleo de gestión ya compite. El agujero es **lo que ve y usa el cliente final** + crecimiento. Ahí es donde Carlos aporta más.

---

## 4. Esquema de datos y lógica reutilizable (no reinventar)

### 4.1 Tablas y columnas (confirmadas leyendo el código)
- **citas**: `id, negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera, estado, canal, creado_por, notas, formula_(producto|tono|tiempo_min|resultado|notas)`.
- **servicios**: `id, negocio_id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, activo, min_antelacion_min` *(faltan por añadir: `reservable_online`, `prepago_requerido`)*.
- **profesionales**: `id, negocio_id, nombre, color, activo, categoria`.
- **clientes**: `id, negocio_id, nombre, telefono, alergias` *(`email` por confirmar)*.
- **horarios_profesional**: `profesional_id, dia_semana (0=Dom..6=Sab), hora_inicio, hora_fin, turno`.
- **bloqueos_profesional**: `profesional_id, tipo, motivo, inicio, fin`.
- **duraciones_profesional** y **professional_service_overrides**: overrides de duración/precio/activo por profesional+servicio.
- **profiles**: `id, email, nombre, negocio_id, role(owner|admin|employee|recepcion), plan(free|full), trial_ends_at`.
- **solicitudes** (leads), **staff** (allowlist equipo Mecha), **cliente_fotos** (galería).

### 4.2 Enumeraciones (`lib/constants.ts`)
- **Estados de cita:** `confirmada · completada · cancelada · no_presentada`.
- **Canales:** `manual · web · whatsapp · agente_voz · asistente_ia` ← el modelo **ya prevé** la reserva web y la IA.
- **Horario salón (demo):** 09:00–20:00, intervalos de **15 min** (`INTERVALO_MINUTOS`).
- **Roles canónicos** (`lib/permissions.ts`): `propietario · direccion · recepcion · profesional`, con capacidades atómicas (`can(profile, 'cap')`).

### 4.3 Lógica reutilizable clave
- `lib/horarios.ts` → `franjasDelDia(profId, diaSemana)`, `dentroDeAlgunaFranja()`, `validarHorarioLaboral(profId, inicio, fin)` (respeta turnos / horario partido).
- `lib/utils/appointment.ts` → `isTimeSlotOccupied(testStart, testEnd, citas, profId)` (maneja solape con fase activa, reposo y segunda fase activa).
- **Resolución de duración** (orden de prioridad, ver `app/screens/nueva-cita.tsx`): manual → `professional_service_overrides` → `duraciones_profesional` → `servicios` (default).
- **Flujo de alta de cita** (`nueva-cita.tsx` → `guardar()`): valida antelación → bloqueos → horario laboral → 3 chequeos de solape de fases → `insert` en `citas`. **Replicar este orden** en cualquier creación de cita.
- **Seguridad/acceso:** patrón de **RPC `security definer`** ya usado (`is_staff`, `set_member_role`, `staff_grant_full_access`, `use_demo_visit`) y **acceso `anon`** ya existente (`solicitudes`: `insert to anon`). Es el patrón a seguir para el portal público.

---

## 5. Reparto Carlos / Alexandro

**Es de Carlos** si cumple TODO: (1) valor en interfaz/UX o datos simples; (2) no envía mensajes reales; (3) no mueve dinero; (4) no usa IA; (5) no integra OAuth de terceros. Si falla 2–5 → **Alexandro** (o handoff).

- **Carlos:** todo el frontend/UX + CRUD/consultas Supabase simples + migraciones ligeras con patrón existente.
- **Alexandro:** pagos/Stripe, motor de envío (email/SMS/WhatsApp), IA (Retell/n8n/gestión), integraciones (Google/Instagram), inventario con proveedores, y **el motor de las features cuya UI hace Carlos** (avisos de waitlist, petición de reseñas, premios de fidelización).
- **Handoff típico:** Carlos monta UI + almacenamiento; Alexandro conecta el motor.

---

## 6. PARTE DE CARLOS — desarrollada (C1–C14)

> Orden por impacto. Cada tarea: **Qué · Por qué · Alcance · Reutiliza · Dependencias · "Hecho cuando" · Esfuerzo**.
> Leyenda esfuerzo: **S** ≤2 d · **M** 3–6 d · **L** 8–12 d · **XL** continuo.

### 🥇 C1 — Reserva online pública  *(esfuerzo: L)*
- **Qué:** una página pública donde el **cliente final** del salón elige servicio, profesional y hora, y reserva él solo (24/7), sin entrar en la app de gestión.
- **Por qué (barbero):** es **el motivo nº1 por el que un barbero elige Booksy/Fresha**: que sus clientes reserven solos y le llene la agenda sin llamadas ni WhatsApp. Hoy Mecha no lo tiene → es el mayor acercamiento posible.
- **Por qué (cliente):** reservar a las 23:00 desde el sofá, ver huecos reales, sin llamar.
- **Alcance v1:** wizard de 6 pasos (servicio → profesional/"cualquiera" → fecha+hueco → datos → resumen → confirmación), cálculo de huecos reales, creación de cita con `canal='web'`, página por **slug** del negocio. Señal con Stripe en C1b (handoff).
- **Reutiliza:** `horarios.ts`, `appointment.ts`, resolución de duración, `constants.ts`, sistema de diseño. Ver **§7** para el diseño técnico completo.
- **Dependencias:** capa de datos pública (migración: slug + RPCs) → la hace Carlos. Señal → handoff con Alexandro (C1b).
- **Hecho cuando:** desde `/r/<slug>` se completa una reserva y aparece en la agenda interna en el hueco correcto, respetando bloqueos/reposos/antelación.

### 🥈 C2 — Lista de espera (waitlist)  *(M)*
- **Qué:** si un hueco está lleno, el cliente (o recepción) se apunta a una lista; cuando se libera por cancelación, se avisa.
- **Por qué:** rellena huecos que de otro modo se pierden → más ingresos y menos agenda vacía. Muy demandada y la competencia la tiene.
- **Alcance (Carlos):** tabla `lista_espera`, UI de alta desde una franja llena, vista de "huecos liberados" y **botón de aviso manual**.
- **Reutiliza:** detección de huecos de C1; patrón de tablas multi-tenant.
- **Dependencias:** **aviso automático** (al cancelarse una cita) → Alexandro (motor de envío). El flujo manual es 100% de Carlos.
- **Hecho cuando:** se puede apuntar a alguien, ver la lista y, al cancelar una cita, marcar/avisar al siguiente.

### 🥉 C3 — Reseñas / valoraciones  *(M)*
- **Qué:** captar valoración (estrellas + texto) tras una cita completada y mostrarla en ficha de cliente y de profesional, con media.
- **Por qué:** prueba social = confianza y captación. Booksy/Fresha lo usan como reclamo.
- **Alcance (Carlos):** tabla `resenas`, formulario de captura, media y listado, moderación básica (ocultar).
- **Dependencias:** **pedir la reseña** por mensaje tras la cita → Alexandro. La captura y el display son de Carlos.
- **Hecho cuando:** una reseña enviada aparece agregada en los perfiles correspondientes.

### C4 — Gráficos de tendencia en informes  *(S–M)*
- **Qué:** añadir líneas de evolución temporal (ingresos/citas/ocupación por semana o mes) a `informes.web.tsx`.
- **Por qué:** los datos **ya se calculan**; hoy se muestran como barras simples. Una línea de tendencia eleva muchísimo la percepción de "BI serio".
- **Alcance:** componente de gráfico de líneas con `react-native-svg` (ya instalado; no añadir librería pesada si se puede evitar).
- **Reutiliza:** todos los `useMemo` de cálculo ya existentes en `informes.web.tsx`.
- **Hecho cuando:** el periodo seleccionado muestra evolución temporal, no solo totales.

### C5 — Bloquear clientes  *(S)*
- **Qué:** marcar un cliente como bloqueado y que no pueda reservar (ni online ni interno).
- **Por qué:** protección frente a clientes problemáticos / no-shows reincidentes. La config ya menciona "no-shows reincidentes".
- **Alcance:** columna `bloqueado` (+ motivo) en `clientes`, UI en la ficha, chequeo en C1 y en `nueva-cita`.
- **Hecho cuando:** un cliente bloqueado no aparece como reservable y se avisa al intentar agendarlo.

### C6 — Etiquetas / segmentos manuales  *(S–M)*
- **Qué:** etiquetas personalizadas sobre el cliente (además de las automáticas VIP/Habitual/Nuevo) + filtro por etiqueta.
- **Por qué:** base para campañas y para organizar la cartera ("fieles", "solo color", etc.).
- **Alcance (Carlos):** columna array `etiquetas` en `clientes`, UI de asignación y filtros en `clientes.web.tsx`.
- **Dependencias:** **usar** los segmentos para enviar campañas → Alexandro. Crear/filtrar = Carlos.

### C7 — Formularios / consentimientos personalizados  *(M)*
- **Qué:** constructor simple de campos + formulario digital (p. ej. consentimiento para químicos, ficha de entrada) guardado por cliente/cita.
- **Por qué:** ahorra papel y cubre legal/sanitario; la competencia lo ofrece.
- **Alcance:** tablas `formularios` / `respuestas_formulario`, render dinámico, guardado en Supabase.
- **Reutiliza:** skill `react-forms-zod-expert` (validación, wizard).
- **Hecho cuando:** se define un formulario y un cliente lo rellena y queda guardado.

### C8 — Buffer entre citas  *(S)*
- **Qué:** tiempo de margen configurable que se respeta al colocar citas (limpieza/preparación).
- **Por qué:** evita encadenar sin respiro; la competencia lo tiene. (Mecha ya tiene reposo, pero no un buffer fijo.)
- **Alcance:** campo en configuración + aplicarlo en la generación de huecos (C1) y en `nueva-cita`.

### C9 — Recursos / salas / equipos  *(M)*
- **Qué:** entidad "recurso" (sala, lavacabezas, aparato) asignable a una cita, con control de que no se solape.
- **Por qué:** salones con recursos limitados lo necesitan; evita dobles reservas del mismo recurso.
- **Alcance:** tabla `recursos` + asignación en la cita + chequeo de solape.
- **Reutiliza:** el patrón de solape de profesional (`isTimeSlotOccupied`) adaptado a recurso.

### C10 — QR de reserva  *(S)*
- **Qué:** generar un QR que apunta al portal de reserva (C1) para imprimir/compartir.
- **Por qué:** capta reservas en el local y en redes con cero fricción.
- **Alcance:** generación de QR (SVG) hacia la URL `/r/<slug>` + descarga/print.
- **Dependencias:** **C1** debe existir.

### C11 — Fidelización (tarjeta visual)  *(M)*
- **Qué:** tarjeta de sellos/puntos (p. ej. "10ª visita gratis") que cuenta citas completadas y muestra progreso.
- **Por qué:** retención = ingresos recurrentes; reclamo clásico de salón.
- **Alcance (Carlos):** conteo + visualización de progreso (v1 manual/visual).
- **Dependencias:** **automatizar premios/canje y avisos** → Alexandro.

### C12 — Multi-location UI  *(M)*
- **Qué:** selector de local y filtrado por local en las pantallas.
- **Por qué:** cadenas/multi-sede; el informe indica que la BD podría estar preparada.
- **Alcance:** UI de selección + filtros por `local_id`.
- **Dependencias:** **confirmar el modelo de datos multi-sede con Alexandro** antes de empezar.

### C13 — Paridad web ↔ nativo  *(XL, continuo)*
- **Qué:** llevar las pantallas nativas (`*.tsx`) al nivel de las web (`*.web.tsx`), página por página.
- **Por qué:** Booksy/Fresha son mobile-first; el cliente final reserva desde el móvil. Hoy el nativo va muy por detrás.
- **Alcance:** trabajo de diseño/UX guiado por Carlos, priorizando las pantallas de más uso.
- **Decisión abierta para Jose:** ¿cuánto invertir ya en nativo vs concentrar en web + portal de cliente? (ver §8).

### C14 — Consolidar design tokens  *(S–M)*
- **Qué:** que los `.web.tsx` **importen** de `lib/designTokens.ts` en lugar de redefinir un objeto `TOKENS` local en cada archivo.
- **Por qué:** hoy hay deriva (cada pantalla copia los tokens) → riesgo de inconsistencia de marca. Es deuda técnica de diseño.
- **Alcance:** refactor incremental, archivo por archivo, sin cambio visual.

---

## 7. C1 en profundidad (ejecutable)

> Objetivo: que esta sección baste para implementar la reserva online sin volver a investigar.

> ✅ **ESTADO (8 jun 2026): C1a IMPLEMENTADO Y VERIFICADO.** Resumen de lo hecho:
> - **Migración aplicada** en Supabase Mecha (`vtrggiogjrhqtwbhbgia`): tabla `negocio_portal` (slug + ajustes) + 3 RPC `security definer` con grants a `anon`: `portal_info(slug)`, `disponibilidad_publica(slug, servicio, fecha, [prof])`, `crear_cita_publica(...)`. Archivo: `migrations/portal-reserva-publica.sql`.
> - **Frontend:** `app/r/[slug].web.tsx` (wizard 6 pasos), `app/r/[slug].tsx` (placeholder nativo), `lib/reservaPublica.ts` (cliente RPC). Guard de `app/_layout.tsx` exime la ruta `r/` (cliente anónimo, sin login).
> - **Portal demo:** slug `demo` → `demo_salon_001`. URL: `/r/demo`.
> - **Correcciones al esquema real** (lo que este doc suponía pendiente y YA existía): `servicios` ya tenía `reservable_online`, `prepago_requerido`, `prepago_porcentaje`, `prepago_cantidad_fija`, `cancelacion_horas`. NO hay tabla `negocios` (se creó `negocio_portal` acotada). `citas` usa estados `pendiente|confirmada|completada|cancelada|no_show` y `canal in (manual|web|whatsapp|instagram)` con `deposito_requerido/pagado/importe`. La señal reutiliza `pendiente`+`deposito_*` (no se inventó estado). `consentimientos_cliente` YA existe (relevante para C7). Bloqueos reales en `bloqueos_profesional`.
> - **Verificado:** las 3 RPC con datos reales (creación E2E + revalidación anti-solape + limpieza), `tsc --noEmit` limpio, `expo export -p web` EXIT 0.
> - **Cómo ver el portal:** `npx expo start --web` y abrir `http://localhost:8081/r/demo` (o en el deploy: `/r/demo`).
> - **Gestión del portal por salón: HECHA** — la pestaña "Reserva online" de `configuracion.web.tsx` (`TabReservaOnline`) está conectada a `negocio_portal`: cada salón activa su portal, elige su slug/URL, idioma, datos públicos y visibilidad de precios, con enlace copiable y control de slug único. Multi-tenant verificado (cada portal expone solo sus servicios). Los servicios visibles se controlan por el toggle "Reservable online" de cada servicio (pestaña Servicios).
> - **Pendiente:** C1b (señal Stripe → Alexandro: webhook `pendiente`→`confirmada`); QR del enlace (C10); versión nativa del portal; alinear el default de `reservable_online` (UI nace en `false` para servicios nuevos vs BD `true`) — decisión de Jose.

### 7.1 Decisiones (tomadas con Carlos)
- **Superficie:** **ruta Expo pública** (sin login), reutilizando `lib/` y diseño. Se publica por enlace/QR.
- **Señal:** **con Stripe**, pero en dos tramos → **C1a** (portal sin cobro, autónomo de Carlos) + **C1b** (señal, handoff con Alexandro). Así se arranca sin bloquear.
- **Capa de datos pública:** la prepara Carlos por **migración**, con el patrón `security definer` + `anon` ya existente. Coordinar con Alexandro para no duplicar.

### 7.2 C1a — Portal de reserva (autónomo de Carlos)

**Superficie / rutas**
- `app/r/_layout.tsx` *(nuevo)* — layout público, **sin guard de sesión** (separado de `(tabs)`).
- `app/r/[slug].web.tsx` *(nuevo)* — el portal (wizard). Nativo `[slug].tsx` puede venir después.

**Wizard (6 pasos)**
1. **Servicio** — lista solo servicios `reservable_online = true` y `activo`. Mostrar precio según ajuste de visibilidad.
2. **Profesional** — elegir uno o **"cualquiera"** (une la disponibilidad de todos los que ofrecen el servicio).
3. **Fecha + hueco** — calendario + huecos reales del día (ver algoritmo 7.4).
4. **Datos del cliente** — nombre + teléfono (+ email opcional). Validación con `react-forms-zod-expert`.
5. **Resumen** — servicio, profesional, fecha/hora, precio, (señal si aplica).
6. **Confirmación** — cita creada; mensaje + opción de añadir al calendario.

**Diseño**
- Usar `lib/designTokens.ts` (fuego/crema), `components/ui/MechaMark`, `lib/motion.tsx`. **Cero emojis.** Cargar skill `hairy-design-system` (y `hairy-ui-craft` para pulir).

**Cliente de datos**
- `lib/reservaPublica.ts` *(nuevo)* — wrappers de las RPC (`disponibilidad_publica`, `crear_cita_publica`) + normalización de slots. El portal **no** consulta `citas` directamente (privacidad): todo via RPC.

### 7.3 Migración `migrations/portal-reserva-publica.sql` *(nueva)*
1. **Identidad pública del negocio.** No existe tabla `negocios` (hoy `negocio_id` vive en `profiles`). Crear **`negocios`** (o `negocio_portal`):
   `negocio_id (pk), slug (unique), nombre, logo_url, direccion, telefono, idioma, portal_activo (bool), mostrar_precios (enum: catalogo|tras_seleccion)`.
   ⚠️ *Antes de aplicar, confirmar con Alexandro que no tiene ya una tabla equivalente en marcha.*
2. **Servicios:** añadir `reservable_online bool default false`, `prepago_requerido bool default false` (los toggles ya están en la UI de `configuracion.web.tsx`, falta persistirlos).
3. **RPC `disponibilidad_publica(slug, servicio_id, profesional_id default null, fecha)`** `security definer`: resuelve negocio por slug, calcula y devuelve **solo las horas libres** (no expone `citas`).
4. **RPC `crear_cita_publica(slug, servicio_id, profesional_id, inicio, cliente_nombre, cliente_telefono, cliente_email, notas)`** `security definer`: resuelve negocio por slug → **revalida disponibilidad server-side** (misma lógica) → **upsert de cliente** por teléfono dentro del `negocio_id` → `insert` en `citas` con `canal='web'` y estado inicial (`confirmada` sin señal / `pendiente_pago` con señal) → devuelve `cita_id`.
5. **Grants:** `grant execute` de ambas RPC a `anon` (patrón calcado de `solicitudes` / `staff_grant_full_access`). No abrir SELECT directo de `citas` a `anon`.

### 7.4 Algoritmo de huecos (cliente y servidor usan la misma lógica)
Para un día `D`, profesional `P`, servicio `S`:
1. `franjas = franjasDelDia(P, getDay(D))` (turnos / horario partido).
2. `duracionTotal = resolver(S, P)` (overrides → duraciones_profesional → default).
3. Por cada franja, generar slots desde `hora_inicio` hasta `hora_fin − duracionTotal`, paso `INTERVALO_MINUTOS` (15).
4. **Descartar** un slot si:
   - empieza antes de `ahora + max(antelacionGlobal, S.min_antelacion_min)`;
   - cae en un `bloqueos_profesional` del profesional;
   - `isTimeSlotOccupied(slotInicio, slotFin, citasDelDiaDeP, P)` es `true`;
   - supera la antelación máxima (`antelacionMax` días) o es "hoy" con `permitirMismoDia=false`.
5. **"Cualquiera":** repetir para cada profesional que ofrece `S` y unir/deduplicar por hora (al confirmar, asignar profesional concreto).
6. La RPC `crear_cita_publica` **revalida** el paso 4 en servidor (defensa real; el cliente solo pinta).

### 7.5 Persistencia de ajustes del portal (editar `app/(tabs)/configuracion.web.tsx`)
- Activar de verdad la pestaña **"Reserva online — fase 7"** (`TabReservaOnline`, hoy `disabled`/`soon`) y los toggles **"Reservable online"** / **"Prepago"** por servicio.
- v1 mínimo a persistir: `reservable_online` (por servicio), `portal_activo`, `slug`, `mostrar_precios`.

### 7.6 C1b — Señal con Stripe (handoff)
- **Carlos:** paso de señal en el wizard (importe, estado), estado `pendiente_pago`, pantalla "reserva pendiente de pago".
- **Alexandro:** Stripe Checkout / Payment Element + **webhook** que pasa la cita a `confirmada`. (Skill `stripe:stripe-best-practices` para alinear contrato.)
- **Contrato:** `crear_cita_publica` devuelve `cita_id` → el front pide a Alexandro una sesión de pago para ese `cita_id` → el webhook actualiza el estado. Hasta que exista, **mock**: dejar la cita en `confirmada` (sin señal) para poder probar el flujo entero.

### 7.7 Archivos a crear / tocar
- `migrations/portal-reserva-publica.sql` *(nuevo)*.
- `app/r/_layout.tsx` *(nuevo)*, `app/r/[slug].web.tsx` *(nuevo)*.
- `lib/reservaPublica.ts` *(nuevo)*.
- `components/reserva/*` *(nuevo, opcional)* — pasos del wizard.
- `app/(tabs)/configuracion.web.tsx` *(editar)* — persistir ajustes del portal y flags por servicio.

### 7.8 Verificación
1. Migración aplicada; negocio de prueba con `slug`, 1–2 servicios `reservable_online`, horarios de un profesional.
2. Abrir `/r/<slug>` en web (dev o `build:web`), completar el wizard.
3. Comprobar en la agenda interna que la cita aparece con `canal='web'`, en el hueco correcto, con cliente creado/asociado.
4. **Casos borde:** día sin huecos; antelación mínima por servicio; bloqueo del profesional; hueco que pisa un reposo (debe respetar `isTimeSlotOccupied`); "cualquiera" reparte bien.
5. C1b: cita `pendiente_pago` → `confirmada` (mock hasta Stripe real).

---

## 8. Decisiones tomadas y abiertas

**Tomadas (con Carlos):** portal = ruta Expo pública · señal con Stripe en dos tramos (C1a sin bloqueo) · capa de datos pública por migración de Carlos.

**Abiertas (para Jose):**
1. **Web-first vs nativo:** ¿la reserva pública es web responsive primero (recomendado) y nativo después?
2. **Alcance de señal v1:** ¿lanzamos C1a sin pago a producción mientras llega C1b, o esperamos a tener señal?
3. **Pricing del producto** (suscripción vs freemium) — afecta a qué pagos se priorizan.
4. **Marketplace sí/no** — estrategia de captación tipo Booksy.

---

## 9. Convenciones y checklist anti-repetición

Antes de construir cualquier cosa:
- [ ] ¿Ya existe? Busca en el código y revisa §3/§4 y `INFORME_MAESTRO_MECHA.md`. **No te fíes del comparativo.**
- [ ] ¿Es de Carlos o de Alexandro? Aplica el criterio de §5.
- [ ] ¿Reutilizas `horarios.ts` / `appointment.ts` / resolución de duración / tokens, en vez de reescribir?
- [ ] ¿Multi-tenant por `negocio_id` en todas las consultas?
- [ ] ¿Cargaste las skills `hairy-*` relevantes?
- [ ] ¿Cero emojis en UI, código en inglés, comentarios en español?
- [ ] ¿Migración con patrón `security definer` + grants explícitos cuando toque acceso público?

---

*Mantener este archivo vivo: si cambia el estado o el reparto, actualízalo aquí y en `INFORME_MAESTRO_MECHA.md`.*
