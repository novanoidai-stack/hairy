# Mi jornada — panel personal por profesional

> Spec de diseño. Fuente de decisiones: brainstorming con Carlos (24 jun 2026).
> Producto: Mecha (repo Hairy). Estado del producto: `informes/MEGA_INFORME_MECHA.md`.

## Problema

Hoy la pantalla **Caja** mezcla dos cosas: el dinero del salón (arqueo, cobros,
citas pendientes — solo para gestores) y el **fichaje** de jornada (para todos). Un
empleado que entra al software no tiene un sitio propio donde llevar su seguimiento:
sus citas completadas, sus horas, sus cobros, su rendimiento. La caja diaria no debería
ser lo primero (ni lo único) que ve un profesional.

## Objetivo

Una página nueva **"Mi jornada"** en el nav principal, para **todos los roles**, donde
cada persona ve SU propia actividad. El gestor (propietario/dirección) la tiene además
de la Caja completa del salón.

## Decisiones tomadas (brainstorming)

1. **Estructura:** página nueva "Mi jornada" en el nav principal para todos. La Caja
   pierde la tarjeta de fichaje y queda solo para owner/dirección (`canSeeAll`).
2. **Vinculación cuenta ↔ profesional:** se asigna desde **Equipo** (setea
   `profesionales.profile_id`). "Mi jornada" resuelve `auth.uid() → su ficha` por ese vínculo.
3. **Rendimiento configurable por el dueño:** flags en `negocio_config.config`
   (`mi_jornada_mostrar_importes` default ON; `mi_jornada_mostrar_comision` default OFF).
   El gate es **server-side** (en la RPC), no solo UI.
4. **Rango temporal:** bloque "Hoy" fijo + selector Hoy / Semana / Mes para acumulados.
5. **Onboarding (lo más limpio):** la ficha de profesional en Equipo permite **vincular
   una cuenta existente o invitar una nueva en el mismo paso** (reutiliza la edge function
   `crear-acceso-empleado`). Badge "sin cuenta" en la lista de profesionales.

## Contexto verificado en la base de datos (proyecto `vtrggiogjrhqtwbhbgia`)

- El **acceso de empleados YA EXISTE**: Configuración → "Accesos y roles" → "Añadir acceso"
  → edge function `crear-acceso-empleado` (invita por email, crea `profile` en el negocio
  con rol). No se reconstruye.
- `profesionales.profile_id` (uuid) **existe pero está vacío en todos los negocios**.
- `fichajes` tiene `user_id` (cuenta) y `profesional_id`.
- `cobros.profesional_id` (text) referencia la ficha de `profesionales`. `citas.profesional_id` (uuid) igual.
- `citas.estado` completada = `'completada'`. Color/tinte: `servicios.categoria='Color'`,
  o `servicios.duracion_espera_min > 0` (servicios con reposo), o `citas.formula_*` no nulo.
- Ajustes del negocio: tabla `negocio_config(negocio_id, config jsonb)` (upsert).
- `profesionales.comision_pct` existe (numeric).
- Roles canónicos en `lib/permissions.ts`: propietario(owner)/direccion(admin)/recepcion/profesional(employee).
  `canSeeAll` en caja = owner|admin.

## Arquitectura

### Capa de datos — RPC `mi_jornada_resumen`

`security definer`, firma `mi_jornada_resumen(p_desde timestamptz, p_hasta timestamptz)`.
Responsabilidad única: devolver el resumen de la jornada del usuario logueado en el rango.

Pasos:
1. Resolver `auth.uid()` → `profiles` (rol, negocio_id) → `profesionales` por `profile_id`.
2. Leer flags de `negocio_config.config` del negocio.
3. Calcular y devolver JSON:
   - `profesional`: { id, nombre, vinculado: bool }
   - `fichajes_hoy`: lista entrada/salida del día + `horas_hoy` (emparejando entrada→salida).
   - `citas`: { completadas_count, lista_hoy } (en rango; lista solo para "hoy").
   - `servicios`: { total, tintes } (en rango).
   - **dinero** (solo si `mostrar_importes` o rol gestor): { total_cents, propinas_cents, ticket_medio_cents, efectivo_cents, datafono_cents, cobros_count }.
   - **comision_estimada_cents** (solo si `mostrar_comision` o rol gestor, y hay `comision_pct`).
4. **Gate server-side:** si el rol no es owner/admin y el flag está OFF, los campos de
   dinero/comisión NO se incluyen en la respuesta (no basta con ocultarlos en la UI).

El **fichar** (entrada/salida) sigue siendo un `insert` en `fichajes` con `user_id` +
`profesional_id` (como hoy en caja), y luego se refresca la RPC.

Seguridad: tras aplicar la migración, pasar los advisors de Supabase (security). La RPC no
abre SELECT de `cobros` a empleados (todo pasa por la función con definer).

### Página `app/(tabs)/mi-jornada.web.tsx` (+ stub nativo `.tsx`)

Mobile-first con `useResponsive()`. Tokens fuego-crema reutilizados de `caja.web.tsx`.

- **Cabecera:** nombre de la persona + rol + selector segmentado **Hoy / Semana / Mes**.
- **Bloque Hoy (fijo):**
  - Tarjeta de **fichaje** (botón entrada/salida, lista de marcas del día, horas trabajadas hoy).
  - **Citas de hoy** (completadas; próximas como guía).
  - **Cobrado hoy** (si importes visibles).
- **Bloque Periodo (según selector):** tarjetas de métricas: citas completadas · horas ·
  servicios · tintes · total cobrado · propinas · ticket medio (+ comisión si activa).
- **Estado sin vínculo:** si `profesional.vinculado === false`, mostrar solo el fichaje y un
  aviso: "Pídele al responsable que vincule tu cuenta a tu ficha de profesional para ver tus
  citas y cobros."

### Navegación

- `components/layout/Sidebar.tsx`: nueva entrada "Mi jornada" (sin capacidad → visible para todos).
- `app/(tabs)/_layout.tsx`: registrar `mi-jornada` en desktop y como tab en móvil.
  En móvil el bottom-tab está lleno para el owner: priorizar Mi jornada para
  profesional/recepción; para owner puede vivir en la nav lateral. (Detalle a cerrar al implementar.)
- **Caja:** quitar la tarjeta de fichaje (se muda aquí). El resto de Caja sigue gateado por `canSeeAll`.

### Equipo — vínculo cuenta ↔ profesional

En `app/(tabs)/equipo.web.tsx`, modal de editar/crear profesional:
- Campo **"Cuenta de acceso"**: selector de cuentas del negocio sin vincular (`profiles`
  del negocio cuyo `id` no esté ya en `profesionales.profile_id`) → al elegir, `update
  profesionales set profile_id`. Opción **"Invitar nueva"** que reutiliza
  `crear-acceso-empleado` (email + rol profesional) y, al volver, queda lista para vincular.
- **Badge "sin cuenta"** en la lista de profesionales sin `profile_id`.

### Configuración — visibilidad

En `app/(tabs)/configuracion.web.tsx`, sección nueva (solo dirección/owner) con dos toggles
que escriben en `negocio_config.config`: `mi_jornada_mostrar_importes`, `mi_jornada_mostrar_comision`.

### Demo

`demo_salon_001` no tiene cuentas de empleado (todo owner) ni vínculos. Para enseñarlo:
crear una **cuenta de profesional demo** vinculada a una ficha, con jornada/citas/cobros, y
re-sembrar. (Se aísla del resto; se documenta el proceso.)

## Reparto

**Carlos:** UI (página, Equipo, Configuración, nav), RPC de lectura, flags JSON, vínculo,
ajuste de Caja. Reutiliza la edge function existente. No mueve dinero, ni IA, ni mensajería,
ni OAuth → no es de Alexandro.

## Fuera de alcance (v1)

Ranking entre profesionales, objetivos/metas, ocupación calculada (horas con cita / horas
fichadas), exportes personales (CSV), notificaciones.

## Verificación

- `npx tsc --noEmit` sin errores nuevos (ignorar `supabase/functions`, son Deno).
- `npm run build:web` compila.
- Advisors de Supabase (security) tras la migración de la RPC.
- Prueba manual: entrar como profesional vinculado (Mi jornada con datos), como owner
  (Mi jornada + Caja), y como profesional sin vínculo (estado-aviso). Toggles de visibilidad
  ocultan/muestran dinero y se respetan también a nivel de RPC.
