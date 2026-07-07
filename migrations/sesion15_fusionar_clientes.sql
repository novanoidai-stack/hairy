-- Sesion 15 · Fusionar clientas duplicadas (RPC transaccional)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Hoy solo hay DETECCION de duplicados al crear (RN-CL-060). Falta la FUSION:
-- elegir un registro maestro, mover TODO lo del duplicado (citas, cobros, pagos,
-- presupuestos, fichas, notas, resenas, fotos, conversaciones, gamificacion,
-- lista de espera, consentimientos, grupo familiar) al maestro y borrar el duplicado.
--
-- Atomico (una funcion plpgsql = una transaccion: si algo falla, no se mueve nada).
-- Multi-tenant estricto: ambos clientes deben ser del negocio del caller (owner/admin).
-- 3 tablas tienen UNIQUE con cliente_id (cumpleanos_avisos, grupo_familiar_miembros,
-- logros_desbloqueados): se des-colisiona borrando la fila del duplicado que chocaria.
-- Regla round 4: sin grant a anon; el chequeo de rol va dentro.

create or replace function public.fusionar_clientes(p_maestro uuid, p_duplicado uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_negocio_id text;
  v_role text;
  v_citas int;
begin
  select negocio_id, role into v_negocio_id, v_role from public.profiles where id = auth.uid();
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario no valido');
  end if;
  if v_role not in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Solo el gestor puede fusionar clientas');
  end if;
  if v_negocio_id = 'demo_salon_001' then
    return jsonb_build_object('ok', false, 'error', 'En la demo compartida no se pueden fusionar clientas');
  end if;
  if p_maestro = p_duplicado then
    return jsonb_build_object('ok', false, 'error', 'No puedes fusionar una clienta consigo misma');
  end if;
  if not exists (select 1 from public.clientes where id = p_maestro and negocio_id = v_negocio_id) then
    return jsonb_build_object('ok', false, 'error', 'La clienta maestra no existe en tu negocio');
  end if;
  if not exists (select 1 from public.clientes where id = p_duplicado and negocio_id = v_negocio_id) then
    return jsonb_build_object('ok', false, 'error', 'La clienta duplicada no existe en tu negocio');
  end if;

  -- Contamos las citas movidas para el resumen (metrica mas util para el gestor).
  select count(*) into v_citas from public.citas where cliente_id = p_duplicado;

  -- Tablas sin UNIQUE(cliente_id, ...): reasignacion directa al maestro.
  update public.citas                 set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.cobros                set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.pagos                 set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.presupuestos          set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.fichas_tecnicas_color set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.notas_internas_cliente set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.resenas               set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.cliente_fotos         set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.conversaciones        set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.conversaciones_ia     set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.lista_espera          set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.consentimientos_cliente set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.fuga_clientas_avisos  set cliente_id = p_maestro where cliente_id = p_duplicado;
  update public.recompensas_canjeadas set cliente_id = p_maestro where cliente_id = p_duplicado;

  -- Tablas con UNIQUE que incluye cliente_id: borra primero la fila del duplicado que
  -- chocaria con una ya existente del maestro, luego reasigna el resto.
  delete from public.cumpleanos_avisos d
    where d.cliente_id = p_duplicado
      and exists (select 1 from public.cumpleanos_avisos m
                  where m.cliente_id = p_maestro and m.negocio_id = d.negocio_id and m.anio = d.anio);
  update public.cumpleanos_avisos set cliente_id = p_maestro where cliente_id = p_duplicado;

  delete from public.grupo_familiar_miembros d
    where d.cliente_id = p_duplicado
      and exists (select 1 from public.grupo_familiar_miembros m
                  where m.cliente_id = p_maestro and m.grupo_id = d.grupo_id);
  update public.grupo_familiar_miembros set cliente_id = p_maestro where cliente_id = p_duplicado;

  delete from public.logros_desbloqueados d
    where d.cliente_id = p_duplicado
      and exists (select 1 from public.logros_desbloqueados m
                  where m.cliente_id = p_maestro and m.negocio_id = d.negocio_id and m.logro_id = d.logro_id);
  update public.logros_desbloqueados set cliente_id = p_maestro where cliente_id = p_duplicado;

  -- Completa los datos que le falten al maestro con los del duplicado (no pisa lo que
  -- el maestro ya tiene). Etiquetas: union de ambas.
  update public.clientes m set
    telefono          = coalesce(m.telefono, d.telefono),
    email             = coalesce(m.email, d.email),
    fecha_nacimiento  = coalesce(m.fecha_nacimiento, d.fecha_nacimiento),
    notas             = coalesce(m.notas, d.notas),
    alergias          = coalesce(m.alergias, d.alergias),
    canal_preferido   = coalesce(m.canal_preferido, d.canal_preferido),
    bebida_preferida  = coalesce(m.bebida_preferida, d.bebida_preferida),
    etiquetas         = (
      select coalesce(array_agg(distinct e), '{}')
      from unnest(coalesce(m.etiquetas, '{}') || coalesce(d.etiquetas, '{}')) e
    ),
    updated_at = now()
  from public.clientes d
  where m.id = p_maestro and d.id = p_duplicado;

  -- El duplicado queda sin dependencias: se elimina.
  delete from public.clientes where id = p_duplicado and negocio_id = v_negocio_id;

  return jsonb_build_object('ok', true, 'maestro_id', p_maestro, 'citas_movidas', v_citas);
end;
$$;

revoke execute on function public.fusionar_clientes(uuid, uuid) from public;
grant execute on function public.fusionar_clientes(uuid, uuid) to authenticated, service_role;
