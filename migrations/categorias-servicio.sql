-- Categorías de servicio configurables por negocio, con color de marca.
-- Aditiva: NO se borra todavía `servicios.categoria` (texto). Eso es una migración de
-- limpieza aparte, después de desplegar el código que ya no la lee (RPCs + UI).

create table if not exists categorias_servicio (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  color text not null check (color in (
    'primary','success','warning','danger','cyan','rose','indigo','purple','teal','slate'
  )),
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (negocio_id, nombre)
);

alter table categorias_servicio enable row level security;

create policy "Users can view categorias from own negocio"
  on categorias_servicio for select
  using (negocio_id = (select profiles.negocio_id from profiles where profiles.id = auth.uid()));

create policy "Users can create categorias in own negocio"
  on categorias_servicio for insert
  with check (negocio_id = (select profiles.negocio_id from profiles where profiles.id = auth.uid()));

create policy "Users can update categorias in own negocio"
  on categorias_servicio for update
  using (negocio_id = (select profiles.negocio_id from profiles where profiles.id = auth.uid()));

create policy "Users can delete categorias in own negocio"
  on categorias_servicio for delete
  using (negocio_id = (select profiles.negocio_id from profiles where profiles.id = auth.uid()));

create policy "demo_block_insert" on categorias_servicio
  for insert with check (not is_shared_demo_visitor());

create policy "demo_block_update" on categorias_servicio
  for update using (not is_shared_demo_visitor()) with check (not is_shared_demo_visitor());

create policy "demo_block_delete" on categorias_servicio
  for delete using (not is_shared_demo_visitor());

create index if not exists categorias_servicio_negocio_idx on categorias_servicio(negocio_id);

alter table servicios add column if not exists categoria_id uuid references categorias_servicio(id) on delete set null;

-- Backfill: una categorias_servicio por cada valor de texto distinto que ya exista,
-- por negocio, asignando color de la paleta de 10 tonos en orden alfabético de aparición.
do $$
declare
  v_negocio text;
  v_categoria text;
  v_color text;
  v_orden integer;
  v_id uuid;
  v_colores text[] := array['primary','success','warning','danger','cyan','rose','indigo','purple','teal','slate'];
begin
  for v_negocio in select distinct negocio_id from servicios where categoria is not null loop
    v_orden := 0;
    for v_categoria in
      select distinct categoria from servicios
      where negocio_id = v_negocio and categoria is not null
      order by categoria
    loop
      v_color := v_colores[(v_orden % array_length(v_colores, 1)) + 1];
      insert into categorias_servicio (negocio_id, nombre, color, orden)
      values (v_negocio, v_categoria, v_color, v_orden)
      returning id into v_id;

      update servicios
      set categoria_id = v_id
      where negocio_id = v_negocio and categoria = v_categoria;

      v_orden := v_orden + 1;
    end loop;
  end loop;
end $$;

-- RPC del portal público: añade categoria_id/nombre/color a cada servicio devuelto y
-- ordena por el orden manual de la categoría en vez de alfabético sobre el texto libre.
-- Parte de la version mas reciente verificada (migrations/portal-web-y-resenas-verificadas.sql,
-- 16 jun: anade 'web' al negocio y 'foto_url' a cada servicio) -- NO de la version original.
create or replace function public.portal_info(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug,
      'nombre', np.nombre_publico,
      'logo_url', np.logo_url,
      'direccion', np.direccion,
      'telefono', np.telefono,
      'web', np.web,
      'idioma', np.idioma,
      'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento
    ),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'nombre', s.nombre,
        'descripcion', s.descripcion,
        'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria,
        'categoria_id', s.categoria_id,
        'categoria_nombre', cs.nombre,
        'categoria_color', cs.color,
        'prepago', coalesce(s.prepago_requerido, false),
        'foto_url', s.foto_url
      ) order by cs.orden nulls last, s.nombre)
      from public.servicios s
      left join public.categorias_servicio cs on cs.id = s.categoria_id
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'nombre', pr.nombre,
        'color', pr.color
      ) order by pr.nombre)
      from public.profesionales pr
      where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np
  where np.slug = p_slug and np.portal_activo = true;
$$;

-- RPC de autogestión del cliente: añade categoria_nombre/color del servicio de la cita.
-- Parte de la version mas reciente verificada (migrations/telefono-normalizar-comparacion.sql,
-- 22 jun: normalizar_telefono() + es_oferta_espera/deposito_requerido/deposito_pagado) -- NO de
-- la version original en cita-publica-getter.sql, que ya estaba superada.
create or replace function public.cita_publica(p_slug text, p_cita_id uuid, p_telefono text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_cita    record;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'motivo', 'portal');
  end if;

  select c.id, c.estado, c.inicio, c.fin, c.servicio_id, c.profesional_id,
         coalesce(c.es_oferta_espera, false)   as es_oferta_espera,
         coalesce(c.deposito_requerido, false) as deposito_requerido,
         coalesce(c.deposito_pagado, false)    as deposito_pagado,
         coalesce(s.nombre, '')            as servicio,
         coalesce(cs.nombre, '')           as categoria_nombre,
         coalesce(cs.color, '')            as categoria_color,
         coalesce(s.cancelacion_horas, 24) as cancelacion_horas,
         coalesce(pr.nombre, '')           as profesional,
         coalesce(np.nombre_publico, '')   as salon
    into v_cita
  from public.citas c
  join public.clientes cl       on cl.id = c.cliente_id
  join public.negocio_portal np on np.negocio_id = c.negocio_id
  left join public.servicios s     on s.id = c.servicio_id
  left join public.categorias_servicio cs on cs.id = s.categoria_id
  left join public.profesionales pr on pr.id = c.profesional_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);

  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cita_id', v_cita.id,
    'estado', v_cita.estado,
    'servicio_id', v_cita.servicio_id,
    'servicio', v_cita.servicio,
    'categoria_nombre', v_cita.categoria_nombre,
    'categoria_color', v_cita.categoria_color,
    'profesional_id', v_cita.profesional_id,
    'profesional', v_cita.profesional,
    'inicio', v_cita.inicio,
    'fin', v_cita.fin,
    'salon', v_cita.salon,
    'slug', p_slug,
    'es_oferta_espera', v_cita.es_oferta_espera,
    'deposito_requerido', v_cita.deposito_requerido,
    'deposito_pagado', v_cita.deposito_pagado,
    'cancelable', (v_cita.estado in ('pendiente','confirmada') and v_cita.inicio > now()),
    'cancelacion_horas', v_cita.cancelacion_horas,
    'fuera_de_plazo', (v_cita.inicio < now() + make_interval(hours => v_cita.cancelacion_horas))
  );
end;
$function$;
