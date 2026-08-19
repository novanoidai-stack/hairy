# Autoservicio: cuenta gratis con 30 días de software completo

Fecha: 2026-08-19 · Autor: Carlos + Claude · Estado: aprobado, pendiente de implementar

## Problema

Mecha no tiene autoservicio: es un producto con portero humano.

Una cuenta creada desde la landing nace en `demo_salon_001` con `plan = 'free'`, y
`free` no habilita **ninguna** función (`lib/planes.ts`, constante `FREE`). Ni la agenda.
Lo único que convierte esa cuenta en un salón real es `staff_grant_full_access`, que
solo puede pulsar un miembro del staff desde `web/admin.html`: es esa RPC la que
genera el `negocio_id` propio y la que sella `trial_ends_at` (`migrations/p0-005`).

Consecuencia: quien se registra por su cuenta no puede hacer nada más que mirar la
demo y pulsar "solicitar acceso", que abre una solicitud y le deja esperando una
llamada nuestra.

La causa de fondo es que `plan = 'free'` significa hoy dos cosas incompatibles a la
vez: "acabo de registrarme" y "no tengo derecho a nada". Mientras signifiquen lo
mismo, el sistema necesita un humano en medio para distinguirlas.

## Lo que ya existe y NO hay que construir

Casi toda la maquinaria del periodo de prueba está hecha y en producción:

- **Contador para el cliente:** banner de días restantes en `components/acceso/GuardaSuscripcion.tsx`.
- **Bloqueo al vencer:** muro de contratación a pantalla completa, en el mismo archivo.
- **Caducidad automática:** cron `caducar_pruebas_vencidas()` (`migrations/p0-007`),
  que baja el plan a `free` y el estado a `caducada`.
- **Avisos de fin de prueba:** edge `avisar-fin-prueba` (`migrations/p0-006`).
- **Panel de staff:** `web/admin.html` ya muestra días restantes, fecha de fin, badges
  "prueba activa" / "prueba vencida", KPIs agregados y botón "+30 días prueba"
  (`staff_extend_trial`, en `migrations/fix-rpc-modo-acceso-y-extender-prueba.sql`).

Lo que falta es **el arranque automático** de todo eso.

## Decisiones tomadas

1. **El trial se modela como plan de pago en estado de prueba**, no como un `free`
   con funciones. Cuenta en prueba = `plan = 'esencial'` + `suscripcion_estado = 'prueba'`
   + `trial_ends_at`. Motivo: no introduce una segunda regla de acceso que mantener
   sincronizada con la del plan. Todo lo que ya corta por plan (menú lateral,
   `withPlanGate`, el 402 de la edge `agenda-asistente`) sigue funcionando sin tocarlo,
   y el cron de caducidad ya hace el corte.
2. **El reloj arranca al crear la cuenta.**
3. **El `negocio_id` propio se crea también en el registro**, en el mismo acto que el
   trial. Deja sin efecto la regla anterior de que toda cuenta nueva nace en
   `demo_salon_001`, que existía únicamente porque el signup no podía entregar producto.
4. **El addon de IA se pide, no se contrata.** Solicitud tipada que nos llega por correo.

## Los cuatro estados de una cuenta

| Estado | `plan` | `suscripcion_estado` | `negocio_id` | Qué ve la persona |
|---|---|---|---|---|
| Visitante sin cuenta | — | — | — | Landing y demo pública. Nada más. |
| Registrado en prueba | `esencial` | `prueba` | propio | Software completo + banner de días restantes |
| Prueba agotada | `free` | `caducada` | propio | Muro de contratación; sus datos siguen intactos |
| Cliente de pago | `esencial` / `estudio` | `activa` | propio | Todo, sin banner |

A partir de aquí **`free` significa una sola cosa: prueba agotada**. Es el arreglo
de arquitectura de fondo.

## Diseño

### 1. Registro autoservicio

`supabase/functions/signup-free/index.ts`, en el INSERT del perfil (hoy línea ~207):

- Generar `negocio_id` propio en vez de `demo_salon_001`. Reutilizar la lógica de slug
  ya probada de `staff_grant_full_access`: base = `nombre_negocio` normalizado (minúsculas,
  espacios a `_`, fuera todo lo que no sea `[a-z0-9_]`), sufijo = código postal si lo hay
  o 5 hex aleatorios si no, y reintento con sufijo aleatorio si colisiona.
- `plan: 'esencial'`, `suscripcion_estado: 'prueba'`, `trial_ends_at: now() + 30 días`.

Se hace con la `service_role` que la función ya usa, así que salta RLS. El trigger
`guard_profile_identity_columns` congela `plan`, `negocio_id`, `trial_ends_at` y
`suscripcion_estado`; **verificar durante la implementación si dispara en INSERT o solo
en UPDATE**, y si dispara, marcar `mecha.identity_ctx = '1'` como hacen las demás
funciones que tocan esas columnas.

El nombre del salón puede no existir todavía en el registro (alta por Google, p. ej.).
Si falta, generar `salon_<5 hex>` y dejar que el renombrado lógico ocurra al completar
los datos: el `negocio_id` es una clave interna y **no se renombra nunca** una vez creada,
porque es la clave de partición multi-tenant de todas las tablas.

### 2. Primer arranque

`web/acceso.html` deja de enrutar a las cuentas nuevas al panel "free" con su botón de
"solicitar acceso". El flujo pasa a ser:

1. Completar datos del salón (pantalla `paneComplete`, ya existe).
2. Elegir modo de acceso del equipo: individual (cada empleado con su correo) o
   compartido. La RPC `set_acceso_salon_modo` ya existe y ya está cableada en
   `app/(tabs)/configuracion.web.tsx`; aquí solo se adelanta al primer arranque.
3. Onboarding y software.

El panel "free" de `acceso.html` sigue existiendo, pero solo lo ven las cuentas cuya
prueba ha caducado y los trabajadores de un salón que aún no tiene el software activo
(ese caso ya está contemplado en `initFreePane(esDelEquipo)`).

### 3. Contador de días

No hay que construirlo. Hay que **corregir el texto**: `GuardaSuscripcion.tsx` y
`admin.html` afirman en cuatro sitios que la prueba es del "Plan Estudio completo",
y la prueba pasa a ser Esencial. Es una afirmación falsa dentro del producto y se
corrige aunque no formara parte del encargo.

Revisar también el KPI "free" de `admin.html` (cuenta perfiles con `plan = 'free'` y sin
`trial_ends_at`): con el nuevo modelo ese conjunto queda vacío. Debe pasar a contar
pruebas caducadas o desaparecer.

### 4. Pedir los Recepcionistas IA

Tipo nuevo `addon_ia` en `solicitudes`. Requiere tocar **los dos sitios de rigor**:
la función `crear_solicitud_publica` y el CHECK de la tabla `solicitudes` — si solo se
toca uno, la inserción falla en producción.

Puntos de entrada: el selector posterior al login y Ajustes → Suscripción (donde ya
vive `components/config/SeccionSuscripcion.web.tsx`). Reutiliza la edge
`notificar-solicitud` sin cambios: avisa a `contacto@mechaa.es` y confirma al interesado.

### 5. Fuera de alcance

- **Demo compartida:** intacta. Usa su sesión Supabase aislada (`demo.publico`,
  `storageKey: 'mecha-demo-auth'`), ajena al perfil del visitante.
- **`staff_grant_full_access`:** se conserva tal cual. Sigue siendo la vía para los
  salones que preconfiguramos nosotros antes de dar acceso.
- **Stripe, renovación y cobro del addon:** territorio de Alexandro.

## Riesgo asumido

Con el reloj arrancando en el registro, quien se apunte solo para curiosear la demo
consume días de prueba sin usar el software. Decisión consciente del producto. Mitigación:
los avisos de fin de prueba (`avisar-fin-prueba`) y `staff_extend_trial`, que permite
regalar 30 días más con un clic desde el panel de staff.

## Criterios de aceptación

1. Una persona sin cuenta se registra desde la landing y llega al software con agenda,
   fichas, caja e informes operativos, sin que ningún miembro del staff intervenga.
2. Esa cuenta tiene `negocio_id` propio, distinto de `demo_salon_001`.
3. Ve en todo momento cuántos días de prueba le quedan.
4. Nosotros vemos esos mismos días en el panel de staff.
5. A los 30 días pierde el acceso al software y conserva sus datos.
6. Puede solicitar los Recepcionistas IA y la solicitud nos llega por correo y queda
   registrada en la bandeja.
7. Ningún texto del producto sigue prometiendo "Plan Estudio" durante la prueba.
