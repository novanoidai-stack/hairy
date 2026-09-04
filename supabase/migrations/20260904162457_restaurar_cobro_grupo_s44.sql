-- 4 sep 2026. Deshacer la SEGUNDA reversion que trajo la copia literal del 1 sep.
--
-- 20260901170000_restaurar_cobro_online.sql copio literal el fichero legacy
-- `cobro-online-total-qr.sql` (julio) para meter el cobro online en la cadena
-- canonica. Encima de ese fichero se habian aplicado DOS migraciones que no
-- estaban en el repo, y el `create or replace` de la copia las piso:
--
--   - 20260708184905 s4_pago_info_publica_propinas (S4.2) -> ya restaurada en
--     20260904161122_antiabuso_cobro_online_publico.sql.
--   - 20260708192754 s4_cobro_online_grupo (S4.4)         -> es esta.
--
-- Que se perdio: cuando el pago 'total' era de un GRUPO, registrar_cobro_online
-- volvio a crear UN solo cobro, con el importe entero y el profesional de la
-- cita cabecera. Es decir: el trabajo de las demas profesionales del grupo no
-- aparecia en su Mi Jornada, y las demas citas del grupo se quedaban sin marcar
-- como cobradas. Aqui vuelve el reparto: un cobro por cita, base = precio de su
-- servicio, importe y propina repartidos proporcionalmente al precio y la
-- ultima cita se lleva el remanente del redondeo (por eso los trozos suman
-- exactamente el importe pagado y no se pierde ni un centimo).
--
-- Cuerpo tomado verbatim de archive/migraciones-legacy/s4-cobro-online-grupo.sql,
-- que es lo que estuvo corriendo en produccion hasta el 1 sep. Se reconoce
-- porque tiene un `loop` y DOS `insert into public.cobros`; la version revertida
-- tiene uno solo y ningun bucle.
--
-- Sin riesgo fiscal acumulado: el 4 sep no habia NINGUN cobro con origen='portal'
-- en la base (`select count(*) from cobros where origen='portal'` = 0), asi que
-- este camino no ha conciliado nunca un cobro real y no hay nada que rectificar
-- --que ademas no se podria: cobros_prevent_financial_updates lo impide (Ley
-- Antifraude 11/2021).
--
-- Convencion de caja respetada: total_cents YA INCLUYE la propina (los trozos
-- v_share suman importe_cents, que requerir_pago_total_cita calcula como
-- base - senal - descuento + propina). Es lo que comprueba bd-invariantes.
--
-- Con 1 cita el comportamiento es identico al de antes de esta migracion.

create or replace function public.registrar_cobro_online(p_pago_id uuid, p_metodo text default 'online')
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_pago public.pagos;
  v_cab public.citas;
  v_prop int; v_desc int; v_metodo text;
  v_base_total int; v_n int; v_i int := 0;
  v_acc_total int := 0; v_acc_prop int := 0;
  v_share int; v_pshare int;
  v_first uuid := null; v_cobro uuid;
  v_precio numeric; v_nombre text; v_base int;
  r record;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found then raise exception 'pago_no_encontrado'; end if;
  if v_pago.cita_id is null then return null; end if;

  select * into v_cab from public.citas where id = v_pago.cita_id;
  if not found then return null; end if;

  v_prop := greatest(0, coalesce((v_pago.metadata->>'propina_cents')::int, 0));
  v_desc := greatest(0, coalesce((v_pago.metadata->>'descuento_cents')::int, 0));
  v_metodo := coalesce(nullif(p_metodo, ''), v_pago.metadata->>'metodo', 'online');
  if v_metodo not in ('online','bizum') then v_metodo := 'online'; end if;

  if v_cab.grupo_id is null then
    if v_cab.cobrada then return v_cab.cobro_id; end if;
    select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cab.servicio_id;
    v_base := coalesce(round(coalesce(v_precio,0)*100)::int, 0);
    insert into public.cobros (negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
      total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key)
    values (v_cab.negocio_id, v_cab.id, v_cab.grupo_id, v_cab.profesional_id, v_cab.cliente_id,
      v_pago.importe_cents, v_prop, v_desc, v_metodo, 0, 0, v_pago.importe_cents, 'portal', 'completado', 'pago:'||v_pago.id::text)
    returning id into v_cobro;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro, 'servicio', v_cab.servicio_id, coalesce(v_nombre,'Servicio'), v_base, 1);
    update public.citas set cobrada=true, cobro_id=v_cobro where id=v_cab.id and cobrada=false;
    return v_cobro;
  end if;

  -- GRUPO
  select coalesce(sum(round(coalesce(s.precio,0)*100)::int),0), count(*)
    into v_base_total, v_n
    from public.citas c left join public.servicios s on s.id=c.servicio_id
    where c.grupo_id = v_cab.grupo_id;

  for r in
    select c.id, c.profesional_id, c.cliente_id, c.negocio_id, c.servicio_id, c.cobrada,
           coalesce(round(coalesce(s.precio,0)*100)::int,0) as base, s.nombre
    from public.citas c left join public.servicios s on s.id=c.servicio_id
    where c.grupo_id = v_cab.grupo_id
    order by c.orden_en_grupo nulls first, c.inicio
  loop
    v_i := v_i + 1;
    if v_i < v_n then
      v_share  := case when v_base_total>0 then floor(v_pago.importe_cents::numeric * r.base / v_base_total)::int else 0 end;
      v_pshare := case when v_base_total>0 then floor(v_prop::numeric * r.base / v_base_total)::int else 0 end;
    else
      v_share  := v_pago.importe_cents - v_acc_total;
      v_pshare := v_prop - v_acc_prop;
    end if;
    v_acc_total := v_acc_total + v_share;
    v_acc_prop  := v_acc_prop + v_pshare;

    if r.cobrada then continue; end if;

    insert into public.cobros (negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
      total_cents, propina_cents, descuento_cents, metodo, efectivo_cents, datafono_cents, online_cents, origen, estado, idempotency_key)
    values (r.negocio_id, r.id, v_cab.grupo_id, r.profesional_id, r.cliente_id,
      greatest(0, v_share), greatest(0, v_pshare), 0, v_metodo, 0, 0, greatest(0, v_share), 'portal', 'completado',
      'pago:'||v_pago.id::text||':'||r.id::text)
    returning id into v_cobro;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro, 'servicio', r.servicio_id, coalesce(r.nombre,'Servicio'), r.base, 1);
    update public.citas set cobrada=true, cobro_id=v_cobro where id=r.id and cobrada=false;
    if v_first is null then v_first := v_cobro; end if;
  end loop;

  return v_first;
end;
$function$;

-- Sigue siendo solo del webhook (service_role): la llama al confirmarse el pago.
revoke all on function public.registrar_cobro_online(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_cobro_online(uuid, text) to service_role;

notify pgrst, 'reload schema';
