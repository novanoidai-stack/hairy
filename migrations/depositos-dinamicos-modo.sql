-- Depositos dinamicos v2: modo de clasificacion (auto/manual/ambos) + mantener vivo
-- clientes.noshows_count. Aplicado al remoto como `depositos_dinamicos_modo_y_noshows`.

-- perfil_riesgo_cliente lee negocio_config.config->>'depositoModoClasificacion':
--   'auto'   -> solo historial (ignora el override manual del cliente)
--   'manual' -> solo el override (normal si no hay)
--   'ambos'  -> override si existe, si no historial (por defecto)
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

  select coalesce(config->>'depositoModoClasificacion', 'ambos') into v_modo
    from public.negocio_config where negocio_id = v_negocio;
  v_modo := coalesce(v_modo, 'ambos');

  if v_modo = 'manual' then
    return coalesce(v_override, 'normal');
  end if;
  if v_modo = 'ambos' and v_override is not null then
    return v_override;
  end if;

  -- clasificacion automatica (modo 'auto', o 'ambos' sin override)
  if coalesce(v_bloqueado, false) then return 'alto'; end if;

  select count(*) filter (where estado = 'completada'),
         count(*) filter (where estado in ('no_show','no_presentada'))
    into v_completadas, v_noshows
  from public.citas where cliente_id = p_cliente_id;

  if v_noshows >= greatest(p_umbral_alto, 1) then return 'alto'; end if;
  if v_noshows >= 1 then return 'riesgo'; end if;
  if v_completadas >= greatest(p_umbral_fiable, 1) then return 'exento'; end if;
  return 'normal';
end;
$$;

-- Mantiene clientes.noshows_count al cambiar el estado de una cita (o borrarla). Asi el
-- indicador de "Riesgo" de la lista de clientes (que lee noshows_count) funciona de verdad.
create or replace function public.tg_sync_noshows_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  v_cli := case when TG_OP = 'DELETE' then OLD.cliente_id else NEW.cliente_id end;
  if v_cli is not null then
    update public.clientes set noshows_count = (
      select count(*) from public.citas
      where cliente_id = v_cli and estado in ('no_show','no_presentada')
    ) where id = v_cli;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;

drop trigger if exists citas_sync_noshows on public.citas;
create trigger citas_sync_noshows
  after insert or delete or update of estado on public.citas
  for each row execute function public.tg_sync_noshows_count();

-- Backfill una vez.
update public.clientes c set noshows_count = (
  select count(*) from public.citas where cliente_id = c.id and estado in ('no_show','no_presentada')
) where coalesce(c.noshows_count,0) <> (
  select count(*) from public.citas where cliente_id = c.id and estado in ('no_show','no_presentada')
);
