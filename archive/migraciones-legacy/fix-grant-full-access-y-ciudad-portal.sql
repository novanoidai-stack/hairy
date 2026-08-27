-- Dos arreglos que salieron al revisar el lio de cuentas del 16 ago 2026.
--
-- 1) staff_grant_full_access nacia con new_plan = 'full' por defecto, y el panel
--    de staff (web/admin.html, boton "Dar acceso completo") la llama SIN plan.
--    Desde que 'full' dejo de ser un valor valido de profiles.plan (CHECK
--    profiles_plan_chk: free | esencial | estudio), esa llamada revienta con un
--    check_violation: el alta de cualquier cliente nuevo estaba rota.
--    Ahora el valor por defecto es 'estudio' y, por si acaso, 'full' se traduce.
--
-- 2) portal_info no devolvia la ciudad, asi que el portal publico enseñaba
--    "Salon de belleza · Madrid" clavado a fuego a todos los salones (a un salon
--    de A Coruña incluido). Se anade la ciudad para que la pinte de verdad.

create or replace function public.staff_grant_full_access(
  target_user_id uuid,
  new_negocio_id text default null,
  new_plan text default 'estudio'
)
returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  prof public.profiles;
  base text;
  candidate text;
  generated boolean := false;
  plan_final text;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  -- 'full' es el nombre historico del plan completo: hoy se llama 'estudio' y es
  -- lo unico que acepta el CHECK. Traducirlo aqui evita romper a quien llame con
  -- el nombre viejo (scripts, panel antiguo, integraciones).
  plan_final := coalesce(nullif(trim(new_plan), ''), 'estudio');
  if plan_final = 'full' then
    plan_final := 'estudio';
  end if;
  if plan_final not in ('free', 'esencial', 'estudio') then
    raise exception 'plan_no_valido';
  end if;

  if new_negocio_id is not null and length(trim(new_negocio_id)) > 0 then
    candidate := lower(regexp_replace(trim(new_negocio_id), '\s+', '_', 'g'));
    candidate := regexp_replace(candidate, '[^a-z0-9_]', '', 'g');
  elsif prof.negocio_id is null or trim(prof.negocio_id) = '' or prof.negocio_id = 'demo_salon_001' then
    base := lower(regexp_replace(coalesce(nullif(trim(prof.nombre_negocio), ''), 'salon'), '\s+', '_', 'g'));
    base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
    if base = '' then base := 'salon'; end if;
    if coalesce(trim(prof.codigo_postal), '') <> '' then
      candidate := base || '_' || regexp_replace(lower(prof.codigo_postal), '[^a-z0-9]', '', 'g');
    else
      candidate := base || '_' || substr(md5(random()::text), 1, 5);
    end if;
    generated := true;
  else
    candidate := prof.negocio_id;
  end if;

  if candidate = '' or candidate = 'demo_salon_001' then
    candidate := 'salon_' || substr(md5(random()::text), 1, 5);
    generated := true;
  end if;

  if generated and exists (
    select 1 from public.profiles where negocio_id = candidate and id <> target_user_id
  ) then
    candidate := candidate || '_' || substr(md5(random()::text), 1, 5);
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = plan_final,
         negocio_id = candidate,
         -- P0-005. Las dos columnas van por coalesce a proposito: dar acceso completo
         -- se ejecuta mas de una vez (corregir el negocio_id, cambiar de plan) y la
         -- prueba NO puede reiniciarse en cada pasada.
         trial_ends_at = case
                           when suscripcion_estado is null
                             then coalesce(trial_ends_at, now() + interval '30 days')
                           else trial_ends_at
                         end,
         -- A un salon que ya paga (activa / pago_pendiente / impagada) no se le
         -- devuelve nunca a 'prueba'.
         suscripcion_estado = coalesce(suscripcion_estado, 'prueba'),
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  perform public.sincronizar_plan_negocio(prof.negocio_id);
  select * into prof from public.profiles where id = target_user_id;

  return prof;
end;
$function$;

grant execute on function public.staff_grant_full_access(uuid, text, text) to authenticated;

-- ============================================================
-- portal_info: la ciudad, para que el portal no diga Madrid siempre
-- ============================================================

create or replace function public.portal_info(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug, 'nombre', np.nombre_publico, 'logo_url', np.logo_url, 'direccion', np.direccion,
      'telefono', np.telefono, 'web', np.web, 'idioma', np.idioma, 'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento,
      'ciudad', np.ciudad,
      'analytics_config', coalesce(np.analytics_config, '{"enabled": false, "measurementId": "", "consentGiven": false}'::jsonb),
      'captcha_site_key', np.captcha_site_key,
      'fondo_portal_url', np.fondo_portal_url
    ),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria, 'categoria_id', s.categoria_id, 'categoria_nombre', cs.nombre,
        'categoria_color', cs.color, 'prepago', coalesce(s.prepago_requerido, false), 'foto_url', s.foto_url
      ) order by cs.orden nulls last, s.nombre)
      from public.servicios s left join public.categorias_servicio cs on cs.id = s.categoria_id
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'color', pr.color) order by pr.nombre)
      from public.profesionales pr where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np where np.slug = p_slug and np.portal_activo = true;
$function$;

-- El portal es anonimo: sin este grant explicito la RPC deja de existir para el
-- visitante (ver round 4 de seguridad, 2 jul).
grant execute on function public.portal_info(text) to anon, authenticated;

notify pgrst, 'reload schema';
