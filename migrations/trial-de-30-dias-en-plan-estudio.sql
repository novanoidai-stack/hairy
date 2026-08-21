-- ---------------------------------------------------------------------
-- La prueba de 30 dias pasa a ser plan ESTUDIO, no esencial.
-- Decision de producto (22 ago 2026): quien entra gratis prueba el
-- producto entero. Al terminar el trial ya elige Esencial o Estudio; la
-- logica de fin de prueba no cambia, solo con que plan se nace.
-- APLICADA EN REMOTO el 22 ago 2026 (MCP de Supabase).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_salon   text := nullif(btrim(new.raw_user_meta_data->>'salon'), '');
  v_cp      text := nullif(btrim(new.raw_user_meta_data->>'codigo_postal'), '');
  v_negocio text;
begin
  -- INVITACION DE EMPLEADO: aqui no se crea perfil. Lo crea despues la edge
  -- crear-acceso-empleado, con el negocio_id y el plan HEREDADOS del salon que
  -- invita. Si lo insertaramos nosotros, ese upsert pasaria a ser un UPDATE y
  -- guard_profile_identity_columns le revertiria negocio_id, role y plan EN
  -- SILENCIO (revierte tambien para service_role: solo lo salta identity_ctx),
  -- dejando al trabajador con un salon propio y una prueba que no le tocan.
  if new.invited_at is not null then
    return new;
  end if;

  v_negocio := public.generar_negocio_id_unico(v_salon, v_cp, new.id);

  insert into public.profiles (
    id, email, nombre, apellido, codigo_postal, nombre_negocio, negocio_id,
    phone, role, plan, suscripcion_estado, trial_ends_at
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
    nullif(btrim(new.raw_user_meta_data->>'apellido'), ''),
    v_cp,
    v_salon,
    v_negocio,
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    -- ANTES: 'esencial'. La prueba ahora nace en el plan completo.
    'estudio',
    'prueba',
    now() + interval '30 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Las cuentas que ya estan de prueba se suben tambien: nacieron con
-- esencial solo por el valor anterior, no por haber elegido nada.
-- identity_ctx es obligatorio: guard_profile_identity_columns revierte
-- `plan` incluso para service_role si no esta marcado.
do $$
begin
  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = 'estudio'
   where suscripcion_estado = 'prueba'
     and plan = 'esencial';
end $$;
