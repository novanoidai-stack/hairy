-- Sesion de caja diaria: apertura, arqueo ciego e Informe Z.
--
-- Lo que habia: se podia cobrar y sacar un resumen de lo cobrado, pero no
-- existia el acto de "abrir la caja por la mañana con 150 EUR de cambio" ni el
-- de "contar lo que hay al cerrar y ver si cuadra". Sin eso no hay control:
-- un descuadre de 20 EUR al dia son 400 al mes y nadie se entera.
--
-- ARQUEO CIEGO: quien cierra teclea lo que ha CONTADO sin ver antes lo que el
-- sistema espera. Por eso el teorico no se puede consultar mientras la sesion
-- esta abierta: lo calcula `cerrar_caja` en el mismo momento del cierre y lo
-- devuelve ya con el descuadre. Si se pudiera mirar antes, el arqueo deja de
-- ser ciego y no sirve para nada.
--
-- INFORME Z: el numero es secuencial por salon y ejercicio, y se asigna AL
-- CERRAR (un Z es el cierre, no la apertura). Una sesion cerrada no se puede
-- tocar: hay trigger que lo impide.

-- ─────────────── 1. La sesion ───────────────

create table if not exists public.sesiones_caja (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Numero de Informe Z: null mientras esta abierta.
  numero_z integer,
  ejercicio integer not null default extract(year from now())::int,

  abierta_at timestamptz not null default now(),
  cerrada_at timestamptz,

  -- Cambio con el que se empieza el dia.
  fondo_inicial_cents integer not null default 0 check (fondo_inicial_cents >= 0),

  -- Lo que la persona ha contado fisicamente al cerrar.
  contado_efectivo_cents integer,
  contado_datafono_cents integer,

  -- Lo que el sistema esperaba, congelado en el cierre.
  teorico_efectivo_cents integer,
  teorico_datafono_cents integer,
  teorico_online_cents integer,
  teorico_propinas_cents integer,

  descuadre_cents integer,

  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  abierta_por uuid,
  cerrada_por uuid,
  notas text,

  created_at timestamptz not null default now()
);

-- Un salon no puede tener dos cajas abiertas a la vez: si no, los cobros no
-- saben a cual pertenecen.
create unique index if not exists idx_sesiones_caja_una_abierta
  on public.sesiones_caja (negocio_id) where estado = 'abierta';

-- El Z no se repite dentro del mismo ejercicio.
create unique index if not exists idx_sesiones_caja_numero_z
  on public.sesiones_caja (negocio_id, ejercicio, numero_z) where numero_z is not null;

create index if not exists idx_sesiones_caja_negocio_fecha
  on public.sesiones_caja (negocio_id, abierta_at desc);

alter table public.sesiones_caja enable row level security;

-- Solo gestion: la caja del salon no es asunto de cada profesional (misma linea
-- que la politica de cobros, que ya limita a lo suyo).
drop policy if exists "sesiones_caja_select_gestor" on public.sesiones_caja;
create policy "sesiones_caja_select_gestor" on public.sesiones_caja
  for select using (
    negocio_id = (select my_negocio_id_text())
    and exists (
      select 1 from profiles p
      where p.id = (select auth.uid()) and p.role in ('owner', 'admin', 'recepcion')
    )
  );

-- No hay politica de INSERT, UPDATE ni DELETE, y eso es deliberado: con RLS
-- activada, lo que no tiene politica esta prohibido. Abrir y cerrar pasan por
-- las funciones, que validan y calculan; escribiendo a mano se podria "cerrar"
-- poniendo el teorico igual al contado y el descuadre desapareceria.
--
-- (No se pone una politica RESTRICTIVE de tipo ALL con using(false): las
-- restrictivas se combinan con AND, asi que esa tumbaria tambien el SELECT de
-- arriba y la pantalla se quedaria sin datos.)

-- ─────────────── 2. A que sesion pertenece cada cobro ───────────────

alter table public.cobros
  add column if not exists sesion_caja_id uuid references public.sesiones_caja(id);

create index if not exists idx_cobros_sesion on public.cobros (sesion_caja_id);

-- Se asigna sola al insertar. Asi no hay que tocar ni una linea del flujo de
-- cobro, y el Z sale exacto en vez de "lo que cayo entre estas dos horas"
-- (que se equivoca en cuanto alguien abre la caja tarde).
create or replace function public.cobros_asignar_sesion_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.sesion_caja_id is null then
    select id into new.sesion_caja_id
    from sesiones_caja
    where negocio_id = new.negocio_id and estado = 'abierta'
    limit 1;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_cobros_asignar_sesion_caja on public.cobros;
create trigger trg_cobros_asignar_sesion_caja
  before insert on public.cobros
  for each row execute function public.cobros_asignar_sesion_caja();

-- ─────────────── 3. Una sesion cerrada no se toca ───────────────

create or replace function public.sesiones_caja_inmutable()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'cerrada' then
      raise exception 'Un cierre de caja no se borra. Si hay un error, se anota en las notas de la siguiente sesion.';
    end if;
    return old;
  end if;

  if old.estado = 'cerrada' then
    raise exception 'La caja del % ya esta cerrada (Z %). No se puede modificar.',
      to_char(old.cerrada_at, 'DD/MM/YYYY'), old.numero_z;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_sesiones_caja_inmutable on public.sesiones_caja;
create trigger trg_sesiones_caja_inmutable
  before update or delete on public.sesiones_caja
  for each row execute function public.sesiones_caja_inmutable();

-- ─────────────── 4. Abrir ───────────────

create or replace function public.abrir_caja(p_fondo_inicial_cents integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
  v_rol text;
  v_id uuid;
begin
  select p.negocio_id, p.role into v_negocio, v_rol
  from profiles p where p.id = auth.uid();

  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;
  if v_rol not in ('owner', 'admin', 'recepcion') then
    return jsonb_build_object('ok', false, 'error', 'No tienes permiso para abrir la caja');
  end if;
  if coalesce(p_fondo_inicial_cents, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'El cambio inicial no puede ser negativo');
  end if;

  if exists (select 1 from sesiones_caja where negocio_id = v_negocio and estado = 'abierta') then
    return jsonb_build_object('ok', false, 'error', 'Ya hay una caja abierta');
  end if;

  insert into sesiones_caja (negocio_id, fondo_inicial_cents, abierta_por)
  values (v_negocio, coalesce(p_fondo_inicial_cents, 0), auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'sesion_id', v_id);
end;
$fn$;

-- ─────────────── 5. Que caja hay abierta ───────────────
--
-- A proposito NO devuelve el teorico: eso rompe el arqueo ciego. Solo dice
-- desde cuando esta abierta, con cuanto cambio y cuantos cobros lleva.
create or replace function public.caja_sesion_abierta()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
  v_sesion sesiones_caja%rowtype;
  v_cobros integer;
begin
  v_negocio := (select my_negocio_id_text());
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;

  select * into v_sesion from sesiones_caja
  where negocio_id = v_negocio and estado = 'abierta' limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'abierta', false);
  end if;

  select count(*) into v_cobros from cobros
  where sesion_caja_id = v_sesion.id and estado = 'completado';

  return jsonb_build_object(
    'ok', true,
    'abierta', true,
    'sesion_id', v_sesion.id,
    'abierta_at', v_sesion.abierta_at,
    'fondo_inicial_cents', v_sesion.fondo_inicial_cents,
    'cobros', v_cobros
  );
end;
$fn$;

-- ─────────────── 6. Cerrar con arqueo ciego ───────────────

create or replace function public.cerrar_caja(
  p_contado_efectivo_cents integer,
  p_contado_datafono_cents integer default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
  v_rol text;
  v_sesion sesiones_caja%rowtype;
  v_efectivo integer;
  v_datafono integer;
  v_online integer;
  v_propinas integer;
  v_teorico_caja integer;
  v_descuadre integer;
  v_z integer;
begin
  select p.negocio_id, p.role into v_negocio, v_rol
  from profiles p where p.id = auth.uid();

  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;
  if v_rol not in ('owner', 'admin', 'recepcion') then
    return jsonb_build_object('ok', false, 'error', 'No tienes permiso para cerrar la caja');
  end if;
  if p_contado_efectivo_cents is null or p_contado_efectivo_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'Cuenta el efectivo antes de cerrar');
  end if;

  select * into v_sesion from sesiones_caja
  where negocio_id = v_negocio and estado = 'abierta' limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No hay ninguna caja abierta');
  end if;

  -- El teorico se calcula AQUI, con el contado ya tecleado. Ese es el arqueo
  -- ciego: no hay forma de mirarlo antes.
  select
    coalesce(sum(c.efectivo_cents), 0),
    coalesce(sum(c.datafono_cents), 0),
    coalesce(sum(c.online_cents), 0),
    coalesce(sum(c.propina_cents), 0)
  into v_efectivo, v_datafono, v_online, v_propinas
  from cobros c
  where c.sesion_caja_id = v_sesion.id and c.estado = 'completado';

  -- En el cajon tiene que haber el cambio con el que se empezo mas lo cobrado
  -- en efectivo.
  v_teorico_caja := v_sesion.fondo_inicial_cents + v_efectivo;
  v_descuadre := p_contado_efectivo_cents - v_teorico_caja;

  -- El Z se asigna al cerrar y no deja huecos dentro del ejercicio.
  select coalesce(max(numero_z), 0) + 1 into v_z
  from sesiones_caja
  where negocio_id = v_negocio and ejercicio = v_sesion.ejercicio;

  update sesiones_caja set
    estado = 'cerrada',
    cerrada_at = now(),
    cerrada_por = auth.uid(),
    numero_z = v_z,
    contado_efectivo_cents = p_contado_efectivo_cents,
    contado_datafono_cents = p_contado_datafono_cents,
    teorico_efectivo_cents = v_teorico_caja,
    teorico_datafono_cents = v_datafono,
    teorico_online_cents = v_online,
    teorico_propinas_cents = v_propinas,
    descuadre_cents = v_descuadre,
    notas = p_notas
  where id = v_sesion.id;

  return jsonb_build_object(
    'ok', true,
    'sesion_id', v_sesion.id,
    'numero_z', v_z,
    'teorico_efectivo_cents', v_teorico_caja,
    'contado_efectivo_cents', p_contado_efectivo_cents,
    'descuadre_cents', v_descuadre,
    'teorico_datafono_cents', v_datafono,
    'teorico_online_cents', v_online,
    'teorico_propinas_cents', v_propinas,
    'fondo_inicial_cents', v_sesion.fondo_inicial_cents
  );
end;
$fn$;

-- ─────────────── 7. El Informe Z ───────────────

create or replace function public.informe_z(p_sesion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
  v_rol text;
  v_sesion sesiones_caja%rowtype;
  v_lineas jsonb;
  v_por_profesional jsonb;
begin
  select p.negocio_id, p.role into v_negocio, v_rol
  from profiles p where p.id = auth.uid();

  if v_negocio is null or v_rol not in ('owner', 'admin', 'recepcion') then
    return jsonb_build_object('ok', false, 'error', 'No tienes permiso para ver el cierre');
  end if;

  select * into v_sesion from sesiones_caja
  where id = p_sesion_id and negocio_id = v_negocio;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese cierre no es de este salon');
  end if;

  -- Desglose de bases e IVA. Se saca de los tickets ya emitidos si los hay; si
  -- no, del total con el IVA general. No se inventa: se dice de donde sale.
  select jsonb_build_object(
    'cobros', count(*),
    'total_cents', coalesce(sum(c.total_cents), 0),
    'efectivo_cents', coalesce(sum(c.efectivo_cents), 0),
    'datafono_cents', coalesce(sum(c.datafono_cents), 0),
    'online_cents', coalesce(sum(c.online_cents), 0),
    'propinas_cents', coalesce(sum(c.propina_cents), 0),
    'descuentos_cents', coalesce(sum(c.descuento_cents), 0)
  ) into v_lineas
  from cobros c
  where c.sesion_caja_id = v_sesion.id and c.estado = 'completado';

  select coalesce(jsonb_agg(jsonb_build_object(
    'profesional_id', t.profesional_id,
    'nombre', t.nombre,
    'cobros', t.n,
    'total_cents', t.total
  ) order by t.total desc), '[]'::jsonb) into v_por_profesional
  from (
    select c.profesional_id, pr.nombre, count(*) as n, sum(c.total_cents) as total
    from cobros c
    left join profesionales pr on pr.id = c.profesional_id
    where c.sesion_caja_id = v_sesion.id and c.estado = 'completado'
    group by c.profesional_id, pr.nombre
  ) t;

  return jsonb_build_object(
    'ok', true,
    'numero_z', v_sesion.numero_z,
    'ejercicio', v_sesion.ejercicio,
    'estado', v_sesion.estado,
    'abierta_at', v_sesion.abierta_at,
    'cerrada_at', v_sesion.cerrada_at,
    'fondo_inicial_cents', v_sesion.fondo_inicial_cents,
    'contado_efectivo_cents', v_sesion.contado_efectivo_cents,
    'teorico_efectivo_cents', v_sesion.teorico_efectivo_cents,
    'descuadre_cents', v_sesion.descuadre_cents,
    'notas', v_sesion.notas,
    'totales', v_lineas,
    'por_profesional', v_por_profesional
  );
end;
$fn$;

-- ─────────────── 8. Permisos ───────────────

revoke all on function public.abrir_caja(integer) from public, anon;
revoke all on function public.cerrar_caja(integer, integer, text) from public, anon;
revoke all on function public.caja_sesion_abierta() from public, anon;
revoke all on function public.informe_z(uuid) from public, anon;

grant execute on function public.abrir_caja(integer) to authenticated, service_role;
grant execute on function public.cerrar_caja(integer, integer, text) to authenticated, service_role;
grant execute on function public.caja_sesion_abierta() to authenticated, service_role;
grant execute on function public.informe_z(uuid) to authenticated, service_role;
