-- Arreglo de actualizar_consentimiento_ia: estaba rota por los dos lados.
--
-- Esta RPC mueve `clientes.consiente_ia`, que es la bandera que decide si los
-- datos de una clienta pueden viajar a la IA. Es material de RGPD, y tal como
-- estaba:
--
--   1) DESDE EL SOFTWARE NO FUNCIONABA. La comprobacion de tenant era
--      `IF v_negocio <> auth.uid()`, comparando el negocio_id (text) con el id
--      del usuario (uuid). Postgres no tiene ese operador: la funcion reventaba
--      con "operator does not exist: text <> uuid" SIEMPRE. Y la ficha de
--      cliente no miraba el error: pintaba el interruptor cambiado, asi que el
--      salon creia haber quitado el consentimiento y no habia quitado nada.
--
--   2) DESDE FUERA ERA UNA PUERTA ABIERTA. Con el rol anon bastaba con saber el
--      UUID de una clienta para cambiarle el consentimiento; no habia que
--      demostrar nada. El "rate limit" que habia era decorado: contaba filas de
--      toda la tabla y luego ejecutaba `NULL;`, es decir, nada.
--
-- Ahora:
--   - Autenticado: el cliente tiene que ser de TU salon (my_negocio_id_text()).
--   - Anonimo (portal / gestion de cita): hay que traer el telefono de la
--     clienta, igual que para ver o cancelar su cita, y ademas hay freno por IP.
--
-- El parametro del telefono va al final y con DEFAULT, asi que la llamada del
-- software (3 argumentos) sigue valiendo tal cual. Hay que SOLTAR la version de
-- 3 argumentos: si se dejan las dos, PostgREST no sabe cual elegir (42725).

drop function if exists public.actualizar_consentimiento_ia(uuid, boolean, text);

create or replace function public.actualizar_consentimiento_ia(
  p_cliente_id     uuid,
  p_consentimiento boolean,
  p_origen         text,
  p_telefono       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio  text;
  v_telefono text;
  v_ip       text := public.request_ip();
begin
  select negocio_id, telefono into v_negocio, v_telefono
    from public.clientes where id = p_cliente_id;
  if v_negocio is null then
    raise exception 'cliente_no_encontrado';
  end if;

  if auth.role() = 'anon' then
    -- Fuera del software hay que demostrar que la clienta eres tu: el mismo
    -- telefono que se pide para ver o cancelar la cita.
    if p_telefono is null or btrim(p_telefono) = ''
       or public.normalizar_telefono(v_telefono) is distinct from public.normalizar_telefono(p_telefono) then
      raise exception 'no_autorizado';
    end if;
    -- Y freno de verdad: 20 cambios por hora y por IP.
    if v_ip <> '' and not public.check_rate_limit('consentimiento_ia', v_ip, 20, 60) then
      raise exception 'demasiados_intentos';
    end if;
  else
    -- Dentro del software: la clienta tiene que ser de TU salon.
    if v_negocio is distinct from public.my_negocio_id_text() then
      raise exception 'no_autorizado';
    end if;
  end if;

  update public.clientes
     set consiente_ia = p_consentimiento,
         consiente_ia_origen = p_origen,
         consiente_ia_fecha = now()
   where id = p_cliente_id;
end;
$$;

revoke all on function public.actualizar_consentimiento_ia(uuid, boolean, text, text) from public;
grant execute on function public.actualizar_consentimiento_ia(uuid, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
