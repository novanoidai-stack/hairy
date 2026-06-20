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
| Lista de espera | **~60%** ⬆⬆ | ERA 0%. Tabla + gestión interna. Falta: matching automático de huecos y aviso WhatsApp (motor) |
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

### 7.3 Lista de espera v2 (el flujo completo que pediste)
1. Cancelación de cita → trigger → busca en `lista_espera` candidatos compatibles (servicio, profesional, franja, rango de fechas) ordenados por `prioridad, created_at` → marca `avisado` + `avisado_at`. **[Carlos: función SQL de matching, 1–2 d]**
2. Webhook (A6) → n8n → WhatsApp al cliente con enlace directo al hueco en el portal (`/r/slug?slot=...`, pre-seleccionado). **[Alexandro + Carlos el deep-link: 1 d]**
3. Notificación in-app a recepción ("hueco del jueves ofrecido a María"). **[Carlos, 1 d]**
4. Si el cliente no responde en X min (config), pasa al siguiente. **[n8n]**
El modelo de datos ya soporta todo esto (estados `esperando/avisado/resuelta/cancelada` ya existen en `migrations/lista-espera.sql`).

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
