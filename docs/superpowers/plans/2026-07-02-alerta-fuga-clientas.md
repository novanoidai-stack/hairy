# Alerta de fuga de clientas — Implementation Plan

> **For agentic workers:** ejecutar inline en la misma sesión (superpowers:executing-plans) — proyecto
> sin test runner (no jest/pytest configurado); verificación real = SQL con datos sintéticos +
> `tsc --noEmit` + `npm run build:web`, igual que el resto de specs de este repo.

**Goal:** detectar clientas con hueco anómalo respecto a su frecuencia habitual, mostrarlas en Clientes
y en Avisos (rol propietario), y dejar preparado (OFF) el motor/outbox para que Alexandro conecte el
envío automático por WhatsApp más adelante.

**Architecture:** motor SQL `security definer` que recalcula agregados en `clientes` + genera outbox
`fuga_clientas_avisos`; RPC de lectura para el frontend; dos superficies UI que reutilizan la misma RPC.

**Tech Stack:** PostgreSQL/Supabase (RPCs, RLS), React Native Web (Expo Router), TypeScript.

## Global Constraints

- Multi-tenant por `negocio_id` en todo (RLS + gate manual en RPCs `security definer`).
- Nunca políticas `USING (true)` de escritura; funciones con `search_path` fijo.
- Código en inglés, comentarios en español, sin `any` en TypeScript.
- Nada de envío real de WhatsApp/n8n en este plan — solo dejar el outbox listo (toggle OFF).
- Spec de referencia: `docs/superpowers/specs/2026-07-02-alerta-fuga-clientas-design.md`.

---

### Task 1: Migración — agregados, outbox y motor

**Files:**
- Create: `migrations/alerta-fuga-clientas.sql`

**Interfaces:**
- Produces: función `public.procesar_alertas_fuga()` (`service_role` only, sin args), RPC
  `public.clientes_en_riesgo_fuga()` (`authenticated`, sin args, devuelve `setof` fila con
  `cliente_id, nombre, dias_desde_ultima_visita, frecuencia_dias, nivel_orden, recompensa_sugerida_id,
  recompensa_nombre`), tabla `public.fuga_clientas_avisos`.
- Consumes: tablas existentes `clientes` (columnas `total_visitas`, `ultima_visita`, `frecuencia_dias`,
  `bloqueado`, `negocio_id`), `citas` (`cliente_id`, `estado`, `inicio`), `recompensas`
  (`umbral_visitas`, `activo`, `negocio_id`), `niveles_fidelizacion`, `negocio_config.config` (jsonb).

- [ ] **Paso 1: Escribir la migración completa**

```sql
-- =====================================================================
-- Mecha · Alerta de fuga de clientas
-- =====================================================================
-- Rellena las columnas ya existentes clientes.total_visitas/ultima_visita/
-- frecuencia_dias (hoy muertas: nadie las escribe) y detecta clientas en
-- riesgo de fuga. Motor cron-pull (mismo patron que lista_espera_matching.sql),
-- OFF por defecto via negocio_config.config.fugaClientasActivo.
-- =====================================================================

create table if not exists public.fuga_clientas_avisos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  dias_desde_ultima_visita int not null,
  frecuencia_dias int not null,
  recompensa_sugerida_id uuid references public.recompensas(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  created_at timestamptz not null default now(),
  enviado_at timestamptz
);

create index if not exists idx_fuga_clientas_avisos_negocio_estado
  on public.fuga_clientas_avisos(negocio_id, estado);

alter table public.fuga_clientas_avisos enable row level security;

create policy fuga_avisos_select_own_negocio on public.fuga_clientas_avisos
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- Sin policy de INSERT/UPDATE/DELETE para authenticated/anon: solo la
-- funcion service_role (motor) y el service_role del workflow n8n tocan esta tabla.

-- ---------------------------------------------------------------------
-- Motor: recalcula agregados + detecta riesgo + gestiona outbox
-- ---------------------------------------------------------------------
create or replace function public.procesar_alertas_fuga()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_procesados int := 0;
  v_avisos_creados int := 0;
  v_avisos_descartados int := 0;
begin
  -- A. Recalcular agregados para clientes con >=3 citas completadas
  with gaps as (
    select
      c.cliente_id,
      c.inicio,
      c.inicio - lag(c.inicio) over (partition by c.cliente_id order by c.inicio) as gap,
      row_number() over (partition by c.cliente_id order by c.inicio desc) as rn_desc
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
  ),
  ultimas_6 as (
    select cliente_id, gap
    from gaps
    where gap is not null and rn_desc <= 6
  ),
  agregados as (
    select
      c.cliente_id,
      count(*) as total_visitas,
      max(c.inicio) as ultima_visita,
      (select round(avg(extract(epoch from u6.gap) / 86400))::int
         from ultimas_6 u6 where u6.cliente_id = c.cliente_id) as frecuencia_dias
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
    group by c.cliente_id
    having count(*) >= 3
  )
  update public.clientes cl
  set total_visitas = a.total_visitas,
      ultima_visita = a.ultima_visita::date,
      frecuencia_dias = a.frecuencia_dias
  from agregados a
  where cl.id = a.cliente_id
    and (cl.total_visitas is distinct from a.total_visitas
      or cl.ultima_visita is distinct from a.ultima_visita::date
      or cl.frecuencia_dias is distinct from a.frecuencia_dias);
  get diagnostics v_procesados = row_count;

  -- B + C. Detectar riesgo y gestionar outbox, solo negocios con el toggle activo
  with en_riesgo as (
    select
      cl.id as cliente_id,
      cl.negocio_id,
      (current_date - cl.ultima_visita) as dias_desde_ultima_visita,
      cl.frecuencia_dias,
      cl.total_visitas
    from public.clientes cl
    join public.negocio_config nc on nc.negocio_id = cl.negocio_id
    where coalesce((nc.config->>'fugaClientasActivo')::boolean, false) = true
      and cl.bloqueado = false
      and cl.frecuencia_dias is not null
      and cl.ultima_visita is not null
      and (current_date - cl.ultima_visita) > (cl.frecuencia_dias * 1.4)
      and not exists (
        select 1 from public.citas fc
        where fc.cliente_id = cl.id
          and fc.estado <> 'cancelada'
          and fc.inicio > now()
      )
  ),
  nuevos as (
    select er.*
    from en_riesgo er
    where not exists (
      select 1 from public.fuga_clientas_avisos fa
      where fa.cliente_id = er.cliente_id and fa.estado = 'pendiente'
    )
  ),
  insertados as (
    insert into public.fuga_clientas_avisos
      (negocio_id, cliente_id, dias_desde_ultima_visita, frecuencia_dias, recompensa_sugerida_id)
    select
      n.negocio_id, n.cliente_id, n.dias_desde_ultima_visita, n.frecuencia_dias,
      (
        select r.id from public.recompensas r
        where r.negocio_id = n.negocio_id and r.activo = true
          and r.umbral_visitas <= n.total_visitas
        order by r.umbral_visitas desc
        limit 1
      )
    from nuevos n
    returning 1
  )
  select count(*) into v_avisos_creados from insertados;

  -- Descartar avisos pendientes de clientas que ya dejaron de estar en riesgo
  with descartados as (
    update public.fuga_clientas_avisos fa
    set estado = 'descartado'
    where fa.estado = 'pendiente'
      and not exists (select 1 from en_riesgo er where er.cliente_id = fa.cliente_id)
    returning 1
  )
  select count(*) into v_avisos_descartados from descartados;

  return jsonb_build_object(
    'clientes_actualizados', v_procesados,
    'avisos_creados', v_avisos_creados,
    'avisos_descartados', v_avisos_descartados
  );
end;
$$;

revoke all on function public.procesar_alertas_fuga() from public, anon, authenticated;
grant execute on function public.procesar_alertas_fuga() to service_role;

-- ---------------------------------------------------------------------
-- RPC de lectura para el frontend (Clientes + Avisos)
-- ---------------------------------------------------------------------
create or replace function public.clientes_en_riesgo_fuga()
returns table(
  cliente_id uuid,
  nombre text,
  dias_desde_ultima_visita int,
  frecuencia_dias int,
  nivel_orden smallint,
  recompensa_sugerida_id uuid,
  recompensa_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cl.id,
    cl.nombre,
    (current_date - cl.ultima_visita)::int,
    cl.frecuencia_dias,
    coalesce(nf.orden, 0),
    fa.recompensa_sugerida_id,
    r.nombre
  from public.clientes cl
  join public.profiles p on p.negocio_id = cl.negocio_id
  left join public.fuga_clientas_avisos fa
    on fa.cliente_id = cl.id and fa.estado = 'pendiente'
  left join public.recompensas r on r.id = fa.recompensa_sugerida_id
  left join public.niveles_fidelizacion nf on false -- nivel real se resuelve en Task 3 via obtener_nivel_cliente; aqui solo orden por defecto
  where p.id = auth.uid()
    and cl.bloqueado = false
    and cl.frecuencia_dias is not null
    and cl.ultima_visita is not null
    and (current_date - cl.ultima_visita) > (cl.frecuencia_dias * 1.4)
    and not exists (
      select 1 from public.citas fc
      where fc.cliente_id = cl.id and fc.estado <> 'cancelada' and fc.inicio > now()
    )
  order by dias_desde_ultima_visita desc;
$$;

revoke all on function public.clientes_en_riesgo_fuga() from public, anon;
grant execute on function public.clientes_en_riesgo_fuga() to authenticated;

-- Default del toggle (no hace falta touch de config existente: coalesce ya cubre ausencia de la clave)
```

- [ ] **Paso 2: Revisar el join muerto de `niveles_fidelizacion`**

El `left join ... on false` de arriba es un placeholder que hay que resolver antes de aplicar: como
`niveles_fidelizacion` no tiene FK directa por umbral sin resolver el nivel real (misma lógica que
`obtener_nivel_cliente`), en vez de duplicar esa lógica en SQL, quitar la columna `nivel_orden` de la
función y ordenar solo por `dias_desde_ultima_visita desc` (ya prioriza a quien más tiempo lleva sin
venir, que correlaciona con el criterio de "más urgente"). El frontend (Task 3) puede pedir el nivel de
cada cliente con el RPC `obtener_nivel_cliente` que ya existe, fila a fila, si quiere mostrarlo — no
hace falta resolverlo en esta RPC. Editar el `create or replace function public.clientes_en_riesgo_fuga`
de arriba para quitar `nivel_orden` de columnas devueltas, el `left join niveles_fidelizacion` y el
`coalesce(nf.orden, 0)`, y quitar `nivel_orden` del `order by` si se había añadido.

- [ ] **Paso 3: Aplicar la migración a Supabase**

Usar `mcp__supabase__apply_migration` con `project_id=vtrggiogjrhqtwbhbgia`, `name=alerta_fuga_clientas`,
el SQL corregido del paso 1-2.

- [ ] **Paso 4: Verificar con datos sintéticos**

```sql
-- Activar el toggle en un negocio de prueba (o el propio negocio_id de Carlos)
update negocio_config set config = config || '{"fugaClientasActivo": true}'::jsonb
where negocio_id = '<negocio_id_de_prueba>';

select public.procesar_alertas_fuga();
-- Esperado: jsonb con clientes_actualizados >= 0 (segun datos reales existentes)

select * from public.fuga_clientas_avisos limit 5;
```

Expected: la función corre sin error; si hay clientes reales con >=3 citas completadas y hueco grande,
aparecen en `fuga_clientas_avisos`. Revertir el toggle a `false` tras la prueba si el negocio de prueba
no debe quedar con el motor activo.

- [ ] **Paso 5: Advisors de seguridad**

Ejecutar `mcp__supabase__get_advisors` (`type=security`) y confirmar 0 fallos nuevos respecto a antes de
la migración.

- [ ] **Paso 6: Commit**

```bash
git add migrations/alerta-fuga-clientas.sql
git commit -m "feat(clientes): motor de deteccion de fuga + outbox para WhatsApp futuro"
```

---

### Task 2: Filtro "En riesgo" en Clientes

**Files:**
- Modify: `app/(tabs)/clientes.web.tsx`

**Interfaces:**
- Consumes: RPC `clientes_en_riesgo_fuga()` de Task 1 → `{cliente_id, nombre, dias_desde_ultima_visita,
  frecuencia_dias, recompensa_sugerida_id, recompensa_nombre}[]`.
- Produces: estado local `clientesEnRiesgo` reutilizable por Task 3 (contador para la tarjeta de Avisos
  se calcula con `.length`, no hace falta exportar nada — la tarjeta de Avisos hace su propia llamada
  ligera a la misma RPC).

- [ ] **Paso 1: Localizar el patrón de filtros/pestañas existente**

Leer `app/(tabs)/clientes.web.tsx` alrededor de donde se filtra por etiquetas/nivel hoy, para insertar
la pestaña "En riesgo" siguiendo el mismo componente de filtro ya usado (no inventar un componente de
filtro nuevo).

- [ ] **Paso 2: Añadir el fetch y el filtro**

Añadir `useEffect` que llama `supabase.rpc('clientes_en_riesgo_fuga')` al montar la pantalla (igual
patrón que otras pantallas de este archivo), guardar en estado, y añadir una pestaña/chip "En riesgo (N)"
que, al activarse, filtra la lista de clientes ya renderizada a solo los `cliente_id` presentes en
`clientesEnRiesgo`, mostrando además `dias_desde_ultima_visita` y `recompensa_nombre` (si existe) en la
fila/card de cada cliente en ese modo.

- [ ] **Paso 3: Verificar en el navegador**

Con el dev server local (`npm run build:web` + `node scripts/serve-web.mjs`), entrar a `/app` con una
cuenta que tenga el toggle activo y datos de prueba del Task 1, abrir Clientes, activar el filtro "En
riesgo" y confirmar que aparecen las clientas esperadas con sus días de retraso.

- [ ] **Paso 4: Commit**

```bash
git add "app/(tabs)/clientes.web.tsx"
git commit -m "feat(clientes): filtro de clientas en riesgo de fuga"
```

---

### Task 3: Tarjeta en Avisos (rol propietario)

**Files:**
- Create: `components/fuga-clientas/FugaClientasCard.web.tsx`
- Modify: `components/agenda/AgendaCalendar.web.tsx`

**Interfaces:**
- Consumes: RPC `clientes_en_riesgo_fuga()` (mismo que Task 2, llamada independiente — cada superficie
  hace su propio fetch ligero, sin estado global compartido, YAGNI hasta que haga falta).
- Produces: componente `FugaClientasCard({ count, onOpen }: { count: number; onOpen: () => void })`
  exportado, montado condicionalmente solo si `rol === 'propietario' || rol === 'direccion'` (mismo
  gate que ya usa `OnboardingCard` en el mismo archivo — copiar el patrón exacto de gating de rol).

- [ ] **Paso 1: Leer cómo se monta `OnboardingCard` hoy**

Abrir `components/agenda/AgendaCalendar.web.tsx`, localizar el bloque que monta `OnboardingCard` (import,
gate de rol, dónde vive dentro del panel de Avisos) para replicar exactamente esa estructura.

- [ ] **Paso 2: Crear `FugaClientasCard.web.tsx`**

Componente simple: si `count === 0` no renderiza nada; si `count > 0` muestra "N clientas en riesgo de
fuga" con un botón/enlace que llama `onOpen` (navega a `/app/clientes?filtro=riesgo` o equivalente ruta
ya usada por Task 2 para abrir directamente el filtro).

- [ ] **Paso 3: Montarlo en `AgendaCalendar.web.tsx`**

Añadir el fetch del count (llamada a `clientes_en_riesgo_fuga()`, `.length` del resultado) y renderizar
`<FugaClientasCard count={count} onOpen={...} />` junto a `OnboardingCard`, con el mismo gate de rol.

- [ ] **Paso 4: Verificar en el navegador**

Con datos de prueba del Task 1, confirmar que la tarjeta aparece en Avisos solo para el rol propietario,
con el contador correcto, y que el enlace abre Clientes con el filtro activo.

- [ ] **Paso 5: Commit**

```bash
git add components/fuga-clientas/FugaClientasCard.web.tsx components/agenda/AgendaCalendar.web.tsx
git commit -m "feat(agenda): tarjeta de avisos para clientas en riesgo de fuga"
```

---

### Task 4: Verificación final y push

- [ ] **Paso 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (ignorar preexistentes de `supabase/functions`, son Deno).

- [ ] **Paso 2: Build web**

Run: `npm run build:web`
Expected: build limpio.

- [ ] **Paso 3: Actualizar la adenda del MEGA_INFORME y la memoria del backlog**

Añadir entrada "Alerta de fuga de clientas — HECHO" a `informes/MEGA_INFORME_MECHA.md` (mismo patrón de
adenda fechada) y actualizar `backlog-ideas-emergentes-jul1` en memoria marcando este ítem como hecho.

- [ ] **Paso 4: Push**

```bash
git push origin master
```
