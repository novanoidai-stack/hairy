# Copiloto Fase 3 — Briefing proactivo (diseño)

Fecha: 2026-07-04 · Autor: Alexandro (capa IA) · Estado: aprobado para plan

> **Actualización 2026-07-04 (v1 real construida — este bloque manda sobre §4.1).**
> Al implementar se vio que el modelo de datos tumba 2 de los 4 detectores previstos:
> - `citas_en_riesgo` **eliminado**: una cita solo es `'pendiente'` cuando espera depósito
>   (reservas públicas: pendiente solo con prepago; staff/asistente crea `'confirmada'`; no hay
>   estado `no_show`). "Sin confirmar" ≡ "señales sin pagar" → se solapan al 100%.
> - `huecos_rellenables` **aplazado a v1.1** (cálculo de franjas con fases activa/reposo; requiere `hairy-agenda-rules`).
> - `clientes_a_recuperar` se **reusa tal cual** vía `clientes_en_riesgo_fuga()` (ya existe, granted a `authenticated`), llamado desde el cliente.
> - Se **añade** `bandeja_sin_responder` (conversaciones `estado='abierta'`), señal operativa real y disponible.
>
> **v1 construida:** RPC `agenda_briefing` devuelve `senales_sin_pagar` + `bandeja_sin_responder`
> (esta última solo si scope ≠ self). **Aplicada a prod `vtrggiogjrhqtwbhbgia` y verificada** (2026-07-04,
> migración `copiloto-briefing-proactivo.sql`, commit `aa2cbcdf`). Pendiente: frontend (lib + componente + toggle) y v1.1 huecos.

## 1. Contexto y objetivo

El copiloto del software (`agenda-asistente`) hoy es **reactivo**: consulta agenda/catálogo/clientes/disponibilidad y **propone→confirma** operaciones (crear/reagendar/cancelar cita, bloquear/liberar hueco) además de guiar y cambiar configuración (Fase 1 y 2, ya en producción).

Fase 3 lo hace **proactivo**: al abrir el panel, el copiloto saluda con un **briefing** de "lo que requiere tu atención" y ofrece acciones. Es el salto de "responde cuando le preguntas" a "aporta por sí mismo".

Además conecta con el onboarding: las recomendaciones de puesta en marcha y el briefing operativo son **la misma superficie en distintas etapas de vida** del salón. Así el usuario percibe una IA continua: setup → uso diario.

## 2. Alcance

**v1 (esta fase):**
- Briefing al abrir el panel del copiloto en la pantalla de Agenda.
- Dos familias de señales: **operativas** (4) y **puesta en marcha** (reuso de onboarding).
- Cada señal, tarjeta con acción (reusa propone→confirma existente) o informativa + deep-link.

**Fuera de alcance (v1):**
- Motor de reactivación de clientes (la señal `clientes_a_recuperar` es informativa por ahora).
- Señales inline en el calendario (se descartó por ser mucho frontend).
- Analítica conversacional / "insights" (la otra rama de la decisión; fase posterior).
- Unificación de la fontanería con el edge `onboarding-agent` de Carlos (limpieza ligera a coordinar; ver §12).

## 3. Arquitectura

Enfoque **determinista**: la detección es SQL, no LLM (exacta, barata, testeable, sin alucinación). El LLM del copiloto sigue solo para el chat.

Dos fuentes de señales, unidas en el cliente:

1. **Operativas → RPC nuevo `agenda_briefing(p_scope)`** (`security definer`, deriva `negocio_id`/rol del `auth.uid()`, chequeo de rol dentro). Devuelve un array ordenado de señales. Cubre lo que necesita agregación/lógica de servidor y conviene tener en un solo sitio (reutilizable luego por WhatsApp/voz).
2. **Puesta en marcha → hook existente `useOnboardingStatus`** (`lib/hooks/useOnboardingStatus.ts`), que YA calcula qué pasos del onboarding están hechos leyendo datos reales (servicios, equipo, horarios, datos_negocio, reserva_online, notificaciones, fotos). No requiere RPC ni migración nueva. Una señal de setup existe donde `done[paso] === false`.

El componente `BriefingAgenda` fusiona ambas y **rankea**: si `!coreDone` (núcleo de onboarding incompleto), primero las de puesta en marcha; cuando el salón está operativo, primero las operativas.

## 4. Señales: catálogo y detección

### 4.1 Operativas (RPC `agenda_briefing`)

Todas scoped por `negocio_id`; si el llamante es profesional con scope `self`, se filtran a sus citas.

- **`huecos_rellenables`** — huecos vacíos en horario laboral de **hoy y mañana** (cruce de `negocio_horarios`/`horarios_profesional` con las `citas` del día). Para cada hueco relevante, si hay entradas en `lista_espera` que encajen (servicio/ventana), la acción es "avisar lista de espera" (motor existente); si no, informativo.
- **`citas_en_riesgo`** — citas en las próximas 48 h que cumplan ≥1: (a) `estado='pendiente'` sin confirmar; (b) `deposito_requerido = true and deposito_pagado = false`; (c) cliente con ≥1 no-show previo — **solo si** el modelo de datos registra ese estado; si no, se omite en v1. Acción: recordar/confirmar (reusa notificaciones) o informativo → ficha.
- **`senales_sin_pagar`** — citas activas con `deposito_requerido = true and deposito_pagado = false` e `inicio` futuro. (La interacción con el cron de expiración de señal a 15 min — `expirar_citas_sin_senal` — se pinea en el plan: define qué señales siguen vivas.) Acción: reenviar enlace de pago (reusa flujo de señal).
- **`clientes_a_recuperar`** — clientes cuya última cita **completada** es anterior a **N semanas** (parámetro, por defecto 8) y **sin cita futura**. v1 **informativo** (deep-link a Clientes filtrado); acción de reactivación en fase posterior.

Cada señal del array: `{ tipo, severidad, titulo, detalle, count, items[], accion? }` donde `accion = { tipo, label, payload }` solo cuando existe ruta de ejecución.

### 4.2 Puesta en marcha (hook `useOnboardingStatus`)

Derivadas de `done`: `faltan_servicios`, `sin_horario`, `sin_equipo`, `reserva_online_off`, `notificaciones_off`, `faltan_fotos_servicios`, `faltan_datos_negocio`. Acción: deep-link a la pestaña de Configuración / paso de onboarding correspondiente (`TEMA_DESTINO_MANUAL` ya mapea destinos).

## 5. Contrato del RPC `agenda_briefing`

```
create or replace function public.agenda_briefing(p_scope text default 'all')
  returns jsonb  -- array de señales, ver §4.1
  language sql stable security definer set search_path to 'public'
```
- Deriva `negocio_id` y `role` del `auth.uid()` (patrón de `profiles`); si `p_scope='self'` y el rol es profesional, filtra por su `profesional_id` (patrón `resolverProfesionalDelUsuario` del edge).
- Solo lectura; **no escribe**. Devuelve `'[]'::jsonb` si no hay señales.
- Grants: `revoke ... from public, anon`; `grant execute ... to authenticated` (regla de seguridad round 4). El chequeo de pertenencia/rol va dentro.
- Tras aplicar: pasar advisors de seguridad de Supabase (regla del proyecto).

## 6. UI: `BriefingAgenda`

- Componente nuevo `components/agenda/BriefingAgenda.web.tsx` (+ stub nativo), renderizado dentro del panel `AsistenteAgenda` al abrir.
- Al montar: llama a `agenda_briefing(scope)` y usa `useOnboardingStatus`. Muestra saludo breve **plantillado** (sin coste LLM; pulido con LLM opcional en fase posterior) + lista de **tarjetas de señal** rankeadas.
- Cada tarjeta: título, conteo/detalle y, si hay `accion`, botón que dispara el flujo **propone→confirma** existente (`lib/agendaOps.ts` / edges ya desplegados). Sin `accion`: deep-link a la pantalla/pestaña relevante.
- Reusa el drawer + `createPortal` actuales. Móvil primero (`useResponsive`). Sin trabajo de calendario inline.

## 7. Permisos, scope y toggle

- Reusa el modelo de `lib/permissions.ts` (`asistenteWriteScope()`): owner/admin/recepción → briefing completo del negocio; profesional (scope self) → solo señales de SU agenda (`huecos_rellenables`, `citas_en_riesgo` propios); nada de `senales_sin_pagar`, `clientes_a_recuperar` ni señales de setup.
- Toggle en Configuración (regla de toggles del proyecto): `briefingProactivoActivo` en `negocio_config.config`, leído igual que `asistenteAgendaActivo` (ver `AgendaCalendar.web.tsx`). **Default ON** para owner/admin. Con el toggle OFF, el panel funciona como hoy (sin briefing).

## 8. Handoff onboarding → copiloto

Sin reescribir el flujo de Carlos. Como las señales de setup salen de `useOnboardingStatus` (independiente), el handoff es **emergente**: el briefing muestra los huecos de configuración hasta que se rellenan y luego pasa solo a lo operativo. Opcional (fase posterior): una línea de bienvenida la primera vez que `coreDone` pasa a true.

## 9. Flujo de datos

1. Usuario abre el panel del copiloto en Agenda.
2. `BriefingAgenda` llama a `agenda_briefing(scope)` (sesión autenticada; RLS/rol dentro) y lee `useOnboardingStatus`.
3. Fusiona y rankea señales → pinta tarjetas.
4. Usuario pulsa una acción → flujo propone→confirma existente → ruta de ejecución existente (agendaOps/edge).
5. El briefing **no introduce escrituras nuevas**: orquesta las que ya hay.

## 10. Manejo de errores

- Fallo del RPC → el panel muestra aviso neutro ("no pude cargar el briefing") y deja chatear con normalidad.
- Cada detector es independiente: uno vacío/nulo omite su tarjeta, no rompe el resto.
- Fallo de `useOnboardingStatus` → ya no bloquea la UI (marca `ready` para no mostrar tarjetas en falso).

## 11. Testing

- **Por detector (SQL):** seed en un negocio de prueba con un hueco laboral libre, una cita en riesgo (sin confirmar / sin señal pagada), una señal impaga próxima a caducar y un cliente sin cita completada en >N semanas → asserts de que `agenda_briefing` devuelve exactamente esas señales (patrón `migrations/tests/`).
- **Scope:** como profesional con scope self, solo salen señales de su agenda.
- **Setup:** negocio sin servicios/horario → las señales de puesta en marcha aparecen y rankean primero (`!coreDone`).
- **Toggle:** con `briefingProactivoActivo = false`, el panel no pinta briefing.
- **Frontend:** verificación manual del panel en navegador con cuenta real (no demo).

## 12. Riesgos y coordinación

- **Reparto:** la capa de IA es de Alexandro; el `onboarding-agent` lo hizo Carlos. La unificación de la fontanería compartida (cliente OpenRouter + constante `MODEL` duplicada en ambos edges + auth/CORS) queda como **limpieza ligera a coordinar**, NO como dependencia de esta fase (tocar su fichero tiene riesgo de conflicto/revert; ver gotcha de git conocido).
- **Coste/latencia:** al ser determinista, el briefing no añade coste LLM por apertura.
- **Demo:** en modo demo (iframe, cuenta free) el panel ya no se ve bien; el briefing se prueba con cuenta real.
