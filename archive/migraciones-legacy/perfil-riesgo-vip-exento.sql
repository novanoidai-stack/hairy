-- Matiz VIP: el cliente VIP (mismos umbrales que la etiqueta de la ficha: >10 citas
-- completadas o >500 EUR gastados) queda exento de senal automaticamente, salvo que el salon
-- lo desactive (depositoVipExento, ON por defecto). Solo en modo auto/ambos sin override.
-- Aplicado al remoto como `perfil_riesgo_vip_exento`.
create or replace function public.perfil_riesgo_cliente(
  p_cliente_id uuid,
  p_umbral_fiable int default 3,
  p_umbral_alto int default 2
) returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_override text;
  v_bloqueado boolean;
  v_negocio text;
  v_modo text;
  v_vip_exento boolean;
  v_completadas int;
  v_noshows int;
begin
  select deposito_perfil_override, bloqueado, negocio_id
    into v_override, v_bloqueado, v_negocio
    from public.clientes where id = p_cliente_id;
  if not found then return null; end if;
  if auth.uid() is not null and v_negocio is distinct from public.my_negocio_id_text() then
    return null;
  end if;

  select coalesce(config->>'depositoModoClasificacion', 'ambos'),
         coalesce((config->>'depositoVipExento')::boolean, true)
    into v_modo, v_vip_exento
    from public.negocio_config where negocio_id = v_negocio;
  v_modo := coalesce(v_modo, 'ambos');
  v_vip_exento := coalesce(v_vip_exento, true);

  if v_modo = 'manual' then
    return coalesce(v_override, 'normal');
  end if;
  if v_modo = 'ambos' and v_override is not null then
    return v_override;
  end if;

  if coalesce(v_bloqueado, false) then return 'alto'; end if;

  select count(*) filter (where estado = 'completada'),
         count(*) filter (where estado in ('no_show','no_presentada'))
    into v_completadas, v_noshows
  from public.citas where cliente_id = p_cliente_id;

  -- VIP -> exento (por visitas o por gasto acumulado), aunque tenga algun no-show
  if v_vip_exento then
    if coalesce(v_completadas,0) > 10 then return 'exento'; end if;
    if (select coalesce(sum(total_cents),0) from public.cobros where cliente_id = p_cliente_id) > 50000 then
      return 'exento';
    end if;
  end if;

  if v_noshows >= greatest(p_umbral_alto, 1) then return 'alto'; end if;
  if v_noshows >= 1 then return 'riesgo'; end if;
  if v_completadas >= greatest(p_umbral_fiable, 1) then return 'exento'; end if;
  return 'normal';
end;
$$;
