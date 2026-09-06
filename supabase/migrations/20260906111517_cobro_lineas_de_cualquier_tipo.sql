-- 6 sep 2026. Bloque B (peticiones 3, 5, 10 de Jose): el selector de cobro pasa a
-- ofrecer productos + servicios + extras. El servidor tenia que aprender a
-- recibirlos, porque hoy NO puede.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE, que es lo que se olvida cuando alguien vuelva aqui dentro de un mes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1) crear_cobro_walkin DEDUCIA el tipo de la linea, no lo leia.
--
--       case when v_ref_id is not null then 'producto' else 'servicio' end
--
--    "Tiene id => es producto". Era cierto mientras el selector solo cargaba
--    productos. En cuanto ofrece servicios pasan DOS cosas, y la segunda tumba
--    el cobro entero:
--
--      a) el servicio se guarda como tipo='producto' en cobro_lineas, asi que
--         Informes no lo puede atribuir (agrupa por tipo='servicio' + ref_id,
--         ver informes.web.tsx) y aparece en "productos vendidos";
--      b) el mismo `if v_ref_id is not null` dispara el movimiento de
--         inventario, y movimientos_inventario.producto_id es
--         FOREIGN KEY -> productos(id). Un uuid de servicio ahi es un 23503
--         que aborta la transaccion: la venta suelta de un servicio fallaba
--         SIEMPRE, no en un caso borde.
--
--    Ahora el tipo VIENE en la linea y el inventario solo se toca cuando la
--    linea es de verdad un producto.
--
-- 2) crear_cobro_desde_cita y consumir_bono_cita escribian un tipo que la tabla
--    no admite. Las dos insertan los add-ons de la cita asi:
--
--       insert into cobro_lineas (... tipo ...) values (..., 'addon', ...)
--
--    pero el CHECK es:
--
--       cobro_lineas_tipo_check
--         CHECK (tipo = ANY (ARRAY['servicio','producto','suplemento','bono']))
--
--    'addon' no esta. Comprobado en produccion el 6 sep 2026 con un INSERT
--    directo dentro de un bloque con rollback:
--
--       RECHAZADO 23514 :: new row for relation "cobro_lineas" violates
--       check constraint "cobro_lineas_tipo_check"
--
--    Es decir: desde el 1 sep (20260901161500_editar_importe_y_addons_en_cobro)
--    COBRAR UNA CITA QUE TENGA ADD-ONS FALLA. No habia saltado porque hoy no hay
--    ni una fila en cita_addons ligada a una cita:
--
--       select count(*) from citas c
--        where exists (select 1 from cita_addons ca where ca.cita_id = c.id);
--       -- 0
--
--    Un fallo latente que se estrena el dia que un salon use extras. Y el
--    bloque B es justo el que los pone a mano en el ticket.
--
--    Se corrige usando el valor que el CHECK YA TIENE para esto: 'suplemento'.
--    No se amplia el CHECK a 'addon' a proposito: dos nombres para la misma
--    idea es exactamente el invariante repartido del que avisa el CLAUDE.md, y
--    ningun sitio del cliente lee ninguno de los dos valores (comprobado:
--    informes, ProductosVendidosSection, clientes y agenda-detalle solo miran
--    'servicio' y 'producto'). No hay nada que migrar: cero filas con 'addon',
--    porque nunca se pudo escribir ninguna.
--
-- 3) Las tres funciones aceptaban un ref_id sin comprobar de quien es.
--    p_lineas / p_lineas_extra traen un id del que se deduce un producto o un
--    servicio => la regla del parametro del CLAUDE.md aplica. Antes, un uuid de
--    producto de OTRO salon pasaba el FK y dejaba un movimiento de inventario
--    firmado con mi negocio_id sobre el producto del vecino. Ahora cada ref se
--    valida contra el negocio del llamante (ref_no_autorizado).
--
-- No se cambia ninguna firma: create or replace conserva los grants.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Venta suelta (walk-in): la linea dice de que tipo es.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crear_cobro_walkin(
  p_lineas jsonb,
  p_metodo text,
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_profesional_id uuid default null::uuid,
  p_cliente_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_base_cents integer := 0;
  v_total_cents integer;
  v_cobro_id uuid;
  v_linea jsonb;
  v_nombre text;
  v_precio integer;
  v_cantidad integer;
  v_ref_id uuid;
  v_tipo text;
begin
  select negocio_id into v_negocio from public.profiles where id = auth.uid();
  if v_negocio is null then raise exception 'sin_perfil'; end if;

  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'sin_lineas'; end if;

  if p_profesional_id is not null
     and not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio) then
    raise exception 'profesional_no_autorizado';
  end if;

  if p_cliente_id is not null
     and not exists (select 1 from public.clientes where id = p_cliente_id and negocio_id = v_negocio) then
    raise exception 'cliente_no_autorizado';
  end if;

  -- Validar y totalizar las lineas antes de insertar nada.
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_nombre := trim(coalesce(v_linea->>'nombre', ''));
    v_precio := coalesce((v_linea->>'precio_cents')::integer, -1);
    v_cantidad := coalesce((v_linea->>'cantidad')::integer, 1);
    v_ref_id := nullif(trim(coalesce(v_linea->>'ref_id', '')), '')::uuid;
    -- Compatible hacia atras: sin 'tipo' se deduce como se deducia antes.
    v_tipo := coalesce(
      nullif(trim(coalesce(v_linea->>'tipo', '')), ''),
      case when v_ref_id is not null then 'producto' else 'servicio' end
    );
    if v_nombre = '' then raise exception 'linea_sin_nombre'; end if;
    if v_precio < 0 then raise exception 'linea_precio_invalido'; end if;
    if v_cantidad < 1 then raise exception 'linea_cantidad_invalida'; end if;
    -- Mismo juego de valores que cobro_lineas_tipo_check: mejor un error con
    -- nombre aqui que un 23514 opaco al insertar.
    if v_tipo not in ('servicio','producto','suplemento','bono') then raise exception 'linea_tipo_invalido'; end if;
    perform public.cobro_linea_ref_valida(v_negocio, v_tipo, v_ref_id);
    v_base_cents := v_base_cents + (v_precio * v_cantidad);
  end loop;

  v_total_cents := greatest(0, v_base_cents - v_desc) + v_prop;
  if v_total_cents <= 0 then raise exception 'total_invalido'; end if;

  insert into public.cobros (
    negocio_id, cita_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_negocio, null, p_profesional_id, p_cliente_id,
    v_total_cents, v_prop, v_desc, p_metodo,
    case when p_metodo = 'efectivo' then v_total_cents else 0 end,
    case when p_metodo = 'datafono' then v_total_cents else 0 end,
    0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_ref_id := nullif(trim(coalesce(v_linea->>'ref_id', '')), '')::uuid;
    v_tipo := coalesce(
      nullif(trim(coalesce(v_linea->>'tipo', '')), ''),
      case when v_ref_id is not null then 'producto' else 'servicio' end
    );

    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (
      v_cobro_id,
      v_tipo,
      v_ref_id,
      trim(v_linea->>'nombre'),
      (v_linea->>'precio_cents')::integer,
      coalesce((v_linea->>'cantidad')::integer, 1)
    );

    -- Stock: SOLO productos. Antes bastaba con traer ref_id, y por eso un
    -- servicio reventaba el FK de movimientos_inventario.producto_id.
    if v_tipo = 'producto' and v_ref_id is not null then
      update public.inventario
         set unidades = greatest(0, unidades - coalesce((v_linea->>'cantidad')::integer, 1)),
             ultima_modificacion = now(),
             modificado_por = auth.uid()
       where negocio_id = v_negocio
         and producto_id = v_ref_id;

      insert into public.movimientos_inventario (
        negocio_id, producto_id, tipo, unidades, motivo, creado_por, referencia_id, referencia_tipo, notas
      ) values (
        v_negocio, v_ref_id, 'salida',
        -coalesce((v_linea->>'cantidad')::integer, 1),
        'venta', auth.uid(), v_cobro_id, 'cobro', 'Venta en POS / Caja'
      );
    end if;
  end loop;

  return v_cobro_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Guarda comun de los ref_id de linea (la regla del parametro).
--    Se escribe UNA vez y la llaman las tres funciones de cobro: si cada una
--    llevara su copia, la cuarta que se escriba se olvidara de una tabla.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cobro_linea_ref_valida(
  p_negocio_id text, p_tipo text, p_ref_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  -- Linea escrita a mano (sin catalogo detras): nada que comprobar.
  if p_ref_id is null then return; end if;

  if p_tipo = 'producto' then
    if not exists (select 1 from public.productos where id = p_ref_id and negocio_id = p_negocio_id) then
      raise exception 'ref_no_autorizado';
    end if;
  elsif p_tipo = 'servicio' then
    if not exists (select 1 from public.servicios where id = p_ref_id and negocio_id = p_negocio_id) then
      raise exception 'ref_no_autorizado';
    end if;
  elsif p_tipo = 'suplemento' then
    if not exists (select 1 from public.service_addons where id = p_ref_id and negocio_id = p_negocio_id) then
      raise exception 'ref_no_autorizado';
    end if;
  elsif p_tipo = 'bono' then
    if not exists (select 1 from public.bonos where id = p_ref_id and negocio_id = p_negocio_id) then
      raise exception 'ref_no_autorizado';
    end if;
  end if;
end;
$function$;

-- Funcion nueva => entrada nueva en pg_proc con los grants por defecto (anon
-- incluido). Regla 4 del CLAUDE.md: se cierra explicitamente. Es una guarda
-- interna, no una RPC publica.
revoke all on function public.cobro_linea_ref_valida(text, text, uuid) from public, anon, authenticated;
grant execute on function public.cobro_linea_ref_valida(text, text, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cobro de una cita: 'addon' -> 'suplemento' + tipo de linea validado.
--    Cuerpo identico al desplegado salvo lo anotado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crear_cobro_desde_cita(
  p_cita_id uuid, p_metodo text, p_propina_cents integer default 0,
  p_descuento_cents integer default 0, p_efectivo_cents integer default null,
  p_datafono_cents integer default null, p_lineas_extra jsonb default '[]'::jsonb,
  p_base_cents integer default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_negocio text;
  v_cita public.citas%rowtype;
  v_precio numeric;
  v_nombre text;
  v_base_cents integer;
  v_addon record;
  v_addons_cents integer;
  v_senal_cents integer;
  v_extras_cents integer;
  v_total_cents integer;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_efe integer;
  v_dat integer;
  v_cobro_id uuid;
  v_extra_line jsonb;
  v_extra_tipo text;
  v_extra_ref uuid;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;
  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;

  select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cita.servicio_id;
  -- Importe del servicio: el editado en el POS si llega, si no el de catalogo.
  if p_base_cents is not null then
    if p_base_cents < 0 then raise exception 'base_invalida'; end if;
    v_base_cents := p_base_cents;
  else
    v_base_cents := coalesce(round(coalesce(v_precio, 0) * 100), 0);
  end if;

  select coalesce(sum(importe_cents), 0) into v_senal_cents
  from public.pagos
  where cita_id = p_cita_id and tipo = 'senal' and estado in ('completado','pagado','succeeded','paid');

  if p_lineas_extra is null then
    p_lineas_extra := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_lineas_extra) = 'array' then
    SELECT coalesce(sum((e->>'precio_cents')::int * (e->>'cantidad')::int), 0)
    INTO v_extras_cents
    FROM jsonb_array_elements(p_lineas_extra) as e;
  else
    v_extras_cents := 0;
  end if;

  -- Add-ons de la cita: solo dinero desde 2026-09-01, pero dinero que hay que
  -- cobrar. Se suman al total y dejan linea propia para informes/comisiones.
  select coalesce(sum(round(coalesce(sa.precio, 0) * 100)), 0)
    into v_addons_cents
    from public.cita_addons ca
    join public.service_addons sa on sa.id = ca.addon_id
   where ca.cita_id = p_cita_id;

  v_total_cents := greatest(0, v_base_cents + v_addons_cents + v_extras_cents - v_desc - coalesce(v_senal_cents, 0)) + v_prop;

  if p_metodo = 'mixto' then
    v_efe := greatest(0, coalesce(p_efectivo_cents, 0));
    v_dat := greatest(0, coalesce(p_datafono_cents, 0));
    if v_efe + v_dat <> v_total_cents then raise exception 'split_no_cuadra'; end if;
  else
    v_efe := case when p_metodo = 'efectivo' then v_total_cents else 0 end;
    v_dat := case when p_metodo = 'datafono' then v_total_cents else 0 end;
  end if;

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_total_cents, v_prop, v_desc, p_metodo,
    v_efe, v_dat, coalesce(v_senal_cents, 0), 'pos', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio'), v_base_cents, 1);

  for v_addon in
    select ca.addon_id, sa.nombre, round(coalesce(sa.precio, 0) * 100) as precio_cents
      from public.cita_addons ca
      join public.service_addons sa on sa.id = ca.addon_id
     where ca.cita_id = p_cita_id
  loop
    -- 'suplemento', no 'addon': ver cabecera. 'addon' era un 23514 seguro.
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, 'suplemento', v_addon.addon_id, v_addon.nombre, v_addon.precio_cents, 1);
  end loop;

  if jsonb_typeof(p_lineas_extra) = 'array' and jsonb_array_length(p_lineas_extra) > 0 then
    for v_extra_line in select * from jsonb_array_elements(p_lineas_extra) loop
      v_extra_tipo := coalesce(nullif(trim(coalesce(v_extra_line->>'tipo', '')), ''), 'producto');
      if v_extra_tipo not in ('servicio','producto','suplemento','bono') then raise exception 'linea_tipo_invalido'; end if;
      v_extra_ref := (case when nullif(trim(coalesce(v_extra_line->>'ref_id', '')), '') is null
                           then null else (v_extra_line->>'ref_id')::uuid end);
      perform public.cobro_linea_ref_valida(v_caller_negocio, v_extra_tipo, v_extra_ref);

      insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
      values (
        v_cobro_id,
        v_extra_tipo,
        v_extra_ref,
        coalesce(v_extra_line->>'nombre', 'Extra'),
        (v_extra_line->>'precio_cents')::int,
        coalesce((v_extra_line->>'cantidad')::int, 1)
      );
    end loop;
  end if;

  -- 2F: enlace de trazabilidad producto-usado ↔ producto-cobrado (mejor esfuerzo;
  -- asigna una columna nullable, no puede romper el cobro).
  update public.cita_productos cp
  set cobro_linea_id = cl.id
  from public.cobro_lineas cl
  where cl.cobro_id = v_cobro_id
    and cl.tipo = 'producto'
    and cl.ref_id is not null
    and cp.cita_id = v_cita.id
    and cp.producto_id = cl.ref_id
    and cp.cobro_linea_id is null;

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cobro con bono: mismo arreglo. El bono cubre el servicio; los extras del
--    ticket se cobran, y ahora pueden ser servicios o suplementos, no solo
--    productos (antes el tipo estaba escrito a fuego).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.consumir_bono_cita(
  p_cita_id uuid, p_bono_id uuid, p_propina_cents integer default 0,
  p_lineas_extra jsonb default '[]'::jsonb, p_descuento_cents integer default 0,
  p_metodo text default 'efectivo'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_negocio text;
  v_cita public.citas%rowtype;
  v_bono public.bonos%rowtype;
  v_cobro_id uuid;
  v_nombre text;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_metodo text := coalesce(nullif(p_metodo, ''), 'efectivo');
  v_lineas jsonb := coalesce(p_lineas_extra, '[]'::jsonb);
  v_producto_cents integer := 0;
  v_addon record;
  v_addons_cents integer := 0;
  li jsonb;
  v_nombre_li text;
  v_precio_li integer;
  v_cant_li integer;
  v_ref_li uuid;
  v_tipo_li text;
  v_total integer;
  v_efectivo integer := 0;
  v_datafono integer := 0;
begin
  if v_metodo not in ('efectivo','datafono','online','bizum','mixto') then
    v_metodo := 'efectivo';
  end if;

  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;

  select * into v_bono from public.bonos where id = p_bono_id for update;
  if not found then raise exception 'bono_no_encontrado'; end if;
  if v_bono.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_bono.cliente_id <> v_cita.cliente_id then raise exception 'bono_cliente_distinto'; end if;
  if v_bono.servicio_id <> v_cita.servicio_id then raise exception 'bono_servicio_distinto'; end if;
  if v_bono.estado <> 'activo' or v_bono.sesiones_disponibles <= 0 then raise exception 'bono_agotado'; end if;

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_producto_cents := v_producto_cents + v_precio_li * v_cant_li;
  end loop;

  -- Add-ons de la cita: el bono NO los cubre, se cobran.
  select coalesce(sum(round(coalesce(sa.precio, 0) * 100)), 0)
    into v_addons_cents
    from public.cita_addons ca
    join public.service_addons sa on sa.id = ca.addon_id
   where ca.cita_id = p_cita_id;

  update public.bonos
  set sesiones_disponibles = sesiones_disponibles - 1,
      estado = case when sesiones_disponibles - 1 = 0 then 'agotado' else estado end,
      updated_at = now()
  where id = p_bono_id;

  select nombre into v_nombre from public.servicios where id = v_cita.servicio_id;

  v_total := greatest(0, v_producto_cents + v_addons_cents - v_desc) + v_prop;
  if v_metodo = 'datafono' then
    v_datafono := v_total;
  else
    if v_metodo = 'mixto' then v_metodo := 'efectivo'; end if;
    v_efectivo := v_total;
  end if;

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_total, v_prop, least(v_desc, v_producto_cents + v_addons_cents), v_metodo,
    v_efectivo, v_datafono, 0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio') || ' (Bono)', 0, 1);

  for v_addon in
    select ca.addon_id, sa.nombre, round(coalesce(sa.precio, 0) * 100) as precio_cents
      from public.cita_addons ca
      join public.service_addons sa on sa.id = ca.addon_id
     where ca.cita_id = p_cita_id
  loop
    -- 'suplemento', no 'addon': ver cabecera.
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, 'suplemento', v_addon.addon_id, v_addon.nombre, v_addon.precio_cents, 1);
  end loop;

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_nombre_li := nullif(btrim(li->>'nombre'), '');
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_ref_li := nullif(li->>'ref_id', '');
    -- El tipo lo dice la linea; 'producto' solo como valor por defecto.
    v_tipo_li := coalesce(nullif(btrim(coalesce(li->>'tipo', '')), ''), 'producto');
    if v_nombre_li is null then continue; end if;
    if v_tipo_li not in ('servicio','producto','suplemento','bono') then raise exception 'linea_tipo_invalido'; end if;
    perform public.cobro_linea_ref_valida(v_caller_negocio, v_tipo_li, v_ref_li);
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, v_tipo_li, v_ref_li, v_nombre_li, v_precio_li, v_cant_li);
  end loop;

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$function$;

notify pgrst, 'reload schema';
