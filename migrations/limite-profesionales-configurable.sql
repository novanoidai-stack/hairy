-- El limite de 15 profesionales pasa a ser un dial por salon.
--
-- La landing dice, con estas palabras: "En ambos planes los profesionales son
-- ilimitados". El software corta en 15 (antes solo en el boton; desde
-- migrations/limite-profesionales-15.sql, tambien en la base de datos). O sea
-- que un salon de 18 sillas se daba de alta creyendo una cosa y se encontraba
-- con otra, y encima el dia que intentara meter al numero 16.
--
-- Se puede resolver de dos maneras: cambiando el texto de la landing o quitando
-- el limite. Mientras se decide, lo que NO puede quedarse es un muro fijo
-- escrito en el codigo: el limite pasa a vivir en negocio_config
-- ('limiteProfesionales') y el equipo de Mecha puede subirselo a un salon
-- concreto desde su panel, sin desplegar nada.
--
-- El 15 sigue siendo el valor por defecto: es una red contra el error humano y
-- contra el abuso de la API, no una condicion comercial.

create or replace function public.limitar_profesionales_por_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activos int;
  v_max     int;
begin
  if new.activo is not true then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.activo is true
     and old.negocio_id is not distinct from new.negocio_id then
    return new;
  end if;

  -- Limite del salon, si lo tiene; si no, 15. Un 0 o un negativo se ignoran
  -- (mejor el default que dejar un salon sin poder dar de alta a nadie).
  select nullif(greatest(coalesce((nc.config->>'limiteProfesionales')::int, 0), 0), 0)
    into v_max
    from public.negocio_config nc
   where nc.negocio_id = new.negocio_id;
  v_max := coalesce(v_max, 15);

  perform pg_advisory_xact_lock(hashtext('profesionales_limite:' || new.negocio_id));

  select count(*) into v_activos
    from public.profesionales
   where negocio_id = new.negocio_id
     and activo is true
     and id <> new.id;

  if v_activos >= v_max then
    raise exception 'limite_profesionales'
      using hint = format('Este salon tiene el limite en %s profesionales activos.', v_max);
  end if;

  return new;
end;
$$;

revoke execute on function public.limitar_profesionales_por_negocio() from public;
revoke execute on function public.limitar_profesionales_por_negocio() from anon;
revoke execute on function public.limitar_profesionales_por_negocio() from authenticated;

-- El equipo de Mecha se lo sube a quien lo necesite (un salon grande, una
-- cadena). Nadie del salon puede tocarse su propio limite.
create or replace function public.staff_set_limite_profesionales(p_negocio_id text, p_limite int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_negocio_id is null or btrim(p_negocio_id) = '' then
    raise exception 'sin_negocio';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 500 then
    raise exception 'limite_no_valido';
  end if;

  insert into public.negocio_config (negocio_id, config)
  values (p_negocio_id, jsonb_build_object('limiteProfesionales', p_limite))
  on conflict (negocio_id) do update
    set config = public.negocio_config.config || jsonb_build_object('limiteProfesionales', p_limite),
        updated_at = now();

  return jsonb_build_object('negocio_id', p_negocio_id, 'limite', p_limite);
end;
$$;

grant execute on function public.staff_set_limite_profesionales(text, int) to authenticated;

notify pgrst, 'reload schema';
