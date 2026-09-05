-- Los dos cabos sueltos de la spec 1 que dejo el paso 5 (revision del 5 sep 2026).
--
-- 1. `crear_serie_citas` se quedo decidiendo ocupacion por el camino de UN solo
--    reposo. El comentario de 20260905130000 justificaba dejar
--    `citas_chocan_activa_activa` en la version de 4 argumentos diciendo que
--    "compara dos CANDIDATAS por marcas: no tienen fases todavia". La mitad es
--    falsa: compara la candidata contra citas EXISTENTES, y esas SI tienen
--    fases. Medido contra la cita 0403d724-12cb-4992-805d-767ca269dc44 (reposos
--    en [16:01,16:26) y [16:50,17:10)): un candidato de 15' dentro del SEGUNDO
--    reposo sale libre por la costura nueva y "ocupado" por la vieja. O sea, el
--    portal publico vende ese hueco y "repetir cita" del NewCitaModal lo salta.
--    Conservador -- nunca sobrerreserva -- pero es justo la incoherencia que el
--    paso 5 venia a borrar, y el paso 1 ya contaba esta funcion como parte del
--    grupo ("`crear_serie_citas` ya estaba en la costura", 20260901145526).
--
--    Los DOS lados pasan a la costura de fases:
--      - la cita existente, por `ventanas_activas_cita(c.id, ...)`;
--      - la candidata, por su plantilla (`fases_de_plantilla`) cuando su
--        servicio la tiene, que es exactamente en lo que se va a convertir en
--        cuanto se inserte y la siembre el trigger. Sin plantilla, las 4 marcas.
--    Se mantiene la forma rapida: `cross join lateral`, nunca envuelta en un
--    ayudante booleano (15 ms vs 883 ms, ver el paso 1).
--
-- 2. Mover la frontera entre dos fases eran DOS updates sueltos desde el
--    navegador (AppointmentCard y FasesCitaPanel). Si el primero pasaba y el
--    segundo fallaba quedaban un hueco o un solape PERMANENTES entre fases, sin
--    que el usuario se enterara -- y la tabla no lo impide: `cita_fases` solo
--    tiene la FK, `unique (cita_id, orden)` y el check de `tipo`. Desde el paso
--    4 esas filas son la fuente de verdad de la ocupacion del salon, asi que un
--    fallo a medias corrompe la agenda en silencio. Se cierra con una RPC que
--    hace los dos updates en la misma transaccion y valida lo que el cliente
--    solo sabia mirar de reojo.

-- ---------------------------------------------------------------------------
-- 1. crear_serie_citas: la costura de fases en los dos lados
-- ---------------------------------------------------------------------------
-- Ancla: si el cuerpo desplegado ya no tiene la llamada vieja, esta migracion
-- REVIENTA en vez de pisar el trabajo de otro con una copia de ayer.

do $ancla$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crear_serie_citas';

  if v_def is null then
    raise exception 'crear_serie_citas no existe: nada que parchear';
  end if;

  if position('citas_chocan_activa_activa' in v_def) = 0 then
    raise exception
      'Ancla perdida en crear_serie_citas: ya no llama a citas_chocan_activa_activa, '
      'asi que alguien la ha tocado despues del 5 sep. Revisar antes de reescribirla.';
  end if;
end;
$ancla$;

create or replace function public.crear_serie_citas(
  p_base jsonb,
  p_intervalo_semanas integer default 1,
  p_repeticiones integer default 4,
  p_addon_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio       text;
  v_uid           uuid := auth.uid();
  v_serie_id      uuid := gen_random_uuid();
  v_prof_id       uuid;
  v_srv_id        uuid;
  v_clt_id        uuid;
  v_inicio        timestamptz;
  v_fin           timestamptz;
  v_fin_activa    timestamptz;
  v_fin_espera    timestamptz;
  v_dur_min       int;
  v_tz            text;
  v_i             int;
  v_shift         interval;
  v_c_inicio      timestamptz;
  v_c_fin         timestamptz;
  v_c_activa      timestamptz;
  v_c_espera      timestamptz;
  v_local_ini     timestamp;
  v_local_fin     timestamp;
  v_citas_creadas uuid[] := array[]::uuid[];
  v_omitidas      text[] := array[]::text[];
  v_nueva_cita_id uuid;
  v_motivo        text;
  v_addon_id      uuid;
begin
  select p.negocio_id into v_negocio from public.profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  v_prof_id    := (p_base->>'profesional_id')::uuid;
  v_srv_id     := (p_base->>'servicio_id')::uuid;
  v_clt_id     := (p_base->>'cliente_id')::uuid;
  v_inicio     := (p_base->>'inicio')::timestamptz;
  v_fin        := (p_base->>'fin')::timestamptz;
  v_fin_activa := (p_base->>'fin_activa')::timestamptz;
  v_fin_espera := (p_base->>'fin_espera')::timestamptz;

  if v_prof_id is null or v_srv_id is null or v_inicio is null or v_fin is null then
    return jsonb_build_object('ok', false, 'error', 'Parámetros base incompletos');
  end if;

  if not exists (select 1 from public.profesionales where id = v_prof_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado');
  end if;
  if not exists (select 1 from public.servicios where id = v_srv_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Servicio no encontrado');
  end if;
  if v_clt_id is not null
     and not exists (select 1 from public.clientes where id = v_clt_id and negocio_id = v_negocio) then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  v_dur_min := round(extract(epoch from (v_fin - v_inicio)) / 60)::int;
  if v_dur_min <= 0 or v_dur_min > 720 then
    return jsonb_build_object('ok', false, 'error', 'Duración de cita inválida');
  end if;

  if p_repeticiones < 1 or p_repeticiones > 52 then
    return jsonb_build_object('ok', false, 'error', 'Número de repeticiones debe ser entre 1 y 52');
  end if;

  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid')
    into v_tz
    from public.negocio_config c
   where c.negocio_id = v_negocio;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  for v_i in 0..(p_repeticiones - 1) loop
    v_shift    := make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1));
    v_c_inicio := v_inicio + v_shift;
    v_c_fin    := v_fin    + v_shift;
    v_c_activa := case when v_fin_activa is not null then v_fin_activa + v_shift end;
    v_c_espera := case when v_fin_espera is not null then v_fin_espera + v_shift end;
    v_motivo   := null;

    v_local_ini := v_c_inicio at time zone v_tz;
    v_local_fin := v_c_fin    at time zone v_tz;

    if exists (
      select 1 from public.cierres_negocio cn
       where cn.negocio_id = v_negocio and cn.fecha = v_local_ini::date
    ) then
      v_motivo := 'cierre';
    end if;

    if v_motivo is null and exists (
      select 1 from public.bloqueos_profesional b
       where b.profesional_id = v_prof_id
         and b.inicio < v_c_fin
         and b.fin    > v_c_inicio
    ) then
      v_motivo := 'bloqueo';
    end if;

    if v_motivo is null and not exists (
      select 1 from public.horarios_profesional h
       where h.profesional_id = v_prof_id
         and h.dia_semana  = extract(dow from v_local_ini)::int
         and h.hora_inicio <= v_local_ini::time
         and h.hora_fin    >= v_local_fin::time
         and v_local_ini::date = v_local_fin::date
    ) then
      v_motivo := 'fuera_de_horario';
    end if;

    -- LO UNICO QUE CAMBIA (5 sep 2026): activa contra activa, con las fases
    -- reales de los dos lados. La cita existente aporta sus fases de trabajo
    -- (`ventanas_activas_cita(c.id, ...)`, paso 5) y la candidata la
    -- descomposicion de su plantilla, que es en lo que se va a convertir en
    -- cuanto la siembre el trigger. Un reposo -- el primero o el cuarto -- deja
    -- de contar como ocupado, igual que ya no cuenta en el portal.
    if v_motivo is null and exists (
      with plantilla_candidata as (
        select f.inicio as desde, f.fin as hasta
          from public.servicios s
         cross join lateral public.fases_de_plantilla(s.fases, v_c_inicio, v_c_fin) f
         where s.id = v_srv_id
           and s.fases is not null
           and f.tipo <> 'reposo'
           and f.inicio < f.fin
      ),
      ventanas_candidata as (
        select desde, hasta from plantilla_candidata
        union all
        select v.desde, v.hasta
          from public.ventanas_activas_cita(v_c_inicio, v_c_activa, v_c_espera, v_c_fin) v
         where not exists (select 1 from plantilla_candidata)
      )
      select 1
        from public.citas c
       cross join lateral public.ventanas_activas_cita(
                    c.id, c.inicio, c.fin_activa, c.fin_espera, c.fin) vc
       cross join ventanas_candidata va
       where c.negocio_id     = v_negocio
         and c.profesional_id = v_prof_id
         and c.estado in ('pendiente', 'confirmada')
         and c.inicio < v_c_fin
         and c.fin    > v_c_inicio
         and va.desde < vc.hasta
         and vc.desde < va.hasta
    ) then
      v_motivo := 'ocupado';
    end if;

    if v_motivo is not null then
      v_omitidas := array_append(
        v_omitidas,
        to_char(v_local_ini, 'YYYY-MM-DD HH24:MI') || ' (' || v_motivo || ')');
      continue;
    end if;

    -- El candado `citas_solape_profesional_excl` puede decir que no aunque la
    -- costura haya dicho que si, y hay DOS motivos distintos:
    --   * otra reserva entro en ese hueco entre la comprobacion y el insert
    --     (una carrera de verdad, siempre posible);
    --   * el candado sigue midiendo la ocupacion con las 4 marcas, asi que para
    --     una cita de dos reposos el SEGUNDO le sigue pareciendo ocupado. Es el
    --     desajuste que dejo abierto el paso 5 y que hay que cerrar aparte
    --     (20260901153828 explica por que un candado que contradice a la
    --     funcion de huecos es peor que no tener candado).
    -- En los dos casos, esta repeticion se omite y la serie continua: reventar
    -- la llamada entera dejaria al usuario sin ninguna de las otras citas.
    begin
      insert into public.citas (
        negocio_id, profesional_id, servicio_id, cliente_id,
        inicio, fin, fin_activa, fin_espera,
        estado, canal, creado_por, serie_id, notas
      ) values (
        v_negocio, v_prof_id, v_srv_id, v_clt_id,
        v_c_inicio, v_c_fin, v_c_activa, v_c_espera,
        'pendiente', coalesce(p_base->>'canal', 'manual'), v_uid, v_serie_id, p_base->>'notas'
      ) returning id into v_nueva_cita_id;
    exception when exclusion_violation then
      v_nueva_cita_id := null;
    end;

    if v_nueva_cita_id is null then
      v_omitidas := array_append(
        v_omitidas,
        to_char(v_local_ini, 'YYYY-MM-DD HH24:MI') || ' (ocupado)');
      continue;
    end if;

    v_citas_creadas := array_append(v_citas_creadas, v_nueva_cita_id);

    if p_addon_ids is not null and array_length(p_addon_ids, 1) > 0 then
      foreach v_addon_id in array p_addon_ids loop
        insert into public.cita_addons (cita_id, addon_id) values (v_nueva_cita_id, v_addon_id);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',        true,
    'serie_id',  v_serie_id,
    'creadas',   coalesce(array_length(v_citas_creadas, 1), 0),
    'omitidas',  v_omitidas,
    'cita_ids',  v_citas_creadas
  );
end;
$function$;

comment on function public.citas_chocan_activa_activa(
  timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz) is
  'Choque activa-contra-activa entre DOS juegos de marcas, sin mirar cita_fases. Desde el 5 sep 2026 no la usa nadie: crear_serie_citas, su unico consumidor, pasa por la costura de fases (ventanas_activas_cita con cita_id). Se conserva por si hace falta comparar dos citas que aun no existen -- ese es el unico caso en el que las 4 marcas son toda la verdad disponible. Si vuelve a usarse para juzgar una cita YA GUARDADA, esta mintiendo: esa cita tiene fases.';

-- ---------------------------------------------------------------------------
-- 2. Mover la frontera entre dos fases, en una sola transaccion
-- ---------------------------------------------------------------------------

create or replace function public.mover_frontera_fase(
  p_fase_id           uuid,
  p_siguiente_fase_id uuid,
  p_nuevo             timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_uid     uuid := auth.uid();
  v_a       public.cita_fases;
  v_b       public.cita_fases;
  v_minima  constant interval := interval '5 minutes';
  v_cita    public.citas;
begin
  select p.negocio_id into v_negocio from public.profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- El negocio del llamante filtra las dos filas: un id de otro salon
  -- simplemente no aparece (la regla del parametro, decision 4 del CLAUDE.md).
  select * into v_a from public.cita_fases where id = p_fase_id           and negocio_id = v_negocio;
  select * into v_b from public.cita_fases where id = p_siguiente_fase_id and negocio_id = v_negocio;

  if v_a.id is null or v_b.id is null then
    return jsonb_build_object('ok', false, 'error', 'Fase no encontrada');
  end if;
  if v_a.cita_id <> v_b.cita_id then
    return jsonb_build_object('ok', false, 'error', 'Las dos fases no son de la misma cita');
  end if;
  if v_b.orden <= v_a.orden then
    return jsonb_build_object('ok', false, 'error', 'Las fases llegan en orden invertido');
  end if;
  if exists (
    select 1 from public.cita_fases f
     where f.cita_id = v_a.cita_id and f.orden > v_a.orden and f.orden < v_b.orden
  ) then
    return jsonb_build_object('ok', false, 'error', 'Las fases no son consecutivas');
  end if;
  if v_a.fin is distinct from v_b.inicio then
    return jsonb_build_object('ok', false, 'error', 'Las fases no comparten frontera');
  end if;

  -- El reloj de reposo manda: mientras un reposo se esta cronometrando, sus
  -- fronteras son la realidad que se mide, no algo que se reparte.
  if (v_a.iniciada_at is not null and v_a.cerrada_at is null)
  or (v_b.iniciada_at is not null and v_b.cerrada_at is null) then
    return jsonb_build_object('ok', false, 'error', 'Hay un reposo en marcha: su frontera no se mueve');
  end if;

  if p_nuevo is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la nueva frontera');
  end if;
  if p_nuevo < v_a.inicio + v_minima or p_nuevo > v_b.fin - v_minima then
    return jsonb_build_object('ok', false, 'error', 'Cada fase necesita al menos 5 minutos');
  end if;

  if p_nuevo = v_a.fin then
    return jsonb_build_object('ok', true, 'sin_cambios', true, 'frontera', p_nuevo);
  end if;

  -- Los dos updates, en la misma transaccion. El estado intermedio (hueco o
  -- solape de un instante) no lo ve nadie, y el trigger de resumen del paso 4
  -- recalcula las marcas de la cita al final. Esto es lo que las dos llamadas
  -- sueltas del navegador no podian garantizar.
  update public.cita_fases set fin    = p_nuevo where id = v_a.id;
  update public.cita_fases set inicio = p_nuevo where id = v_b.id;

  select * into v_cita from public.citas where id = v_a.cita_id;

  return jsonb_build_object(
    'ok',          true,
    'cita_id',     v_a.cita_id,
    'frontera',    p_nuevo,
    'movido_min',  round(extract(epoch from (p_nuevo - v_a.fin)) / 60)::int,
    'marcas',      jsonb_build_object(
                     'inicio',     v_cita.inicio,
                     'fin',        v_cita.fin,
                     'fin_activa', v_cita.fin_activa,
                     'fin_espera', v_cita.fin_espera)
  );
end;
$function$;

comment on function public.mover_frontera_fase(uuid, uuid, timestamptz) is
  'Reparte minutos entre dos fases consecutivas de la misma cita moviendo su frontera comun, en UNA transaccion. Existe porque el borde arrastrable de la agenda hacia dos updates sueltos desde el navegador y un fallo entre medias dejaba hueco o solape permanentes en cita_fases, que desde el paso 4 es la fuente de verdad de la ocupacion. No es publica: solo authenticated, y el negocio del llamante (profiles.negocio_id via auth.uid) filtra las dos filas, asi que un id de otro salon no aparece. Se niega si hay un reposo cronometrandose o si alguna fase se quedaria por debajo de 5 minutos.';

revoke all on function public.mover_frontera_fase(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.mover_frontera_fase(uuid, uuid, timestamptz) to authenticated;
