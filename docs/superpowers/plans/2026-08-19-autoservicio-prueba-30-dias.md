# Autoservicio con prueba de 30 días — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado)
> o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan
> casillas (`- [ ]`) para seguimiento.

**Goal:** Que una persona se registre desde la landing y entre al software con su propio
salón y 30 días de plan Esencial, sin que ningún humano del staff intervenga.

**Architecture:** El cambio de fondo cabe en un trigger de Postgres. `handle_new_user`
es quien realmente crea el perfil en cada alta (web, nativo y Google OAuth) y hoy
hardcodea `negocio_id = 'demo_salon_001'` y `plan = 'free'`. Cambiando ese trigger para
que genere un `negocio_id` propio y selle `plan='esencial' / suscripcion_estado='prueba' /
trial_ends_at = now()+30d`, todo lo demás ya funciona sin tocarse: `routeByPlan` de
`acceso.html` ya manda al software a cualquier plan distinto de `free`, los gates ya cortan
por plan, el cron `caducar_pruebas_vencidas()` ya caduca y el panel de staff ya cuenta días.
El resto del plan son consecuencias: la generación del slug extraída a función reutilizable,
el modo de acceso del equipo en el primer arranque, la solicitud de addon de IA y los
textos que hoy mienten diciendo "Plan Estudio".

**Tech Stack:** PostgreSQL (Supabase, funciones `security definer`), Deno (edge functions),
HTML/JS estático (`web/`), Expo + react-native-web (`app/`, `components/`).

**Spec:** `docs/superpowers/specs/2026-08-19-autoservicio-prueba-30-dias-design.md`

---

## Contexto que el ejecutor necesita antes de empezar

Cinco cosas que no son obvias y que, si se ignoran, hacen fallar el trabajo en silencio:

1. **El perfil lo crea el trigger, no la edge function.** `supabase/functions/signup-free/index.ts:207`
   hace un `insert` sobre `profiles`, pero el trigger `handle_new_user` ya insertó esa fila
   antes con `on conflict (id) do nothing`. El insert de la edge **no gana**: falla y solo
   se registra en consola (`console.error('profile insert failed'`). Quien manda es el trigger.
2. **`guard_profile_identity_columns` es BEFORE UPDATE, no INSERT.** Se comprueba en
   `migrations/ia-addon-separado-del-plan.sql:40`: usa `old.*`, así que solo dispara en UPDATE.
   Un INSERT puede escribir `plan` y `trial_ends_at` libremente. Cualquier **UPDATE** de esas
   columnas, en cambio, necesita `set_config('mecha.identity_ctx', '1', true)` antes o se
   revierte sin dar error.
3. **Los tipos de solicitud se validan por duplicado**: en el CHECK de la tabla y dentro de
   `crear_solicitud_publica`. Ampliar solo uno hace que el lead se pierda en silencio (la RPC
   devuelve 200 igual). Está documentado en `migrations/solicitudes-tipo-calculadora.sql`.
4. **La demo compartida no se toca.** Usa una sesión Supabase aislada (`demo.publico`,
   `storageKey: 'mecha-demo-auth'`), independiente del perfil del visitante.
5. **El `negocio_id` no se renombra nunca** una vez creado: es la clave de partición
   multi-tenant de todas las tablas y de las políticas RLS.

Las migraciones se aplican por la vía habitual del proyecto (MCP de Supabase o
`supabase/functions/apply-migrations`); el historial remoto manda. Tras **cada** migración
hay que pasar los advisors de seguridad de Supabase — es regla del proyecto.

---

## Estructura de archivos

**Crear:**
- `migrations/p1-autoservicio-generar-negocio-id.sql` — función `generar_negocio_id(text, text, uuid)`,
  única responsable de convertir un nombre de salón en un `negocio_id` único.
- `migrations/p1-autoservicio-alta-con-prueba.sql` — `handle_new_user` reescrito para usar esa
  función y sellar plan Esencial + prueba de 30 días.
- `migrations/p1-autoservicio-solicitud-addon-ia.sql` — tipo `addon_ia` en el CHECK y en la RPC.

**Modificar:**
- `supabase/functions/signup-free/index.ts:45-51,205-230` — quitar la constante `DEMO_NEGOCIO_ID`
  y el insert muerto; devolver el `negocio_id` real que creó el trigger.
- `web/acceso.html` — paso de "modo de acceso del equipo" en el primer arranque y botón de
  solicitar el addon de IA.
- `components/acceso/GuardaSuscripcion.tsx:96,116,187` — textos "Plan Estudio" → Esencial.
- `web/admin.html:1087,1573,1599` — copys y KPI "free".
- `components/config/SeccionSuscripcion.web.tsx` — botón de solicitar el addon de IA.

**Sin tocar:** `lib/planes.ts` (el modelo elegido no lo necesita), `staff_grant_full_access`,
`caducar_pruebas_vencidas`, `avisar-fin-prueba`, `staff_extend_trial`, la demo compartida.

---

## Tarea 1: Función `generar_negocio_id` (extraer la lógica del slug)

Hoy la generación del slug vive incrustada dentro de `staff_grant_full_access`
(`migrations/p0-005-mes-de-prueba-al-dar-acceso.sql:41-66`). El trigger de alta necesita
exactamente la misma lógica. Copiarla sería garantizar que las dos versiones diverjan.

**Files:**
- Create: `migrations/p1-autoservicio-generar-negocio-id.sql`

- [ ] **Paso 1: Escribir la migración**

```sql
-- Autoservicio · La generacion del negocio_id deja de estar incrustada en
-- staff_grant_full_access para que el alta automatica (handle_new_user) use
-- EXACTAMENTE la misma regla. Dos copias de esta logica divergen seguro.
--
-- Reglas (identicas a las de p0-005): minusculas, espacios a '_', fuera todo lo
-- que no sea [a-z0-9_], sufijo con el codigo postal si lo hay o 5 hex si no, y
-- sufijo aleatorio extra si el candidato ya existe en otro perfil.
--
-- p_excluir_id existe para que el perfil que se esta dando de alta (o
-- actualizando) no cuente como su propia colision.
--
-- staff_grant_full_access NO se reescribe ahora para llamar a esta funcion: esta
-- en produccion y funciona, y tocarla añade riesgo sin beneficio inmediato. Si en
-- algun momento hay que cambiar la regla del slug, hay que cambiarla en LOS DOS
-- sitios (aqui y en p0-005) o los negocio_id divergiran.

create or replace function public.generar_negocio_id(
  p_nombre_negocio text,
  p_codigo_postal text default null,
  p_excluir_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(coalesce(nullif(trim(p_nombre_negocio), ''), 'salon'), '\s+', '_', 'g'));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if base = '' then base := 'salon'; end if;

  if coalesce(trim(p_codigo_postal), '') <> '' then
    candidate := base || '_' || regexp_replace(lower(p_codigo_postal), '[^a-z0-9]', '', 'g');
  else
    candidate := base || '_' || substr(md5(random()::text), 1, 5);
  end if;

  -- Nunca devolver el tenant de la demo compartida: seria dar de alta a alguien
  -- dentro del escaparate, con acceso a sus datos.
  if candidate = '' or candidate = 'demo_salon_001' then
    candidate := 'salon_' || substr(md5(random()::text), 1, 5);
  end if;

  if exists (
    select 1 from public.profiles
     where negocio_id = candidate
       and (p_excluir_id is null or id <> p_excluir_id)
  ) then
    candidate := candidate || '_' || substr(md5(random()::text), 1, 5);
  end if;

  return candidate;
end;
$$;

revoke all on function public.generar_negocio_id(text, text, uuid) from public, anon, authenticated;
```

- [ ] **Paso 2: Aplicar la migración**

Aplicar `migrations/p1-autoservicio-generar-negocio-id.sql` por la vía habitual del proyecto.
Esperado: sin errores.

- [ ] **Paso 3: Verificar el comportamiento con asserts SQL**

Ejecutar:

```sql
do $$
begin
  -- Normaliza y usa el codigo postal
  assert public.generar_negocio_id('Peluquería Ana', '35001') = 'peluqueria_ana_35001',
    'slug con CP incorrecto: ' || public.generar_negocio_id('Peluquería Ana', '35001');
  -- Sin nombre cae en el generico, no en cadena vacia
  assert public.generar_negocio_id('', null) like 'salon\_%',
    'slug sin nombre incorrecto';
  -- Nunca devuelve el tenant de la demo
  assert public.generar_negocio_id('demo salon 001', null) <> 'demo_salon_001',
    'ha devuelto el tenant de la demo';
  raise notice 'generar_negocio_id OK';
end $$;
```

Esperado: `NOTICE: generar_negocio_id OK`, sin ninguna aserción fallida.

Ojo: `regexp_replace(..., '[^a-z0-9_]', '', 'g')` **elimina** los acentos en vez de
transliterarlos, así que "Peluquería" produce `peluqueria` solo si la `í` cae. Si el assert
falla porque el resultado es `peluquera_35001`, esa es la conducta real de la función que ya
está en producción con `staff_grant_full_access`: **corrige el assert, no la función**
(cambiar la regla ahora crearía slugs distintos a los de los salones ya existentes).

- [ ] **Paso 4: Pasar los advisors de seguridad de Supabase**

Esperado: ningún aviso nuevo respecto a la línea base.

- [ ] **Paso 5: Commit**

```bash
git add migrations/p1-autoservicio-generar-negocio-id.sql
git commit -m "feat(autoservicio): funcion generar_negocio_id reutilizable"
```

---

## Tarea 2: El alta crea salón propio y arranca la prueba

Núcleo del trabajo. `handle_new_user` está en `migrations/referidos-arbol-multinivel.sql:268`;
se reproduce entero porque `create or replace` no admite parches parciales. **Lo único que
cambia respecto a la versión en producción son las columnas `negocio_id` y `plan` y las tres
columnas nuevas de suscripción.** El resto (referidos, coalesce del nombre) se copia tal cual.

**Files:**
- Create: `migrations/p1-autoservicio-alta-con-prueba.sql`

- [ ] **Paso 1: Escribir la migración**

```sql
-- Autoservicio · El alta entrega producto, no una sala de espera.
--
-- Hasta ahora toda cuenta nueva nacia en 'demo_salon_001' con plan 'free', y
-- 'free' no habilita NINGUNA funcion (lib/planes.ts). Es decir: nadie podia usar
-- Mecha sin que un humano del staff pulsase staff_grant_full_access. Eso hacia
-- imposible el autoservicio.
--
-- A partir de aqui el alta crea el salon propio y arranca la prueba de 30 dias
-- en el mismo acto. No se anade ninguna regla de acceso nueva: la cuenta esta en
-- plan 'esencial' con suscripcion_estado 'prueba', asi que TODO lo que ya gatea
-- por plan (menu lateral, withPlanGate, el 402 de agenda-asistente) funciona sin
-- cambios, y caducar_pruebas_vencidas() (p0-007) ya la devuelve a 'free' al vencer.
--
-- 'free' pasa a significar una sola cosa: prueba agotada.
--
-- Este trigger es BEFORE/AFTER INSERT sobre auth.users, no un UPDATE: el guard
-- guard_profile_identity_columns solo dispara en UPDATE (usa old.*), asi que aqui
-- NO hace falta mecha.identity_ctx.
--
-- Depende de p1-autoservicio-generar-negocio-id.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref_code text := nullif(btrim(upper(new.raw_user_meta_data->>'ref')), '');
  v_ref_id   uuid;
  v_salon    text := nullif(btrim(new.raw_user_meta_data->>'salon'), '');
  v_cp       text := nullif(btrim(new.raw_user_meta_data->>'codigo_postal'), '');
  v_negocio  text;
begin
  if v_ref_code is not null then
    select id into v_ref_id from public.profiles where codigo_referido = v_ref_code limit 1;
  end if;

  -- Salon propio desde el minuto cero. Si el alta no trae nombre (p. ej. Google
  -- OAuth), generar_negocio_id cae en 'salon_<hex>': el negocio_id es una clave
  -- interna y NO se renombra despues, aunque luego se rellene el nombre bonito.
  v_negocio := public.generar_negocio_id(v_salon, v_cp, new.id);

  insert into public.profiles (
    id, email, nombre, nombre_negocio, negocio_id, phone, role, plan,
    suscripcion_estado, trial_ends_at, referido_por, referido_en
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    v_salon,
    v_negocio,
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    'esencial',
    'prueba',
    now() + interval '30 days',
    case when v_ref_id is not null and v_ref_id <> new.id then v_ref_id else null end,
    case when v_ref_id is not null and v_ref_id <> new.id then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
```

- [ ] **Paso 2: Aplicar la migración**

Esperado: sin errores.

- [ ] **Paso 3: Verificar con un alta real de prueba**

Crear una cuenta desde `/acceso.html` en el espejo local (o llamar a la edge `signup-free`)
con un correo desechable, y comprobar:

```sql
select negocio_id, plan, suscripcion_estado,
       (trial_ends_at::date - now()::date) as dias
  from public.profiles
 where email = '<el correo de prueba>';
```

Esperado: `negocio_id` distinto de `demo_salon_001`, `plan = 'esencial'`,
`suscripcion_estado = 'prueba'`, `dias = 30`.

- [ ] **Paso 4: Verificar que los trabajadores invitados NO se llevan un salón propio**

Los empleados se dan de alta por la edge `crear-acceso-empleado`, que asigna el `negocio_id`
del salón que invita. Si esa edge crea el usuario vía `auth.admin.createUser`, este trigger
dispara **también** para ellos y les generaría un salón propio y una prueba que no les toca.

Leer `supabase/functions/crear-acceso-empleado/index.ts` y comprobar en qué orden asigna el
`negocio_id`. Si lo asigna con un UPDATE posterior al alta, hay que confirmar que ese UPDATE
va dentro de un `security definer` con `mecha.identity_ctx` (si no, el guard lo revierte y el
empleado se queda con salón propio: fallo grave y silencioso).

Verificar invitando a un empleado de prueba:

```sql
select email, role, negocio_id, plan, suscripcion_estado
  from public.profiles where email = '<empleado de prueba>';
```

Esperado: `negocio_id` = el del salón que invita, y no un salón nuevo.

Si falla: añadir en el trigger una condición que detecte el alta de empleado —
`new.raw_user_meta_data->>'negocio_id'` si la edge lo envía — y en ese caso usar ese
`negocio_id` con `plan`, `suscripcion_estado` y `trial_ends_at` heredados del owner
(vía `plan_del_negocio`) en vez de arrancar una prueba nueva.

- [ ] **Paso 5: Pasar los advisors de seguridad**

- [ ] **Paso 6: Commit**

```bash
git add migrations/p1-autoservicio-alta-con-prueba.sql
git commit -m "feat(autoservicio): el alta crea salon propio y arranca la prueba de 30 dias"
```

---

## Tarea 3: Limpiar `signup-free` de la mentira del negocio demo

La edge dice en un comentario que "todas las cuentas gratis comparten el MISMO negocio_id"
y devuelve `demo_salon_001` al cliente. Tras la tarea 2 eso es falso y además su `insert`
sobre `profiles` nunca gana (el trigger ya insertó la fila).

**Files:**
- Modify: `supabase/functions/signup-free/index.ts:45-51` y `:205-230`

- [ ] **Paso 1: Borrar la constante y su comentario**

Eliminar íntegro este bloque (líneas 45-51):

```ts
// Todas las cuentas gratis comparten el MISMO negocio_id: la demo real.
// ...
const DEMO_NEGOCIO_ID = 'demo_salon_001';
```

- [ ] **Paso 2: Sustituir el insert muerto por una lectura del perfil real**

Reemplazar el bloque `// 2) Perfil owner / plan free ...` (líneas 205-217) por:

```ts
  // 2) El perfil ya lo ha creado el trigger handle_new_user (con salon propio,
  // plan esencial y prueba de 30 dias). Aqui solo se lee para devolver el
  // negocio_id real al cliente. Un insert desde aqui no ganaria nunca: el
  // trigger inserta antes con on conflict do nothing.
  const { data: perfil, error: pErr } = await admin
    .from('profiles')
    .select('negocio_id')
    .eq('id', user.id)
    .maybeSingle();
  if (pErr) console.error('profile read failed:', pErr.message);
  const negocioId = perfil?.negocio_id ?? null;
```

- [ ] **Paso 3: Comprobar que compila**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos. Los errores propios de `supabase/functions` son de Deno y se
ignoran (regla del proyecto), pero no debe aparecer ninguno referido a `DEMO_NEGOCIO_ID`
sin definir.

- [ ] **Paso 4: Verificar que el alta sigue funcionando**

Dar de alta otra cuenta de prueba desde `/acceso.html`.
Esperado: respuesta 200 con `negocio_id` distinto de `demo_salon_001`, y entrada directa
al software.

- [ ] **Paso 5: Commit**

```bash
git add supabase/functions/signup-free/index.ts
git commit -m "refactor(autoservicio): signup-free deja de asumir el negocio de la demo"
```

---

## Tarea 4: Modo de acceso del equipo en el primer arranque

La persona debe elegir si sus empleados entran cada uno con su correo (`individual`) o
todos con uno compartido (`compartido`). La RPC `set_acceso_salon_modo(p_modo)` ya existe
(`migrations/fix-rpc-modo-acceso-y-extender-prueba.sql`) y ya la usa Ajustes; aquí solo se
adelanta al primer arranque, tras completar los datos del salón.

**Files:**
- Modify: `web/acceso.html` (panel `paneComplete` y su handler `cpBtn`, ~líneas 938-970)

- [ ] **Paso 1: Añadir el selector al panel `paneComplete`**

Insertar dentro del panel, justo antes del botón `cpBtn`:

```html
<div class="auth-field" style="margin-top:14px">
  <label class="auth-label">¿Cómo entrará tu equipo?</label>
  <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer">
    <input type="radio" name="cpModo" value="individual" checked>
    <span>Cada profesional con su propio correo <small style="display:block;color:#8a7d70">Recomendado: cada uno ve lo suyo y queda registrado quién hace qué.</small></span>
  </label>
  <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer">
    <input type="radio" name="cpModo" value="compartido">
    <span>Un solo correo para todo el salón <small style="display:block;color:#8a7d70">Más simple si trabajáis desde un único ordenador.</small></span>
  </label>
</div>
```

- [ ] **Paso 2: Guardar el modo antes de enrutar**

En el handler de `cpBtn`, dentro del `.then` de `api.updateProfile`, justo después de la
comprobación de error y antes del `if (wantsDemo())`, insertar:

```js
        // Modo de acceso del equipo. No bloquea la entrada: si falla, se puede
        // cambiar despues en Ajustes > Equipo (misma RPC).
        var modoEl = document.querySelector('input[name="cpModo"]:checked');
        var modo = modoEl ? modoEl.value : 'individual';
        if (api.client && api.client.rpc) {
          api.client.rpc('set_acceso_salon_modo', { p_modo: modo }).then(function (rm) {
            if (rm && rm.error) console.error('set_acceso_salon_modo:', rm.error.message);
          });
        }
```

- [ ] **Paso 3: Probar en el espejo local**

```bash
node scripts/serve-web.mjs
```

Dar de alta una cuenta nueva en `http://localhost:8080/acceso.html`, completar los datos
eligiendo "Un solo correo para todo el salón", y comprobar:

```sql
select negocio_id, modo from public.salon_acceso order by actualizado_en desc limit 1;
```

Esperado: una fila con el `negocio_id` de la cuenta nueva y `modo = 'compartido'`.

- [ ] **Paso 4: Commit**

```bash
git add web/acceso.html
git commit -m "feat(autoservicio): elegir el modo de acceso del equipo en el primer arranque"
```

---

## Tarea 5: Solicitud del addon de Recepcionistas IA (backend)

**Files:**
- Create: `migrations/p1-autoservicio-solicitud-addon-ia.sql`

- [ ] **Paso 1: Escribir la migración**

Reproduce entera `crear_solicitud_publica` desde `migrations/solicitudes-tipo-calculadora.sql`
añadiendo `'addon_ia'` en **los dos** sitios:

```sql
-- Autoservicio · tipo de solicitud 'addon_ia'.
--
-- Una cuenta en prueba tiene el software entero pero NO los Recepcionistas IA
-- (profiles.ia_nivel), que se contratan aparte. Este tipo recoge la peticion
-- desde dentro del producto y la deja en la bandeja de solicitudes; el aviso por
-- correo lo manda la edge notificar-solicitud, que no necesita cambios.
--
-- LOS DOS SITIOS: el tipo se valida por duplicado, en el CHECK de la tabla Y
-- dentro de la funcion. Ampliar solo uno hace que la insercion falle con 23514 y
-- el lead se pierda EN SILENCIO (el formulario dice "enviado" porque llega un 200).

-- 1) CHECK de la tabla
alter table public.solicitudes drop constraint if exists solicitudes_tipo_check;
alter table public.solicitudes
  add constraint solicitudes_tipo_check
  check (tipo = any (array[
    'demo'::text, 'reserva_llamada'::text, 'signup'::text,
    'mensaje'::text, 'quiero_software'::text, 'calculadora'::text,
    'addon_ia'::text
  ]));

-- 2) Validacion dentro de la RPC
create or replace function public.crear_solicitud_publica(
  p_tipo text,
  p_nombre text,
  p_salon text,
  p_email text,
  p_telefono text,
  p_num_profesionales text default null::text,
  p_herramienta_actual text default null::text,
  p_nota text default null::text,
  p_fecha_preferida text default null::text,
  p_hora_preferida text default null::text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ip text := public.request_ip();
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('demo', 'reserva_llamada', 'signup', 'mensaje', 'quiero_software', 'calculadora', 'addon_ia') then
    raise exception 'Tipo de solicitud invalido';
  end if;
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p_email) > 120 then
    raise exception 'El email es obligatorio';
  end if;
  if length(coalesce(p_nombre, '')) > 80 or length(coalesce(p_salon, '')) > 80
     or length(coalesce(p_telefono, '')) > 20 or length(coalesce(p_nota, '')) > 1000
     or length(coalesce(p_herramienta_actual, '')) > 80
     or length(coalesce(p_num_profesionales, '')) > 10
     or length(coalesce(p_fecha_preferida, '')) > 40 or length(coalesce(p_hora_preferida, '')) > 40
     or pg_column_size(p_meta) > 4096 then
    raise exception 'Datos demasiado largos';
  end if;

  if p_telefono is not null and btrim(p_telefono) <> ''
     and coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    raise exception 'El telefono debe contener al menos 7 digitos';
  end if;

  if v_ip <> '' and (
    select count(*) from public.solicitudes
    where ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes enviadas. Intentalo de nuevo mas tarde.';
  end if;
  if (
    select count(*) from public.solicitudes
    where lower(email) = lower(p_email) and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes para esta direccion de correo hoy.';
  end if;

  insert into public.solicitudes (
    tipo, nombre, salon, email, telefono, num_profesionales,
    herramienta_actual, nota, fecha_preferida, hora_preferida, meta, ip_origen
  )
  values (
    p_tipo, p_nombre, p_salon, p_email, p_telefono, p_num_profesionales,
    p_herramienta_actual, p_nota, p_fecha_preferida, p_hora_preferida, p_meta, v_ip
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

grant execute on function public.crear_solicitud_publica(text,text,text,text,text,text,text,text,text,text,jsonb) to anon, authenticated, service_role;
```

- [ ] **Paso 2: Aplicar la migración**

- [ ] **Paso 3: Verificar que el tipo entra de verdad (los dos sitios)**

```sql
select public.crear_solicitud_publica(
  'addon_ia', 'Prueba', 'Salon Prueba', 'prueba-addon-ia@example.com', null,
  null, null, 'Verificacion de la migracion', null, null, '{}'::jsonb
);
select tipo, email from public.solicitudes where email = 'prueba-addon-ia@example.com';
delete from public.solicitudes where email = 'prueba-addon-ia@example.com';
```

Esperado: la primera devuelve `{"ok": true, ...}`, la segunda una fila con `tipo = 'addon_ia'`.
Si sale el error `23514 check constraint`, es que el CHECK no se aplicó: exactamente el fallo
que esta migración existe para evitar.

- [ ] **Paso 4: Pasar los advisors de seguridad**

- [ ] **Paso 5: Commit**

```bash
git add migrations/p1-autoservicio-solicitud-addon-ia.sql
git commit -m "feat(autoservicio): tipo de solicitud addon_ia (CHECK y RPC)"
```

---

## Tarea 6: Botón "Quiero los Recepcionistas IA" en el producto

**Files:**
- Modify: `components/config/SeccionSuscripcion.web.tsx`

- [ ] **Paso 1: Leer el componente y localizar el bloque del addon de IA**

Antes de escribir nada, leer `components/config/SeccionSuscripcion.web.tsx` entero y
localizar dónde se muestra el `ia_nivel` actual. El botón va junto a esa información, y debe
aparecer **solo** cuando `iaNivelDe(perfil) === 'ninguna'`. Usar los helpers ya existentes de
`lib/planes.ts` (`iaNivelDe`, `IA_NIVEL_LABEL`, `IA_PRECIO_EUR`) — no reescribir precios a mano,
que están duplicados en tres sitios y se desincronizan.

- [ ] **Paso 2: Añadir el botón y su handler**

Siguiendo el estilo del componente (tokens de `lib/designTokens.ts`, sin emojis):

```tsx
  const [enviandoIa, setEnviandoIa] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  async function solicitarAddonIa() {
    setEnviandoIa(true);
    setAvisoIa(null);
    const { error } = await supabase.rpc('crear_solicitud_publica', {
      p_tipo: 'addon_ia',
      p_nombre: perfil?.nombre ?? '',
      p_salon: perfil?.nombre_negocio ?? '',
      p_email: perfil?.email ?? '',
      p_telefono: perfil?.phone ?? null,
      p_nota: 'Solicita el addon de Recepcionistas IA desde Ajustes.',
    });
    setEnviandoIa(false);
    setAvisoIa(error
      ? 'No se pudo enviar la solicitud. Inténtalo de nuevo.'
      : 'Recibido. Te contactamos para activar los Recepcionistas IA.');
  }
```

Y el control, visible solo sin addon:

```tsx
  {iaNivelDe(perfil) === 'ninguna' && (
    <View>
      <Text>Los Recepcionistas IA (WhatsApp y voz) se contratan aparte de tu plan.</Text>
      <TouchableOpacity onPress={solicitarAddonIa} disabled={enviandoIa}>
        <Text>{enviandoIa ? 'Enviando...' : 'Quiero los Recepcionistas IA'}</Text>
      </TouchableOpacity>
      {avisoIa ? <Text>{avisoIa}</Text> : null}
    </View>
  )}
```

Los estilos concretos se toman de los ya definidos en el `StyleSheet` del propio componente;
no crear una paleta nueva.

- [ ] **Paso 3: Comprobar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores en `components/config/SeccionSuscripcion.web.tsx`.

- [ ] **Paso 4: Compilar y probar en el espejo local**

```bash
npm run build:web
```

Abrir `http://localhost:8080/app`, entrar con una cuenta en prueba, ir a Ajustes →
Suscripción y pulsar el botón. Comprobar:

```sql
select tipo, email, nota from public.solicitudes where tipo = 'addon_ia' order by created_at desc limit 1;
```

Esperado: una fila con el correo de esa cuenta.

- [ ] **Paso 5: Commit**

```bash
git add components/config/SeccionSuscripcion.web.tsx
git commit -m "feat(autoservicio): solicitar el addon de Recepcionistas IA desde Ajustes"
```

---

## Tarea 7: Los textos dejan de prometer "Plan Estudio"

La prueba pasa a ser Esencial. Cuatro textos del producto siguen diciendo Estudio: es una
afirmación falsa dentro de la aplicación y se corrige aunque no fuera parte del encargo.

**Files:**
- Modify: `components/acceso/GuardaSuscripcion.tsx:96,116,187`
- Modify: `web/admin.html:1573,1599`

- [ ] **Paso 1: Corregir el banner de días restantes**

En `components/acceso/GuardaSuscripcion.tsx:187`, sustituir:

```tsx
            Prueba gratuita del <Text style={{ fontWeight: '800' }}>Plan Estudio completo</Text>: te quedan{' '}
```

por:

```tsx
            Prueba gratuita del <Text style={{ fontWeight: '800' }}>Plan Esencial completo</Text>: te quedan{' '}
```

- [ ] **Paso 2: Corregir el muro de prueba caducada**

En la misma pantalla, línea ~96, sustituir `el <Text ...>Plan Estudio completo</Text>` por
`el <Text ...>Plan Esencial completo</Text>`.

- [ ] **Paso 3: Corregir los confirms del panel de staff**

En `web/admin.html:1573`, sustituir `' días más (Plan Estudio)?'` por `' días más?'`.
En `web/admin.html:1599`, sustituir el texto del confirm por:

```js
        if (!window.confirm('Dar 1 mes gratis a "' + quien + '"?\n\nLa cuenta pasará a plan Estudio con 30 días de prueba y su propio negocio.')) return;
```

Nota: aquí el texto **sí** dice Estudio a propósito y es correcto, porque
`staff_grant_full_access` se sigue llamando con plan `full` (= Estudio) desde ese botón. Es
la vía manual para los salones que preconfiguramos, distinta de la prueba de autoservicio.
Solo hay que asegurarse de que el confirm de "+30 días" (línea 1573) no afirme un plan
concreto, porque extiende el que la cuenta ya tenga.

- [ ] **Paso 4: Revisar el KPI "free" del panel**

`web/admin.html:1087` cuenta como "free" los perfiles con `plan = 'free'` **y sin**
`trial_ends_at`. Con el nuevo modelo toda cuenta nueva tiene `trial_ends_at`, así que ese
contador queda en cero permanente y engaña. Sustituir la etiqueta y el criterio por
"Pruebas vencidas sin contratar":

```js
    var free = accounts.filter(function (p) { return planCanonico(p) === 'free' && p.suscripcion_estado === 'caducada'; }).length;
```

Y actualizar la etiqueta del KPI correspondiente para que diga `'Sin contratar'`.

- [ ] **Paso 5: Comprobar tipos y compilar**

Run: `npx tsc --noEmit && npm run build:web`
Esperado: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add components/acceso/GuardaSuscripcion.tsx web/admin.html
git commit -m "fix(autoservicio): la prueba es Esencial, no Estudio, en los textos del producto"
```

---

## Tarea 8: Verificación de extremo a extremo

Ninguna de las tareas anteriores demuestra por sí sola que el objetivo se cumple: que una
persona ajena pueda usar Mecha sin nosotros. Esto sí.

**Files:** ninguno (verificación)

- [ ] **Paso 1: Recorrido completo con una cuenta nueva**

Con `node scripts/serve-web.mjs` levantado, desde `http://localhost:8080`:

1. Registrarse desde la landing con un correo nuevo.
2. Completar los datos del salón y elegir el modo de acceso del equipo.
3. Entrar al software y crear un profesional, un servicio y una cita.
4. Cobrar esa cita en Caja.
5. Abrir el portal público de reserva del salón (`/app/r/<slug>`) y reservar como cliente.

Esperado: los cinco pasos funcionan sin que ningún miembro del staff intervenga en ningún
momento. Anotar cualquier pantalla que aparezca vacía o rota por falta de datos iniciales
(catálogo, horarios): si algo obliga a intervención manual, es un hallazgo que hay que
reportar antes de dar el trabajo por terminado.

- [ ] **Paso 2: Comprobar el contador en las dos superficies**

- En el software: el banner superior dice "te quedan 30 días" y "Plan Esencial".
- En `/admin.html`: la cuenta aparece con badge "prueba activa" y 30 días restantes.

- [ ] **Paso 3: Comprobar la caducidad sin esperar 30 días**

Adelantar la fecha de fin y ejecutar el cron a mano:

```sql
-- Adelantar el fin de prueba. El guard congela trial_ends_at en UPDATE:
-- sin identity_ctx este update se revierte EN SILENCIO, sin error.
select set_config('mecha.identity_ctx', '1', true);
update public.profiles set trial_ends_at = now() - interval '1 day'
 where email = '<el correo de prueba>';

select public.caducar_pruebas_vencidas();

select plan, suscripcion_estado from public.profiles where email = '<el correo de prueba>';
```

Esperado: `plan = 'free'`, `suscripcion_estado = 'caducada'`.

Recargar el software con esa cuenta: debe aparecer el muro de contratación a pantalla
completa, y los datos del salón deben seguir existiendo en la base de datos (comprobar que
las citas creadas en el paso 1 siguen ahí).

- [ ] **Paso 4: Comprobar que la demo compartida sigue intacta**

Abrir `http://localhost:8080/demo.html?share=1`.
Esperado: la demo carga con los datos de `demo_salon_001` y no se ve afectada por nada de
lo anterior. Comprobar también que la sesión personal del visitante no se pierde al salir
de la demo.

- [ ] **Paso 5: Limpiar las cuentas de prueba**

Borrar desde `/admin.html` (o con `staff_delete_account_by_email`) todas las cuentas creadas
durante la verificación. **Confirmar antes de borrar** que ninguna es una cuenta real.

- [ ] **Paso 6: Actualizar el contexto del proyecto**

Añadir a `CLAUDE.md`, en las decisiones de diseño vigentes, que la regla "las cuentas nuevas
nacen en `demo_salon_001` con plan free" queda derogada y sustituida por el alta con salón
propio y prueba de 30 días, y que `free` significa ahora "prueba agotada".

```bash
git add CLAUDE.md
git commit -m "docs: el alta ya no nace en el tenant de la demo"
```

---

## Riesgo asumido (decisión de producto, no un fallo)

Con el reloj arrancando en el registro, quien se apunte solo para curiosear la demo consume
días de prueba sin usar el software. Mitigación: los avisos de fin de prueba
(`avisar-fin-prueba`) y `staff_extend_trial`, que regala 30 días más con un clic desde
`/admin.html`.
