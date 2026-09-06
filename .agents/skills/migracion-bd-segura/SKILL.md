---
name: migracion-bd-segura
description: Checklist obligatorio para escribir o modificar cualquier migración SQL de Supabase de Mecha en supabase/migrations/, sean RPCs security definer, políticas RLS, triggers o grants a anon. Usar SIEMPRE antes de crear una migración, una RPC, una política RLS o un trigger, aunque el cambio parezca pequeño. Cubre la regla del parámetro (exige_mi_negocio), el InitPlan de RLS, los grants explícitos, el patrón del portal público y la verificación posterior (advisors + npm run vigilar:bd).
---

# Migración de BD segura (Mecha)

Este proyecto ya perdió batallas por saltarse este checklist: doce RPC sin atar al llamante,
una política RLS que dejaba borrar el admin de otro salón, un trigger con una columna fantasma
que tumbó TODAS las altas de citas. Nada de esto es teórico: cada regla de abajo tiene un
incidente detrás. Si vas a tocar `supabase/migrations/`, sigue el checklist entero.

## Antes de escribir

- Crear el fichero con `supabase migration new <nombre>` → genera `<14 dígitos>_<nombre>.sql`.
  Nunca inventes el timestamp a mano.
- El fichero va en UTF-8 **sin BOM** (uno en UTF-16 rompió el CLI de Supabase).
- Se aplica con `supabase db push`. **Nada de aplicar SQL a mano por el editor SQL del
  dashboard**: registra la versión con SU PROPIO timestamp y la migración sale "sin aplicar"
  para siempre en `bd-migraciones`. Si hubo emergencia y se aplicó a mano, registra el fichero
  y corre `supabase migration repair --status applied`; si es una conocida, va con su prueba
  en `scripts/vigilantes/migraciones-conocidas.json`.
- El historial remoto manda. La carpeta canónica es `supabase/migrations/` (las históricas
  viven en `archive/migraciones-legacy/`, solo lectura mental).

## La regla del parámetro (multi-tenant)

Si una RPC recibe `negocio_id` — o un id del que se deduce (`p_cliente_id`, `p_cobro_id`,
`p_factura_id`, `p_profesional_id`) — **tiene que atarse a quien llama**:

```sql
perform public.exige_mi_negocio(v_negocio, true);  -- el boolean: solo owner/admin
```

Sin eso el multi-tenant no existe: basta cambiar un uuid para operar sobre otro salón.
`exige_mi_negocio` deja pasar el `uid` nulo A PROPÓSITO (llamadas internas y service_role;
esas funciones no están concedidas a `anon`).

Las RPC públicas del portal son la excepción que confirma la regla: no hay sesión a la que
atar, así que **el negocio se deduce del slug** contra `negocio_portal` (`where slug = p_slug
and portal_activo = true`) y la prueba de tenencia es un rate limit + secreto por registro.
Nunca aceptes el `negocio_id` por parámetro del cliente.

## Políticas RLS

- **Envuelve las llamadas a ayudantes en `(select ...)`**: `id = (select auth.uid())`,
  `(select public.my_negocio_id_text())`, `(select public.is_staff())`. Suelta, Postgres la
  evalúa UNA VEZ POR FILA; en subselect, una por consulta. Esta faltó una vez y costó
  24 M de seq scans y 456 M de tuplas leídas.
- **Los ayudantes de RLS van `STABLE`, nunca `VOLATILE`**: `my_negocio_id_text()`,
  `is_staff()`, `is_shared_demo_visitor()`, `exige_mi_negocio()`.
- **Lee el lado izquierdo en voz alta**: una política que dice `role = 'admin'` habla de la
  FILA ("cuyo rol es admin"), no del llamante ("si tú eres admin"). Es al revés de lo que
  querías, y con `using (true)` cualquiera edita otra tabla.
- Nunca `using (true)` de escritura, nunca `exec_sql`. Toda tabla con `negocio_id` necesita
  una política que mencione algo que ate al llamante (lo vigila `vigilancia_bd()`).

Ejemplo del patrón correcto (`20260829092248_rls_profiles_y_multitenant.sql`):

```sql
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_staff())
    or (
      negocio_id = (select public.my_negocio_id_text())
      and (negocio_id <> 'demo_salon_001' or coalesce(es_cuenta_demo, false))
    )
  );
```

## Funciones nuevas (RPC)

- `set search_path to 'public'` y `security definer` cuando toque.
- **`drop function if exists public.mi_funcion(<firma exacta>);` antes del `create or
  replace`** cuando cambies la firma: dos firmas vivas a la vez = PGRST203 y la RPC cae.
- **Grants explícitos, nunca por defecto**: `revoke all on function ... from public, anon;`
  y luego `grant execute ... to authenticated` (o `to anon, authenticated` SOLO si es del
  portal público). Desde el round 4 las funciones nuevas NO nacen ejecutables por `anon`.
- Acaba con `comment on function ... is '...'` explicando quién puede llamarla y por qué es
  segura. La generación siguiente te lo agradecerá.

Ejemplo completo y modelo: `supabase/migrations/20260830210025_retencion_comisiones_y_bizum.sql`.

## RPC pública del portal

Patrón de `crear_cita_publica` / `completar_datos_pago_publico`: negocio por slug + gate
`negocio_con_acceso(v_negocio)` + **anti-abuso en servidor** (nunca en cliente):
`rate_limit_ok('nombre_cubo', v_ip, N, interval '...')` por IP, topes por teléfono/negocio,
captcha de un solo uso si `negocio_portal.captcha_activo`. Grants `to anon, authenticated`
y `notify pgrst, 'reload schema'` al final de la migración.

Dos detalles que muerden: si el recurso público necesita un identificador (una
"referencia"), que no sea adivinable ni el uuid de fila — columna propia con índice único
parcial. Y antes de escribir un `estado` en un UPDATE, mira el CHECK de la tabla: si el
valor que quieres no está en la lista (p. ej. un 'cancelado' que no existe en `bonos`),
la escritura falla con 23514 y el usuario ve un error genérico.

## Después de escribir (obligatorio, en este orden)

1. **Advisors de Supabase (security)**: se AUDITAN, no se limpian a ciegas. La inmensa
   mayoría de `*_security_definer_function_executable` es la arquitectura (el cliente llama
   a RPCs definer que comprueban permiso dentro); "arreglarlos" es apagar la API.
2. **`npm run vigilar:bd`** — la guardia local. Lo que va a cazarte si te saltaste algo:
   `bd/rpc-sin-guard` (regla del parámetro), `bd/rls-sin-initplan`, `bd/helper-volatil`
   (bloqueante), `bd-sobrecargas-rpc` (PGRST203), `bd-triggers-ciegos` (columnas fantasma
   en triggers: no dan null, lanzan 42703 y tumban la escritura entera).
3. **Vigilante nuevo en el mismo commit** si añadiste un invariante (ver skill
   `nuevo-vigilante`). "Los invariantes repartidos son la fábrica de regresiones".
4. **Trigger nuevo**: lee cada `new.campo` y comprueba que la columna existe EN ESA TABLA
   (o usa `to_jsonb(coalesce(new, old))->>'campo'`). Ojo: `bloqueos_profesional` SÍ tiene
   `negocio_id`; `horarios_profesional` NO.

## Trampas ya pisadas (no repitas)

- Un trigger no puede leer un campo que su tabla no tiene — en PL/pgSQL lanza, no devuelve null.
- `vigilancia_bd()` y otras RPC estaban aplicadas en producción sin su SQL en el repo:
  si heredas una función, reconstrúyela con `pg_get_functiondef()` de producción, no de memoria.
- La convención de caja: `total_cents` de cobros YA INCLUYE la propina (el comentario de una
  migración antigua que decía "= total + propina" está mal).
- No existe tabla `negocios` (el tenant es `negocio_id` TEXT) y `citas.canal` solo admite
  manual|web|whatsapp|instagram|agente_voz|asistente_ia.
