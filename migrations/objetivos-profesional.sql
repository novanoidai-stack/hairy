-- =====================================================================
-- Mecha · Objetivos / bonus gamificados por profesional
-- =====================================================================
-- El gestor fija un objetivo mensual por profesional (dinero generado,
-- servicios, horas o % de reposo aprovechado) con un bonus opcional. El
-- profesional ve su progreso en "Mi jornada". Se apoya en las mismas metricas
-- que equipo_jornada_ranking / mi_jornada_resumen (mismo calculo, mismo gate
-- de visibilidad de dinero).
-- Diseño: backlog de ideas emergentes (informes/MEGA_INFORME_MECHA.md).
-- =====================================================================

create table if not exists public.objetivos_profesional (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  metrica text not null check (metrica in ('ingresos','servicios','horas','productivo')),
  objetivo_valor numeric not null check (objetivo_valor > 0),
  bonus_cents int check (bonus_cents is null or bonus_cents >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profesional_id, metrica)
);

create index if not exists idx_objetivos_profesional_negocio
  on public.objetivos_profesional(negocio_id);

alter table public.objetivos_profesional enable row level security;

-- Lectura: cualquier miembro del negocio puede leer los objetivos de su negocio
-- (el profesional ve el suyo; el gestor los ve todos). Escritura solo por RPC.
drop policy if exists objetivos_select_own_negocio on public.objetivos_profesional;
create policy objetivos_select_own_negocio on public.objetivos_profesional
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------
-- Guardar (upsert) un objetivo — solo gestores (owner/admin)
-- ---------------------------------------------------------------------
create or replace function public.guardar_objetivo_profesional(
  p_profesional_id uuid,
  p_metrica text,
  p_objetivo_valor numeric,
  p_bonus_cents int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_negocio is null then raise exception 'sin_perfil'; end if;
  if v_role not in ('owner','admin') then raise exception 'solo_gestor'; end if;
  if p_metrica not in ('ingresos','servicios','horas','productivo') then raise exception 'metrica_invalida'; end if;
  if p_objetivo_valor is null or p_objetivo_valor <= 0 then raise exception 'valor_invalido'; end if;

  -- El profesional debe ser de este negocio
  if not exists (select 1 from profesionales where id = p_profesional_id and negocio_id = v_negocio) then
    raise exception 'profesional_no_encontrado';
  end if;

  insert into objetivos_profesional (negocio_id, profesional_id, metrica, objetivo_valor, bonus_cents, activo, updated_at)
  values (v_negocio, p_profesional_id, p_metrica, p_objetivo_valor, p_bonus_cents, true, now())
  on conflict (profesional_id, metrica) do update
    set objetivo_valor = excluded.objetivo_valor,
        bonus_cents = excluded.bonus_cents,
        activo = true,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.guardar_objetivo_profesional(uuid,text,numeric,int) from public, anon;
grant execute on function public.guardar_objetivo_profesional(uuid,text,numeric,int) to authenticated;

-- ---------------------------------------------------------------------
-- Eliminar un objetivo — solo gestores
-- ---------------------------------------------------------------------
create or replace function public.eliminar_objetivo_profesional(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_role not in ('owner','admin') then raise exception 'solo_gestor'; end if;
  delete from objetivos_profesional where id = p_id and negocio_id = v_negocio;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.eliminar_objetivo_profesional(uuid) from public, anon;
grant execute on function public.eliminar_objetivo_profesional(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Objetivos del negocio con progreso mensual — gestores (para la vista Equipo)
-- ---------------------------------------------------------------------
create or replace function public.objetivos_negocio_progreso()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_desde timestamptz := date_trunc('month', now());
  v_hasta timestamptz := date_trunc('month', now()) + interval '1 month';
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_actual numeric;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_role not in ('owner','admin') then raise exception 'solo_gestor'; end if;

  for v_row in
    select o.id, o.profesional_id, o.metrica, o.objetivo_valor, o.bonus_cents,
           pr.nombre as prof_nombre, pr.profile_id
    from objetivos_profesional o
    join profesionales pr on pr.id = o.profesional_id
    where o.negocio_id = v_negocio and o.activo = true
    order by pr.nombre, o.metrica
  loop
    v_actual := public.objetivo_valor_actual(v_negocio, v_row.profesional_id, v_row.profile_id, v_row.metrica, v_desde, v_hasta);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'profesional_id', v_row.profesional_id,
      'profesional_nombre', v_row.prof_nombre,
      'metrica', v_row.metrica,
      'objetivo_valor', v_row.objetivo_valor,
      'bonus_cents', v_row.bonus_cents,
      'actual', v_actual
    ));
  end loop;

  return jsonb_build_object('ok', true, 'objetivos', v_result);
end;
$$;

revoke all on function public.objetivos_negocio_progreso() from public, anon;
grant execute on function public.objetivos_negocio_progreso() to authenticated;

-- ---------------------------------------------------------------------
-- Mis objetivos con progreso — el profesional que llama (Mi jornada)
-- ---------------------------------------------------------------------
create or replace function public.mis_objetivos_progreso()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_prof_id uuid;
  v_config jsonb;
  v_show_money boolean;
  v_desde timestamptz := date_trunc('month', now());
  v_hasta timestamptz := date_trunc('month', now()) + interval '1 month';
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_actual numeric;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_negocio is null then raise exception 'sin_perfil'; end if;

  select id into v_prof_id from profesionales where profile_id = v_uid and negocio_id = v_negocio limit 1;
  if v_prof_id is null then return jsonb_build_object('ok', true, 'objetivos', '[]'::jsonb); end if;

  select config into v_config from negocio_config where negocio_id = v_negocio;
  v_config := coalesce(v_config, '{}'::jsonb);
  v_show_money := v_role in ('owner','admin') or coalesce((v_config->>'mi_jornada_mostrar_importes')::boolean, true);

  for v_row in
    select o.id, o.metrica, o.objetivo_valor, o.bonus_cents
    from objetivos_profesional o
    where o.profesional_id = v_prof_id and o.activo = true
    order by o.metrica
  loop
    -- No revelar objetivos de dinero si el profesional no puede ver importes
    if v_row.metrica = 'ingresos' and not v_show_money then continue; end if;
    v_actual := public.objetivo_valor_actual(v_negocio, v_prof_id, v_uid, v_row.metrica, v_desde, v_hasta);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'metrica', v_row.metrica,
      'objetivo_valor', v_row.objetivo_valor,
      'bonus_cents', v_row.bonus_cents,
      'actual', v_actual
    ));
  end loop;

  return jsonb_build_object('ok', true, 'objetivos', v_result);
end;
$$;

revoke all on function public.mis_objetivos_progreso() from public, anon;
grant execute on function public.mis_objetivos_progreso() to authenticated;

-- ---------------------------------------------------------------------
-- Helper: valor actual de una metrica para un profesional en un rango.
-- ingresos -> euros; servicios -> nº; horas -> horas; productivo -> % reposo.
-- Mismo calculo que equipo_jornada_ranking, para que ranking y objetivos cuadren.
-- ---------------------------------------------------------------------
create or replace function public.objetivo_valor_actual(
  p_negocio text,
  p_profesional_id uuid,
  p_profile_id uuid,
  p_metrica text,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric := 0;
  v_ingresos bigint;
  v_propinas bigint;
  v_total numeric;
  v_usado numeric;
begin
  if p_metrica = 'servicios' then
    select count(*) into v from citas c
    where c.profesional_id = p_profesional_id and c.negocio_id = p_negocio
      and c.estado = 'completada' and c.inicio >= p_desde and c.inicio < p_hasta;

  elsif p_metrica = 'ingresos' then
    select coalesce(sum(total_cents),0), coalesce(sum(propina_cents),0)
      into v_ingresos, v_propinas
    from cobros where profesional_id = p_profesional_id and negocio_id = p_negocio
      and estado = 'completado' and cobrado_at >= p_desde and cobrado_at < p_hasta;
    v := round((v_ingresos - v_propinas) / 100.0, 2); -- euros netos de propina

  elsif p_metrica = 'horas' then
    if p_profile_id is not null then
      with f as (
        select tipo, marcado_at,
          lead(marcado_at) over (order by marcado_at) as next_at,
          lead(tipo) over (order by marcado_at) as next_tipo
        from fichajes
        where user_id = p_profile_id and negocio_id = p_negocio
          and marcado_at >= p_desde and marcado_at < p_hasta
      )
      select coalesce(sum(extract(epoch from (next_at - marcado_at)) / 3600.0), 0)
        into v from f where tipo = 'entrada' and next_tipo = 'salida';
    end if;

  elsif p_metrica = 'productivo' then
    select coalesce(sum(totalmin),0), coalesce(sum(usedmin),0) into v_total, v_usado
    from (
      select
        extract(epoch from (c.fin_espera - c.fin_activa))/60.0 as totalmin,
        (
          select coalesce(sum(greatest(0, extract(epoch from (least(d.fin, c.fin_espera) - greatest(d.inicio, c.fin_activa)))/60.0)), 0)
          from citas d
          where d.profesional_id = p_profesional_id and d.id <> c.id
            and d.inicio < c.fin_espera and d.fin > c.fin_activa
        ) as usedmin
      from citas c
      where c.profesional_id = p_profesional_id and c.negocio_id = p_negocio
        and c.estado = 'completada'
        and c.fin_activa is not null and c.fin_espera is not null
        and c.fin_espera > c.fin_activa
        and c.inicio >= p_desde and c.inicio < p_hasta
    ) sub;
    v := case when v_total > 0 then round(least(v_usado, v_total) / v_total * 100.0, 1) else 0 end;
  end if;

  return coalesce(v, 0);
end;
$$;

revoke all on function public.objetivo_valor_actual(text,uuid,uuid,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.objetivo_valor_actual(text,uuid,uuid,text,timestamptz,timestamptz) to authenticated, service_role;
