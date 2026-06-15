# 🔥 INFORME MAESTRO MECHA — Estado actual y reparto de trabajo

> **Fecha:** 8 de junio de 2026 · **Última actualización:** 16 de junio de 2026
> **Autores:** Carlos + Claude
> **Propósito:** Foto real y verificada del producto Mecha, corrección del análisis comparativo anterior, y reparto claro de responsabilidades **Carlos (frontend/UX/backend ligero, sin IA)** vs **Alexandro (backend pesado, pagos, IA, integraciones)**.
> **Método:** Lectura directa del código del repositorio `Hairy/` (no suposiciones). Donde se cita un archivo, la afirmación está verificada en el código a fecha de hoy.
> **Relación con `ANALISIS_COMPARATIVO_MECHA.md`:** ese documento es útil como mapa de funcionalidades del mercado, pero **está desactualizado sobre el estado de Mecha** (ver §4). Este informe lo corrige y lo manda.

---

## 0. Cómo leer este informe

- **§1** — Resumen ejecutivo (si solo lees una sección, lee esta).
- **§2** — Contexto: qué es Mecha, stack real, arquitectura, modelo de negocio.
- **§3** — Estado real por módulo: lo que **ya está construido** (con evidencia).
- **§4** — Corrección al comparativo: lo que el doc marca como ❌ pero **ya existe**.
- **§5** — Gaps reales confirmados ausentes en el código.
- **§6** — **Reparto Carlos / Alexandro** (el corazón del informe).
- **§7** — Roadmap y priorización de la parte de Carlos.
- **§8** — Decisiones pendientes para Jose.
- **§9** — Anexos (mapa de archivos, glosario).

Notas de método:
- Los porcentajes "% vs Booksy/Fresha" son **estimaciones de criterio**, no medidas exactas. Sirven para priorizar, no para presumir.
- Los esfuerzos están en **días de trabajo de Carlos**, orientativos.

---

## 1. Resumen ejecutivo

### 1.1 La frase
Mecha **no es un MVP temprano**: es un producto de gestión de salón **maduro y profundo** en su núcleo (agenda, clientes, equipo, informes, configuración), con un sistema de diseño propio ya rebautizado a la marca "fuego". Lo que falta **no es la gestión interna** —ahí ya competís de tú a tú con Booksy/Fresha e incluso los superáis en lo vertical de peluquería— sino **toda la capa que vive de cara al cliente final y al crecimiento del negocio** (reserva online del cliente, recordatorios, reseñas, pagos, marketing, fidelización).

### 1.2 Dónde está Mecha de verdad (estado corregido)

| Área | Estado real | vs Booksy/Fresha (est.) |
|---|---|---|
| **Agenda / reservas (interno)** | Muy completa, con piezas que la competencia no tiene | **~95%** |
| **Clientes / CRM** | Muy completa + vertical de peluquería única | **~90%** |
| **Configuración** | Extensísima, con secciones ya maquetadas para fases futuras | **~85%** |
| **Equipo y roles** | Sólida (4 roles, capacidades, horarios, turnos, comisiones) | **~75%** |
| **Informes / analítica** | Real y profunda (no es placeholder) | **~75%** |
| **Sistema de diseño / marca** | Rebrand a Mecha hecho a nivel de tokens (claro + oscuro) | **~85%** |
| **Cara al cliente final** (auto-reserva, recordatorios, reseñas) | Portal de reservas ✅, QR ✅, Reseñas ✅. Falta: pagos/señal, recordatorios, fidelización | **~55%** ⟵ *avanzando* |
| **Pagos** | Cero (hay UI de depósitos, sin motor) | **0%** |
| **Marketing / fidelización** | Cero (hay UI de notificaciones, sin motor) | **~5%** |
| **Inventario / retail** | Cero | **0%** |

### 1.3 La gran corrección
El análisis comparativo anterior marca como **❌ "falta"** un montón de cosas que **ya están construidas y funcionando**: drag & drop de citas, servicios encadenados multiprofesional, fotos de cliente, informes por profesional, retención, exportación CSV/PDF, comisiones, vista mes, segmentación automática… (detalle en §4). **Conclusión operativa: no rehagáis lo que ya existe.** Verificad siempre contra el código antes de planificar.

### 1.4 El reparto, en una frase
- **Carlos** = todo lo que es **diseño + interfaz + lógica ligera de datos** (lecturas/escrituras simples a Supabase) **sin IA, sin pagos, sin envío real de mensajes, sin integraciones OAuth**.
- **Alexandro** = todo lo que es **backend pesado, dinero, IA, y conexión con servicios externos** (incluido el "motor de envío" que hace funcionar features cuya UI monta Carlos).

### 1.5 El foco recomendado para Carlos
**La reserva online pública para el cliente final.** Es el mayor acercamiento a Booksy/Fresha que puede hacer Carlos en solitario, no bloquea a Alexandro, el modelo de datos **ya está preparado** para ella (`canal='web'`, ver §3.7) e incluso la **pantalla de configuración del portal ya está maquetada** ("Reserva online — fase 7", ver §3.5).

---

## 2. Contexto del producto

### 2.1 Qué es Mecha
SaaS de gestión integral para peluquerías/barberías, **multi-tenant** (cada negocio aislado por `negocio_id`), con vocación de diferenciarse por **IA** (voz + WhatsApp + gestión inteligente — a cargo de Alexandro) y por **verticalización profunda en peluquería** (fichas técnicas de color, tiempos de reposo, perfiles de riesgo). Rebrand en curso de "Hairy" → **"Mecha"** (identidad fuego).

### 2.2 Stack técnico real (verificado en `package.json`)
- **App:** Expo `~54.0` + **expo-router `~6`** (file-based routing), React Native `0.81.5`.
- **Web:** **react-native-web `0.21`** — la web se genera con `expo export -p web` hacia `web/app/`. Es decir, **misma base de código** para nativo y web, con división por archivos `.web.tsx`.
- **Datos:** **Supabase** (`@supabase/supabase-js 2.104`), proyecto propio de Hairy `vtrggiogjrhqtwbhbgia` (distinto del de NovoBarber).
- **Fechas:** `date-fns 3.6` (locale `es`).
- **Animación / gráficos:** `react-native-reanimated ~4.1`, `react-native-svg 15.12`, `react-native-calendars`. **No hay Stripe. No hay librería de charts** (los gráficos de informes están hechos a mano con barras/SVG).
- **Fuentes:** Inter (`@expo-google-fonts/inter`).
- **Deploy:** Vercel (`vercel.json`).

> **Implicación de reparto:** que no haya Stripe confirma que pagos es trabajo nuevo de Alexandro. Que los gráficos sean SVG a mano confirma que ampliarlos (tendencias) es trabajo de Carlos, con herramientas que ya están en el proyecto.

### 2.3 Arquitectura de superficies
1. **App de gestión (el producto)** — `app/` con expo-router. Tabs: **agenda (index), clientes, equipo, informes, configuración**, más pantallas `nueva-cita`, `agenda-detalle`, `configuracion`, y `login`. Cada pantalla tiene su versión nativa `.tsx` y su versión web `.web.tsx`.
2. **Landing + sitio público** — `web/` (HTML/CSS/JS): `index.html`, `demo.html`, `reservar.html` (reserva de **llamada comercial**, no de cita de cliente), legales, `acceso.html`, `admin.html`, más el export de la app en `web/app/`.
3. **Origen del diseño** — `project/` contiene los prototipos HTML originales (handoff de Claude Design). Filosofía del proyecto: **recrear el diseño pixel-perfect** en la app real (ver `README.md`).

> ⚠️ **Desnivel web ↔ nativo** (dato importante para §8): las versiones web son mucho más ricas que las nativas. Ejemplos: `clientes.web.tsx` (2.622 líneas) vs `clientes.tsx` (976); `AgendaCalendar.web.tsx` (6.075) vs `AgendaCalendar.tsx` (813). **Hoy el producto de verdad es la web.** El nativo va por detrás.

### 2.4 Modelo de negocio / onboarding (verificado en migraciones)
Hay un embudo comercial ya montado en la BD (`migrations/solicitudes-y-plan-free.sql`, `staff-cuentas-acceso.sql`):
- Tabla **`solicitudes`** = prospectos pre-cuenta (`tipo`: `demo` / `reserva_llamada` / `signup`).
- Tabla **`staff`** = allowlist del equipo Mecha que puede ver el panel de solicitudes/cuentas.
- **`profiles.plan`** (`free` por defecto) + `trial_ends_at` = cuenta gratuita limitada.
- **RPC de "dar acceso completo"** = tras auditar al prospecto, sube `free → full` y le asigna su `negocio_id` propio (lo saca del tenant demo compartido).

Flujo implícito: **prospecto (demo/llamada) → auditoría del equipo Mecha → acceso full**. Esto encaja con `reservar.html` ("te lo dejamos montado en menos de un día, con la IA implementada, conectamos tu Booksy/Fresha").

---

## 3. Estado real por módulo (lo que SÍ está construido)

### 3.1 Agenda / reservas internas — **~95%**
Archivo núcleo: `components/agenda/AgendaCalendar.web.tsx` (6.075 líneas), `app/screens/nueva-cita.tsx`, `app/screens/agenda-detalle.tsx`.

Construido y funcionando:
- **Vistas día / semana / mes** (`view: 'day' | 'week' | 'month'`).
- **Multi-profesional** con **colores por profesional**.
- **Drag & drop de citas** con **detección de conflictos**, validación de horario de cierre e **historial** ("Reagendado (drag & drop)").
- **Servicios encadenados / combinados multiprofesional** (creación encadenada, control de solapes internos, precio y duración totales).
- **Sistema de 2 fases activa / reposo (espera)** — específico de peluquería (tintes, decoloraciones).
- **Reposos aprovechables** — detección de huecos en el tiempo de reposo para encajar otra tarea.
- **Detección de solapamientos** avanzada.
- **Validación de horario laboral** (turnos, apertura 09:00 / cierre 20:00, intervalos de 15 min).
- **Estados de cita**: confirmada / completada / cancelada / no_presentada (`lib/constants.ts`).
- **Canales de cita** ya tipados: manual / web / whatsapp / agente_voz / asistente_ia.

Gaps internos de agenda (ver dueño en §6): **lista de espera (waitlist)** ❌, **buffer fijo entre citas** ❌ (existe la lógica de reposo/relleno, no un buffer configurable explícito), pulido de UX en vista mes.

### 3.2 Clientes / CRM — **~90%**
Archivo núcleo: `app/(tabs)/clientes.web.tsx` (2.622 líneas).

Construido:
- **Ficha completa** con historial de citas, **notas internas**, **preferencias**, **alergias** (con **sincronización** nota-de-cita → ficha, `lib/syncAlergias.ts`), **sensibilidades de cuero cabelludo**.
- **Clasificación automática** VIP / Habitual / Nuevo (función `computeTag`) + filtros y contadores por etiqueta.
- **Perfil de riesgo** y conteo de no-shows.
- **Ticket medio, frecuencia de visitas, profesional habitual, días inactivo**.
- **Detección de duplicados**.
- **Fotos del cliente** (galería antes/después) — sube a **Supabase Storage** (bucket `cliente-fotos`), tabla `cliente_fotos` (migración `cliente-fotos.sql`). Componente `FotosClienteSection`.
- **Ficha técnica de color completa** — `formula_producto`, `formula_tono`, `formula_tiempo_min`, `formula_resultado`, `formula_notas`, con pestaña **Color** e historial. **Esto no existe en Booksy/Fresha.**

Gaps internos (ver §6): **etiquetas/segmentos manuales** (los hay automáticos, faltan los manuales), **bloquear cliente** ❌, **formularios/consentimientos personalizados** ❌.

### 3.3 Equipo y roles — **~75%**
Archivos: `app/(tabs)/equipo.web.tsx` (2.281), `lib/permissions.ts`.

Construido:
- **4 roles canónicos**: propietario / dirección / recepción / profesional, mapeados a `profiles.role`.
- **Capacidades atómicas** (`Capability`) acumulativas por rol, con **capacidades sensibles** reservadas a propietario (eliminar datos, exportar, cambiar plan). Incluye `config.comisiones`.
- Gestión de profesionales, **horario base**, **turnos**, **vacaciones**, **tipos de bloqueo**, **categorías** (auxiliar → dirección), **comisión por profesional**, **métricas del mes**.
- Cuentas de acceso del staff (`staff-cuentas-acceso.sql`).

Gaps internos: informes de rendimiento por profesional más ricos, recursos físicos (salas/equipos) ❌, multi-location UI (BD preparada, falta interfaz).

### 3.4 Informes / analítica — **~75%** (el comparativo lo infravaloraba como "placeholder")
Archivo: `app/(tabs)/informes.web.tsx` (1.528 líneas). **Es analítica real, no maqueta.**

Construido, con selector de periodo (semana / mes / 3 meses / año):
- **KPIs**: citas totales, ingresos, citas/profesional, no-shows (%), tiempo de espera medio, **% reposo aprovechado**, clientes activos, retención (frecuencia media).
- **Ocupación** por profesional / franja horaria / día.
- **No-shows** por profesional y por servicio.
- **Tiempo de espera** medio entre citas por profesional.
- **Reposo aprovechado** por profesional.
- **Ingresos** por profesional / servicio / **cliente**.
- **Servicios top + combinaciones frecuentes**.
- **Retención**: nuevos vs recurrentes, frecuencia, clientes en riesgo (60+ días).
- **Comisiones** por profesional con **% configurable**.
- **Exportación CSV** (varios) + **exportación PDF con marca** (informe imprimible).
- **Tooltips explicativos** (`InfoDot`) por cada KPI y sección.

Gaps internos (ver §6): **gráficos de tendencia temporal** reales (hoy son barras simples; faltan líneas de evolución), métricas de productos (no hay retail), predicción.

### 3.5 Configuración — **~85%** (sorprendentemente completa)
Archivo: `app/(tabs)/configuracion.web.tsx` (2.949 líneas). Secciones ya presentes:
- Datos del negocio · Identidad visual · Accesos y roles · Tu cuenta · **Plan y suscripción** · Soporte/canales directos.
- **Horario semanal del salón** · Slots y vista del calendario.
- **Reservas y antelación** · **Confirmación de citas** · **No-show y retrasos** (tiempo de gracia para reorganización).
- **Tiempos muertos y reposo** · **Bloqueos y descansos**.
- **Comisiones por defecto** + comisión por profesional + **bonus y excepciones**.
- **Alergias frecuentes** · **Fórmulas guardadas** · **Plantillas de notas e historial**.
- **"Notificaciones — fase 4"**: canal preferido, **recordatorios automáticos**, **plantillas de mensaje** ← *UI maquetada, sin motor de envío*.
- **Cancelación de citas** · **Depósitos y señales** · No-shows reincidentes ← *UI presente, sin pasarela de pago*.
- **"Reserva online — fase 7"**: **portal público**, visibilidad ← *UI maquetada, sin portal real detrás*.

> 🔑 **Dato de oro para el reparto:** el equipo ya dejó **maquetadas las pantallas de configuración** de notificaciones (fase 4), depósitos y reserva online (fase 7). Significa que cuando Carlos construya el **portal de reserva pública**, la pantalla que lo configura **ya existe**; y cuando Alexandro monte el **motor de recordatorios**, su panel de ajustes **ya existe**.

### 3.6 Sistema de diseño y marca — **~85%**
Archivos: `lib/designTokens.ts`, `lib/theme.ts`, `lib/motion.tsx`, `components/ui/*`, skills `hairy-design-system` / `hairy-ui-craft`.
- **Rebrand Mecha "fuego" hecho a nivel de tokens**: acento `#f4501e` (profundo `#c0260a`), fondos **crema cálido** (`#f6f1ea` / `#fffdfb` / `#fff`), 4 niveles de texto, jerarquía de pesos Inter.
- **Tema claro y oscuro** definidos (`colors.light` / `colors.dark`).
- Animaciones/motion, componentes UI reutilizables (MechaMark, Pickers, SettingsAtoms, TText, DesignComponents…).

Gaps: **deriva de tokens** (los `.web.tsx` redefinen `TOKENS` localmente en cada archivo en vez de importar de `designTokens.ts` — riesgo de inconsistencia), **paridad web↔nativo** (§2.3), pulido fino tipo "no-AI-look" guiado por `hairy-ui-craft`.

### 3.7 Infraestructura y datos preparados para el futuro — **clave**
- **Multi-tenant** por `negocio_id` en todas las consultas.
- **Auth** Supabase (`lib/auth.ts`, `lib/supabase.ts`), perfiles con rol y plan.
- **Planes** free/full + trial + embudo de solicitudes (§2.4).
- **Bloqueos recurrentes** (`add-recurring-blocks.sql`), auto-creación de perfil en signup.
- **El esquema de citas ya prevé el cliente-final y la IA**: `CITA_CANAL` incluye `web`, `whatsapp`, `agente_voz`, `asistente_ia`. → Cuando entre la reserva pública, las citas entran con `canal='web'`; cuando entre la IA, con su canal. **No hay que rediseñar el modelo.**

### 3.8 Cara al cliente final — **~55%** (en progreso)

> **Actualización 16/jun/2026:** Se han construido los siguientes módulos:
> - ✅ **Portal de reserva online pública** (C1) — El cliente final ya puede reservarse solo.
> - ✅ **QR de reserva** (C10) — Enlace directo al portal.
> - ✅ **Sistema de reseñas** (C3) — Portal público de reseñas con preguntas base + panel de administración con análisis IA.
>
> **Pendiente:** pagos/señal/depósito (requiere Alexandro + Stripe), recordatorios automáticos (motor de envío → Alexandro), programa de fidelización, reserva desde Google/Instagram.

---

## 4. Corrección al documento comparativo (`ANALISIS_COMPARATIVO_MECHA.md`)

El comparativo marca como ausentes cosas **ya construidas**. Tabla de correcciones verificadas:

| El comparativo dice… | Realidad en el código | Evidencia |
|---|---|---|
| Drag & drop ❌ "debe implementar" | ✅ Hecho, con conflictos + historial | `AgendaCalendar.web.tsx:1610` |
| Servicios combinados ❌ "No" | ✅ Servicios encadenados multiprofesional | `AgendaCalendar.web.tsx:3987` |
| Vista mes "parcial" | ✅ día/semana/mes completos | `AgendaCalendar.web.tsx:153` |
| Fotos en perfil cliente ❌ "Falta" | ✅ Galería a Supabase Storage | `clientes.web.tsx:2412` |
| Informes "❌ Placeholder / Básico" | ✅ 1.528 líneas de analítica real | `informes.web.tsx` |
| Informes por profesional ❌ | ✅ Hecho | `informes.web.tsx` (ocupación/ingresos por prof.) |
| Retención de clientes ❌ | ✅ Hecho (nuevos/recurrentes/riesgo) | `informes.web.tsx:584` |
| Exportar informes ❌ | ✅ CSV + PDF con marca | `informes.web.tsx:294,687` |
| Comisiones ❌ "No" | ✅ En informes (% configurable) **y** en config/equipo | `informes.web.tsx:617`, config "Comisiones" |
| Gráficos visuales ❌ "Placeholder" | ⚠️ Parcial: hay barras, faltan líneas de tendencia | `informes.web.tsx` |
| Turnos y vacaciones "Básico" | ✅ Horario base, turnos, vacaciones, bloqueos, categorías | `equipo.web.tsx` |
| Clasificación clientes (auto) | ✅ VIP/Habitual/Nuevo automático | `clientes.web.tsx:117` |
| Ficha técnica de color | ✅ Completa (producto/tono/tiempo/resultado/notas) | `clientes.web.tsx:81` |

**Por qué pasó:** el comparativo se escribió probablemente contra una copia anterior (existe un snapshot viejo en `project/uploads/Hairy/`). **Acción:** este informe es la fuente de verdad sobre el estado; el comparativo se usa solo como inventario de funciones del mercado.

---

## 5. Gaps reales (confirmados ausentes en el código)

Verificado por búsqueda en `app/` + `web/` (0 archivos):

**Cara al cliente / crecimiento**
- Portal/widget de **reserva online del cliente final** ✅ *Completado 15/jun/2026*
- **Recordatorios automáticos** (envío email/SMS/WhatsApp) ❌ *(UI de config sí existe — fase 4)*
- **Reseñas / valoraciones** ✅ *Completado 15/jun/2026 (portal público + panel admin + análisis IA)*
- **Fidelización / loyalty / puntos / sellos** ❌
- **Campañas de marketing** masivas ❌
- **Reserva con Google / botón Instagram / marketplace** ❌
- **Código QR** de reserva ✅ *Completado*
- **Pagos / señal / depósito en la reserva online** ❌ *(UI maquetada, sin pasarela — requiere Alexandro)*

**Operativa / CRM**
- **Lista de espera (waitlist)** ❌
- **Bloquear clientes** ❌
- **Formularios / consentimientos personalizados** ❌
- **Etiquetas / segmentos manuales** ❌ *(automáticos sí)*
- **Recursos / salas / equipos** ❌
- **Buffer configurable entre citas** ❌
- **Gráficos de tendencia temporal** en informes ❌

**Dinero / retail**
- **Pagos** (TPV, online, depósitos reales, propinas, bonos, tarjetas regalo, membresías, cierre de caja) ❌ *(UI de depósitos sí existe)*
- **Inventario / retail / venta de productos** ❌

**IA (planificada, a cargo de Alexandro)**
- Agente de voz (Retell), agente WhatsApp (n8n), gestión inteligente de agenda, reactivación con IA.

---

## 6. Reparto de responsabilidades

### 6.1 Principio de reparto (criterio para clasificar cualquier tarea futura)
Una tarea es **de Carlos** si cumple TODO esto:
1. Su valor está en la **interfaz/experiencia** o en **lógica de datos simple** (CRUD/consultas Supabase directas).
2. **No** envía mensajes reales al exterior (email/SMS/WhatsApp/push).
3. **No** mueve dinero ni integra pasarela de pago.
4. **No** usa IA/LLM/agentes.
5. **No** requiere integración OAuth con terceros (Google, Instagram, Meta…).

Si falla alguno de 2–5, es **de Alexandro** (o handoff §6.4).

### 6.2 CARLOS — frontend / UX / backend ligero (sin IA)

| # | Feature | Qué incluye (tu parte) | Por qué es tuya | Depende de | Esfuerzo |
|---|---|---|---|---|---|
| C1 | **Reserva online pública** ⭐ | Portal cliente: elegir servicio → profesional → ver huecos (reusa disponibilidad de la agenda) → confirmar → crea `cita` con `canal='web'`. Sin pago en v1. | UI + lectura/escritura simple; modelo ya preparado; pantalla de config ya maquetada (fase 7) | Nada (independiente) | **L** (8–12 d) |
| C2 | **Lista de espera** | UI + tabla `lista_espera`; alta desde una franja llena; vista "huecos liberados"; botón **avisar manual** | UI + CRUD simple | Aviso automático → Alexandro | **M** (4–6 d) |
| C3 | **Reseñas (captura + display)** | Formulario de valoración (estrellas + texto), media y listado en ficha de cliente/profesional, moderación básica | UI + CRUD | Pedir reseña por mensaje → Alexandro | **M** (3–5 d) |
| C4 | **Gráficos de tendencia en informes** | Líneas de evolución temporal (ingresos/citas/ocupación) con `react-native-svg` (ya instalado); los datos ya se calculan | Pura presentación | Nada | **S–M** (2–4 d) |
| C5 | **Bloquear clientes** | Flag en `clientes` + UI de bloqueo + chequeo al reservar | UI + columna simple | Nada | **S** (1–2 d) |
| C6 | **Etiquetas / segmentos manuales** | Tags personalizados sobre el cliente + filtros (se suma a los automáticos) | UI + columna array | Usar segmentos para campañas → Alexandro | **S–M** (2–3 d) |
| C7 | **Formularios / consentimientos** | Constructor simple de campos + formulario digital (firma/consentimiento) guardado en Supabase. Skill `react-forms-zod-expert`. | UI + storage simple | Nada | **M** (4–6 d) |
| C8 | **Buffer entre citas** | Campo en config + que la agenda lo respete al colocar citas | UI + regla en agenda existente | Nada | **S** (1–2 d) |
| C9 | **Recursos / salas** | Entidad recurso asignable a cita + chequeo de solape (reusa patrón de solape de profesional) | UI + CRUD + regla existente | Nada | **M** (4–6 d) |
| C10 | **QR de reserva** | Generar QR que apunta al portal C1 + descarga/print | Frontend puro | **C1** | **S** (1 d) |
| C11 | **Fidelización (tarjeta visual)** | Tarjeta de sellos/puntos: cuenta citas completadas y muestra progreso (v1 manual) | UI + conteo simple | Premios/automatización → Alexandro | **M** (3–5 d) |
| C12 | **Multi-location UI** | Selector de local + filtrado por local en las pantallas | UI + filtros | Confirmar BD con Alexandro | **M** (4–6 d) |
| C13 | **Paridad web ↔ nativo** | Llevar las pantallas nativas al nivel de las web, página por página | Diseño/UX puro | — | **XL** (continuo) |
| C14 | **Consolidar design tokens** | Que los `.web.tsx` importen de `designTokens.ts` en vez de redefinir `TOKENS` local | Refactor de diseño | — | **S–M** (2–4 d) |

**Leyenda esfuerzo:** S ≤ 2 d · M 3–6 d · L 8–12 d · XL continuo.

### 6.3 ALEXANDRO — backend pesado / pagos / IA / integraciones

| Feature | Por qué es suya |
|---|---|
| **Pagos / Stripe**: online, TPV, depósitos reales, propinas, bonos, tarjetas regalo, membresías, cierre de caja | Dinero + pasarela + webhooks |
| **Motor de recordatorios/confirmaciones** (email/SMS/WhatsApp) | Envío real al exterior (la UI de config "fase 4" ya está) |
| **Campañas de marketing** masivas | Envío masivo + segmentación operativa |
| **Toda la IA**: agente de voz (Retell), agente WhatsApp (n8n), gestión inteligente de agenda, reactivación con IA | LLM/agentes — dominio de Alexandro |
| **Reserva con Google / Instagram / marketplace** | Integraciones OAuth + APIs de terceros |
| **Inventario con pedidos a proveedor** | Lógica de stock/compras compleja |
| **Motor de envío de las features de Carlos** | Avisos de waitlist (C2), petición de reseñas (C3), premios de fidelización (C11) |

### 6.4 Zona de handoff (UI de Carlos + motor de Alexandro)
Estas features se construyen **a dos manos**: Carlos hace la interfaz y el almacenamiento; Alexandro conecta el motor. Hay que coordinarlas para no bloquearse:

| Feature | Carlos | Alexandro |
|---|---|---|
| Recordatorios | Plantillas, preferencias (UI fase 4 ya hecha), preview | Envío real + scheduling |
| Reserva online + pago de señal | Portal C1 + UI de depósito (ya maquetada) | Cobro Stripe de la señal |
| Reseñas | Captura + display (C3) | Disparo de la petición tras la cita |
| Lista de espera | UI + tabla (C2) | Notificación automática al liberarse hueco |
| Fidelización | Tarjeta + conteo (C11) | Automatización de premios/canje |

---

## 7. Roadmap y priorización (parte de Carlos)

Alineado con las "fases" que el propio código ya nombra (notificaciones = fase 4, reserva online = fase 7).

### Fase A — "Que el cliente final exista" (máximo impacto competitivo)
1. ~~**C1 Reserva online pública** ⭐ (el nº1).~~ ✅ **HECHO** *(falta pagos/señal → Alexandro)*
2. ~~**C10 QR** (cuelga de C1, casi gratis).~~ ✅ **HECHO**
3. **C2 Lista de espera**. ❌ Pendiente

### Fase B — "Confianza y producto serio"
4. ~~**C3 Reseñas** (captura/display).~~ ✅ **HECHO** *(portal público + panel admin + análisis IA)*
5. **C4 Gráficos de tendencia** en informes. ❌ Pendiente
6. **C5 Bloquear clientes** + **C6 etiquetas manuales** (quick wins de CRM). ❌ Pendiente

### Fase C — "Completar operativa"
7. **C7 Formularios/consentimientos**.
8. **C8 Buffer** + **C9 Recursos/salas**.
9. **C11 Fidelización** (tarjeta visual v1).
10. **C12 Multi-location UI**.

### Transversal (en paralelo, continuo)
- **C13 Paridad web↔nativo** y **C14 consolidar tokens** — trabajo de diseño constante guiado por Carlos, página por página.

### Tabla resumen actualizada (16/jun/2026)
| Orden | Tarea | Esfuerzo | Estado | Bloquea a Alexandro? |
|---|---|---|---|---|
| 1 | C1 Reserva online | L | ✅ Hecho (falta señal/pago) | No (señal → sí) |
| 2 | C10 QR | S | ✅ Hecho | No |
| 3 | C2 Lista de espera | M | ❌ Pendiente | No (aviso auto luego) |
| 4 | C3 Reseñas | M | ✅ Hecho | No (petición luego) |
| 5 | C4 Gráficos | S–M | ❌ Pendiente | No |

---

## 8. Decisiones pendientes (para Jose)

1. **Web-first vs mobile.** Booksy/Fresha son mobile-first y el cliente final reserva desde el móvil. Hoy Mecha es fuerte en web y flojo en nativo. ¿La reserva pública (C1) es **web responsive** primero (más rápido) o **app nativa**? *(Recomendación: web responsive primero, embebible por QR/enlace; nativo después.)*
2. **Alcance de la reserva online v1.** ¿Con o sin **señal/depósito**? Sin pago, Carlos la entrega solo; con señal, necesita el cobro de Alexandro. *(Recomendación: v1 sin pago; añadir señal en v2.)*
3. **Pricing del producto** (no definido en el comparativo): suscripción vs freemium. Afecta a qué se construye primero en pagos.
4. **Marketplace sí/no.** Es estrategia (visibilidad tipo Booksy) más que feature; define si Mecha es solo software o también canal de captación.
5. **Prioridad de paridad nativa** (C13): ¿cuánto invertir ya en el nativo vs concentrar en web + portal de cliente?

---

## 9. Anexos

### 9.1 Mapa de archivos clave
- **Agenda:** `components/agenda/AgendaCalendar.web.tsx`, `app/screens/nueva-cita.tsx`, `app/screens/agenda-detalle.tsx`, `lib/horarios.ts`, `lib/utils/appointment.ts`, `lib/calendarContext.tsx`.
- **Clientes:** `app/(tabs)/clientes.web.tsx`, `lib/syncAlergias.ts`, `migrations/cliente-fotos.sql`.
- **Equipo/roles:** `app/(tabs)/equipo.web.tsx`, `lib/permissions.ts`, `migrations/roles-permisos.sql`, `migrations/staff-cuentas-acceso.sql`.
- **Informes:** `app/(tabs)/informes.web.tsx`.
- **Configuración:** `app/(tabs)/configuracion.web.tsx`.
- **Diseño:** `lib/designTokens.ts`, `lib/theme.ts`, `lib/motion.tsx`, `components/ui/*`, skills `hairy-design-system` / `hairy-ui-craft` / `hairy-agenda-rules` / `hairy-domain-data`.
- **Auth/infra:** `lib/auth.ts`, `lib/supabase.ts`, `lib/constants.ts`, `migrations/solicitudes-y-plan-free.sql`.
- **Público/landing:** `web/index.html`, `web/reservar.html`, `web/demo.html`.

### 9.2 Glosario de dominio (de `lib/constants.ts` y `lib/permissions.ts`)
- **Estados de cita:** confirmada · completada · cancelada · no_presentada.
- **Canales de cita:** manual · web · whatsapp · agente_voz · asistente_ia.
- **Roles:** propietario · dirección · recepción · profesional.
- **Categorías de profesional:** auxiliar · oficial · oficial mayor · estilista senior · dirección.
- **Fase activa / reposo (espera):** dos tramos de un servicio; en el reposo el profesional queda libre (reposo aprovechable).
- **Horario salón (demo):** 09:00–20:00, intervalos de 15 min.

### 9.3 Recordatorio operativo
- **No rehagáis lo de §3/§4.** Verificar contra el código antes de planificar.
- **Convención:** código en inglés, comentarios en español; cero emojis en la UI; multi-tenant siempre por `negocio_id`.

---

*Informe generado a partir de lectura directa del código de `Hairy/` el 8 de junio de 2026. Sustituye, en lo relativo al estado de Mecha, al `ANALISIS_COMPARATIVO_MECHA.md`.*
