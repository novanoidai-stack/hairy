# Roles y permisos de acceso — Diseño

> Fuente normativa: Documento Modular 3 (Equipo y horarios), seccion 7 "Roles y permisos" (RN-EQ-040..043). Autor: Jose Suarez (Product Advisor). Decision de alcance tomada analizando ese documento.

## Objetivo

Implementar el modelo de roles de acceso del salon para que cada miembro del equipo vea y opere solo lo que le corresponde. Cierra la Fase 10.5 del roadmap (rol recepcionista) y materializa la seccion 7 del Modular 3.

## Hallazgos del estado actual

- `profiles.role` es texto, default `'owner'`. Valores en uso: `owner | admin | employee`. Todo registro nace `owner` (trigger `handle_new_user` + edge `signup-free`).
- Gating existente, parcial y a nivel de pantalla: `informes.web.tsx` y `configuracion.web.tsx` usan `canAccessInformes` / `canAccessConfig` (owner/admin) con `setAccessDenied(true)`.
- `lib/auth.ts` define `isOwner`, `canAccessInformes`, `canAccessConfig` (hardcodeados a owner/admin).
- NO existe rol recepcion, ni flujo de alta de cuentas de empleado, ni vinculo `profesionales` (recurso de agenda) <-> `profiles` (cuenta). `is_staff()` / `staff_grant_full_access` son del staff de la PLATAFORMA Mecha, no de los roles internos del salon: no se tocan.
- Navegacion: `components/layout/Sidebar.tsx` (desktop) y `app/(tabs)/_layout.tsx` (movil).

## Modelo del documento (seccion 7)

Cinco roles con permisos acumulativos: Profesional ⊂ Recepcion ⊂ Direccion ⊂ Propietario, mas Personalizado (combinaciones a medida). Reglas:
- RN-EQ-040: el rol determina permisos POR DEFECTO; se pueden anadir permisos especificos sobre esa base.
- RN-EQ-041: permisos sensibles (eliminar datos, exportacion masiva, cambiar plan) reservados a Propietario, NO delegables.
- RN-EQ-042: toda accion queda en audit log (identidad + timestamp), consultable por direccion y propietario.
- RN-EQ-043: el profesional SIEMPRE ve su agenda, su ficha tecnica, sus metricas y sus comisiones (derecho, no permiso configurable).

## Decision de alcance

El sistema completo (5 roles + permisos granulares + editor de Personalizado + alta de cuentas + audit UI) es un epic. Se descompone en iteraciones; esta entrega la **Iteracion 1**, que es la base de seguridad y la de mayor prioridad.

### Iteracion 1 (esta) — Nucleo de permisos: capacidades + 4 roles + gating

Modelo de **capacidades atomicas** y una matriz `rol -> capacidades por defecto`. Cuatro roles fijos mapeados a los valores actuales de BD (sin migrar datos ni tocar signup):

| Rol (doc) | Valor en `profiles.role` | Capacidades (resumen del doc) |
|-----------|--------------------------|-------------------------------|
| Profesional | `employee` | su agenda, fichas de clientas, sus citas, sus metricas/comisiones |
| Recepcion | `recepcion` (nuevo) | + agenda completa de todos, gestionar citas de cualquiera, comunicaciones |
| Direccion | `admin` | + configuracion, equipo, informes, precios/servicios, comisiones, notas internas, gestionar roles |
| Propietario | `owner` | + eliminar datos, exportar, cambiar plan (sensibles, no delegables) |

Capacidades (`lib/permissions.ts`):
`agenda.ver_propia`, `agenda.ver_todas`, `agenda.gestionar_todas`, `clientes.ver`, `clientes.editar`, `clientes.notas_internas`, `equipo.ver`, `equipo.gestionar`, `config.ver`, `config.precios_servicios`, `config.comisiones`, `informes.ver`, `roles.gestionar`, `datos.eliminar`, `datos.exportar`, `plan.cambiar`.

Componentes:
1. **`lib/permissions.ts`** (nuevo): tipo `Role`, `Capability`, `ROLE_CAPS`, `can(profile, cap)`, `roleLabel(role)`, normalizacion de valores legacy.
2. **`lib/auth.ts`** (refactor): `isOwner`/`canAccessInformes`/`canAccessConfig` reimplementados sobre `can()` (compatibilidad total); re-export de `can`.
3. **Gating de navegacion**: `Sidebar.tsx` y `_layout.tsx` ocultan Informes/Configuracion (y opciones sensibles) segun capacidades. Las pantallas mantienen `setAccessDenied` como segunda barrera, alineado a `can()`.
4. **UI de gestion de roles** (en Configuracion, solo `roles.gestionar`): lista las cuentas (`profiles`) del mismo `negocio_id` y permite cambiar su rol. Salvaguardas: no degradar al unico Propietario; asignar/recibir Propietario solo lo hace un Propietario (RN-EQ-041).
5. **Migracion** `migrations/roles-permisos.sql`: permitir el valor `recepcion` en `role` (ajustar constraint si lo hay); policy para que `admin`/`owner` actualicen el `role` de cuentas de su `negocio_id`.
6. **RN-EQ-043**: el gating nunca oculta a un profesional su propia agenda/fichas/metricas.

### Fuera de alcance (iteraciones siguientes)

- **It. 2** — Alta de cuentas de empleado: edge function de invitacion (crea cuenta con rol + `negocio_id` del salon), vinculo `profesionales.user_id -> profiles.id`, UI "dar acceso" desde Equipo.
- **It. 3** — Permisos granulares y rol Personalizado: overrides por cuenta sobre la base del rol (RN-EQ-040), editor de permisos.
- **Audit log UI** (RN-EQ-042): la tabla `audit_log` existe; su visualizacion para direccion/propietario es trabajo aparte.

## Verificacion

- `tsc --noEmit` sin errores nuevos.
- Arrancar la app y comprobar con cuentas de distinto `role` (creadas en Supabase con el `negocio_id` del salon) que: recepcion/profesional no ven Informes ni Configuracion; direccion si; el profesional sigue viendo su agenda.
- La UI de gestion de roles cambia el rol y el gating reacciona tras recargar.

## Consistencia visual

Tema fuego Mecha (`lib/designTokens.ts`). Reutilizar componentes de `components/ui` (SettingsAtoms, DesignComponents). Sin emojis. Espanol.
