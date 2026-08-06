# Registro de errores operativos + soporte directo, y reseña de profesional

Fecha: 2026-08-06. Autonomía de implementación concedida por el usuario para este encargo completo (diseñar, construir y desplegar sin checkpoints intermedios).

## Contexto

Auditoría previa a este diseño (ver conversación) encontró:

- `errores_cliente` + `lib/reportarError.ts` + pestaña "Errores" en `admin.html` ya existen (desplegados el mismo día), pero **solo capturan excepciones no controladas** (`window.onerror`, `unhandledrejection`, `GlobalErrorBoundary`). La tabla tiene 0 filas en producción: no es un bug de UI, es que los fallos que le importan al usuario (cobro rechazado, login fallido, Chispa que no responde, formulario que no valida) se manejan hoy como errores "normales" — se traducen con `lib/errores.ts:mensajeDeError()` y se muestran al usuario — y nunca llegan a lanzar una excepción no controlada.
- La pestaña "Auditoría IA" (contador de tokens) está rota de raíz: la tabla `chispa_auditoria` y sus RPC funcionan, pero ninguna de las 7 edge functions que llaman a un LLM invoca el registrador (`supabase/functions/shared/chispa-auditoria.ts`). Arreglar esa instrumentación es un trabajo aparte (tocar 6-7 edge functions); fuera de alcance aquí. Esta tarea solo retira la pestaña.
- Ya existe un canal de soporte por correo (`TabSoporte` en `configuracion.web.tsx`, `mailto:` con asunto/cuerpo prellenado). Cubre "por correo". Falta el canal "a través de Mecha": un mensaje que aterrice directamente en el panel de staff sin depender del cliente de correo del salón.
- Reseñas: existe `resenas` con puntuación de salón (`puntuacion`/`comentario`) y de Mecha (`mecha_puntuacion`/...). `profesional_id` ya enlaza qué profesional atendió, pero no hay puntuación propia del profesional, y el portal `/resena/[slug]` hoy no pregunta ni conoce quién atendió (no recibe contexto de cita). `crear_resena_publica` tiene una sola firma viva hoy — hay que respetar eso: si se reescribe con parámetros nuevos que no sean todos `DEFAULT` al final de la lista actual, se puede recrear el bug de sobrecarga ambigua (42725) que ya se sufrió y limpió (ver comentario en `lib/reservaPublica.ts`).
- No existe ningún campo para enlazar reseñas de Google. Los QR de reserva y reseña Mecha se generan en `configuracion.web.tsx` con `qrcode-generator`, mismo patrón a reutilizar.

## Proyecto 1 — Registro de errores operativos + soporte directo a Mecha

### 1A. Ampliar qué se registra como error

- `errores_cliente` gana columna `tipo text not null default 'excepcion' check (tipo in ('excepcion','operativo','ia'))`.
- `registrar_error_cliente` acepta `p_tipo text default 'excepcion'` y lo guarda (validado contra el mismo check).
- `staff_errores_cliente` devuelve `tipo` (agregado con `min()`, sin tocar el agrupado por `huella` para no romper la deduplicación existente).
- `lib/reportarError.ts`: `reportarError(error, { origen?, pila?, tipo? })` — pasa `tipo` al RPC (por defecto `'excepcion'`, sin cambiar el comportamiento actual de quien no lo pase).
- `lib/errores.ts`: `mensajeDeError()` pasa a reportar automáticamente (`tipo:'operativo'`) cada vez que traduce un error real (no en el caso trivial `!error`). Se envía el mensaje ya humanizado como `mensaje` (agrupa mejor y es legible para el staff) y el código/detalle crudo de Postgres como `pila`. Como esta función la usan 27 archivos (login, cobro, citas, config, presupuestos, inventario, campañas...), este único cambio cubre de golpe casi todos los ejemplos que dio el usuario ("no se pudo completar el cobro", "falla el login", "no ha rellenado bien el formulario").
- `ChispaPanel.web.tsx` no pasa por `mensajeDeError` (tiene sus propios mensajes de fallo). Se añaden 3 llamadas a `reportarError(..., {tipo:'ia'})` en los puntos donde hoy se traga el fallo en silencio: fallo de conexión con el edge, `data.error` explícito, y acción que no se pudo aplicar.
- No se toca ningún otro archivo: con `mensajeDeError` + los 3 puntos de Chispa se cubre "cualquier bloqueo... que le salta un error" sin tener que instrumentar sitio por sitio.

### 1B. Canal "escríbenos a través de Mecha"

- Tabla nueva `soporte_mensajes` (RLS activo, sin políticas — solo por RPC, igual que `errores_cliente`): `id, creado_en, negocio_id, user_id, autor_nombre, autor_email, asunto, mensaje, estado ('nuevo'|'leido'|'resuelto'), leido_en, resuelto_en`.
- `crear_mensaje_soporte(p_asunto, p_mensaje)` — solo autenticado, límite de 10/hora/usuario (`check_rate_limit`), rellena `negocio_id`/`user_id`/datos de contacto desde el `profile` del que llama.
- `staff_mensajes_soporte(p_estado default null, p_limit default 100)` y `staff_marcar_soporte(p_id, p_estado)` — solo `is_staff()`.
- Edge function nueva `notificar-soporte`: mismo patrón SMTP (Hostinger) que `send-reset/index.ts`, envía un aviso a `novanoidai@gmail.com` con asunto/mensaje/salón. Se llama fire-and-forget desde el cliente justo después de insertar el ticket (si el email falla, el ticket ya quedó guardado y visible en el panel; no bloquea al usuario).
- UI: en `TabSoporte` (`configuracion.web.tsx`), un bloque nuevo *antes* de las tarjetas de `mailto:` existentes: "Mándanos un mensaje directo (aparece al instante en nuestro panel)" — select de asunto (reutiliza los mismos 4 temas) + textarea + enviar. Las tarjetas `mailto:` actuales se quedan tal cual (siguen cubriendo "por correo").

### 1C. Panel de staff (`admin.html`)

- Se elimina la pestaña "Auditoría IA" (botón, contenedor `view-auditoria_ia`, `loadAuditoriaIA`/`renderAuditoriaIA` y sus listeners). No se toca la tabla `chispa_auditoria` ni sus RPC por si se retoma la instrumentación más adelante.
- Pestaña "Errores": añade badge/filtro por `tipo` (excepción / operativo / IA) reutilizando el estilo de "plan" ya usado para el badge de veces/salones.
- Pestaña nueva "Soporte": lista `soporte_mensajes` (más reciente primero), badge con el número de `nuevo`, botones para marcar leído/resuelto. Mismo estilo visual que "Errores" (`card-row`).

## Proyecto 2 — Reseña de profesional + QR de Google

### 2A. Esquema

- `resenas` gana `profesional_puntuacion smallint check (between 1 and 5)` y `profesional_comentario text` (ambas nullable: la reseña de profesional es opcional, no todas las visitas identifican a quién atendió).
- `negocio_portal` gana `link_resena_google text` (URL completa que el salón pega desde su ficha de Google Business).
- `crear_resena_publica` se reescribe con `create or replace` **manteniendo exactamente los parámetros actuales en su orden actual** y añadiendo `p_profesional_puntuacion smallint default null, p_profesional_comentario text default null` al final — mismo overload, cero riesgo de 42725.
- `resenas_publicas(p_slug)` incorpora la media de `profesional_puntuacion` cuando exista dato.
- RPC nueva de lectura `resenas_por_profesional(p_slug text)` → `(profesional_id, profesional_nombre, media, total)`, para uso futuro en el perfil del profesional o el portal público.

### 2B. Portal `/resena/[slug]`

El portal es genérico (llega por QR, no por una cita concreta: no conoce quién atendió). Se añade un paso opcional "¿Quién te atendió?" con los profesionales activos del salón (ya vienen en `portal_info().profesionales`, reutilizado sin RPC nueva) — si el cliente elige uno, se muestra el bloque de estrellas + comentario para ese profesional; si no elige (o pulsa "prefiero no decirlo"), se omite y la reseña se manda igual sin datos de profesional.

### 2C. QR de reseña de Google

En `configuracion.web.tsx`, junto a los QR existentes de reserva (`/r/slug`) y reseña Mecha (`/resena/slug`): un campo de texto para `link_resena_google` (guarda en `negocio_portal` con el mismo `upsert` que ya existe) y, si hay valor guardado, un tercer bloque QR (mismo patrón `qrcode-generator` + `descargarQR`) que apunta directamente a esa URL externa, con nota de que es para imprimir y dejar en el mostrador.

## Fuera de alcance (explícito)

- Arreglar la instrumentación real de tokens/coste de IA en las 6-7 edge functions (haría falta para poder recuperar ese dato más adelante; no es parte de este encargo).
- Botón "reportar este error concreto" enganchado a cada toast/aviso de error individual — el formulario de soporte general ya cumple "desde el soporte pueden enviarnos un mensaje"; enganchar contexto automático a cada superficie de error sería una ampliación futura, no necesaria para el MVP pedido.
- Reseña de Google por profesional (enlaces individuales) — el usuario describió "un apartado" (singular) a nivel de configuración del salón; se implementa a nivel de salón, no por profesional.
