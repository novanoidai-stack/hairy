-- Auditoria del 30 ago 2026 sobre las 14 specs. Tres arreglos que salieron de
-- comprobar contra produccion lo que los commits daban por hecho.
--
-- 1. RETENCION RGPD (spec 13) — era destructiva y no pedia permiso.
-- 2. LIQUIDAR COMISIONES (spec 11) — no ha funcionado nunca, por cuatro motivos.
-- 3. BIZUM (spec 10) — la migracion de datos que la spec pedia y no se corrio.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. RETENCION RGPD: rol, suelo y aviso previo
--
-- Estaba concedida a `authenticated` y solo comprobaba que quien llama tuviera
-- un negocio. Con eso, CUALQUIER empleado con sesion podia llamarla desde la
-- consola del navegador. Y `p_dias_inactividad` lo elige quien llama sin suelo
-- ninguno: con 0 la ventana pasa a ser "ahora" y se lleva por delante, de forma
-- irreversible, hasta 100 clientas por llamada — repetible hasta vaciar la
-- cartera. `anonimizar_cliente` borra fichas de color, notas internas y notas de
-- cita desde el 30 ago, asi que no hay vuelta atras.
--
-- Tres cierres:
--   a) `exige_mi_negocio(negocio, true)` -> solo owner/admin (y staff).
--   b) Suelo de 365 dias. Por debajo es un error, no un recorte silencioso: si
--      alguien pide 0 queremos que se entere, no que le pase algo distinto de
--      lo que pidio.
--   c) `p_solo_contar` -> el "aviso previo al salon" que pedia la spec 13 y que
--      no se construyo. Devuelve a cuantas afecta SIN tocar nada, para que la
--      pantalla pueda decir el numero antes de que nadie confirme.
--
-- Se DROPea antes de crear porque anadir un parametro con default no sustituye
-- la funcion: crea una sobrecarga, y entonces la llamada sin argumentos queda
-- ambigua. Es la trampa que ya se pago con crear_cita_publica.
drop function if exists public.ejecutar_retencion_rgpd(integer);

create or replace function public.ejecutar_retencion_rgpd(
  p_dias_inactividad integer default 1095,
  p_solo_contar      boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_negocio      text;
  v_uid          uuid := auth.uid();
  v_limite       timestamptz;
  v_dias         integer := coalesce(p_dias_inactividad, 1095);
  v_cli          record;
  v_anonimizados integer := 0;
  v_candidatos   integer := 0;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Solo owner/admin: esto borra la cartera, no es una preferencia.
  perform public.exige_mi_negocio(v_negocio, true);

  if v_dias < 365 then
    raise exception 'retencion_minima_365_dias' using errcode = '22023';
  end if;

  v_limite := now() - make_interval(days => v_dias);

  select count(*) into v_candidatos
  from public.clientes c
  where c.negocio_id = v_negocio
    and c.ultima_visita is not null
    and c.ultima_visita < v_limite
    and not exists (
      select 1 from public.citas ci
      where ci.cliente_id = c.id and ci.inicio > v_limite
    );

  if p_solo_contar then
    return jsonb_build_object(
      'ok', true, 'modo', 'conteo',
      'candidatos', v_candidatos,
      'por_tanda', 100,
      'limite_aplicado', v_limite
    );
  end if;

  for v_cli in
    select c.id
    from public.clientes c
    where c.negocio_id = v_negocio
      and c.ultima_visita is not null
      and c.ultima_visita < v_limite
      and not exists (
        select 1 from public.citas ci
        where ci.cliente_id = c.id and ci.inicio > v_limite
      )
    limit 100
  loop
    perform public.anonimizar_cliente(v_cli.id);
    v_anonimizados := v_anonimizados + 1;
  end loop;

  return jsonb_build_object(
    'ok', true, 'modo', 'ejecucion',
    'clientes_anonimizados', v_anonimizados,
    'candidatos', v_candidatos,
    'quedan', greatest(v_candidatos - v_anonimizados, 0),
    'limite_aplicado', v_limite
  );
end;
$$;

revoke all on function public.ejecutar_retencion_rgpd(integer, boolean) from public, anon;
grant execute on function public.ejecutar_retencion_rgpd(integer, boolean) to authenticated, service_role;

comment on function public.ejecutar_retencion_rgpd(integer, boolean) is
  'Anonimiza clientas inactivas (spec 13). Solo owner/admin, minimo 365 dias, 100 por tanda. p_solo_contar = true devuelve a cuantas afecta sin tocar nada.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. LIQUIDAR COMISIONES: cuatro defectos, ninguno visible hasta llamarla
--
-- `comisiones` tiene 0 filas y la lectura facil era "no lo usa nadie". No: es
-- que NO SE PUEDE. Comprobado con to_regprocedure, sin escribir nada:
--
--   a) La pantalla llamaba con `p_metodo_pago`, que no existe en ninguna firma
--      -> PostgREST devuelve 404 (PGRST202). El boton no ha funcionado jamas.
--   b) Por dentro invocaba calcular_comisiones_periodo(text,uuid,text,text), que
--      tampoco existe: la real es (uuid, timestamptz, timestamptz). Aunque la
--      pantalla hubiera acertado, habria reventado con 42883.
--   c) Leia base_calculo_cents / importe_comision_cents del nivel raiz, y esas
--      cifras vienen dentro de `resultado` y con OTRO nombre (base_cents,
--      comision_cents). Habria insertado ceros.
--   d) INSERT pelado contra un unique (negocio_id, profesional_id, periodo_*):
--      la segunda llamada del mismo periodo daba 23505 en la cara del usuario,
--      asi que ni recalcular ni marcar pagada eran posibles.
--
-- Y le faltaba la comprobacion de rol: cualquier empleado podia liquidarse y
-- marcarse como pagada su propia comision.
--
-- OJO CON EL ID. `comisiones.profesional_id` referencia **profiles(id)**, no
-- profesionales(id), y calcular_comisiones_periodo tambien espera un profile.
-- Una ficha de profesional sin cuenta (`profile_id` nulo) no puede liquidarse:
-- es legitimo tenerla, asi que se contesta con un error hablado en vez de dejar
-- que salte la FK.

-- ── 2a. Y el calculo, que daba 0 € SIEMPRE ────────────────────────────────
--
-- Arreglar la llamada no bastaba: calcular_comisiones_periodo mezcla las dos
-- identidades que el CLAUDE.md avisa de no confundir —la CUENTA (`profiles`) y
-- la FICHA (`profesionales`)— dentro de la misma funcion:
--
--   negocio y comision_pct  ->  se resuelven por profiles/profile_id  (CUENTA)
--   cobros                  ->  `cobros.profesional_id` guarda la FICHA
--
-- Comprobado en los cobros del salon real: los cuatro profesional_id (JOSE,
-- SUSANA, SONIA, YAN) resuelven contra `profesionales` y ninguno contra
-- `profiles`. Asi que los dos criterios no se pueden cumplir a la vez: con un
-- id de cuenta el negocio sale bien y los cobros salen CERO; con uno de ficha
-- contesta "Profesional no encontrado". Medido: base_cents 0, num_cobros 0
-- para el propietario, que en agosto tiene 45 cobros y 1.148,80 €.
--
-- El contrato que se queda es el de la cuenta, porque es el que ya usan
-- LiquidacionesSection (mapea `id: p.profile_id`) y comisiones.profesional_id.
-- Lo que cambia es que por dentro se traduce a las fichas de esa cuenta antes
-- de mirar la caja. Se conserva todo lo demas tal cual: el guard de "puedo ver
-- lo mio pero no lo de mi companera", el neto/bruto, addons y propinas.
create or replace function public.calcular_comisiones_periodo(
  p_profesional_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_negocio_id text; v_config jsonb; v_porcentaje_def numeric(5,2); v_comision_base text;
  v_incluir_addons boolean; v_incluir_propinas boolean; v_base_cents integer; v_comision_cents integer;
  v_addons_cents integer; v_propinas_cents integer; v_detalle jsonb; v_profesional_nombre text;
  v_pct_ficha numeric(5,2); v_fichas uuid[];
begin
  select negocio_id into v_negocio_id from profiles where id = p_profesional_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado'); end if;
  -- Mismo negocio. Y gestor SALVO que estes mirando lo tuyo: un profesional
  -- puede ver su propia comision, no la de su companera.
  perform public.exige_mi_negocio(
    v_negocio_id,
    p_profesional_id is distinct from (select auth.uid())
  );

  -- La traduccion cuenta -> ficha(s). Un array porque nada impide que una
  -- cuenta tenga mas de una ficha, y sumar de mas es mejor que perder cobros.
  select array_agg(id) into v_fichas
    from profesionales where profile_id = p_profesional_id and negocio_id = v_negocio_id;

  select config into v_config from negocio_config where negocio_id = v_negocio_id;
  v_porcentaje_def := coalesce((v_config->>'comisionBase')::numeric, 15.00);
  v_comision_base := coalesce(v_config->>'comisionBaseImporte', 'neto');
  v_incluir_addons := coalesce((v_config->>'comisionAddons')::boolean, true);
  v_incluir_propinas := coalesce((v_config->>'comisionPropinas')::boolean, false);

  -- Sin ficha, `select into` dejaria el porcentaje en NULL y la comision entera
  -- en NULL: coalesce para que caiga al del salon en vez de propagar el nulo.
  select comision_pct into v_pct_ficha
    from profesionales where profile_id = p_profesional_id and negocio_id = v_negocio_id
    order by created_at limit 1;
  v_porcentaje_def := coalesce(v_pct_ficha, v_porcentaje_def);

  select concat(nombre, ' ', coalesce(apellido, '')) into v_profesional_nombre from profiles where id = p_profesional_id;

  select coalesce(sum(case when estado = 'completado' then total_cents - descuento_cents - case when v_comision_base = 'neto' then trunc((total_cents - descuento_cents) / 1.21) else 0 end else 0 end), 0)
    into v_base_cents from cobros where profesional_id = any(coalesce(v_fichas, '{}'::uuid[])) and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';
  if not v_incluir_addons then
    select coalesce(sum(precio_cents * cantidad), 0) into v_addons_cents from cobro_lineas cl join cobros c on c.id = cl.cobro_id
      where c.profesional_id = any(coalesce(v_fichas, '{}'::uuid[])) and c.cobrado_at >= p_desde and c.cobrado_at <= p_hasta and c.estado = 'completado' and cl.tipo = 'suplemento';
    v_base_cents := v_base_cents - coalesce(v_addons_cents, 0);
  end if;
  if v_incluir_propinas then
    select coalesce(sum(propina_cents), 0) into v_propinas_cents from cobros where profesional_id = any(coalesce(v_fichas, '{}'::uuid[])) and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';
    v_base_cents := v_base_cents + coalesce(v_propinas_cents, 0);
  end if;
  v_comision_cents := trunc(v_base_cents * v_porcentaje_def / 100);
  v_detalle := jsonb_build_object('profesional_id', p_profesional_id, 'profesional_nombre', v_profesional_nombre, 'periodo_inicio', p_desde, 'periodo_fin', p_hasta,
    'base_cents', v_base_cents, 'porcentaje_aplicado', v_porcentaje_def, 'comision_cents', v_comision_cents, 'comision_base', v_comision_base,
    'incluir_addons', v_incluir_addons, 'incluir_propinas', v_incluir_propinas,
    'fichas', coalesce(v_fichas, '{}'::uuid[]),
    'num_cobros', (select count(*) from cobros where profesional_id = any(coalesce(v_fichas, '{}'::uuid[])) and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado'));
  return jsonb_build_object('ok', true, 'resultado', v_detalle);
end; $$;

comment on function public.calcular_comisiones_periodo(uuid, timestamptz, timestamptz) is
  'Comision devengada de una CUENTA (profiles.id) en un periodo. Traduce por dentro a sus fichas de profesionales, que es como se guardan los cobros.';
create or replace function public.liquidar_comision_periodo(
  p_profesional_id uuid,
  p_periodo_inicio date,
  p_periodo_fin    date,
  p_marcar_pagada  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_negocio        text;
  v_uid            uuid := auth.uid();
  v_neg_prof       text;
  v_calculo        jsonb;
  v_res            jsonb;
  v_base_cents     integer;
  v_pct            numeric;
  v_comision_cents integer;
  v_comision_base  text;
  v_desde          timestamptz;
  v_hasta          timestamptz;
  v_comision_id    uuid;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Congelar dinero del equipo es cosa de gestor.
  perform public.exige_mi_negocio(v_negocio, true);

  -- El profesional tiene que ser de MI salon: sin esto se podia sembrar una
  -- fila con el uuid de la cuenta de otro negocio.
  select p.negocio_id into v_neg_prof from profiles p where p.id = p_profesional_id;
  if v_neg_prof is null then
    return jsonb_build_object('ok', false, 'error',
      'Ese profesional no tiene cuenta de acceso, y la comision se liquida contra la cuenta. Invitalo primero desde Equipo.');
  end if;
  if v_neg_prof is distinct from v_negocio then
    raise exception 'otro_negocio' using errcode = '42501';
  end if;

  if p_periodo_fin < p_periodo_inicio then
    return jsonb_build_object('ok', false, 'error', 'El periodo termina antes de empezar.');
  end if;

  -- calcular_comisiones_periodo filtra con cobrado_at <= p_hasta, asi que el
  -- borde tiene que ser el FINAL del ultimo dia o se pierde su facturacion.
  v_desde := p_periodo_inicio::timestamptz;
  v_hasta := (p_periodo_fin + 1)::timestamptz - interval '1 microsecond';

  v_calculo := public.calcular_comisiones_periodo(p_profesional_id, v_desde, v_hasta);

  if coalesce((v_calculo->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false,
      'error', coalesce(v_calculo->>'error', 'No se pudo calcular la comision.'));
  end if;

  v_res            := v_calculo->'resultado';
  v_base_cents     := coalesce((v_res->>'base_cents')::int, 0);
  v_pct            := coalesce((v_res->>'porcentaje_aplicado')::numeric, 0);
  v_comision_cents := coalesce((v_res->>'comision_cents')::int, 0);
  v_comision_base  := coalesce(v_res->>'comision_base', 'neto');

  insert into public.comisiones (
    negocio_id, profesional_id, periodo_inicio, periodo_fin,
    base_calculo_cents, porcentaje_aplicado, importe_comision_cents,
    comision_base, estado, pagada_en, detalles
  ) values (
    v_negocio, p_profesional_id, p_periodo_inicio, p_periodo_fin,
    v_base_cents, v_pct, v_comision_cents,
    v_comision_base,
    case when p_marcar_pagada then 'pagada' else 'calculada' end,
    case when p_marcar_pagada then now() else null end,
    v_res
  )
  on conflict (negocio_id, profesional_id, periodo_inicio, periodo_fin) do update
    set base_calculo_cents     = excluded.base_calculo_cents,
        porcentaje_aplicado    = excluded.porcentaje_aplicado,
        importe_comision_cents = excluded.importe_comision_cents,
        comision_base          = excluded.comision_base,
        detalles               = excluded.detalles,
        -- Una liquidacion ya pagada no vuelve a 'calculada' por recalcularla.
        estado    = case when public.comisiones.estado = 'pagada' or p_marcar_pagada
                         then 'pagada' else 'calculada' end,
        pagada_en = case when public.comisiones.estado = 'pagada' then public.comisiones.pagada_en
                         when p_marcar_pagada then now() else null end
  returning id into v_comision_id;

  return jsonb_build_object(
    'ok', true,
    'comision_id', v_comision_id,
    'base_calculo_cents', v_base_cents,
    'porcentaje_aplicado', v_pct,
    'importe_comision_cents', v_comision_cents,
    'estado', (select estado from public.comisiones where id = v_comision_id)
  );
end;
$$;

revoke all on function public.liquidar_comision_periodo(uuid, date, date, boolean) from public, anon;
grant execute on function public.liquidar_comision_periodo(uuid, date, date, boolean) to authenticated, service_role;

comment on function public.liquidar_comision_periodo(uuid, date, date, boolean) is
  'Congela la comision de un periodo (spec 11). p_profesional_id es un profiles(id). Solo owner/admin. Reejecutable: actualiza en vez de duplicar.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. BIZUM: el backfill de la spec 10 NO se puede hacer, y el arreglo va antes
--
-- La spec 10 pedia "mover el importe de online_cents a bizum_cents" en los 292
-- cobros historicos. **Eso es ilegal en este sistema y esta bien que lo sea.**
-- Se intento y lo rechazo `cobros_prevent_financial_updates()`:
--
--   P0001: No se permite modificar los datos financieros de un cobro
--          registrado (Ley Antifraude 11/2021).
--
-- El guarda prohibe tocar `online_cents` de un cobro ya registrado, sin escape
-- posible (el `mecha.cobro_ctx` solo abre la mano para `estado`). Un cobro es
-- un registro inmutable: la spec se escribio sin contar con eso. Asi que la
-- derivacion que hace `cerrar_caja` —deducir el Bizum de `metodo` cuando
-- bizum_cents esta a 0— no es un apano, es LA solucion correcta para lo viejo.
-- Los 292 se quedan como estan y el arqueo los separa igual.
--
-- Lo que si estaba roto es el futuro: **ninguna de las nueve funciones que
-- insertan cobros escribe `bizum_cents`** (crear_cobro_desde_cita, _walkin,
-- _desde_presupuesto, vender_bono x2, consumir_bono_cita, registrar_cobro_online).
-- Sin esto la columna nace muerta tambien para los cobros nuevos y la
-- derivacion se vuelve permanente.
--
-- Se arregla en el INSERT, que es donde si se puede escribir, y en UN SOLO
-- SITIO en vez de en las siete funciones: un trigger BEFORE INSERT. Asi lo
-- cumple tambien el proximo que escriba un cobro sin acordarse de esto — que es
-- justo como se fabrican los invariantes repartidos.
create or replace function public.cobros_encaminar_bizum()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Solo en el alta y solo si viene sin desglosar. El importe se MUEVE, no se
  -- duplica, asi que el invariante de caja aguanta:
  --   efectivo + datafono + online + bizum = total + propina
  if new.metodo = 'bizum'
     and coalesce(new.bizum_cents, 0) = 0
     and coalesce(new.online_cents, 0) <> 0 then
    new.bizum_cents  := new.online_cents;
    new.online_cents := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists cobros_encaminar_bizum_trg on public.cobros;
create trigger cobros_encaminar_bizum_trg
before insert on public.cobros
for each row execute function public.cobros_encaminar_bizum();

comment on column public.cobros.bizum_cents is
  'Bizum, separado de Stripe porque entra al instante y no a T+2 neto de comision (spec 10). Los cobros anteriores al 30 ago 2026 llevan su importe en online_cents y NO se pueden mover: los protege cobros_prevent_financial_updates (Ley Antifraude). Para esos, cerrar_caja lo deduce de metodo.';
