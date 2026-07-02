-- Test de regresion de aislamiento multi-tenant (pasar tras cada migracion,
-- junto a los advisors). Se ejecuta con execute_sql del MCP de Supabase.
-- Simula a un usuario authenticated real (demo.publico, tenant demo_salon_001)
-- y comprueba que NO ve ninguna fila de otros negocios en las tablas sensibles.
-- Si hay fuga, lanza excepcion con el detalle; si esta bien, NOTICE 'RLS OK'.

do $$
declare
  v_uid uuid;
  n_clientes int; n_citas int; n_cobros int; n_fichajes int; n_presupuestos int;
begin
  select id into v_uid from auth.users where email = 'demo.publico@mecha.app';
  if v_uid is null then
    raise exception 'No existe la cuenta demo.publico@mecha.app (necesaria para el test)';
  end if;

  -- Adoptar la identidad del usuario demo con rol authenticated (RLS aplica)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n_clientes     from public.clientes     where negocio_id <> 'demo_salon_001';
  select count(*) into n_citas        from public.citas        where negocio_id <> 'demo_salon_001';
  select count(*) into n_cobros       from public.cobros       where negocio_id <> 'demo_salon_001';
  select count(*) into n_fichajes     from public.fichajes     where negocio_id <> 'demo_salon_001';
  select count(*) into n_presupuestos from public.presupuestos where negocio_id <> 'demo_salon_001';

  -- Volver a postgres antes de evaluar (por claridad; set_config local expira al final)
  perform set_config('role', 'postgres', true);

  if n_clientes + n_citas + n_cobros + n_fichajes + n_presupuestos > 0 then
    raise exception 'FUGA multi-tenant: clientes=% citas=% cobros=% fichajes=% presupuestos=%',
      n_clientes, n_citas, n_cobros, n_fichajes, n_presupuestos;
  end if;

  raise notice 'RLS OK: aislamiento multi-tenant verificado (0 filas ajenas visibles para authenticated)';
end $$;
