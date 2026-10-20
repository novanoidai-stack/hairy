-- historial_mensajes devuelve tambien cita_id, para el boton "Ver cita" del
-- historial (abre la agenda en ese dia con la ficha de la cita).
--
-- Solo va relleno si la cita sigue existiendo y la agenda la muestra
-- (oculta_en_calendario = false): la agenda no carga las ocultas y el enlace
-- llevaria al dia sin abrir nada. Campanas y avisos de lista de espera no van
-- ligados a una cita de la clienta y lo devuelven nulo.

create or replace function public.historial_mensajes(
  p_tipo text default null,
  p_buscar text default null,
  p_limite integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio text := public._campana_gestor();
  v_buscar text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_patron text;
  v_digitos text;
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_res jsonb;
begin
  if p_tipo is not null
     and p_tipo not in ('confirmacion', 'recordatorio', 'resena', 'senal', 'campana', 'lista_espera') then
    raise exception 'tipo_invalido';
  end if;

  if v_buscar is not null then
    v_patron := '%' || replace(replace(replace(v_buscar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digitos := nullif(regexp_replace(v_buscar, '\D', '', 'g'), '');
  end if;

  with mensajes as (
    select
      'wa-' || e.id as id,
      e.tipo,
      'whatsapp'::text as canal,
      e.created_at as fecha,
      cl.nombre,
      coalesce(e.telefono, cl.telefono) as contacto,
      case
        when e.evento = 'fallo_envio' then 'fallido'
        when st.leido then 'leido'
        when st.entregado then 'entregado'
        when st.fallido then 'fallido'
        else 'enviado'
      end as estado,
      case when e.evento = 'fallo_envio' then e.error_code else st.error_code end as error_code,
      case when e.evento = 'fallo_envio' then e.error_titulo else st.error_titulo end as error_titulo,
      c.inicio as cita_inicio,
      s.nombre as servicio,
      p.nombre as profesional,
      null::text as campana,
      null::text as texto,
      null::text as hueco_fecha,
      null::text as hueco_hora,
      -- Solo si la agenda la puede abrir: ni borrada ni oculta (cancelada).
      case when c.id is not null and not c.oculta_en_calendario then c.id end as cita_id
    from public.whatsapp_eventos e
    left join public.citas c on c.id = e.cita_id
    left join public.clientes cl on cl.id = c.cliente_id
    left join public.servicios s on s.id = c.servicio_id
    left join public.profesionales p on p.id = c.profesional_id
    left join lateral (
      select
        bool_or(x.evento = 'read') as leido,
        bool_or(x.evento = 'delivered') as entregado,
        bool_or(x.evento = 'failed') as fallido,
        (array_agg(x.error_code order by x.id desc) filter (where x.evento = 'failed'))[1] as error_code,
        (array_agg(x.error_titulo order by x.id desc) filter (where x.evento = 'failed'))[1] as error_titulo
      from public.whatsapp_eventos x
      where e.wamid is not null and x.wamid = e.wamid and x.id <> e.id
    ) st on true
    where e.negocio_id = v_negocio
      and e.evento in ('enviado', 'fallo_envio')
      and e.tipo in ('confirmacion', 'recordatorio', 'resena', 'senal')

    union all

    select
      'cd-' || d.id,
      'campana',
      ca.canal,
      coalesce(d.enviado_en, d.created_at),
      d.nombre,
      d.contacto,
      case when d.estado = 'enviado' then 'enviado' else 'fallido' end,
      null::integer,
      null::text,
      null::timestamptz,
      null::text,
      null::text,
      ca.nombre,
      d.mensaje_final,
      null::text,
      null::text,
      null::uuid
    from public.campana_destinatarios d
    join public.campanas ca on ca.id = d.campana_id
    where d.negocio_id = v_negocio
      and d.estado in ('enviado', 'error')

    union all

    select
      'le-' || a.id,
      'lista_espera',
      'whatsapp',
      a.enviado_at,
      a.nombre,
      a.telefono,
      'enviado',
      null::integer,
      null::text,
      null::timestamptz,
      a.servicio,
      null::text,
      null::text,
      null::text,
      a.fecha,
      a.hora,
      null::uuid
    from public.lista_espera_avisos a
    where a.negocio_id = v_negocio
      and a.enviado_at is not null
  ),
  filtrado as (
    select *
    from mensajes m
    where v_buscar is null
       or m.nombre ilike v_patron
       or (v_digitos is not null and regexp_replace(coalesce(m.contacto, ''), '\D', '', 'g') like '%' || v_digitos || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrado f where p_tipo is null or f.tipo = p_tipo),
    'conteos', (
      select coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb)
      from (select f.tipo, count(*) as n from filtrado f group by f.tipo) t
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(pagina) order by pagina.fecha desc, pagina.id)
      from (
        select *
        from filtrado f
        where p_tipo is null or f.tipo = p_tipo
        order by f.fecha desc, f.id
        limit v_limite offset v_offset
      ) pagina
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.historial_mensajes(text, text, integer, integer) from public, anon;
grant execute on function public.historial_mensajes(text, text, integer, integer) to authenticated;
