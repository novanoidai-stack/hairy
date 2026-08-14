-- Migration: antifraude-cobros-v2-v5.sql (Mega-Plan WS-7 V2 + V5)
--
-- V2 — Congelar el resto de campos sensibles de un cobro ya registrado.
--   El trigger anterior blindaba los importes, pero dejaba sueltos:
--     - cobrado_at -> mover un cobro de fecha lo cambia de periodo (y de trimestre).
--     - metodo / origen -> falsea el arqueo de caja (efectivo que pasa por tarjeta).
--     - estado -> permitia "des-anular" un cobro o marcarlo anulado sin dejar rastro.
--   cobrado_at, metodo y origen pasan a ser inmutables SIEMPRE (ni por RPC).
--   `estado` solo puede cambiarlo una RPC autorizada, y NUNCA se sale de un
--   estado terminal (anulado / reembolsado no vuelven atras).
--
--   La excepcion para las RPC usa la misma convencion que ya existe en el repo
--   para profiles (`mecha.identity_ctx` en guard_profile_identity_columns): la
--   funcion marca `mecha.cobro_ctx` = '1' LOCAL a la transaccion antes de tocar
--   el estado. Un cliente no puede marcarlo por su cuenta de forma util porque
--   (WS-7 V1) ya no tiene privilegio de UPDATE sobre la tabla.
--
-- V5 — anular_cobro: exige motivo, restringe el rol y deja asiento de auditoria.
--   Antes: cualquiera con rol recepcion podia anular un cobro sin dar
--   explicaciones y sin dejar rastro en ninguna parte.
--
-- OJO con el default de p_motivo: es NULL a proposito para no romper la firma
-- (un cliente viejo que llame con 1 argumento sigue resolviendo a esta funcion),
-- pero se valida dentro y devuelve 'motivo_requerido'. Falla claro, no en silencio.
--
-- IMPRESCINDIBLE hacer DROP de la version de 1 argumento: anadir un parametro NO
-- reemplaza la funcion anterior, crea una sobrecarga nueva. Si la vieja siguiera
-- viva, seguiria siendo llamable (sin motivo, sin auditoria y admitiendo
-- recepcion) y todo este endurecimiento seria decorativo.

-- ---------------------------------------------------------------------------
-- V2: trigger de inmutabilidad ampliado
-- ---------------------------------------------------------------------------
create or replace function public.cobros_prevent_financial_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- coalesce OBLIGATORIO: current_setting(...,true) devuelve NULL si no existe y
  -- `NULL = '1'` es NULL, que en un `if not v_rpc` no entraria por la rama de
  -- error y dejaria pasar el cambio. Con coalesce es siempre true/false.
  v_rpc boolean := coalesce(current_setting('mecha.cobro_ctx', true), '') = '1';
begin
  -- 1. Importes y vinculos: inmutables SIEMPRE, ni siquiera por RPC.
  if OLD.total_cents <> NEW.total_cents or
     OLD.efectivo_cents <> NEW.efectivo_cents or
     OLD.datafono_cents <> NEW.datafono_cents or
     OLD.online_cents <> NEW.online_cents or
     OLD.propina_cents <> NEW.propina_cents or
     OLD.descuento_cents <> NEW.descuento_cents or
     OLD.negocio_id <> NEW.negocio_id or
     OLD.cita_id is distinct from NEW.cita_id then
    raise exception 'No se permite modificar los datos financieros de un cobro registrado (Ley Antifraude 11/2021).';
  end if;

  -- 2. Cuando, como y desde donde se cobro: tambien inmutable SIEMPRE.
  if OLD.cobrado_at is distinct from NEW.cobrado_at or
     OLD.metodo is distinct from NEW.metodo or
     OLD.origen is distinct from NEW.origen then
    raise exception 'No se permite cambiar la fecha, el metodo ni el origen de un cobro registrado (Ley Antifraude 11/2021).';
  end if;

  -- 3. Estado: solo por RPC autorizada y sin marcha atras desde terminal.
  if OLD.estado is distinct from NEW.estado then
    if not v_rpc then
      raise exception 'El estado de un cobro solo se cambia con anular_cobro o con un reembolso (Ley Antifraude 11/2021).';
    end if;
    if OLD.estado in ('anulado', 'reembolsado') then
      raise exception 'Un cobro % no puede volver a otro estado (Ley Antifraude 11/2021).', OLD.estado;
    end if;
  end if;

  return NEW;
end;
$function$;

comment on function public.cobros_prevent_financial_updates() is
  'Congela importes, fecha, metodo y origen de un cobro. El estado solo lo cambian las RPC que marcan mecha.cobro_ctx, y nunca desde anulado/reembolsado.';

-- ---------------------------------------------------------------------------
-- V5: anular_cobro con motivo, rol restringido y auditoria
-- ---------------------------------------------------------------------------
drop function if exists public.anular_cobro(uuid);

create or replace function public.anular_cobro(p_cita_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_neg text;
  v_role text;
  v_nombre text;
  v_cobro public.cobros;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select negocio_id, role, nombre into v_neg, v_role, v_nombre
    from public.profiles where id = auth.uid();

  -- Anular un cobro mueve dinero del libro: se queda en direccion, no en mostrador.
  if v_neg is null or v_role not in ('owner', 'admin', 'direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  -- Sin motivo no hay anulacion: es lo que hace auditable la operacion.
  if length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'error', 'motivo_requerido');
  end if;

  select * into v_cobro from public.cobros
    where cita_id = p_cita_id and estado = 'completado'
    order by created_at desc limit 1;
  if not found or v_cobro.negocio_id <> v_neg then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_encontrado');
  end if;
  if v_cobro.idempotency_key like 'pago:%' then
    return jsonb_build_object('ok', false, 'error', 'usa_reembolso');
  end if;

  -- Permiso puntual para que el trigger de inmutabilidad deje cambiar el estado.
  perform set_config('mecha.cobro_ctx', '1', true);
  update public.cobros set estado = 'anulado' where id = v_cobro.id;
  perform set_config('mecha.cobro_ctx', '', true);

  update public.citas set cobrada = false, cobro_id = null where id = p_cita_id;

  -- Asiento de auditoria. Nunca debe tumbar la anulacion ya aplicada.
  --
  -- OJO con el modulo: auditoria_registros tiene un CHECK cerrado
  -- (fichajes|caja|citas|equipo|configuracion|clientes|facturacion). Un modulo
  -- 'cobros' viola el CHECK y, como el fallo se captura mas abajo, el asiento se
  -- perderia EN SILENCIO. Una anulacion de cobro es 'caja'.
  begin
    insert into public.auditoria_registros (
      negocio_id, usuario_id, usuario_nombre, modulo, tipo_evento, detalles
    ) values (
      v_neg, auth.uid(), coalesce(v_nombre, 'Sistema'), 'caja', 'anulacion_cobro',
      jsonb_build_object(
        'cobro_id', v_cobro.id,
        'cita_id', p_cita_id,
        'total_cents', v_cobro.total_cents,
        'metodo', v_cobro.metodo,
        'origen', v_cobro.origen,
        'cobrado_at', v_cobro.cobrado_at,
        'estado_anterior', 'completado',
        'estado_nuevo', 'anulado',
        'motivo', v_motivo
      )
    );
  exception when others then
    raise warning 'auditoria cobros: no se registro la anulacion de % (%)', v_cobro.id, sqlerrm;
  end;

  return jsonb_build_object('ok', true);
end;
$function$;

-- El DROP se lleva por delante los grants: hay que reponerlos tal cual estaban
-- (authenticated + service_role). anon NO entra aqui: no es una RPC publica.
revoke execute on function public.anular_cobro(uuid, text) from public;
grant execute on function public.anular_cobro(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- registrar_reembolso: necesita el mismo permiso puntual para cambiar estado.
-- (Sin esto, el trigger V2 romperia los reembolsos de Stripe.)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_reembolso(p_payment_intent text, p_importe_cents integer, p_refund_id text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pago public.pagos;
  v_reembolso_id uuid;
  v_full boolean;
  v_cobro public.cobros;
begin
  if p_payment_intent is null or p_refund_id is null then return null; end if;

  select id into v_reembolso_id from public.pagos
    where tipo = 'reembolso' and pasarela_ref = p_refund_id limit 1;
  if v_reembolso_id is not null then return v_reembolso_id; end if;

  select * into v_pago from public.pagos
    where metadata->>'payment_intent' = p_payment_intent
      and tipo in ('senal','total')
    order by created_at desc limit 1;
  if not found then return null; end if;

  insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado,
                            pasarela, pasarela_ref, metodo, paid_at, metadata)
  values (v_pago.negocio_id, v_pago.cita_id, v_pago.cliente_id, 'reembolso',
          greatest(0, coalesce(p_importe_cents, v_pago.importe_cents)), 'pagado',
          'stripe', p_refund_id, v_pago.metodo, now(),
          jsonb_build_object('reembolso_de', v_pago.id, 'payment_intent', p_payment_intent))
  returning id into v_reembolso_id;

  v_full := coalesce(p_importe_cents, v_pago.importe_cents) >= v_pago.importe_cents;

  if v_full then
    update public.pagos set estado = 'reembolsado', updated_at = now() where id = v_pago.id;

    if v_pago.tipo = 'total' then
      select * into v_cobro from public.cobros
        where idempotency_key = 'pago:' || v_pago.id::text and estado = 'completado' limit 1;
      if found then
        -- Permiso puntual: cambio de estado legitimo (ver WS-7 V2).
        perform set_config('mecha.cobro_ctx', '1', true);
        update public.cobros set estado = 'reembolsado' where id = v_cobro.id;
        perform set_config('mecha.cobro_ctx', '', true);
        update public.citas set cobrada = false, cobro_id = null where id = v_cobro.cita_id;
      end if;
    elsif v_pago.tipo = 'senal' and v_pago.cita_id is not null then
      update public.citas
        set deposito_pagado = false, estado = 'pendiente'
        where id = v_pago.cita_id and estado = 'confirmada';
    end if;
  end if;

  return v_reembolso_id;
end;
$function$;
