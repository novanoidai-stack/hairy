-- Spec 6 (bono con calendario de sesiones), cerrada de verdad — y un cobro que
-- no cuadraba.
--
-- QUE ESTABA ROTO, y por que no lo vio nadie
--
-- La spec 6 se dio por hecha porque existian LAS DOS MITADES, cada una en una
-- funcion distinta, y ninguna servia sola:
--
--   vender_bono              cobra (cobros + cobro_lineas)  ·  NO crea sesiones
--   crear_bono_con_sesiones  crea sesiones (y sus citas)    ·  NO COBRA
--
-- La pantalla (components/pos/VentaBonoModal.tsx) llama a `vender_bono`, asi que
-- en produccion `bono_sesiones` estaba a 0 filas y la ficha de la clienta
-- —que YA lee bono_sesiones y pinta "sesion 3 de 10", app/(tabs)/clientes.web.tsx—
-- no tenia nunca nada que pintar. `crear_bono_con_sesiones` no la llamaba nadie:
-- 0 consumidores. Es el hallazgo B del estudio en pequeño: la parte cara escrita,
-- probada, y sin cable.
--
-- Y cambiar la pantalla a `crear_bono_con_sesiones` —el arreglo de una linea que
-- parecia obvio— habria puesto a vender bonos SIN COBRARLOS. Por eso se fusionan
-- en vez de sustituirse: una venta es un cobro y un calendario, y las dos cosas
-- tienen que pasar en la misma transaccion o no ha pasado ninguna.
--
-- EL SEGUNDO FALLO, que es de caja
--
-- `vender_bono` escribia el importe SOLO si el metodo era efectivo o datafono:
--
--   efectivo_cents = case when p_metodo='efectivo' then p_precio_cents else 0 end,
--   datafono_cents = case when p_metodo='datafono' then p_precio_cents else 0 end,
--   online_cents   = 0,
--
-- Con `bizum` —que es una de las TRES opciones que ofrece la pantalla— el cobro
-- salia con total_cents = N y las cuatro columnas de metodo a 0. Eso rompe el
-- invariante de caja (efectivo + datafono + online + bizum = total_cents) y el
-- arqueo del dia no cuadra por el importe del bono. El trigger de la spec 10
-- (cobros_encaminar_bizum) tampoco lo salvaba: solo actua si el importe venia en
-- `online_cents`, y aqui no venia en ninguna.
--
-- Se arregla escribiendo la columna del metodo que toca, y `mixto` deja de
-- aceptarse: una venta de bono es un pago unico, no se puede repartir sin decir
-- como, y aceptarlo era garantizar un cobro corrupto. La pantalla nunca lo ofrecio.

-- La mitad que no cobraba se va: su unica razon de ser era generar las sesiones,
-- y eso lo hace ya `vender_bono`. Dejarla viva es dejar puesta la escopeta.
drop function if exists public.crear_bono_con_sesiones(uuid, uuid, integer, integer, timestamptz, integer, uuid);

-- Se DROPea en vez de `create or replace` porque cambia la lista de parametros.
-- Reemplazar añadiendo argumentos crearia una SOBRECARGA, y dos firmas con el
-- mismo nombre es el PGRST203 que ya tumbo crear_cita_publica el 30 ago.
drop function if exists public.vender_bono(uuid, uuid, integer, integer, text);

create function public.vender_bono(
  p_cliente_id     uuid,
  p_servicio_id    uuid,
  p_sesiones       integer,
  p_precio_cents   integer,
  p_metodo         text,
  -- Opcionales: si se pasan, el bono nace con sus N citas ya puestas con la
  -- cadencia clinica (el laser son 4-6 semanas). Si no, nacen las N sesiones
  -- sin fecha y se van enganchando a citas segun se pidan.
  p_inicio_primera timestamptz default null,
  p_cadencia_dias  integer     default null,
  p_profesional_id uuid        default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio      text;
  v_bono_id      uuid;
  v_cobro_id     uuid;
  v_cita_id      uuid;
  v_nombre_srv   text;
  v_dur_min      int;
  v_profesional  uuid;
  v_cursor       timestamptz;
  i              int;
begin
  select negocio_id into v_negocio from public.profiles where id = auth.uid();
  if v_negocio is null then raise exception 'sin_perfil' using errcode = '42501'; end if;

  if coalesce(p_sesiones, 0) <= 0     then raise exception 'sesiones_invalidas'; end if;
  if coalesce(p_precio_cents, -1) < 0 then raise exception 'precio_invalido';    end if;

  -- Un pago unico. `mixto` sin desglose producia un cobro descuadrado.
  if p_metodo not in ('efectivo', 'datafono', 'online', 'bizum') then
    raise exception 'metodo_invalido';
  end if;

  select nombre, coalesce(duracion_activa_min, 30)
    into v_nombre_srv, v_dur_min
    from public.servicios
   where id = p_servicio_id and negocio_id = v_negocio;
  if not found then raise exception 'servicio_no_encontrado'; end if;

  -- La regla del parametro: p_cliente_id es un id del que se deduce el negocio,
  -- asi que se ata al del llamante en vez de fiarse de lo que llega.
  if not exists (
    select 1 from public.clientes
     where id = p_cliente_id and negocio_id = v_negocio
  ) then
    raise exception 'cliente_no_encontrado' using errcode = '42501';
  end if;

  insert into public.bonos (
    negocio_id, cliente_id, servicio_id,
    sesiones_totales, sesiones_disponibles, precio_cents,
    fecha_caducidad
  ) values (
    v_negocio, p_cliente_id, p_servicio_id,
    p_sesiones, p_sesiones, p_precio_cents,
    case
      when p_inicio_primera is not null and coalesce(p_cadencia_dias, 0) > 0
        then p_inicio_primera + make_interval(days => (p_sesiones * p_cadencia_dias) + 30)
      else null
    end
  ) returning id into v_bono_id;

  -- Quien cobra: el que se pase, y si no la ficha de quien esta delante.
  v_profesional := p_profesional_id;
  if v_profesional is null then
    select id into v_profesional
      from public.profesionales
     where profile_id = auth.uid() and negocio_id = v_negocio
     limit 1;
  end if;

  insert into public.cobros (
    negocio_id, cliente_id, profesional_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, bizum_cents,
    origen, estado
  ) values (
    v_negocio, p_cliente_id, v_profesional,
    p_precio_cents, 0, 0, p_metodo,
    case when p_metodo = 'efectivo' then p_precio_cents else 0 end,
    case when p_metodo = 'datafono' then p_precio_cents else 0 end,
    case when p_metodo = 'online'   then p_precio_cents else 0 end,
    case when p_metodo = 'bizum'    then p_precio_cents else 0 end,
    'manual', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'bono', v_bono_id,
          'Bono ' || p_sesiones || 'x ' || coalesce(v_nombre_srv, 'Servicio'),
          p_precio_cents, 1);

  -- El calendario. Sin esto el bono es un contador, que es justo lo que la
  -- spec 6 dice que NO es: la estetica vende "la sesion 3 de 10 el jueves".
  if p_inicio_primera is not null and coalesce(p_cadencia_dias, 0) > 0 then
    v_cursor := p_inicio_primera;
    for i in 1..p_sesiones loop
      insert into public.citas (
        negocio_id, cliente_id, servicio_id, profesional_id,
        inicio, fin, estado, notas
      ) values (
        v_negocio, p_cliente_id, p_servicio_id, v_profesional,
        v_cursor, v_cursor + make_interval(mins => v_dur_min),
        'confirmada',
        'Sesion ' || i || ' de ' || p_sesiones || ' (Bono)'
      ) returning id into v_cita_id;

      insert into public.bono_sesiones (bono_id, numero, cita_id, prevista_para)
      values (v_bono_id, i, v_cita_id, v_cursor);

      v_cursor := v_cursor + make_interval(days => p_cadencia_dias);
    end loop;
  else
    for i in 1..p_sesiones loop
      insert into public.bono_sesiones (bono_id, numero)
      values (v_bono_id, i);
    end loop;
  end if;

  return v_bono_id;
end;
$function$;

revoke all on function public.vender_bono(uuid, uuid, integer, integer, text, timestamptz, integer, uuid) from public, anon;
grant execute on function public.vender_bono(uuid, uuid, integer, integer, text, timestamptz, integer, uuid) to authenticated, service_role;

comment on function public.vender_bono(uuid, uuid, integer, integer, text, timestamptz, integer, uuid) is
  'Vende un bono: cobro + bono + calendario de sesiones, en una sola transaccion (spec 6). Sustituye a crear_bono_con_sesiones, que creaba las sesiones sin cobrarlas. Con p_inicio_primera y p_cadencia_dias agenda las N citas; sin ellos deja las N sesiones sin fecha.';
